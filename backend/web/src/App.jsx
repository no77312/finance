import { useEffect } from 'react'
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
    const open = Boolean(state.sheet)
    document.documentElement.classList.toggle('sheet-open', open)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', open ? '#f2f2f7' : '#ffffff')
  }, [state.sheet])

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
      <Toast />
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  )
}
