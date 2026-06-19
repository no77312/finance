import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, activeGroupFor } from '../store/StoreContext.jsx'
import Sheet, { SheetHeader } from './Sheet.jsx'
import { markets, currencies, visibilities } from '../utils/finance.js'
import { imageFileToDataURL, mergeDrafts, isImportableDraft } from '../utils/screenshot.js'
import { formatPercent } from '../utils/format.js'

export default function SubmitSheet() {
  const { state, actions } = useStore()
  const group = activeGroupFor(state)
  const editing = state.editHoldingID
    ? state.data?.holdings?.find((h) => h.id === state.editHoldingID)
    : null
  const close = () => actions.patch({ sheet: '', editHoldingID: '', drafts: [], draftMeta: null, importProgress: null })

  return (
    <Sheet onClose={close}>
      <SheetHeader title={editing ? '编辑持仓' : '提交持仓'} onClose={close} />
      {!editing && (
        <div className="segmented">
          {['manual', 'screenshot'].map((mode) => (
            <button
              key={mode}
              className={state.submitMode === mode ? 'active' : ''}
              onClick={() => actions.patch({ submitMode: mode })}
            >
              {mode === 'manual' ? '手工输入' : '截图导入'}
            </button>
          ))}
        </div>
      )}
      {editing || state.submitMode === 'manual' ? (
        <ManualForm group={group} editing={editing} />
      ) : (
        <ScreenshotImport group={group} />
      )}
    </Sheet>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function ManualForm({ group, editing }) {
  const { state, actions } = useStore()
  const [form, setForm] = useState({
    symbol: editing?.symbol ?? '',
    assetName: editing?.assetName ?? '',
    market: editing?.market ?? 'usStock',
    currency: editing?.currency ?? 'USD',
    quantity: editing?.quantity ?? '',
    averageCost: editing?.averageCost ?? '',
    lastPrice: editing?.lastPrice ?? '',
    visibility: editing?.visibility ?? 'amountOnly',
    note: editing?.note ?? '',
  })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form
      className="form-panel"
      onSubmit={(e) => {
        e.preventDefault()
        actions.saveHolding(
          group.id,
          {
            symbol: form.symbol,
            assetName: form.assetName,
            market: form.market,
            quantity: Number(form.quantity),
            averageCost: form.averageCost === '' ? null : Number(form.averageCost),
            lastPrice: Number(form.lastPrice),
            currency: form.currency,
            visibility: form.visibility,
            note: form.note,
          },
          editing?.id ?? '',
        )
      }}
    >
      <div className="two-col">
        <Field label="代码">
          <input value={form.symbol} onChange={set('symbol')} required />
        </Field>
        <Field label="名称">
          <input value={form.assetName} onChange={set('assetName')} />
        </Field>
      </div>
      <div className="two-col">
        <Field label="市场">
          <select value={form.market} onChange={set('market')}>
            {markets.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field label="币种">
          <select value={form.currency} onChange={set('currency')}>
            {currencies.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="two-col">
        <Field label="数量">
          <input type="number" step="any" value={form.quantity} onChange={set('quantity')} required />
        </Field>
        <Field label="成本价（可选）">
          <input type="number" step="any" value={form.averageCost ?? ''} onChange={set('averageCost')} />
        </Field>
      </div>
      <div className="two-col">
        <Field label="现价">
          <input type="number" step="any" value={form.lastPrice} onChange={set('lastPrice')} required />
        </Field>
        <Field label="可见性">
          <select value={form.visibility} onChange={set('visibility')}>
            {visibilities.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="备注">
        <textarea value={form.note} onChange={set('note')} />
      </Field>
      <motion.button className="primary-button" whileTap={{ scale: 0.97 }} disabled={state.busy}>
        {editing ? '保存' : '提交'}
      </motion.button>
    </form>
  )
}

function ScreenshotImport({ group }) {
  const { state, actions } = useStore()
  const [files, setFiles] = useState([])
  const [defaultVisibility, setDefaultVisibility] = useState('amountOnly')
  const [brokerHint, setBrokerHint] = useState('')
  const importing = Boolean(state.importProgress?.active)

  async function parse(e) {
    e.preventDefault()
    if (files.length === 0) {
      actions.setNotice('error', '请选择至少一张截图')
      return
    }
    await actions.runBusy(async () => {
      const parsed = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        actions.patch({ importProgress: { active: true, current: i + 1, total: files.length, title: '正在读取截图' } })
        const imageDataURL = await imageFileToDataURL(file)
        actions.patch({ importProgress: { active: true, current: i + 1, total: files.length, title: '正在识别持仓' } })
        const result = await actions.callApi('/api/imports/parse-screenshot', {
          method: 'POST',
          body: { imageDataURL, defaultVisibility, brokerHint, locale: 'zh-CN' },
        })
        for (const h of result.holdings ?? []) {
          parsed.push({ ...h, importSource: file.name, importIndex: i, importSourceType: result.source })
        }
      }
      actions.patch({ importProgress: { active: true, current: files.length, total: files.length, title: '正在合并结果' } })
      const merged = mergeDrafts(parsed)
      actions.patch({
        drafts: merged.drafts,
        draftMeta: {
          fileCount: files.length,
          rawCount: merged.rawCount,
          mergedCount: merged.mergedCount,
          duplicateCount: merged.duplicateCount,
        },
        importProgress: null,
      })
      actions.setNotice('success', `已解析 ${files.length} 张截图，合并后 ${merged.mergedCount} 条`)
    })
  }

  return (
    <>
      <form className="form-panel" onSubmit={parse}>
        <div className="two-col">
          <label className="field">
            <span>默认可见性</span>
            <select value={defaultVisibility} onChange={(e) => setDefaultVisibility(e.target.value)}>
              {visibilities.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>券商提示（可选）</span>
            <input value={brokerHint} onChange={(e) => setBrokerHint(e.target.value)} placeholder="例如：富途 / 老虎" />
          </label>
        </div>
        <label className="file-drop">
          <input type="file" accept="image/*" multiple disabled={importing} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          <span>{files.length > 0 ? `已选择 ${files.length} 张截图` : '点击选择持仓截图，可多选'}</span>
        </label>
        <motion.button className="primary-button" whileTap={{ scale: 0.97 }} disabled={state.busy}>
          {importing ? '识别中…' : '解析截图'}
        </motion.button>
      </form>

      <AnimatePresence>
        {state.importProgress && <ImportProgress progress={state.importProgress} />}
      </AnimatePresence>

      <Drafts group={group} />
    </>
  )
}

function ImportProgress({ progress }) {
  return (
    <motion.section
      className="import-loading-card"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
    >
      <div className="import-loading-head">
        <span className="import-orb">
          <span className="import-orb-core" />
        </span>
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.strong
              key={progress.title}
              className="import-loading-title"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {progress.title}
            </motion.strong>
          </AnimatePresence>
          {progress.total > 1 && (
            <div className="import-loading-step">第 {progress.current}/{progress.total} 张</div>
          )}
        </div>
      </div>
      <div className="import-shimmer-track">
        <motion.div
          className="import-shimmer-bar"
          animate={{ x: ['-60%', '160%'] }}
          transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
        />
      </div>
    </motion.section>
  )
}

function Drafts({ group }) {
  const { state, actions } = useStore()
  const { drafts, draftMeta } = state
  if (drafts.length === 0 && !draftMeta) return null

  const updateDraft = (index, field, value) => {
    const next = drafts.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    actions.patch({ drafts: next })
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h3>解析结果</h3>
          {draftMeta && (
            <p className="subtle">
              已解析 {draftMeta.fileCount} 张截图，识别 {draftMeta.rawCount} 条，合并后 {draftMeta.mergedCount} 条
            </p>
          )}
        </div>
        <motion.button
          className="secondary-button compact-button"
          whileTap={{ scale: 0.97 }}
          disabled={state.busy || drafts.length === 0}
          onClick={() => actions.importDrafts(group.id, drafts)}
        >
          同步持仓
        </motion.button>
      </div>
      <div className="draft-list">
        <AnimatePresence mode="popLayout" initial={false}>
          {drafts.map((draft, index) => {
            const importable = isImportableDraft(draft)
            return (
              <motion.article
                key={`${draft.symbol}-${index}`}
                layout
                className="list-item draft-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              >
                <div className="holding-card-head">
                  <div className="min-w-0">
                    <strong className="holding-title">{draft.assetName || draft.symbol}</strong>
                    <div className="holding-meta">
                      <span>{draft.symbol}</span>
                      <span>置信度 {formatPercent(draft.confidence ?? 0)}</span>
                    </div>
                  </div>
                  <span className={`pill ${importable ? 'green' : 'red'}`}>{importable ? '可导入' : '需核对'}</span>
                </div>
                <div className="draft-edit-grid">
                  <label className="field">
                    <span>代码</span>
                    <input value={draft.symbol ?? ''} onChange={(e) => updateDraft(index, 'symbol', e.target.value.toUpperCase())} />
                  </label>
                  <label className="field">
                    <span>名称</span>
                    <input value={draft.assetName ?? ''} onChange={(e) => updateDraft(index, 'assetName', e.target.value)} />
                  </label>
                  <label className="field">
                    <span>数量</span>
                    <input type="number" step="any" value={draft.quantity ?? ''} onChange={(e) => updateDraft(index, 'quantity', e.target.value)} />
                  </label>
                  <label className="field">
                    <span>现价</span>
                    <input type="number" step="any" value={draft.lastPrice ?? ''} onChange={(e) => updateDraft(index, 'lastPrice', e.target.value)} />
                  </label>
                </div>
              </motion.article>
            )
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}
