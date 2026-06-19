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
    members: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          healthLabel: { type: "string" },
          healthScore: { type: "integer" },
          health: { type: "string" },
          strategy: { type: "string" }
        },
        required: ["name", "healthLabel", "healthScore", "health", "strategy"]
      }
    }
  },
  required: ["headline", "summary", "members"]
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
    memberProfiles: buildMemberProfiles(group, rows, memberByID),
    sampleHoldings: rows.slice(0, 40)
  };
}

function buildMemberProfiles(group, rows, memberByID) {
  return (group.members ?? []).map((member) => {
    const memberRows = rows.filter((row) => row.ownerID === member.id);
    const valued = memberRows.filter((row) => Number.isFinite(row.marketValueUSD));
    const totalValue = valued.reduce((sum, row) => sum + row.marketValueUSD, 0);
    const totalCost = valued.reduce((sum, row) => sum + (Number.isFinite(row.costBasisUSD) ? row.costBasisUSD : 0), 0);
    const hasCost = valued.some((row) => Number.isFinite(row.costBasisUSD));
    const pnlUSD = hasCost ? totalValue - totalCost : null;
    const positions = valued
      .slice()
      .sort((a, b) => b.marketValueUSD - a.marketValueUSD)
      .slice(0, 6)
      .map((row) => ({
        symbol: row.symbol,
        assetName: row.assetName,
        market: row.market,
        weight: totalValue ? roundRatio(row.marketValueUSD / totalValue) : 0,
        marketValueUSD: round(row.marketValueUSD),
        pnlPercent:
          Number.isFinite(row.costBasisUSD) && row.costBasisUSD > 0
            ? roundRatio((row.marketValueUSD - row.costBasisUSD) / row.costBasisUSD)
            : null
      }));
    const top = positions[0];
    return {
      name: member.displayName,
      holdingCount: memberRows.length,
      totalMarketValueUSD: round(totalValue),
      totalPnlUSD: pnlUSD === null ? null : round(pnlUSD),
      totalPnlPercent: pnlUSD !== null && totalCost > 0 ? roundRatio(pnlUSD / totalCost) : null,
      topWeight: top ? top.weight : 0,
      positions
    };
  });
}

function adviceHoldingRow(holding, requesterID, memberByID) {
  const member = memberByID.get(holding.ownerID);
  if (!member) {
    return null;
  }

  const canSeeAmount = holding.ownerID === requesterID || holding.visibility !== "symbolOnly";
  const marketValueUSD = canSeeAmount ? marketValueInUSD(holding) : null;
  const costBasisUSD =
    canSeeAmount && holding.averageCost !== null && Number.isFinite(Number(holding.averageCost))
      ? costBasisInUSD(holding)
      : null;
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
    costBasisUSD: Number.isFinite(costBasisUSD) ? round(costBasisUSD) : null,
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

function costBasisInUSD(holding) {
  const rate = FX_TO_USD[holding.currency] ?? 1;
  return Number(holding.quantity) * Number(holding.averageCost) * rate;
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
                "你是群组持仓健康度顾问，只输出符合 schema 的 JSON，全部使用中文。",
                "headline 一句话概括整组的整体状态；summary 用2-3句概述全组的集中度、共识与风险。",
                "members 数组必须为输入 memberProfiles 中的每一位成员各生成一项，name 与输入完全一致。",
                "每位成员：healthLabel 用简短中文标签（如“稳健”“偏激进”“高集中”“分散均衡”“数据不足”）；healthScore 为 0-100 的整数健康分（越高越健康，集中度过高/单一市场/大幅浮亏应扣分）。",
                "health 字段：结合该成员的持仓集中度、市场分布、盈亏(pnlPercent/totalPnlPercent)用1-2句评估其持仓健康程度。",
                "strategy 字段：结合当前股价表现与盈亏，给出该成员下一步可考虑的调整方向(如分散集中仓位、关注浮亏标的、再平衡市场暴露等)，1-2句，措辞为“可考虑/建议关注”，不要给出明确买卖点位或荐股。",
                "如果某成员金额被隐藏或无持仓，healthLabel 用“数据不足”，并说明可见数据有限。",
                "语气克制、专业、适合手机阅读。"
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
  const hiddenCopy = profile.hiddenAmountCount ? `另有 ${profile.hiddenAmountCount} 条持仓隐藏了金额，统计口径只覆盖当前可见部分。` : "";

  return {
    headline: topPosition ? "组合健康度速览" : "等待更多持仓数据",
    summary: topPosition
      ? `当前可见持仓约 ${formatUSD(profile.totalVisibleMarketValue)}，最大可见标的是 ${topPosition.symbol}，占可见市值 ${formatPercent(topPosition.weight)}。${hiddenCopy}`
      : `当前群组还没有足够的可见持仓数据。${hiddenCopy}`,
    members: (profile.memberProfiles ?? []).map((member) => fallbackMemberAdvice(member))
  };
}

function fallbackMemberAdvice(member) {
  if (!member.holdingCount) {
    return {
      name: member.name,
      healthLabel: "数据不足",
      healthScore: 0,
      health: "还没有提交可见持仓，暂时无法评估健康程度。",
      strategy: "可考虑先提交一次持仓快照，便于后续跟踪与复盘。"
    };
  }

  const top = member.positions[0];
  const concentrated = member.topWeight >= 0.4;
  const pnl = member.totalPnlPercent;
  const healthScore = Math.max(
    10,
    Math.min(95, Math.round(72 - (concentrated ? 22 : 0) + (pnl ? Math.max(-20, Math.min(15, pnl * 100)) : 0)))
  );
  const healthLabel = concentrated ? "偏集中" : member.positions.length >= 4 ? "分散均衡" : "稳健";
  const pnlCopy = pnl === null ? "盈亏数据未公开" : pnl >= 0 ? `整体浮盈约 ${formatPercent(pnl)}` : `整体浮亏约 ${formatPercent(Math.abs(pnl))}`;

  return {
    name: member.name,
    healthLabel,
    healthScore,
    health: `共 ${member.holdingCount} 个可见标的，最大单一仓位${top ? `（${top.symbol}）` : ""}约占 ${formatPercent(member.topWeight)}，${pnlCopy}。`,
    strategy: concentrated
      ? "单一标的占比偏高，可考虑分散集中仓位、关注与之相关的市场风险。"
      : "结构相对均衡，可结合各标的盈亏与股价表现做定期再平衡。"
  };
}

function normalizeAdvice(advice, fallback) {
  const members = Array.isArray(advice.members)
    ? advice.members
        .map((member) => ({
          name: cleanText(member.name).slice(0, 40),
          healthLabel: cleanText(member.healthLabel).slice(0, 12) || "观察中",
          healthScore: clampScore(member.healthScore),
          health: cleanText(member.health).slice(0, 200),
          strategy: cleanText(member.strategy).slice(0, 200)
        }))
        .filter((member) => member.name)
    : [];
  return {
    headline: cleanText(advice.headline).slice(0, 48) || fallback.headline,
    summary: cleanText(advice.summary).slice(0, 260) || fallback.summary,
    members: members.length ? members : fallback.members
  };
}

function clampScore(value) {
  const num = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(100, num));
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
