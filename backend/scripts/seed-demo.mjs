// 本地调试用的演示数据填充脚本：创建两个 device 用户 + 一个群组 + 若干持仓。
// 运行：node scripts/seed-demo.mjs   （需后端已在 BASE 上运行）
const BASE = process.env.BASE ?? 'http://127.0.0.1:8788'

async function call(path, body, session) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (session) {
    headers['X-Member-ID'] = session.currentMemberID
    headers['X-Session-Token'] = session.sessionToken
  }
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(payload)}`)
  return payload
}

async function login(deviceID, displayName) {
  const result = await call('/api/auth/device', { deviceID, displayName })
  return { session: { currentMemberID: result.currentMemberID, sessionToken: result.sessionToken }, result }
}

async function addHolding(groupID, session, h) {
  return call(`/api/groups/${groupID}/holdings`, h, session)
}

const owner = await login('local-dev-001', '本地访客')
console.log('owner:', owner.session.currentMemberID)

// 创建群组
const created = await call('/api/groups', { name: '核心持仓圈', subtitle: '共享持仓与观点' }, owner.session)
const group = created.group
console.log('group:', group.id, group.inviteCode)

// 第二个成员加入
const friend = await login('local-dev-002', '小林')
await call('/api/groups/join', { inviteCode: group.inviteCode }, friend.session)
console.log('friend joined:', friend.session.currentMemberID)

// owner 持仓
const ownerHoldings = [
  { symbol: 'AAPL', assetName: '苹果', market: 'usStock', currency: 'USD', quantity: 50, averageCost: 150, lastPrice: 195, visibility: 'full' },
  { symbol: 'NVDA', assetName: '英伟达', market: 'usStock', currency: 'USD', quantity: 30, averageCost: 400, lastPrice: 880, visibility: 'full' },
  { symbol: 'TSLA', assetName: '特斯拉', market: 'usStock', currency: 'USD', quantity: 20, averageCost: 240, lastPrice: 210, visibility: 'amountOnly' },
  { symbol: '0700', assetName: '腾讯控股', market: 'hkStock', currency: 'HKD', quantity: 200, averageCost: 320, lastPrice: 380, visibility: 'full' },
]
for (const h of ownerHoldings) await addHolding(group.id, owner.session, h)
console.log('owner holdings added')

// friend 持仓（与 owner 有重叠标的 AAPL/NVDA → 形成共识）
const friendHoldings = [
  { symbol: 'AAPL', assetName: '苹果', market: 'usStock', currency: 'USD', quantity: 80, averageCost: 160, lastPrice: 195, visibility: 'full' },
  { symbol: 'NVDA', assetName: '英伟达', market: 'usStock', currency: 'USD', quantity: 10, averageCost: 600, lastPrice: 880, visibility: 'full' },
  { symbol: 'MSFT', assetName: '微软', market: 'usStock', currency: 'USD', quantity: 25, averageCost: 300, lastPrice: 420, visibility: 'full' },
  { symbol: 'BTC', assetName: '比特币', market: 'crypto', currency: 'USD', quantity: 0.5, averageCost: 45000, lastPrice: 64000, visibility: 'amountOnly' },
]
for (const h of friendHoldings) await addHolding(group.id, friend.session, h)
console.log('friend holdings added')

console.log('\n✅ 演示数据已就绪。用 deviceID=local-dev-001（本地访客）登录即可看到。')
