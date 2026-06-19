import { motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import GoogleSignInButton from '../components/GoogleSignInButton.jsx'

export default function LoginView() {
  const { state } = useStore()
  const hasClientID = Boolean(state.config?.googleClientID)

  return (
    <main className="login app-shell">
      <motion.section
        className="login-card"
        initial={{ y: 24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <motion.div
          className="brand-mark"
          initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
        >
          持
        </motion.div>
        <div>
          <h1 className="login-title">持仓圈</h1>
          <p className="login-copy">同一个群组里共享持仓与观点，看见彼此的共识标的与组合变化。</p>
        </div>
        <GoogleSignInButton />
        {!hasClientID && (
          <div className="config-warning">
            未配置 GOOGLE_CLIENT_ID，登录按钮暂不可用。
          </div>
        )}
      </motion.section>
    </main>
  )
}
