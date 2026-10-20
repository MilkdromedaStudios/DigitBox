import { useEffect, useMemo, useState } from "react";
import { GAMES, toHubGame } from "./catalog";

// Projects added from the admin page (GET /api/hub-projects), shared across
// page navigations like lib/useVideos.js. Pages render the built-in games
// first; added projects join the list once they load.
let loaded = null;
let pending = null;
const listeners = new Set();

function load() {
  if (!pending) {
    pending = fetch("/api/hub-projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        loaded = payload && Array.isArray(payload.projects) ? payload.projects.map(toHubGame) : [];
        listeners.forEach((listener) => listener(loaded));
        return loaded;
      })
      .catch(() => [])
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

// Call after the admin page changes a project, so lists show the change.
export function refreshHubProjects() {
  loaded = null;
  return load();
}

// Added projects as game items (newest first); [] until they load.
export function useHubGames() {
  const [games, setGames] = useState(loaded || []);
  useEffect(() => {
    listeners.add(setGames);
    if (loaded) setGames(loaded);
    else load();
    return () => listeners.delete(setGames);
  }, []);
  return games;
}

// Every game: added projects first, then the built-in ones.
export function useAllGames() {
  const hubGames = useHubGames();
  return useMemo(() => {
    const builtIn = new Set(GAMES.map((game) => game.slug));
    return [...hubGames.filter((game) => !builtIn.has(game.slug)), ...GAMES];
  }, [hubGames]);
}
