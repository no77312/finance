import { AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import GroupsSheet from './GroupsSheet.jsx'
import GroupManageSheet from './GroupManageSheet.jsx'
import MemberSelectSheet from './MemberSelectSheet.jsx'
import AiAdviceSheet from './AiAdviceSheet.jsx'
import SubmitSheet from './SubmitSheet.jsx'
import ProfileEditSheet from './ProfileEditSheet.jsx'

export default function SheetHost() {
  const { state } = useStore()
  return (
    <AnimatePresence>
      {state.sheet === 'groups' && <GroupsSheet key="groups" />}
      {state.sheet === 'group-manage' && <GroupManageSheet key="group-manage" />}
      {state.sheet === 'member-select' && <MemberSelectSheet key="member-select" />}
      {state.sheet === 'ai-advice' && <AiAdviceSheet key="ai-advice" />}
      {state.sheet === 'submit' && <SubmitSheet key="submit" />}
      {state.sheet === 'profile-edit' && <ProfileEditSheet key="profile-edit" />}
    </AnimatePresence>
  )
}
