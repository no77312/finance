import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileStore } from "../src/store.js";
import { createPositionCircleServer } from "../src/server.js";
import { parseScreenshotImport } from "../src/importParser.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const seedFile = join(testDir, "..", "data", "seed.json");
const groupID = "D54C3FB6-11E8-447D-A2BB-EF9505087101";
const memberID = "4D99EF67-4E8F-4BA6-9E96-1E62E7680010";

let baseURL;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  process.env.PRICE_REFRESH_DISABLED = "1";
  process.env.PRICE_REFRESH_TOKEN = "test-refresh-token";

  const tempDir = await mkdtemp(join(tmpdir(), "position-circle-api-"));
  const store = new FileStore({
    dataFile: join(tempDir, "store.json"),
    seedFile
  });
  const server = createPositionCircleServer({
    store,
    verifyGoogleIDToken: async (body) => {
      assert.equal(body.credential, "fake-google-token");
      return {
        googleUserID: "google-test-user-1",
        email: "gina@example.com",
        fullName: "Gina",
        pictureURL: "https://example.com/gina.png"
      };
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;

  try {
    await servesHealthAndBootstrapData();
    await parsesScreenshotImportDraftsWithoutModelKey();
    await correctsModelPriceCostOrderFromMarketValue();
    await signsInAndJoinsGroupByInviteCode();
    await signsInWithGoogleAndCreatesGroup();
    await createsGroupForSignedInUser();
    await createsHoldingAndIncludesItInAnalytics();
    await rejectsPriceRefreshWithoutToken();
    await refreshesPricesWithoutBreakingWhenProviderDisabled();
    await updatesAndDeletesOwnedHolding();
    console.log("PositionCircle API checks passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function servesHealthAndBootstrapData() {
  const health = await getJson("/health");
  assert.equal(health.status, "ok");

  const bootstrap = await getJson("/api/bootstrap");
  assert.equal(bootstrap.currentMemberID, memberID);
  assert.equal(bootstrap.groups.length, 1);
  assert.equal(bootstrap.holdings.length, 5);
  assert.equal(Array.isArray(bootstrap.holdingEvents), true);
}

async function signsInAndJoinsGroupByInviteCode() {
  const signedIn = await postJsonWithoutMember("/api/auth/apple", {
    appleUserID: "apple-test-user-1",
    email: "dana@example.com",
    fullName: "Dana"
  });

  assert.equal(signedIn.user.provider, "apple");
  assert.equal(signedIn.user.displayName, "Dana");
  assert.ok(signedIn.sessionToken);
  assert.equal(signedIn.groups.length, 0);

  const rejected = await fetch(`${baseURL}/api/groups/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Member-ID": signedIn.currentMemberID
    },
    body: JSON.stringify({ inviteCode: "LONG-2026" })
  });
  assert.equal(rejected.status, 403);

  const joined = await postJsonWithMember(signedIn.currentMemberID, signedIn.sessionToken, "/api/groups/join", {
    inviteCode: "long-2026"
  });
  assert.equal(joined.group.id, groupID);
  assert.ok(joined.group.members.some((member) => member.id === signedIn.currentMemberID));

  const bootstrap = await getJsonWithMember(signedIn.currentMemberID, signedIn.sessionToken, "/api/bootstrap");
  assert.equal(bootstrap.currentMemberID, signedIn.currentMemberID);
  assert.equal(bootstrap.groups.length, 1);
  assert.equal(bootstrap.holdings.every((holding) => holding.groupID === groupID), true);
}

async function signsInWithGoogleAndCreatesGroup() {
  const signedIn = await postJsonWithoutMember("/api/auth/google", {
    credential: "fake-google-token"
  });

  assert.equal(signedIn.user.provider, "google");
  assert.equal(signedIn.user.displayName, "Gina");
  assert.equal(signedIn.user.email, "gina@example.com");
  assert.equal(signedIn.user.pictureURL, "https://example.com/gina.png");
  assert.ok(signedIn.sessionToken);

  const created = await postJsonWithMember(signedIn.currentMemberID, signedIn.sessionToken, "/api/groups", {
    name: "Google 登录小组",
    subtitle: "PWA 测试"
  });

  assert.equal(created.group.members[0].id, signedIn.currentMemberID);
  assert.equal(created.group.members[0].displayName, "Gina");
  assert.equal(created.group.members[0].pictureURL, "https://example.com/gina.png");
}

async function createsGroupForSignedInUser() {
  const signedIn = await postJsonWithoutMember("/api/auth/device", {
    deviceID: "device-test-user-1",
    displayName: "Chris"
  });

  const created = await postJsonWithMember(signedIn.currentMemberID, signedIn.sessionToken, "/api/groups", {
    name: "新组合",
    subtitle: "测试创建群组"
  });

  assert.equal(created.group.members.length, 1);
  assert.equal(created.group.members[0].id, signedIn.currentMemberID);
  assert.equal(created.group.members[0].displayName, "Chris");

  const groups = await getJsonWithMember(signedIn.currentMemberID, signedIn.sessionToken, "/api/groups");
  assert.deepEqual(groups.groups.map((group) => group.id), [created.group.id]);
}

async function parsesScreenshotImportDraftsWithoutModelKey() {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const parsed = await postJson("/api/imports/parse-screenshot", {
      defaultVisibility: "amountOnly",
      ocrText: [
        "AAPL Apple Inc.",
        "数量 3 平均成本 180 现价 210 USD",
        "0700 Tencent Holdings",
        "数量 200 成本 320 现价 386 HKD"
      ].join("\n")
    });

    assert.equal(parsed.source, "fallback");
    assert.ok(parsed.holdings.some((holding) => holding.symbol === "AAPL"));
    assert.ok(parsed.holdings.some((holding) => holding.symbol === "0700"));
    assert.equal(parsed.holdings.find((holding) => holding.symbol === "AAPL").visibility, "amountOnly");
    assert.equal(parsed.holdings.find((holding) => holding.symbol === "AAPL").marketValue, null);
  } finally {
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    }
  }
}

async function correctsModelPriceCostOrderFromMarketValue() {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      holdings: [
        {
          symbol: "GOOGL",
          assetName: "谷歌-A",
          market: "usStock",
          quantity: 55,
          averageCost: 369,
          lastPrice: 385.473,
          marketValue: 20295,
          currency: "USD",
          visibility: "amountOnly",
          confidence: 0.95,
          note: "",
          rawText: "谷歌-A GOOGL 20,295.00 55 369.00 385.473 -19.25"
        }
      ],
      warnings: []
    })
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  try {
    const parsed = await parseScreenshotImport({
      defaultVisibility: "amountOnly",
      ocrText: [
        "名称代码 市值/数量 现价/成本 今日盈亏",
        "谷歌-A GOOGL 20,295.00 55 369.00 385.473 -19.25"
      ].join("\n")
    });

    assert.equal(parsed.source, "model");
    assert.equal(parsed.holdings[0].lastPrice, 369);
    assert.equal(parsed.holdings[0].averageCost, 385.473);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  }
}

async function refreshesPricesWithoutBreakingWhenProviderDisabled() {
  const refreshed = await postJson(`/api/groups/${groupID}/prices/refresh`, {}, refreshHeaders());

  assert.equal(refreshed.updatedCount, 0);
  assert.equal(refreshed.holdings.length >= 5, true);
  assert.ok(refreshed.failed.some((item) => item.symbol === "AAPL" || item.symbol === "0700"));

  const scheduledRefresh = await postJson("/api/admin/prices/refresh", {}, refreshHeaders());
  assert.equal(scheduledRefresh.updatedCount, 0);
  assert.equal(scheduledRefresh.holdings.length >= 5, true);
  assert.ok(scheduledRefresh.refreshedAt);
}

async function rejectsPriceRefreshWithoutToken() {
  const response = await fetch(`${baseURL}/api/admin/prices/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });

  assert.equal(response.status, 403);
}

async function createsHoldingAndIncludesItInAnalytics() {
  const created = await postJson(`/api/groups/${groupID}/holdings`, {
    symbol: "AAPL",
    assetName: "Apple",
    market: "usStock",
    quantity: 3,
    averageCost: 180,
    lastPrice: 210,
    currency: "USD",
    visibility: "full",
    note: "Test holding"
  });

  assert.equal(created.holding.symbol, "AAPL");
  assert.equal(created.holding.ownerID, memberID);
  assert.equal(created.event.type, "created");
  assert.equal(created.event.symbol, "AAPL");

  const analytics = await getJson(`/api/groups/${groupID}/analytics`);
  assert.ok(analytics.exposures.some((exposure) => exposure.symbol === "AAPL"));
}

async function updatesAndDeletesOwnedHolding() {
  const created = await postJson(`/api/groups/${groupID}/holdings`, {
    symbol: "NVDA",
    assetName: "NVIDIA",
    market: "usStock",
    quantity: 1,
    averageCost: 100,
    lastPrice: 110,
    currency: "USD",
    visibility: "amountOnly",
    priceDate: "2026-06-15",
    priceSource: "alpha_vantage:NVDA",
    priceUpdatedAt: "2026-06-16T00:00:00.000Z"
  });

  const updated = await putJson(`/api/groups/${groupID}/holdings/${created.holding.id}`, {
    symbol: "NVDA",
    assetName: "NVIDIA",
    market: "usStock",
    quantity: 2,
    averageCost: 100,
    lastPrice: 120,
    currency: "USD",
    visibility: "full"
  });
  assert.equal(updated.holding.quantity, 2);
  assert.equal(updated.holding.visibility, "full");
  assert.equal(updated.holding.priceDate, null);
  assert.equal(updated.holding.priceSource, "manual");
  assert.equal(updated.holding.priceUpdatedAt, null);
  assert.equal(updated.event.type, "updated");
  assert.equal(updated.event.previousQuantity, 1);
  assert.equal(updated.event.quantity, 2);

  const deletedResponse = await fetch(`${baseURL}/api/groups/${groupID}/holdings/${created.holding.id}`, {
    method: "DELETE",
    headers: { "X-Member-ID": memberID }
  });
  assert.equal(deletedResponse.ok, true);
  const deleted = await deletedResponse.json();
  assert.equal(deleted.event.type, "deleted");
  assert.equal(deleted.event.symbol, "NVDA");

  const events = await getJson(`/api/groups/${groupID}/holding-events`);
  assert.ok(events.events.some((event) => event.type === "updated" && event.symbol === "NVDA"));
  assert.ok(events.events.some((event) => event.type === "deleted" && event.symbol === "NVDA"));
}

async function getJson(path) {
  const response = await fetch(`${baseURL}${path}`);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function getJsonWithMember(member, sessionToken, path) {
  const response = await fetch(`${baseURL}${path}`, {
    headers: {
      "X-Member-ID": member,
      "X-Session-Token": sessionToken
    }
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function postJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Member-ID": memberID,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function postJsonWithoutMember(path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function postJsonWithMember(member, sessionToken, path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Member-ID": member,
      "X-Session-Token": sessionToken
    },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function putJson(path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Member-ID": memberID
    },
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

function refreshHeaders() {
  return {
    Authorization: `Bearer ${process.env.PRICE_REFRESH_TOKEN}`
  };
}
