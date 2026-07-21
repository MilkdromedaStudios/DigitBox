import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
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
   *  Core save routine — used by autosave, manual save, and unload.
   * --------------------------------------------------------------- */
  const performSave = useCallback(
    (reason) => {
      const win = getGameWindow();
      if (!win || !canAccessGameStorage(win)) return null;
      const snapshot = captureSnapshot(win, slug);
      if (!snapshot) return null;
      lastSnapshotRef.current = snapshot;
      persistSnapshot(snapshot);
      setLastSavedAt(snapshot.savedAt);
      if (reason === "manual") setStatus("Saved");
      return snapshot;
    },
    [getGameWindow, slug]
  );

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

    if (snapshot) {
      lastSnapshotRef.current = snapshot;
      // Was the game's own storage empty at boot (a genuine wipe / first run)?
      const wasEmpty = !hasLiveGameKeys(win);
      const result = restoreSnapshot(win, snapshot);
      setLastSavedAt(snapshot.savedAt || 0);

      // Only force a reload when the game actually needs it: its localStorage
      // was empty and we refilled it, or we injected sessionStorage progress.
      // A returning player whose save is already live gets no disruptive reload.
      const needsReload =
        (wasEmpty && result.restoredLocal > 0) || result.sessionTouched;
      if (needsReload && !reloadedRef.current) {
        // The game already booted before we could inject the backup, so give
        // it one clean reload to pick the restored progress up.
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
    }
  }, [getGameWindow, isExternal, slug]);

  /* --------------------------------------------------------------- *
   *  Autosave timer + save-on-hide/unload.
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (availability !== AVAIL.READY) return undefined;

    const interval = setInterval(() => {
      if (autosaveOnRef.current) performSave("auto");
    }, AUTOSAVE_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && autosaveOnRef.current) {
        performSave("auto");
      }
    };
    const onPageHide = () => {
      if (autosaveOnRef.current) performSave("auto");
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
  }, [availability, performSave]);

  // Keep the "saved x ago" label fresh while the panel is open.
  useEffect(() => {
    if (!panelOpen || !lastSavedAt) return undefined;
    const id = setInterval(() => setNowTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, [panelOpen, lastSavedAt]);

  /* --------------------------------------------------------------- *
   *  Panel actions
   * --------------------------------------------------------------- */
  const handleManualSave = useCallback(() => {
    const snap = performSave("manual");
    setStatus(snap ? "Saved" : "Nothing to save yet");
  }, [performSave]);

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
      performSave("auto");
      setStatus("Autosave on");
    } else {
      setStatus("Autosave off");
    }
  }, [performSave]);

  const handleExport = useCallback(async () => {
    const snapshot = performSave("manual") || (await loadPersisted(slug));
    if (!snapshot) {
      setStatus("Nothing to export yet");
      return;
    }
    downloadSnapshot(snapshot, slug);
    setStatus("Save exported");
  }, [performSave, slug]);

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
    [AVAIL.BLOCKED]: "This game blocks external saving.",
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
                <div className="save-panel-title">{title || slug}</div>
                <div className="save-panel-sub">{availabilityNote}</div>
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
