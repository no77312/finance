import assert from "node:assert/strict";
import { refreshHoldingsWithPreviousClose } from "../src/marketData.js";

// 默认行情源应为 Yahoo（无 key、无额度），覆盖各市场标的。
delete process.env.PRICE_REFRESH_DISABLED;
delete process.env.MARKET_DATA_PROVIDER;
delete process.env.ALPHA_VANTAGE_API_KEY;

const requested = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return new Response(JSON.stringify({
    chart: { result: [{ timestamp: [1719360000, 1719446400], indicators: { quote: [{ close: [100, 105] }] } }] }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  try {
    const holdings = [
      { symbol: "VOO", market: "fund", currency: "USD", quantity: 1, lastPrice: 50, priceDate: null },
      { symbol: "700", market: "hkStock", currency: "HKD", quantity: 10, lastPrice: 300, priceDate: null },
      { symbol: "00700", market: "hkStock", currency: "HKD", quantity: 5, lastPrice: 400, priceDate: null },
      { symbol: "BRK.B", market: "usStock", currency: "USD", quantity: 1, lastPrice: 480, priceDate: null },
      { symbol: "BTC", market: "crypto", currency: "USD", quantity: 0.1, lastPrice: 40000, priceDate: null },
      { symbol: "CASH", market: "cash", currency: "USD", quantity: 100, lastPrice: 1, priceDate: null }
    ];
    const result = await refreshHoldingsWithPreviousClose(holdings);

    // 5 只非现金标的都应刷新到 105，来源 yahoo；现金没有价格会被记为 failed（预期）。
    assert.equal(result.updatedCount, 5);
    assert.ok(result.failed.every((item) => item.market === "cash"), `非现金标的不应失败：${JSON.stringify(result.failed)}`);
    for (const holding of result.holdings) {
      if (holding.market === "cash") {
        assert.equal(holding.lastPrice, 1);
      } else {
        assert.equal(holding.lastPrice, 105);
        assert.ok(String(holding.priceSource).startsWith("yahoo:"), `bad source: ${holding.priceSource}`);
      }
    }

    // yahooSymbol 市场映射正确，含两个边界。
    assert.ok(requested.some((u) => u.includes("/0700.HK")), "港股应映射为 0700.HK");
    assert.ok(requested.some((u) => u.includes("/BTC-USD")), "加密应映射为 BTC-USD");
    assert.ok(requested.some((u) => u.includes("/VOO?")), "美股/基金保持原样");
    assert.ok(requested.some((u) => u.includes("/BRK-B")), "B类股应映射为 BRK-B（点改连字符）");
    assert.ok(!requested.some((u) => u.includes("/00700.HK")), "5位港股应去零成 0700.HK，而非 00700.HK");
    assert.ok(!requested.some((u) => u.includes("/BRK.B")), "美股点号应改成连字符");
    assert.ok(!requested.some((u) => u.includes("CASH")), "现金不应发起请求");

    console.log("market-data-yahoo checks passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}
