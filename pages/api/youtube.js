import { jsonResponse } from "../../lib/apiResponse";
import { cachedJson, hasCacheApi } from "../../lib/edgeCache";
import videoData from "../../data/videos.json";
import {
  CATEGORIES,
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
// daily quota (see lib/youtube.js and docs/YOUTUBE_API_SETUP.md).

const HOUR = 60 * 60 * 1000;
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,100}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// How long browsers keep each feed, in seconds. Shared caches keep it longer
// (see reply()).
const CLIENT_MAX_AGE = { recommended: 900, videos: 900, categories: 3600, shorts: 3600, search: 3600, lookup: 3600 };

// Popular charts are per country. Every distinct country is cached (and so
// paid for) separately, per Cloudflare data center, so by default one region
// serves everyone. YOUTUBE_REGION=<two-letter code> picks it; YOUTUBE_REGION=auto
// uses each visitor's own country instead.
function regionMode(req) {
  const setting = (process.env.YOUTUBE_REGION || "").trim().toUpperCase();
  if (setting === "AUTO") {
    // Vercel sets x-vercel-ip-country, and so does the Cloudflare adapter.
    const header = (req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || "").toUpperCase();
    const region = /^[A-Z]{2}$/.test(header) && header !== "XX" && header !== "T1" ? header : "US";
    return { region, perVisitor: true };
  }
  return { region: /^[A-Z]{2}$/.test(setting) ? setting : "US", perVisitor: false };
}

const categoriesFor = (region) =>
  cachedJson("yt:categories:" + region, 24 * HOUR, () => availableCategories({ region }));

// Checking which categories have a chart costs 7 calls, which is only worth it
// when the answer is cached; categories without one just come back empty.
const recommendedFor = (region) =>
  cachedJson("yt:recommended:" + region, 3 * HOUR, async () => {
    const available = hasCacheApi() ? await categoriesFor(region).catch(() => CATEGORIES) : CATEGORIES;
    return recommendedVideos({ region, categoryIds: available.map((category) => category.id) });
  });

// s-maxage and stale-while-revalidate let Vercel's CDN cache responses too
// (Cloudflare caches in code, lib/edgeCache.js).
function reply(body, maxAgeSeconds, perVisitor) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": maxAgeSeconds
      ? "public, max-age=" + maxAgeSeconds + ", s-maxage=" + maxAgeSeconds * 4 + ", stale-while-revalidate=" + maxAgeSeconds * 8
      : "no-store",
  };
  if (perVisitor) headers.Vary = "X-Vercel-IP-Country";
  return new Response(JSON.stringify(body), { status: 200, headers });
}

async function loadFeed(feed, params, region) {
  const pageToken = params.get("page") || undefined;
  const page = pageToken || "1";

  switch (feed) {
    case "recommended":
      return recommendedFor(region);

    case "categories":
      return { categories: hasCacheApi() ? await categoriesFor(region) : CATEGORIES };

    case "videos": {
      const category = params.get("category") || "";
      if (category && !CATEGORIES.some((item) => item.id === category)) return null;
      return cachedJson(["yt:popular", region, category || "all", page].join(":"), 3 * HOUR, () =>
        popularVideos({ region, categoryId: category || undefined, pageToken })
      );
    }

    case "shorts":
      // Shorts come from the popular channels' Shorts playlists (no search
      // quota), plus the DigitBox channel's own.
      return cachedJson("yt:shorts:" + region, 12 * HOUR, async () => {
        const recommended = await recommendedFor(region).catch(() => ({ videos: [] }));
        const channelIds = [...recommended.videos.map((video) => video.channelId), ...videoData.channels.map((channel) => channel.id)];
        return shortsVideos({ region, channelIds });
      });

    case "search": {
      // Array.from splits by code point, so an emoji is never cut in half.
      const q = Array.from((params.get("q") || "").trim().replace(/\s+/g, " ")).slice(0, 100).join("");
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

const reasonOf = (error) => (error && error.reason) || "unavailable";

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const params = new URL(req.url).searchParams;
  const feed = params.get("feed") || "recommended";
  const pageToken = params.get("page");
  if (pageToken && !PAGE_TOKEN.test(pageToken)) return jsonResponse({ error: "Invalid page" }, 400);

  if (!youtubeConfigured()) {
    return reply(feed === "status" ? { configured: false, ok: false } : { configured: false, videos: [], nextPageToken: null }, 60);
  }

  const { region, perVisitor } = regionMode(req);

  // Setup check. Cached for a minute so the public URL can't be used to burn
  // quota; the loader never throws, so a failure isn't held for long either.
  if (feed === "status") {
    const result = await cachedJson("yt:status", 60 * 1000, () =>
      checkKey().then(
        () => ({ ok: true }),
        (error) => ({ ok: false, reason: reasonOf(error) })
      )
    );
    return reply({ configured: true, ...result, region }, 0);
  }

  try {
    const result = await loadFeed(feed, params, region);
    if (!result) return jsonResponse({ error: "Invalid request" }, 400);
    const maxAge = CLIENT_MAX_AGE[feed];
    if (result.categories) return reply({ configured: true, categories: result.categories }, maxAge, perVisitor);
    return reply({ configured: true, videos: result.videos, nextPageToken: result.nextPageToken || null }, maxAge, perVisitor);
  } catch (error) {
    return reply({ configured: true, error: reasonOf(error), videos: [], nextPageToken: null }, 60, perVisitor);
  }
}
