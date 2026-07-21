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
  hasIndexedDbData,
  hasLiveGameKeys,
  isAutosaveEnabled,
  loadPersisted,
  parseImportedSnapshot,
  persistSnapshot,
  purgeLiveKeys,
  restoreIndexedDb,
  restoreSnapshot,
  setAutosaveEnabled,
  snapshotWeight,
} from "../lib/gameSaves";

const AUTOSAVE_INTERVAL_MS = 20000;
// After a (re)load, wait before arming autosave so a freshly-booted game can
// load its own save / finish restoring first — otherwise autosave would
// capture the blank starting state and overwrite the real backup.
const ARM_DELAY_MS = 4000;

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
  const armedRef = useRef(false); // autosave is allowed to run
  const armTimerRef = useRef(null);
  const backupWeightRef = useRef(0); // size of the known-good backup
  const backupHasIdbRef = useRef(false);

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

  // Arm autosave after a settle delay (idempotent).
  const armAutosave = useCallback(() => {
    if (armedRef.current || armTimerRef.current) return;
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null;
      armedRef.current = true;
    }, ARM_DELAY_MS);
  }, []);

  /* --------------------------------------------------------------- *
   *  Save routines.
   *  Both refuse to shrink an existing backup (regression guard) so a
   *  freshly-started game can never overwrite real progress.
   * --------------------------------------------------------------- */
  const performSaveAsync = useCallback(
    async ({ manual = false } = {}) => {
      const win = getGameWindow();
      if (!win || !canAccessGameStorage(win) || savingRef.current) return null;
      savingRef.current = true;
      try {
        const snapshot = await captureFullSnapshot(win, slug);
        if (!snapshot) return { empty: true };
        const weight = snapshotWeight(snapshot);
        if (!manual && weight < backupWeightRef.current) {
          // Would shrink the backup — protect the existing save.
          return { skipped: true };
        }
        await persistSnapshot(snapshot);
        lastSnapshotRef.current = snapshot;
        backupWeightRef.current = weight;
        backupHasIdbRef.current = Boolean(snapshot.idb);
        setLastSavedAt(snapshot.savedAt);
        return snapshot;
      } catch {
        return null;
      } finally {
        savingRef.current = false;
      }
    },
    [getGameWindow, slug]
  );

  // Fast, synchronous save for page unload (async work would not finish).
  // Web storage only; skipped for games whose backup includes IndexedDB, so a
  // web-only snapshot can't clobber a richer IDB save.
  const performSaveSync = useCallback(() => {
    if (backupHasIdbRef.current) return null;
    const win = getGameWindow();
    if (!win || !canAccessGameStorage(win)) return null;
    const snapshot = captureSnapshot(win, slug);
    if (!snapshot) return null;
    if (snapshotWeight(snapshot) < backupWeightRef.current) return null;
    lastSnapshotRef.current = snapshot;
    backupWeightRef.current = snapshotWeight(snapshot);
    persistSnapshot(snapshot);
    setLastSavedAt(snapshot.savedAt);
    return snapshot;
  }, [getGameWindow, slug]);

  /* --------------------------------------------------------------- *
   *  On (re)load of the iframe: restore backup (only if the game booted
   *  empty), then arm autosave.
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

    if (restoredRef.current) {
      // Second load (e.g. after our restore reload) — just arm autosave.
      armAutosave();
      return;
    }
    restoredRef.current = true;

    let snapshot = null;
    try {
      snapshot = await loadPersisted(slug);
    } catch {
      snapshot = null;
    }

    if (snapshot) {
      lastSnapshotRef.current = snapshot;
      backupWeightRef.current = snapshotWeight(snapshot);
      backupHasIdbRef.current = Boolean(snapshot.idb);
      setLastSavedAt(snapshot.savedAt || 0);

      // Only restore when the game genuinely booted with no data of its own.
      // If it already has live storage, it loaded its own save — leave it be.
      let liveEmpty = !hasLiveGameKeys(win);
      if (liveEmpty) {
        try {
          liveEmpty = !(await hasIndexedDbData(win));
        } catch {
          /* keep liveEmpty */
        }
      }

      if (liveEmpty) {
        const result = restoreSnapshot(win, snapshot);
        let idbCreated = 0;
        if (snapshot.idb) {
          try {
            idbCreated = await restoreIndexedDb(win, snapshot.idb);
          } catch {
            idbCreated = 0;
          }
        }
        const restoredAnything =
          result.restoredLocal > 0 || result.sessionTouched || idbCreated > 0;
        if (restoredAnything && !reloadedRef.current) {
          reloadedRef.current = true;
          setStatus("Restoring your save…");
          try {
            win.location.reload();
          } catch {
            /* ignore */
          }
          return; // arming happens on the reload's onLoad
        }
      }
      setStatus(snapshot.savedAt ? "Save loaded" : "");
    }

    armAutosave();
  }, [armAutosave, getGameWindow, isExternal, slug]);

  /* --------------------------------------------------------------- *
   *  Autosave timer + save-on-hide/unload (all gated on `armed`).
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (availability !== AVAIL.READY) return undefined;

    const interval = setInterval(() => {
      if (armedRef.current && autosaveOnRef.current) performSaveAsync();
    }, AUTOSAVE_INTERVAL_MS);

    const onVisibility = () => {
      if (
        document.visibilityState === "hidden" &&
        armedRef.current &&
        autosaveOnRef.current
      ) {
        performSaveSync();
      }
    };
    const onPageHide = () => {
      if (armedRef.current && autosaveOnRef.current) performSaveSync();
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

  useEffect(() => () => clearTimeout(armTimerRef.current), []);

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
    const res = await performSaveAsync({ manual: true });
    if (res && res.slug) {
      setStatus("Saved");
      return;
    }
    // Nothing capturable — explain honestly.
    const win = getGameWindow();
    let idbData = false;
    try {
      idbData = win ? await hasIndexedDbData(win) : false;
    } catch {
      idbData = false;
    }
    setStatus(
      idbData
        ? "This game stores its save in a way DigitBox can't copy yet — your browser keeps it automatically"
        : "No save data found yet — play a little, then save"
    );
  }, [getGameWindow, performSaveAsync]);

  const handleRestore = useCallback(async () => {
    const win = getGameWindow();
    if (!win) return;
    setStatus("Loading save…");
    const snapshot = await loadPersisted(slug);
    if (!snapshot) {
      setStatus("No saved progress found");
      return;
    }
    lastSnapshotRef.current = snapshot;
    backupWeightRef.current = snapshotWeight(snapshot);
    backupHasIdbRef.current = Boolean(snapshot.idb);
    restoreSnapshot(win, snapshot, { overwrite: true });
    if (snapshot.idb) {
      try {
        await restoreIndexedDb(win, snapshot.idb);
      } catch {
        /* ignore */
      }
    }
    setLastSavedAt(snapshot.savedAt || 0);
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
    backupWeightRef.current = 0;
    backupHasIdbRef.current = false;
    armedRef.current = false; // don't immediately re-save the fresh game
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
    setStatus(next ? "Autosave on" : "Autosave off");
  }, []);

  const handleExport = useCallback(async () => {
    const snapshot = (await performSaveAsync({ manual: true })) || (await loadPersisted(slug));
    if (!snapshot || !snapshot.slug) {
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
        backupWeightRef.current = snapshotWeight(snapshot);
        backupHasIdbRef.current = Boolean(snapshot.idb);
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
                  <span>Autosave while you play</span>
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
                  Beta — autosave copies the game&apos;s own browser storage. Some games save
                  in a way DigitBox can&apos;t reach yet, and restoring reloads the game.
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
