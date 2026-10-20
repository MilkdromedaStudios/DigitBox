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
// gives it in-memory localStorage, sessionStorage and document.cookie.
// Changes to localStorage and cookies are posted up to this page, which keeps
// them in its own localStorage per project and hands them back next time the
// game loads.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordHistory } from "../lib/history";

const SAVE_PREFIX = "digitbox_hubsave_v1:";
const MESSAGE_TYPE = "digitbox:hub-save";
const MAX_SAVE_CHARS = 2 * 1024 * 1024;

export const SANDBOX_FLAGS = "allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads";

function saveKey(slug) {
  return SAVE_PREFIX + slug;
}

function readSave(slug) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(saveKey(slug)) || "null");
    return parsed && typeof parsed === "object" ? { local: parsed.local || {}, cookies: parsed.cookies || {} } : null;
  } catch {
    return null;
  }
}

function stringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return null;
    out[key] = item;
  }
  return out;
}

// JSON that is safe inside an inline <script>.
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// Runs inside the sandboxed game before any of its own scripts.
function storageBridge(config) {
  /* eslint-disable no-var */
  var settings = config;
  var timer = null;

  function makeStore(seed, onChange) {
    var data = Object.create(null);
    Object.keys(seed || {}).forEach(function (key) {
      data[key] = String(seed[key]);
    });
    var api = {
      getItem: function (key) {
        key = String(key);
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) {
        data[String(key)] = String(value);
        onChange();
      },
      removeItem: function (key) {
        delete data[String(key)];
        onChange();
      },
      clear: function () {
        Object.keys(data).forEach(function (key) {
          delete data[key];
        });
        onChange();
      },
      key: function (index) {
        var keys = Object.keys(data);
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
    };
    var store = new Proxy(api, {
      get: function (target, prop) {
        if (prop === "length") return Object.keys(data).length;
        if (typeof prop === "symbol" || Object.prototype.hasOwnProperty.call(api, prop)) return api[prop];
        return Object.prototype.hasOwnProperty.call(data, prop) ? data[prop] : undefined;
      },
      set: function (target, prop, value) {
        if (typeof prop !== "symbol") {
          data[prop] = String(value);
          onChange();
        }
        return true;
      },
      deleteProperty: function (target, prop) {
        if (typeof prop !== "symbol") {
          delete data[prop];
          onChange();
        }
        return true;
      },
      has: function (target, prop) {
        return Object.prototype.hasOwnProperty.call(api, prop) || Object.prototype.hasOwnProperty.call(data, prop);
      },
      ownKeys: function () {
        return Object.keys(data);
      },
      getOwnPropertyDescriptor: function (target, prop) {
        if (!Object.prototype.hasOwnProperty.call(data, prop)) return undefined;
        return { value: data[prop], writable: true, enumerable: true, configurable: true };
      },
    });
    return { store: store, data: data };
  }

  var cookies = Object.create(null);
  Object.keys(settings.cookies || {}).forEach(function (name) {
    cookies[name] = String(settings.cookies[name]);
  });

  function snapshot(map) {
    var copy = {};
    Object.keys(map).forEach(function (key) {
      copy[key] = map[key];
    });
    return copy;
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!settings.persist) return;
    try {
      parent.postMessage({ type: settings.type, slug: settings.slug, local: snapshot(local.data), cookies: snapshot(cookies) }, settings.origin);
    } catch (error) {
      /* nothing else to try */
    }
  }

  function changed() {
    if (settings.persist && !timer) timer = setTimeout(flush, 300);
  }

  var local = makeStore(settings.local, changed);
  var session = makeStore(null, function () {});

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
      changed();
    },
  });

  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
  /* eslint-enable no-var */
}

// The game's HTML with the storage bridge inserted first (after the
// doctype, so the game keeps standards mode).
export function buildSandboxDocument(html, { slug, saved, origin, persist }) {
  const config = { type: MESSAGE_TYPE, slug, origin, persist: Boolean(persist), local: saved?.local || {}, cookies: saved?.cookies || {} };
  const bridge = `<script>(${storageBridge.toString()})(${scriptJson(config)});</script>`;
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  return doctype ? doctype[0] + bridge + html.slice(doctype[0].length) : bridge + html;
}

// The sandboxed game itself. With `persist`, saves are kept per `slug` in
// this page's localStorage; without it (editor previews) nothing is kept.
export function SandboxedGame({ html, slug, title, persist = false, reloadKey = 0, onSaveError }) {
  const frameRef = useRef(null);
  const [srcDoc, setSrcDoc] = useState("");

  useEffect(() => {
    setSrcDoc(buildSandboxDocument(html, { slug, saved: persist ? readSave(slug) : null, origin: window.location.origin, persist }));
  }, [html, slug, persist, reloadKey]);

  useEffect(() => {
    if (!persist) return undefined;
    function onMessage(event) {
      const frame = frameRef.current;
      // Only the game frame on this page may write its own save.
      if (!frame || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (!message || message.type !== MESSAGE_TYPE || message.slug !== slug) return;
      const local = stringMap(message.local);
      const cookies = stringMap(message.cookies);
      if (!local || !cookies) return;
      const text = JSON.stringify({ local, cookies, savedAt: Date.now() });
      if (text.length > MAX_SAVE_CHARS) {
        onSaveError?.("This game's save is too big to keep.");
        return;
      }
      try {
        window.localStorage.setItem(saveKey(slug), text);
      } catch {
        onSaveError?.("Your browser storage is full, so progress isn't being saved.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [persist, slug, onSaveError]);

  if (!srcDoc) return null;
  return (
    <iframe
      ref={frameRef}
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

export function clearProjectSave(slug) {
  try {
    window.localStorage.removeItem(saveKey(slug));
  } catch {
    /* nothing saved */
  }
}

// Full-screen player page for /projects/<slug>.
export default function HubProjectFrame({ project }) {
  const shellRef = useRef(null);
  const [html, setHtml] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");

  const htmlUrl = useMemo(
    () => "/api/hub-projects/" + encodeURIComponent(project.slug) + "/html?v=" + encodeURIComponent(project.version),
    [project.slug, project.version]
  );

  useEffect(() => {
    let active = true;
    setError("");
    fetch(htmlUrl)
      .then(async (response) => {
        if (response.status === 404) throw new Error("This project isn't available any more.");
        if (!response.ok) throw new Error("The game didn't load. Check your connection and try again.");
        return response.text();
      })
      .then((text) => active && setHtml(text))
      .catch((loadError) => active && setError(loadError.message || "The game didn't load."));
    return () => {
      active = false;
    };
  }, [htmlUrl, attempt]);

  useEffect(() => {
    recordHistory("game:" + project.slug, project.name);
  }, [project.slug, project.name]);

  const onSaveError = useCallback((message) => setNotice(message), []);

  function resetProgress() {
    if (!window.confirm(`Reset your progress in ${project.name}? The game will restart from the beginning.`)) return;
    clearProjectSave(project.slug);
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
              <span>{error}</span>
              <button type="button" className="game-btn" onClick={() => setAttempt((count) => count + 1)}>Try again</button>
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
