import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { api, loadSession, saveSession, removeSession } from '../api/client.js'
import { haptic } from '../utils/haptics.js'
import { StoreContext } from './context.js'

const initialState = {
  config: null,
  session: loadSession(),
  data: null,
  activeTab: 'overview',
  activeGroupID: '',
  selectedMemberID: '',
  sheet: '',
  manageGroupID: '',
  submitMode: 'screenshot',
  editHoldingID: '',
  drafts: [],
  draftMeta: null,
  importProgress: null,
  adviceByGroupID: {},
  adviceLoadingGroupID: '',
  adviceError: '',
  confirm: null,
  message: '',
  error: '',
  busy: false,
  booting: true,
}

function reducer(state, action) {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.payload }
    case 'reset':
      return { ...initialState, session: null, booting: false, config: state.config }
    default:
      return state
  }
}

function normalizeBootstrap(state, data) {
  // 若返回了最新 user，回写进 session 持久化
  if (data?.user && state.session) {
    const nextSession = { ...state.session, user: data.user }
    saveSession(nextSession)
  }
  return {
    groups: data?.groups ?? [],
    holdings: data?.holdings ?? [],
    holdingEvents: data?.holdingEvents ?? [],
    portfolioSnapshots: data?.portfolioSnapshots ?? [],
    user: data?.user ?? null,
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  const noticeTimer = useRef(0)
  const confirmAction = useRef(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const patch = useCallback((payload) => dispatch({ type: 'patch', payload }), [])

  const getState = useCallback(() => stateRef.current, [])

  const callApi = useCallback(
    (path, options) => api(path, options, stateRef.current.session),
    [],
  )

  const setNotice = useCallback(
    (kind, text) => {
      haptic(kind === 'error' ? [14, 40, 14] : 12)
      patch(kind === 'error' ? { error: text, message: '' } : { message: text, error: '' })
      window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => patch({ error: '', message: '' }), 2600)
    },
    [patch],
  )

  const clearNotice = useCallback(() => {
    window.clearTimeout(noticeTimer.current)
    patch({ error: '', message: '' })
  }, [patch])

  // 所有写操作统一包裹：busy + 错误 toast
  const runBusy = useCallback(
    async (task) => {
      patch({ busy: true, error: '', message: '' })
      try {
        await task()
      } catch (error) {
        setNotice('error', error.message || '操作失败')
      } finally {
        patch({ busy: false })
      }
    },
    [patch, setNotice],
  )

  const requestConfirm = useCallback(
    (options, onConfirm) => {
      confirmAction.current = onConfirm
      patch({ confirm: options })
    },
    [patch],
  )

  const resolveConfirm = useCallback(
    (confirmed) => {
      const action = confirmAction.current
      confirmAction.current = null
      patch({ confirm: null })
      if (confirmed && action) action()
    },
    [patch],
  )

  const refreshBootstrap = useCallback(async ({ resetAdvice = true } = {}) => {
    const data = await callApi('/api/bootstrap')
    const current = stateRef.current
    const normalized = normalizeBootstrap(current, data)
    const groups = normalized.groups
    const stillThere = groups.some((g) => g.id === current.activeGroupID)
    const nextActiveGroupID = stillThere ? current.activeGroupID : groups[0]?.id ?? ''
    const session = current.session && data.user ? { ...current.session, user: data.user } : current.session
    if (session !== current.session) saveSession(session)

    // 数据无变化时保持 data 引用不变（memo 不重算），静默轮询无变化时直接跳过整个 patch。
    const unchanged =
      Boolean(current.data) &&
      session === current.session &&
      nextActiveGroupID === current.activeGroupID &&
      JSON.stringify(normalized) === JSON.stringify(current.data)
    if (unchanged && !resetAdvice) return

    patch({
      data: unchanged ? current.data : normalized,
      session,
      ...(resetAdvice ? { adviceByGroupID: {} } : {}),
      activeGroupID: nextActiveGroupID,
    })
  }, [callApi, patch])

  const setSessionFromBootstrap = useCallback(
    (payload) => {
      const session = {
        currentMemberID: payload.currentMemberID,
        sessionToken: payload.sessionToken,
        user: payload.user,
      }
      saveSession(session)
      const normalized = normalizeBootstrap({ session }, payload)
      patch({
        session,
        data: normalized,
        activeGroupID: payload.groups?.[0]?.id ?? '',
        activeTab: 'overview',
      })
    },
    [patch],
  )

  const clearSession = useCallback(() => {
    removeSession()
    dispatch({ type: 'reset' })
  }, [])

  // ---- 登录 ----
  const signInWithGoogle = useCallback(
    (credential) =>
      runBusy(async () => {
        if (!credential) throw new Error('未获取到 Google 凭证')
        const result = await callApi('/api/auth/google', {
          method: 'POST',
          body: { credential },
          auth: false,
        })
        setSessionFromBootstrap(result)
      }),
    [runBusy, callApi, setSessionFromBootstrap],
  )

  // 本地调试用：device 匿名登录（仅在未配置 Google ClientID 时入口可见）
  const signInWithDevice = useCallback(
    () =>
      runBusy(async () => {
        let deviceID = ''
        try {
          deviceID = localStorage.getItem('position-circle:device-id') ?? ''
        } catch {
          /* ignore */
        }
        if (!deviceID) {
          deviceID = 'local-dev-001'
          try {
            localStorage.setItem('position-circle:device-id', deviceID)
          } catch {
            /* ignore */
          }
        }
        const result = await callApi('/api/auth/device', {
          method: 'POST',
          body: { deviceID, displayName: '本地访客' },
          auth: false,
        })
        setSessionFromBootstrap(result)
      }),
    [runBusy, callApi, setSessionFromBootstrap],
  )

  // ---- 群组 ----
  const createGroup = useCallback(
    (form) =>
      runBusy(async () => {
        const result = await callApi('/api/groups', { method: 'POST', body: form })
        await refreshBootstrap()
        patch({ activeGroupID: result.group.id, sheet: '' })
        setNotice('success', '群组已创建')
      }),
    [runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  const joinGroup = useCallback(
    (form) =>
      runBusy(async () => {
        const result = await callApi('/api/groups/join', { method: 'POST', body: form })
        await refreshBootstrap()
        patch({ activeGroupID: result.group.id, sheet: '' })
        setNotice('success', '已加入群组')
      }),
    [runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  const leaveGroup = useCallback(
    (groupID) => {
      requestConfirm(
        {
          title: '退出群组？',
          message: '你在该群组的持仓会被移除，其他群组不受影响。',
          confirmLabel: '退出群组',
          tone: 'danger',
        },
        () =>
          runBusy(async () => {
            await callApi(`/api/groups/${groupID}/membership`, { method: 'DELETE' })
            await refreshBootstrap()
            patch({ sheet: '', manageGroupID: '', selectedMemberID: '' })
            setNotice('success', '已退出群组')
          }),
      )
    },
    [requestConfirm, runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  const deleteGroup = useCallback(
    (groupID) => {
      requestConfirm(
        {
          title: '解散群组？',
          message: '群组内所有成员和持仓数据都会被删除，这个操作不可撤销。',
          confirmLabel: '解散群组',
          tone: 'danger',
        },
        () =>
          runBusy(async () => {
            await callApi(`/api/groups/${groupID}`, { method: 'DELETE' })
            await refreshBootstrap()
            patch({ sheet: '', manageGroupID: '', selectedMemberID: '' })
            setNotice('success', '群组已解散')
          }),
      )
    },
    [requestConfirm, runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  // ---- 持仓 ----
  const saveHolding = useCallback(
    (groupID, form, editHoldingID) =>
      runBusy(async () => {
        const path = editHoldingID
          ? `/api/groups/${groupID}/holdings/${editHoldingID}`
          : `/api/groups/${groupID}/holdings`
        await callApi(path, { method: editHoldingID ? 'PUT' : 'POST', body: form })
        await refreshBootstrap()
        patch({ sheet: '', editHoldingID: '' })
        setNotice('success', editHoldingID ? '持仓已更新' : '持仓已提交')
      }),
    [runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  const deleteHolding = useCallback(
    (groupID, holdingID) => {
      requestConfirm(
        {
          title: '删除持仓？',
          message: '这条持仓会从当前组合中移除，删除后会记录在变动历史里。',
          confirmLabel: '删除',
          tone: 'danger',
        },
        () =>
          runBusy(async () => {
            await callApi(`/api/groups/${groupID}/holdings/${holdingID}`, { method: 'DELETE' })
            await refreshBootstrap()
            setNotice('success', '持仓已删除')
          }),
      )
    },
    [requestConfirm, runBusy, callApi, refreshBootstrap, setNotice],
  )

  const importDrafts = useCallback(
    (groupID, drafts) =>
      runBusy(async () => {
        const importable = drafts.filter(
          (d) => d.symbol && Number(d.quantity) > 0 && Number(d.lastPrice) >= 0,
        )
        if (importable.length === 0) throw new Error('没有可导入的持仓')
        const result = await callApi(`/api/groups/${groupID}/holdings/sync`, {
          method: 'PUT',
          body: {
            holdings: importable.map((d) => ({
              symbol: d.symbol,
              assetName: d.assetName || d.symbol,
              market: d.market || 'usStock',
              quantity: Number(d.quantity),
              averageCost: d.averageCost === '' || d.averageCost === null || d.averageCost === undefined ? null : Number(d.averageCost),
              lastPrice: Number(d.lastPrice),
              currency: d.currency || 'USD',
              visibility: d.visibility || 'amountOnly',
              note: d.note || '截图同步',
            })),
          },
        })
        await refreshBootstrap()
        patch({ sheet: '', drafts: [], draftMeta: null })
        const s = result.summary
        setNotice(
          'success',
          `已同步 ${s.snapshotCount} 条：新增 ${s.createdCount} · 更新 ${s.updatedCount} · 移除 ${s.deletedCount}`,
        )
      }),
    [runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  // ---- AI 观察 ----
  const loadGroupAdvice = useCallback(
    async (groupID) => {
      const current = stateRef.current
      const cached = current.adviceByGroupID[groupID]
      const hasMembers = Array.isArray(cached?.advice?.members) && cached.advice.members.length > 0
      if (hasMembers || current.adviceLoadingGroupID === groupID) return
      patch({ adviceLoadingGroupID: groupID, adviceError: '' })
      try {
        const payload = await callApi(`/api/groups/${groupID}/advice`)
        patch({
          adviceByGroupID: { ...stateRef.current.adviceByGroupID, [groupID]: payload },
          adviceLoadingGroupID: '',
        })
      } catch (error) {
        patch({ adviceError: error.message || '加载失败', adviceLoadingGroupID: '' })
      }
    },
    [callApi, patch],
  )

  // ---- 邀请码复制 ----
  const copyInviteCode = useCallback(
    async (code) => {
      try {
        await navigator.clipboard.writeText(code)
        setNotice('success', `已复制邀请码 ${code}`)
      } catch {
        setNotice('error', `复制失败，邀请码：${code}`)
      }
    },
    [setNotice],
  )

  // ---- 个人资料 ----
  const updateProfile = useCallback(
    (form) =>
      runBusy(async () => {
        await callApi('/api/me', { method: 'PATCH', body: form })
        await refreshBootstrap()
        patch({ sheet: '' })
        setNotice('success', '资料已更新')
      }),
    [runBusy, callApi, refreshBootstrap, patch, setNotice],
  )

  const actions = useMemo(
    () => ({
      patch,
      getState,
      callApi,
      setNotice,
      clearNotice,
      runBusy,
      requestConfirm,
      resolveConfirm,
      refreshBootstrap,
      clearSession,
      signInWithGoogle,
      signInWithDevice,
      createGroup,
      joinGroup,
      leaveGroup,
      deleteGroup,
      saveHolding,
      deleteHolding,
      importDrafts,
      loadGroupAdvice,
      copyInviteCode,
      updateProfile,
    }),
    [
      patch, getState, callApi, setNotice, clearNotice, runBusy, requestConfirm, resolveConfirm, refreshBootstrap, clearSession,
      signInWithGoogle, signInWithDevice, createGroup, joinGroup, leaveGroup, deleteGroup, saveHolding,
      deleteHolding, importDrafts, loadGroupAdvice, copyInviteCode, updateProfile,
    ],
  )

  const value = useMemo(() => ({ state, actions }), [state, actions])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
