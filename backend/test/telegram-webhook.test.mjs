import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../src/store.js";
import { createPositionCircleServer } from "../src/server.js";

const seedFile = new URL("../data/seed.json", import.meta.url).pathname;
const groupID = "D54C3FB6-11E8-447D-A2BB-EF9505087101";
const inviteCode = "LONG-2026";
const chatID = -1002000000001;

process.env.PRICE_REFRESH_DISABLED = "1";
process.env.TELEGRAM_BOT_TOKEN = "webhook-test-bot-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-test-secret";

const telegramReplies = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.telegram.org")) {
    telegramReplies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return originalFetch(url, options);
};

const tempDir = await mkdtemp(join(tmpdir(), "pc-telegram-webhook-"));
const dataFile = join(tempDir, "store.json");
const store = new FileStore({ dataFile, seedFile });
const server = createPositionCircleServer({ store });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

try {
  await rejectsWithoutSecret();
  await rejectsWithWrongSecret();
  await bindsGroupByInviteCode();
  await rejectsUnknownInviteCode();
  await unbindsGroup();
  console.log("telegram-webhook checks passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = originalFetch;
}

async function rejectsWithoutSecret() {
  const response = await postUpdate(updateWithText("/bind LONG-2026"), {});
  assert.equal(response.status, 403);
}

async function rejectsWithWrongSecret() {
  const response = await postUpdate(updateWithText("/bind LONG-2026"), {
    "X-Telegram-Bot-Api-Secret-Token": "nope"
  });
  assert.equal(response.status, 403);
}

async function bindsGroupByInviteCode() {
  telegramReplies.length = 0;
  const response = await postUpdate(updateWithText(`/bind ${inviteCode.toLowerCase()}`), secretHeader());
  assert.equal(response.status, 200);

  const stored = JSON.parse(await readFile(dataFile, "utf8"));
  const group = stored.groups.find((candidate) => candidate.id === groupID);
  assert.equal(String(group.telegramChatID), String(chatID), "group should be bound to the chat id");

  assert.equal(telegramReplies.length, 1);
  assert.equal(String(telegramReplies[0].chat_id), String(chatID));
  assert.ok(telegramReplies[0].text.includes("已绑定"), "should confirm binding");
}

async function rejectsUnknownInviteCode() {
  telegramReplies.length = 0;
  const response = await postUpdate(updateWithText("/bind NOPE-9999"), secretHeader());
  assert.equal(response.status, 200);
  assert.ok(telegramReplies[0].text.includes("没找到"), "should report unknown invite code");

  // 绑定关系不应被未知邀请码破坏。
  const stored = JSON.parse(await readFile(dataFile, "utf8"));
  const group = stored.groups.find((candidate) => candidate.id === groupID);
  assert.equal(String(group.telegramChatID), String(chatID));
}

async function unbindsGroup() {
  telegramReplies.length = 0;
  const response = await postUpdate(updateWithText("/unbind"), secretHeader());
  assert.equal(response.status, 200);
  assert.ok(telegramReplies[0].text.includes("已解绑"));

  const stored = JSON.parse(await readFile(dataFile, "utf8"));
  const group = stored.groups.find((candidate) => candidate.id === groupID);
  assert.ok(!group.telegramChatID, "telegramChatID should be cleared after unbind");
}

function updateWithText(text) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 555, is_bot: false, first_name: "Tester" },
      chat: { id: chatID, type: "supergroup", title: "测试群" },
      date: 1700000000,
      text
    }
  };
}

function secretHeader() {
  return { "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET };
}

async function postUpdate(update, headers) {
  return originalFetch(`${baseURL}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(update)
  });
}
