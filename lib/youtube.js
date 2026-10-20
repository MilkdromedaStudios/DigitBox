// digitbox/lib/youtube.js
//
// Server-side access to the YouTube Data API v3 with an API key
// (YOUTUBE_API_KEY). Only edge API routes import this; the key never reaches
// the browser. Every function returns plain video objects in the same shape
// lib/catalog.js normalizes, so pages can mix them with the channel videos.
//
// Quota (per Google Cloud project, resets at midnight Pacific): 10,000 units
// a day shared by videos/channels/playlistItems (1 unit per call), and a
// separate bucket of 100 search.list calls a day. Feeds therefore avoid
// search wherever possible and the routes cache everything (lib/edgeCache).

import { YOUTUBE_CATEGORIES } from "./catalog";

export const CATEGORIES = YOUTUBE_CATEGORIES;

const API_ROOT = "https://www.googleapis.com/youtube/v3/";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const PAGE_SIZE = 24;
// Shorts are up to 3 minutes and square or vertical.
const SHORT_MAX_SECONDS = 180;

export class YouTubeError extends Error {
  constructor(reason, status) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

export function youtubeConfigured() {
  return Boolean((process.env.YOUTUBE_API_KEY || "").trim());
}

// Google returns the reason either in error.errors[] (YouTube's classic
// shape) or error.details[] (ErrorInfo); messages can echo request details,
// so only the reason string is kept.
function errorReason(body, status) {
  const error = body && body.error;
  return (
    error?.errors?.find((item) => item && item.reason)?.reason ||
    error?.details?.find((item) => item && item.reason)?.reason ||
    error?.status ||
    "http" + status
  );
}

async function call(endpoint, params) {
  const key = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!key) throw new YouTubeError("notConfigured", 503);

  const url = new URL(endpoint, API_ROOT);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  }
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new YouTubeError(errorReason(body, response.status), response.status);
  return body;
}

// "PT1H2M3S" → 3723 seconds. Live streams report "P0D" (0).
export function parseDuration(iso) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso || ""));
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match.map((part) => Number(part) || 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function blockedIn(item, region) {
  const restriction = item.contentDetails?.regionRestriction;
  if (!restriction || !region) return false;
  if (Array.isArray(restriction.allowed)) return !restriction.allowed.includes(region);
  return Array.isArray(restriction.blocked) && restriction.blocked.includes(region);
}

// Videos the embedded player can actually play here. Age-restricted videos
// need a signed-in YouTube viewer, so they never play in an embed.
function playable(item, region) {
  return (
    item &&
    VIDEO_ID.test(item.id) &&
    item.status?.embeddable !== false &&
    item.status?.privacyStatus !== "private" &&
    item.snippet?.liveBroadcastContent !== "upcoming" &&
    item.contentDetails?.contentRating?.ytRating !== "ytAgeRestricted" &&
    !blockedIn(item, region)
  );
}

// The API has no "is a Short" flag. With maxWidth set, player.embedWidth and
// embedHeight follow the video's real aspect ratio, so a Short is a video of
// up to 3 minutes that is square or taller. Duration alone isn't enough:
// plenty of landscape videos are under 3 minutes.
function isShort(item, duration) {
  const width = Number(item.player?.embedWidth);
  const height = Number(item.player?.embedHeight);
  return duration > 0 && duration <= SHORT_MAX_SECONDS && width > 0 && height >= width;
}

function toVideo(item, avatars, forceShort = false) {
  const snippet = item.snippet || {};
  const duration = parseDuration(item.contentDetails?.duration);
  const views = Number(item.statistics?.viewCount);
  return {
    id: item.id,
    title: snippet.title || "Untitled video",
    channel: snippet.channelTitle || "YouTube",
    channelId: snippet.channelId || "",
    channelAvatar: avatars[snippet.channelId] || "",
    published: snippet.publishedAt || null,
    description: snippet.description || "",
    views: Number.isFinite(views) ? views : null,
    duration,
    live: snippet.liveBroadcastContent === "live",
    short: forceShort || isShort(item, duration),
    embeddable: item.status?.embeddable !== false,
  };
}

// Channel avatars, 50 channels per call (1 unit each).
async function channelAvatars(channelIds) {
  const ids = [...new Set(channelIds.filter(Boolean))];
  const avatars = {};
  for (let start = 0; start < ids.length; start += 50) {
    try {
      const body = await call("channels", { part: "snippet", id: ids.slice(start, start + 50).join(","), maxResults: 50 });
      for (const channel of body.items || []) {
        const thumbs = channel.snippet?.thumbnails || {};
        avatars[channel.id] = (thumbs.default || thumbs.medium || {}).url || "";
      }
    } catch {
      /* avatars are decoration; never fail a feed over them */
    }
  }
  return avatars;
}

function withAvatars(videos, avatars) {
  return videos.map((video) => (video.channelAvatar || !avatars[video.channelId] ? video : { ...video, channelAvatar: avatars[video.channelId] }));
}

// part=player with maxWidth makes embedWidth/embedHeight available (isShort).
const VIDEO_PARTS = { part: "snippet,contentDetails,statistics,status,player", maxWidth: 360 };

// Full details for up to 50 ids per call, in the order given.
async function detailsFor(ids, region, { forceShort = false, keepUnplayable = false } = {}) {
  const wanted = [...new Set(ids.filter((id) => VIDEO_ID.test(id)))];
  const items = [];
  for (let start = 0; start < wanted.length; start += 50) {
    const body = await call("videos", { ...VIDEO_PARTS, id: wanted.slice(start, start + 50).join(",") });
    items.push(...(body.items || []).filter((item) => keepUnplayable || playable(item, region)));
  }
  const avatars = await channelAvatars(items.map((item) => item.snippet?.channelId));
  const byId = new Map(items.map((item) => [item.id, toVideo(item, avatars, forceShort)]));
  return wanted.map((id) => byId.get(id)).filter(Boolean);
}

// One page of a "most popular" chart (1 unit + 1 for avatars). Since July
// 2025 the chart is built from YouTube's Music, Movies and Gaming charts.
export async function popularVideos({ region, categoryId, pageToken, maxResults = PAGE_SIZE, avatars = true }) {
  let body;
  try {
    body = await call("videos", {
      ...VIDEO_PARTS,
      chart: "mostPopular",
      regionCode: region,
      videoCategoryId: categoryId,
      maxResults,
      pageToken,
    });
  } catch (error) {
    // No chart for this category in this region: an empty shelf, not an error.
    if (error.reason === "videoChartNotFound") return { videos: [], nextPageToken: null };
    throw error;
  }
  const items = (body.items || []).filter((item) => playable(item, region));
  const avatarMap = avatars ? await channelAvatars(items.map((item) => item.snippet?.channelId)) : {};
  return { videos: items.map((item) => toVideo(item, avatarMap)), nextPageToken: body.nextPageToken || null };
}

// Which of CATEGORIES have a chart in this region right now (1 unit each).
export async function availableCategories({ region }) {
  const checks = await Promise.all(
    CATEGORIES.map(async (category) => {
      try {
        const body = await call("videos", { part: "id", chart: "mostPopular", regionCode: region, videoCategoryId: category.id, maxResults: 1 });
        return (body.items || []).length ? category : null;
      } catch (error) {
        if (error.reason === "videoChartNotFound") return null;
        throw error;
      }
    })
  );
  return checks.filter(Boolean);
}

// Recommended: the overall chart plus every category chart, interleaved so
// the feed mixes topics. Long-form only (Shorts have their own shelf).
export async function recommendedVideos({ region, categoryIds = CATEGORIES.map((category) => category.id) }) {
  const perSource = 12;
  const sources = [undefined, ...categoryIds];
  const pages = await Promise.all(
    sources.map((categoryId) => popularVideos({ region, categoryId, maxResults: perSource, avatars: false }).catch(() => ({ videos: [] })))
  );
  const seen = new Set();
  const mixed = [];
  for (let index = 0; index < perSource; index += 1) {
    for (const page of pages) {
      const video = page.videos[index];
      if (video && !video.short && !seen.has(video.id)) {
        seen.add(video.id);
        mixed.push(video);
      }
    }
  }
  if (!mixed.length) throw new YouTubeError("emptyFeed", 502);
  const avatars = await channelAvatars(mixed.map((video) => video.channelId));
  return { videos: withAvatars(mixed, avatars), nextPageToken: null };
}

// User search: one call from the 100-a-day search bucket, then details.
export async function searchVideos({ q, region, pageToken }) {
  const body = await call("search", {
    part: "snippet",
    type: "video",
    q,
    regionCode: region,
    safeSearch: "moderate",
    videoEmbeddable: "true",
    maxResults: PAGE_SIZE,
    pageToken,
  });
  const ids = (body.items || []).map((item) => item.id?.videoId);
  return { videos: await detailsFor(ids, region), nextPageToken: body.nextPageToken || null };
}

// Video ids from a playlist page (1 unit); a missing playlist is empty.
async function playlistVideoIds(playlistId, maxResults) {
  try {
    const body = await call("playlistItems", { part: "contentDetails", playlistId, maxResults });
    return (body.items || []).map((item) => item.contentDetails?.videoId).filter(Boolean);
  } catch (error) {
    if (error.reason === "playlistNotFound" || error.status === 404) return [];
    throw error;
  }
}

// Every channel has auto-generated playlists alongside its uploads ("UU…"):
// "UUPS…" holds its most popular Shorts and "UUSH…" all its Shorts. These
// aren't documented, so callers fall back when they come back empty.
const playlistFor = (prefix, channelId) => prefix + channelId.slice(2);

// Popular Shorts from the channels behind the popular charts, interleaved
// one per channel at a time. Costs about 1 unit per channel and needs no
// search; falls back to a single #shorts search if the playlists are empty.
// 12 channels keeps a cold request under Cloudflare's free-plan limit of 50
// outgoing calls, even when Recommended has to be built in the same request.
export async function shortsVideos({ region, channelIds = [] }) {
  const channels = [...new Set(channelIds.filter((id) => CHANNEL_ID.test(id)))].slice(0, 12);
  const perChannel = await Promise.all(channels.map((id) => playlistVideoIds(playlistFor("UUPS", id), 6).catch(() => [])));
  const ids = [];
  for (let index = 0; index < 6; index += 1) {
    for (const list of perChannel) if (list[index]) ids.push(list[index]);
  }

  let videos = (await detailsFor(ids, region, { forceShort: true })).filter(
    (video) => video.duration > 0 && video.duration <= SHORT_MAX_SECONDS
  );

  if (videos.length < 6) {
    const publishedAfter = new Date(Date.now() - 14 * 86400 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
    const body = await call("search", {
      part: "snippet",
      type: "video",
      q: "#shorts",
      regionCode: region,
      safeSearch: "moderate",
      videoEmbeddable: "true",
      videoDuration: "short",
      order: "viewCount",
      publishedAfter,
      maxResults: PAGE_SIZE,
    });
    const found = await detailsFor((body.items || []).map((item) => item.id?.videoId), region);
    videos = [...videos, ...found.filter((video) => video.short)];
  }
  if (!videos.length) throw new YouTubeError("emptyFeed", 502);
  return { videos, nextPageToken: null };
}

// A channel's latest uploads via its uploads playlist (no search, ~3 units),
// with Shorts identified by the channel's own Shorts playlist.
export async function channelUploads({ channelId, region }) {
  if (!CHANNEL_ID.test(channelId)) return { videos: [], nextPageToken: null };
  const [uploads, shortIds] = await Promise.all([
    playlistVideoIds(playlistFor("UU", channelId), 50),
    playlistVideoIds(playlistFor("UUSH", channelId), 50).catch(() => []),
  ]);
  const shorts = new Set(shortIds);
  const videos = (await detailsFor(uploads, region)).map((video) => (shorts.has(video.id) ? { ...video, short: true } : video));
  return { videos, nextPageToken: null };
}

// Details for specific videos (watch page, Library). Unplayable videos are
// kept, flagged with embeddable: false, so the page can say why.
export async function lookupVideos({ ids, region }) {
  return { videos: await detailsFor(ids, region, { keepUnplayable: true }), nextPageToken: null };
}

// Cheapest call that proves the key works (1 unit).
export async function checkKey() {
  await call("videos", { part: "id", chart: "mostPopular", regionCode: "US", maxResults: 1 });
  return { ok: true };
}
