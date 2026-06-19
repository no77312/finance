// 后端 API 封装 + 会话持久化。移植自原 app.js。
const sessionKey = 'position-circle:pwa-session'

export function loadSession() {
  try {
    const raw = localStorage.getItem(sessionKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(sessionKey, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export function removeSession() {
  try {
    localStorage.removeItem(sessionKey)
  } catch {
    /* ignore */
  }
}

// session 由调用方注入，避免循环依赖。
export async function api(path, options = {}, session = null) {
  const headers = { Accept: 'application/json', ...(options.headers ?? {}) }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.auth !== false && session) {
    headers['X-Member-ID'] = session.currentMemberID
    headers['X-Session-Token'] = session.sessionToken
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) return null

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || `请求失败：${response.status}`)
  }
  return payload
}
