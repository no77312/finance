// 组合洞察计算，移植/简化自原 app.js buildPortfolioInsights 及相关。
import {
  holdingMarketValueUSD,
  holdingCostBasisUSD,
  canSeeValues,
  canSeeCost,
} from './finance.js'

export function groupHoldings(data, groupID) {
  return (data?.holdings ?? [])
    .filter((h) => h.groupID === groupID)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export function memberHoldings(data, groupID, ownerID) {
  return groupHoldings(data, groupID).filter((h) => h.ownerID === ownerID)
}

export function portfolioSnapshotsFor(data, groupID, ownerID) {
  return (data?.portfolioSnapshots ?? [])
    .filter((s) => s.groupID === groupID && s.ownerID === ownerID)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export function groupSnapshots(data, groupID) {
  return (data?.portfolioSnapshots ?? [])
    .filter((s) => s.groupID === groupID)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function groupLatestSnapshotAt(data, groupID) {
  const snaps = groupSnapshots(data, groupID)
  return snaps[0]?.createdAt ?? null
}

export function membersWithRecentSnapshots(data, groupID, hours = 24) {
  const cutoff = Date.now() - hours * 3600 * 1000
  const ids = new Set()
  for (const s of data?.portfolioSnapshots ?? []) {
    if (s.groupID === groupID && new Date(s.createdAt).getTime() >= cutoff) {
      ids.add(s.ownerID)
    }
  }
  return ids
}

// 单成员组合洞察
export function buildPortfolioInsights(data, groupID, ownerID, currentMemberID) {
  const holdings = memberHoldings(data, groupID, ownerID)
  const visible = holdings.filter((h) => canSeeValues(h, currentMemberID))
  const totalVisibleValue = visible.reduce((sum, h) => sum + holdingMarketValueUSD(h), 0)

  const sortedHoldings = [...holdings].sort(
    (a, b) => holdingMarketValueUSD(b) - holdingMarketValueUSD(a),
  )

  const slices = visible
    .map((h) => ({
      symbol: h.symbol,
      value: holdingMarketValueUSD(h),
      weight: totalVisibleValue > 0 ? holdingMarketValueUSD(h) / totalVisibleValue : 0,
    }))
    .sort((a, b) => b.value - a.value)

  const topSlices = slices.slice(0, 6)
  const maxWeight = slices[0]?.weight ?? 0
  const top3Weight = slices.slice(0, 3).reduce((s, x) => s + x.weight, 0)

  const snaps = portfolioSnapshotsFor(data, groupID, ownerID)
  const latest = snaps[snaps.length - 1] ?? null
  const previous = snaps[snaps.length - 2] ?? null

  let pnl = 0
  for (const h of holdings) {
    if (canSeeCost(h, currentMemberID)) {
      pnl += holdingMarketValueUSD(h) - holdingCostBasisUSD(h)
    }
  }

  return {
    holdings: sortedHoldings,
    totalCount: holdings.length,
    visibleCount: visible.length,
    hiddenCount: holdings.length - visible.length,
    totalVisibleValue,
    maxWeight,
    top3Weight,
    pnl,
    topSlices,
    latestSnapshotAt: latest?.createdAt ?? null,
    previousSnapshotAt: previous?.createdAt ?? null,
    primarySymbol: slices[0]?.symbol ?? null,
  }
}

export function isCurrentUserGroupOwner(group, currentMemberID) {
  const member = group?.members?.find((m) => m.id === currentMemberID)
  return member?.role === 'owner' || group?.members?.[0]?.id === currentMemberID
}
