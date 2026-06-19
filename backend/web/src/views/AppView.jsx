import { AnimatePresence, motion } from 'framer-motion'
import { useStore, activeGroupFor } from '../store/StoreContext.jsx'
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

const SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.7 }

export default function AppView() {
  const { state } = useStore()
  const group = activeGroupFor(state)
  const dir = 1

  return (
    <div className="app-shell">
      <Topbar group={group} />

      {group ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.activeTab}
            initial={{ opacity: 0, x: 28 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 * dir }}
            transition={SPRING}
            style={{ willChange: 'transform' }}
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
          {group && (
            <motion.button
              className="topbar-pill-button"
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
            onClick={() => actions.patch({ activeTab: tab.value, sheet: '' })}
          >
            <motion.span
              className="tabbar-icon"
              animate={{ scale: active ? 1.06 : 1 }}
              transition={SPRING}
            >
              <Icon name={tab.icon} size={22} />
            </motion.span>
            <span className="tabbar-label">{tab.label}</span>
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
