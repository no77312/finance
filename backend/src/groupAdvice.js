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
      ...normalizeAdvice(modelAdvice, fallbackAdvice(profile), profile),
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

    // 结构指标：基于全部可见持仓（不只 top 6）。
    const weights = totalValue > 0 ? valued.map((row) => row.marketValueUSD / totalValue) : [];
    const hhi = weights.reduce((sum, weight) => sum + weight * weight, 0); // 赫芬达尔指数
    const effectiveHoldings = hhi > 0 ? 1 / hhi : 0;                        // 有效持仓数 = 1/HHI
    const marketCount = new Set(valued.map((row) => row.market)).size;
    const topWeight = weights.length ? Math.max(...weights) : 0;
    const structural = computeStructuralHealth({
      valuedCount: valued.length,
      topWeight,
      effectiveHoldings,
      marketCount
    });

    return {
      name: member.displayName,
      holdingCount: memberRows.length,
      valuedCount: valued.length,
      totalMarketValueUSD: round(totalValue),
      totalPnlUSD: pnlUSD === null ? null : round(pnlUSD),
      totalPnlPercent: pnlUSD !== null && totalCost > 0 ? roundRatio(pnlUSD / totalCost) : null,
      topWeight: roundRatio(topWeight),
      marketCount,
      effectiveHoldings: Math.round(effectiveHoldings * 100) / 100,
      structuralScore: structural.score,
      structuralLabel: structural.label,
      positions
    };
  });
}

// 纯结构健康分：只看集中度、分散度、市场分布，与浮盈亏无关，不随每日涨跌波动。
function computeStructuralHealth({ valuedCount, topWeight, effectiveHoldings, marketCount }) {
  if (!valuedCount) {
    return { score: 0, label: "数据不足" };
  }
  const concentration = clampRatio((topWeight - 0.2) / 0.6); // 最大仓位 <=20%→0，>=80%→1
  const breadth = clampRatio((effectiveHoldings - 1) / 5);   // 有效持仓 1只→0，>=6只→1
  const marketSpread = clampRatio((marketCount - 1) / 2);    // 单市场→0，>=3市场→1
  const raw = 55 + breadth * 25 + marketSpread * 10 - concentration * 35;
  const score = Math.max(5, Math.min(98, Math.round(raw)));
  return { score, label: structuralLabelForScore(score) };
}

function structuralLabelForScore(score) {
  if (score >= 80) return "分散均衡";
  if (score >= 62) return "稳健";
  if (score >= 42) return "略集中";
  return "高集中";
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
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
                "健康分只反映组合结构（集中度、分散程度、市场分布），与浮盈亏无关。每位成员的 healthScore、healthLabel 后端会用确定性的结构分覆盖，你照常填写即可（可参考输入里的 structuralScore / structuralLabel），把精力放在 health 与 strategy 的文字上。",
                "health 字段：用1-2句点评该成员的集中度与市场分布是否稳健，并客观陈述一句当前浮盈亏(pnlPercent/totalPnlPercent)，但不要用浮盈亏高低判断健康与否。",
                "strategy 字段：结合集中度与市场分布，给出下一步可考虑的方向(如适度分散、跨市场配置、定期再平衡)，1-2句，措辞为“可考虑/建议关注”，不要给出买卖点位或荐股。",
                "如果某成员无可见持仓或金额被隐藏，healthLabel 用“数据不足”，并说明可见数据有限。",
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

  if (!member.valuedCount) {
    return {
      name: member.name,
      healthLabel: "数据不足",
      healthScore: 0,
      health: `共 ${member.holdingCount} 个标的，但金额未公开，暂时无法评估结构健康度。`,
      strategy: "可在可见范围内多分享一些持仓信息，便于群内交流。"
    };
  }

  const top = member.positions[0];
  const pnl = member.totalPnlPercent;
  const pnlCopy = pnl === null ? "盈亏数据未公开" : pnl >= 0 ? `整体浮盈约 ${formatPercent(pnl)}` : `整体浮亏约 ${formatPercent(Math.abs(pnl))}`;

  return {
    name: member.name,
    healthLabel: member.structuralLabel,
    healthScore: member.structuralScore,
    health: `共 ${member.valuedCount} 个可见标的、覆盖 ${member.marketCount} 个市场，最大单一仓位${top ? `（${top.symbol}）` : ""}约占 ${formatPercent(member.topWeight)}。${pnlCopy}。`,
    strategy: strategyForStructure(member)
  };
}

function strategyForStructure(member) {
  if (member.topWeight >= 0.5) {
    return "单一标的占比偏高，可考虑适度分散、降低集中风险。";
  }
  if ((member.marketCount ?? 1) <= 1) {
    return "集中在单一市场，可考虑跨市场配置以平滑波动。";
  }
  if (member.structuralScore >= 80) {
    return "结构较为分散均衡，可定期再平衡并结合各标的复盘。";
  }
  return "结构尚可，可留意最大仓位占比与市场集中度的变化。";
}

function normalizeAdvice(advice, fallback, profile) {
  const profileByName = new Map((profile?.memberProfiles ?? []).map((member) => [member.name, member]));
  const members = Array.isArray(advice.members)
    ? advice.members
        .map((member) => {
          const name = cleanText(member.name).slice(0, 40);
          const matched = profileByName.get(name);
          // 结构分与标签以后端确定性计算为准，模型只负责 health / strategy 文字。
          return {
            name,
            healthLabel: matched ? matched.structuralLabel : (cleanText(member.healthLabel).slice(0, 12) || "观察中"),
            healthScore: matched ? matched.structuralScore : clampScore(member.healthScore),
            health: cleanText(member.health).slice(0, 200),
            strategy: cleanText(member.strategy).slice(0, 200)
          };
        })
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
