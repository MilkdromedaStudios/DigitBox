import { useCallback, useEffect, useState } from "react";
import { normalizeVideo } from "./catalog";

// Client side of /api/youtube. Feeds are kept in memory across page
// navigations and shared by every component that asks for the same one, so
// the home page and the watch page's Up next don't fetch twice.

const LOADING = { videos: [], nextPageToken: null, configured: null, error: "", loading: true };
const feeds = new Map();

function feedUrl(feed, params, pageToken) {
  const search = new URLSearchParams({ feed });
  for (const [name, value] of Object.entries(params || {})) {
    if (value) search.set(name, value);
  }
  if (pageToken) search.set("page", pageToken);
  return "/api/youtube?" + search.toString();
}

async function fetchFeed(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error("unavailable");
  return {
    configured: body.configured !== false,
    error: body.error || "",
    videos: (body.videos || []).map(normalizeVideo).filter(Boolean),
    nextPageToken: body.nextPageToken || null,
  };
}

function update(entry, patch) {
  entry.state = { ...entry.state, ...patch };
  entry.listeners.forEach((listener) => listener(entry.state));
}

async function loadPage(key, entry, url, append) {
  update(entry, { loading: true });
  try {
    const page = await fetchFeed(url);
    const seen = new Set(append ? entry.state.videos.map((video) => video.id) : []);
    const fresh = page.videos.filter((video) => !seen.has(video.id));
    update(entry, {
      configured: page.configured,
      error: page.error,
      videos: append ? [...entry.state.videos, ...fresh] : fresh,
      nextPageToken: page.nextPageToken,
      loading: false,
    });
  } catch {
    update(entry, { error: "unavailable", loading: false, nextPageToken: append ? entry.state.nextPageToken : null });
  }
  // A feed that failed outright is retried by the next component that asks.
  if (!append && entry.state.error && !entry.state.videos.length) feeds.delete(key);
}

// { videos, loading, configured, error, hasMore, loadMore } for one feed.
// configured is null until the first response arrives.
export function useYouTubeFeed(feed, params = {}, { enabled = true } = {}) {
  const key = feedUrl(feed, params);
  const [state, setState] = useState(() => (enabled && feeds.get(key)?.state) || LOADING);

  useEffect(() => {
    if (!enabled) return undefined;
    let entry = feeds.get(key);
    if (!entry) {
      entry = { state: LOADING, listeners: new Set() };
      feeds.set(key, entry);
      loadPage(key, entry, key, false);
    }
    entry.listeners.add(setState);
    setState(entry.state);
    return () => entry.listeners.delete(setState);
  }, [key, enabled]);

  const loadMore = useCallback(() => {
    const entry = feeds.get(key);
    if (!entry || entry.state.loading || !entry.state.nextPageToken) return;
    loadPage(key, entry, feedUrl(feed, params, entry.state.nextPageToken), true);
    // params is folded into key, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, feed]);

  return { ...state, hasMore: Boolean(state.nextPageToken), loadMore };
}

// A video already loaded by any feed, for instant watch-page renders.
export function findLoadedVideo(id) {
  for (const entry of feeds.values()) {
    const video = entry.state.videos.find((item) => item.id === id);
    if (video) return video;
  }
  return null;
}

const looked = new Map();

// Details for specific video ids (1 quota unit per 50, cached server-side).
// Resolves to a Map of id → video; unknown or failed ids are left out.
export async function lookupYouTube(ids) {
  const missing = [...new Set(ids)].filter((id) => !looked.has(id)).slice(0, 50);
  if (missing.length) {
    try {
      const page = await fetchFeed(feedUrl("lookup", { ids: missing.join(",") }));
      for (const video of page.videos) looked.set(video.id, video);
    } catch {
      /* callers keep their placeholders */
    }
  }
  return new Map(ids.filter((id) => looked.has(id)).map((id) => [id, looked.get(id)]));
}
