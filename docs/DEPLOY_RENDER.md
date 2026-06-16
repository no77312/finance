# Render 部署指南

本项目已经包含 `render.yaml`，可以用 Render Blueprint 从 GitHub 直接创建服务。这个服务同时托管：

- PWA 网页版。
- 后端 API。
- 持久化 JSON 数据文件。

## 费用预估

当前配置：

```text
Web Service: starter
Region: singapore
Persistent Disk: 1GB
```

按 Render 当前公开价格，大约是：

```text
$7/月 + $0.25/月 = $7.25/月
```

这套配置会把后端运行时数据写到 Render Persistent Disk。服务重启和重新部署后，用户提交的持仓会保留。

## 部署步骤

1. 打开 Render Dashboard：

   `https://dashboard.render.com`

2. 选择 `New` -> `Blueprint`。

3. 连接 GitHub 仓库：

   `no77312/finance`

4. Render 会读取仓库根目录的 `render.yaml`。

5. 确认会创建服务：

   `position-circle-api`

6. 点击 Apply / Deploy。

部署完成后，Render 会给一个公网 HTTPS 地址，类似：

```text
https://position-circle-api.onrender.com
```

## 验证

打开：

```text
https://position-circle-api.onrender.com/health
```

应该返回：

```json
{"status":"ok","service":"position-circle-api"}
```

也可以验证启动数据：

```text
https://position-circle-api.onrender.com/api/bootstrap
```

PWA 页面直接打开：

```text
https://position-circle-api.onrender.com
```

## 数据持久化

`render.yaml` 配置了：

```yaml
plan: starter
envVars:
  - key: NODE_ENV
    value: production
  - key: DATA_FILE
    value: /var/data/store.json
disk:
  name: position-circle-data
  mountPath: /var/data
  sizeGB: 1
```

只有 `/var/data` 下面的文件会被持久化。后端通过 `DATA_FILE=/var/data/store.json` 把持仓数据写入这个磁盘。

## 截图导入的大模型解析

截图导入后端支持两种模式：

- 配置了 `OPENAI_API_KEY`：iOS 可传 OCR 文本，PWA 可传压缩截图，后端用 OpenAI 做结构化解析。
- 未配置 `OPENAI_API_KEY`：仅使用基础规则解析 OCR 文本，PWA 图片识别不可用。

在 Render 服务的 `Environment` 里添加：

```text
OPENAI_API_KEY=你的 OpenAI API Key
```

可选配置模型：

```text
OPENAI_MODEL=gpt-4.1-mini
```

改完环境变量后，点击 Render 的 `Manual Deploy` 或等待自动部署生效。

## T-1 收盘价定时刷新

持仓提交和编辑只记录用户提交的内容，不会马上调用行情接口。每天收盘后由定时任务调用后端，把 `lastPrice` 更新为最近一个交易日收盘价。

行情源配置：

```text
ALPHA_VANTAGE_API_KEY=你的 Alpha Vantage API Key
```

未配置 `ALPHA_VANTAGE_API_KEY` 时，后端不会覆盖已有价格。当前支持美股、A 股、基金/ETF、加密货币；现金类持仓不会刷新价格。港股等其他市场需要先用 Alpha Vantage 的符号搜索确认后缀后再接入。

刷新接口需要一段私密 token，Render 和 GitHub Actions 必须配置成同一个值：

```text
PRICE_REFRESH_TOKEN=一段随机字符串，例如 openssl rand -hex 32 生成的结果
```

### 在 Render 填环境变量

1. 打开 Render Dashboard。
2. 进入 `position-circle-api` 服务。
3. 点击左侧 `Environment`。
4. 点击 `+ Add Environment Variable`。
5. 分别添加：

```text
GOOGLE_CLIENT_ID=你的 Google Web application Client ID
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
ALPHA_VANTAGE_API_KEY=你的 Alpha Vantage API Key
PRICE_REFRESH_TOKEN=同一段刷新密钥
```

6. 选择 `Save and deploy` 或 `Save, rebuild, and deploy`。

### 在 GitHub 填定时任务密钥

项目包含 `.github/workflows/refresh-prices.yml`，默认在 UTC 周一到周五 22:30 运行，也就是新加坡时间次日 06:30，通常已经过了美股收盘。

1. 打开 GitHub 仓库 `no77312/finance`。
2. 进入 `Settings` -> `Secrets and variables` -> `Actions`。
3. 在 `Secrets` 里新增：

```text
PRICE_REFRESH_TOKEN=和 Render 一样的刷新密钥
```

4. 可选：在 `Variables` 里新增：

```text
POSITION_CIRCLE_API_URL=https://position-circle-api.onrender.com
```

不填 `POSITION_CIRCLE_API_URL` 时，workflow 默认调用 `https://position-circle-api.onrender.com`。

### 手动测试定时刷新

GitHub 页面里进入 `Actions` -> `Refresh closing prices` -> `Run workflow`。如果 Render 已配置 `ALPHA_VANTAGE_API_KEY` 和同一个 `PRICE_REFRESH_TOKEN`，任务会调用：

```text
POST https://position-circle-api.onrender.com/api/admin/prices/refresh
```

## 接入 iOS App

当前 iOS App 已默认连接：

```swift
URL(string: "https://position-circle-api.onrender.com")!
```

如果你改了 Render 服务名或绑定了自定义域名，再把它替换成新的 HTTPS 地址：

```swift
URL(string: "https://你的后端域名")!
```

然后重新编译 iOS App。

## 接入 PWA

Google 登录需要额外配置 Google OAuth Client。创建 Web application Client ID 后，在 Authorized JavaScript origins 里添加：

```text
https://position-circle-api.onrender.com
```

本地调试再加：

```text
http://localhost:8787
```

然后把 Client ID 填到 Render 环境变量：

```text
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

重新部署后，打开 Render 地址即可看到 Google 登录按钮。

## 注意

当前数据层仍是 JSON 文件 + Render Disk，适合小范围试用。真实规模变大后建议迁移到 Postgres，并把 session 存储迁到数据库。
