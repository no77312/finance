import { motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import { Avatar } from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'
import PortfolioSection from '../components/PortfolioSection.jsx'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import { money } from '../utils/format.js'
import { buildPortfolioInsights } from '../utils/insights.js'

export default function MembersView({ group }) {
  const { state, actions } = useStore()
  const memberID = state.session.currentMemberID
  const members = group.members ?? []
  const selectedID = members.some((m) => m.id === state.selectedMemberID)
    ? state.selectedMemberID
    : members[0]?.id ?? ''
  const selected = members.find((m) => m.id === selectedID)
  const insights = selected ? buildPortfolioInsights(state.data, group.id, selectedID, memberID) : null

  return (
    <main className="content single member-layout">
      <motion.button
        className="panel member-selector-button"
        whileTap={{ scale: 0.98 }}
        onClick={() => actions.patch({ sheet: 'member-select' })}
      >
        <span className="member-selector-id">
          <Avatar member={selected} />
          <span className="min-w-0">
            <span className="member-selector-hint">查看成员 · 点击切换</span>
            <span className="member-selector-name">{selected?.displayName ?? '选择成员'}</span>
            {selected?.bio && <span className="member-selector-bio">{selected.bio}</span>}
          </span>
        </span>
        <span className="member-selector-value">
          {insights && (
            <strong>
              <AnimatedNumber value={insights.totalVisibleValue} format={(v) => money(v)} resetKey={selectedID} />
            </strong>
          )}
          {members.length > 1 && <span>共 {members.length} 人</span>}
        </span>
        <span className="member-selector-chevron">
          <Icon name="chevron" size={16} />
        </span>
      </motion.button>

      {selected && insights && (
        <PortfolioSection
          title={`${selected.displayName} 的持仓`}
          insights={insights}
          owner={selected}
          currentMemberID={memberID}
          resetKey={selectedID}
        />
      )}
    </main>
  )
}
