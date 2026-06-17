import { randomUUID } from "node:crypto";

export const assetMarkets = new Set(["usStock", "hkStock", "cnStock", "fund", "crypto", "cash"]);
export const holdingCurrencies = new Set(["USD", "HKD", "CNY", "SGD"]);
export const positionVisibilities = new Set(["full", "amountOnly", "symbolOnly"]);
export const holdingEventTypes = new Set(["created", "updated", "deleted"]);

export function summarize(holdings) {
  const holders = new Set(holdings.map((holding) => holding.ownerID));
  const totalMarketValue = holdings.reduce((sum, holding) => sum + marketValue(holding), 0);
  const totalCostBasis = holdings.reduce((sum, holding) => sum + costBasis(holding), 0);
  return {
    totalMarketValue,
    totalCostBasis,
    totalUnrealizedPnL: totalMarketValue - totalCostBasis,
    totalUnrealizedPnLPercent: totalCostBasis === 0 ? 0 : (totalMarketValue - totalCostBasis) / totalCostBasis,
    holdingCount: holdings.length,
    holderCount: holders.size
  };
}

export function summariesByCurrency(holdings) {
  const groups = groupBy(holdings, (holding) => holding.currency);
  return Object.entries(groups)
    .map(([currency, currencyHoldings]) => ({
      currency,
      summary: summarize(currencyHoldings)
    }))
    .sort((first, second) => first.currency.localeCompare(second.currency));
}

export function exposures(holdings) {
  const grouped = groupBy(holdings, (holding) => `${holding.symbol}|${holding.currency}`);
  return Object.values(grouped)
    .map((symbolHoldings) => {
      const first = symbolHoldings[0];
      const holders = new Set(symbolHoldings.map((holding) => holding.ownerID));
      const totalQuantity = symbolHoldings.reduce((sum, holding) => sum + Number(holding.quantity), 0);
      const totalMarketValue = symbolHoldings.reduce((sum, holding) => sum + marketValue(holding), 0);
      const totalCostBasis = symbolHoldings.reduce((sum, holding) => sum + costBasis(holding), 0);
      return {
        symbol: first.symbol,
        assetName: first.assetName,
        market: first.market,
        currency: first.currency,
        holderCount: holders.size,
        totalQuantity,
        totalMarketValue,
        totalCostBasis,
        unrealizedPnL: totalMarketValue - totalCostBasis,
        unrealizedPnLPercent: totalCostBasis === 0 ? 0 : (totalMarketValue - totalCostBasis) / totalCostBasis
      };
    })
    .sort((first, second) => {
      if (second.totalMarketValue === first.totalMarketValue) {
        return first.symbol.localeCompare(second.symbol);
      }
      return second.totalMarketValue - first.totalMarketValue;
    });
}

export function memberSummaries(holdings, members) {
  const grouped = groupBy(holdings, (holding) => holding.ownerID);
  return members
    .map((member) => {
      const memberHoldings = grouped[member.id] ?? [];
      const marketValueByCurrency = {};
      for (const holding of memberHoldings) {
        marketValueByCurrency[holding.currency] = (marketValueByCurrency[holding.currency] ?? 0) + marketValue(holding);
      }
      return {
        member,
        totalMarketValue: memberHoldings.reduce((sum, holding) => sum + marketValue(holding), 0),
        totalUnrealizedPnL: memberHoldings.reduce((sum, holding) => sum + marketValue(holding) - costBasis(holding), 0),
        marketValueByCurrency,
        holdingCount: memberHoldings.length,
        hasHoldings: memberHoldings.length > 0
      };
    })
    .sort((first, second) => {
      if (second.holdingCount === first.holdingCount) {
        return first.member.displayName.localeCompare(second.member.displayName);
      }
      return second.holdingCount - first.holdingCount;
    });
}

export function normalizeGroupInput(body, currentMember) {
  const name = cleanString(body.name);
  if (!name) {
    throw badRequest("GROUP_NAME_REQUIRED", "Group name is required.");
  }

  return {
    id: randomUUID().toUpperCase(),
    name,
    subtitle: cleanString(body.subtitle) || "共享持仓与观点",
    inviteCode: generateInviteCode(),
    members: [currentMember],
    defaultVisibility: positionVisibilities.has(body.defaultVisibility) ? body.defaultVisibility : "full",
    createdAt: new Date().toISOString()
  };
}

export function normalizeAppleUser(body, existingUser = undefined) {
  const providerUserID = cleanString(body.appleUserID ?? body.providerUserID ?? body.user);
  if (!providerUserID) {
    throw badRequest("APPLE_USER_REQUIRED", "Apple user identifier is required.");
  }

  return normalizeUser({
    provider: "apple",
    providerUserID,
    displayName: cleanString(body.fullName) || cleanString(body.displayName) || existingUser?.displayName || "Apple 用户",
    email: cleanString(body.email) || existingUser?.email || "",
    avatarSymbol: existingUser?.avatarSymbol ?? "person.crop.circle.fill"
  }, existingUser);
}

export function normalizeDeviceUser(body, existingUser = undefined) {
  const providerUserID = cleanString(body.deviceID ?? body.providerUserID);
  if (!providerUserID) {
    throw badRequest("DEVICE_ID_REQUIRED", "Device identifier is required.");
  }

  return normalizeUser({
    provider: "device",
    providerUserID,
    displayName: cleanString(body.displayName) || existingUser?.displayName || "本机用户",
    email: existingUser?.email || "",
    avatarSymbol: existingUser?.avatarSymbol ?? "person.crop.circle.fill"
  }, existingUser);
}

export function normalizeGoogleUser(body, existingUser = undefined) {
  const providerUserID = cleanString(body.googleUserID ?? body.providerUserID ?? body.sub);
  if (!providerUserID) {
    throw badRequest("GOOGLE_USER_REQUIRED", "Google user identifier is required.");
  }

  return normalizeUser({
    provider: "google",
    providerUserID,
    displayName: cleanString(body.fullName) || cleanString(body.displayName) || cleanString(body.name) || existingUser?.displayName || "Google 用户",
    email: cleanString(body.email) || existingUser?.email || "",
    avatarSymbol: existingUser?.avatarSymbol ?? "person.crop.circle.fill",
    pictureURL: cleanString(body.pictureURL) || cleanString(body.picture) || existingUser?.pictureURL || ""
  }, existingUser);
}

export function memberFromUser(user, role = "member", existingMember = undefined) {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarSymbol: user.avatarSymbol,
    pictureURL: user.pictureURL ?? existingMember?.pictureURL ?? "",
    role: existingMember?.role ?? role,
    joinedAt: existingMember?.joinedAt ?? new Date().toISOString()
  };
}

export function normalizeInviteCode(value) {
  return cleanString(value).toUpperCase();
}

export function normalizeHoldingInput(body, groupID, ownerID, existingHolding = undefined) {
  const symbol = cleanString(body.symbol).toUpperCase();
  if (!symbol) {
    throw badRequest("SYMBOL_REQUIRED", "Symbol is required.");
  }

  const market = cleanString(body.market) || "usStock";
  if (!assetMarkets.has(market)) {
    throw badRequest("INVALID_MARKET", `Market must be one of: ${Array.from(assetMarkets).join(", ")}.`);
  }

  const currency = cleanString(body.currency) || "USD";
  if (!holdingCurrencies.has(currency)) {
    throw badRequest("INVALID_CURRENCY", `Currency must be one of: ${Array.from(holdingCurrencies).join(", ")}.`);
  }

  const visibility = cleanString(body.visibility) || "full";
  if (!positionVisibilities.has(visibility)) {
    throw badRequest("INVALID_VISIBILITY", `Visibility must be one of: ${Array.from(positionVisibilities).join(", ")}.`);
  }

  const quantity = positiveNumber(body.quantity, "quantity");
  const averageCost = optionalNonNegativeNumber(body.averageCost, "averageCost");
  const lastPrice = nonNegativeNumber(body.lastPrice, "lastPrice");
  const requestedID = cleanString(body.id).toUpperCase();
  const lastPriceWasChanged = Boolean(
    existingHolding
      && hasOwn(body, "lastPrice")
      && Number(lastPrice) !== Number(existingHolding.lastPrice)
  );
  const priceDate = optionalCleanString(body, "priceDate", lastPriceWasChanged ? null : existingHolding?.priceDate ?? null);
  const priceSource = priceSourceForInput(body, lastPriceWasChanged ? "manual" : existingHolding?.priceSource ?? "manual");
  const priceUpdatedAt = optionalCleanString(
    body,
    "priceUpdatedAt",
    lastPriceWasChanged ? null : existingHolding?.priceUpdatedAt ?? null
  );

  return {
    id: existingHolding?.id ?? (requestedID || randomUUID().toUpperCase()),
    groupID,
    ownerID: existingHolding?.ownerID ?? ownerID,
    symbol,
    assetName: cleanString(body.assetName) || symbol,
    market,
    quantity,
    averageCost,
    lastPrice,
    currency,
    visibility,
    note: cleanString(body.note),
    priceDate,
    priceSource,
    priceUpdatedAt,
    updatedAt: new Date().toISOString()
  };
}

export function createHoldingEvent(type, holding, previousHolding = undefined) {
  if (!holdingEventTypes.has(type)) {
    throw badRequest("INVALID_EVENT_TYPE", `Event type must be one of: ${Array.from(holdingEventTypes).join(", ")}.`);
  }

  const event = {
    id: randomUUID().toUpperCase(),
    groupID: holding.groupID,
    holdingID: holding.id,
    ownerID: holding.ownerID,
    type,
    symbol: holding.symbol,
    assetName: holding.assetName,
    market: holding.market,
    quantity: holding.quantity,
    averageCost: holding.averageCost,
    lastPrice: holding.lastPrice,
    currency: holding.currency,
    visibility: holding.visibility,
    note: holding.note ?? "",
    createdAt: new Date().toISOString()
  };

  if (previousHolding) {
    event.previousSymbol = previousHolding.symbol;
    event.previousAssetName = previousHolding.assetName;
    event.previousQuantity = previousHolding.quantity;
    event.previousAverageCost = previousHolding.averageCost;
    event.previousLastPrice = previousHolding.lastPrice;
    event.previousVisibility = previousHolding.visibility;
  }

  return event;
}

export function findCurrentMember(data, memberID) {
  const resolvedID = memberID || data.currentMemberID || randomUUID().toUpperCase();
  const user = data.users?.find((candidate) => candidate.id === resolvedID);
  if (user) {
    return memberFromUser(user, "owner");
  }

  return data.groups
    .flatMap((group) => group.members)
    .find((member) => member.id === resolvedID) ?? {
    id: resolvedID,
    displayName: "我",
    avatarSymbol: "person.crop.circle.fill",
    role: "owner",
    joinedAt: new Date().toISOString()
  };
}

export function badRequest(code, message) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

export function notFound(code, message) {
  const error = new Error(message);
  error.status = 404;
  error.code = code;
  return error;
}

export function forbidden(code, message) {
  const error = new Error(message);
  error.status = 403;
  error.code = code;
  return error;
}

function marketValue(holding) {
  return Number(holding.quantity) * Number(holding.lastPrice);
}

function costBasis(holding) {
  if (holding.averageCost === null || holding.averageCost === undefined || holding.averageCost === "") {
    return 0;
  }
  const averageCost = Number(holding.averageCost);
  if (!Number.isFinite(averageCost)) {
    return 0;
  }
  return Number(holding.quantity) * averageCost;
}

function groupBy(items, keyForItem) {
  return items.reduce((groups, item) => {
    const key = keyForItem(item);
    groups[key] ??= [];
    groups[key].push(item);
    return groups;
  }, {});
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUser(input, existingUser = undefined) {
  const now = new Date().toISOString();
  return {
    id: existingUser?.id ?? randomUUID().toUpperCase(),
    provider: input.provider,
    providerUserID: input.providerUserID,
    displayName: input.displayName,
    email: input.email,
    avatarSymbol: input.avatarSymbol,
    pictureURL: input.pictureURL ?? existingUser?.pictureURL ?? "",
    createdAt: existingUser?.createdAt ?? now,
    lastSignedInAt: now
  };
}

function optionalCleanString(body, fieldName, fallback) {
  if (!hasOwn(body, fieldName)) {
    return fallback;
  }
  return cleanString(body[fieldName]) || null;
}

function priceSourceForInput(body, fallback) {
  if (!hasOwn(body, "priceSource")) {
    return fallback;
  }
  return cleanString(body.priceSource) || "manual";
}

function hasOwn(object, fieldName) {
  return Object.prototype.hasOwnProperty.call(object, fieldName);
}

function positiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw badRequest("INVALID_NUMBER", `${fieldName} must be a positive number.`);
  }
  return number;
}

function nonNegativeNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw badRequest("INVALID_NUMBER", `${fieldName} must be a non-negative number.`);
  }
  return number;
}

function optionalNonNegativeNumber(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return nonNegativeNumber(value, fieldName);
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let index = 0; index < 4; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `PC-${token}`;
}
