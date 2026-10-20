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
    else if (!slugify(name)) errors.name = "The name needs at least one letter or number.";
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
