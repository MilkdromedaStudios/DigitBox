// digitbox/lib/aiClient.js
//
// DigitBox AI in the browser: plan status, streamed chat and the files a
// reply can contain. The API (pages/api/ai/) lives on the same Cloudflare
// deployment as the account API, which owns the login sessions.

import { accountApiRoot, getCloudAuthToken } from "./account";

export const STATIC_DEMO_URL = "https://milkdromedastudios.github.io/Static/";

function aiRoot() {
  return accountApiRoot() + "/api/ai";
}

function authHeaders() {
  const token = getCloudAuthToken();
  return token ? { Authorization: "Bearer " + token } : {};
}

export async function loadAiStatus() {
  const response = await fetch(aiRoot() + "/status", { headers: { Accept: "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !body.models) throw new Error(body.error || "Couldn't reach DigitBox AI.");
  return body;
}

export async function connectSite(origin) {
  const response = await fetch(aiRoot() + "/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
    body: JSON.stringify({ origin }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) throw new Error(body.error || "Couldn't connect to DigitBox AI.");
  return body;
}

// Streams a reply. onText receives the whole reply so far after each piece.
// Resolves to { text, model, remaining }; rejects with an Error carrying
// .code (signed_out, limit_reached, pro_required, provider_busy…).
export async function streamAiChat({ messages, model, signal, onText }) {
  let response;
  try {
    response = await fetch(aiRoot() + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
      body: JSON.stringify({ messages, model, surface: "digitbox" }),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Couldn't reach DigitBox AI. Check your connection and try again.");
  }
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || "DigitBox AI request failed (" + response.status + ").");
    error.code = body.code || "";
    error.status = response.status;
    throw error;
  }

  const remainingHeader = response.headers.get("X-AI-Remaining");
  const result = {
    text: "",
    model: response.headers.get("X-AI-Model") || "",
    remaining: remainingHeader === null || remainingHeader === "unlimited" ? null : Number(remainingHeader),
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return finish(result);
      let event;
      try {
        event = JSON.parse(data);
      } catch (_) {
        continue;
      }
      if (event.error) {
        const error = new Error(event.error.message || "The model stopped with an error.");
        error.code = "provider_error";
        error.partial = result.text;
        throw error;
      }
      const piece = event.choices?.[0]?.delta?.content;
      if (piece) {
        result.text += piece;
        onText?.(result.text);
      }
    }
  }
  return finish(result);
}

function finish(result) {
  if (!result.text.trim()) {
    const error = new Error("The model sent an empty reply. Try again, or rephrase your message.");
    error.code = "empty_reply";
    throw error;
  }
  return result;
}

// ------------------------------------------------------------------ files

const FILE_TYPES = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  py: "text/x-python",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  svg: "image/svg+xml",
  obj: "model/obj",
  ics: "text/calendar",
  eml: "message/rfc822",
};

// ```lang file=name.ext … ``` blocks (the system prompt asks for them). The
// last one may still be streaming, so an unclosed block counts too.
const FILE_BLOCK = /```[\w.+-]*[ \t]+file(?:name)?=["']?([^\s"'`]+)["']?[^\n]*\n([\s\S]*?)(?:\n```|$)/g;

function safeName(raw) {
  const name = String(raw).split(/[\\/]/).pop().replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return FILE_TYPES[ext] ? { name, mime: FILE_TYPES[ext] } : null;
}

// Splits a reply into Markdown text and files, in order.
export function splitReply(text) {
  const parts = [];
  let cursor = 0;
  for (const match of String(text || "").matchAll(FILE_BLOCK)) {
    const file = safeName(match[1]);
    if (!file) continue;
    if (match.index > cursor) parts.push({ type: "text", text: text.slice(cursor, match.index) });
    const complete = match[0].endsWith("```");
    parts.push({ type: "file", ...file, content: match[2], complete });
    cursor = match.index + match[0].length;
  }
  if (cursor < String(text || "").length) parts.push({ type: "text", text: text.slice(cursor) });
  return parts.filter((part) => part.type === "file" || part.text.trim());
}
