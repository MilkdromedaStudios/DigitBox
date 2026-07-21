// digitbox/lib/aiChats.js
//
// Saves Digitbox AI conversations on this device (localStorage). Each chat is
// { id, title, createdAt, updatedAt, messages: [{ role, content }] } where role
// is "user" or "assistant" (the system prompt is added server-side).

export const AI_CHATS_KEY = "digitbox_ai_chats_v1";

function uid() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function readChats() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AI_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeChats(chats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_CHATS_KEY, JSON.stringify(chats));
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

/** Inserts or updates a chat, keeping the list ordered by most-recent. */
export function upsertChat(chats, chat) {
  const updated = { ...chat, updatedAt: Date.now() };
  const rest = chats.filter((c) => c.id !== chat.id);
  const next = [updated, ...rest];
  writeChats(next);
  return next;
}

export function deleteChat(chats, id) {
  const next = chats.filter((c) => c.id !== id);
  writeChats(next);
  return next;
}

export function renameChat(chats, id, title) {
  const next = chats.map((c) => (c.id === id ? { ...c, title: title || c.title } : c));
  writeChats(next);
  return next;
}
