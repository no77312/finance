import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'
import { Avatar } from '../components/Avatar.jsx'

export default function ProfileEditSheet() {
  const { state, actions } = useStore()
  const user = state.session.user ?? state.data?.user
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const close = () => actions.patch({ sheet: '' })

  return (
    <Sheet onClose={close} compact>
      <SheetHeader title="编辑资料" subtitle="自定义昵称与简介" onClose={close} />

      <div className="profile-edit-hero">
        <Avatar member={user} />
        <div className="min-w-0">
          <strong>{displayName || '我'}</strong>
          <span className="subtle">{user?.email ?? ''}</span>
        </div>
      </div>

      <form
        className="form-panel profile-edit-form"
        onSubmit={(e) => {
          e.preventDefault()
          actions.updateProfile({ displayName: displayName.trim(), bio: bio.trim() })
        }}
      >
        <label className="field">
          <span>昵称</span>
          <input
            value={displayName}
            maxLength={40}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="给自己起个名字"
            required
          />
        </label>
        <label className="field">
          <span>简介 Bio</span>
          <textarea
            value={bio}
            maxLength={160}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="一句话介绍你的投资风格"
          />
          <span className="field-hint">{bio.length}/160</span>
        </label>
        <motion.button className="primary-button" whileTap={{ scale: 0.97 }} disabled={state.busy}>
          保存
        </motion.button>
      </form>
    </Sheet>
  )
}
