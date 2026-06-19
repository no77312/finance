// 组合洞察计算，移植/简化自原 app.js buildPortfolioInsights 及相关。
import {
  holdingMarketValueUSD,
  holdingCostBasisUSD,
  canSeeValues,
  canSeeCost,
  convertMoneyToUSD,
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

// ---- 快照变更（最近变更板块）。移植自原 app.js ----

function canSeeSnapshotValues(snapshot, holding, currentMemberID) {
  return snapshot.ownerID === currentMemberID || holding.visibility !== 'symbolOnly'
}

function snapshotHoldingMarketValueUSD(holding) {
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.lastPrice), holding.currency)
}

function snapshotPortfolioContext(snapshot, currentMemberID) {
  const visibleHoldings = (snapshot.holdings ?? []).filter((h) =>
    canSeeSnapshotValues(snapshot, h, currentMemberID),
  )
  const totalVisibleValue = visibleHoldings.reduce((sum, h) => sum + snapshotHoldingMarketValueUSD(h), 0)
  const rowsBySymbol = new Map()

  for (const holding of visibleHoldings) {
    const marketValue = snapshotHoldingMarketValueUSD(holding)
    const weight = totalVisibleValue > 0 ? marketValue / totalVisibleValue : 0
    const row = rowsBySymbol.get(holding.symbol) ?? {
      symbol: holding.symbol,
      assetName: holding.assetName,
      marketValue: 0,
      weight: 0,
    }
    row.marketValue += marketValue
    row.weight += weight
    rowsBySymbol.set(holding.symbol, row)
  }

  return { totalVisibleValue, rows: Array.from(rowsBySymbol.values()) }
}

function previousSnapshotFor(data, snapshot) {
  const snapshots = portfolioSnapshotsFor(data, snapshot.groupID, snapshot.ownerID)
  const index = snapshots.findIndex((c) => c.id === snapshot.id)
  return index > 0 ? snapshots[index - 1] : null
}

const STATUS_LABELS = { new: '新进', removed: '移除', up: '加仓', down: '减仓' }

function snapshotChangeRows(currentContext, previousContext) {
  const currentRows = new Map(currentContext.rows.map((r) => [r.symbol, r]))
  const previousRows = new Map(previousContext.rows.map((r) => [r.symbol, r]))
  const symbols = new Set([...currentRows.keys(), ...previousRows.keys()])
  const changes = []

  for (const symbol of symbols) {
    const current = currentRows.get(symbol) ?? null
    const previous = previousRows.get(symbol) ?? null
    const beforeWeight = previous?.weight ?? 0
    const afterWeight = current?.weight ?? 0
    const delta = afterWeight - beforeWeight
    if (Math.abs(delta) < 0.001) continue

    const status =
      beforeWeight === 0 ? 'new' : afterWeight === 0 ? 'removed' : delta > 0 ? 'up' : 'down'

    changes.push({
      symbol,
      assetName: current?.assetName || previous?.assetName || symbol,
      beforeWeight,
      afterWeight,
      delta,
      status,
      statusLabel: STATUS_LABELS[status] ?? '调整',
    })
  }

  return changes.sort((a, b) => {
    const gap = Math.abs(b.delta) - Math.abs(a.delta)
    if (Math.abs(gap) > 0.0001) return gap
    return b.afterWeight - a.afterWeight
  })
}

function countSnapshotStatuses(changes) {
  return changes.reduce((counts, change) => {
    counts[change.status] = (counts[change.status] ?? 0) + 1
    return counts
  }, {})
}

function snapshotSummaryChips(counts) {
  const chips = []
  if (counts.new) chips.push({ label: `新进 ${counts.new}`, tone: 'positive' })
  if (counts.up) chips.push({ label: `加仓 ${counts.up}`, tone: 'positive' })
  if (counts.down) chips.push({ label: `减仓 ${counts.down}`, tone: 'negative' })
  if (counts.removed) chips.push({ label: `移除 ${counts.removed}`, tone: 'negative' })
  return chips
}

function snapshotSummary(data, snapshot, members, currentMemberID) {
  const owner = members.find((m) => m.id === snapshot.ownerID) ?? null
  const previousSnapshot = previousSnapshotFor(data, snapshot)
  const currentContext = snapshotPortfolioContext(snapshot, currentMemberID)
  const currentRows = [...currentContext.rows].sort((a, b) => b.weight - a.weight)
  const hiddenCount = Math.max(0, (snapshot.holdings?.length ?? 0) - currentRows.length)
  const sourceLabel =
    snapshot.source === 'screenshot' ? '截图导入' : snapshot.source === 'manual' ? '手工提交' : '历史快照'
  const sourceTone = snapshot.source === 'screenshot' ? 'blue' : ''

  if (!previousSnapshot) {
    return {
      snapshot,
      owner,
      previousSnapshot: null,
      rows: currentRows.slice(0, 4).map((row) => ({
        ...row,
        beforeWeight: 0,
        afterWeight: row.weight,
        delta: row.weight,
        status: 'new',
        statusLabel: '首次出现',
      })),
      primaryChange: currentRows[0]
        ? {
            ...currentRows[0],
            beforeWeight: 0,
            afterWeight: currentRows[0].weight,
            delta: currentRows[0].weight,
            status: 'new',
            statusLabel: '首次出现',
          }
        : null,
      summaryChips: [{ label: `${currentRows.length} 项公开仓位`, tone: '' }],
      note: hiddenCount > 0 ? `另有 ${hiddenCount} 项仅公开标的，未纳入仓位占比。` : '',
      sourceLabel,
      sourceTone,
    }
  }

  const previousContext = snapshotPortfolioContext(previousSnapshot, currentMemberID)
  const changes = snapshotChangeRows(currentContext, previousContext)
  const counts = countSnapshotStatuses(changes)

  return {
    snapshot,
    owner,
    previousSnapshot,
    rows: changes.slice(0, 5),
    primaryChange: changes[0] ?? null,
    summaryChips: snapshotSummaryChips(counts),
    note: hiddenCount > 0 ? `本次有 ${hiddenCount} 项仅公开标的，未纳入仓位占比变化。` : '',
    sourceLabel,
    sourceTone,
  }
}

export function recentSnapshotSummaries(data, groupID, members, currentMemberID) {
  return groupSnapshots(data, groupID)
    .map((snapshot) => snapshotSummary(data, snapshot, members, currentMemberID))
    .filter(Boolean)
}
