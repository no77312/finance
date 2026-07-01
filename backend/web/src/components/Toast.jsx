import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import Icon from './Icon.jsx'

// 顶部 toast，带进出场动画
export default function Toast() {
  const { state } = useStore()
  const text = state.error || state.message
  const isError = Boolean(state.error)

  return (
    <div className="toast-layer" role="status" aria-live={isError ? 'assertive' : 'polite'}>
      <AnimatePresence>
        {text && (
          <motion.div
            key={text}
            className={`toast ${isError ? 'toast-error' : 'toast-success'}`}
            initial={{ y: -24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span className="toast-icon" aria-hidden="true">
              <Icon name={isError ? 'close' : 'check'} size={15} />
            </span>
            <span>{text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
