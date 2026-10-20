import { useEffect, useMemo, useState } from "react";
import { GAMES, applyBuiltInChanges, toHubGame } from "./catalog";

// The game catalog as edited from the admin page (GET /api/hub-projects):
// added projects, plus edits to the built-in games, some of which may be
// hidden or deleted (taken down). Shared across page navigations like
// lib/useVideos.js.
//
// Built-in games are only shown once the edits have loaded, so a deleted
// game never appears, not even for a moment or in the server-rendered HTML.
// If the edits can't load (or there is no storage, as on the Vercel
// deploy), the built-in games show as they ship.

let state = null; // { hubGames, changes } once loaded
let generation = 0;
let pending = null;
const listeners = new Set();

function publish(next) {
  state = next;
  listeners.forEach((listener) => listener(next));
}

function load() {
  if (pending) return pending;
  const mine = ++generation;
  pending = fetch("/api/hub-projects", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((payload) => {
      if (mine !== generation) return;
      const ok = payload && Array.isArray(payload.projects);
      publish({
        hubGames: ok ? payload.projects.map(toHubGame) : [],
        changes: ok && payload.builtIns && typeof payload.builtIns === "object" ? payload.builtIns : null,
        // A failed load isn't kept, so the next page tries again.
        failed: !ok && !(payload && payload.available === false),
      });
    })
    .finally(() => {
      if (mine === generation) pending = null;
    });
  return pending;
}

// Call after the admin page changes anything, so every list shows it. A
// request already in flight may predate the change, so start a new one.
export function refreshHubProjects() {
  pending = null;
  return load();
}

// { games, ready }: added projects (newest first) then the built-in games,
// with edits applied and hidden or deleted ones left out. `games` is empty
// until `ready`.
export function useGameCatalog() {
  const [current, setCurrent] = useState(state);
  useEffect(() => {
    listeners.add(setCurrent);
    if (state && !state.failed) setCurrent(state);
    else load();
    return () => listeners.delete(setCurrent);
  }, []);

  return useMemo(() => {
    if (!current) return { games: [], ready: false };
    const builtIn = new Set(GAMES.map((game) => game.slug));
    const hubGames = current.hubGames.filter((game) => !builtIn.has(game.slug));
    return { games: [...hubGames, ...applyBuiltInChanges(GAMES, current.changes)], ready: true };
  }, [current]);
}

// Just the games list (empty until the catalog is ready).
export function useAllGames() {
  return useGameCatalog().games;
}
