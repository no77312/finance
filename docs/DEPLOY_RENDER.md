# Render 部署指南

本项目已经包含 `render.yaml`，可以用 Render Blueprint 从 GitHub 直接创建后端服务。

## 费用预估

当前配置：

```text
Web Service: free
Region: singapore
Persistent Disk: none
```

按 Render 当前公开价格，Web Service Free 适合原型试跑：

```text
$0/月
```

免费模式没有持久化磁盘。服务重启、休眠恢复或重新部署后，运行时写入的 `backend/data/store.json` 可能丢失，并回到 `backend/data/seed.json` 的演示数据。

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

当前免费配置没有 Persistent Disk：

```yaml
plan: free
```

这适合验证接口、iOS 联调和 Demo。等你确认要长期使用时，再把 `render.yaml` 改回付费持久化配置：

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

## 接入 iOS App

部署成功后，把 `PositionCircleAPIClient.swift` 里的本地地址：

```swift
URL(string: "http://127.0.0.1:8787")!
```

改成 Render 地址：

```swift
URL(string: "https://position-circle-api.onrender.com")!
```

然后重新编译 iOS App。

## 注意

当前后端仍是原型登录方案，使用 `X-Member-ID` 表示当前用户。上线给真实用户前，需要替换成 Apple 登录或其他服务端认证方案。
