import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { StoreProvider } from './store/StoreContext.jsx'
import { useStore } from './store/useStore.js'
import { api } from './api/client.js'
import LoginView from './views/LoginView.jsx'
import AppView from './views/AppView.jsx'
import Toast from './components/Toast.jsx'

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

function Root() {
  const { state, actions } = useStore()

  // 启动：拉取 config + 如有 session 则刷新 bootstrap
  useEffect(() => {
    let cancelled = false
    async function boot() {
      let config
      try {
        config = await api('/api/config', { auth: false })
      } catch {
        config = { googleClientID: '' }
      }
      if (cancelled) return
      actions.patch({ config })

      if (state.session) {
        try {
          await actions.refreshBootstrap()
        } catch {
          actions.clearSession()
          actions.setNotice('error', '登录状态已失效，请重新登录。')
        }
      }
      if (!cancelled) actions.patch({ booting: false })
    }
    boot()
    registerServiceWorker()
    return () => {
      cancelled = true
    }
    // 仅启动一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 同步 sheet-open class 与 theme-color
  useEffect(() => {
    const open = Boolean(state.sheet || state.confirm)
    document.documentElement.classList.toggle('sheet-open', open)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', open ? '#f5f6f8' : '#ffffff')
  }, [state.sheet, state.confirm])

  if (state.booting) {
    return (
      <main className="app-shell">
        <div className="boot">
          <div className="brand-mark">持</div>
          <div>正在打开持仓圈</div>
        </div>
        <Toast />
      </main>
    )
  }

  return (
    <>
      {state.session ? <AppView /> : <LoginView />}
      <GlobalActivityBar active={state.busy} />
      <Toast />
    </>
  )
}

function GlobalActivityBar({ active }) {
  return (
    <div className="activity-layer" aria-hidden="true">
      <AnimatePresence>
        {active && (
          <motion.div
            className="activity-bar"
            initial={{ opacity: 0, scaleX: 0.18, x: '-38%' }}
            animate={{ opacity: 1, scaleX: 1, x: ['-42%', '42%'] }}
            exit={{ opacity: 0, scaleX: 0.24 }}
            transition={{
              opacity: { duration: 0.16 },
              scaleX: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
              x: { duration: 1.05, ease: 'easeInOut', repeat: Infinity },
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: [0.16, 1, 0.3, 1] }}>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </MotionConfig>
  )
}
