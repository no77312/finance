import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { requirePriceRefreshToken, requireTelegramWebhookSecret, verifyGoogleCredential } from "./auth.js";
import { loadRuntimeConfig } from "./config.js";
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
import { generateGroupAdvice } from "./groupAdvice.js";
import { readJsonBody, send, sendError } from "./http.js";
import { parseScreenshotImport } from "./importParser.js";
import { refreshHoldingsWithPreviousClose } from "./marketData.js";
import { serveStaticAsset } from "./staticAssets.js";
import { buildDailyDigest, buildHoldingChangeMessage, handleTelegramUpdate, parseChatMap, persistDailyValuations, resolveChatID, sendTelegramMessage } from "./telegramDigest.js";

export function createPositionCircleServer(options) {
  const config = options.config ?? loadRuntimeConfig();
  const context = {
    config,
    publicDir: options.publicDir ?? config.publicDir,
    verifyGoogleIDToken: options.verifyGoogleIDToken ?? ((body) => verifyGoogleCredential(body, config))
  };
  const { store } = options;
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, store, context);
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
      googleClientID: context.config.googleClientID
    });
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const data = await store.read();
    const memberID = requireMemberID(request);
    requireSessionForUser(data, memberID, request);
    return send(response, 200, bootstrapForMember(data, memberID));
  }

  if ((request.method === "PATCH" || request.method === "PUT") && url.pathname === "/api/me") {
    const body = await readJsonBody(request);
    const memberID = requireMemberID(request, body);
    const result = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      const user = data.users?.find((candidate) => candidate.id === memberID);
      if (!user) {
        throw notFound("USER_NOT_FOUND", "User not found.");
      }
      if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
        const name = String(body.displayName ?? "").trim().slice(0, 40);
        if (name) user.displayName = name;
      }
      if (Object.prototype.hasOwnProperty.call(body, "bio")) {
        user.bio = String(body.bio ?? "").trim().slice(0, 160);
      }
      for (const group of data.groups ?? []) {
        for (const member of group.members ?? []) {
          if (member.id === memberID) {
            member.displayName = user.displayName;
            member.bio = user.bio ?? "";
          }
        }
      }
      return bootstrapForMember(data, memberID, user);
    });
    return send(response, 200, result);
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
        "DELETE /api/groups/:groupID",
        "DELETE /api/groups/:groupID/membership",
        "POST /api/imports/parse-screenshot",
        "POST /api/admin/prices/refresh",
        "POST /api/admin/telegram/digest",
        "POST /api/telegram/webhook",
        "POST /api/groups/:groupID/prices/refresh",
        "GET /api/groups/:groupID/advice",
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
    requirePriceRefreshToken(request, context.config);

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

  if (parts[1] === "admin" && request.method === "POST" && parts.length === 4 && parts[2] === "telegram" && parts[3] === "digest") {
    requirePriceRefreshToken(request, context.config);

    const botToken = context.config.telegramBotToken;
    if (!botToken) {
      throw forbidden("TELEGRAM_NOT_CONFIGURED", "Set TELEGRAM_BOT_TOKEN to enable the Telegram digest.");
    }

    const chatMap = parseChatMap(context.config.telegramChatMap);

    // 先在 store 锁内算好今日快照并落库，网络推送放到锁外执行。
    const digest = await store.update((data) => {
      const built = buildDailyDigest({
        groups: data.groups,
        holdings: data.holdings,
        dailyValuations: data.dailyValuations ?? [],
        date: dayKey(new Date(), context.config.appTimeZone),
        chatMap
      });
      persistDailyValuations(data, built.snapshots);
      return built;
    });

    const sentGroups = [];
    const failed = [];
    for (const message of digest.messages) {
      try {
        await sendTelegramMessage({ botToken, chatID: message.chatID, text: message.text });
        sentGroups.push(message.groupID);
      } catch (error) {
        failed.push({ groupID: message.groupID, message: error.message });
      }
    }

    return send(response, 200, {
      date: digest.date,
      snapshotCount: digest.snapshots.length,
      targetGroupCount: digest.messages.length,
      sentGroups,
      failed
    });
  }

  if (parts[1] === "telegram" && parts[2] === "webhook" && request.method === "POST" && parts.length === 3) {
    requireTelegramWebhookSecret(request, context.config);
    const body = await readJsonBody(request);
    const outcome = await store.update((data) => handleTelegramUpdate(data, body));

    const botToken = context.config.telegramBotToken;
    if (outcome.reply && botToken) {
      try {
        await sendTelegramMessage({ botToken, chatID: outcome.reply.chatID, text: outcome.reply.text });
      } catch {
        // 回复失败不影响绑定结果，仍向 Telegram 返回 200 避免重试风暴。
      }
    }

    return send(response, 200, { ok: true });
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

  if (request.method === "DELETE" && parts.length === 3) {
    const memberID = requireMemberID(request);
    const result = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      const group = requireGroupAccess(data, groupID, memberID);
      requireGroupOwner(group, memberID);
      removeGroupData(data, groupID);
      return bootstrapForMember(data, memberID);
    });
    return send(response, 200, result);
  }

  if (request.method === "DELETE" && parts.length === 4 && parts[3] === "membership") {
    const memberID = requireMemberID(request);
    const result = await store.update((data) => {
      requireSessionForUser(data, memberID, request);
      const group = requireGroupAccess(data, groupID, memberID);
      const member = group.members?.find((candidate) => candidate.id === memberID);
      if (isGroupOwner(group, memberID) && (group.members?.length ?? 0) > 1) {
        throw forbidden("GROUP_OWNER_CANNOT_LEAVE", "Group owner must disband the group or transfer ownership before leaving.");
      }

      if ((group.members?.length ?? 0) <= 1 || member?.role === "owner") {
        removeGroupData(data, groupID);
      } else {
        group.members = group.members.filter((candidate) => candidate.id !== memberID);
        removeMemberGroupData(data, groupID, memberID);
      }

      return bootstrapForMember(data, memberID);
    });
    return send(response, 200, result);
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

  if (parts[3] === "advice" && request.method === "GET" && parts.length === 4) {
    const memberID = requireMemberID(request);
    const result = await store.update(async (data) => {
      requireSessionForUser(data, memberID, request);
      const group = requireGroupAccess(data, groupID, memberID);
      data.groupAdvice ??= [];

      const date = dayKey(new Date(), context.config.appTimeZone);
      const existing = data.groupAdvice.find((record) => (
        record.groupID === groupID
        && record.memberID === memberID
        && record.date === date
      ));
      if (existing && Array.isArray(existing.advice?.members) && existing.advice.members.length > 0) {
        return {
          advice: existing.advice,
          generatedAt: existing.generatedAt,
          date,
          cached: true
        };
      }

      const holdings = data.holdings.filter((holding) => holding.groupID === groupID);
      const advice = await generateGroupAdvice({ group, holdings, requesterID: memberID });
      const record = {
        id: randomUUID().toUpperCase(),
        groupID,
        memberID,
        date,
        generatedAt: new Date().toISOString(),
        advice
      };
      data.groupAdvice = data.groupAdvice
        .filter((candidate) => !(candidate.groupID === groupID && candidate.memberID === memberID && candidate.date === date))
        .concat(record)
        .slice(-500);

      return {
        advice,
        generatedAt: record.generatedAt,
        date,
        cached: false
      };
    });

    return send(response, 200, result);
  }

  if (parts[3] === "prices" && parts[4] === "refresh" && request.method === "POST" && parts.length === 5) {
    requirePriceRefreshToken(request, context.config);

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
      invalidateGroupAdvice(data, groupID);
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
      invalidateGroupAdvice(data, groupID);
      return {
        holding: nextHolding,
        event,
        snapshot
      };
    });
    notifyHoldingChange(store, context, groupID, memberID, [result.event]);
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
      invalidateGroupAdvice(data, groupID);

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
    notifyHoldingChange(store, context, groupID, memberID, result.events);
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
      invalidateGroupAdvice(data, groupID);
      return {
        holding: nextHolding,
        event,
        snapshot
      };
    });
    notifyHoldingChange(store, context, groupID, memberID, [result.event]);
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
      invalidateGroupAdvice(data, groupID);
      return {
        event,
        snapshot
      };
    });
    notifyHoldingChange(store, context, groupID, memberID, [event.event]);
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

function requireGroupOwner(group, memberID) {
  if (!isGroupOwner(group, memberID)) {
    throw forbidden("GROUP_OWNER_REQUIRED", "Only the group owner can disband this group.");
  }
}

function isGroupOwner(group, memberID) {
  const member = group.members?.find((candidate) => candidate.id === memberID);
  return member?.role === "owner" || group.members?.[0]?.id === memberID;
}

function removeGroupData(data, groupID) {
  data.groups = (data.groups ?? []).filter((group) => group.id !== groupID);
  data.holdings = (data.holdings ?? []).filter((holding) => holding.groupID !== groupID);
  data.holdingEvents = (data.holdingEvents ?? []).filter((event) => event.groupID !== groupID);
  data.portfolioSnapshots = (data.portfolioSnapshots ?? []).filter((snapshot) => snapshot.groupID !== groupID);
  data.groupAdvice = (data.groupAdvice ?? []).filter((record) => record.groupID !== groupID);
}

function removeMemberGroupData(data, groupID, memberID) {
  data.holdings = (data.holdings ?? []).filter((holding) => !(holding.groupID === groupID && holding.ownerID === memberID));
  data.holdingEvents = (data.holdingEvents ?? []).filter((event) => !(event.groupID === groupID && event.ownerID === memberID));
  data.portfolioSnapshots = (data.portfolioSnapshots ?? [])
    .filter((snapshot) => !(snapshot.groupID === groupID && snapshot.ownerID === memberID));
  data.groupAdvice = (data.groupAdvice ?? [])
    .filter((record) => !(record.groupID === groupID && record.memberID === memberID));
  invalidateGroupAdvice(data, groupID);
}

function invalidateGroupAdvice(data, groupID) {
  data.groupAdvice = (data.groupAdvice ?? []).filter((record) => record.groupID !== groupID);
}

function dayKey(date = new Date(), timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
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

// 有人提交调仓后，向绑定了 Telegram 的群推一条实时变动消息。
// 采用 fire-and-forget：不阻塞用户的保存响应，推送失败也不影响主流程。
function notifyHoldingChange(store, context, groupID, memberID, events) {
  const botToken = context.config.telegramBotToken;
  const list = (events ?? []).filter(Boolean);
  if (!botToken || list.length === 0) {
    return;
  }

  Promise.resolve()
    .then(async () => {
      const data = await store.read();
      const group = data.groups.find((candidate) => candidate.id === groupID);
      if (!group) {
        return;
      }
      const chatID = resolveChatID(group, parseChatMap(context.config.telegramChatMap));
      if (!chatID) {
        return;
      }
      const member = group.members?.find((candidate) => candidate.id === memberID);
      const text = buildHoldingChangeMessage({ group, events: list, actorName: member?.displayName ?? "成员" });
      if (text) {
        await sendTelegramMessage({ botToken, chatID, text });
      }
    })
    .catch(() => {});
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

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
