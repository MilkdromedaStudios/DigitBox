export const PROFILE_COOKIE_KEY = "digitbox_profile_prefs";

export const THEME_PRESETS = {
  violet: "#8b5cf6",
  ocean: "#0ea5e9",
  emerald: "#10b981",
  sunset: "#f97316",
  rose: "#e11d48",
};

export const DEFAULT_PROFILE_PREFS = {
  displayName: "",
  identityLabel: "",
  theme: "dark",
  accentColor: "#8b5cf6",
  avatarDataUrl: "",
  showOffStats: false,
};

function normalizeHex(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  return value.toLowerCase();
}

export function sanitizeProfilePrefs(raw) {
  const next = { ...DEFAULT_PROFILE_PREFS };
  if (!raw || typeof raw !== "object") return next;

  if (typeof raw.displayName === "string") {
    next.displayName = raw.displayName.slice(0, 32).trim();
  }
  if (typeof raw.identityLabel === "string") {
    next.identityLabel = raw.identityLabel.slice(0, 48).trim();
  }
  if (raw.theme === "dark" || raw.theme === "light") {
    next.theme = raw.theme;
  }
  const accent = normalizeHex(raw.accentColor);
  if (accent) next.accentColor = accent;
  if (typeof raw.avatarDataUrl === "string" && raw.avatarDataUrl.startsWith("data:image/")) {
    next.avatarDataUrl = raw.avatarDataUrl;
  }
  if (typeof raw.showOffStats === "boolean") {
    next.showOffStats = raw.showOffStats;
  }
  return next;
}

export function readProfilePrefsFromCookie() {
  if (typeof document === "undefined") return { ...DEFAULT_PROFILE_PREFS };
  const entry = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PROFILE_COOKIE_KEY}=`));
  if (!entry) return { ...DEFAULT_PROFILE_PREFS };

  try {
    const encoded = entry.slice(PROFILE_COOKIE_KEY.length + 1);
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return sanitizeProfilePrefs(parsed);
  } catch {
    return { ...DEFAULT_PROFILE_PREFS };
  }
}

export function saveProfilePrefsToCookie(prefs) {
  if (typeof document === "undefined") return;
  const safe = sanitizeProfilePrefs(prefs);
  const encoded = encodeURIComponent(JSON.stringify(safe));
  document.cookie = `${PROFILE_COOKIE_KEY}=${encoded}; path=/; max-age=31536000; samesite=lax`;
}
