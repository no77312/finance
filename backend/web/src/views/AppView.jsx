import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { activeGroupFor } from '../store/selectors.js'
import { haptic } from '../utils/haptics.js'
import { THEME_META, nextTheme } from '../utils/theme.js'
import Icon from '../components/Icon.jsx'
import OverviewView from './OverviewView.jsx'
import MembersView from './MembersView.jsx'
import MineView from './MineView.jsx'
import SheetHost from '../sheets/SheetHost.jsx'
import { GroupForms } from '../sheets/GroupsSheet.jsx'

const TABS = [
  { value: 'overview', icon: 'overview', label: '总览' },
  { value: 'members', icon: 'member-group', label: '成员' },
  { value: 'mine', icon: 'profile', label: '我的' },
]
const TAB_INDEX = { overview: 0, members: 1, mine: 2 }

const SPRING = { type: 'spring', stiffness: 430, damping: 38, mass: 0.72 }
const PAGE_TRANSITION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] }

export default function AppView() {
  const { state } = useStore()
  const group = activeGroupFor(state)
  const shellRef = useRef(null)
  const activeIndex = TAB_INDEX[state.activeTab] ?? 0
  // 切 tab 时推导滑动方向（React 官方支持的"渲染期派生 state"）。
  const [prevTab, setPrevTab] = useState({ index: activeIndex, direction: 1 })
  let direction = prevTab.direction
  if (prevTab.index !== activeIndex) {
    direction = activeIndex > prevTab.index ? 1 : -1
    setPrevTab({ index: activeIndex, direction })
  }

  useEffect(() => {
    shellRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [state.activeTab, state.activeGroupID])

  return (
    <div className="app-shell" ref={shellRef}>
      <Topbar group={group} />

      {group ? (
        <LayoutGroup id={`group-${group.id}`}>
          <div className="page-viewport">
            <AnimatePresence initial={false}>
              <motion.div
                key={state.activeTab}
                className="page-slide"
                initial={{ opacity: 0, x: 20 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 * direction, position: 'absolute' }}
                transition={PAGE_TRANSITION}
              >
                {state.activeTab === 'members' ? (
                  <MembersView group={group} />
                ) : state.activeTab === 'mine' ? (
                  <MineView group={group} />
                ) : (
                  <OverviewView group={group} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </LayoutGroup>
      ) : (
        <EmptyWorkspace />
      )}

      <Tabbar />
      <SheetHost group={group} />
    </div>
  )
}

function Topbar({ group }) {
  const { state, actions } = useStore()
  const label = TABS.find((t) => t.value === state.activeTab)?.label ?? '持仓圈'
  return (
    <div className="topbar-wrap">
      <header className="topbar-float">
        <div className="topbar-title">{label}</div>
        <div className="topbar-actions">
          <motion.button
            className="topbar-pill-button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => actions.setTheme(nextTheme(state.theme))}
            aria-label={`主题：${THEME_META[state.theme].label}，点击切换`}
            title={`主题：${THEME_META[state.theme].label}`}
          >
            <Icon name={THEME_META[state.theme].icon} size={19} />
          </motion.button>
          {group && (
            <motion.button
              className="topbar-pill-button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                actions.patch({ sheet: 'ai-advice' })
                actions.loadGroupAdvice(group.id)
              }}
              aria-label="AI 解读"
            >
              <Icon name="sparkles" size={19} />
            </motion.button>
          )}
          <motion.button
            className="topbar-pill-button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => actions.patch({ sheet: 'groups' })}
            aria-label="群组"
          >
            <Icon name="layers" size={19} />
          </motion.button>
        </div>
      </header>
    </div>
  )
}

function Tabbar() {
  const { state, actions } = useStore()
  const activeIndex = TAB_INDEX[state.activeTab] ?? 0
  return (
    <nav className="tabbar-float">
      <motion.span
        className="tabbar-slider"
        aria-hidden="true"
        animate={{ x: `${activeIndex * 100}%` }}
        transition={SPRING}
      />
      {TABS.map((tab) => {
        const active = state.activeTab === tab.value
        return (
          <button
            key={tab.value}
            className={`tabbar-item ${active ? 'active' : ''}`}
            onClick={() => {
              if (!active) haptic(8)
              actions.patch({ activeTab: tab.value, sheet: '' })
            }}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            <motion.span
              className="tabbar-icon"
              animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
              transition={SPRING}
            >
              <Icon name={tab.icon} size={24} />
            </motion.span>
          </button>
        )
      })}
    </nav>
  )
}

function EmptyWorkspace() {
  return (
    <main className="content single">
      <section className="section">
        <div className="empty">还没有群组，创建或加入一个开始共享持仓。</div>
        <GroupForms />
      </section>
    </main>
  )
}
