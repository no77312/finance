// 主题：跟随系统 / 浅色 / 深色。存 localStorage，解析后由 .theme-dark 类落地。
const KEY = 'position-circle:theme'
export const THEME_ORDER = ['system', 'light', 'dark']

export const THEME_META = {
  system: { icon: 'theme-auto', label: '跟随系统' },
  light: { icon: 'sun', label: '浅色' },
  dark: { icon: 'moon', label: '深色' },
}

export function loadTheme() {
  try {
    const value = localStorage.getItem(KEY)
    return THEME_ORDER.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* ignore */
  }
}

export function systemPrefersDark() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function resolveDark(theme) {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark())
}

export function nextTheme(theme) {
  const index = THEME_ORDER.indexOf(theme)
  return THEME_ORDER[(index + 1) % THEME_ORDER.length]
}
