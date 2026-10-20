import { useEffect, useState } from "react";
import { SEED_VIDEOS, mergeVideos } from "./catalog";

// Live channel uploads from /api/videos, shared across page navigations.
// Pages render the seed list from data/videos.json first, so there is always
// something to show even before (or without) the live feed.
let liveVideos = null;
let pending = null;

function loadLiveVideos() {
  if (!pending) {
    pending = fetch("/api/videos")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const list = payload && Array.isArray(payload.videos) ? mergeVideos(payload.videos, SEED_VIDEOS) : null;
        if (list && list.length) liveVideos = list;
        return liveVideos;
      })
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useVideos() {
  const [videos, setVideos] = useState(liveVideos || SEED_VIDEOS);

  useEffect(() => {
    if (liveVideos) return undefined;
    let active = true;
    loadLiveVideos().then((list) => {
      if (active && list) setVideos(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return videos;
}
