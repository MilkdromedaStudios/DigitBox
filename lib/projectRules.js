// digitbox/lib/projectRules.js
//
// Rules for projects added from the admin page (/admin/projects), shared by
// the admin form (to explain mistakes before upload) and the server (which
// enforces them). Plain JS with no imports, so it runs in the browser and in
// edge API routes alike.

export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 220;
export const MAX_GENRE_LENGTH = 30;
// A game is one self-contained HTML file. 5 MB covers most HTML5 and
// TurboWarp games; bigger ones (like Eaglercraft) are hosted differently.
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

// Games are uploaded and loaded in pieces of this many UTF-16 units (at most
// 1.2 MB of UTF-8), one per request. Each piece is also one D1 row, under
// D1's 2 MB value limit, and keeps every request well inside the Workers
// Free plan's 10 ms of CPU.
export const PART_CHARS = 400000;
export const MAX_PARTS = 16;

// Split text into pieces of at most `size` units without cutting a surrogate
// pair in half (stored as UTF-8, a lone half would turn into U+FFFD).
export function splitText(text, size = PART_CHARS) {
  const parts = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

// Ready-made colour themes. A theme is a hue, the same way every DigitBox
// game cover is coloured (see .game-cover in styles/hub.css).
export const THEME_PRESETS = [
  { name: "Ocean", hue: 205 },
  { name: "Lagoon", hue: 175 },
  { name: "Forest", hue: 132 },
  { name: "Lime", hue: 85 },
  { name: "Sunset", hue: 28 },
  { name: "Ruby", hue: 350 },
  { name: "Candy", hue: 318 },
  { name: "Galaxy", hue: 265 },
];

export const EMOJI_SUGGESTIONS = [
  "🎮", "🕹️", "👾", "🚀", "⚔️", "🏰", "🐉", "🧩",
  "🏎️", "⚽", "🏀", "🎯", "💎", "🔥", "⭐", "🌍",
  "🧟", "👻", "🤖", "🐱", "🦊", "🍄", "⛏️", "🛠️",
];

// Lowercase letters, digits and single hyphens: safe in URLs and storage keys.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 60;

// A stable short code for names slugify() can't spell (Cyrillic, CJK, ...).
function nameHash(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// The address for a new project: its name in lowercase Latin letters, or
// "game-<code>" when the name has none.
export function projectSlug(name) {
  return slugify(name) || "game-" + nameHash(String(name || "").trim());
}

export function slugify(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

// User-perceived characters ("grapheme clusters"), so a flag or a family
// emoji counts as one even though it is several code points.
function graphemes(text) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

function cleanText(value, maxLength) {
  // Collapse whitespace (newlines included) and drop control characters.
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).length > maxLength ? null : text;
}

// Check and tidy the editable fields of a project. Returns { value } with
// the cleaned fields, or { errors } mapping field name to a message.
// `partial` allows leaving fields out (for edits).
export function validateProjectFields(input, { partial = false } = {}) {
  const source = input && typeof input === "object" ? input : {};
  const value = {};
  const errors = {};
  const has = (field) => Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined;

  if (has("name") || !partial) {
    const name = cleanText(source.name, MAX_NAME_LENGTH);
    if (name === null) errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;
    else if (!name) errors.name = "Give the project a name.";
    else value.name = name;
  }

  if (has("emoji") || !partial) {
    const emoji = String(source.emoji ?? "").trim();
    if (!emoji) errors.emoji = "Pick an emoji.";
    else if (graphemes(emoji).length !== 1 || emoji.length > 16) errors.emoji = "Use a single emoji.";
    else value.emoji = emoji;
  }

  if (has("hue") || !partial) {
    const hue = Number(source.hue);
    if (!Number.isInteger(hue) || hue < 0 || hue > 359) errors.hue = "Pick a colour theme.";
    else value.hue = hue;
  }

  if (has("description")) {
    const description = cleanText(source.description, MAX_DESCRIPTION_LENGTH);
    if (description === null) errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
    else value.description = description;
  } else if (!partial) value.description = "";

  if (has("genre")) {
    const genre = cleanText(source.genre, MAX_GENRE_LENGTH);
    if (genre === null) errors.genre = `Keep the genre under ${MAX_GENRE_LENGTH} characters.`;
    else value.genre = genre;
  } else if (!partial) value.genre = "";

  if (has("visible")) {
    if (typeof source.visible !== "boolean") errors.visible = "Choose whether the project is shown.";
    else value.visible = source.visible;
  } else if (!partial) value.visible = true;

  return Object.keys(errors).length ? { errors } : { value };
}

export function utf8Bytes(text) {
  return new TextEncoder().encode(String(text)).length;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
