import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'

// 创建/加入群组表单（也用于空工作区）
export function GroupForms() {
  const { state, actions } = useStore()
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('共享持仓与观点')
  const [inviteCode, setInviteCode] = useState('')

  return (
    <div className="group-forms">
      <form
        className="form-panel"
        onSubmit={(e) => {
          e.preventDefault()
          actions.createGroup({ name, subtitle })
        }}
      >
        <h3>创建群组</h3>
        <label className="field">
          <span>群组名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="例如：核心持仓圈" />
        </label>
        <label className="field">
          <span>副标题</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <motion.button className="primary-button" whileTap={{ scale: 0.97 }} disabled={state.busy}>
          创建
        </motion.button>
      </form>

      <form
        className="form-panel"
        onSubmit={(e) => {
          e.preventDefault()
          actions.joinGroup({ inviteCode })
        }}
      >
        <h3>加入群组</h3>
        <label className="field">
          <span>邀请码</span>
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} required placeholder="输入 6 位邀请码" />
        </label>
        <motion.button className="secondary-button" whileTap={{ scale: 0.97 }} disabled={state.busy}>
          加入
        </motion.button>
      </form>
    </div>
  )
}

export default function GroupsSheet() {
  const { state, actions } = useStore()
  const groups = state.data?.groups ?? []
  const close = () => actions.patch({ sheet: '' })

  return (
    <Sheet onClose={close}>
      <SheetHeader title="群组" onClose={close} />
      {groups.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h3>切换群组</h3>
            <span className="pill">{groups.length}</span>
          </div>
          <div className="group-menu-list">
            {groups.map((group) => (
              <div key={group.id} className={`group-menu-item ${group.id === state.activeGroupID ? 'active' : ''}`}>
                <button
                  className="group-menu-select"
                  onClick={() => actions.patch({ activeGroupID: group.id, selectedMemberID: '', sheet: '' })}
                >
                  <span>
                    <strong>{group.name}</strong>
                    <span className="subtle">
                      {(group.members?.length ?? 0)} 人 · {group.inviteCode}
                    </span>
                  </span>
                  <span className={`pill ${group.id === state.activeGroupID ? 'blue' : ''}`}>
                    {group.id === state.activeGroupID ? '当前群组' : '切换'}
                  </span>
                </button>
                <button className="icon-button group-menu-action" onClick={() => actions.patch({ sheet: 'group-manage', manageGroupID: group.id })}>
                  ···
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <GroupForms />
    </Sheet>
  )
}
