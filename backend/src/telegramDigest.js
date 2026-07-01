import { toUSD } from "./fx.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

// 与 server.js 的 dayKey 口径一致：按 Asia/Shanghai 取自然日。
export function dayKey(date = new Date(), timeZone = process.env.APP_TIME_ZONE || "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
}

// 把环境变量里的群组→Telegram chat 映射解析成对象。
export function parseChatMap(raw) {
  if (!raw) {
    return {};
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

// 构建当日日报：返回需要落库的今日净值快照，以及每个已绑定 Telegram 群组的推送文案。
// 这是一个纯函数（不读环境变量、不发网络请求），便于单测。
export function buildDailyDigest({ groups = [], holdings = [], dailyValuations = [], date, chatMap = {} }) {
  const priorByGroupOwner = indexPriorValuations(dailyValuations, date);
  const snapshots = [];
  const messages = [];

  for (const group of groups) {
    const todayValuations = valuationsForGroup(group, holdings, date);
    snapshots.push(...todayValuations);

    const chatID = resolveChatID(group, chatMap);
    if (!chatID) {
      continue;
    }

    const rows = todayValuations.map((valuation) => {
      const prior = priorByGroupOwner.get(ownerKey(group.id, valuation.ownerID));
      return buildMemberRow(group, valuation, prior);
    });

    messages.push({
      groupID: group.id,
      chatID,
      rows,
      text: formatGroupMessage(group, rows, date)
    });
  }

  return { date, snapshots, messages };
}

// 处理 Telegram webhook 推来的一条 update：识别 /bind /unbind /help 命令并改写群组绑定。
// 纯函数：直接在 data 上改绑定关系，返回要回复给用户的文案（由调用方负责发送）。
export function handleTelegramUpdate(data, update) {
  const message = update?.message ?? update?.channel_post ?? update?.edited_message;
  const chat = message?.chat;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (!chat || !text.startsWith("/")) {
    return { reply: null };
  }

  const chatID = String(chat.id);
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.replace(/^\//, "").split("@")[0].toLowerCase();
  const groups = data.groups ?? [];

  if (command === "start" || command === "help") {
    return { reply: { chatID, text: helpText() } };
  }

  if (command === "bind") {
    const code = String(args[0] ?? "").trim().toUpperCase();
    if (!code) {
      return { reply: { chatID, text: "用法：<code>/bind 邀请码</code>，例如 <code>/bind LONG-2026</code>。邀请码在持仓圈「群组」页可以看到。" } };
    }

    const group = groups.find((candidate) => String(candidate.inviteCode ?? "").trim().toUpperCase() === code);
    if (!group) {
      return { reply: { chatID, text: `没找到邀请码 <b>${escapeHTML(code)}</b> 对应的群组，请在持仓圈里核对邀请码后重试。` } };
    }

    // 一个 Telegram 群只绑定一个持仓圈群组：先解除该 chat 之前的绑定。
    for (const candidate of groups) {
      if (candidate.id !== group.id && String(candidate.telegramChatID ?? "") === chatID) {
        candidate.telegramChatID = "";
      }
    }
    group.telegramChatID = chatID;

    return {
      reply: { chatID, text: `✅ 已绑定到「<b>${escapeHTML(group.name)}</b>」。每天收盘后会在这里推送每位成员的当日盈亏。发送 <code>/unbind</code> 可随时解绑。` },
      boundGroupID: group.id
    };
  }

  if (command === "unbind") {
    const bound = groups.filter((candidate) => String(candidate.telegramChatID ?? "") === chatID);
    if (bound.length === 0) {
      return { reply: { chatID, text: "这个群还没有绑定任何持仓圈群组。" } };
    }
    for (const candidate of bound) {
      candidate.telegramChatID = "";
    }
    return { reply: { chatID, text: `已解绑「${bound.map((candidate) => escapeHTML(candidate.name)).join("、")}」，不再推送当日盈亏。` } };
  }

  return { reply: null }; // 其它命令静默忽略。
}

function helpText() {
  return [
    "<b>持仓圈日报机器人</b>",
    "把我加进群后，发送以下命令：",
    "• <code>/bind 邀请码</code>　绑定一个持仓圈群组，每天收盘后推送当日盈亏",
    "• <code>/unbind</code>　解除本群的绑定",
    "邀请码在持仓圈 App 的「群组」页可以看到。"
  ].join("\n");
}

export async function sendTelegramMessage({ botToken, chatID, text, fetchImpl = fetch }) {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram sendMessage ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

// 构建“有人提交调仓”的实时推送文案（完整变动口径：标的 + 数量 + 成本 + 现价）。
// 一次提交可能含多笔事件（如截图同步），合并成一条消息。
export function buildHoldingChangeMessage({ group, events, actorName }) {
  const list = (events ?? []).filter(Boolean);
  if (list.length === 0) {
    return null;
  }

  const lines = [];
  if (list.length === 1) {
    lines.push(`📝 <b>${escapeHTML(actorName)}</b> 提交了调仓 · ${escapeHTML(group.name)}`);
  } else {
    const summary = [
      countByType(list, "created") ? `新增 ${countByType(list, "created")}` : "",
      countByType(list, "updated") ? `调整 ${countByType(list, "updated")}` : "",
      countByType(list, "deleted") ? `清仓 ${countByType(list, "deleted")}` : ""
    ].filter(Boolean).join("、");
    lines.push(`📝 <b>${escapeHTML(actorName)}</b> 同步了组合（${summary}）· ${escapeHTML(group.name)}`);
  }
  lines.push("");
  for (const event of list) {
    lines.push(holdingChangeLine(event));
  }
  return lines.join("\n");
}

// 把今日快照合并进 data.dailyValuations，按 id 去重覆盖，每个成员-群组只保留最近 120 天。
export function persistDailyValuations(data, snapshots) {
  data.dailyValuations ??= [];
  const byID = new Map(data.dailyValuations.map((valuation) => [valuation.id, valuation]));
  for (const snapshot of snapshots) {
    byID.set(snapshot.id, snapshot);
  }

  const grouped = new Map();
  for (const valuation of byID.values()) {
    const key = ownerKey(valuation.groupID, valuation.ownerID);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(valuation);
  }

  const kept = [];
  for (const list of grouped.values()) {
    list.sort(byDateAscending);
    kept.push(...list.slice(-120));
  }

  data.dailyValuations = kept.sort(byDateAscending);
  return data.dailyValuations;
}

function valuationsForGroup(group, holdings, date) {
  const members = group.members ?? [];
  const groupHoldings = holdings.filter((holding) => holding.groupID === group.id);

  return members.map((member) => {
    const ownHoldings = groupHoldings.filter((holding) => holding.ownerID === member.id);
    const positions = {};
    let totalMarketValueUSD = 0;

    for (const holding of ownHoldings) {
      const lastPriceUSD = toUSD(Number(holding.lastPrice), holding.currency);
      const marketValueUSD = Number(holding.quantity) * lastPriceUSD;
      totalMarketValueUSD += marketValueUSD;
      // 同一标的多笔时累加数量，价格取最后一笔（同标的同币种价格应一致）。
      const existing = positions[holding.symbol];
      positions[holding.symbol] = {
        quantity: round((existing?.quantity ?? 0) + Number(holding.quantity)),
        // 价格折算保留高精度：它会乘以数量算当日涨跌，过早四舍五入会被放大成误差。
        lastPriceUSD: roundPrice(lastPriceUSD),
        currency: holding.currency,
        marketValueUSD: round((existing?.marketValueUSD ?? 0) + marketValueUSD)
      };
    }

    return {
      id: `${group.id}:${member.id}:${date}`,
      groupID: group.id,
      ownerID: member.id,
      date,
      totalMarketValueUSD: round(totalMarketValueUSD),
      holdingCount: ownHoldings.length,
      positions
    };
  });
}

function buildMemberRow(group, valuation, prior) {
  const member = (group.members ?? []).find((candidate) => candidate.id === valuation.ownerID);
  const name = member?.displayName ?? "成员";

  if (valuation.holdingCount === 0) {
    return { name, status: "empty", dayPnlUSD: null, dayPnlPercent: null, marketValueUSD: 0 };
  }

  if (!prior) {
    return {
      name,
      status: "no-prior",
      dayPnlUSD: null,
      dayPnlPercent: null,
      marketValueUSD: valuation.totalMarketValueUSD
    };
  }

  let dayPnlUSD = 0;
  let matchedCount = 0;
  for (const [symbol, position] of Object.entries(valuation.positions)) {
    const priorPosition = prior.positions?.[symbol];
    if (!priorPosition) {
      continue; // 当日新开仓不计当日涨跌。
    }
    matchedCount += 1;
    dayPnlUSD += position.quantity * (position.lastPriceUSD - priorPosition.lastPriceUSD);
  }

  if (matchedCount === 0) {
    // 今天的标的昨天一个都没有（全是新仓）→ 没有可对比的基准。
    return {
      name,
      status: "no-prior",
      dayPnlUSD: null,
      dayPnlPercent: null,
      marketValueUSD: valuation.totalMarketValueUSD
    };
  }

  const base = Number(prior.totalMarketValueUSD) || 0;
  const dayPnlPercent = base > 0 ? dayPnlUSD / base : null;

  return {
    name,
    status: "ok",
    dayPnlUSD: round(dayPnlUSD),
    dayPnlPercent: dayPnlPercent === null ? null : roundRatio(dayPnlPercent),
    marketValueUSD: valuation.totalMarketValueUSD
  };
}

function formatGroupMessage(group, rows, date) {
  const sorted = rows
    .slice()
    .sort((first, second) => rank(second) - rank(first));

  const lines = [
    `<b>📊 ${escapeHTML(group.name)} · 当日盈亏</b>`,
    `<i>${escapeHTML(formatDateLabel(date))} 收盘 · 已折算美元（汇率为近似值）</i>`,
    ""
  ];

  let totalDayPnlUSD = 0;
  let hasComparable = false;

  for (const row of sorted) {
    if (row.status === "empty") {
      lines.push(`⚪️ <b>${escapeHTML(row.name)}</b>　暂无持仓`);
      continue;
    }
    if (row.status === "no-prior") {
      lines.push(`⚪️ <b>${escapeHTML(row.name)}</b>　暂无对比数据，明日起展示`);
      continue;
    }

    hasComparable = true;
    totalDayPnlUSD += row.dayPnlUSD;
    const emoji = row.dayPnlUSD > 0 ? "🟢" : row.dayPnlUSD < 0 ? "🔴" : "⚪️";
    const pnl = formatSignedUSD(row.dayPnlUSD);
    const percent = row.dayPnlPercent === null ? "" : `（${formatSignedPercent(row.dayPnlPercent)}）`;
    lines.push(`${emoji} <b>${escapeHTML(row.name)}</b>　${pnl}${percent}`);
  }

  if (hasComparable) {
    lines.push("");
    lines.push(`合计当日　${formatSignedUSD(round(totalDayPnlUSD))}`);
  }

  return lines.join("\n");
}

function indexPriorValuations(dailyValuations, date) {
  const latestByOwner = new Map();
  for (const valuation of dailyValuations) {
    if (!valuation?.date || valuation.date >= date) {
      continue; // 只看严格早于今天的快照，避免重复运行时把今天当成昨天。
    }
    const key = ownerKey(valuation.groupID, valuation.ownerID);
    const existing = latestByOwner.get(key);
    if (!existing || valuation.date > existing.date) {
      latestByOwner.set(key, valuation);
    }
  }
  return latestByOwner;
}

export function resolveChatID(group, chatMap) {
  const fromGroup = typeof group.telegramChatID === "string" ? group.telegramChatID.trim() : "";
  if (fromGroup) {
    return fromGroup;
  }
  const fromMap = chatMap?.[group.id];
  return typeof fromMap === "string" || typeof fromMap === "number" ? String(fromMap).trim() : "";
}

function rank(row) {
  // 有当日盈亏的排前面（按金额降序），无数据/无持仓排后面。
  if (row.status !== "ok") {
    return Number.NEGATIVE_INFINITY;
  }
  return row.dayPnlUSD;
}

function ownerKey(groupID, ownerID) {
  return `${groupID}:${ownerID}`;
}

function byDateAscending(first, second) {
  if (first.date === second.date) {
    return 0;
  }
  return first.date < second.date ? -1 : 1;
}

function formatDateLabel(date) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date ?? "");
  return match ? `${match[1]}-${match[2]}` : String(date ?? "");
}

function formatSignedUSD(value) {
  const number = Number(value) || 0;
  const sign = number > 0 ? "+" : number < 0 ? "−" : "";
  const absolute = Math.abs(number).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
  return `${sign}US$${absolute}`;
}

function formatSignedPercent(value) {
  const percent = (Number(value) || 0) * 100;
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  return `${sign}${Math.abs(percent).toFixed(2)}%`;
}

function countByType(events, type) {
  return events.filter((event) => event.type === type).length;
}

function holdingChangeLine(event) {
  const symbol = escapeHTML(event.symbol ?? "");
  const name = event.assetName && event.assetName !== event.symbol ? `（${escapeHTML(event.assetName)}）` : "";
  const cur = currencySymbol(event.currency);
  const quantity = formatQuantity(event.quantity);
  const price = formatMoney(event.lastPrice, cur);
  const cost = isFiniteNumber(event.averageCost) ? formatMoney(event.averageCost, cur) : null;

  if (event.type === "created") {
    const costPart = cost ? ` · 成本 ${cost}` : "";
    return `🟢 新增 <b>${symbol}</b>${name} · 数量 ${quantity}${costPart} · 现价 ${price}`;
  }

  if (event.type === "deleted") {
    return `🔴 清仓 <b>${symbol}</b>${name} · 原数量 ${quantity} · 现价 ${price}`;
  }

  const parts = [];
  if (isFiniteNumber(event.previousQuantity) && Number(event.previousQuantity) !== Number(event.quantity)) {
    parts.push(`数量 ${formatQuantity(event.previousQuantity)} → ${quantity}`);
  } else {
    parts.push(`数量 ${quantity}`);
  }
  if (cost && isFiniteNumber(event.previousAverageCost) && Number(event.previousAverageCost) !== Number(event.averageCost)) {
    parts.push(`成本 ${formatMoney(event.previousAverageCost, cur)} → ${cost}`);
  }
  parts.push(`现价 ${price}`);
  return `🔵 调整 <b>${symbol}</b>${name} · ${parts.join(" · ")}`;
}

function currencySymbol(currency) {
  return { USD: "$", HKD: "HK$", CNY: "¥", SGD: "S$" }[currency] ?? "";
}

function formatMoney(value, currencySym) {
  const number = Number(value) || 0;
  return `${currencySym}${number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}`;
}

function formatQuantity(value) {
  const number = Number(value) || 0;
  return number.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundPrice(value) {
  return Math.round((Number(value) || 0) * 1000000) / 1000000;
}

function roundRatio(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}
