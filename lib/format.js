// Small display helpers shared by the video and game cards.

export function formatCount(value) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1e6) return (n < 1e4 ? (n / 1e3).toFixed(1) : Math.round(n / 1e3)).toString().replace(/\.0$/, "") + "K";
  return (n < 1e7 ? (n / 1e6).toFixed(1) : Math.round(n / 1e6)).toString().replace(/\.0$/, "") + "M";
}

export function formatViews(value) {
  if (value == null) return "";
  return Number(value) === 1 ? "1 view" : formatCount(value) + " views";
}

const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(date, now = Date.now()) {
  const time = new Date(date || 0).getTime();
  if (!time) return "";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  for (const [unit, size] of UNITS) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return amount + " " + unit + (amount === 1 ? "" : "s") + " ago";
  }
  return "just now";
}

export function formatDate(date) {
  const time = new Date(date || 0);
  if (!time.getTime()) return "";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(time);
}
