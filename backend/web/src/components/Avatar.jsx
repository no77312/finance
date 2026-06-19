// 头像组件，移植自原 avatarHTML
export function Avatar({ member }) {
  const picture = member?.pictureURL || member?.picture
  const label = (member?.displayName || member?.avatarSymbol || '?').slice(0, 1)
  if (picture) {
    return (
      <span className="mini-avatar">
        <img src={picture} alt={member?.displayName || ''} />
      </span>
    )
  }
  return <span className="mini-avatar">{label}</span>
}

export function AvatarStack({ members = [], max = 4 }) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <div className="avatar-stack">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} />
      ))}
      {extra > 0 && <span className="mini-avatar mini-avatar-more">+{extra}</span>}
    </div>
  )
}
