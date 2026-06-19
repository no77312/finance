import { motion } from 'framer-motion'
import { useStore, activeGroupFor } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'
import { formatDateTime } from '../utils/format.js'

function AdviceList({ title, items }) {
  const list = (items ?? []).filter(Boolean).slice(0, 3)
  if (list.length === 0) return null
  return (
    <div className="advice-list">
      <h4>{title}</h4>
      <ul>
        {list.map((item, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
            {item}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

export default function AiAdviceSheet() {
  const { state, actions } = useStore()
  const group = activeGroupFor(state)
  const close = () => actions.patch({ sheet: '' })
  const payload = group ? state.adviceByGroupID[group.id] : null
  const loading = group && state.adviceLoadingGroupID === group.id

  return (
    <Sheet onClose={close}>
      <SheetHeader title="AI 观察" subtitle={`${group?.name ?? ''} · 每日自动更新`} onClose={close} />

      {loading && (
        <section className="import-loading-card">
          <span className="import-spinner" />
          <strong>正在生成本群组的组合观察</strong>
          <span className="subtle">综合成员持仓、共识标的与近期变化</span>
        </section>
      )}

      {state.adviceError && !loading && <div className="error">{state.adviceError}</div>}

      {payload?.advice && !loading && (
        <motion.section className="ai-advice-card panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <span className="pill blue">{payload.cached ? '今日已更新' : '刚刚生成'}</span>
          <h3>{payload.advice.headline}</h3>
          <span className="subtle">生成于 {formatDateTime(payload.generatedAt)}</span>
          <p>{payload.advice.summary}</p>
          <AdviceList title="关注点" items={payload.advice.highlights} />
          <AdviceList title="风险提示" items={payload.advice.risks} />
          <AdviceList title="复盘问题" items={payload.advice.questions} />
        </motion.section>
      )}

      {!payload && !loading && !state.adviceError && <div className="empty">正在准备本群组的组合观察。</div>}

      <p className="subtle advice-disclaimer">AI 观察仅供参考，不构成投资建议。</p>
    </Sheet>
  )
}
