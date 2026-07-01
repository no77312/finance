# 持仓圈 PositionCircle

一个 iOS 群组持仓共享 App 原型：同一个群组里的成员可以提交自己的持仓，大家可以查看群组共识标的、成员持仓和个人提交记录。

## 已完成内容

- SwiftUI iOS 原型：群组首页、总览、我的持仓、成员列表、提交/编辑/删除持仓、截图导入、新建群组。
- PWA 网页版：同一个 Render 服务直接托管移动端网页，可添加到手机主屏幕，支持 Google 登录、群组、成员持仓和提交持仓。
- Node 后端：本地 API、文件持久化、群组/持仓 CRUD、聚合分析接口。
- iOS 网络层：启动拉取后端数据，保存/删除同步后端，后端不可用时回退到演示数据。
- 截图导入：iOS 本地 OCR 识别截图文字，后端可用 OpenAI 大模型解析成持仓草稿，确认后写入。
- 表现追踪：后端提供受保护的收盘价刷新接口，GitHub Actions 可每天收盘后自动调用。
- 变动记录：“我的持仓”展示最近提交、编辑、删除持仓的时间轴。
- 核心业务模块：成员、群组、持仓、可见性、币种、按标的聚合、按币种汇总。
- 隐私基础能力：支持完整可见、隐藏成本、仅标的三种可见性。
- Xcode 工程：`iOSApp/PositionCircle.xcodeproj`。
- SwiftPM 核心检查：`PositionCircleChecks` 可编译并验证聚合逻辑。

## 1. 启动后端

当前机器已经有 Node 26 和 npm 11，不需要额外安装后端环境。

```bash
cd backend
npm install
npm start
```

后端默认运行在：

```text
http://127.0.0.1:8787
```

首次启动会从 `backend/data/seed.json` 生成 `backend/data/store.json`，之后新增和编辑的数据会写入 `store.json`。

## PWA 网页版

后端会同时托管 PWA 静态页面，部署后直接访问 Render 公网地址即可：

```text
https://position-circle-api.onrender.com
```

Google 登录需要在 Render 环境变量里配置：

```text
GOOGLE_CLIENT_ID=你的 Web application OAuth Client ID
```

创建 Google OAuth Client 时，Authorized JavaScript origins 至少加入：

```text
https://position-circle-api.onrender.com
http://localhost:8787
```

详细步骤见 [PWA Google 登录配置](docs/PWA_GOOGLE.md)。

## 2. 运行 iOS App

1. 用 Xcode 打开：

   `iOSApp/PositionCircle.xcodeproj`

2. 选择 iPhone 模拟器。

3. 点击 Run。

iOS App 默认连接线上 Render 后端：

```text
https://position-circle-api.onrender.com
```

如果要调试本地后端，可以把 `PositionCircleAPIClient` 里的 `baseURL` 临时改回 `http://127.0.0.1:8787`。在 iOS Simulator 中，这个地址会指向本机 Mac；真机调试时需要改成 Mac 的局域网 IP。

## 截图导入配置

截图导入不要求上传原图。iOS 会先在本地 OCR，然后把文字发给后端解析。

后端未配置 `OPENAI_API_KEY` 时，会使用基础规则解析；配置后会使用大模型解析：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
```

## 收盘价刷新配置

后端默认使用 Alpha Vantage 官方日线接口；未配置 Key 时，不会覆盖已有价格。

```text
ALPHA_VANTAGE_API_KEY=你的 Alpha Vantage API Key
PRICE_REFRESH_TOKEN=一段随机生成的刷新密钥
```

支持的原型市场：美股、A 股、基金/ETF、加密货币。现金类持仓不会刷新价格。定时刷新由 `.github/workflows/refresh-prices.yml` 调用后端 `/api/admin/prices/refresh`，需要在 GitHub Actions Secrets 里配置同一个 `PRICE_REFRESH_TOKEN`。

## Telegram 推送

绑定 Telegram 群后有两类推送：

1. **每日盈亏日报**：每天收盘后推送「每人当日盈亏」（较上一交易日、多币种折算美元）。由 `.github/workflows/refresh-prices.yml` 在刷新收盘价之后调用 `/api/admin/telegram/digest`，复用同一个 `PRICE_REFRESH_TOKEN`。
2. **实时调仓推送**：每当有成员新增、调整、清仓或截图同步持仓，立即向群里推送一条变动消息（标的 + 数量 + 成本 + 现价；一次截图同步合并成一条）。这是持仓写操作的副作用，采用 fire-and-forget，推送失败不影响保存；收盘价刷新不产生变动事件，所以不会刷屏。

> 说明：以上推送都按成员真实持仓计算，包含成员在 App 内设为「隐藏成本/仅标的」的部分，请确保这个 Telegram 群和持仓圈群组是同一批可信成员。

群组与 Telegram 群的绑定不写死在环境变量里，而是各群自助完成：把机器人拉进 Telegram 群后，发送 `/bind <持仓圈邀请码>`，后端通过 webhook 自动记录该群的 `chat_id`。

### 一次性服务端配置

1. 在 Telegram 里找 `@BotFather`，`/newbot` 创建机器人，拿到 `TELEGRAM_BOT_TOKEN`。
2. 自己生成一段随机字符串作为 `TELEGRAM_WEBHOOK_SECRET`（用于校验 webhook 来源）。
3. 在 Render 环境变量里配置 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET`。
4. 注册 webhook（把后端地址指给 Telegram，只需做一次）：

   ```bash
   cd backend
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
     npm run telegram:set-webhook -- https://position-circle-api.onrender.com
   ```

### 每个群组自助绑定（成员侧）

1. 把机器人拉进 Telegram 群。
2. 在群里发送 `/bind 邀请码`（邀请码在持仓圈 App 的「群组」页可看到，例如 `/bind LONG-2026`）。
3. 机器人回复「已绑定」即成功；之后每天收盘后会在这个群推送当日盈亏。发送 `/unbind` 可解绑。

可选：`TELEGRAM_CHAT_MAP={"群组ID":"chat_id"}` 作为管理员级别的兜底映射，一般不需要。

### 推送时机与测试

推送由 `.github/workflows/refresh-prices.yml` 在刷新收盘价之后调用 `/api/admin/telegram/digest`（复用 `PRICE_REFRESH_TOKEN`）。本地手动触发一次：

```bash
curl -fsS -X POST http://127.0.0.1:8787/api/admin/telegram/digest \
  -H "Authorization: Bearer $PRICE_REFRESH_TOKEN" -d "{}"
```

当日涨跌需要“昨天”的净值快照才能对比，因此第一次运行只生成快照、显示“明日起展示”，从第二天起开始展示当日盈亏。相关单测：

```bash
cd backend && npm run test:telegram
```

## Render 部署

项目根目录已经包含 `render.yaml`。Render Blueprint 会创建：

- Node Web Service：`position-circle-api`
- Region：`singapore`
- Plan：`starter`
- Persistent Disk：`/var/data`，1GB
- Health Check：`/health`

详细步骤见 [Render 部署指南](docs/DEPLOY_RENDER.md)。

## 3. 项目检查

```bash
bash scripts/check-project.sh
```

这会依次运行：

- 后端 API 检查。
- Swift 核心聚合检查。
- Xcode 工程文件格式检查。

## 单独运行核心检查

在项目根目录执行：

```bash
env HOME=/Users/bytedance/Documents/Codex/2026-06-15/ios-app/outputs/PositionCircle/.home CLANG_MODULE_CACHE_PATH=/Users/bytedance/Documents/Codex/2026-06-15/ios-app/outputs/PositionCircle/.build/module-cache swift run PositionCircleChecks --scratch-path /Users/bytedance/Documents/Codex/2026-06-15/ios-app/outputs/PositionCircle/.build
```

已验证输出：

```text
PositionCircleCore checks passed
```

## 目录结构

```text
PositionCircle/
├── backend/
│   ├── src/
│   ├── data/
│   ├── public/
│   └── test/
├── Package.swift
├── Sources/
│   ├── PositionCircleCore/
│   └── PositionCircleChecks/
├── iOSApp/
│   ├── PositionCircle.xcodeproj/
│   └── PositionCircle/
└── docs/
```

## 重要说明

当前是本地全栈原型：后端使用 JSON 文件持久化，iOS 在后端不可用时会回退到 `DemoData`。生产版本需要接入登录、数据库、权限校验、行情服务和审计日志。

示例价格仅用于演示，不代表实时行情，也不构成投资建议。
