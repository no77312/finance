import assert from "node:assert/strict";
import { generateGroupAdvice } from "../src/groupAdvice.js";

// 结构分不应受浮盈亏影响：分散但下跌的组合应比集中但上涨的组合更健康。
const previousKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY; // 走确定性的规则路径

const group = {
  id: "g1",
  name: "结构测试组",
  members: [
    { id: "div", displayName: "Div" },
    { id: "conc", displayName: "Conc" },
    { id: "hidden", displayName: "Hidden" }
  ]
};

const holdings = [
  // Div：6 只、跨 4 个市场、仓位均衡，但整体大幅浮亏（约 -25%）。
  h("div", "AAPL", "usStock", "USD", 10, 200, 150),
  h("div", "GOOG", "usStock", "USD", 10, 200, 150),
  h("div", "VOO", "fund", "USD", 3, 600, 500),
  h("div", "0700", "hkStock", "HKD", 40, 350, 300),
  h("div", "BTC", "crypto", "USD", 0.02, 100000, 75000),
  h("div", "MSFT", "usStock", "USD", 4, 400, 375),
  // Conc：单一标的、单一市场，浮盈 +100%。
  h("conc", "NVDA", "usStock", "USD", 100, 100, 200),
  // Hidden：有持仓但设为仅标的，非本人看不到金额。
  { ...h("hidden", "TSLA", "usStock", "USD", 5, 100, 300), visibility: "symbolOnly" }
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  try {
    const advice = await generateGroupAdvice({ group, holdings, requesterID: "observer" });
    const byName = Object.fromEntries(advice.members.map((member) => [member.name, member]));
    const div = byName.Div;
    const conc = byName.Conc;
    const hidden = byName.Hidden;

    // 分数都是 0-100 的整数。
    for (const member of advice.members) {
      assert.ok(Number.isInteger(member.healthScore) && member.healthScore >= 0 && member.healthScore <= 100, `bad score for ${member.name}: ${member.healthScore}`);
    }

    // 核心：分散但下跌 > 集中但上涨（结构分不看盈亏）。
    assert.ok(div.healthScore > conc.healthScore, `Div(${div.healthScore}) 应高于 Conc(${conc.healthScore})`);
    assert.ok(div.healthScore >= 80, `Div 应属分散均衡区间，实际 ${div.healthScore}`);
    assert.equal(div.healthLabel, "分散均衡");
    assert.ok(conc.healthScore <= 40, `Conc 应属高集中区间，实际 ${conc.healthScore}`);
    assert.equal(conc.healthLabel, "高集中");

    // 金额被隐藏 → 数据不足，不参与结构评分。
    assert.equal(hidden.healthLabel, "数据不足");
    assert.equal(hidden.healthScore, 0);

    // health 文案里仍客观展示浮盈亏，但不影响分数。
    assert.ok(div.health.includes("浮亏"), `Div health 应提到浮亏：${div.health}`);
    assert.ok(conc.health.includes("浮盈"), `Conc health 应提到浮盈：${conc.health}`);

    console.log("group-advice-score checks passed");
    console.log(`  Div(分散/浮亏): ${div.healthScore} ${div.healthLabel}`);
    console.log(`  Conc(集中/浮盈): ${conc.healthScore} ${conc.healthLabel}`);
  } finally {
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    }
  }
}

function h(ownerID, symbol, market, currency, quantity, averageCost, lastPrice) {
  return {
    id: `${ownerID}-${symbol}`,
    groupID: "g1",
    ownerID,
    symbol,
    assetName: symbol,
    market,
    quantity,
    averageCost,
    lastPrice,
    currency,
    visibility: "full",
    note: ""
  };
}
