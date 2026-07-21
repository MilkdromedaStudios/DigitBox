// digitbox/lib/notes.js
//
// A personal "jot things down" scratchpad, saved to this browser. localStorage
// is the primary store (handles long notes); a cookie mirror is kept only when
// the text is small enough to fit.

export const NOTES_STORAGE_KEY = "digitbox_notes_v1";
export const NOTES_COOKIE_KEY = "digitbox_notes";

const COOKIE_MAX_BYTES = 3500;

function fromCookie() {
  if (typeof document === "undefined") return "";
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${NOTES_COOKIE_KEY}=`));
  if (!row) return "";
  try {
    return decodeURIComponent(row.slice(NOTES_COOKIE_KEY.length + 1));
  } catch {
    return "";
  }
}

export function readNotes() {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
      if (raw != null) return raw;
    } catch {
      /* fall through */
    }
  }
  return fromCookie();
}

export function writeNotes(text) {
  const value = typeof text === "string" ? text : "";
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(NOTES_STORAGE_KEY, value);
    } catch {
      /* ignore quota */
    }
  }
  if (typeof document !== "undefined") {
    const encoded = encodeURIComponent(value);
    if (`${NOTES_COOKIE_KEY}=${encoded}`.length <= COOKIE_MAX_BYTES) {
      document.cookie = `${NOTES_COOKIE_KEY}=${encoded}; path=/; max-age=31536000; samesite=lax`;
    } else {
      // Too big for a cookie — clear any stale cookie copy.
      document.cookie = `${NOTES_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
    }
  }
}
