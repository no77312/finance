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
    await parsesImageModelDraftWithoutAverageCost();
    await sanitizesInteractiveBrokersScreenshotDrafts();
    await generatesGroupAdviceWithDailyCache();
    await signsInAndJoinsGroupByInviteCode();
    await signsInWithGoogleAndCreatesGroup();
    await createsGroupForSignedInUser();
    await leavesGroupAndDisbandsGroup();
    await syncsSnapshotHoldingsForCurrentMember();
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

  const rejected = await fetch(`${baseURL}/api/bootstrap`);
  assert.equal(rejected.status, 403);

  const bootstrap = await getJson("/api/bootstrap");
  assert.equal(bootstrap.currentMemberID, memberID);
  assert.equal(bootstrap.groups.length, 1);
  assert.equal(bootstrap.holdings.length, 5);
  assert.equal(Array.isArray(bootstrap.holdingEvents), true);
  assert.equal(Array.isArray(bootstrap.portfolioSnapshots), true);
  assert.ok(bootstrap.portfolioSnapshots.some((snapshot) => snapshot.ownerID === memberID));
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

async function generatesGroupAdviceWithDailyCache() {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const first = await getJson(`/api/groups/${groupID}/advice`);
    assert.equal(first.cached, false);
    assert.equal(typeof first.advice.headline, "string");
    assert.ok(first.advice.summary.length > 0);
    assert.ok(Array.isArray(first.advice.members));
    assert.ok(first.advice.members.length > 0);

    const second = await getJson(`/api/groups/${groupID}/advice`);
    assert.equal(second.cached, true);
    assert.equal(second.generatedAt, first.generatedAt);
    assert.deepEqual(second.advice, first.advice);
  } finally {
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  }
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

async function leavesGroupAndDisbandsGroup() {
  const owner = await postJsonWithoutMember("/api/auth/device", {
    deviceID: "group-owner-user",
    displayName: "Owner"
  });
  const member = await postJsonWithoutMember("/api/auth/device", {
    deviceID: "group-member-user",
    displayName: "Member"
  });

  const created = await postJsonWithMember(owner.currentMemberID, owner.sessionToken, "/api/groups", {
    name: "可退出的小组",
    subtitle: "测试退出和解散"
  });
  const groupIDForTest = created.group.id;

  await postJsonWithMember(member.currentMemberID, member.sessionToken, "/api/groups/join", {
    inviteCode: created.group.inviteCode
  });
  await postJsonWithMember(member.currentMemberID, member.sessionToken, `/api/groups/${groupIDForTest}/holdings`, {
    symbol: "TSLA",
    assetName: "Tesla",
    market: "usStock",
    quantity: 2,
    averageCost: 180,
    lastPrice: 220,
    currency: "USD",
    visibility: "amountOnly"
  });

  const ownerLeaveResponse = await fetch(`${baseURL}/api/groups/${groupIDForTest}/membership`, {
    method: "DELETE",
    headers: authHeaders(owner.currentMemberID, owner.sessionToken)
  });
  assert.equal(ownerLeaveResponse.status, 403);

  const nonOwnerDisbandResponse = await fetch(`${baseURL}/api/groups/${groupIDForTest}`, {
    method: "DELETE",
    headers: authHeaders(member.currentMemberID, member.sessionToken)
  });
  assert.equal(nonOwnerDisbandResponse.status, 403);

  const left = await deleteJsonWithMember(member.currentMemberID, member.sessionToken, `/api/groups/${groupIDForTest}/membership`);
  assert.ok(!left.groups.some((group) => group.id === groupIDForTest));

  const memberAccessResponse = await fetch(`${baseURL}/api/groups/${groupIDForTest}`, {
    headers: authHeaders(member.currentMemberID, member.sessionToken)
  });
  assert.equal(memberAccessResponse.status, 403);

  const ownerHoldings = await getJsonWithMember(owner.currentMemberID, owner.sessionToken, `/api/groups/${groupIDForTest}/holdings`);
  assert.ok(!ownerHoldings.holdings.some((holding) => holding.symbol === "TSLA"));

  const disbanded = await deleteJsonWithMember(owner.currentMemberID, owner.sessionToken, `/api/groups/${groupIDForTest}`);
  assert.ok(!disbanded.groups.some((group) => group.id === groupIDForTest));

  const deletedGroupResponse = await fetch(`${baseURL}/api/groups/${groupIDForTest}`, {
    headers: authHeaders(owner.currentMemberID, owner.sessionToken)
  });
  assert.equal(deletedGroupResponse.status, 404);
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
    assert.equal(parsed.holdings.find((holding) => holding.symbol === "AAPL").marketValue, 630);
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
          brokerName: "富途",
          accountName: "保证金账户 8381",
          accountKey: "富途:保证金账户 8381",
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
    assert.equal(parsed.holdings[0].brokerName, "富途");
    assert.equal(parsed.holdings[0].accountKey, "富途:保证金账户 8381");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  }
}

async function parsesImageModelDraftWithoutAverageCost() {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const requestBodies = [];

  globalThis.fetch = async (_url, options) => {
    const requestBody = JSON.parse(options.body);
    requestBodies.push(requestBody);
    if (requestBodies.length === 2) {
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          completions: [
            {
              id: 0,
              symbol: "1585",
              assetName: "雅迪控股",
              market: "hkStock",
              currency: "HKD",
              confidence: 0.95,
              note: "已联网补全港股代码"
            },
            {
              id: 1,
              symbol: "000832",
              assetName: "新产业",
              market: "cnStock",
              currency: "CNY",
              confidence: 0.95,
              note: "模拟搜索错配，后端应使用已知简称校正"
            }
          ],
          warnings: []
        })
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        holdings: [
          {
            symbol: "雅迪控股",
            assetName: "雅迪控股",
            market: "hkStock",
            quantity: null,
            averageCost: null,
            lastPrice: null,
            marketValue: null,
            currency: "HKD",
            visibility: "amountOnly",
            brokerName: "华宝证券",
            accountName: "**1473",
            accountKey: "华宝证券:**1473",
            confidence: 0.9,
            note: "截图未展示股票代码",
            rawText: "雅迪控股 18,550.20\n成本/现价\nHK$11.641 / HK$10.750"
          },
          {
            symbol: "新产业",
            assetName: "新产业",
            market: "cnStock",
            quantity: null,
            averageCost: null,
            lastPrice: null,
            marketValue: null,
            currency: "CNY",
            visibility: "amountOnly",
            brokerName: "华宝证券",
            accountName: "**1473",
            accountKey: "华宝证券:**1473",
            confidence: 0.9,
            note: "截图未展示股票代码",
            rawText: "新产业 4,271.00\n成本/现价\n44.486 / 42.710"
          }
        ],
        warnings: ["缺少数量、成本价、现价和市值，需人工确认。"]
      })
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const parsed = await parseScreenshotImport({
      defaultVisibility: "amountOnly",
      imageDataURL: "data:image/png;base64,AAAA",
      brokerHint: "华宝证券"
    });

    const requestBody = requestBodies[0];
    const userContent = requestBody.input.find((item) => item.role === "user").content;
    assert.ok(userContent.some((item) => item.type === "input_image"));
    assert.equal(requestBodies.length, 2);
    assert.ok(requestBodies[1].tools.some((tool) => tool.type === "web_search"));
    assert.equal(requestBodies[1].tool_choice, "required");
    assert.equal(parsed.source, "model");
    assert.equal(parsed.holdings[0].symbol, "1585");
    assert.equal(parsed.holdings[0].quantity, 1725.6);
    assert.equal(parsed.holdings[0].averageCost, 11.641);
    assert.equal(parsed.holdings[0].lastPrice, 10.75);
    assert.equal(parsed.holdings[1].symbol, "300832");
    assert.equal(parsed.holdings[1].quantity, 100);
    assert.equal(parsed.holdings[1].averageCost, 44.486);
    assert.equal(parsed.holdings[1].lastPrice, 42.71);
    assert.ok(!parsed.warnings.some((warning) => warning.includes("缺少数量")));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  }
}

async function sanitizesInteractiveBrokersScreenshotDrafts() {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = async (_url, options) => {
    JSON.parse(options.body);
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        holdings: [
          {
            symbol: "SNDK",
            assetName: "SNDK",
            market: "usStock",
            quantity: 131,
            averageCost: 1,
            lastPrice: 1248.55,
            marketValue: 8036,
            currency: "USD",
            visibility: "amountOnly",
            brokerName: "Interactive Brokers",
            accountName: "",
            accountKey: "IBKR",
            confidence: 0.9,
            note: "",
            rawText: "SNDK NASDAQ.NMS 1248.55 131 8036"
          },
          {
            symbol: "SIVE",
            assetName: "SIVE",
            market: "usStock",
            quantity: 2000,
            averageCost: null,
            lastPrice: 17.45,
            marketValue: 34900,
            currency: "USD",
            visibility: "amountOnly",
            brokerName: "Interactive Brokers",
            accountName: "",
            accountKey: "IBKR",
            confidence: 0.7,
            note: "模型误把P&L当市值",
            rawText: "SIVE SFB n/a 2.00K 34900"
          },
          {
            symbol: "402340",
            assetName: "402340",
            market: "hkStock",
            quantity: 1,
            averageCost: null,
            lastPrice: 994000,
            marketValue: 994000,
            currency: "HKD",
            visibility: "amountOnly",
            brokerName: "Interactive Brokers",
            accountName: "",
            accountKey: "IBKR",
            confidence: 0.8,
            note: "unsupported exchange",
            rawText: "402340 KRX 994000 1 40000"
          },
          {
            symbol: "AMD",
            assetName: "AMD",
            market: "usStock",
            quantity: null,
            averageCost: null,
            lastPrice: 9.3,
            marketValue: null,
            currency: "USD",
            visibility: "amountOnly",
            brokerName: "Interactive Brokers",
            accountName: "",
            accountKey: "IBKR",
            confidence: 0.9,
            note: "This is a put option, excluded.",
            rawText: "AMD MAY 08 '26 330 Put 9.30 0.03% 70.64% -4 110.52"
          },
          {
            symbol: "AAOI",
            assetName: "AAOI",
            market: "usStock",
            quantity: 330,
            averageCost: null,
            lastPrice: 173.28,
            marketValue: 52.5,
            currency: "USD",
            visibility: "amountOnly",
            brokerName: "Interactive Brokers",
            accountName: "",
            accountKey: "IBKR",
            confidence: 0.9,
            note: "",
            rawText: "AAOI NASDAQ.NMS 173.28 330 -52.50"
          }
        ],
        warnings: ["已排除所有期权合约持仓"]
      })
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const parsed = await parseScreenshotImport({
      defaultVisibility: "amountOnly",
      imageDataURL: "data:image/png;base64,AAAA",
      brokerHint: "Interactive Brokers / IBKR"
    });

    const symbols = parsed.holdings.map((holding) => holding.symbol);
    assert.deepEqual(symbols, ["SNDK", "AAOI"]);
    assert.equal(parsed.holdings[0].averageCost, null);
    assert.equal(parsed.holdings[0].marketValue, 163560.05);
    assert.equal(parsed.holdings[1].marketValue, 57182.4);
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

async function syncsSnapshotHoldingsForCurrentMember() {
  const synced = await putJson(`/api/groups/${groupID}/holdings/sync`, {
    holdings: [
      {
        symbol: "MSFT",
        assetName: "Microsoft",
        market: "usStock",
        quantity: 10,
        averageCost: null,
        lastPrice: 450,
        currency: "USD",
        visibility: "full",
        note: "截图同步"
      },
      {
        symbol: "AAPL",
        assetName: "Apple",
        market: "usStock",
        quantity: 6,
        averageCost: 180,
        lastPrice: 210,
        currency: "USD",
        visibility: "amountOnly",
        note: "截图同步"
      }
    ]
  });

  assert.equal(synced.summary.createdCount, 1);
  assert.equal(synced.summary.updatedCount, 1);
  assert.equal(synced.summary.deletedCount, 1);
  assert.equal(synced.summary.snapshotCount, 2);

  const holdings = await getJson(`/api/groups/${groupID}/holdings`);
  const mine = holdings.holdings.filter((holding) => holding.ownerID === memberID);
  assert.deepEqual(mine.map((holding) => holding.symbol).sort(), ["AAPL", "MSFT"]);
  assert.equal(mine.find((holding) => holding.symbol === "MSFT").quantity, 10);
  assert.equal(mine.find((holding) => holding.symbol === "MSFT").averageCost, null);
  assert.equal(mine.find((holding) => holding.symbol === "AAPL").visibility, "amountOnly");

  const events = await getJson(`/api/groups/${groupID}/holding-events`);
  assert.ok(events.events.some((event) => event.type === "updated" && event.symbol === "MSFT"));
  assert.ok(events.events.some((event) => event.type === "created" && event.symbol === "AAPL"));
  assert.ok(events.events.some((event) => event.type === "deleted" && event.symbol === "VOO"));

  const bootstrap = await getJson("/api/bootstrap");
  const memberSnapshots = bootstrap.portfolioSnapshots.filter((snapshot) => snapshot.groupID === groupID && snapshot.ownerID === memberID);
  assert.equal(memberSnapshots.length >= 2, true);
  assert.equal(memberSnapshots.at(-1).source, "screenshot");
  assert.deepEqual(memberSnapshots.at(-1).holdings.map((holding) => holding.symbol), ["AAPL", "MSFT"]);
  assert.equal(memberSnapshots.at(-1).holdings.find((holding) => holding.symbol === "MSFT").averageCost, null);
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
  assert.equal(deleted.snapshot.source, "manual");

  const events = await getJson(`/api/groups/${groupID}/holding-events`);
  assert.ok(events.events.some((event) => event.type === "updated" && event.symbol === "NVDA"));
  assert.ok(events.events.some((event) => event.type === "deleted" && event.symbol === "NVDA"));
}

async function getJson(path) {
  if (!path.startsWith("/health")) {
    return getJsonWithHeaders(path, { "X-Member-ID": memberID });
  }

  const response = await fetch(`${baseURL}${path}`);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function getJsonWithMember(member, sessionToken, path) {
  return getJsonWithHeaders(path, {
    "X-Member-ID": member,
    "X-Session-Token": sessionToken
  });
}

async function getJsonWithHeaders(path, headers) {
  const response = await fetch(`${baseURL}${path}`, {
    headers
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

async function deleteJsonWithMember(member, sessionToken, path) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "DELETE",
    headers: authHeaders(member, sessionToken)
  });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

function authHeaders(member, sessionToken) {
  return {
    "X-Member-ID": member,
    "X-Session-Token": sessionToken
  };
}

function refreshHeaders() {
  return {
    Authorization: `Bearer ${process.env.PRICE_REFRESH_TOKEN}`
  };
}
