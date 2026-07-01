import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import { Avatar } from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'
import { AllocationStrip, LegendChips, DonutChart } from '../components/Visuals.jsx'
import { DONUT_COLORS } from '../utils/colors.js'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import { money, formatNumber, formatPercent, formatDateTime, signedPercentPoint } from '../utils/format.js'
import { visibleSummary, exposureRows, groupMarketRows, labelForMarket } from '../utils/finance.js'
import {
  groupHoldings,
  groupLatestSnapshotAt,
  membersWithRecentSnapshots,
  buildPortfolioInsights,
  recentSnapshotSummaries,
} from '../utils/insights.js'

export default function OverviewView({ group }) {
  const { state, actions } = useStore()
  const memberID = state.session.currentMemberID
  const data = state.data

  // 所有派生计算集中在一个 memo 里；data 引用不变（无变化的轮询）时不重算。
  const view = useMemo(() => {
    const holdings = groupHoldings(data, group.id)
    const members = group.members ?? []
    const summary = visibleSummary(holdings, memberID)
    const exposures = exposureRows(holdings, memberID)
    const consensus = exposures.filter((e) => e.holderCount > 1)
    const marketRows = groupMarketRows(holdings, memberID)
    const contributingIDs = new Set(holdings.map((h) => h.ownerID))
    const latestAt = groupLatestSnapshotAt(data, group.id)
    const snapshots = recentSnapshotSummaries(data, group.id, members, memberID).slice(0, 6)
    const totalVisible = summary.marketValue
    const consensusValue = consensus.reduce((s, e) => s + e.marketValue, 0)
    const consensusStrength = totalVisible > 0 ? consensusValue / totalVisible : 0
    const top3 = exposures.slice(0, 3)
    const top3Weight = top3.reduce((s, e) => s + (totalVisible > 0 ? e.marketValue / totalVisible : 0), 0)
    const activeMembers = membersWithRecentSnapshots(data, group.id, 24)
    const activity = members.length > 0 ? activeMembers.size / members.length : 0
    const memberInsights = members.map((member) => ({
      member,
      insights: buildPortfolioInsights(data, group.id, member.id, memberID),
    }))
    return {
      members, summary, consensus, marketRows, contributingIDs, latestAt, snapshots,
      consensusStrength, top3, top3Weight, activeMembers, activity, memberInsights,
    }
  }, [data, group, memberID])

  const {
    members, summary, consensus, marketRows, contributingIDs, latestAt, snapshots,
    consensusStrength, top3, top3Weight, activeMembers, activity, memberInsights,
  } = view

  const kpis = [
    { label: '已提交', value: `${contributingIDs.size}/${members.length || 0}` },
    { label: '可见市值', node: <AnimatedNumber value={summary.marketValue} format={(v) => money(v)} /> },
    { label: '共识标的', value: `${consensus.length}` },
    { label: '最近更新', value: latestAt ? formatDateTime(latestAt) : '等待提交' },
  ]

  return (
    <main className="content overview-layout">
      {/* 群组仪表盘 */}
      <section className="panel group-overview-panel">
        <div className="overview-heading compact">
          <div>
            <strong>{group.name}</strong>
            <p className="subtle">{group.subtitle || '共享持仓与观点'}</p>
          </div>
          <motion.button
            className="pill blue pill-button invite-button"
            whileTap={{ scale: 0.95 }}
            onClick={() => actions.copyInviteCode(group.inviteCode)}
          >
            邀请码 {group.inviteCode}
          </motion.button>
        </div>

        <div className="overview-kpi-row">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="overview-kpi"
            >
              <span>{kpi.label}</span>
              <strong>{kpi.node ?? kpi.value}</strong>
            </div>
          ))}
        </div>

        <div className="overview-signal-list">
          <SignalRow label="共识强度" detail={`${consensus.length} 个多人持有标的`} value={consensusStrength} />
          <SignalRow
            label="集中度 Top3"
            detail={top3.map((e) => e.symbol).join(' · ') || '暂无'}
            value={top3Weight}
          />
          <SignalRow label="活跃度" detail={`近 24h ${activeMembers.size}/${members.length} 位提交`} value={activity} />
        </div>

        <div className="overview-market-row">
          <span className="overview-market-label">市场分布</span>
          {marketRows.length === 0 ? (
            <div className="overview-market-chips"><span className="legend-chip">暂无可见仓位</span></div>
          ) : (
            <div className="overview-market-viz">
              <DonutChart
                slices={marketRows.slice(0, 6).map((row) => ({ market: row.market, weight: row.weight }))}
                size={104}
                thickness={15}
                centerValue={`${marketRows.length}`}
                centerLabel="市场"
              />
              <div className="overview-market-legend">
                {marketRows.slice(0, 6).map((row, i) => (
                  <span key={row.market} className="overview-market-legend-item">
                    <span className="dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="overview-market-legend-name">{labelForMarket(row.market)}</span>
                    <strong>{formatPercent(row.weight)}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 共识标的 */}
      <section className="section">
        <div className="section-header">
          <h2>共识标的</h2>
          <span className="pill">{consensus.length}</span>
        </div>
        <div className="list">
          {consensus.length === 0 ? (
            <div className="empty">暂无共识标的</div>
          ) : (
            consensus.slice(0, 8).map((e) => (
              <article
                key={`${e.symbol}|${e.currency}`}
                className="list-item exposure-card compact-exposure-card"
              >
                <div className="consensus-compact-head">
                  <div className="member-overview-line">
                    <span className="member-overview-name">
                      <span>{e.assetName || e.symbol}</span>
                    </span>
                    <strong className="member-overview-value">
                      <AnimatedNumber value={e.marketValue} format={(v) => money(v)} />
                    </strong>
                  </div>
                  <div className="member-overview-subline">
                    <span>{e.symbol} · {e.currency}</span>
                    <span>{e.holderCount} 人持有</span>
                  </div>
                </div>
                <div className="consensus-weight-list">
                  {e.holderWeights.map((hw) => {
                    const m = members.find((x) => x.id === hw.ownerID)
                    return (
                      <span key={hw.ownerID} className="consensus-weight-item">
                        <Avatar member={m} />
                        <span className="consensus-weight-name">{m?.displayName ?? '成员'}</span>
                        <strong>{formatPercent(hw.weight)}</strong>
                      </span>
                    )
                  })}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {/* 成员组合 */}
      <section className="section">
        <div className="section-header">
          <h2>成员组合</h2>
          <span className="pill">{members.length} 人</span>
        </div>
        <div className="member-overview-grid">
          {memberInsights.map(({ member, insights }) => {
            return (
              <motion.button
                key={member.id}
                className="list-item member-overview-card"
                whileTap={{ scale: 0.98 }}
                onClick={() => actions.patch({ activeTab: 'members', selectedMemberID: member.id })}
              >
                <div className="member-overview-line">
                  <span className="member-overview-name">
                    <Avatar member={member} />
                    <span>{member.displayName}</span>
                  </span>
                  <strong className="member-overview-value">
                    <AnimatedNumber value={insights.totalVisibleValue} format={(v) => money(v)} />
                  </strong>
                </div>
                <div className="member-overview-subline">
                  <span>{insights.visibleCount}/{insights.totalCount} 项</span>
                  <span>主仓 {insights.primarySymbol ?? '—'}</span>
                </div>
                <AllocationStrip slices={insights.topSlices} className="member-allocation-strip" />
                <LegendChips slices={insights.topSlices} max={3} />
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* 最近变更 */}
      <section className="section">
        <div className="section-header">
          <h2>最近变更</h2>
        </div>
        <div className="list snapshot-feed-list">
          {snapshots.length === 0 ? (
            <div className="empty">还没有成员提交持仓。</div>
          ) : (
            snapshots.map((s) => (
              <article
                key={s.snapshot.id}
                className="list-item snapshot-card snapshot-feed-card"
              >
                <div className="snapshot-card-head snapshot-feed-head">
                  <div className="account account-compact">
                    <Avatar member={s.owner} />
                    <div className="min-w-0">
                      <div className="account-name">{s.owner?.displayName || '成员'}</div>
                      <div className="member-meta">
                        {s.previousSnapshot ? '组合调仓' : '首次提交组合'} · {formatDateTime(s.snapshot.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="snapshot-meta">
                    <span className={`pill ${s.sourceTone}`}>{s.sourceLabel}</span>
                  </div>
                </div>
                {s.primaryChange && <SnapshotHighlight change={s.primaryChange} />}
                <div className="weight-summary">
                  {s.summaryChips.length ? (
                    s.summaryChips.map((chip, ci) => (
                      <span key={ci} className={`weight-chip ${chip.tone}`}>{chip.label}</span>
                    ))
                  ) : (
                    <span className="weight-chip">持股数量无变化</span>
                  )}
                </div>
                <div className="snapshot-change-list compact-change-list">
                  {s.rows.length ? (
                    s.rows.slice(0, 4).map((change) => (
                      <SnapshotChangeRow key={change.symbol} change={change} />
                    ))
                  ) : (
                    <div className="snapshot-empty">本次提交没有产生持股数量或仓位占比变化。</div>
                  )}
                </div>
                {s.note && (
                  <div className="holding-change">
                    <span>{s.note}</span>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

const CHANGE_ICONS = { new: 'plus', up: 'arrow-up', down: 'arrow-down', removed: 'minus', weight: 'adjust' }

function changeToneClass(status) {
  if (status === 'up' || status === 'new') return 'positive'
  if (status === 'down' || status === 'removed') return 'negative'
  return ''
}

function ChangeIcon({ change }) {
  return (
    <span className={`snapshot-change-icon ${changeToneClass(change.status)}`} aria-hidden="true">
      <Icon name={CHANGE_ICONS[change.status] ?? 'adjust'} size={14} />
    </span>
  )
}

function SnapshotHighlight({ change }) {
  const quantityText = quantityChangeText(change)
  return (
    <div className={`snapshot-highlight ${changeToneClass(change.status)}`}>
      <ChangeIcon change={change} />
      <div className="min-w-0">
        <div className="snapshot-highlight-label">主要变化</div>
        <div className="snapshot-highlight-title">{change.assetName || change.symbol}</div>
        <div className="snapshot-highlight-meta">
          {change.symbol} · {change.statusLabel}{quantityText ? ` · ${quantityText}` : ''}
        </div>
      </div>
      <div className="snapshot-highlight-value">
        <strong>{formatPercent(change.beforeWeight)} → {formatPercent(change.afterWeight)}</strong>
        <span>{signedPercentPoint(change.delta)}</span>
      </div>
    </div>
  )
}

function SnapshotChangeRow({ change }) {
  const quantityText = quantityChangeText(change)
  return (
    <div className="snapshot-change-row">
      <ChangeIcon change={change} />
      <div className="snapshot-change-symbol min-w-0">
        <strong>{change.assetName || change.symbol}</strong>
        <span>{change.symbol} · {change.statusLabel}{quantityText ? ` · ${quantityText}` : ''}</span>
      </div>
      <div className={`snapshot-change-values ${changeToneClass(change.status)}`}>
        <strong>{formatPercent(change.beforeWeight)} → {formatPercent(change.afterWeight)}</strong>
        <span>{signedPercentPoint(change.delta)}</span>
      </div>
    </div>
  )
}

function quantityChangeText(change) {
  if (change.status === 'weight') return ''
  const before = Number(change.beforeQuantity)
  const after = Number(change.afterQuantity)
  if (!Number.isFinite(before) || !Number.isFinite(after)) return ''
  if (change.status === 'new') return `数量 ${formatNumber(after)}`
  if (change.status === 'removed') return `原 ${formatNumber(before)}`
  return `${formatNumber(before)} → ${formatNumber(after)}`
}

function SignalRow({ label, detail, value = 0 }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="overview-signal-row">
      <div className="overview-signal-top">
        <div className="min-w-0">
          <div className="overview-signal-label">{label}</div>
          <div className="overview-signal-detail">{detail}</div>
        </div>
        <strong className="overview-signal-value">
          <AnimatedNumber value={value} format={formatPercent} />
        </strong>
      </div>
      <div className="overview-signal-track">
        <motion.div
          className="overview-signal-fill"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  )
}
