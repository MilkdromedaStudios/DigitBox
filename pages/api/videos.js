import videoData from "../../data/videos.json";
import { jsonResponse } from "../../lib/apiResponse";
import { cachedJson } from "../../lib/edgeCache";
import { channelUploads, youtubeConfigured } from "../../lib/youtube";

export const config = { runtime: "edge" };

// Latest uploads for every channel in data/videos.json: through the YouTube
// Data API when YOUTUBE_API_KEY is set (durations, avatars, proper Shorts),
// otherwise from YouTube's public RSS feed (no key needed). Hand-added entries in data/videos.json are
// merged in, so the list survives a feed outage and can hold older videos the
// feed (latest 15 only) no longer includes.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text) {
  return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function pick(block, pattern) {
  const match = block.match(pattern);
  return match ? match[1] : "";
}

function parseFeed(xml, channel) {
  return xml
    .split("<entry>")
    .slice(1)
    .map((entry) => {
      const views = pick(entry, /<media:statistics[^>]*views="(\d+)"/);
      return {
        id: pick(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/),
        title: decodeXml(pick(entry, /<title>([^<]*)<\/title>/)),
        channelId: channel.id,
        channel: decodeXml(pick(entry, /<author>\s*<name>([^<]*)<\/name>/)) || channel.name,
        published: pick(entry, /<published>([^<]+)<\/published>/),
        description: decodeXml(pick(entry, /<media:description>([\s\S]*?)<\/media:description>/)),
        views: views ? Number(views) : null,
        short: /\/shorts\//.test(pick(entry, /<link rel="alternate" href="([^"]+)"/)),
      };
    })
    .filter((video) => /^[A-Za-z0-9_-]{11}$/.test(video.id));
}

// YouTube's feed endpoint intermittently answers 404/500 for channels that
// exist, so give each channel a few attempts, spaced out a little.
async function fetchChannel(channel) {
  const url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(channel.id);
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    try {
      const response = await fetch(url, { headers: { Accept: "application/atom+xml, application/xml;q=0.9" } });
      if (response.ok) return parseFeed(await response.text(), channel);
      lastError = new Error("Feed " + channel.id + " returned " + response.status);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function apiUploads() {
  const lists = await Promise.all(videoData.channels.map((channel) => channelUploads({ channelId: channel.id })));
  return lists.flatMap((list) => list.videos);
}

// Fresh for 30 minutes; when YouTube is failing the last good feed is served
// instead of the stored list (see lib/edgeCache.js).
async function liveVideos() {
  try {
    return await cachedJson("api-videos-feed-v2", 30 * 60 * 1000, async () => {
      if (youtubeConfigured()) {
        const fromApi = await apiUploads().catch(() => []);
        if (fromApi.length) return fromApi;
      }
      const results = await Promise.allSettled(videoData.channels.map(fetchChannel));
      const live = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      if (!live.length) throw new Error("No channel feed could be read");
      return live;
    });
  } catch {
    return [];
  }
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const live = await liveVideos();

  // Live data first so fresh titles/view counts win over the stored copy.
  const byId = new Map();
  for (const video of [...live, ...videoData.videos]) {
    if (!byId.has(video.id)) byId.set(video.id, video);
  }
  const videos = [...byId.values()].sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  return new Response(JSON.stringify({ videos, live: live.length > 0 }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // A failed feed is retried soon, without every visitor re-fetching it.
      "Cache-Control": live.length ? "public, max-age=300, s-maxage=900" : "public, max-age=60, s-maxage=120",
    },
  });
}
