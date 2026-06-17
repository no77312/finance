import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuth2Client } from "google-auth-library";
import {
  badRequest,
  createHoldingEvent,
  exposures,
  findCurrentMember,
  forbidden,
  memberFromUser,
  memberSummaries,
  normalizeAppleUser,
  normalizeDeviceUser,
  normalizeGoogleUser,
  normalizeGroupInput,
  normalizeHoldingInput,
  normalizeInviteCode,
  notFound,
  summariesByCurrency
} from "./domain.js";
import { parseScreenshotImport } from "./importParser.js";
import { refreshHoldingsWithPreviousClose } from "./marketData.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = resolve(moduleDir, "..", "public");

export function createPositionCircleServer({ store, publicDir = defaultPublicDir, verifyGoogleIDToken = verifyGoogleCredential }) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, store, { publicDir, verifyGoogleIDToken });
    } catch (error) {
      sendError(response, error);
    }
  });
}

async function routeRequest(request, response, store, context) {
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

  if (request.method === "GET" && url.pathname === "/api/config") {
    return send(response, 200, {
      googleClientID: process.env.GOOGLE_CLIENT_ID ?? ""
    });
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    return send(response, 200, bootstrapForMember(data, memberID));
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") {
    return serveStaticAsset(url.pathname, response, context.publicDir);
  }

  if (parts.length === 1) {
    return send(response, 200, {
      name: "PositionCircle API",
      endpoints: [
        "GET /health",
        "GET /api/config",
        "GET /api/bootstrap",
        "POST /api/auth/apple",
        "POST /api/auth/device",
        "POST /api/auth/google",
        "GET /api/groups",
        "POST /api/groups",
        "POST /api/groups/join",
        "GET /api/groups/:groupID",
        "POST /api/imports/parse-screenshot",
        "POST /api/admin/prices/refresh",
        "POST /api/groups/:groupID/prices/refresh",
        "GET /api/groups/:groupID/holding-events",
        "GET /api/groups/:groupID/holdings",
        "POST /api/groups/:groupID/holdings",
        "PUT /api/groups/:groupID/holdings/sync",
        "PUT /api/groups/:groupID/holdings/:holdingID",
        "DELETE /api/groups/:groupID/holdings/:holdingID",
        "GET /api/groups/:groupID/analytics"
      ]
    });
  }

  if (parts[1] === "auth" && request.method === "POST" && parts.length === 3 && parts[2] === "google") {
    const body = await readJsonBody(request);
    const verifiedUser = await context.verifyGoogleIDToken(body);
    const result = await store.update((data) => {
      const user = upsertUser(data, "google", normalizeGoogleUser, verifiedUser);
      const session = createSession(data, user.id);
      return bootstrapForMember(data, user.id, user, session.token);
    });
    return send(response, 200, result);
  }

  if (parts[1] === "imports" && request.method === "POST" && parts.length === 3 && parts[2] === "parse-screenshot") {
    const body = await readJsonBody(request);
    const result = await parseScreenshotImport(body);
    return send(response, 200, result);
  }

  if (parts[1] === "auth" && request.method === "POST" && parts.length === 3 && parts[2] === "apple") {
    const body = await readJsonBody(request);
    const result = await store.update((data) => {
      const user = upsertUser(data, "apple", normalizeAppleUser, body);
      const session = createSession(data, user.id);
      return bootstrapForMember(data, user.id, user, session.token);
    });
    return send(response, 200, result);
  }

  if (parts[1] === "auth" && request.method === "POST" && parts.length === 3 && parts[2] === "device") {
    const body = await readJsonBody(request);
    const result = await store.update((data) => {
      const user = upsertUser(data, "device", normalizeDeviceUser, body);
      const session = createSession(data, user.id);
      return bootstrapForMember(data, user.id, user, session.token);
    });
    return send(response, 200, result);
  }

  if (parts[1] === "admin" && request.method === "POST" && parts.length === 4 && parts[2] === "prices" && parts[3] === "refresh") {
    requirePriceRefreshToken(request);

    const result = await store.update(async (data) => {
      const refreshResult = await refreshHoldingsWithPreviousClose(data.holdings);
      const refreshedByID = new Map(refreshResult.holdings.map((holding) => [holding.id, holding]));
      data.holdings = data.holdings.map((holding) => refreshedByID.get(holding.id) ?? holding);
      return {
        ...refreshResult,
        refreshedAt: new Date().toISOString()
      };
    });

    return send(response, 200, result);
  }

  if (parts[1] !== "groups") {
    throw notFound("ROUTE_NOT_FOUND", "Route not found.");
  }

  if (request.method === "GET" && parts.length === 2) {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    return send(response, 200, {
      groups: groupsForMember(data, memberID)
    });
  }

  if (request.method === "POST" && parts.length === 2) {
    const body = await readJsonBody(request);
    const memberID = requireMemberID(request, body);
    const group = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      const currentMember = findCurrentMember(data, memberID);
      const nextGroup = normalizeGroupInput(body, currentMember);
      data.groups.push(nextGroup);
      return nextGroup;
    });
    return send(response, 201, { group });
  }

  if (request.method === "POST" && parts.length === 3 && parts[2] === "join") {
    const body = await readJsonBody(request);
    const memberID = requireMemberID(request, body);
    const group = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      const inviteCode = normalizeInviteCode(body.inviteCode);
      const nextGroup = data.groups.find((candidate) => normalizeInviteCode(candidate.inviteCode) === inviteCode);
      if (!nextGroup) {
        throw notFound("INVITE_CODE_NOT_FOUND", "Invite code not found.");
      }

      const existingMember = nextGroup.members.find((member) => member.id === memberID);
      if (!existingMember) {
        const user = data.users?.find((candidate) => candidate.id === memberID);
        nextGroup.members.push(memberFromUser(user ?? findCurrentMember(data, memberID), "member"));
      }

      return nextGroup;
    });
    return send(response, 200, { group });
  }

  const groupID = parts[2];

  if (request.method === "GET" && parts.length === 3) {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    const group = requireGroupAccess(data, groupID, memberID);
    return send(response, 200, { group });
  }

  if (parts[3] === "analytics" && request.method === "GET" && parts.length === 4) {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    const group = requireGroupAccess(data, groupID, memberID);
    const holdings = data.holdings.filter((holding) => holding.groupID === groupID);
    return send(response, 200, {
      currencySummaries: summariesByCurrency(holdings),
      exposures: exposures(holdings),
      memberSummaries: memberSummaries(holdings, group.members)
    });
  }

  if (parts[3] === "prices" && parts[4] === "refresh" && request.method === "POST" && parts.length === 5) {
    requirePriceRefreshToken(request);

    const result = await store.update(async (data) => {
      const memberID = memberIDForRequest(request);
      if (memberID) {
        requireSessionForUser(data, memberID, request);
      }
      requireGroupAccess(data, groupID, memberID);
      const groupHoldings = data.holdings.filter((holding) => holding.groupID === groupID);
      const refreshResult = await refreshHoldingsWithPreviousClose(groupHoldings);
      const refreshedByID = new Map(refreshResult.holdings.map((holding) => [holding.id, holding]));
      data.holdings = data.holdings.map((holding) => refreshedByID.get(holding.id) ?? holding);
      return refreshResult;
    });

    return send(response, 200, result);
  }

  if (parts[3] === "holding-events" && request.method === "GET" && parts.length === 4) {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    requireGroupAccess(data, groupID, memberID);
    const events = data.holdingEvents
      .filter((event) => event.groupID === groupID)
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
    return send(response, 200, { events });
  }

  if (parts[3] === "holdings" && request.method === "GET" && parts.length === 4) {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    requireGroupAccess(data, groupID, memberID);
    const holdings = data.holdings
      .filter((holding) => holding.groupID === groupID)
      .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
    return send(response, 200, { holdings });
  }

  if (parts[3] === "holdings" && request.method === "POST" && parts.length === 4) {
    const body = await readJsonBody(request);
    const memberID = requireMemberID(request, body);
    const result = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      requireGroupAccess(data, groupID, memberID);
      const nextHolding = normalizeHoldingInput(body, groupID, memberID);
      data.holdings.push(nextHolding);
      const event = createHoldingEvent("created", nextHolding);
      appendHoldingEvent(data, event);
      const snapshot = createPortfolioSnapshot(data, groupID, memberID, "manual");
      appendPortfolioSnapshot(data, snapshot);
      return {
        holding: nextHolding,
        event,
        snapshot
      };
    });
    return send(response, 201, result);
  }

  if (parts[3] === "holdings" && request.method === "PUT" && parts.length === 5 && parts[4] === "sync") {
    const body = await readJsonBody(request);
    const memberID = requireMemberID(request, body);
    const result = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      requireGroupAccess(data, groupID, memberID);

      const snapshotHoldings = normalizeSnapshotHoldings(body.holdings, groupID, memberID);
      const existingHoldings = data.holdings.filter((candidate) => candidate.groupID === groupID && candidate.ownerID === memberID);
      const existingBySymbol = new Map();
      const duplicateExisting = [];

      for (const holding of existingHoldings) {
        if (existingBySymbol.has(holding.symbol)) {
          duplicateExisting.push(holding);
          continue;
        }
        existingBySymbol.set(holding.symbol, holding);
      }

      const incomingSymbols = new Set(snapshotHoldings.map((holding) => holding.symbol));
      const created = [];
      const updated = [];
      const deleted = [];
      const events = [];

      for (const draft of snapshotHoldings) {
        const previousHolding = existingBySymbol.get(draft.symbol);
        if (previousHolding) {
          const nextHolding = normalizeHoldingInput(draft, groupID, memberID, previousHolding);
          replaceHolding(data, nextHolding);
          updated.push(nextHolding);
          events.push(createHoldingEvent("updated", nextHolding, previousHolding));
          continue;
        }

        const nextHolding = normalizeHoldingInput(draft, groupID, memberID);
        data.holdings.push(nextHolding);
        created.push(nextHolding);
        events.push(createHoldingEvent("created", nextHolding));
      }

      for (const holding of existingHoldings) {
        if (!incomingSymbols.has(holding.symbol)) {
          data.holdings = data.holdings.filter((candidate) => candidate.id !== holding.id);
          deleted.push(holding);
          events.push(createHoldingEvent("deleted", holding));
        }
      }

      for (const holding of duplicateExisting) {
        if (data.holdings.some((candidate) => candidate.id === holding.id)) {
          data.holdings = data.holdings.filter((candidate) => candidate.id !== holding.id);
          deleted.push(holding);
          events.push(createHoldingEvent("deleted", holding));
        }
      }

      for (const event of events) {
        appendHoldingEvent(data, event);
      }

      const snapshot = createPortfolioSnapshot(data, groupID, memberID, "screenshot");
      appendPortfolioSnapshot(data, snapshot);

      return {
        created,
        updated,
        deleted,
        events,
        snapshot,
        summary: {
          createdCount: created.length,
          updatedCount: updated.length,
          deletedCount: deleted.length,
          snapshotCount: snapshotHoldings.length
        }
      };
    });
    return send(response, 200, result);
  }

  if (parts[3] === "holdings" && request.method === "PUT" && parts.length === 5) {
    const holdingID = parts[4];
    const body = await readJsonBody(request);
    const memberID = requireMemberID(request, body);
    const result = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      requireGroupAccess(data, groupID, memberID);
      const index = data.holdings.findIndex((candidate) => candidate.id === holdingID && candidate.groupID === groupID);
      if (index === -1) {
        throw notFound("HOLDING_NOT_FOUND", "Holding not found.");
      }
      if (data.holdings[index].ownerID !== memberID) {
        throw forbidden("HOLDING_OWNER_REQUIRED", "Only the owner can edit this holding.");
      }
      const previousHolding = data.holdings[index];
      const nextHolding = normalizeHoldingInput(body, groupID, memberID, previousHolding);
      data.holdings[index] = nextHolding;
      const event = createHoldingEvent("updated", nextHolding, previousHolding);
      appendHoldingEvent(data, event);
      const snapshot = createPortfolioSnapshot(data, groupID, memberID, "manual");
      appendPortfolioSnapshot(data, snapshot);
      return {
        holding: nextHolding,
        event,
        snapshot
      };
    });
    return send(response, 200, result);
  }

  if (parts[3] === "holdings" && request.method === "DELETE" && parts.length === 5) {
    const holdingID = parts[4];
    const memberID = requireMemberID(request);
    const event = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      requireGroupAccess(data, groupID, memberID);
      const holding = data.holdings.find((candidate) => candidate.id === holdingID && candidate.groupID === groupID);
      if (!holding) {
        throw notFound("HOLDING_NOT_FOUND", "Holding not found.");
      }
      if (holding.ownerID !== memberID) {
        throw forbidden("HOLDING_OWNER_REQUIRED", "Only the owner can delete this holding.");
      }
      const event = createHoldingEvent("deleted", holding);
      data.holdings = data.holdings.filter((candidate) => candidate.id !== holdingID);
      appendHoldingEvent(data, event);
      const snapshot = createPortfolioSnapshot(data, groupID, memberID, "manual");
      appendPortfolioSnapshot(data, snapshot);
      return {
        event,
        snapshot
      };
    });
    return send(response, 200, event);
  }

  throw notFound("ROUTE_NOT_FOUND", "Route not found.");
}

function upsertUser(data, provider, normalizer, body) {
  data.users ??= [];
  const incomingProviderUserID = body.appleUserID ?? body.deviceID ?? body.googleUserID ?? body.providerUserID ?? body.user ?? body.sub;
  const existingIndex = data.users.findIndex((candidate) => (
    candidate.providerUserID === incomingProviderUserID
    && candidate.provider === provider
  ));
  const user = normalizer(body, existingIndex >= 0 ? data.users[existingIndex] : undefined);

  if (existingIndex >= 0) {
    data.users[existingIndex] = user;
  } else {
    data.users.push(user);
  }

  updateMemberProfiles(data, user);
  return user;
}

function updateMemberProfiles(data, user) {
  for (const group of data.groups ?? []) {
    const member = group.members?.find((candidate) => candidate.id === user.id);
    if (member) {
      member.displayName = user.displayName;
      member.avatarSymbol = user.avatarSymbol;
      member.pictureURL = user.pictureURL ?? "";
    }
  }
}

function createSession(data, userID) {
  data.sessions ??= [];
  const session = {
    token: `${randomUUID()}${randomUUID()}`.replace(/-/g, ""),
    userID,
    createdAt: new Date().toISOString()
  };
  data.sessions.push(session);
  data.sessions = data.sessions.slice(-200);
  return session;
}

function bootstrapForMember(data, memberID, knownUser = undefined, sessionToken = undefined) {
  const groups = groupsForMember(data, memberID);
  const groupIDs = new Set(groups.map((group) => group.id));
  const user = knownUser ?? data.users?.find((candidate) => candidate.id === memberID) ?? null;

  const payload = {
    user,
    currentMemberID: memberID,
    groups,
    holdings: data.holdings.filter((holding) => groupIDs.has(holding.groupID)),
    holdingEvents: data.holdingEvents.filter((event) => groupIDs.has(event.groupID)),
    portfolioSnapshots: (data.portfolioSnapshots ?? []).filter((snapshot) => groupIDs.has(snapshot.groupID))
  };

  if (sessionToken) {
    payload.sessionToken = sessionToken;
  }

  return payload;
}

function groupsForMember(data, memberID) {
  return data.groups.filter((group) => group.members?.some((member) => member.id === memberID));
}

function requireGroup(data, groupID) {
  const group = data.groups.find((candidate) => candidate.id === groupID);
  if (!group) {
    throw notFound("GROUP_NOT_FOUND", "Group not found.");
  }
  return group;
}

function requireGroupAccess(data, groupID, memberID) {
  const group = requireGroup(data, groupID);
  if (memberID && !group.members?.some((member) => member.id === memberID)) {
    throw forbidden("GROUP_MEMBER_REQUIRED", "Only group members can access this group.");
  }
  return group;
}

function memberIDForRequest(request, body = {}) {
  return request.headers["x-member-id"] ?? body.ownerID ?? body.memberID ?? body.currentMemberID;
}

function requireMemberID(request, body = {}) {
  const memberID = memberIDForRequest(request, body);
  if (!memberID) {
    throw forbidden("AUTH_REQUIRED", "Sign in is required.");
  }
  return memberID;
}

function requireSessionForUser(data, memberID, request) {
  const userSessions = data.sessions?.filter((session) => session.userID === memberID) ?? [];
  if (userSessions.length === 0) {
    return;
  }

  const providedToken = request.headers["x-session-token"];
  if (!userSessions.some((session) => session.token === providedToken)) {
    throw forbidden("SESSION_REQUIRED", "Valid session token is required.");
  }
}

function requirePriceRefreshToken(request) {
  const expectedToken = process.env.PRICE_REFRESH_TOKEN;
  if (!expectedToken) {
    throw forbidden("PRICE_REFRESH_NOT_CONFIGURED", "Set PRICE_REFRESH_TOKEN to enable scheduled price refresh.");
  }

  const providedToken = bearerToken(request.headers.authorization) ?? request.headers["x-refresh-token"];
  if (providedToken !== expectedToken) {
    throw forbidden("PRICE_REFRESH_FORBIDDEN", "Invalid price refresh token.");
  }
}

async function verifyGoogleCredential(body) {
  const credential = cleanString(body.credential ?? body.idToken ?? body.token);
  if (!credential) {
    throw badRequest("GOOGLE_CREDENTIAL_REQUIRED", "Google credential is required.");
  }

  const clientID = process.env.GOOGLE_CLIENT_ID;
  if (!clientID) {
    throw forbidden("GOOGLE_CLIENT_ID_REQUIRED", "Set GOOGLE_CLIENT_ID to enable Google sign-in.");
  }

  let payload;
  try {
    const client = new OAuth2Client(clientID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientID
    });
    payload = ticket.getPayload();
  } catch {
    throw forbidden("GOOGLE_CREDENTIAL_INVALID", "Google credential is invalid.");
  }

  if (!payload?.sub) {
    throw badRequest("GOOGLE_USER_REQUIRED", "Google user identifier is required.");
  }

  if (payload.email_verified === false) {
    throw forbidden("GOOGLE_EMAIL_UNVERIFIED", "Google email is not verified.");
  }

  return {
    googleUserID: payload.sub,
    email: payload.email ?? "",
    fullName: payload.name ?? payload.email ?? "Google 用户",
    pictureURL: payload.picture ?? ""
  };
}

function bearerToken(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function appendHoldingEvent(data, event) {
  data.holdingEvents ??= [];
  data.holdingEvents.push(event);
  data.holdingEvents = data.holdingEvents.slice(-500);
}

function createPortfolioSnapshot(data, groupID, ownerID, source = "manual") {
  return {
    id: randomUUID().toUpperCase(),
    groupID,
    ownerID,
    source,
    createdAt: new Date().toISOString(),
    holdings: data.holdings
      .filter((holding) => holding.groupID === groupID && holding.ownerID === ownerID)
      .sort((first, second) => first.symbol.localeCompare(second.symbol))
      .map((holding) => snapshotHoldingFromHolding(holding))
  };
}

function appendPortfolioSnapshot(data, snapshot) {
  data.portfolioSnapshots ??= [];

  const matchesSnapshot = (candidate) => (
    candidate.groupID === snapshot.groupID
    && candidate.ownerID === snapshot.ownerID
  );

  const history = data.portfolioSnapshots
    .filter(matchesSnapshot)
    .sort((first, second) => new Date(first.createdAt ?? 0) - new Date(second.createdAt ?? 0))
    .slice(-59);

  const others = data.portfolioSnapshots.filter((candidate) => !matchesSnapshot(candidate));
  data.portfolioSnapshots = [...others, ...history, snapshot]
    .sort((first, second) => new Date(first.createdAt ?? 0) - new Date(second.createdAt ?? 0));
}

function snapshotHoldingFromHolding(holding) {
  return {
    holdingID: holding.id,
    symbol: holding.symbol,
    assetName: holding.assetName,
    market: holding.market,
    quantity: Number(holding.quantity),
    averageCost: optionalNumber(holding.averageCost),
    lastPrice: Number(holding.lastPrice),
    currency: holding.currency,
    visibility: holding.visibility,
    note: holding.note ?? "",
    updatedAt: holding.updatedAt ?? null
  };
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSnapshotHoldings(holdings, groupID, memberID) {
  if (!Array.isArray(holdings)) {
    throw badRequest("HOLDINGS_REQUIRED", "Snapshot holdings must be an array.");
  }

  const normalized = holdings.map((holding) => normalizeHoldingInput({
    ...holding,
    note: cleanString(holding.note) || "截图同步"
  }, groupID, memberID));

  const seenSymbols = new Set();
  for (const holding of normalized) {
    if (seenSymbols.has(holding.symbol)) {
      throw badRequest("DUPLICATE_SYMBOL", `Snapshot contains duplicate symbol: ${holding.symbol}.`);
    }
    seenSymbols.add(holding.symbol);
  }

  return normalized;
}

function replaceHolding(data, nextHolding) {
  const index = data.holdings.findIndex((candidate) => candidate.id === nextHolding.id);
  if (index === -1) {
    throw notFound("HOLDING_NOT_FOUND", "Holding not found.");
  }
  data.holdings[index] = nextHolding;
}

async function serveStaticAsset(pathname, response, publicDir) {
  const publicRoot = resolve(publicDir);
  const decodedPath = safeDecodePath(pathname);
  const assetPath = decodedPath === "/" ? "index.html" : normalize(decodedPath).replace(/^[/\\]+/, "");
  const requestedFile = resolve(publicRoot, assetPath);

  if (!isPathInside(publicRoot, requestedFile)) {
    throw forbidden("STATIC_ASSET_FORBIDDEN", "Static asset path is not allowed.");
  }

  const filePath = await existingStaticFile(requestedFile, publicRoot, extname(assetPath) === "");
  if (!filePath) {
    throw notFound("STATIC_ASSET_NOT_FOUND", "Static asset not found.");
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypeForPath(filePath));
  response.setHeader("Cache-Control", cacheControlForPath(filePath));

  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(filePath);
    stream.on("error", rejectStream);
    stream.on("end", resolveStream);
    stream.pipe(response);
  });
}

async function existingStaticFile(requestedFile, publicRoot, shouldFallbackToIndex) {
  const directFile = await statFile(requestedFile);
  if (directFile) {
    return directFile;
  }

  if (!shouldFallbackToIndex) {
    return null;
  }

  const indexFile = join(publicRoot, "index.html");
  return statFile(indexFile);
}

async function statFile(filePath) {
  try {
    const stats = await stat(filePath);
    return stats.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function safeDecodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw badRequest("INVALID_PATH", "Request path is invalid.");
  }
}

function isPathInside(parent, child) {
  const normalizedParent = parent.endsWith("/") ? parent : `${parent}/`;
  return child === parent || child.startsWith(normalizedParent);
}

function contentTypeForPath(filePath) {
  switch (extname(filePath).toLowerCase()) {
  case ".css":
    return "text/css; charset=utf-8";
  case ".js":
    return "text/javascript; charset=utf-8";
  case ".json":
  case ".webmanifest":
    return "application/manifest+json; charset=utf-8";
  case ".svg":
    return "image/svg+xml; charset=utf-8";
  case ".png":
    return "image/png";
  case ".html":
    return "text/html; charset=utf-8";
  default:
    return "application/octet-stream";
  }
}

function cacheControlForPath(filePath) {
  return /\/(?:app|styles|sw)\.js$|\.css$|\.html$/.test(filePath)
    ? "no-cache"
    : "public, max-age=31536000, immutable";
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 7 * 1024 * 1024) {
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

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function send(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Member-ID,X-Refresh-Token,X-Session-Token");

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
