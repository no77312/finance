# 技术架构

## 当前实现

当前交付分成两层：

- `backend/web`：React + Vite 的 PWA 前端（移动端优先），通过 `StoreContext` 管理状态，调用后端 REST API。
- `backend`：Node API 服务，使用 JSON 文件持久化，提供群组、持仓、聚合分析、行情刷新、Telegram 推送等接口，并托管构建后的 PWA。

这样设计的好处是：持仓计算、币种聚合、成员汇总等规则集中在后端，前端只做展示。

## 核心模型

- `InvestmentGroup`：群组、邀请码、成员和默认可见性。
- `Member`：成员身份、昵称、头像符号和角色。
- `Holding`：单笔持仓，包含标的、市场、数量、成本、现价、币种、可见性和备注。
- `PortfolioAnalytics`：按币种汇总、按标的聚合、按成员汇总。

## 为什么按币种汇总

群组里可能同时有 USD、HKD、CNY、SGD。不同币种没有汇率转换时不能直接相加，所以总览页展示的是每个币种自己的市值和浮盈亏。

生产版本可以引入汇率服务，再额外提供“折合基础币种”的视图，但原始币种汇总仍应保留。

## 生产后端建议

当前后端是本地开发版：

- 运行时：Node 20+。
- 存储：`backend/data/store.json`。
- 种子数据：`backend/data/seed.json`。
- 测试：`backend/test/run-api-tests.js`。

它已经能支持本地端到端开发，但还不是生产后端。生产版应增加数据库、认证、授权、迁移、日志和部署配置。

### 快速上线方案

Supabase：

- Auth：邮箱、手机号、Apple 登录。
- Postgres：群组、成员、持仓、邀请、审计日志。
- Row Level Security：按群组成员关系限制访问。
- Realtime：持仓变更推送。

Firebase：

- Firebase Auth。
- Firestore：群组和持仓文档。
- Security Rules：按群组成员权限限制访问。
- Cloud Functions：行情刷新和审计。

### 推荐数据表

```text
users
groups
group_members
group_invites
holdings
holding_versions
market_prices
audit_logs
```

### 关键接口

```text
POST /groups
POST /groups/{groupId}/join
GET  /groups/{groupId}
GET  /groups/{groupId}/holdings
PUT  /groups/{groupId}/holdings/{holdingId}
DELETE /groups/{groupId}/holdings/{holdingId}
GET  /groups/{groupId}/analytics
```

## 安全要求

- 服务端必须检查用户是否属于群组。
- 删除和编辑只能作用于自己的持仓，管理员能力需要单独授权。
- 可见性不能只靠客户端隐藏，服务端返回数据时就应按权限裁剪。
- 持仓变更建议写入 `holding_versions`，便于恢复和审计。
- 敏感日志中不要记录完整持仓明细。

## 精度要求

当前原型使用 `Double`，适合 UI 原型和本地演示。生产版本建议：

- 数量、价格、成本在服务端使用 Decimal 或定点整数。
- 明确每个市场的价格精度和数量精度。
- 所有聚合以服务端返回结果为准，客户端只做展示。
