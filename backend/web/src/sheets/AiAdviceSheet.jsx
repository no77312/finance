import { motion } from 'framer-motion'
import { useStore, activeGroupFor } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'
import { formatDateTime } from '../utils/format.js'

function scoreTone(score) {
  if (score >= 70) return 'positive'
  if (score >= 45) return 'neutral'
  return 'negative'
}

function MemberAdviceCard({ member, index }) {
  const score = Number(member.healthScore) || 0
  const tone = scoreTone(score)
  return (
    <motion.article
      className="advice-member-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 320, damping: 30 }}
    >
      <div className="advice-member-head">
        <div className="min-w-0">
          <strong className="advice-member-name">{member.name}</strong>
          <span className={`advice-health-label ${tone}`}>{member.healthLabel}</span>
        </div>
        <div className={`advice-score-ring ${tone}`}>
          <strong>{score}</strong>
          <span>健康分</span>
        </div>
      </div>
      <div className={`advice-score-track`}>
        <motion.div
          className={`advice-score-fill ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="advice-member-block">
        <span className="advice-block-label">持仓健康</span>
        <p>{member.health}</p>
      </div>
      <div className="advice-member-block">
        <span className="advice-block-label">下一步调整</span>
        <p>{member.strategy}</p>
      </div>
    </motion.article>
  )
}

export default function AiAdviceSheet() {
  const { state, actions } = useStore()
  const group = activeGroupFor(state)
  const close = () => actions.patch({ sheet: '' })
  const payload = group ? state.adviceByGroupID[group.id] : null
  const loading = group && state.adviceLoadingGroupID === group.id
  const members = payload?.advice?.members ?? []

  return (
    <Sheet onClose={close}>
      <SheetHeader title="AI 持仓健康解读" subtitle={group?.name ?? ''} onClose={close} />

      {loading && (
        <section className="import-loading-card">
          <div className="import-loading-head">
            <span className="import-orb">
              <span className="import-orb-core" />
            </span>
            <div>
              <strong className="import-loading-title">正在分析每位成员的持仓健康度</strong>
              <span className="import-loading-step">结合集中度、盈亏与股价表现</span>
            </div>
          </div>
          <div className="import-shimmer-track">
            <motion.span
              className="import-shimmer-bar"
              animate={{ x: ['-60%', '160%'] }}
              transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>
        </section>
      )}

      {state.adviceError && !loading && <div className="error">{state.adviceError}</div>}

      {payload?.advice && !loading && (
        <>
          <motion.section className="advice-overview-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <span className="pill blue">{payload.cached ? '今日已更新' : '刚刚生成'}</span>
            <h3>{payload.advice.headline}</h3>
            <p>{payload.advice.summary}</p>
            <span className="subtle">生成于 {formatDateTime(payload.generatedAt)}</span>
          </motion.section>

          <div className="advice-member-list">
            {members.map((member, i) => (
              <MemberAdviceCard key={`${member.name}-${i}`} member={member} index={i} />
            ))}
          </div>
        </>
      )}

      {!payload && !loading && !state.adviceError && <div className="empty">正在准备本群组的持仓健康解读。</div>}

      <p className="subtle advice-disclaimer">AI 解读仅供参考，不构成投资建议。</p>
    </Sheet>
  )
}
