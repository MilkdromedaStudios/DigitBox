// digitbox/lib/hubProjects.js
//
// Storage for projects added from the admin page, in the Cloudflare D1
// database the site already uses for accounts. Edge API routes only.
//
//   hub_projects      one row per project: name, emoji, colour (hue), ...
//   hub_project_html  the game's HTML, split into pieces because D1 caps a
//                     single value at 2 MB
//
// New projects show up as soon as they're saved: nothing is committed to the
// repo and no rebuild is needed.

import { GAMES } from "./catalog";
import { MAX_HTML_BYTES, SLUG_PATTERN, slugify, utf8Bytes } from "./projectRules";

// 400k UTF-16 units is at most 1.2 MB of UTF-8, safely under D1's 2 MB limit.
const CHUNK_CHARS = 400000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hub_projects (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    hue INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    genre TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 1,
    html_bytes INTEGER NOT NULL DEFAULT 0,
    html_chunks INTEGER NOT NULL DEFAULT 0,
    html_updated_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS hub_project_html (
    slug TEXT NOT NULL,
    idx INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (slug, idx)
  )`,
];

let schemaReady = null;

export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export class ProjectError extends Error {
  constructor(message, status = 400, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// Slugs the built-in games (and their tidied names) already use, so a new
// project never shadows one at /projects/<slug>.
const RESERVED_SLUGS = new Set(GAMES.flatMap((game) => [game.slug, slugify(game.slug), slugify(game.title)]));

export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length <= 60 && SLUG_PATTERN.test(slug);
}

export function toPublicProject(row) {
  return {
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    hue: Number(row.hue),
    description: row.description || "",
    genre: row.genre || "",
    visible: Boolean(row.visible),
    htmlBytes: Number(row.html_bytes) || 0,
    // Changes whenever the HTML is replaced; used to version its URL.
    version: Number(row.html_updated_at) || 0,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

// Newest first. Visitors only see projects that are shown and have a game.
export async function listProjects(db, { includeHidden = false } = {}) {
  await ensureSchema(db);
  const where = includeHidden ? "" : "WHERE visible = 1 AND html_chunks > 0";
  const { results } = await db.prepare(`SELECT * FROM hub_projects ${where} ORDER BY created_at DESC, slug`).all();
  return (results || []).map(toPublicProject);
}

export async function getProject(db, slug) {
  if (!isValidSlug(slug)) return null;
  await ensureSchema(db);
  const row = await db.prepare("SELECT * FROM hub_projects WHERE slug = ?1").bind(slug).first();
  return row ? toPublicProject(row) : null;
}

export async function createProject(db, fields) {
  await ensureSchema(db);
  const slug = slugify(fields.name);
  if (!slug) throw new ProjectError("The name needs at least one letter or number.", 400, "name");
  if (RESERVED_SLUGS.has(slug)) throw new ProjectError("A built-in game already uses this name. Pick another one.", 409, "name");
  const now = Date.now();
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO hub_projects (slug, name, emoji, hue, description, genre, visible, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)"
    )
    .bind(slug, fields.name, fields.emoji, fields.hue, fields.description, fields.genre, fields.visible ? 1 : 0, now)
    .run();
  if (!result.meta || result.meta.changes !== 1) {
    throw new ProjectError("Another project already uses this name. Pick another one.", 409, "name");
  }
  return getProject(db, slug);
}

const COLUMNS = { name: "name", emoji: "emoji", hue: "hue", description: "description", genre: "genre", visible: "visible" };

export async function updateProject(db, slug, fields) {
  await ensureSchema(db);
  const sets = [];
  const values = [];
  for (const [field, column] of Object.entries(COLUMNS)) {
    if (!(field in fields)) continue;
    values.push(field === "visible" ? (fields.visible ? 1 : 0) : fields[field]);
    sets.push(`${column} = ?${values.length}`);
  }
  values.push(Date.now());
  sets.push(`updated_at = ?${values.length}`);
  values.push(slug);
  const result = await db.prepare(`UPDATE hub_projects SET ${sets.join(", ")} WHERE slug = ?${values.length}`).bind(...values).run();
  if (!result.meta || result.meta.changes !== 1) return null;
  return getProject(db, slug);
}

export async function deleteProject(db, slug) {
  await ensureSchema(db);
  const [removed] = await db.batch([
    db.prepare("DELETE FROM hub_projects WHERE slug = ?1").bind(slug),
    db.prepare("DELETE FROM hub_project_html WHERE slug = ?1").bind(slug),
  ]);
  return Boolean(removed.meta && removed.meta.changes);
}

// Split without cutting a surrogate pair in half (D1 stores UTF-8, so a
// lone half would turn into U+FFFD).
function splitHtml(html) {
  const pieces = [];
  let start = 0;
  while (start < html.length) {
    let end = Math.min(start + CHUNK_CHARS, html.length);
    const last = html.charCodeAt(end - 1);
    if (end < html.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    pieces.push(html.slice(start, end));
    start = end;
  }
  return pieces;
}

// Replace a project's HTML in one transaction (D1 runs a batch atomically).
export async function saveHtml(db, slug, html) {
  await ensureSchema(db);
  const bytes = utf8Bytes(html);
  if (!bytes || !html.trim()) throw new ProjectError("The HTML file is empty.", 400, "html");
  if (bytes > MAX_HTML_BYTES) throw new ProjectError("The HTML is bigger than 5 MB.", 413, "html");

  const pieces = splitHtml(html);
  const now = Date.now();
  const results = await db.batch([
    db
      .prepare("UPDATE hub_projects SET html_bytes = ?1, html_chunks = ?2, html_updated_at = ?3, updated_at = ?3 WHERE slug = ?4")
      .bind(bytes, pieces.length, now, slug),
    db.prepare("DELETE FROM hub_project_html WHERE slug = ?1").bind(slug),
    ...pieces.map((body, idx) =>
      db.prepare("INSERT INTO hub_project_html (slug, idx, body) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM hub_projects WHERE slug = ?1)").bind(slug, idx, body)
    ),
  ]);
  if (!results[0].meta || results[0].meta.changes !== 1) return null;
  return getProject(db, slug);
}

// The whole HTML, or null if the project has none (or it is incomplete).
export async function loadHtml(db, slug) {
  if (!isValidSlug(slug)) return null;
  await ensureSchema(db);
  // One query, so a save landing mid-read can't mix old and new pieces.
  const { results } = await db
    .prepare("SELECT p.html_chunks AS total, h.body AS body FROM hub_projects p JOIN hub_project_html h ON h.slug = p.slug WHERE p.slug = ?1 ORDER BY h.idx")
    .bind(slug)
    .all();
  if (!results || !results.length || results.length !== Number(results[0].total)) return null;
  return results.map((row) => row.body).join("");
}

// A project's HTML as inert text: the play page runs it inside a sandboxed
// frame (components/HubProjectFrame.js). Served as text/plain with a
// sandbox CSP and nosniff, so opening the URL directly can never run it on
// this site's origin.
export function projectHtmlResponse(html, cacheControl) {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": cacheControl,
    },
  });
}
