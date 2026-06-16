# 持仓圈 PositionCircle

一个 iOS 群组持仓共享 App 原型：同一个群组里的成员可以提交自己的持仓，大家可以查看群组共识标的、成员持仓和个人提交记录。

## 已完成内容

- SwiftUI iOS 原型：群组首页、总览、我的持仓、成员列表、提交/编辑/删除持仓、新建群组。
- Node 后端：本地 API、文件持久化、群组/持仓 CRUD、聚合分析接口。
- iOS 网络层：启动拉取后端数据，保存/删除同步后端，后端不可用时回退到演示数据。
- 核心业务模块：成员、群组、持仓、可见性、币种、按标的聚合、按币种汇总。
- 隐私基础能力：支持完整可见、隐藏成本、仅标的三种可见性。
- Xcode 工程：`iOSApp/PositionCircle.xcodeproj`。
- SwiftPM 核心检查：`PositionCircleChecks` 可编译并验证聚合逻辑。

## 1. 启动后端

当前机器已经有 Node 26 和 npm 11，不需要额外安装后端环境。

```bash
cd backend
npm start
```

后端默认运行在：

```text
http://127.0.0.1:8787
```

首次启动会从 `backend/data/seed.json` 生成 `backend/data/store.json`，之后新增和编辑的数据会写入 `store.json`。

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
