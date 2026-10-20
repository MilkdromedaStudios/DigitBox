// digitbox/lib/serverAuth.js
//
// Server-side admin check for edge API routes. Accounts live in the Cloudflare
// D1 database behind /v1 (pages/api/deepforge/[[...path]].js): logging in
// returns a token that the browser sends back as `Authorization: Bearer
// <token>`, and D1 keeps only its SHA-256 in auth_sessions. The queries below
// match that route's authenticatedUser() and getOwnerId().
//
// Admins are the site owner (deepforge_config.owner_user_id) plus anyone
// whose account email is listed in the ADMIN_EMAILS environment variable
// (comma separated). Never trust a role sent by the browser.

import { privateJson } from "./apiResponse";

// The D1 binding, read the same way the account API does: DB, or any binding
// shaped like a D1 database. Null on hosts without one (e.g. Vercel).
export function getD1() {
  const env = process.env || {};
  if (env.DB && typeof env.DB.prepare === "function") return env.DB;
  for (const value of Object.values(env)) {
    if (value && typeof value.prepare === "function" && typeof value.batch === "function") return value;
  }
  return null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : "";
}

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// The signed-in account for this request, or null.
export async function sessionUser(request, db) {
  const token = bearerToken(request);
  if (!token) return null;
  const row = await db
    .prepare("SELECT u.id, u.email, u.display_name FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2")
    .bind(await sha256Hex(token), Date.now())
    .first();
  return row || null;
}

export async function isAdminUser(db, user) {
  if (!user) return false;
  if (adminEmails().includes(String(user.email || "").toLowerCase())) return true;
  // The owner row is created by the account API; it may not exist yet.
  const owner = await db
    .prepare("SELECT value FROM deepforge_config WHERE key = 'owner_user_id'")
    .first()
    .catch(() => null);
  return Boolean(owner) && String(owner.value) === String(user.id);
}

// Resolves to { db, user } for an admin, or { response } with the error to
// send back: 503 without D1, 401 when not signed in, 403 for other accounts.
export async function requireAdmin(request) {
  const db = getD1();
  if (!db) return { response: privateJson({ error: "Project storage isn't available on this deployment.", code: "no_storage" }, 503) };
  const user = await sessionUser(request, db).catch(() => null);
  if (!user) return { response: privateJson({ error: "Sign in to continue.", code: "signed_out" }, 401) };
  if (!(await isAdminUser(db, user))) return { response: privateJson({ error: "This account isn't an admin.", code: "not_admin" }, 403) };
  return { db, user };
}
