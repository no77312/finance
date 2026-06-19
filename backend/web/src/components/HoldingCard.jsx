import { motion } from 'framer-motion'
import Icon from './Icon.jsx'
import { WeightBar } from './Visuals.jsx'
import { money, formatNumber, signedMoney, formatPercent, classForNumber } from '../utils/format.js'
import {
  holdingMarketValueUSD,
  holdingCostBasisUSD,
  canSeeValues,
  canSeeCost,
  labelForMarket,
} from '../utils/finance.js'

// 单个持仓卡片，保留列表布局动画，避免切页时逐卡上浮。
export default function HoldingCard({ holding, currentMemberID, weight, toneIndex = 0, editable, onEdit, onDelete }) {
  const seeValues = canSeeValues(holding, currentMemberID)
  const seeCost = canSeeCost(holding, currentMemberID)
  const mv = holdingMarketValueUSD(holding)
  const pnl = seeCost ? mv - holdingCostBasisUSD(holding) : null

  return (
    <motion.article
      layout="position"
      className="list-item holding-card"
      exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.7 }}
    >
      <div className="holding-card-head">
        <div className="min-w-0">
          <strong className="holding-title">{holding.assetName || holding.symbol}</strong>
          <div className="holding-meta">
            <span>{holding.symbol}</span>
            <span>{labelForMarket(holding.market)}</span>
            <span>{holding.currency}</span>
          </div>
        </div>
        <div className="holding-card-price">
          {seeValues ? (
            <strong>{money(mv)}</strong>
          ) : (
            <span>仅标的</span>
          )}
        </div>
      </div>

      {seeValues && (
        <div className="holding-stat-grid">
          <Stat label="数量" value={formatNumber(holding.quantity)} />
          <Stat label="成本" value={seeCost ? money(holding.averageCost, holding.currency) : '—'} />
          <Stat label="现价" value={money(holding.lastPrice, holding.currency)} />
          <Stat
            label="盈亏"
            value={pnl === null ? '—' : signedMoney(pnl)}
            cls={pnl === null ? '' : classForNumber(pnl)}
          />
        </div>
      )}

      {!seeValues && <div className="holding-hidden-note">该成员设置为仅展示标的</div>}

      {typeof weight === 'number' && seeValues && (
        <div className="weight-summary">
          <span className="weight-chip strong">{formatPercent(weight)} · 组合占比</span>
          <WeightBar value={weight} tone={toneIndex} />
        </div>
      )}

      {editable && (
        <div className="actions">
          <motion.button className="text-button compact-button" whileTap={{ scale: 0.96 }} onClick={() => onEdit?.(holding)}>
            <Icon name="adjust" size={16} /> 编辑
          </motion.button>
          <motion.button className="danger-button compact-button" whileTap={{ scale: 0.96 }} onClick={() => onDelete?.(holding)}>
            删除
          </motion.button>
        </div>
      )}
    </motion.article>
  )
}

function Stat({ label, value, cls = '' }) {
  return (
    <div className="holding-stat">
      <div className="holding-stat-label">{label}</div>
      <div className={`holding-stat-value ${cls}`}>{value}</div>
    </div>
  )
}
