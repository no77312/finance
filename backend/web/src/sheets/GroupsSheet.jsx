import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import Sheet, { SheetHeader } from './Sheet.jsx'
import Icon from '../components/Icon.jsx'

// 创建/加入群组表单（也用于空工作区）
export function GroupForms() {
  const { state, actions } = useStore()
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('共享持仓与观点')
  const [inviteCode, setInviteCode] = useState('')

  return (
    <div className="group-forms">
      <form
        className="group-form-card"
        onSubmit={(e) => {
          e.preventDefault()
          actions.createGroup({ name, subtitle })
        }}
      >
        <div className="group-form-head">
          <span className="group-form-icon create" aria-hidden="true">
            <Icon name="plus" size={18} />
          </span>
          <div>
            <strong>创建群组</strong>
            <span className="subtle">建一个圈子，邀请好友共享持仓</span>
          </div>
        </div>
        <label className="field">
          <span>群组名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} placeholder="例如：核心持仓圈" />
        </label>
        <label className="field">
          <span>一句话简介（选填）</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={40} placeholder="共享持仓与观点" />
        </label>
        <motion.button className="primary-button" whileTap={{ scale: 0.97 }} disabled={state.busy || !name.trim()}>
          创建群组
        </motion.button>
      </form>

      <form
        className="group-form-card"
        onSubmit={(e) => {
          e.preventDefault()
          actions.joinGroup({ inviteCode })
        }}
      >
        <div className="group-form-head">
          <span className="group-form-icon join" aria-hidden="true">
            <Icon name="layers" size={18} />
          </span>
          <div>
            <strong>加入群组</strong>
            <span className="subtle">输入好友分享的邀请码</span>
          </div>
        </div>
        <label className="field">
          <span>邀请码</span>
          <input
            className="invite-code-input"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            required
            maxLength={8}
            placeholder="6 位邀请码"
          />
        </label>
        <motion.button className="secondary-button" whileTap={{ scale: 0.97 }} disabled={state.busy || !inviteCode.trim()}>
          加入群组
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
