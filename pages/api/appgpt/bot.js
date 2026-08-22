export const config = { runtime: "edge" };

const APP_URL = "https://digitbox.dev/appgpt";
const RUNNER_URL = "https://digitbox.dev/appgpt/telegram-runner.html";
const BUILD_LINK_MAX_AGE = 30 * 60;
const MAX_HTML_BYTES = 500000;

const MAIN_MENU = {
  keyboard: [
    [{ text: "➕ New app" }, { text: "📂 Projects" }],
    [{ text: "🧩 Templates" }, { text: "⚙️ Settings" }],
    [{ text: "❓ Help" }]
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Type an app idea or choose a menu item…"
};

const TEMPLATE_MENU = {
  keyboard: [
    [{ text: "📚 Study app" }, { text: "🔥 Habit tracker" }],
    [{ text: "🏆 Leaderboard" }, { text: "🧰 Utility app" }],
    [{ text: "⬅️ Main menu" }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

const SETTINGS_MENU = {
  keyboard: [
    [{ text: "☁️ AppGPT Cloud" }, { text: "💻 Local AI backup" }],
    [{ text: "🌐 Advanced settings" }],
    [{ text: "⬅️ Main menu" }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

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
    if (url.searchParams.get("source") === "1") return revisionSource(url, botToken);
    return json({ ok: true, service: "AppGPT Telegram bot", webhook: `${url.origin}/api/appgpt/bot`, mode: "cloud-first" });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (url.searchParams.get("complete") === "1") return completeBrowserBuild(request, botToken);

  const expectedSecret = await webhookSecret(botToken);
  const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!constantTimeEqual(receivedSecret, expectedSecret)) return json({ error: "Unauthorized" }, 401);

  let update;
  try { update = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  try { await handleUpdate(update, botToken); }
  catch (error) { console.error("AppGPT Telegram webhook failed", error); }
  return json({ ok: true });
}

async function handleUpdate(update, botToken) {
  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== "string") return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  if (!text) return;
  const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();

  if (command === "/start" || command === "/menu" || text === "⬅️ Main menu") return sendMainMenu(chatId, message.from, botToken);
  if (command === "/help" || text === "❓ Help") return sendHelp(chatId, botToken);
  if (text === "➕ New app") return askForApp(chatId, botToken);
  if (text === "📂 Projects") return sendProjects(chatId, botToken);
  if (text === "🧩 Templates") return sendTemplates(chatId, botToken);
  if (text === "⚙️ Settings") return sendSettings(chatId, botToken);
  if (text === "☁️ AppGPT Cloud") return sendCloudInfo(chatId, botToken);
  if (text === "💻 Local AI backup") return sendLocalAIInfo(chatId, botToken);
  if (text === "🌐 Advanced settings") return sendAdvancedSettings(chatId, botToken);

  const repliedDocument = message.reply_to_message?.document;
  if (isHtmlDocument(repliedDocument)) return sendRevisionReady(chatId, text, repliedDocument.file_id, botToken);

  const template = templatePrompt(text);
  if (template) return sendBuildReady(chatId, template, botToken, `Template: ${text}`);
  return sendBuildReady(chatId, text, botToken);
}

async function sendMainMenu(chatId, user, botToken) {
  const firstName = escapeHtml(user?.first_name || "there");
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: `<b>AppGPT ✦</b>\nHi ${firstName}. Build and revise apps from Telegram.\n\nAppGPT Cloud is the default, so your phone/tablet GPU is not used.`,
    parse_mode: "HTML",
    reply_markup: MAIN_MENU
  });
}

async function askForApp(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "✦ What app do you want to build?\n\nDescribe it normally — features, style, anything you want.",
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Example: a glass habit tracker with streaks…" }
  });
}

async function sendProjects(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>📂 Projects</b>\n\nEach build is an <code>index.html</code> file in this chat. Reply directly to any AppGPT HTML file with a change request to revise that exact version.",
    parse_mode: "HTML",
    reply_markup: MAIN_MENU
  });
}

async function sendTemplates(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>🧩 Templates</b>\nPick a starting point. After it builds, reply to the HTML file with changes.",
    parse_mode: "HTML",
    reply_markup: TEMPLATE_MENU
  });
}

async function sendSettings(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>⚙️ AI mode</b>\n\n<b>Default: ☁️ AppGPT Cloud</b>\nRuns the LLM on your configured external AI provider. No device GPU, no Puter, and no Cloudflare Workers AI.\n\n<b>Optional: 💻 Local AI backup</b>\nOnly runs if you explicitly choose it after a cloud failure on a WebGPU-capable device.",
    parse_mode: "HTML",
    reply_markup: SETTINGS_MENU
  });
}

async function sendCloudInfo(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>☁️ AppGPT Cloud</b>\n\n• Default for builds and revisions\n• Works on iPhone, iPad, Android, and desktop\n• Uses the DigitBox server-side AI provider configured with <code>AI_PROVIDER</code> + secret <code>AI_API_KEY</code>\n• Does not use your device GPU\n• Does not use Puter\n• Does not use Cloudflare Workers AI",
    parse_mode: "HTML",
    reply_markup: SETTINGS_MENU
  });
}

async function sendLocalAIInfo(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>💻 Local AI backup</b>\n\nLocal AI is no longer automatic. If AppGPT Cloud fails and your browser supports WebGPU, the runner can offer Local AI as an explicit backup.\n\n⚠️ Local generation can use a lot of GPU and memory, so it only starts after you choose it.",
    parse_mode: "HTML",
    reply_markup: SETTINGS_MENU
  });
}

async function sendAdvancedSettings(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "Advanced provider settings are optional. Telegram mode uses the server-side AppGPT Cloud provider by default.",
    reply_markup: { inline_keyboard: [[{ text: "Open advanced settings", web_app: { url: `${APP_URL}?view=settings` } }]] }
  });
}

async function sendHelp(chatId, botToken) {
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: "<b>AppGPT Telegram mode</b>\n\n1. Tap <b>➕ New app</b> or type an app idea.\n2. Tap <b>⚡ Build app</b>.\n3. AppGPT Cloud generates it without using your device GPU.\n4. The finished <code>index.html</code> comes back here.\n5. Reply to that HTML file with changes to revise it.\n\nLocal AI is only an optional backup if Cloud is unavailable.",
    parse_mode: "HTML",
    reply_markup: MAIN_MENU
  });
}

async function sendBuildReady(chatId, prompt, botToken, label = "") {
  const cleanPrompt = String(prompt || "").trim().slice(0, 3000);
  if (!cleanPrompt) return askForApp(chatId, botToken);
  const url = await signedRunnerUrl(botToken, chatId, cleanPrompt, "build", "");
  const summary = cleanPrompt.length > 260 ? `${cleanPrompt.slice(0, 257)}…` : cleanPrompt;
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: `${label ? `<b>${escapeHtml(label)}</b>\n` : ""}<b>Ready to build</b>\n${escapeHtml(summary)}\n\nAppGPT Cloud runs the AI off-device.`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⚡ Build app", web_app: { url } }]] }
  });
}

async function sendRevisionReady(chatId, editPrompt, fileId, botToken) {
  const cleanPrompt = String(editPrompt || "").trim().slice(0, 3000);
  if (!cleanPrompt || !fileId) return;
  const url = await signedRunnerUrl(botToken, chatId, cleanPrompt, "revise", fileId);
  const summary = cleanPrompt.length > 260 ? `${cleanPrompt.slice(0, 257)}…` : cleanPrompt;
  return telegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: `<b>✏️ Ready to revise this app</b>\n${escapeHtml(summary)}\n\nAppGPT Cloud will load the HTML file you replied to and return a complete revised version.`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⚡ Apply revision", web_app: { url } }]] }
  });
}

function templatePrompt(text) {
  const templates = {
    "📚 Study app": "Build a polished study assistant with flashcards, a quiz mode, streaks, progress saving, and Telegram-friendly mobile navigation.",
    "🔥 Habit tracker": "Build a modern habit tracker with daily checkoffs, streaks, weekly progress, categories, local persistence, and a glass-style mobile UI.",
    "🏆 Leaderboard": "Build a competitive leaderboard app with player ranks, search/filtering, achievement badges, profile details, and Telegram haptic feedback.",
    "🧰 Utility app": "Build a useful mobile utility app with a clean dashboard, saved recent activity, fast controls, local persistence, and Telegram-friendly navigation."
  };
  return templates[text] || "";
}

async function signedRunnerUrl(botToken, chatId, prompt, mode, fileId) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signBuild(botToken, chatId, ts, mode, prompt, fileId);
  const url = new URL(RUNNER_URL);
  url.searchParams.set("chat", String(chatId));
  url.searchParams.set("ts", String(ts));
  url.searchParams.set("mode", mode);
  url.searchParams.set("prompt", prompt);
  if (fileId) url.searchParams.set("file", fileId);
  url.searchParams.set("sig", sig);
  return url.href;
}

async function revisionSource(url, botToken) {
  const ticket = ticketFromSearch(url.searchParams);
  const authError = await validateTicket(botToken, ticket);
  if (authError) return json({ error: authError }, authError === "Build link expired" ? 401 : 403);
  if (ticket.mode !== "revise" || !ticket.fileId) return json({ error: "Missing revision source" }, 400);
  try {
    const html = await telegramFileText(botToken, ticket.fileId);
    if (!looksLikeHtml(html) || html.length > MAX_HTML_BYTES) return json({ error: "The replied file is not a usable HTML document." }, 400);
    return json({ ok: true, html });
  } catch (error) {
    return json({ error: error.message || "Could not load the previous HTML file." }, 500);
  }
}

async function completeBrowserBuild(request, botToken) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const ticket = {
    chatId: String(body?.chat || ""), ts: Number(body?.ts || 0),
    mode: body?.mode === "revise" ? "revise" : "build",
    prompt: String(body?.prompt || "").slice(0, 3000), fileId: String(body?.file || ""), sig: String(body?.sig || "")
  };
  const html = String(body?.html || "");
  const buildError = String(body?.error || "").slice(0, 600);
  const authError = await validateTicket(botToken, ticket);
  if (authError) return json({ error: authError }, authError === "Build link expired" ? 401 : 403);

  if (buildError) {
    await telegram(botToken, "sendMessage", { chat_id: ticket.chatId, text: `⚠️ AppGPT could not finish this ${ticket.mode === "revise" ? "revision" : "build"}.\n\n${buildError}`, reply_markup: MAIN_MENU });
    return json({ ok: true, sent: "error" });
  }

  if (!looksLikeHtml(html) || html.length > MAX_HTML_BYTES) return json({ error: "Runner did not return a valid HTML file" }, 400);
  const caption = ticket.mode === "revise"
    ? "✅ Revision complete. Reply to this HTML file with another change."
    : "✅ Build complete. Reply to this HTML file with a change to revise it.";
  await telegramDocument(botToken, ticket.chatId, "index.html", html, caption, true);
  return json({ ok: true, sent: "index.html", mode: ticket.mode });
}

function ticketFromSearch(params) {
  return {
    chatId: String(params.get("chat") || ""), ts: Number(params.get("ts") || 0),
    mode: params.get("mode") === "revise" ? "revise" : "build",
    prompt: String(params.get("prompt") || "").slice(0, 3000), fileId: String(params.get("file") || ""), sig: String(params.get("sig") || "")
  };
}

async function validateTicket(botToken, ticket) {
  if (!ticket.chatId || !ticket.ts || !ticket.prompt || !ticket.sig) return "Incomplete build token";
  if (ticket.mode === "revise" && !ticket.fileId) return "Incomplete revision token";
  if (Math.abs(Math.floor(Date.now() / 1000) - ticket.ts) > BUILD_LINK_MAX_AGE) return "Build link expired";
  const expected = await signBuild(botToken, ticket.chatId, ticket.ts, ticket.mode, ticket.prompt, ticket.fileId);
  return constantTimeEqual(ticket.sig, expected) ? "" : "Invalid build token";
}

async function setupTelegram(botToken, origin) {
  const secret = await webhookSecret(botToken);
  const webhookUrl = `${origin.replace(/\/$/, "")}/api/appgpt/bot`;
  await telegram(botToken, "setMyCommands", { commands: [
    { command: "start", description: "Open the AppGPT menu" },
    { command: "menu", description: "Show the Telegram menu" },
    { command: "help", description: "How AppGPT Telegram mode works" }
  ] });
  await telegram(botToken, "setChatMenuButton", { menu_button: { type: "commands" } });
  await telegram(botToken, "setWebhook", { url: webhookUrl, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false });
  const me = await telegram(botToken, "getMe", {});
  return { webhook: webhookUrl, bot: me?.username ? `@${me.username}` : null, mode: "cloud-first" };
}

async function signBuild(botToken, chatId, ts, mode, prompt, fileId) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(botToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = new TextEncoder().encode(`${chatId}\n${ts}\n${mode}\n${prompt}\n${fileId || ""}`);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return [...signed].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function webhookSecret(botToken) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`digitbox-appgpt-webhook:${botToken}`));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function telegramFileText(botToken, fileId) {
  const file = await telegram(botToken, "getFile", { file_id: fileId });
  if (!file?.file_path) throw new Error("Telegram did not return the HTML file path.");
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!response.ok) throw new Error(`Could not download the Telegram HTML file (${response.status}).`);
  return response.text();
}

async function telegram(botToken, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data?.description || `Telegram ${method} failed (${response.status})`);
  return data.result;
}

async function telegramDocument(botToken, chatId, filename, html, caption, forceReply = false) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  if (forceReply) form.set("reply_markup", JSON.stringify({ force_reply: true, selective: true, input_field_placeholder: "Describe the next change…" }));
  form.set("document", new Blob([html], { type: "text/html;charset=utf-8" }), filename);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data?.description || `Telegram sendDocument failed (${response.status})`);
  return data.result;
}

function isHtmlDocument(document) {
  if (!document?.file_id) return false;
  const name = String(document.file_name || "").toLowerCase();
  const mime = String(document.mime_type || "").toLowerCase();
  return name.endsWith(".html") || mime === "text/html";
}

function looksLikeHtml(html) {
  const text = String(html || "").trim();
  return /^<!doctype html>/i.test(text) && /<html(?:\s|>)/i.test(text) && /<head(?:\s|>)/i.test(text) && /<body(?:\s|>)/i.test(text) && /<\/html>\s*$/i.test(text) && text.length >= 180;
}

function constantTimeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
