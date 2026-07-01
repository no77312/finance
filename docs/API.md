# 后端 API

默认地址：

```text
http://127.0.0.1:8787
```

当前后端使用 Node 内置 HTTP 模块和本地 JSON 文件存储。首次启动会从 `backend/data/seed.json` 复制生成 `backend/data/store.json`。

## 启动

```bash
cd backend
npm start
```

## 测试

```bash
cd backend
npm test
```

## 通用 Header

登录成功后，客户端保存后端返回的 `currentMemberID` 和 `sessionToken`。后续请求带：

```text
X-Member-ID: 4D99EF67-4E8F-4BA6-9E96-1E62E7680010
X-Session-Token: 你的 sessionToken
```

iOS 当前支持 Apple / 本机账号，PWA 支持 Google 登录。受保护路由会校验用户 session。

## Endpoints

### GET /health

健康检查。

### GET /api/config

返回 PWA 需要的公开配置。

```json
{
  "googleClientID": "xxxx.apps.googleusercontent.com"
}
```

### GET /api/bootstrap

返回 iOS 启动所需的群组、持仓、持仓变动事件和当前成员 ID。

### POST /api/auth/google

PWA Google 登录。前端通过 Google Identity Services 拿到 ID token 后，把 `credential` 发给后端；后端用 `google-auth-library` 校验签名、`aud`、`iss` 和过期时间，并使用 Google `sub` 作为用户唯一标识。

```json
{
  "credential": "Google ID token"
}
```

返回：

```json
{
  "user": {},
  "currentMemberID": "...",
  "sessionToken": "...",
  "groups": [],
  "holdings": [],
  "holdingEvents": []
}
```

### GET /api/groups

返回群组列表。

### POST /api/groups

创建群组。

```json
{
  "name": "家庭资产小组",
  "subtitle": "每周同步一次"
}
```

### POST /api/groups/join

通过邀请码加入群组。

```json
{
  "inviteCode": "LONG-2026"
}
```

### GET /api/groups/:groupID

返回单个群组。

### GET /api/groups/:groupID/holdings

返回群组持仓列表。

### GET /api/groups/:groupID/holding-events

返回群组持仓变动事件。带 `X-Member-ID` 时只返回该成员的事件。

### POST /api/groups/:groupID/holdings

创建持仓。

```json
{
  "symbol": "AAPL",
  "assetName": "Apple",
  "market": "usStock",
  "quantity": 3,
  "averageCost": 180,
  "lastPrice": 210,
  "currency": "USD",
  "visibility": "full",
  "note": "测试持仓"
}
```

### PUT /api/groups/:groupID/holdings/sync

按“完整快照”同步当前用户在该群组下的持仓。这个接口适合截图导入：

- 本次快照里已有且历史已存在的标的：更新。
- 本次快照里新出现的标的：创建。
- 历史里存在但本次快照里消失的标的：删除。

```json
{
  "holdings": [
    {
      "symbol": "AAPL",
      "assetName": "Apple",
      "market": "usStock",
      "quantity": 6,
      "averageCost": 180,
      "lastPrice": 210,
      "currency": "USD",
      "visibility": "amountOnly",
      "note": "截图同步"
    }
  ]
}
```

### PUT /api/groups/:groupID/holdings/:holdingID

更新自己的持仓。

### DELETE /api/groups/:groupID/holdings/:holdingID

删除自己的持仓，并返回一条 `deleted` 事件。

### POST /api/imports/parse-screenshot

截图导入解析。iOS 可传 OCR 文本；PWA 可传压缩后的 `imageDataURL`，后端会用 OpenAI 视觉能力解析图片。

```json
{
  "ocrText": "可选 OCR 文本",
  "imageDataURL": "data:image/jpeg;base64,...",
  "defaultVisibility": "amountOnly",
  "brokerHint": "富途"
}
```

### POST /api/admin/prices/refresh

刷新所有群组的最近一个交易日收盘价。用于 GitHub Actions 或 Render Cron 等定时任务，不由 iOS 手动调用。

必须带刷新密钥：

```text
Authorization: Bearer 你的 PRICE_REFRESH_TOKEN
```

响应示例：

```json
{
  "holdings": [],
  "updatedCount": 0,
  "failed": [],
  "refreshedAt": "2026-06-16T06:30:00.000Z"
}
```

### POST /api/groups/:groupID/prices/refresh

刷新单个群组的最近一个交易日收盘价，同样需要 `PRICE_REFRESH_TOKEN`。主要用于调试。

### POST /api/admin/telegram/digest

向已绑定 Telegram 群的群组推送「每人当日盈亏」日报。用于 GitHub Actions 等定时任务，建议排在收盘价刷新之后，不由客户端手动调用。

复用刷新密钥鉴权：

```text
Authorization: Bearer 你的 PRICE_REFRESH_TOKEN
```

行为：

- 为每个群组的每位成员计算当日净值快照（多币种折算美元），写入 `dailyValuations`。
- 当日盈亏 = Σ 今日数量 ×（今日价 − 上一交易日价），只统计昨天也持有的标的；当日新开仓不计涨跌。
- 与该成员上一份（严格早于今天的）快照对比；没有对比基准时提示"明日起展示"。
- 只向配置了 chat 绑定的群组推送，未配置的群组仍会生成快照供次日对比。

群组与 Telegram chat 的绑定存在 `group.telegramChatID`，由 `/api/telegram/webhook` 的 `/bind` 命令写入；`TELEGRAM_CHAT_MAP` 仅作为可选兜底。需要的环境变量：

```text
TELEGRAM_BOT_TOKEN=BotFather 给的机器人 token
# 可选：管理员级别的兜底映射
TELEGRAM_CHAT_MAP={"<PositionCircle 群组ID>":"<Telegram chat_id>"}
```

响应示例：

```json
{
  "date": "2026-06-30",
  "snapshotCount": 3,
  "targetGroupCount": 1,
  "sentGroups": ["D54C3FB6-11E8-447D-A2BB-EF9505087101"],
  "failed": []
}
```

### POST /api/telegram/webhook

接收 Telegram 推送的 update（由 Telegram 服务器调用，不是客户端调用）。校验请求头 `X-Telegram-Bot-Api-Secret-Token` 是否等于 `TELEGRAM_WEBHOOK_SECRET`，不匹配返回 403。

识别群内命令：

- `/bind <邀请码>`：把发送命令的 Telegram 群 `chat_id` 绑定到该邀请码对应的持仓圈群组（写入 `group.telegramChatID`）。一个 Telegram 群只保留最后一次绑定。
- `/unbind`：解除本群的绑定。
- `/start`、`/help`：返回使用说明。

无论处理结果如何都向 Telegram 返回 `200 {"ok":true}`，回复内容通过 `sendMessage` 异步发回群里，避免 Telegram 重试。

一次性注册 webhook：

```bash
cd backend
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
  npm run telegram:set-webhook -- https://position-circle-api.onrender.com
```

### 实时调仓推送（无独立端点）

持仓的创建（`POST .../holdings`）、更新（`PUT .../holdings/:id`）、删除（`DELETE .../holdings/:id`）和截图同步（`PUT .../holdings/sync`）成功后，会向该群组绑定的 Telegram 群推送一条变动消息（完整变动口径，截图同步合并成一条）。采用 fire-and-forget，不阻塞响应、失败不影响写入；需配置 `TELEGRAM_BOT_TOKEN` 且该群组已绑定 `telegramChatID`。

### GET /api/groups/:groupID/analytics

返回按币种汇总、共识标的和成员汇总。
