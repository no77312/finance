// 轻量触感反馈：Android PWA 支持 navigator.vibrate；iOS Safari 会忽略，无副作用。
export function haptic(pattern = 10) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* ignore */
  }
}
