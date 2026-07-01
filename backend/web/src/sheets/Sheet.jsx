import { useEffect, useRef } from 'react'
import { motion, useDragControls } from 'framer-motion'
import Icon from '../components/Icon.jsx'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 通用底部 sheet 容器：遮罩淡入 + 面板弹簧上滑；支持 Esc/焦点陷阱/下滑关闭。
export default function Sheet({ children, onClose, compact }) {
  const panelRef = useRef(null)
  const dragControls = useDragControls()

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const panel = panelRef.current
    panel?.focus?.({ preventScroll: true })

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
        return
      }
      if (event.key === 'Tab' && panel) {
        const items = panel.querySelectorAll(FOCUSABLE)
        if (items.length === 0) {
          event.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.({ preventScroll: true })
    }
  }, [onClose])

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
        ref={panelRef}
        className={`sheet-panel ${compact ? 'compact-sheet-panel' : ''}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        initial={{ y: 28, scale: 0.985, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 24, scale: 0.99, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.86 }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.55 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 700) onClose?.()
        }}
      >
        <span
          className="sheet-grabber"
          onPointerDown={(e) => dragControls.start(e)}
          style={{ touchAction: 'none' }}
          aria-hidden="true"
        />
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
