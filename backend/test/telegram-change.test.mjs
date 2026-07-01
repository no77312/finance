import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildHoldingChangeMessage } from "../src/telegramDigest.js";
import { FileStore } from "../src/store.js";
import { createPositionCircleServer } from "../src/server.js";

const seedFile = new URL("../data/seed.json", import.meta.url).pathname;
const groupID = "D54C3FB6-11E8-447D-A2BB-EF9505087101";
const memberID = "4D99EF67-4E8F-4BA6-9E96-1E62E7680010";
const chatID = "-1009999999999";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  formatsSingleChangeWithFullDetail();
  mergesBatchSyncIntoOneMessage();
  await pushesChangeOnHoldingCreate();
  console.log("telegram-change checks passed");
}

function formatsSingleChangeWithFullDetail() {
  const group = { name: "坚持价值投资", members: [] };

  const created = buildHoldingChangeMessage({
    group,
    actorName: "Alice",
    events: [{ type: "created", symbol: "AAPL", assetName: "Apple", quantity: 3, averageCost: 180, lastPrice: 210, currency: "USD" }]
  });
  assert.ok(created.includes("提交了调仓"));
  assert.ok(created.includes("新增"));
  assert.ok(created.includes("<b>AAPL</b>"));
  assert.ok(created.includes("数量 3"));
  assert.ok(created.includes("成本 $180"));
  assert.ok(created.includes("现价 $210"));

  const updated = buildHoldingChangeMessage({
    group,
    actorName: "Alice",
    events: [{ type: "updated", symbol: "AAPL", quantity: 5, previousQuantity: 3, averageCost: 180, lastPrice: 210, currency: "USD" }]
  });
  assert.ok(updated.includes("调整"));
  assert.ok(updated.includes("数量 3 → 5"));

  const deleted = buildHoldingChangeMessage({
    group,
    actorName: "Alice",
    events: [{ type: "deleted", symbol: "0700", assetName: "Tencent", quantity: 100, lastPrice: 386, currency: "HKD" }]
  });
  assert.ok(deleted.includes("清仓"));
  assert.ok(deleted.includes("原数量 100"));
  assert.ok(deleted.includes("HK$"));
}

function mergesBatchSyncIntoOneMessage() {
  const message = buildHoldingChangeMessage({
    group: { name: "坚持价值投资", members: [] },
    actorName: "Ben",
    events: [
      { type: "created", symbol: "NVDA", assetName: "NVIDIA", quantity: 2, averageCost: 100, lastPrice: 120, currency: "USD" },
      { type: "updated", symbol: "AAPL", quantity: 5, previousQuantity: 3, lastPrice: 210, currency: "USD" },
      { type: "deleted", symbol: "MSFT", quantity: 8, lastPrice: 445, currency: "USD" }
    ]
  });
  assert.ok(message.includes("同步了组合"));
  assert.ok(message.includes("新增 1"));
  assert.ok(message.includes("调整 1"));
  assert.ok(message.includes("清仓 1"));
  assert.ok(message.includes("NVDA") && message.includes("AAPL") && message.includes("MSFT"));
  // 合并成一条：只有一个标题行。
  assert.equal(message.split("\n").filter((line) => line.includes("📝")).length, 1);
}

async function pushesChangeOnHoldingCreate() {
  process.env.PRICE_REFRESH_DISABLED = "1";
  process.env.TELEGRAM_BOT_TOKEN = "change-test-bot-token";
  process.env.TELEGRAM_CHAT_MAP = JSON.stringify({ [groupID]: chatID });

  const telegramCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("api.telegram.org")) {
      telegramCalls.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(url, options);
  };

  const tempDir = await mkdtemp(join(tmpdir(), "pc-telegram-change-"));
  const store = new FileStore({ dataFile: join(tempDir, "store.json"), seedFile });
  const server = createPositionCircleServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await originalFetch(`${baseURL}/api/groups/${groupID}/holdings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Member-ID": memberID },
      body: JSON.stringify({
        symbol: "TESTX",
        assetName: "Test Co",
        market: "usStock",
        quantity: 4,
        averageCost: 50,
        lastPrice: 60,
        currency: "USD",
        visibility: "full"
      })
    });
    assert.equal(response.status, 201);

    // fire-and-forget：等推送完成（最多 ~1s）。
    await waitFor(() => telegramCalls.length > 0, 1500);

    assert.equal(telegramCalls.length, 1, "should push exactly one change message");
    assert.equal(telegramCalls[0].chat_id, chatID);
    assert.ok(telegramCalls[0].text.includes("新增"));
    assert.ok(telegramCalls[0].text.includes("TESTX"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    delete process.env.TELEGRAM_CHAT_MAP;
  }
}

async function waitFor(predicate, timeoutMs) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
