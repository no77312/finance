import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import GroupsSheet from './GroupsSheet.jsx'
import GroupManageSheet from './GroupManageSheet.jsx'
import MemberSelectSheet from './MemberSelectSheet.jsx'
import AiAdviceSheet from './AiAdviceSheet.jsx'
import SubmitSheet from './SubmitSheet.jsx'
import ProfileEditSheet from './ProfileEditSheet.jsx'
import ConfirmSheet from './ConfirmSheet.jsx'

// Sheet 通过 portal 挂到 document.body，脱离 .app-shell 滚动容器。
// 否则在 sheet 里聚焦输入框时，浏览器（尤其 iOS）会滚动 .app-shell 把输入框
// 带到键盘上方，从而顶起页面/顶栏、并留下滚动残留。
export default function SheetHost() {
  const { state } = useStore()
  return createPortal(
    <AnimatePresence>
      {state.sheet === 'groups' && <GroupsSheet key="groups" />}
      {state.sheet === 'group-manage' && <GroupManageSheet key="group-manage" />}
      {state.sheet === 'member-select' && <MemberSelectSheet key="member-select" />}
      {state.sheet === 'ai-advice' && <AiAdviceSheet key="ai-advice" />}
      {state.sheet === 'submit' && <SubmitSheet key="submit" />}
      {state.sheet === 'profile-edit' && <ProfileEditSheet key="profile-edit" />}
      {state.confirm && <ConfirmSheet key="confirm" />}
    </AnimatePresence>,
    document.body,
  )
}
