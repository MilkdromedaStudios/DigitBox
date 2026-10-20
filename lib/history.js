// digitbox/lib/history.js
//
// Per-device watch/play history for the Library page. localStorage only —
// history is personal to the browser, like likes and notes.

export const HISTORY_STORAGE_KEY = "digitbox_history_v1";
export const HISTORY_UPDATED_EVENT = "digitbox:history-updated";

const MAX_ITEMS = 60;

export function readHistory() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.key) : [];
  } catch {
    return [];
  }
}

function writeHistory(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
}

// key is "video:<id>" or "game:<slug>", matching the catalog item keys.
export function recordHistory(key, title) {
  if (!key) return;
  const rest = readHistory().filter((item) => item.key !== key);
  writeHistory([{ key, title: String(title || ""), at: Date.now() }, ...rest]);
}

export function clearHistory() {
  writeHistory([]);
}
