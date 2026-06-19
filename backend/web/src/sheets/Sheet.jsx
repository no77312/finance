import { motion } from 'framer-motion'

// 通用底部 sheet 容器：遮罩淡入 + 面板弹簧上滑，支持退场
export default function Sheet({ children, onClose, compact }) {
  return (
    <motion.div
      className="sheet"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <motion.section
        className={`sheet-panel ${compact ? 'compact-sheet-panel' : ''}`}
        initial={{ y: 40, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 40, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        {children}
      </motion.section>
    </motion.div>
  )
}

export function SheetHeader({ title, subtitle, onClose, onBack }) {
  return (
    <div className={`sheet-header ${onBack ? 'sheet-header-nav' : ''}`}>
      {onBack && (
        <button className="icon-button" onClick={onBack}>
          ‹
        </button>
      )}
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="subtle">{subtitle}</p>}
      </div>
      <button className="icon-button" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
