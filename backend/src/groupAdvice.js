const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const FX_TO_USD = {
  USD: 1,
  HKD: 0.1282,
  CNY: 0.1392,
  SGD: 0.7421
};

const adviceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    highlights: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    },
    questions: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["headline", "summary", "highlights", "risks", "questions"]
};

export async function generateGroupAdvice({ group, holdings, requesterID }) {
  const profile = buildAdviceProfile(group, holdings, requesterID);

  if (!process.env.OPENAI_API_KEY) {
    return {
      ...fallbackAdvice(profile),
      source: "rules"
    };
  }

  try {
    const modelAdvice = await requestModelAdvice(profile);
    return {
      ...normalizeAdvice(modelAdvice, fallbackAdvice(profile)),
      source: "openai"
    };
  } catch (error) {
    return {
      ...fallbackAdvice(profile),
      source: "rules",
      warning: `AI 暂时不可用，已使用基础规则生成：${error.message}`
    };
  }
}

function buildAdviceProfile(group, holdings, requesterID) {
  const memberByID = new Map((group.members ?? []).map((member) => [member.id, member]));
  const rows = holdings
    .filter((holding) => holding.groupID === group.id)
    .map((holding) => adviceHoldingRow(holding, requesterID, memberByID))
    .filter(Boolean);
  const valuedRows = rows.filter((row) => Number.isFinite(row.marketValueUSD));
  const totalVisibleMarketValue = valuedRows.reduce((sum, row) => sum + row.marketValueUSD, 0);
  const bySymbol = aggregateBy(rows, (row) => row.symbol);
  const byMarket = aggregateBy(valuedRows, (row) => row.market);
  const byMember = aggregateBy(valuedRows, (row) => row.ownerID);

  return {
    group: {
      name: group.name,
      memberCount: group.members?.length ?? 0
    },
    totalVisibleMarketValue: round(totalVisibleMarketValue),
    holdingCount: rows.length,
    hiddenAmountCount: rows.filter((row) => row.hiddenAmount).length,
    consensus: Array.from(bySymbol.values())
      .filter((item) => item.holderIDs.size >= 2)
      .sort((first, second) => second.marketValueUSD - first.marketValueUSD)
      .slice(0, 8)
      .map((item) => ({
        symbol: item.symbol,
        assetName: item.assetName,
        holderCount: item.holderIDs.size,
        marketValueUSD: round(item.marketValueUSD),
        weight: totalVisibleMarketValue ? roundRatio(item.marketValueUSD / totalVisibleMarketValue) : 0
      })),
    topPositions: Array.from(bySymbol.values())
      .filter((item) => item.marketValueUSD > 0)
      .sort((first, second) => second.marketValueUSD - first.marketValueUSD)
      .slice(0, 8)
      .map((item) => ({
        symbol: item.symbol,
        assetName: item.assetName,
        holderCount: item.holderIDs.size,
        marketValueUSD: round(item.marketValueUSD),
        weight: totalVisibleMarketValue ? roundRatio(item.marketValueUSD / totalVisibleMarketValue) : 0
      })),
    marketDistribution: Array.from(byMarket.values())
      .sort((first, second) => second.marketValueUSD - first.marketValueUSD)
      .map((item) => ({
        market: item.market,
        marketValueUSD: round(item.marketValueUSD),
        weight: totalVisibleMarketValue ? roundRatio(item.marketValueUSD / totalVisibleMarketValue) : 0
      })),
    memberDistribution: Array.from(byMember.values())
      .sort((first, second) => second.marketValueUSD - first.marketValueUSD)
      .map((item) => ({
        member: memberByID.get(item.ownerID)?.displayName ?? "成员",
        holdingCount: item.holdingCount,
        marketValueUSD: round(item.marketValueUSD),
        weight: totalVisibleMarketValue ? roundRatio(item.marketValueUSD / totalVisibleMarketValue) : 0
      })),
    sampleHoldings: rows.slice(0, 40)
  };
}

function adviceHoldingRow(holding, requesterID, memberByID) {
  const member = memberByID.get(holding.ownerID);
  if (!member) {
    return null;
  }

  const canSeeAmount = holding.ownerID === requesterID || holding.visibility !== "symbolOnly";
  const marketValueUSD = canSeeAmount ? marketValueInUSD(holding) : null;
  return {
    ownerID: holding.ownerID,
    owner: member.displayName,
    symbol: holding.symbol,
    assetName: holding.assetName,
    market: holding.market,
    currency: holding.currency,
    quantity: canSeeAmount ? Number(holding.quantity) : null,
    lastPrice: canSeeAmount ? Number(holding.lastPrice) : null,
    averageCost: canSeeAmount && holding.averageCost !== null ? Number(holding.averageCost) : null,
    marketValueUSD: Number.isFinite(marketValueUSD) ? round(marketValueUSD) : null,
    visibility: holding.visibility,
    hiddenAmount: !canSeeAmount
  };
}

function aggregateBy(rows, keyForRow) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    const marketValueUSD = Number.isFinite(row.marketValueUSD) ? row.marketValueUSD : 0;
    const existing = grouped.get(key) ?? {
      [key === row.ownerID ? "ownerID" : "symbol"]: key,
      symbol: row.symbol,
      assetName: row.assetName,
      market: row.market,
      ownerID: row.ownerID,
      holderIDs: new Set(),
      holdingCount: 0,
      marketValueUSD: 0
    };
    existing.holderIDs.add(row.ownerID);
    existing.holdingCount += 1;
    existing.marketValueUSD += marketValueUSD;
    grouped.set(key, existing);
  }
  return grouped;
}

function marketValueInUSD(holding) {
  const rate = FX_TO_USD[holding.currency] ?? 1;
  return Number(holding.quantity) * Number(holding.lastPrice) * rate;
}

async function requestModelAdvice(profile) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      store: false,
      temperature: 0.2,
      max_output_tokens: 1600,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "你是群组持仓观察助手，只输出符合 schema 的 JSON。",
                "不要给出买入、卖出、目标价、仓位指令或个股荐股。",
                "从集中度、共识标的、市场分布、成员更新和可见性限制角度生成简短观察。",
                "如果金额被隐藏，只能说明数据可见性有限，不要推测隐藏金额。",
                "语气克制、中文、适合手机弹窗阅读。"
              ].join("\n")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(profile, null, 2)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "group_position_advice",
          strict: true,
          schema: adviceSchema
        }
      }
    })
  });

  if (!response.ok) {
    const message = await openAIErrorMessage(response);
    throw new Error(`OpenAI returned ${response.status}${message ? `: ${message}` : ""}`);
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error("OpenAI response did not contain text output.");
  }
  return JSON.parse(outputText);
}

function fallbackAdvice(profile) {
  const topPosition = profile.topPositions[0];
  const topConsensus = profile.consensus[0];
  const topMarket = profile.marketDistribution[0];
  const hiddenCopy = profile.hiddenAmountCount ? `另有 ${profile.hiddenAmountCount} 条持仓隐藏了金额，统计口径只覆盖当前可见部分。` : "";

  return {
    headline: topPosition ? "今日组合结构观察" : "等待更多持仓数据",
    summary: topPosition
      ? `当前可见持仓约 ${formatUSD(profile.totalVisibleMarketValue)}，最大可见标的是 ${topPosition.symbol}，占可见市值 ${formatPercent(topPosition.weight)}。${hiddenCopy}`
      : `当前群组还没有足够的可见持仓数据。${hiddenCopy}`,
    highlights: [
      topConsensus ? `${topConsensus.symbol} 有 ${topConsensus.holderCount} 位成员同时持有，是当前最明显的共识标的。` : "持有人数达到 2 人以上的共识标的还不多。",
      topMarket ? `${marketLabel(topMarket.market)}占可见市值 ${formatPercent(topMarket.weight)}，是当前主要市场暴露。` : "市场分布暂时无法判断。",
      `${profile.group.memberCount} 位成员中已有 ${profile.memberDistribution.filter((item) => item.holdingCount > 0).length} 位提交了可见持仓。`
    ],
    risks: [
      topPosition && topPosition.weight >= 0.3 ? `${topPosition.symbol} 占比偏高，复盘时可以重点关注单一标的集中度。` : "当前最大单一标的占比未触发高集中度提示。",
      profile.marketDistribution.length <= 1 ? "当前市场暴露较单一，跨市场分散度有限。" : "市场分布已有多元化迹象，但仍需结合成员真实风险偏好判断。",
      profile.hiddenAmountCount ? "部分成员隐藏金额会影响总览、集中度和共识强度的准确性。" : "本次观察基于当前可见数据。"
    ],
    questions: [
      "本组最想跟踪的是共识增强，还是分歧变化？",
      "Top3 标的占比变化是否需要作为每次提交后的复盘重点？",
      "是否要约定每周固定时间统一更新持仓，减少数据滞后？"
    ]
  };
}

function normalizeAdvice(advice, fallback) {
  return {
    headline: cleanText(advice.headline).slice(0, 48) || fallback.headline,
    summary: cleanText(advice.summary).slice(0, 260) || fallback.summary,
    highlights: cleanTextList(advice.highlights, fallback.highlights),
    risks: cleanTextList(advice.risks, fallback.risks),
    questions: cleanTextList(advice.questions, fallback.questions)
  };
}

function cleanTextList(items, fallback) {
  const cleaned = Array.isArray(items)
    ? items.map((item) => cleanText(item).slice(0, 120)).filter(Boolean).slice(0, 3)
    : [];
  return cleaned.length ? cleaned : fallback.slice(0, 3);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

async function openAIErrorMessage(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? "";
  } catch {
    return "";
  }
}

function formatUSD(value) {
  return `US$${Math.round(Number(value) || 0).toLocaleString("zh-CN")}`;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function marketLabel(market) {
  return {
    usStock: "美股",
    hkStock: "港股",
    cnStock: "A股",
    fund: "基金",
    crypto: "加密资产",
    cash: "现金"
  }[market] ?? market;
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundRatio(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}
