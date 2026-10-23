// digitbox/lib/aiChats.js
//
// Saves DigitBox AI conversations on this device (localStorage). Each chat is
// { id, title, createdAt, updatedAt, messages: [{ role, content, model? }] }
// where role is "user" or "assistant" (the system prompt is added server-side).

export const AI_CHATS_KEY = "digitbox_ai_chats_v1";
const MAX_CHATS = 50;

function uid() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function readChats() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AI_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && c.id && Array.isArray(c.messages)) : [];
  } catch {
    return [];
  }
}

export function writeChats(chats) {
  if (typeof window === "undefined") return;
  // Empty chats aren't worth keeping, and the list stays small.
  const kept = chats.filter((c) => c.messages.length).slice(0, MAX_CHATS);
  try {
    window.localStorage.setItem(AI_CHATS_KEY, JSON.stringify(kept));
  } catch {
    /* ignore quota */
  }
}

export function newChat() {
  const now = Date.now();
  return { id: uid(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

export function titleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || "New chat";
}
