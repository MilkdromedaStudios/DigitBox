// digitbox/lib/gameSaves.js
//
// Universal, game-agnostic autosave layer.
//
// The games on DigitBox are opaque, self-contained HTML files loaded inside a
// same-origin <iframe>. Because the iframe shares our origin we can read and
// write its `localStorage` / `sessionStorage`, which is where the vast majority
// of HTML5 games keep their progress. This module snapshots that storage on a
// per-game basis and mirrors it into several durable tiers so a player never
// has to "start over":
//
//   1. localStorage  – primary restore point (per game, namespaced).
//   2. cookie        – small saves are mirrored here so they survive even a
//                      localStorage wipe (this is the "save in the cookies"
//                      behaviour that was requested).
//   3. IndexedDB     – large saves (bigger than a cookie can hold) get a
//                      durable backup here.
//
// Restores are intentionally NON-DESTRUCTIVE: a backed-up key is only written
// back when the live game storage is missing it, so freshly-played progress
// always wins over an older backup.

export const SAVE_VERSION = 1;
export const SAVE_NS = "digitbox_gamesave_v1";
export const AUTOSAVE_FLAG_KEY = "digitbox_autosave_enabled";
export const COOKIE_PREFIX = "dbx_gs_";
export const IDB_NAME = "digitboxGameSaves";
export const IDB_STORE = "saves";

// Any storage key beginning with this prefix belongs to the site itself
// (profile prefs, autosave flags, our own snapshots). Those must never be
// captured as part of a game's save, otherwise we would recursively snapshot
// our own backups.
const RESERVED_KEY_PREFIX = "digitbox_";

// Cookies top out around 4 KB including the name; keep a safety margin.
const COOKIE_MAX_BYTES = 3500;

/* ------------------------------------------------------------------ *
 *  Small helpers
 * ------------------------------------------------------------------ */

export function slugToId(slug) {
  return String(slug || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unknown";
}

function storageKeyForSlug(slug) {
  return `${SAVE_NS}:${slugToId(slug)}`;
}

function cookieNameForSlug(slug) {
  return `${COOKIE_PREFIX}${slugToId(slug)}`;
}

function isReservedKey(key) {
  return typeof key === "string" && key.startsWith(RESERVED_KEY_PREFIX);
}

export function byteLength(str) {
  if (typeof str !== "string") return 0;
  if (typeof TextEncoder !== "undefined") {
    try {
      return new TextEncoder().encode(str).length;
    } catch {
      /* fall through */
    }
  }
  // Rough fallback.
  return unescape(encodeURIComponent(str)).length;
}

export function formatAgo(timestamp) {
  if (!timestamp) return "never";
  const secs = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ *
 *  Snapshotting a same-origin game window
 * ------------------------------------------------------------------ */

function readWebStorage(storage) {
  const out = {};
  if (!storage) return out;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key == null || isReservedKey(key)) continue;
    try {
      const value = storage.getItem(key);
      if (value != null) out[key] = value;
    } catch {
      /* ignore individual key errors */
    }
  }
  return out;
}

/**
 * Reads a game's localStorage + sessionStorage out of a same-origin iframe
 * window. Returns `null` when the window is cross-origin (access throws) or
 * when there is nothing worth saving.
 */
export function captureSnapshot(gameWindow, slug) {
  if (!gameWindow) return null;
  let local = {};
  let session = {};
  try {
    local = readWebStorage(gameWindow.localStorage);
  } catch {
    // Cross-origin frame — we are not allowed to read it at all.
    return null;
  }
  try {
    session = readWebStorage(gameWindow.sessionStorage);
  } catch {
    /* sessionStorage may be blocked even when localStorage is not */
  }

  const localCount = Object.keys(local).length;
  const sessionCount = Object.keys(session).length;
  if (localCount === 0 && sessionCount === 0) return null;

  return {
    v: SAVE_VERSION,
    slug: slugToId(slug),
    savedAt: Date.now(),
    local,
    session,
  };
}

/** True when the game window already has at least one non-reserved local key. */
export function hasLiveGameKeys(gameWindow) {
  if (!gameWindow) return false;
  try {
    const storage = gameWindow.localStorage;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key != null && !isReservedKey(key)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** True when the given iframe window can be read (same-origin, storage OK). */
export function canAccessGameStorage(gameWindow) {
  if (!gameWindow) return false;
  try {
    // Touching `.length` is enough to trip the cross-origin security error.
    void gameWindow.localStorage.length;
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  Cookie tier
 * ------------------------------------------------------------------ */

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const row = document.cookie.split("; ").find((r) => r.startsWith(prefix));
  if (!row) return null;
  try {
    return JSON.parse(decodeURIComponent(row.slice(prefix.length)));
  } catch {
    return null;
  }
}

function writeCookie(name, payloadString) {
  if (typeof document === "undefined") return false;
  const encoded = encodeURIComponent(payloadString);
  if (byteLength(`${name}=${encoded}`) > COOKIE_MAX_BYTES) return false;
  document.cookie = `${name}=${encoded}; path=/; max-age=31536000; samesite=lax`;
  return true;
}

function deleteCookie(name) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/* ------------------------------------------------------------------ *
 *  IndexedDB tier (durable backup for large saves)
 * ------------------------------------------------------------------ */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no-indexeddb"));
      return;
    }
    let req;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "slug" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb-open-failed"));
  });
}

async function idbPut(record) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

async function idbGet(slug) {
  try {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(slugToId(slug));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

async function idbDelete(slug) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(slugToId(slug));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  Persisting / loading a snapshot across all tiers
 * ------------------------------------------------------------------ */

/**
 * Writes a snapshot to every available tier. Returns a small report describing
 * where it landed so the UI can tell the player what happened.
 */
export async function persistSnapshot(snapshot) {
  if (!snapshot || typeof window === "undefined") {
    return { ok: false, tiers: [] };
  }
  const slug = snapshot.slug;
  const serialized = JSON.stringify(snapshot);
  const tiers = [];

  try {
    window.localStorage.setItem(storageKeyForSlug(slug), serialized);
    tiers.push("local");
  } catch {
    /* quota / disabled — other tiers may still work */
  }

  if (writeCookie(cookieNameForSlug(slug), serialized)) {
    tiers.push("cookie");
  } else {
    // Too big for a cookie: drop any stale cookie so it can't shadow newer data.
    deleteCookie(cookieNameForSlug(slug));
  }

  if (await idbPut(snapshot)) {
    tiers.push("indexeddb");
  }

  return { ok: tiers.length > 0, tiers, savedAt: snapshot.savedAt, slug };
}

function parseMaybe(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Loads the most recent persisted snapshot for a game, consulting every tier
 * and returning whichever has the newest `savedAt`.
 */
export async function loadPersisted(slug) {
  if (typeof window === "undefined") return null;
  const candidates = [];

  try {
    const raw = window.localStorage.getItem(storageKeyForSlug(slug));
    const parsed = parseMaybe(raw);
    if (parsed) candidates.push(parsed);
  } catch {
    /* ignore */
  }

  const cookie = readCookie(cookieNameForSlug(slug));
  if (cookie) candidates.push(cookie);

  const idb = await idbGet(slug);
  if (idb) candidates.push(idb);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return candidates[0];
}

/** Lightweight existence/metadata check without pulling the full IDB record. */
export function peekPersisted(slug) {
  if (typeof window === "undefined") return null;
  const raw = (() => {
    try {
      return window.localStorage.getItem(storageKeyForSlug(slug));
    } catch {
      return null;
    }
  })();
  const parsed = parseMaybe(raw) || readCookie(cookieNameForSlug(slug));
  if (!parsed) return null;
  return { savedAt: parsed.savedAt || 0, slug: parsed.slug || slugToId(slug) };
}

/**
 * Writes a snapshot's keys back into a live same-origin game window. Existing
 * live keys are preserved (backup only fills gaps) unless `overwrite` is set.
 * Returns counts plus whether any sessionStorage keys were (re)written, which
 * the caller uses to decide if a one-time frame reload is needed.
 */
export function restoreSnapshot(gameWindow, snapshot, { overwrite = false } = {}) {
  const result = { restoredLocal: 0, restoredSession: 0, sessionTouched: false };
  if (!gameWindow || !snapshot) return result;

  const applyInto = (storage, entries, isSession) => {
    if (!storage || !entries) return;
    for (const [key, value] of Object.entries(entries)) {
      if (isReservedKey(key)) continue;
      try {
        const present = storage.getItem(key);
        if (present != null && !overwrite) continue;
        if (present === value) continue;
        storage.setItem(key, value);
        if (isSession) {
          result.restoredSession += 1;
          result.sessionTouched = true;
        } else {
          result.restoredLocal += 1;
        }
      } catch {
        /* quota or blocked key */
      }
    }
  };

  try {
    applyInto(gameWindow.localStorage, snapshot.local, false);
  } catch {
    /* cross-origin */
  }
  try {
    applyInto(gameWindow.sessionStorage, snapshot.session, true);
  } catch {
    /* cross-origin / blocked */
  }

  return result;
}

/**
 * Because every internal game shares one origin (and therefore one
 * localStorage), a game's snapshot can legitimately contain keys another game
 * also relies on. This returns the union of keys stored in every OTHER game's
 * localStorage snapshot slot, so a "reset" can avoid deleting live keys that a
 * different game still needs.
 */
export function getForeignSnapshotKeys(exceptSlug) {
  const keys = new Set();
  if (typeof window === "undefined") return keys;
  const exceptId = slugToId(exceptSlug);
  const prefix = `${SAVE_NS}:`;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const storageKey = window.localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(prefix)) continue;
      if (storageKey === `${prefix}${exceptId}`) continue;
      const parsed = parseMaybe(window.localStorage.getItem(storageKey));
      if (parsed?.local) Object.keys(parsed.local).forEach((k) => keys.add(k));
      if (parsed?.session) Object.keys(parsed.session).forEach((k) => keys.add(k));
    }
  } catch {
    /* ignore */
  }
  return keys;
}

/** Removes every trace of a game's save from all tiers. */
export async function clearPersisted(slug) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(storageKeyForSlug(slug));
    } catch {
      /* ignore */
    }
    deleteCookie(cookieNameForSlug(slug));
  }
  await idbDelete(slug);
}

/**
 * Also wipes the live keys a snapshot restored into the game window, so a
 * "reset save" genuinely returns the game to a blank slate on next reload.
 */
export function purgeLiveKeys(gameWindow, snapshot, { protectedKeys } = {}) {
  if (!gameWindow || !snapshot) return;
  const protect = protectedKeys instanceof Set ? protectedKeys : new Set(protectedKeys || []);
  const removeFrom = (storage, entries) => {
    if (!storage || !entries) return;
    for (const key of Object.keys(entries)) {
      if (isReservedKey(key) || protect.has(key)) continue;
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  };
  try {
    removeFrom(gameWindow.localStorage, snapshot.local);
  } catch {
    /* ignore */
  }
  try {
    removeFrom(gameWindow.sessionStorage, snapshot.session);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 *  Autosave on/off preference (shared across all games)
 * ------------------------------------------------------------------ */

export function isAutosaveEnabled() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTOSAVE_FLAG_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutosaveEnabled(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTOSAVE_FLAG_KEY, enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 *  Export / import (download a save file, restore it later)
 * ------------------------------------------------------------------ */

export function downloadSnapshot(snapshot, slug) {
  if (!snapshot || typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `digitbox-save-${slugToId(slug)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImportedSnapshot(text, slug) {
  const parsed = parseMaybe(text);
  if (!parsed || typeof parsed !== "object") return null;
  if (!parsed.local && !parsed.session && !parsed.idb) return null;
  return {
    v: SAVE_VERSION,
    slug: slugToId(slug),
    savedAt: Date.now(),
    local: parsed.local || {},
    session: parsed.session || {},
    idb: parsed.idb || null,
  };
}

/* ------------------------------------------------------------------ *
 *  IndexedDB tier for GAME saves
 *
 *  Many HTML5 game engines (Unity, Godot, Construct, GameMaker, …) keep
 *  their progress in IndexedDB, not localStorage — which is why a naive
 *  web-storage snapshot found "nothing to save". These helpers snapshot a
 *  same-origin game's IndexedDB databases (read-only, size-capped) and can
 *  restore them into a browser that doesn't have them yet.
 *
 *  Capture is always safe (read-only). Restore is deliberately conservative:
 *  it only recreates databases that DON'T already exist, so a live save is
 *  never overwritten or corrupted.
 * ------------------------------------------------------------------ */

// Don't try to snapshot enormous IndexedDB stores (some engines cache the
// whole build there); bail out past this many bytes of serialized data.
const IDB_CAPTURE_MAX_BYTES = 3_500_000;

const TYPED_ARRAY_CTORS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Encodes an IndexedDB value into a JSON-serializable envelope, tracking a
// byte budget so we can abort on oversized data. Throws on unsupported types
// (Blob, Map, Set, …) so the caller can skip that database gracefully.
function encodeIdbValue(value, budget) {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === "string") {
    budget.used += value.length;
    if (budget.used > budget.max) throw new Error("idb-over-budget");
    return value;
  }
  if (type === "number" || type === "boolean") return value;
  if (value instanceof Date) return { __t: "date", v: value.toISOString() };
  if (value instanceof ArrayBuffer) {
    const b64 = bytesToBase64(new Uint8Array(value));
    budget.used += b64.length;
    if (budget.used > budget.max) throw new Error("idb-over-budget");
    return { __t: "ab", v: b64 };
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const b64 = bytesToBase64(bytes);
    budget.used += b64.length;
    if (budget.used > budget.max) throw new Error("idb-over-budget");
    return { __t: "tav", c: value.constructor.name, v: b64 };
  }
  if (Array.isArray(value)) {
    return { __t: "arr", v: value.map((item) => encodeIdbValue(item, budget)) };
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = encodeIdbValue(value[key], budget);
    return { __t: "obj", v: out };
  }
  throw new Error("idb-unsupported-value");
}

function decodeIdbValue(enc) {
  if (enc === null || typeof enc !== "object") return enc;
  switch (enc.__t) {
    case "date":
      return new Date(enc.v);
    case "ab":
      return base64ToBytes(enc.v).buffer;
    case "tav": {
      const bytes = base64ToBytes(enc.v);
      const Ctor = TYPED_ARRAY_CTORS[enc.c] || Uint8Array;
      return new Ctor(bytes.buffer);
    }
    case "arr":
      return enc.v.map(decodeIdbValue);
    case "obj": {
      const out = {};
      for (const key of Object.keys(enc.v)) out[key] = decodeIdbValue(enc.v[key]);
      return out;
    }
    default:
      return enc;
  }
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dumpGameDb(idbFactory, name, budget) {
  return new Promise((resolve) => {
    let open;
    try {
      open = idbFactory.open(name);
    } catch {
      resolve(null);
      return;
    }
    open.onerror = () => resolve(null);
    open.onblocked = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      const storeNames = Array.from(db.objectStoreNames);
      if (!storeNames.length) {
        db.close();
        resolve({ version: db.version, stores: {} });
        return;
      }
      let tx;
      try {
        tx = db.transaction(storeNames, "readonly");
      } catch {
        db.close();
        resolve(null);
        return;
      }
      const stores = {};
      let remaining = storeNames.length;
      let aborted = false;

      const finish = () => {
        db.close();
        resolve(aborted ? null : { version: db.version, stores });
      };

      storeNames.forEach((storeName) => {
        const store = tx.objectStore(storeName);
        const meta = {
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          records: [],
        };
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (event) => {
          if (aborted) return;
          const cursor = event.target.result;
          if (cursor) {
            try {
              const record = { value: encodeIdbValue(cursor.value, budget) };
              if (store.keyPath == null) record.key = encodeIdbValue(cursor.key, budget);
              meta.records.push(record);
              cursor.continue();
            } catch {
              // Oversized or unsupported value — skip this whole database.
              aborted = true;
              remaining -= 1;
              if (remaining === 0) finish();
            }
          } else {
            stores[storeName] = meta;
            remaining -= 1;
            if (remaining === 0) finish();
          }
        };
        cursorReq.onerror = () => {
          remaining -= 1;
          if (remaining === 0) finish();
        };
      });
    };
  });
}

/** Reads a same-origin game window's IndexedDB into a serializable object. */
export async function captureIndexedDb(gameWindow) {
  let idbFactory;
  try {
    idbFactory = gameWindow.indexedDB;
  } catch {
    return null; // cross-origin
  }
  // `databases()` is unavailable on Safari — IndexedDB capture is a no-op there.
  if (!idbFactory || typeof idbFactory.databases !== "function") return null;

  let list;
  try {
    list = await idbFactory.databases();
  } catch {
    return null;
  }

  const budget = { used: 0, max: IDB_CAPTURE_MAX_BYTES };
  const out = {};
  for (const info of list || []) {
    const name = info && info.name;
    if (!name || name === IDB_NAME) continue; // never snapshot our own backup DB
    try {
      const dump = await dumpGameDb(idbFactory, name, budget);
      if (dump && Object.keys(dump.stores).length) out[name] = dump;
    } catch {
      /* skip this database */
    }
    if (budget.used > budget.max) break;
  }
  return Object.keys(out).length ? out : null;
}

/** True if the game window has any non-empty IndexedDB database of its own. */
export async function hasIndexedDbData(gameWindow) {
  let idbFactory;
  try {
    idbFactory = gameWindow.indexedDB;
  } catch {
    return false;
  }
  if (!idbFactory || typeof idbFactory.databases !== "function") return false;
  try {
    const list = await idbFactory.databases();
    return (list || []).some((info) => info && info.name && info.name !== IDB_NAME);
  } catch {
    return false;
  }
}

// Restores a single database — only when it does not already exist, so a live
// save is never touched.
function restoreOneDb(idbFactory, name, dbSnap) {
  return new Promise((resolve) => {
    let open;
    try {
      open = idbFactory.open(name, dbSnap.version || 1);
    } catch {
      resolve(false);
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const [storeName, meta] of Object.entries(dbSnap.stores || {})) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const opts = {};
        if (meta.keyPath != null) opts.keyPath = meta.keyPath;
        if (meta.autoIncrement) opts.autoIncrement = true;
        try {
          db.createObjectStore(storeName, opts);
        } catch {
          /* ignore */
        }
      }
    };
    open.onerror = () => resolve(false);
    open.onblocked = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      const storeNames = Object.keys(dbSnap.stores || {}).filter((s) =>
        db.objectStoreNames.contains(s)
      );
      if (!storeNames.length) {
        db.close();
        resolve(false);
        return;
      }
      let tx;
      try {
        tx = db.transaction(storeNames, "readwrite");
      } catch {
        db.close();
        resolve(false);
        return;
      }
      for (const storeName of storeNames) {
        const meta = dbSnap.stores[storeName];
        const store = tx.objectStore(storeName);
        for (const record of meta.records || []) {
          try {
            const value = decodeIdbValue(record.value);
            if (store.keyPath == null && "key" in record) {
              store.put(value, decodeIdbValue(record.key));
            } else {
              store.put(value);
            }
          } catch {
            /* skip record */
          }
        }
      }
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    };
  });
}

/**
 * Restores captured IndexedDB databases into the game window, skipping any
 * database that already exists (non-destructive). Returns the number of
 * databases created.
 */
export async function restoreIndexedDb(gameWindow, idbSnapshot) {
  if (!idbSnapshot || typeof idbSnapshot !== "object") return 0;
  let idbFactory;
  try {
    idbFactory = gameWindow.indexedDB;
  } catch {
    return 0;
  }
  if (!idbFactory || typeof idbFactory.open !== "function") return 0;

  let existing = [];
  if (typeof idbFactory.databases === "function") {
    try {
      existing = (await idbFactory.databases()).map((info) => info && info.name);
    } catch {
      existing = [];
    }
  }

  let created = 0;
  for (const [name, dbSnap] of Object.entries(idbSnapshot)) {
    if (existing.includes(name)) continue; // never overwrite a live database
    // eslint-disable-next-line no-await-in-loop
    if (await restoreOneDb(idbFactory, name, dbSnap)) created += 1;
  }
  return created;
}

/**
 * Full, async snapshot: web storage (localStorage + sessionStorage) plus a
 * best-effort IndexedDB dump. Returns null only when there is genuinely
 * nothing to save anywhere.
 */
export async function captureFullSnapshot(gameWindow, slug) {
  if (!gameWindow) return null;
  const base = captureSnapshot(gameWindow, slug) || {
    v: SAVE_VERSION,
    slug: slugToId(slug),
    savedAt: Date.now(),
    local: {},
    session: {},
  };

  let idb = null;
  try {
    idb = await captureIndexedDb(gameWindow);
  } catch {
    idb = null;
  }
  if (idb) base.idb = idb;

  const hasData =
    Object.keys(base.local || {}).length > 0 ||
    Object.keys(base.session || {}).length > 0 ||
    (base.idb && Object.keys(base.idb).length > 0);

  return hasData ? base : null;
}

/**
 * A coarse "how much progress is in this snapshot" measure: number of web
 * storage keys plus IndexedDB records. Used to protect a real save from being
 * overwritten by a smaller (freshly-started-game) snapshot.
 */
export function snapshotWeight(snapshot) {
  if (!snapshot) return 0;
  let weight =
    Object.keys(snapshot.local || {}).length +
    Object.keys(snapshot.session || {}).length;
  if (snapshot.idb) {
    for (const db of Object.values(snapshot.idb)) {
      for (const store of Object.values(db.stores || {})) {
        weight += (store.records || []).length;
      }
    }
  }
  return weight;
}
