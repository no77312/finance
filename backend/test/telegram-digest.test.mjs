import assert from "node:assert/strict";
import { buildDailyDigest, persistDailyValuations } from "../src/telegramDigest.js";

const GROUP_ID = "G1";
const CHAT_ID = "-1002000000001";

const group = {
  id: GROUP_ID,
  name: "长期主义小组",
  telegramChatID: CHAT_ID,
  members: [
    { id: "alice", displayName: "Alice" },
    { id: "ben", displayName: "Ben" },
    { id: "carol", displayName: "Carol" }
  ]
};

// 今日持仓（已是刷新后的收盘价）。
const holdings = [
  // Alice：美股 + 港股，昨天都持有 → 计当日涨跌。
  { groupID: GROUP_ID, ownerID: "alice", symbol: "VOO", market: "fund", quantity: 18, lastPrice: 486, averageCost: 421, currency: "USD" },
  { groupID: GROUP_ID, ownerID: "alice", symbol: "0700", market: "hkStock", quantity: 100, lastPrice: 386, averageCost: 310, currency: "HKD" },
  // Ben：只有一只昨天也持有的美股，今天跌了。
  { groupID: GROUP_ID, ownerID: "ben", symbol: "AAPL", market: "usStock", quantity: 10, lastPrice: 200, averageCost: 150, currency: "USD" },
  // Carol：今天才开仓 → 当日新仓不计涨跌。
  { groupID: GROUP_ID, ownerID: "carol", symbol: "NVDA", market: "usStock", quantity: 5, lastPrice: 120, averageCost: 100, currency: "USD" }
];

// 昨日持仓（收盘价）：Carol 昨天还没开仓 → 今日应提示"暂无对比数据"。
const yesterday = "2026-06-29";
const today = "2026-06-30";
const yesterdayHoldings = [
  { groupID: GROUP_ID, ownerID: "alice", symbol: "VOO", market: "fund", quantity: 18, lastPrice: 480, averageCost: 421, currency: "USD" },
  { groupID: GROUP_ID, ownerID: "alice", symbol: "0700", market: "hkStock", quantity: 100, lastPrice: 380, averageCost: 310, currency: "HKD" },
  { groupID: GROUP_ID, ownerID: "ben", symbol: "AAPL", market: "usStock", quantity: 10, lastPrice: 210, averageCost: 150, currency: "USD" }
];

// 用同一个函数生成昨日快照，保证两天的折算精度一致（更贴近真实运行）。
const priorValuations = buildDailyDigest({ groups: [group], holdings: yesterdayHoldings, dailyValuations: [], date: yesterday }).snapshots;

main();

function main() {
  computesPriceDrivenDayChange();
  marksMembersWithoutPriorSnapshot();
  skipsGroupsWithoutChatBinding();
  persistsAndCapsValuations();
  console.log("telegram-digest checks passed");
}

function computesPriceDrivenDayChange() {
  const digest = buildDailyDigest({ groups: [group], holdings, dailyValuations: priorValuations, date: today });
  assert.equal(digest.messages.length, 1);
  const message = digest.messages[0];
  assert.equal(message.chatID, CHAT_ID);

  const rowByName = Object.fromEntries(message.rows.map((row) => [row.name, row]));

  // Alice：VOO 18×(486−480)=108；0700 100×(386−380)×0.1282=76.92 → 184.92
  const aliceExpected = round(18 * (486 - 480) + 100 * (386 - 380) * 0.1282);
  assert.equal(rowByName.Alice.status, "ok");
  assert.ok(Math.abs(rowByName.Alice.dayPnlUSD - aliceExpected) < 0.01, `Alice day pnl ${rowByName.Alice.dayPnlUSD} != ${aliceExpected}`);
  assert.ok(rowByName.Alice.dayPnlUSD > 0);

  // Ben：AAPL 10×(200−210) = −100，今天是亏的。
  assert.equal(rowByName.Ben.status, "ok");
  assert.ok(Math.abs(rowByName.Ben.dayPnlUSD - -100) < 0.01, `Ben day pnl ${rowByName.Ben.dayPnlUSD}`);
  assert.ok(rowByName.Ben.dayPnlUSD < 0);

  // 文案里应包含折算美元与中文标题。
  assert.ok(message.text.includes("当日盈亏"));
  assert.ok(message.text.includes("US$"));
}

function marksMembersWithoutPriorSnapshot() {
  const digest = buildDailyDigest({ groups: [group], holdings, dailyValuations: priorValuations, date: today });
  const carol = digest.messages[0].rows.find((row) => row.name === "Carol");
  assert.equal(carol.status, "no-prior");
  assert.equal(carol.dayPnlUSD, null);
}

function skipsGroupsWithoutChatBinding() {
  const unbound = { ...group, telegramChatID: undefined };
  const digest = buildDailyDigest({ groups: [unbound], holdings, dailyValuations: priorValuations, date: today, chatMap: {} });
  // 没有绑定 chat → 不推送，但仍生成快照供次日对比。
  assert.equal(digest.messages.length, 0);
  assert.ok(digest.snapshots.length > 0);

  const viaMap = buildDailyDigest({ groups: [unbound], holdings, dailyValuations: priorValuations, date: today, chatMap: { [GROUP_ID]: CHAT_ID } });
  assert.equal(viaMap.messages.length, 1);
  assert.equal(viaMap.messages[0].chatID, CHAT_ID);
}

function persistsAndCapsValuations() {
  const data = { dailyValuations: priorValuations.slice() };
  const digest = buildDailyDigest({ groups: [group], holdings, dailyValuations: data.dailyValuations, date: today });
  persistDailyValuations(data, digest.snapshots);

  // 今日快照应写入，且重复运行时按 id 覆盖而不是堆积。
  const aliceToday = data.dailyValuations.filter((v) => v.ownerID === "alice" && v.date === today);
  assert.equal(aliceToday.length, 1);

  persistDailyValuations(data, digest.snapshots);
  const aliceTodayAgain = data.dailyValuations.filter((v) => v.ownerID === "alice" && v.date === today);
  assert.equal(aliceTodayAgain.length, 1, "re-running the digest should overwrite, not duplicate");
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
