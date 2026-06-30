import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore.js'

function waitForGoogle() {
  return new Promise((resolve) => {
    let tries = 0
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer)
        resolve(window.google.accounts.id)
      } else if (++tries > 80) {
        clearInterval(timer)
        resolve(null)
      }
    }, 100)
  })
}

// 真实 Google Identity Services 登录按钮
export default function GoogleSignInButton() {
  const { state, actions } = useStore()
  const slotRef = useRef(null)
  const clientID = state.config?.googleClientID

  useEffect(() => {
    if (!clientID || !slotRef.current) return
    let cancelled = false
    waitForGoogle().then((gis) => {
      if (cancelled || !gis || !slotRef.current) return
      gis.initialize({
        client_id: clientID,
        callback: (response) => actions.signInWithGoogle(response?.credential),
        ux_mode: 'popup',
      })
      slotRef.current.innerHTML = ''
      gis.renderButton(slotRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        width: 280,
      })
    })
    return () => {
      cancelled = true
    }
  }, [clientID, actions])

  return <div ref={slotRef} className="google-slot" />
}
