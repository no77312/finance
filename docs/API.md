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

原型阶段使用 `X-Member-ID` 表示当前用户：

```text
X-Member-ID: 4D99EF67-4E8F-4BA6-9E96-1E62E7680010
```

生产版本必须替换为登录态和服务端鉴权，不能信任客户端传入的 member id。

## Endpoints

### GET /health

健康检查。

### GET /api/bootstrap

返回 iOS 启动所需的群组、持仓和当前成员 ID。

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

### GET /api/groups/:groupID

返回单个群组。

### GET /api/groups/:groupID/holdings

返回群组持仓列表。

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

### PUT /api/groups/:groupID/holdings/:holdingID

更新自己的持仓。

### DELETE /api/groups/:groupID/holdings/:holdingID

删除自己的持仓。

### GET /api/groups/:groupID/analytics

返回按币种汇总、共识标的和成员汇总。
