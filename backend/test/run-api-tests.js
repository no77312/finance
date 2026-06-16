import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileStore } from "../src/store.js";
import { createPositionCircleServer } from "../src/server.js";

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

  const tempDir = await mkdtemp(join(tmpdir(), "position-circle-api-"));
  const store = new FileStore({
    dataFile: join(tempDir, "store.json"),
    seedFile
  });
  const server = createPositionCircleServer({ store });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;

  try {
    await servesHealthAndBootstrapData();
    await parsesScreenshotImportDraftsWithoutModelKey();
    await createsHoldingAndIncludesItInAnalytics();
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

async function refreshesPricesWithoutBreakingWhenProviderDisabled() {
  const refreshed = await postJson(`/api/groups/${groupID}/prices/refresh`, {});

  assert.equal(refreshed.updatedCount, 0);
  assert.equal(refreshed.holdings.length >= 5, true);
  assert.ok(refreshed.failed.some((item) => item.symbol === "AAPL" || item.symbol === "0700"));
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
    visibility: "amountOnly"
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

  const deleted = await fetch(`${baseURL}/api/groups/${groupID}/holdings/${created.holding.id}`, {
    method: "DELETE",
    headers: { "X-Member-ID": memberID }
  });
  assert.equal(deleted.status, 204);
}

async function getJson(path) {
  const response = await fetch(`${baseURL}${path}`);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Member-ID": memberID
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
