import { getAiConfig } from "../../../lib/ai";

export const config = { runtime: "edge" };

const MAX_AGE = 30 * 60;
const MAX_SOURCE = 70000;
const MAX_HTML = 500000;

const SYSTEM = `You are AppGPT's HTML compiler. Return exactly one complete single-file HTML document and nothing else.
OUTPUT CONTRACT:
- Begin with <!doctype html>
- End with </html>
- No Markdown fences, prose, JSON, explanations, prefaces, or suffixes
- Include all CSS and JavaScript inline
- Build a polished mobile-first app with working controls
- Use window.Telegram?.WebApp safely when useful
- Never include secrets
- Prefer a smaller complete working app over an unfinished large app`;

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const botToken = process.env.APPGPT_TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
  if (!botToken) return json({ ok: false, error: "Telegram bot token is not configured." }, 503);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const ticket = {
    chatId: String(body?.chat || ""),
    ts: Number(body?.ts || 0),
    mode: body?.mode === "revise" ? "revise" : "build",
    prompt: String(body?.prompt || "").slice(0, 3000),
    fileId: String(body?.file || ""),
    sig: String(body?.sig || "")
  };

  const authError = await validateTicket(botToken, ticket);
  if (authError) return json({ ok: false, error: authError }, authError === "Build link expired" ? 401 : 403);

  const cfg = getAiConfig();
  if (!cfg.enabled) {
    return json({
      ok: false,
      cloud_unavailable: true,
      error: "AppGPT Cloud is not configured yet. Set AI_API_KEY on the DigitBox Worker."
    }, 503);
  }

  let source = "";
  if (ticket.mode === "revise") {
    if (!ticket.fileId) return json({ ok: false, error: "Missing revision file" }, 400);
    try { source = await telegramFileText(botToken, ticket.fileId); }
    catch (error) { return json({ ok: false, error: error.message || "Could not load the HTML being revised." }, 502); }
    if (!looksLikeHtml(source)) return json({ ok: false, error: "The replied Telegram file is not valid HTML." }, 400);
    source = source.slice(0, MAX_SOURCE);
  }

  const requestText = ticket.mode === "revise"
    ? `REVISION REQUEST:\n${ticket.prompt}\n\nCURRENT HTML:\n${source}\n\nReturn the complete revised HTML document. Preserve existing features unless the request changes them.`
    : `BUILD REQUEST:\n${ticket.prompt}\n\nCreate the complete app now.`;

  try {
    const first = await providerHtml(cfg, requestText, false);
    let html = normalizeHtml(first);
    if (!looksLikeHtml(html)) {
      const retry = await providerHtml(cfg, `${requestText}\n\nIMPORTANT RETRY: Your previous output was not a complete HTML file. Make this version smaller if necessary and output ONLY the finished HTML document.`, true);
      html = normalizeHtml(retry);
    }
    if (!looksLikeHtml(html)) throw new Error("Cloud model did not return a complete HTML document after retrying.");
    if (html.length > MAX_HTML) throw new Error("Generated HTML is too large.");
    return json({ ok: true, html, model: cfg.model, provider: cfg.provider });
  } catch (error) {
    return json({ ok: false, error: error.message || "AppGPT Cloud generation failed." }, Number(error.status) || 502);
  }
}

async function providerHtml(cfg, userText, retry) {
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        "HTTP-Referer": "https://digitbox.dev",
        "X-Title": "AppGPT Telegram"
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userText }
        ],
        temperature: retry ? 0.05 : 0.15,
        max_tokens: retry ? 5200 : 7000
      })
    });
  } catch {
    const error = new Error(`Could not reach ${cfg.label}.`);
    error.status = 502;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`;
    const error = new Error(`${cfg.label} error: ${String(detail).slice(0, 260)}`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map(part => typeof part === "string" ? part : part?.text || "").join("")
    : String(content || "");
  if (!text.trim()) throw new Error("Cloud model returned an empty response.");
  return text;
}

async function validateTicket(botToken, ticket) {
  if (!ticket.chatId || !ticket.ts || !ticket.prompt || !ticket.sig) return "Incomplete build token";
  if (ticket.mode === "revise" && !ticket.fileId) return "Incomplete revision token";
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ticket.ts) > MAX_AGE) return "Build link expired";
  const expected = await signBuild(botToken, ticket.chatId, ticket.ts, ticket.mode, ticket.prompt, ticket.fileId);
  return constantTimeEqual(ticket.sig, expected) ? "" : "Invalid build token";
}

async function signBuild(botToken, chatId, ts, mode, prompt, fileId) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(botToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = new TextEncoder().encode(`${chatId}\n${ts}\n${mode}\n${prompt}\n${fileId || ""}`);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return [...signed].map(value => value.toString(16).padStart(2, "0")).join("");
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data?.description || `Telegram ${method} failed (${response.status})`);
  return data.result;
}

function normalizeHtml(raw) {
  let text = String(raw || "").trim();
  try { const parsed = JSON.parse(text); if (typeof parsed?.html === "string") text = parsed.html.trim(); } catch {}
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const positions = [text.search(/<!doctype html>/i), text.search(/<html(?:\s|>)/i), text.search(/<body(?:\s|>)/i)].filter(i => i >= 0);
  if (positions.length) text = text.slice(Math.min(...positions));
  if (/^<html(?:\s|>)/i.test(text)) text = `<!doctype html>\n${text}`;
  if (/^<body(?:\s|>)/i.test(text)) text = `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>\n${text}`;
  if (/<!doctype html>/i.test(text) && /<html(?:\s|>)/i.test(text)) {
    if (/<body(?:\s|>)/i.test(text) && !/<\/body>/i.test(text)) text += "\n</body>";
    if (!/<\/html>\s*$/i.test(text)) text += "\n</html>";
  }
  const end = text.toLowerCase().lastIndexOf("</html>");
  return (end >= 0 ? text.slice(0, end + 7) : text).trim();
}

function looksLikeHtml(html) {
  const text = String(html || "").trim();
  return /^<!doctype html>/i.test(text) && /<html(?:\s|>)/i.test(text) && /<head(?:\s|>)/i.test(text) && /<body(?:\s|>)/i.test(text) && /<\/html>\s*$/i.test(text) && text.length >= 180;
}

function constantTimeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
