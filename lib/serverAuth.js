// digitbox/lib/serverAuth.js
//
// Server-side admin check for edge API routes. Accounts live in the Cloudflare
// D1 database behind /v1 (pages/api/deepforge/[[...path]].js): logging in
// returns a token that the browser sends back as `Authorization: Bearer
// <token>`, and D1 keeps only its SHA-256 in auth_sessions. The queries below
// match that route's authenticatedUser() and getOwnerId().
//
// Admins are the pinned OWNER_USER_ID (or existing D1 owner_user_id) plus any account
// whose ID is listed in the ADMIN_USER_IDS environment variable (comma
// separated). IDs, not emails: signing up doesn't verify an email address,
// so anyone could register a listed email first. Never trust a role sent by
// the browser.

import { privateJson } from "./apiResponse.js";
import { accountRole } from "./accountSecurity.js";

// The live account API, for hosts without the D1 binding (see requireAdmin).
const ACCOUNT_API = "https://digitbox.pages.dev";

// Service bindings (like Pages' ASSETS) answer any method name over RPC, so
// they look like a database to a plain duck-type check; D1 has no fetch().
function isD1(value) {
  return Boolean(value) && typeof value.prepare === "function" && typeof value.batch === "function" && typeof value.fetch !== "function";
}

// The D1 binding: DB, or any binding shaped like a D1 database. Null where
// there is none (the Vercel deploy, Cloudflare previews without a binding).
export function getD1() {
  const env = process.env || {};
  if (isD1(env.DB)) return env.DB;
  for (const value of Object.values(env)) {
    if (isD1(value)) return value;
  }
  return null;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bearerToken(request) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : "";
}

function extraAdminIds() {
  return String(process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
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
  return (await accountRole({ DB: db, OWNER_USER_ID: process.env.OWNER_USER_ID, ADMIN_USER_IDS: process.env.ADMIN_USER_IDS }, String(user.id))).admin;
}

// Without D1, ask the live account API who the token belongs to.
async function remoteAdmin(request) {
  const token = bearerToken(request);
  if (!token) return { status: 401 };
  const response = await fetch(ACCOUNT_API + "/v1/auth/me", { headers: { Authorization: "Bearer " + token } }).catch(() => null);
  if (!response) return { status: 503 };
  if (response.status === 401) return { status: 401 };
  const body = response.ok ? await response.json().catch(() => null) : null;
  const user = body && body.user;
  if (!user) return { status: 503 };
  const pinnedOwner = String(process.env.OWNER_USER_ID || "").trim();
  const admin = (pinnedOwner ? user.id === pinnedOwner : user.owner === true) || extraAdminIds().includes(String(user.id));
  return admin ? { user: { id: user.id, email: user.email || "", display_name: user.displayName || "" } } : { status: 403, userId: user.id };
}

// Resolves to { db, user } for an admin, or { response } with the error to
// send back: 401 when not signed in, 403 for other accounts (with their
// account ID, for ADMIN_USER_IDS), 503 without D1. With `storage: false`
// (routes that don't use D1), hosts without D1 check the account remotely
// and resolve to { db: null, user }.
export async function requireAdmin(request, { storage = true } = {}) {
  const db = getD1();
  if (!db) {
    if (storage) return { response: privateJson({ error: "Project storage isn't available on this deployment. Use digitbox.dev.", code: "no_storage" }, 503) };
    const remote = await remoteAdmin(request);
    if (remote.user) return { db: null, user: remote.user };
    if (remote.status === 401) return { response: privateJson({ error: "Sign in to continue.", code: "signed_out" }, 401) };
    if (remote.status === 403) return { response: privateJson({ error: "This account isn't an admin.", code: "not_admin", userId: remote.userId }, 403) };
    return { response: privateJson({ error: "Couldn't check your account. Try again.", code: "unavailable" }, 503) };
  }
  const user = await sessionUser(request, db).catch(() => null);
  if (!user) return { response: privateJson({ error: "Sign in to continue.", code: "signed_out" }, 401) };
  if (!(await isAdminUser(db, user))) return { response: privateJson({ error: "This account isn't an admin.", code: "not_admin", userId: user.id }, 403) };
  return { db, user };
}

