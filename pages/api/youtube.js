import { jsonResponse } from "../../lib/apiResponse";
import { cachedJson } from "../../lib/edgeCache";
import videoData from "../../data/videos.json";
import {
  CATEGORIES,
  YouTubeError,
  availableCategories,
  checkKey,
  lookupVideos,
  popularVideos,
  recommendedVideos,
  searchVideos,
  shortsVideos,
  youtubeConfigured,
} from "../../lib/youtube";

export const config = { runtime: "edge" };

// GET /api/youtube?feed=recommended|videos|categories|shorts|search|lookup|status
//   videos: &category=<id from CATEGORIES>   search: &q=   lookup: &ids=a,b
//   paged feeds (videos, search): &page=<nextPageToken from the last response>
// Responses are { configured, videos, nextPageToken } ({ categories } for
// feed=categories) and, when YouTube failed with nothing cached to fall back
// on, an `error` reason. Cache lifetimes are set to stay well inside the
// daily quota (see lib/youtube.js).

const HOUR = 60 * 60 * 1000;
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,100}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Popular charts are per country. YOUTUBE_REGION pins one country for every
// visitor (fewer distinct caches, so less quota); otherwise use the visitor's
// country from the platform's geolocation header, defaulting to US.
function visitorRegion(req) {
  const pinned = (process.env.YOUTUBE_REGION || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(pinned)) return pinned;
  // Vercel sets x-vercel-ip-country, and so does the Cloudflare adapter.
  const header = (req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(header) && header !== "XX" && header !== "T1") return header;
  return "US";
}

const categoriesFor = (region) =>
  cachedJson("yt:categories:" + region, 12 * HOUR, () => availableCategories({ region }));

const recommendedFor = (region) =>
  cachedJson("yt:recommended:" + region, HOUR, async () => {
    const available = await categoriesFor(region).catch(() => CATEGORIES);
    return recommendedVideos({ region, categoryIds: available.map((category) => category.id) });
  });

// s-maxage lets Vercel's CDN cache responses too (Cloudflare caches in code,
// lib/edgeCache.js); results depend on the visitor's country.
function reply(body, maxAgeSeconds) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": maxAgeSeconds ? "public, max-age=" + maxAgeSeconds + ", s-maxage=" + maxAgeSeconds * 3 : "no-store",
      Vary: "X-Vercel-IP-Country",
    },
  });
}

async function loadFeed(feed, params, region) {
  const pageToken = params.get("page") || undefined;
  const page = pageToken || "1";

  switch (feed) {
    case "recommended":
      return recommendedFor(region);

    case "categories":
      return { categories: await categoriesFor(region) };

    case "videos": {
      const category = params.get("category") || "";
      if (category && !CATEGORIES.some((item) => item.id === category)) return null;
      return cachedJson(["yt:popular", region, category || "all", page].join(":"), HOUR, () =>
        popularVideos({ region, categoryId: category || undefined, pageToken })
      );
    }

    case "shorts":
      // Shorts come from the popular channels' Shorts playlists (no search
      // quota), plus the DigitBox channel's own.
      return cachedJson("yt:shorts:" + region, 6 * HOUR, async () => {
        const recommended = await recommendedFor(region).catch(() => ({ videos: [] }));
        const channelIds = [...recommended.videos.map((video) => video.channelId), ...videoData.channels.map((channel) => channel.id)];
        return shortsVideos({ region, channelIds });
      });

    case "search": {
      const q = (params.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 100);
      if (!q) return { videos: [], nextPageToken: null };
      return cachedJson(["yt:search", region, q.toLowerCase(), page].join(":"), 12 * HOUR, () =>
        searchVideos({ q, region, pageToken })
      );
    }

    case "lookup": {
      const ids = [...new Set((params.get("ids") || "").split(",").filter((id) => VIDEO_ID.test(id)))].slice(0, 50).sort();
      if (!ids.length) return null;
      return cachedJson("yt:lookup:" + region + ":" + ids.join(","), 24 * HOUR, () => lookupVideos({ ids, region }));
    }

    default:
      return null;
  }
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const params = new URL(req.url).searchParams;
  const feed = params.get("feed") || "recommended";
  const pageToken = params.get("page");
  if (pageToken && !PAGE_TOKEN.test(pageToken)) return jsonResponse({ error: "Invalid page" }, 400);

  if (!youtubeConfigured()) {
    return reply(feed === "status" ? { configured: false, ok: false } : { configured: false, videos: [], nextPageToken: null }, 60);
  }

  const region = visitorRegion(req);

  // Setup check: always a live call, so it reflects the key as it is now.
  if (feed === "status") {
    try {
      await checkKey();
      return reply({ configured: true, ok: true, region }, 0);
    } catch (error) {
      return reply({ configured: true, ok: false, reason: error instanceof YouTubeError ? error.reason : "unavailable" }, 0);
    }
  }

  try {
    const result = await loadFeed(feed, params, region);
    if (!result) return jsonResponse({ error: "Invalid request" }, 400);
    if (result.categories) return reply({ configured: true, categories: result.categories }, 3600);
    return reply({ configured: true, videos: result.videos, nextPageToken: result.nextPageToken || null }, 300);
  } catch (error) {
    const reason = error instanceof YouTubeError ? error.reason : "unavailable";
    return reply({ configured: true, error: reason, videos: [], nextPageToken: null }, 60);
  }
}
