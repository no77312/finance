// 货币换算 + 持仓相关纯计算。移植自原 app.js。

export const fxRatesToUSD = {
  USD: 1,
  HKD: 0.1282,
  CNY: 0.1392,
  SGD: 0.7421,
}

export function fxRateToUSD(currency) {
  return fxRatesToUSD[currency] ?? 1
}

export function convertMoneyToUSD(value, currency = 'USD') {
  const number = Number(value) * fxRateToUSD(currency)
  return Number.isFinite(number) ? number : 0
}

export function holdingMarketValueUSD(holding) {
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.lastPrice), holding.currency)
}

export function holdingCostBasisUSD(holding) {
  if (holding.averageCost === null || holding.averageCost === undefined || holding.averageCost === '') {
    return 0
  }
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.averageCost), holding.currency)
}

export function snapshotHoldingMarketValueUSD(holding) {
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.lastPrice), holding.currency)
}

export function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function roundNumber(value, precision = 6) {
  const factor = 10 ** precision
  return Math.round(Number(value) * factor) / factor
}

export function sumNumbers(values) {
  return values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0)
}

// 可见性判定，需要传入当前用户 ID
export function isMine(holding, currentMemberID) {
  return holding.ownerID === currentMemberID
}

export function canSeeValues(holding, currentMemberID) {
  return isMine(holding, currentMemberID) || holding.visibility !== 'symbolOnly'
}

export function canSeeCost(holding, currentMemberID) {
  const visible = isMine(holding, currentMemberID) || holding.visibility === 'full'
  return visible && holding.averageCost !== null && holding.averageCost !== undefined && holding.averageCost !== ''
}

// 可见市值/盈亏汇总
export function visibleSummary(holdings, currentMemberID) {
  let marketValue = 0
  let pnl = 0
  for (const holding of holdings) {
    if (!canSeeValues(holding, currentMemberID)) continue
    const mv = holdingMarketValueUSD(holding)
    marketValue += mv
    if (canSeeCost(holding, currentMemberID)) {
      pnl += mv - holdingCostBasisUSD(holding)
    }
  }
  return { marketValue, pnl }
}

// 共识标的：按 symbol|currency 聚合
export function exposureRows(holdings, currentMemberID) {
  const map = new Map()
  for (const holding of holdings) {
    if (!canSeeValues(holding, currentMemberID)) continue
    const key = `${holding.symbol}|${holding.currency}`
    const mv = holdingMarketValueUSD(holding)
    const cost = canSeeCost(holding, currentMemberID) ? holdingCostBasisUSD(holding) : 0
    const existing = map.get(key) ?? {
      symbol: holding.symbol,
      assetName: holding.assetName,
      market: holding.market,
      currency: holding.currency,
      quantity: 0,
      marketValue: 0,
      costBasis: 0,
      holderIDs: new Set(),
      holderValues: new Map(),
    }
    existing.quantity += Number(holding.quantity)
    existing.marketValue += mv
    existing.costBasis += cost
    existing.holderIDs.add(holding.ownerID)
    existing.holderValues.set(holding.ownerID, (existing.holderValues.get(holding.ownerID) ?? 0) + mv)
    map.set(key, existing)
  }

  return Array.from(map.values())
    .map((row) => {
      const holderWeights = Array.from(row.holderValues.entries())
        .map(([ownerID, value]) => ({
          ownerID,
          value,
          weight: row.marketValue > 0 ? value / row.marketValue : 0,
        }))
        .sort((a, b) => b.value - a.value)
      return {
        ...row,
        holderWeights,
        holderCount: row.holderIDs.size,
        pnl: row.marketValue - row.costBasis,
      }
    })
    .sort((a, b) => b.marketValue - a.marketValue)
}

export function labelForMarket(market) {
  const map = {
    usStock: '美股',
    hkStock: '港股',
    aShare: 'A股',
    fund: '基金/ETF',
    crypto: '加密货币',
    cash: '现金',
  }
  return map[market] ?? market
}

// 市场分布
export function groupMarketRows(holdings, currentMemberID) {
  const map = new Map()
  let total = 0
  for (const holding of holdings) {
    if (!canSeeValues(holding, currentMemberID)) continue
    const mv = holdingMarketValueUSD(holding)
    map.set(holding.market, (map.get(holding.market) ?? 0) + mv)
    total += mv
  }
  return Array.from(map.entries())
    .map(([market, value]) => ({ market, value, weight: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value)
}

export const markets = [
  { value: 'usStock', label: '美股' },
  { value: 'hkStock', label: '港股' },
  { value: 'aShare', label: 'A股' },
  { value: 'fund', label: '基金/ETF' },
  { value: 'crypto', label: '加密货币' },
  { value: 'cash', label: '现金' },
]

export const currencies = [
  { value: 'USD', label: '美元 USD' },
  { value: 'HKD', label: '港元 HKD' },
  { value: 'CNY', label: '人民币 CNY' },
  { value: 'SGD', label: '新元 SGD' },
]

export const visibilities = [
  { value: 'full', label: '完整可见' },
  { value: 'amountOnly', label: '隐藏成本' },
  { value: 'symbolOnly', label: '仅标的' },
]
