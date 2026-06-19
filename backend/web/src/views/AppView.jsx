import { AnimatePresence, motion } from 'framer-motion'
import { useStore, activeGroupFor } from '../store/StoreContext.jsx'
import Icon from '../components/Icon.jsx'
import OverviewView from './OverviewView.jsx'
import MembersView from './MembersView.jsx'
import MineView from './MineView.jsx'
import SheetHost from '../sheets/SheetHost.jsx'
import { GroupForms } from '../sheets/GroupsSheet.jsx'

const TAB_LABEL = { overview: '总览', members: '成员', mine: '我的' }

const pageVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
}

export default function AppView() {
  const { state, actions } = useStore()
  const group = activeGroupFor(state)

  return (
    <div className="app-shell">
      <Topbar group={group} />

      {group ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={state.activeTab}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
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
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="topbar-copy min-w-0">
          <div className="topbar-label">{TAB_LABEL[state.activeTab]}</div>
          <div className="topbar-heading">{group?.name ?? '持仓圈'}</div>
        </div>
        <div className="topbar-actions">
          {group && (
            <motion.button
              className="icon-button topbar-action-button"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                actions.patch({ sheet: 'ai-advice' })
                actions.loadGroupAdvice(group.id)
              }}
            >
              <Icon name="sparkles" />
            </motion.button>
          )}
          <motion.button className="icon-button topbar-action-button" whileTap={{ scale: 0.9 }} onClick={() => actions.patch({ sheet: 'groups' })}>
            <Icon name="layers" />
          </motion.button>
        </div>
      </div>
      <div className="topbar-subtle">{group?.subtitle ?? '创建或加入一个群组开始共享持仓'}</div>
    </header>
  )
}

function Tabbar() {
  const { state, actions } = useStore()
  const tabs = [
    { value: 'overview', icon: 'overview', label: '总览' },
    { value: 'members', icon: 'member-group', label: '成员' },
    { value: 'mine', icon: 'profile', label: '我的' },
  ]
  return (
    <nav className="tabbar">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`tab-button ${state.activeTab === tab.value ? 'active' : ''}`}
          onClick={() => actions.patch({ activeTab: tab.value, sheet: '' })}
        >
          <motion.span animate={{ scale: state.activeTab === tab.value ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
            <Icon name={tab.icon} />
          </motion.span>
          <span>{tab.label}</span>
        </button>
      ))}
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
