// digitbox/lib/likes.js
//
// Per-device "liked projects" list. Stored in localStorage with a cookie
// mirror (so it survives, matching how the rest of the site persists prefs).
// No backend needed — likes are personal to the browser.

export const LIKES_STORAGE_KEY = "digitbox_liked_projects_v1";
export const LIKES_COOKIE_KEY = "digitbox_liked_projects";
export const LIKES_UPDATED_EVENT = "digitbox:likes-updated";

const COOKIE_MAX_BYTES = 3500;

function fromCookie() {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${LIKES_COOKIE_KEY}=`));
  if (!row) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(row.slice(LIKES_COOKIE_KEY.length + 1)));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readLikes() {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LIKES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* fall through to cookie */
    }
  }
  return fromCookie() || [];
}

export function isLiked(slug) {
  return readLikes().includes(slug);
}

export function writeLikes(slugs) {
  const unique = Array.from(new Set(slugs.filter(Boolean)));
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(unique));
    } catch {
      /* ignore quota */
    }
  }
  if (typeof document !== "undefined") {
    const encoded = encodeURIComponent(JSON.stringify(unique));
    if (`${LIKES_COOKIE_KEY}=${encoded}`.length <= COOKIE_MAX_BYTES) {
      document.cookie = `${LIKES_COOKIE_KEY}=${encoded}; path=/; max-age=31536000; samesite=lax`;
    }
    window.dispatchEvent(new Event(LIKES_UPDATED_EVENT));
  }
  return unique;
}

export function toggleLike(slug) {
  const current = readLikes();
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
  return writeLikes(next);
}
