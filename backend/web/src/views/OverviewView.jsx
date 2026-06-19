import { motion } from 'framer-motion'
import { useStore } from '../store/StoreContext.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { AllocationStrip, CompactProgress, LegendChips } from '../components/Visuals.jsx'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import { money, formatPercent, formatDateTime } from '../utils/format.js'
import { visibleSummary, exposureRows, groupMarketRows, labelForMarket } from '../utils/finance.js'
import {
  groupHoldings,
  groupLatestSnapshotAt,
  membersWithRecentSnapshots,
  buildPortfolioInsights,
} from '../utils/insights.js'

const fadeUp = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
}

export default function OverviewView({ group }) {
  const { state, actions } = useStore()
  const memberID = state.session.currentMemberID
  const data = state.data
  const holdings = groupHoldings(data, group.id)
  const members = group.members ?? []

  const summary = visibleSummary(holdings, memberID)
  const exposures = exposureRows(holdings, memberID)
  const consensus = exposures.filter((e) => e.holderCount > 1)
  const marketRows = groupMarketRows(holdings, memberID)
  const contributingIDs = new Set(holdings.map((h) => h.ownerID))
  const latestAt = groupLatestSnapshotAt(data, group.id)

  // 信号行
  const totalVisible = summary.marketValue
  const consensusValue = consensus.reduce((s, e) => s + e.marketValue, 0)
  const consensusStrength = totalVisible > 0 ? consensusValue / totalVisible : 0
  const top3 = exposures.slice(0, 3)
  const top3Weight = top3.reduce((s, e) => s + (totalVisible > 0 ? e.marketValue / totalVisible : 0), 0)
  const activeMembers = membersWithRecentSnapshots(data, group.id, 24)
  const activity = members.length > 0 ? activeMembers.size / members.length : 0

  const kpis = [
    { label: '已提交', value: `${contributingIDs.size}/${members.length || 0}` },
    { label: '可见市值', node: <AnimatedNumber value={summary.marketValue} format={(v) => money(v)} /> },
    { label: '共识标的', value: `${consensus.length}` },
    { label: '最近更新', value: latestAt ? formatDateTime(latestAt) : '等待提交' },
  ]

  return (
    <main className="content overview-layout">
      {/* 群组仪表盘 */}
      <motion.section className="panel group-overview-panel" {...fadeUp} transition={{ type: 'spring', stiffness: 240, damping: 26 }}>
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
          {kpis.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              className="overview-kpi"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 300, damping: 26 }}
            >
              <span>{kpi.label}</span>
              <strong>{kpi.node ?? kpi.value}</strong>
            </motion.div>
          ))}
        </div>

        <div className="overview-signal-list">
          <SignalRow label="共识强度" detail={`${consensus.length} 个多人持有标的`} value={formatPercent(consensusStrength)} progress={consensusStrength} />
          <SignalRow
            label="集中度 Top3"
            detail={top3.map((e) => e.symbol).join(' · ') || '暂无'}
            value={formatPercent(top3Weight)}
            segments={exposures.slice(0, 6).map((e) => ({ symbol: e.symbol, weight: totalVisible > 0 ? e.marketValue / totalVisible : 0 }))}
          />
          <SignalRow label="活跃度" detail={`近 24h ${activeMembers.size}/${members.length} 位提交`} value={`${activeMembers.size}/${members.length}`} progress={activity} />
        </div>

        <div className="overview-market-row">
          <span className="overview-market-label">市场分布</span>
          <div className="overview-market-chips">
            {marketRows.length === 0 ? (
              <span className="legend-chip">暂无可见仓位</span>
            ) : (
              marketRows.slice(0, 4).map((row, i) => (
                <span key={row.market} className={`legend-chip tone-${i % 6}`}>
                  {labelForMarket(row.market)} · {formatPercent(row.weight)}
                </span>
              ))
            )}
          </div>
        </div>
      </motion.section>

      {/* 共识标的 */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>共识标的</h2>
            <p className="subtle">只展示 2 位及以上成员同时持有的标的</p>
          </div>
          <span className="pill">{consensus.length}</span>
        </div>
        <div className="list">
          {consensus.length === 0 ? (
            <div className="empty">暂无共识标的</div>
          ) : (
            consensus.slice(0, 8).map((e, i) => (
              <motion.article
                key={`${e.symbol}|${e.currency}`}
                className="list-item exposure-card compact-exposure-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 28 }}
                whileHover={{ y: -2 }}
              >
                <div className="consensus-compact-head">
                  <strong className="holding-title">{e.assetName || e.symbol}</strong>
                  <div className="holding-meta">
                    <span>{e.symbol}</span>
                    <span>{e.holderCount} 人持有</span>
                    <span>{e.currency}</span>
                    <span>{money(e.marketValue)}</span>
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
              </motion.article>
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
          {members.map((member, i) => {
            const insights = buildPortfolioInsights(data, group.id, member.id, memberID)
            return (
              <motion.button
                key={member.id}
                className="list-item member-overview-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 28 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => actions.patch({ activeTab: 'members', selectedMemberID: member.id })}
              >
                <div className="member-overview-line">
                  <span className="member-overview-name">
                    <Avatar member={member} />
                    <span>{member.displayName}</span>
                  </span>
                  <strong className="member-overview-value">{money(insights.totalVisibleValue)}</strong>
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
    </main>
  )
}

function SignalRow({ label, detail, value, progress, segments }) {
  return (
    <div className="overview-signal-row">
      <div className="min-w-0">
        <div className="overview-signal-label">{label}</div>
        <div className="overview-signal-detail">{detail}</div>
      </div>
      <div className="overview-signal-visual">
        <strong className="overview-signal-value">{value}</strong>
        {segments ? <AllocationStrip slices={segments} className="overview-signal-strip" /> : <CompactProgress value={progress} />}
      </div>
    </div>
  )
}
