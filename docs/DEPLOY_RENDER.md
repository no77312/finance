# Render 部署指南

本项目已经包含 `render.yaml`，可以用 Render Blueprint 从 GitHub 直接创建后端服务。

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

截图导入会先在 iOS 本地做 OCR，然后把识别出的文字发给后端解析。后端支持两种模式：

- 配置了 `OPENAI_API_KEY`：使用大模型结构化解析。
- 未配置 `OPENAI_API_KEY`：使用基础规则解析，仍可跑通，但需要更多人工确认。

在 Render 服务的 `Environment` 里添加：

```text
OPENAI_API_KEY=你的 OpenAI API Key
```

可选配置模型：

```text
OPENAI_MODEL=gpt-4.1-mini
```

改完环境变量后，点击 Render 的 `Manual Deploy` 或等待自动部署生效。

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

## 注意

当前后端仍是原型登录方案，使用 `X-Member-ID` 表示当前用户。上线给真实用户前，需要替换成 Apple 登录或其他服务端认证方案。
