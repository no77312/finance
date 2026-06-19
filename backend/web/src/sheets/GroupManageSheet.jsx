import { motion } from 'framer-motion'
import { useStore } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'
import { isCurrentUserGroupOwner } from '../utils/insights.js'

export default function GroupManageSheet() {
  const { state, actions } = useStore()
  const group = state.data?.groups?.find((g) => g.id === state.manageGroupID)
  const close = () => actions.patch({ sheet: '', manageGroupID: '' })
  const back = () => actions.patch({ sheet: 'groups', manageGroupID: '' })
  if (!group) return null

  const isOwner = isCurrentUserGroupOwner(group, state.session.currentMemberID)

  return (
    <Sheet onClose={close}>
      <SheetHeader title="群组管理" onClose={close} onBack={back} />
      <section className="group-manage-card panel">
        <strong>{group.name}</strong>
        <p className="subtle">
          {(group.members?.length ?? 0)} 人 · 邀请码 {group.inviteCode}
        </p>
        <motion.button className="secondary-button" whileTap={{ scale: 0.97 }} onClick={() => actions.copyInviteCode(group.inviteCode)}>
          复制邀请码
        </motion.button>
      </section>
      <section className="form-panel danger-zone">
        <h3>{isOwner ? '解散群组' : '退出群组'}</h3>
        <p className="subtle">
          {isOwner ? '解散后所有成员的数据将被删除，且不可恢复。' : '退出后你在该群组的持仓将被移除。'}
        </p>
        <motion.button
          className="danger-button"
          whileTap={{ scale: 0.97 }}
          disabled={state.busy}
          onClick={() => (isOwner ? actions.deleteGroup(group.id) : actions.leaveGroup(group.id))}
        >
          {isOwner ? '解散群组' : '退出群组'}
        </motion.button>
      </section>
    </Sheet>
  )
}
