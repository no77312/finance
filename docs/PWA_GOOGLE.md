# PWA Google 登录配置

PWA 版使用 Google Identity Services。前端只拿 Google 返回的 ID token，后端会用 `google-auth-library` 校验 token 后再创建持仓圈自己的登录态。

## 1. 创建 Google OAuth Client

在 Google Cloud Console 里创建 OAuth 2.0 Client ID：

1. 打开 Google Auth Platform / Clients。
2. 选择或创建一个项目。
3. 创建 Client，Application type 选择 `Web application`。
4. 在 Authorized JavaScript origins 添加：

```text
https://position-circle-api.onrender.com
http://localhost:8787
```

如果本地换了端口，也把对应端口加进去，例如：

```text
http://localhost:8788
```

创建后复制形如下面这样的 Client ID：

```text
1234567890-xxxx.apps.googleusercontent.com
```

## 2. 配置 Render

在 Render 的 `position-circle-api` 服务里添加环境变量：

```text
GOOGLE_CLIENT_ID=你的 Web application Client ID
```

保存后重新部署服务。

## 3. 验证

部署完成后打开：

```text
https://position-circle-api.onrender.com
```

页面应该显示 Google 登录按钮。登录后可以：

- 创建群组。
- 复制邀请码给别人加入。
- 查看群组成员持仓。
- 提交持仓或截图导入。

## 官方文档

- Google Identity Services Setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- Verify the Google ID token: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
