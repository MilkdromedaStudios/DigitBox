// digitbox/components/HubProjectFrame.js
//
// Player for projects added from the admin page. The game's HTML runs in a
// sandboxed frame WITHOUT allow-same-origin, so it gets a unique "null"
// origin: it can't read this site's storage (where visitors' login tokens
// live), cookies or page. Admin-uploaded HTML often comes from elsewhere, so
// it is never trusted with the site.
//
// A null origin has no localStorage or cookies of its own, and most HTML5
// games save progress there. So a small script goes in ahead of the game and
// gives it in-memory localStorage, sessionStorage and document.cookie. Each
// change to localStorage or a cookie is posted up to this page as it
// happens, and the page merges it into that game's save in its own
// localStorage, which seeds the game next time it loads.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordHistory } from "../lib/history";

export const SAVE_PREFIX = "digitbox_hubsave_v1:";
const MESSAGE_TYPE = "digitbox:hub-save";
// Saves share this site's localStorage (about 5M characters) with the login
// token, likes and history, so cap each game and all of them together.
const MAX_SAVE_CHARS = 1000000;
const MAX_TOTAL_SAVE_CHARS = 2000000;

// allow-popups-to-escape-sandbox: links a game opens get their own normal
// origin instead of a broken null one. They still can't reach this page.
export const SANDBOX_FLAGS = "allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-modals allow-forms allow-downloads";

function saveKey(slug) {
  return SAVE_PREFIX + slug;
}

function readSave(slug) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(saveKey(slug)) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return { local: { ...(parsed.local || {}) }, cookies: { ...(parsed.cookies || {}) } };
  } catch {
    return null;
  }
}

// Every game save in this browser, oldest first.
function allSaves() {
  const saves = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(SAVE_PREFIX)) continue;
      const text = window.localStorage.getItem(key) || "";
      let savedAt = 0;
      try {
        savedAt = Number(JSON.parse(text).savedAt) || 0;
      } catch {
        /* unreadable: evicted first */
      }
      saves.push({ key, size: text.length, savedAt });
    }
  } catch {
    /* storage unavailable */
  }
  return saves.sort((a, b) => a.savedAt - b.savedAt);
}

// Drop the least recently played games' saves (other than `keepKey`) until
// `needed` more characters fit in the budget. (lib/account.js clears them
// all if the login token ever doesn't fit.)
function makeRoomForSaves(needed, keepKey) {
  const others = allSaves().filter((save) => save.key !== keepKey);
  let total = others.reduce((sum, save) => sum + save.size, 0);
  for (const save of others) {
    if (total + needed <= MAX_TOTAL_SAVE_CHARS) break;
    try {
      window.localStorage.removeItem(save.key);
    } catch {
      /* ignore */
    }
    total -= save.size;
  }
}

/* ------------------------------------------------------------------ *
 *  Page side: one listener for every game frame on this page
 * ------------------------------------------------------------------ */

// Game windows this page started, mapped to their slug and error callback.
// A frame's window stays the same object across reloads inside the frame,
// and saves a game makes as it closes still arrive after the frame is gone.
const frames = new WeakMap();
const pending = new Map();
let persistTimer = null;
let listening = false;

function validOp(op) {
  if (!Array.isArray(op)) return false;
  const [kind, key, value] = op;
  if (kind === "clear") return op.length === 1;
  if (typeof key !== "string") return false;
  if (kind === "set") return typeof value === "string";
  if (kind === "cookie") return typeof value === "string" || value === null;
  return kind === "remove";
}

function applyOps(slug, ops, onError) {
  // Merge into the stored save as it is now, so other tabs' changes stay.
  const save = readSave(slug) || { local: {}, cookies: {} };
  for (const [kind, key, value] of ops) {
    if (kind === "set") save.local[key] = value;
    else if (kind === "remove") delete save.local[key];
    else if (kind === "clear") save.local = {};
    else if (value === null) delete save.cookies[key];
    else save.cookies[key] = value;
  }
  const text = JSON.stringify({ local: save.local, cookies: save.cookies, savedAt: Date.now() });
  if (text.length > MAX_SAVE_CHARS) {
    onError?.("This game's save is too big to keep, so progress isn't being saved.");
    return;
  }
  makeRoomForSaves(text.length, saveKey(slug));
  try {
    window.localStorage.setItem(saveKey(slug), text);
  } catch {
    onError?.("Your browser storage is full, so progress isn't being saved.");
  }
}

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  for (const [slug, entry] of pending) {
    pending.delete(slug);
    applyOps(slug, entry.ops, entry.onError);
  }
}

function onMessage(event) {
  const frame = event.source ? frames.get(event.source) : null;
  const message = event.data;
  if (!frame || !message || message.type !== MESSAGE_TYPE || message.slug !== frame.slug || !Array.isArray(message.ops)) return;
  const ops = message.ops.filter(validOp);
  if (!ops.length) return;
  const entry = pending.get(frame.slug) || { ops: [], onError: frame.onError };
  entry.ops.push(...ops);
  pending.set(frame.slug, entry);
  if (!persistTimer) persistTimer = setTimeout(persistNow, 250);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", onMessage);
  window.addEventListener("pagehide", persistNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistNow();
  });
}

/* ------------------------------------------------------------------ *
 *  Game side: runs inside the sandboxed frame before the game
 * ------------------------------------------------------------------ */

function storageBridge(config) {
  /* eslint-disable no-var */
  var settings = config;
  var MARK = "__digitbox_hub__:";
  var hasOwn = function (object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  };

  // When the game reloads itself, its latest state rides along in
  // window.name (which survives navigations of this frame).
  var carried = null;
  try {
    if (typeof window.name === "string" && window.name.indexOf(MARK) === 0) {
      var parsed = JSON.parse(window.name.slice(MARK.length));
      if (parsed && parsed.slug === settings.slug) carried = parsed;
    }
  } catch (error) {
    carried = null;
  }

  var ops = [];
  var queued = false;
  function send() {
    queued = false;
    if (!ops.length) return;
    var batch = ops;
    ops = [];
    if (!settings.persist) return;
    try {
      parent.postMessage({ type: settings.type, slug: settings.slug, ops: batch }, settings.origin);
    } catch (error) {
      /* nothing else to try */
    }
  }
  function queue(op) {
    ops.push(op);
    if (!queued) {
      queued = true;
      Promise.resolve().then(send);
    }
  }

  function copy(source) {
    var out = Object.create(null);
    Object.keys(source || {}).forEach(function (key) {
      out[key] = String(source[key]);
    });
    return out;
  }

  function makeStore(seed, record) {
    var data = copy(seed);
    var api = {
      getItem: function (key) {
        key = String(key);
        return hasOwn(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        key = String(key);
        data[key] = String(value);
        if (record) queue(["set", key, data[key]]);
      },
      removeItem: function (key) {
        key = String(key);
        delete data[key];
        if (record) queue(["remove", key]);
      },
      clear: function () {
        Object.keys(data).forEach(function (key) {
          delete data[key];
        });
        if (record) queue(["clear"]);
      },
      key: function (index) {
        var keys = Object.keys(data);
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
    };
    // Built on Storage.prototype, so instanceof Storage, hasOwnProperty and
    // toString behave like the real thing.
    var target = Object.create(typeof Storage === "function" ? Storage.prototype : Object.prototype);
    var store = new Proxy(target, {
      get: function (_target, prop) {
        if (prop === "length") return Object.keys(data).length;
        if (typeof prop === "string" && hasOwn(api, prop)) return api[prop];
        if (typeof prop === "string" && hasOwn(data, prop)) return data[prop];
        return Reflect.get(target, prop);
      },
      set: function (_target, prop, value) {
        if (typeof prop === "symbol") return Reflect.set(target, prop, value);
        api.setItem(prop, value);
        return true;
      },
      deleteProperty: function (_target, prop) {
        if (typeof prop !== "symbol") api.removeItem(prop);
        return true;
      },
      has: function (_target, prop) {
        return (typeof prop === "string" && (hasOwn(api, prop) || hasOwn(data, prop))) || Reflect.has(target, prop);
      },
      ownKeys: function () {
        return Object.keys(data);
      },
      getOwnPropertyDescriptor: function (_target, prop) {
        if (typeof prop !== "string" || !hasOwn(data, prop)) return undefined;
        return { value: data[prop], writable: true, enumerable: true, configurable: true };
      },
    });
    return { store: store, data: data };
  }

  var local = makeStore(carried ? carried.local : settings.local, true);
  var session = makeStore(carried ? carried.session : null, false);
  var cookies = copy(carried ? carried.cookies : settings.cookies);

  function expose(target, name, descriptor) {
    try {
      Object.defineProperty(target, name, Object.assign({ configurable: true, enumerable: true }, descriptor));
    } catch (error) {
      /* leave the browser's own property */
    }
  }

  expose(window, "localStorage", { get: function () { return local.store; } });
  expose(window, "sessionStorage", { get: function () { return session.store; } });
  expose(document, "cookie", {
    get: function () {
      return Object.keys(cookies)
        .map(function (name) {
          return name + "=" + cookies[name];
        })
        .join("; ");
    },
    set: function (text) {
      var parts = String(text).split(";");
      var pair = parts[0];
      var eq = pair.indexOf("=");
      if (eq < 0) return;
      var name = pair.slice(0, eq).trim();
      var value = pair.slice(eq + 1).trim();
      if (!name) return;
      var expired = parts.slice(1).some(function (part) {
        var attr = part.trim().toLowerCase();
        if (attr.indexOf("max-age=") === 0) return Number(attr.slice(8)) <= 0;
        if (attr.indexOf("expires=") === 0) return Date.parse(part.trim().slice(8)) <= Date.now();
        return false;
      });
      if (expired) delete cookies[name];
      else cookies[name] = value;
      queue(["cookie", name, expired ? null : value]);
    },
  });

  function leaving() {
    send();
    try {
      window.name = MARK + JSON.stringify({ slug: settings.slug, local: local.data, session: session.data, cookies: cookies });
    } catch (error) {
      /* the page's copy still has the save */
    }
  }
  window.addEventListener("pagehide", leaving);
  window.addEventListener("beforeunload", leaving);
  /* eslint-enable no-var */
}

// JSON that is safe inside an inline <script>.
function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
}

// The game's HTML with the storage bridge inserted first (after the
// doctype, so the game keeps standards mode).
export function buildSandboxDocument(html, { slug, saved, origin, persist }) {
  const config = { type: MESSAGE_TYPE, slug, origin, persist: Boolean(persist), local: saved?.local || {}, cookies: saved?.cookies || {} };
  const bridge = `<script>(${storageBridge.toString()})(${scriptJson(config)});</script>`;
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  return doctype ? doctype[0] + bridge + html.slice(doctype[0].length) : bridge + html;
}

// Fetch a project's HTML piece by piece and join it. `base` is the html
// URL; `query` is added to every piece's URL.
export async function fetchProjectHtml(base, parts, query = "", init) {
  const count = Math.max(1, parts || 1);
  const pieces = await Promise.all(
    Array.from({ length: count }, async (_, part) => {
      const response = await fetch(base + "?part=" + part + (query ? "&" + query : ""), init);
      if (response.status === 409) throw Object.assign(new Error("This game was just updated. Reload to play the new version."), { code: "stale" });
      if (response.status === 404) throw Object.assign(new Error("This project isn't available any more."), { code: "missing" });
      if (!response.ok) throw new Error("The game didn't load. Check your connection and try again.");
      return response.text();
    })
  );
  return pieces.join("");
}

// The sandboxed game itself. With `persist`, saves are kept per `slug` in
// this page's localStorage; without it (editor previews) nothing is kept.
// Client only: it renders once the HTML has been fetched.
export function SandboxedGame({ html, slug, title, persist = false, reloadKey = 0, onSaveError }) {
  // Built during render, so a restarted frame never starts with an old save.
  const srcDoc = useMemo(() => {
    if (persist) listen();
    return buildSandboxDocument(html, { slug, saved: persist ? readSave(slug) : null, origin: window.location.origin, persist });
    // reloadKey: rebuild from the latest save whenever the game restarts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, slug, persist, reloadKey]);

  // Register the frame's window as soon as the frame is in the page.
  const attach = useCallback(
    (node) => {
      if (node && node.contentWindow && persist) frames.set(node.contentWindow, { slug, onError: onSaveError });
    },
    [persist, slug, onSaveError]
  );

  return (
    <iframe
      ref={attach}
      key={reloadKey}
      title={title || "Game"}
      srcDoc={srcDoc}
      sandbox={SANDBOX_FLAGS}
      allow="autoplay; fullscreen; gamepad"
      allowFullScreen
      className="game-frame"
    />
  );
}

// Full-screen player page for /projects/<slug>.
export default function HubProjectFrame({ project }) {
  const shellRef = useRef(null);
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");

  const base = useMemo(() => "/api/hub-projects/" + encodeURIComponent(project.slug) + "/html", [project.slug]);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchProjectHtml(base, project.htmlParts, "v=" + encodeURIComponent(project.version))
      .then((text) => active && setHtml(text))
      .catch((loadError) => active && setError({ message: loadError.message || "The game didn't load.", stale: loadError.code === "stale" }));
    return () => {
      active = false;
    };
  }, [base, project.htmlParts, project.version, attempt]);

  useEffect(() => {
    recordHistory("game:" + project.slug, project.name);
  }, [project.slug, project.name]);

  const onSaveError = useCallback((message) => setNotice(message), []);

  function resetProgress() {
    if (!window.confirm(`Reset your progress in ${project.name}? The game will restart from the beginning.`)) return;
    // Ignore anything the current game window still sends, then forget it.
    const frame = shellRef.current && shellRef.current.querySelector("iframe.game-frame");
    if (frame && frame.contentWindow) frames.delete(frame.contentWindow);
    persistNow();
    try {
      window.localStorage.removeItem(saveKey(project.slug));
    } catch {
      /* nothing saved */
    }
    setNotice("");
    setReloadKey((key) => key + 1);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else shellRef.current?.requestFullscreen?.().catch(() => {});
  }

  return (
    <div className="game-shell hub-play" ref={shellRef} style={{ "--h": project.hue }}>
      {html !== null && (
        <SandboxedGame html={html} slug={project.slug} title={project.name} persist reloadKey={reloadKey} onSaveError={onSaveError} />
      )}

      {html === null && (
        <div className="hub-play-status" role={error ? "alert" : "status"}>
          <span className="hub-play-emoji" aria-hidden="true">{project.emoji}</span>
          <strong>{project.name}</strong>
          {error ? (
            <>
              <span>{error.message}</span>
              <button type="button" className="game-btn" onClick={() => (error.stale ? window.location.reload() : setAttempt((count) => count + 1))}>
                {error.stale ? "Reload" : "Try again"}
              </button>
            </>
          ) : (
            <span>Loading…</span>
          )}
        </div>
      )}

      <div className="game-toolbar">
        <div className="game-toolbar-bar">
          <Link href="/games" className="game-btn game-btn-back" aria-label="Back to cloud games">
            <span aria-hidden="true">←</span>
            <span className="game-btn-label">Exit</span>
          </Link>
          <button type="button" className="game-btn" onClick={toggleFullscreen} aria-label="Full screen">
            <span aria-hidden="true">⛶</span>
            <span className="game-btn-label">Full screen</span>
          </button>
          <button type="button" className="game-btn" onClick={resetProgress} disabled={html === null} aria-label="Reset progress">
            <span aria-hidden="true">↺</span>
            <span className="game-btn-label">Reset progress</span>
          </button>
        </div>
        {notice && <div className="hub-play-notice" role="status">{notice}</div>}
      </div>
    </div>
  );
}
