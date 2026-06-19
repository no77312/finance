// 数值/日期格式化。移植自原 app.js。

export function money(value, currency = 'USD') {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  if (currency === 'USD') {
    const abs = Math.abs(number)
    const formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: abs >= 100 ? 0 : 2,
      maximumFractionDigits: abs >= 100 ? 0 : 2,
    }).format(number)
    return `$${formatted}`
  }
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number)
}

export function signedMoney(value, currency = 'USD') {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  const sign = number > 0 ? '+' : ''
  return `${sign}${money(number, currency)}`
}

export function formatPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(number)
}

export function signedPercentPoint(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  const sign = number > 0 ? '+' : ''
  return `${sign}${formatPercent(number)}`
}

export function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(number)
}

export function formatMaybe(value) {
  if (value === null || value === undefined) return '待确认'
  return formatNumber(value)
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function classForNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  if (number > 0) return 'positive'
  if (number < 0) return 'negative'
  return ''
}
