// 一次性把 Telegram webhook 指向后端的 /api/telegram/webhook。
//
// 用法：
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     node scripts/set-telegram-webhook.mjs https://your-app.onrender.com
//
// 之后用户把机器人拉进 Telegram 群，发送 /bind <持仓圈邀请码> 即可完成绑定。

const baseURL = (process.argv[2] || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !secret || !baseURL) {
  console.error("缺少参数。需要：");
  console.error("  环境变量 TELEGRAM_BOT_TOKEN");
  console.error("  环境变量 TELEGRAM_WEBHOOK_SECRET");
  console.error("  命令行第一个参数：后端公网地址，例如 https://position-circle-api.onrender.com");
  process.exit(1);
}

const webhookURL = `${baseURL}/api/telegram/webhook`;

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookURL,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true
  })
});

const result = await response.json();
console.log("setWebhook ->", JSON.stringify(result, null, 2));
console.log("webhook url:", webhookURL);
if (!result.ok) {
  process.exit(1);
}
