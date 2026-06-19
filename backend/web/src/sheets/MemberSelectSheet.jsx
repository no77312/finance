import { motion } from 'framer-motion'
import { useStore, activeGroupFor } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'
import { Avatar } from '../components/Avatar.jsx'
import { money, formatPercent, formatDateTime } from '../utils/format.js'
import { buildPortfolioInsights } from '../utils/insights.js'

export default function MemberSelectSheet() {
  const { state, actions } = useStore()
  const group = activeGroupFor(state)
  const members = group?.members ?? []
  const memberID = state.session.currentMemberID
  const close = () => actions.patch({ sheet: '' })

  return (
    <Sheet onClose={close} compact>
      <SheetHeader title="选择成员" subtitle={`${members.length} 位成员 · 快速切换组合`} onClose={close} />
      <div className="member-select-list">
        {members.map((member, i) => {
          const insights = buildPortfolioInsights(state.data, group.id, member.id, memberID)
          const active = member.id === state.selectedMemberID
          return (
            <motion.button
              key={member.id}
              className={`member-select-option ${active ? 'active' : ''}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 340, damping: 30 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => actions.patch({ selectedMemberID: member.id, sheet: '' })}
            >
              <Avatar member={member} />
              <span className="member-select-info min-w-0">
                <strong className="member-select-name">{member.displayName}</strong>
                {member.bio ? (
                  <span className="member-select-bio">{member.bio}</span>
                ) : (
                  <span className="member-select-sub">
                    {insights.totalCount} 项 · {insights.latestSnapshotAt ? formatDateTime(insights.latestSnapshotAt) : '未提交'}
                  </span>
                )}
              </span>
              <span className="member-select-metrics">
                <strong>{money(insights.totalVisibleValue)}</strong>
                <span>前三 {formatPercent(insights.top3Weight)}</span>
              </span>
              {active && <span className="member-select-check" aria-hidden="true" />}
            </motion.button>
          )
        })}
      </div>
    </Sheet>
  )
}
