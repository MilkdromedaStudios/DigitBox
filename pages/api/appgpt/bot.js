export const config = { runtime: "edge" };

const APP_URL = "https://digitbox.dev/appgpt";

export default async function handler(request) {
  const botToken = process.env.APPGPT_TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  if (!botToken) return json({ error: "APPGPT_TELEGRAM_BOT_TOKEN is not configured." }, 503);

  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.searchParams.get("setup") === "1") {
      try {
        const result = await setupTelegram(botToken, url.origin);
        return json({ ok: true, ...result });
      } catch (error) {
        return json({ error: error.message || "Telegram setup failed." }, 500);
      }
    }
    return json({ ok: true, service: "AppGPT Telegram bot", webhook: `${url.origin}/api/appgpt/bot` });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = await webhookSecret(botToken);
  const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!constantTimeEqual(receivedSecret, expectedSecret)) return json({ error: "Unauthorized" }, 401);

  let update;
  try { update = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    await handleUpdate(update, botToken);
  } catch (error) {
    console.error("AppGPT Telegram webhook failed", error);
  }

  return json({ ok: true });
}

async function handleUpdate(update, botToken) {
  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== "string") return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  if (!text) return;
  const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();

  if (command === "/start" || command === "/menu") return sendWorkspace(chatId, message.from, botToken);
  if (command === "/help") return sendHelp(chatId, botToken);

  // Normal Telegram messages become a one-tap handoff to the browser builder.
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "✦ Ready to build that in AppGPT. Tap below and the request will be carried into the web builder automatically.",
    reply_markup: {
      inline_keyboard: [[{
        text: "🚀 Build this on Web",
        web_app: { url: buildUrl(text) }
      }], [{
        text: "↩️ AppGPT menu",
        web_app: { url: APP_URL }
      }]]
    }
  });
}

async function sendWorkspace(chatId, user, botToken) {
  const firstName = escapeHtml(user?.first_name || "there");
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: `<b>AppGPT ✦</b>\nHi ${firstName}! What do you want to do?\n\nYou can also just type an app idea here and I’ll give you a one-tap Build on Web button.`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Build a new app", web_app: { url: `${APP_URL}?view=build` } }],
        [{ text: "📂 My apps", web_app: { url: `${APP_URL}?view=chats` } }],
        [{ text: "⚙️ AI settings", web_app: { url: `${APP_URL}?view=settings` } }]
      ]
    }
  });
}

async function sendHelp(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>AppGPT</b>\n\n/start — open the menu\n/menu — open the menu\n\nOr just type what you want to build. I’ll send a Build on Web button with your request already filled in.",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🌐 Open AppGPT", web_app: { url: APP_URL } }]] }
  });
}

function buildUrl(prompt) {
  const url = new URL(APP_URL);
  url.searchParams.set("view", "build");
  url.searchParams.set("prompt", String(prompt || "").slice(0, 3000));
  url.searchParams.set("autobuild", "1");
  return url.href;
}

async function setupTelegram(botToken, origin) {
  const secret = await webhookSecret(botToken);
  const webhookUrl = `${origin.replace(/\/$/, "")}/api/appgpt/bot`;

  await telegram(botToken, "setMyCommands", {
    commands: [
      { command: "start", description: "Open AppGPT" },
      { command: "menu", description: "Show the AppGPT menu" },
      { command: "help", description: "How to use AppGPT" }
    ]
  });

  await telegram(botToken, "setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open AppGPT",
      web_app: { url: APP_URL }
    }
  });

  await telegram(botToken, "setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false
  });

  const me = await telegram(botToken, "getMe", {});
  return { webhook: webhookUrl, bot: me?.username ? `@${me.username}` : null };
}

async function webhookSecret(botToken) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`digitbox-appgpt-webhook:${botToken}`));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function telegram(botToken, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data?.description || `Telegram ${method} failed (${response.status})`);
  return data.result;
}

function constantTimeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
