import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureFullSnapshot,
  captureSnapshot,
  canAccessGameStorage,
  clearPersisted,
  downloadSnapshot,
  formatAgo,
  getForeignSnapshotKeys,
  hasLiveGameKeys,
  isAutosaveEnabled,
  loadPersisted,
  parseImportedSnapshot,
  persistSnapshot,
  purgeLiveKeys,
  restoreIndexedDb,
  restoreSnapshot,
  setAutosaveEnabled,
} from "../lib/gameSaves";

const AUTOSAVE_INTERVAL_MS = 15000;

// Availability of the autosave layer for the current game.
const AVAIL = {
  PENDING: "pending", // frame not loaded yet
  READY: "ready", // same-origin, storage reachable — autosave active
  EXTERNAL: "external", // game is hosted on another site (cross-origin)
  BLOCKED: "blocked", // same site but storage is unreadable/blocked
};

export default function GameFrame({ src, title, slug, isExternal = false }) {
  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);

  // Refs that must survive iframe reloads without re-triggering effects.
  const restoredRef = useRef(false);
  const reloadedRef = useRef(false);
  const lastSnapshotRef = useRef(null);
  const autosaveOnRef = useRef(true);
  const savingRef = useRef(false);

  const [availability, setAvailability] = useState(AVAIL.PENDING);
  const [autosaveOn, setAutosaveOn] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [status, setStatus] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [nowTick, setNowTick] = useState(0); // forces "x ago" label to refresh

  useEffect(() => {
    const enabled = isAutosaveEnabled();
    autosaveOnRef.current = enabled;
    setAutosaveOn(enabled);
  }, []);

  const getGameWindow = useCallback(() => {
    try {
      return iframeRef.current?.contentWindow || null;
    } catch {
      return null;
    }
  }, []);

  /* --------------------------------------------------------------- *
   *  Save routines.
   *  - Async (full): web storage + IndexedDB. Used by autosave + manual.
   *  - Sync (fast): web storage only. Used on page unload where async
   *    work would not finish.
   * --------------------------------------------------------------- */
  const performSaveAsync = useCallback(async () => {
    const win = getGameWindow();
    if (!win || !canAccessGameStorage(win) || savingRef.current) return null;
    savingRef.current = true;
    try {
      const snapshot = await captureFullSnapshot(win, slug);
      if (!snapshot) return null;
      lastSnapshotRef.current = snapshot;
      await persistSnapshot(snapshot);
      setLastSavedAt(snapshot.savedAt);
      return snapshot;
    } catch {
      return null;
    } finally {
      savingRef.current = false;
    }
  }, [getGameWindow, slug]);

  const performSaveSync = useCallback(() => {
    const win = getGameWindow();
    if (!win || !canAccessGameStorage(win)) return null;
    const snapshot = captureSnapshot(win, slug);
    if (!snapshot) return null;
    lastSnapshotRef.current = snapshot;
    persistSnapshot(snapshot);
    setLastSavedAt(snapshot.savedAt);
    return snapshot;
  }, [getGameWindow, slug]);

  /* --------------------------------------------------------------- *
   *  On (re)load of the iframe: restore backup, then arm autosave.
   * --------------------------------------------------------------- */
  const handleFrameLoad = useCallback(async () => {
    if (isExternal) {
      setAvailability(AVAIL.EXTERNAL);
      return;
    }
    const win = getGameWindow();
    if (!win || !canAccessGameStorage(win)) {
      setAvailability(AVAIL.BLOCKED);
      return;
    }
    setAvailability(AVAIL.READY);

    if (restoredRef.current) return; // already handled this mount
    restoredRef.current = true;

    let snapshot = null;
    try {
      snapshot = await loadPersisted(slug);
    } catch {
      snapshot = null;
    }
    if (!snapshot) return;

    lastSnapshotRef.current = snapshot;
    setLastSavedAt(snapshot.savedAt || 0);

    // Was the game's own web storage empty at boot (a genuine wipe / first run)?
    const wasEmpty = !hasLiveGameKeys(win);
    const result = restoreSnapshot(win, snapshot);

    // IndexedDB restore is non-destructive: it only recreates databases the
    // browser doesn't already have (e.g. a fresh browser / cleared data).
    let idbCreated = 0;
    if (snapshot.idb) {
      try {
        idbCreated = await restoreIndexedDb(win, snapshot.idb);
      } catch {
        idbCreated = 0;
      }
    }

    // Only force a reload when the game actually needs it, so a returning
    // player whose save is already live gets no disruptive reload.
    const needsReload =
      (wasEmpty && result.restoredLocal > 0) || result.sessionTouched || idbCreated > 0;
    if (needsReload && !reloadedRef.current) {
      reloadedRef.current = true;
      setStatus("Progress restored");
      try {
        win.location.reload();
      } catch {
        /* ignore */
      }
      return;
    }
    setStatus(snapshot.savedAt ? "Save loaded" : "");
  }, [getGameWindow, isExternal, slug]);

  /* --------------------------------------------------------------- *
   *  Autosave timer + save-on-hide/unload.
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (availability !== AVAIL.READY) return undefined;

    const interval = setInterval(() => {
      if (autosaveOnRef.current) performSaveAsync();
    }, AUTOSAVE_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && autosaveOnRef.current) {
        performSaveSync();
      }
    };
    const onPageHide = () => {
      if (autosaveOnRef.current) performSaveSync();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [availability, performSaveAsync, performSaveSync]);

  // Keep the "saved x ago" label fresh while the panel is open.
  useEffect(() => {
    if (!panelOpen || !lastSavedAt) return undefined;
    const id = setInterval(() => setNowTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, [panelOpen, lastSavedAt]);

  /* --------------------------------------------------------------- *
   *  Panel actions
   * --------------------------------------------------------------- */
  const handleManualSave = useCallback(async () => {
    setStatus("Saving…");
    const snap = await performSaveAsync();
    setStatus(snap ? "Saved" : "No save data found yet — play a little, then save");
  }, [performSaveAsync]);

  const handleRestore = useCallback(async () => {
    const win = getGameWindow();
    if (!win) return;
    const snapshot = await loadPersisted(slug);
    if (!snapshot) {
      setStatus("No saved progress found");
      return;
    }
    lastSnapshotRef.current = snapshot;
    restoreSnapshot(win, snapshot, { overwrite: true });
    if (snapshot.idb) {
      try {
        await restoreIndexedDb(win, snapshot.idb);
      } catch {
        /* ignore */
      }
    }
    setLastSavedAt(snapshot.savedAt || 0);
    setStatus("Restoring…");
    reloadedRef.current = true;
    try {
      win.location.reload();
    } catch {
      /* ignore */
    }
  }, [getGameWindow, slug]);

  const handleReset = useCallback(async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Reset saved progress for "${title || slug}"? This clears the autosave and reloads the game fresh.`
      )
    ) {
      return;
    }
    const win = getGameWindow();
    const snapshot = lastSnapshotRef.current || (await loadPersisted(slug));
    await clearPersisted(slug);
    if (win && snapshot) {
      // Never delete live keys another game still depends on (shared origin).
      const protectedKeys = getForeignSnapshotKeys(slug);
      purgeLiveKeys(win, snapshot, { protectedKeys });
    }
    lastSnapshotRef.current = null;
    setLastSavedAt(0);
    setStatus("Save cleared");
    reloadedRef.current = true;
    try {
      win?.location?.reload();
    } catch {
      /* ignore */
    }
  }, [getGameWindow, slug, title]);

  const handleToggleAutosave = useCallback(() => {
    const next = !autosaveOnRef.current;
    autosaveOnRef.current = next;
    setAutosaveEnabled(next);
    setAutosaveOn(next);
    if (next) {
      performSaveAsync();
      setStatus("Autosave on");
    } else {
      setStatus("Autosave off");
    }
  }, [performSaveAsync]);

  const handleExport = useCallback(async () => {
    const snapshot = (await performSaveAsync()) || (await loadPersisted(slug));
    if (!snapshot) {
      setStatus("Nothing to export yet");
      return;
    }
    downloadSnapshot(snapshot, slug);
    setStatus("Save exported");
  }, [performSaveAsync, slug]);

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const snapshot = parseImportedSnapshot(text, slug);
        if (!snapshot) {
          setStatus("That file isn't a valid save");
          return;
        }
        await persistSnapshot(snapshot);
        lastSnapshotRef.current = snapshot;
        setLastSavedAt(snapshot.savedAt);
        const win = getGameWindow();
        if (win) {
          restoreSnapshot(win, snapshot, { overwrite: true });
          if (snapshot.idb) {
            try {
              await restoreIndexedDb(win, snapshot.idb);
            } catch {
              /* ignore */
            }
          }
          reloadedRef.current = true;
          try {
            win.location.reload();
          } catch {
            /* ignore */
          }
        }
        setStatus("Save imported");
      } catch {
        setStatus("Could not read that file");
      }
    },
    [getGameWindow, slug]
  );

  const availabilityNote = {
    [AVAIL.PENDING]: "Starting up…",
    [AVAIL.READY]: autosaveOn ? "Autosave is on" : "Autosave is off",
    [AVAIL.EXTERNAL]: "This game runs on another site, so DigitBox can't autosave it.",
    [AVAIL.BLOCKED]: "This game blocks external saving, so autosave isn't available.",
  }[availability];

  const canManage = availability === AVAIL.READY;

  return (
    <div className="game-shell">
      <iframe
        ref={iframeRef}
        title={title || "Project"}
        src={src}
        onLoad={handleFrameLoad}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads"
        allow="autoplay; fullscreen; gamepad"
        className="game-frame"
      />

      <div className={`game-toolbar${panelOpen ? " is-open" : ""}`}>
        <div className="game-toolbar-bar">
          <Link href="/gallery" className="game-btn game-btn-back" aria-label="Back to gallery">
            <span aria-hidden="true">←</span>
            <span className="game-btn-label">Exit</span>
          </Link>

          <button
            type="button"
            className={`game-btn game-btn-saves${autosaveOn && canManage ? " is-active" : ""}`}
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
          >
            <span aria-hidden="true">💾</span>
            <span className="game-btn-label">Saves</span>
            {canManage && autosaveOn && <span className="save-dot" aria-hidden="true" />}
          </button>
        </div>

        {panelOpen && (
          <div className="game-save-panel" role="dialog" aria-label="Game save controls">
            <div className="save-panel-head">
              <div>
                <div className="save-panel-title">
                  {title || slug}
                  <span className="save-beta" title="Autosave is a beta feature">beta</span>
                </div>
                <div className="save-panel-sub">Autosave</div>
              </div>
              <button
                type="button"
                className="save-panel-close"
                onClick={() => setPanelOpen(false)}
                aria-label="Close save panel"
              >
                ✕
              </button>
            </div>

            {canManage ? (
              <>
                <label className="save-toggle">
                  <input type="checkbox" checked={autosaveOn} onChange={handleToggleAutosave} />
                  <span className="save-toggle-track" aria-hidden="true">
                    <span className="save-toggle-thumb" />
                  </span>
                  <span>Autosave every 15s</span>
                </label>

                <div className="save-status" data-tick={nowTick}>
                  {lastSavedAt
                    ? `Last saved ${formatAgo(lastSavedAt)}`
                    : "No save captured yet"}
                  {status ? ` · ${status}` : ""}
                </div>

                <div className="save-actions">
                  <button type="button" className="save-act save-act-primary" onClick={handleManualSave}>
                    Save now
                  </button>
                  <button type="button" className="save-act" onClick={handleRestore}>
                    Load save
                  </button>
                  <button type="button" className="save-act" onClick={handleExport}>
                    Export
                  </button>
                  <button
                    type="button"
                    className="save-act"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import
                  </button>
                  <button type="button" className="save-act save-act-danger" onClick={handleReset}>
                    Reset save
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  hidden
                />

                <p className="save-note">
                  Beta — progress is saved from the game&apos;s browser storage. Some games
                  keep saves in a way DigitBox can&apos;t reach yet.
                </p>
              </>
            ) : (
              <div className="save-status save-status-muted">{availabilityNote}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
