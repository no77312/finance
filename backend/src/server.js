import { createServer } from "node:http";
import {
  badRequest,
  exposures,
  findCurrentMember,
  forbidden,
  memberSummaries,
  normalizeGroupInput,
  normalizeHoldingInput,
  notFound,
  summariesByCurrency
} from "./domain.js";
import { parseScreenshotImport } from "./importParser.js";
import { enrichHoldingWithPreviousClose, refreshHoldingsWithPreviousClose } from "./marketData.js";

export function createPositionCircleServer({ store }) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, store);
    } catch (error) {
      sendError(response, error);
    }
  });
}

async function routeRequest(request, response, store) {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    return send(response, 204, undefined);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, {
      status: "ok",
      service: "position-circle-api"
    });
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const data = await store.read();
    return send(response, 200, data);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") {
    throw notFound("ROUTE_NOT_FOUND", "Route not found.");
  }

  if (parts.length === 1) {
    return send(response, 200, {
      name: "PositionCircle API",
      endpoints: [
        "GET /health",
        "GET /api/bootstrap",
        "GET /api/groups",
        "POST /api/groups",
        "GET /api/groups/:groupID",
        "POST /api/imports/parse-screenshot",
        "POST /api/groups/:groupID/prices/refresh",
        "GET /api/groups/:groupID/holdings",
        "POST /api/groups/:groupID/holdings",
        "PUT /api/groups/:groupID/holdings/:holdingID",
        "DELETE /api/groups/:groupID/holdings/:holdingID",
        "GET /api/groups/:groupID/analytics"
      ]
    });
  }

  if (parts[1] === "imports" && request.method === "POST" && parts.length === 3 && parts[2] === "parse-screenshot") {
    const body = await readJsonBody(request);
    const result = await parseScreenshotImport(body);
    return send(response, 200, result);
  }

  if (parts[1] !== "groups") {
    throw notFound("ROUTE_NOT_FOUND", "Route not found.");
  }

  if (request.method === "GET" && parts.length === 2) {
    const data = await store.read();
    return send(response, 200, { groups: data.groups });
  }

  if (request.method === "POST" && parts.length === 2) {
    const body = await readJsonBody(request);
    const memberID = memberIDForRequest(request, body);
    const group = await store.update((data) => {
      const currentMember = findCurrentMember(data, memberID);
      const nextGroup = normalizeGroupInput(body, currentMember);
      data.groups.push(nextGroup);
      return nextGroup;
    });
    return send(response, 201, { group });
  }

  const groupID = parts[2];

  if (request.method === "GET" && parts.length === 3) {
    const data = await store.read();
    const group = requireGroup(data, groupID);
    return send(response, 200, { group });
  }

  if (parts[3] === "analytics" && request.method === "GET" && parts.length === 4) {
    const data = await store.read();
    const group = requireGroup(data, groupID);
    const holdings = data.holdings.filter((holding) => holding.groupID === groupID);
    return send(response, 200, {
      currencySummaries: summariesByCurrency(holdings),
      exposures: exposures(holdings),
      memberSummaries: memberSummaries(holdings, group.members)
    });
  }

  if (parts[3] === "prices" && parts[4] === "refresh" && request.method === "POST" && parts.length === 5) {
    const result = await store.update(async (data) => {
      requireGroup(data, groupID);
      const groupHoldings = data.holdings.filter((holding) => holding.groupID === groupID);
      const refreshResult = await refreshHoldingsWithPreviousClose(groupHoldings);
      const refreshedByID = new Map(refreshResult.holdings.map((holding) => [holding.id, holding]));
      data.holdings = data.holdings.map((holding) => refreshedByID.get(holding.id) ?? holding);
      return refreshResult;
    });

    return send(response, 200, result);
  }

  if (parts[3] === "holdings" && request.method === "GET" && parts.length === 4) {
    const data = await store.read();
    requireGroup(data, groupID);
    const holdings = data.holdings
      .filter((holding) => holding.groupID === groupID)
      .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
    return send(response, 200, { holdings });
  }

  if (parts[3] === "holdings" && request.method === "POST" && parts.length === 4) {
    const body = await readJsonBody(request);
    const memberID = memberIDForRequest(request, body);
    const holding = await store.update(async (data) => {
      requireGroup(data, groupID);
      const nextHolding = normalizeHoldingInput(body, groupID, memberID);
      const pricedHolding = await enrichHoldingWithPreviousClose(nextHolding);
      data.holdings.push(pricedHolding);
      return pricedHolding;
    });
    return send(response, 201, { holding });
  }

  if (parts[3] === "holdings" && request.method === "PUT" && parts.length === 5) {
    const holdingID = parts[4];
    const body = await readJsonBody(request);
    const memberID = memberIDForRequest(request, body);
    const holding = await store.update(async (data) => {
      requireGroup(data, groupID);
      const index = data.holdings.findIndex((candidate) => candidate.id === holdingID && candidate.groupID === groupID);
      if (index === -1) {
        throw notFound("HOLDING_NOT_FOUND", "Holding not found.");
      }
      if (data.holdings[index].ownerID !== memberID) {
        throw forbidden("HOLDING_OWNER_REQUIRED", "Only the owner can edit this holding.");
      }
      const nextHolding = normalizeHoldingInput(body, groupID, memberID, data.holdings[index]);
      const pricedHolding = await enrichHoldingWithPreviousClose(nextHolding);
      data.holdings[index] = pricedHolding;
      return pricedHolding;
    });
    return send(response, 200, { holding });
  }

  if (parts[3] === "holdings" && request.method === "DELETE" && parts.length === 5) {
    const holdingID = parts[4];
    const memberID = memberIDForRequest(request);
    await store.update((data) => {
      requireGroup(data, groupID);
      const holding = data.holdings.find((candidate) => candidate.id === holdingID && candidate.groupID === groupID);
      if (!holding) {
        throw notFound("HOLDING_NOT_FOUND", "Holding not found.");
      }
      if (holding.ownerID !== memberID) {
        throw forbidden("HOLDING_OWNER_REQUIRED", "Only the owner can delete this holding.");
      }
      data.holdings = data.holdings.filter((candidate) => candidate.id !== holdingID);
    });
    return send(response, 204, undefined);
  }

  throw notFound("ROUTE_NOT_FOUND", "Route not found.");
}

function requireGroup(data, groupID) {
  const group = data.groups.find((candidate) => candidate.id === groupID);
  if (!group) {
    throw notFound("GROUP_NOT_FOUND", "Group not found.");
  }
  return group;
}

function memberIDForRequest(request, body = {}) {
  return request.headers["x-member-id"] ?? body.ownerID ?? body.memberID ?? body.currentMemberID;
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      throw badRequest("BODY_TOO_LARGE", "Request body is too large.");
    }
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("INVALID_JSON", "Request body must be valid JSON.");
  }
}

function send(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Member-ID");

  if (body === undefined) {
    response.end();
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendError(response, error) {
  const statusCode = error.status ?? 500;
  send(response, statusCode, {
    error: {
      code: error.code ?? "INTERNAL_ERROR",
      message: statusCode === 500 ? "Internal server error." : error.message
    }
  });
}
