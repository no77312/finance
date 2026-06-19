import { motion } from 'framer-motion'
import Icon from '../components/Icon.jsx'

// 通用底部 sheet 容器：遮罩淡入 + 面板弹簧上滑，支持退场
export default function Sheet({ children, onClose, compact }) {
  return (
    <motion.div
      className="sheet"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <motion.section
        className={`sheet-panel ${compact ? 'compact-sheet-panel' : ''}`}
        initial={{ y: 28, scale: 0.985, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 24, scale: 0.99, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.86 }}
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
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <span style={{ transform: 'rotate(180deg)', display: 'grid' }}>
            <Icon name="chevron" size={18} />
          </span>
        </button>
      )}
      <div>
        <h2 className="sheet-title">{title}</h2>
        {subtitle && <p className="subtle">{subtitle}</p>}
      </div>
      <button className="icon-button" onClick={onClose} aria-label="关闭">
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
