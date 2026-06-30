import { motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import Sheet from './Sheet.jsx'

export default function ConfirmSheet() {
  const { state, actions } = useStore()
  const confirm = state.confirm
  if (!confirm) return null

  const danger = confirm.tone === 'danger'

  return (
    <Sheet compact onClose={() => actions.resolveConfirm(false)}>
      <div className={`confirm-card ${danger ? 'danger' : ''}`}>
        <div className="confirm-icon" aria-hidden="true">
          !
        </div>
        <div className="confirm-copy">
          <h2>{confirm.title}</h2>
          {confirm.message && <p>{confirm.message}</p>}
        </div>
        <div className="confirm-actions">
          <motion.button
            type="button"
            className="secondary-button"
            whileTap={{ scale: 0.97 }}
            onClick={() => actions.resolveConfirm(false)}
          >
            取消
          </motion.button>
          <motion.button
            type="button"
            className={danger ? 'danger-button' : 'primary-button'}
            whileTap={{ scale: 0.97 }}
            onClick={() => actions.resolveConfirm(true)}
          >
            {confirm.confirmLabel || '确认'}
          </motion.button>
        </div>
      </div>
    </Sheet>
  )
}
