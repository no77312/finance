import { AnimatePresence, motion } from 'framer-motion'
import HoldingCard from './HoldingCard.jsx'
import { AllocationStrip, LegendChips } from './Visuals.jsx'
import AnimatedNumber from './AnimatedNumber.jsx'
import { Avatar } from './Avatar.jsx'
import { money, formatPercent, formatDateTime } from '../utils/format.js'
import { holdingMarketValueUSD } from '../utils/finance.js'

// 成员页/我的页共用的组合区块
export default function PortfolioSection({
  title,
  insights,
  owner,
  currentMemberID,
  editable,
  resetKey,
  onAddHolding,
  onEdit,
  onDelete,
}) {
  return (
    <section className="section">
      <div className="section-header">
        <h2>{title}</h2>
        {editable ? (
          <motion.button className="primary-button compact-button" whileTap={{ scale: 0.97 }} onClick={onAddHolding}>
            提交持仓
          </motion.button>
        ) : (
          <span className="pill">{insights.totalCount} 项</span>
        )}
      </div>

      <motion.div
        className="panel portfolio-summary"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        {owner && (
          <div className="portfolio-owner-row">
            <div className="member-overview-name">
              <Avatar member={owner} />
              <span>{owner.displayName}</span>
            </div>
            <strong className="member-overview-value">
              <AnimatedNumber value={insights.totalVisibleValue} format={(v) => money(v)} />
            </strong>
          </div>
        )}

        <div className="portfolio-focus">
          <div className="min-w-0">
            <div className="portfolio-focus-label">主仓位</div>
            <div className="portfolio-focus-title">
              {insights.primarySymbol ?? '—'} · {formatPercent(insights.maxWeight)}
            </div>
          </div>
        </div>

        <AllocationStrip slices={insights.topSlices} />
        <LegendChips slices={insights.topSlices} />

        <div className="portfolio-stat-grid portfolio-stat-grid-compact">
          <SummaryStat label="公开持仓" value={`${insights.visibleCount}/${insights.totalCount}`} />
          <SummaryStat label="前三集中" value={formatPercent(insights.top3Weight)} />
          <SummaryStat label="最近更新" value={insights.latestSnapshotAt ? formatDateTime(insights.latestSnapshotAt) : '—'} />
        </div>
      </motion.div>

      <div className="list" key={resetKey}>
        <AnimatePresence mode="popLayout" initial={false}>
          {insights.holdings.length === 0 ? (
            <motion.div key="empty" className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              还没有持仓
            </motion.div>
          ) : (
            insights.holdings.map((holding, index) => {
              const mv = holdingMarketValueUSD(holding)
              const weight = insights.totalVisibleValue > 0 ? mv / insights.totalVisibleValue : 0
              return (
                <HoldingCard
                  key={holding.id}
                  holding={holding}
                  currentMemberID={currentMemberID}
                  weight={weight}
                  toneIndex={index}
                  editable={editable}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )
            })
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="portfolio-stat">
      <div className="portfolio-stat-label">{label}</div>
      <div className="portfolio-stat-value">{value}</div>
    </div>
  )
}
