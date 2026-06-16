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
DATA_FILE=/var/data/store.json
disk:
  mountPath: /var/data
  sizeGB: 1
```

这样用户提交的持仓会写到 Render Persistent Disk，服务重启和重新部署后不会丢失。

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
