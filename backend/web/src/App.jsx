import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { StoreProvider } from './store/StoreContext.jsx'
import { useStore } from './store/useStore.js'
import { api } from './api/client.js'
import LoginView from './views/LoginView.jsx'
import AppView from './views/AppView.jsx'
import Toast from './components/Toast.jsx'
import { resolveDark } from './utils/theme.js'

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

  // 登录后保持轻量同步：前台轮询 + 回到前台立即刷新。
  useEffect(() => {
    if (!state.session || state.booting) return undefined

    let inFlight = false
    let lastRefreshAt = 0

    async function refreshSilently() {
      if (inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      lastRefreshAt = Date.now()
      try {
        await actions.refreshBootstrap({ resetAdvice: false })
      } catch {
        // 静默同步失败不打断用户，下一轮或重新打开时会再试。
      } finally {
        inFlight = false
      }
    }

    function refreshWhenActive() {
      if (Date.now() - lastRefreshAt > 5000) {
        refreshSilently()
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshWhenActive()
      }
    }

    const timer = window.setInterval(refreshSilently, 30000)
    window.addEventListener('focus', refreshWhenActive)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenActive)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [state.session, state.booting, actions])

  // 同步 sheet-open class、主题类（.theme-dark）与 theme-color；跟随系统时监听系统变化。
  useEffect(() => {
    const open = Boolean(state.sheet || state.confirm)
    document.documentElement.classList.toggle('sheet-open', open)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = resolveDark(state.theme)
      document.documentElement.classList.toggle('theme-dark', dark)
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', open ? (dark ? '#0b0b0d' : '#f5f6f8') : (dark ? '#000000' : '#ffffff'))
    }
    apply()
    if (state.theme === 'system' && mq?.addEventListener) {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    return undefined
  }, [state.sheet, state.confirm, state.theme])

  if (state.booting) {
    return (
      <main className="app-shell">
        <BootSkeleton />
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

function BootSkeleton() {
  return (
    <div className="boot-skeleton" aria-busy="true" aria-label="正在打开持仓圈">
      <div className="boot-skeleton-brand">
        <div className="brand-mark">持</div>
        <div className="sk sk-line" style={{ width: 132 }} />
      </div>
      <div className="sk sk-panel" />
      <div className="boot-skeleton-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk sk-kpi" />
        ))}
      </div>
      <div className="sk sk-card" />
      <div className="sk sk-card" />
    </div>
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
