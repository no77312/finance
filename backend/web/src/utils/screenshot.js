// 截图图片预处理 + 草稿合并，移植自原 app.js

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function imageFileToDataURL(file, maxSide = 1800) {
  const img = await fileToImage(file)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
}

function normalizeSymbol(value) {
  return String(value ?? '').trim().toUpperCase()
}

function draftAccountKey(draft) {
  if (draft.accountKey) return draft.accountKey
  if (draft.brokerName || draft.accountName) return `${draft.brokerName ?? ''}|${draft.accountName ?? ''}`
  return `screenshot-${draft.importIndex ?? 0}`
}

// 合并草稿：同账户覆盖 + 跨券商累计
export function mergeDrafts(drafts) {
  let replacedCount = 0
  let accumulatedCount = 0

  // 阶段一：同账户同标的覆盖
  const byAccount = new Map()
  for (const draft of drafts) {
    const key = `${normalizeSymbol(draft.symbol)}|${draftAccountKey(draft)}`
    if (byAccount.has(key)) replacedCount++
    byAccount.set(key, draft)
  }

  // 阶段二：跨账户按 symbol 累计
  const bySymbol = new Map()
  for (const draft of byAccount.values()) {
    const key = normalizeSymbol(draft.symbol)
    const existing = bySymbol.get(key)
    if (!existing) {
      bySymbol.set(key, { ...draft })
      continue
    }
    accumulatedCount++
    const qtyA = Number(existing.quantity) || 0
    const qtyB = Number(draft.quantity) || 0
    const totalQty = qtyA + qtyB
    const costA = Number(existing.averageCost)
    const costB = Number(draft.averageCost)
    let averageCost = existing.averageCost
    if (Number.isFinite(costA) && Number.isFinite(costB) && totalQty > 0) {
      averageCost = (costA * qtyA + costB * qtyB) / totalQty
    }
    bySymbol.set(key, {
      ...existing,
      quantity: totalQty,
      averageCost,
      marketValue: (Number(existing.marketValue) || 0) + (Number(draft.marketValue) || 0),
      confidence: Math.min(Number(existing.confidence) || 1, Number(draft.confidence) || 1),
    })
  }

  const merged = Array.from(bySymbol.values()).sort((a, b) =>
    normalizeSymbol(a.symbol).localeCompare(normalizeSymbol(b.symbol)),
  )

  return {
    drafts: merged,
    rawCount: drafts.length,
    mergedCount: merged.length,
    duplicateCount: replacedCount + accumulatedCount,
    replacedCount,
    accumulatedCount,
  }
}

export function isImportableDraft(draft) {
  return Boolean(draft.symbol) && Number(draft.quantity) > 0 && Number(draft.lastPrice) >= 0
}
