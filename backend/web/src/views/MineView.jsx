import { motion } from 'framer-motion'
import { useStore } from '../store/useStore.js'
import { Avatar } from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'
import PortfolioSection from '../components/PortfolioSection.jsx'
import { formatDateTime, formatNumber } from '../utils/format.js'
import { buildPortfolioInsights } from '../utils/insights.js'

export default function MineView({ group }) {
  const { state, actions } = useStore()
  const memberID = state.session.currentMemberID
  const user = state.session.user ?? state.data?.user
  const insights = buildPortfolioInsights(state.data, group.id, memberID, memberID)

  const events = (state.data?.holdingEvents ?? [])
    .filter((e) => e.groupID === group.id && e.ownerID === memberID)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 12)

  const eventLabel = { created: '提交', updated: '调整', deleted: '移除' }

  const logout = () => {
    if (window.confirm('确定退出登录？')) actions.clearSession()
  }

  return (
    <main className="content">
      <section className="section-wide">
        <motion.button
          type="button"
          className="panel profile-card profile-card-button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => actions.patch({ sheet: 'profile-edit' })}
        >
          <div className="profile-card-head">
            <div className="member-overview-name">
              <Avatar member={user} />
              <div className="min-w-0">
                <strong className="account-name">{user?.displayName ?? '我'}</strong>
                <div className="account-mail">{user?.email ?? ''}</div>
              </div>
            </div>
            <span className="profile-card-chevron">
              <Icon name="chevron" size={18} />
            </span>
          </div>
          {user?.bio ? (
            <p className="profile-bio">{user.bio}</p>
          ) : (
            <p className="profile-bio profile-bio-empty">点击添加个人简介</p>
          )}
          <div className="profile-meta-row">
            <span>当前群组 {group.name}</span>
            <span>已加入 {state.data?.groups?.length ?? 0} 个群组</span>
          </div>
        </motion.button>
        <button type="button" className="text-link-button profile-logout-link" onClick={logout}>
          退出登录
        </button>
      </section>

      <PortfolioSection
        title="我的持仓"
        insights={insights}
        currentMemberID={memberID}
        editable
        onAddHolding={() => actions.patch({ sheet: 'submit', editHoldingID: '', submitMode: 'screenshot' })}
        onEdit={(holding) => actions.patch({ sheet: 'submit', editHoldingID: holding.id, submitMode: 'manual' })}
        onDelete={(holding) => actions.deleteHolding(group.id, holding.id)}
      />

      <section className="section">
        <div className="section-header">
          <h2>变动记录</h2>
          <span className="pill">最近 {events.length} 条</span>
        </div>
        <div className="panel">
          <div className="timeline">
            {events.length === 0 ? (
              <div className="empty">还没有变动记录</div>
            ) : (
              events.map((e, i) => (
                <motion.div
                  key={e.id}
                  className="timeline-item"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <span className={`timeline-dot ${e.type}`} />
                  <div className="timeline-body">
                    <strong>
                      {eventLabel[e.type] ?? e.type} · {e.symbol}
                    </strong>
                    <span className="subtle">
                      {formatDateTime(e.createdAt)} · 数量 {formatNumber(e.quantity)}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
