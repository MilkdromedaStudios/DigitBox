// digitbox/lib/catalog.js
//
// Everything the entertainment hub lists: cloud games (from the project
// index), videos (from data/videos.json, refreshed live by /api/videos) and
// community posts. Pages import these instead of fetching, so the catalog is
// in the server-rendered HTML.

import projectsIndex from "../data/projects-index.json";
import gameDetails from "../data/cloud-games.json";
import videoData from "../data/videos.json";
import postsIndex from "../data/posts-index.json";

/* ------------------------------------------------------------------ *
 *  Cloud games
 * ------------------------------------------------------------------ */

const SCRATCH_EXCERPT = "A Scratch game packaged with TurboWarp. Runs right in your browser, no download needed.";
const DEFAULT_EXCERPT = "Runs right in your browser, no download needed.";

// Stable colour for games that have no hue set in cloud-games.json yet.
function hueFromText(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) % 360;
  return hash;
}

function toGame(entry, order) {
  // Same entry rules as /api/content/list: a bare title or a metadata object.
  const base = typeof entry === "string" ? { title: entry } : entry;
  const slug = base.slug || base.title;
  const details = gameDetails[slug] || {};
  const tags = Array.isArray(details.tags) ? details.tags : [];
  const isScratch = tags.includes("Scratch");

  return {
    kind: "game",
    key: "game:" + slug,
    slug,
    title: base.title || slug,
    href: "/projects/" + encodeURIComponent(slug),
    excerpt: details.excerpt || base.excerpt || (isScratch ? SCRATCH_EXCERPT : DEFAULT_EXCERPT),
    genre: details.genre || "Game",
    tags,
    icon: details.icon || "🎮",
    hue: Number.isFinite(details.hue) ? details.hue : hueFromText(slug),
    studio: details.studio || (isScratch ? "Scratch · TurboWarp" : "DigitBox Cloud"),
    featured: Boolean(details.featured),
    order,
  };
}

export const GAMES = projectsIndex.map(toGame);

// A project added from the admin page (see lib/hubProjects.js), shaped like
// the built-in games so every card, shelf and search treats it the same.
export function toHubGame(project) {
  const genre = project.genre || "Game";
  return {
    kind: "game",
    key: "game:" + project.slug,
    slug: project.slug,
    title: project.name,
    href: "/projects/" + encodeURIComponent(project.slug),
    excerpt: project.description || DEFAULT_EXCERPT,
    genre,
    tags: project.genre ? [project.genre] : [],
    icon: project.emoji || "🎮",
    hue: Number.isFinite(project.hue) ? project.hue : hueFromText(project.slug),
    studio: "DigitBox",
    featured: false,
    order: -1,
    custom: true,
  };
}

export function findGame(slug) {
  return GAMES.find((game) => game.slug === slug) || null;
}

// Built-in games as edited from the admin page: `changes` maps slug to
// { hidden, name?, emoji?, hue?, description?, genre? } (GET /api/hub-projects).
export function applyBuiltInChanges(games, changes) {
  if (!changes) return games;
  return games
    .filter((game) => !(changes[game.slug] && changes[game.slug].hidden))
    .map((game) => {
      const change = changes[game.slug];
      if (!change) return game;
      return {
        ...game,
        title: change.name || game.title,
        icon: change.emoji || game.icon,
        hue: Number.isFinite(change.hue) ? change.hue : game.hue,
        excerpt: change.description || game.excerpt,
        genre: change.genre || game.genre,
        tags: change.genre && !game.tags.includes(change.genre) ? [change.genre, ...game.tags] : game.tags,
      };
    });
}

// Genre/tag filters that actually have games behind them, most common first.
export function gameTags(games) {
  const counts = new Map();
  for (const game of games) for (const tag of game.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

export const GAME_TAGS = gameTags(GAMES);

// Shelf order: projects added from the admin page (newest first), then
// featured games, then the rest in index order.
export function byFeature(games) {
  return [...games].sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || Number(b.featured) - Number(a.featured) || a.order - b.order);
}

/* ------------------------------------------------------------------ *
 *  Videos
 * ------------------------------------------------------------------ */

export const CHANNELS = videoData.channels;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(value) {
  return VIDEO_ID.test(String(value || ""));
}

export function channelUrl(channelId) {
  const channel = CHANNELS.find((item) => item.id === channelId);
  if (channel?.url) return channel.url;
  return channelId ? "https://www.youtube.com/channel/" + encodeURIComponent(channelId) : "https://www.youtube.com/";
}

// Channel uploads (data/videos.json, /api/videos) and YouTube Data API
// results (/api/youtube) share this shape. Number(null) is 0, so missing
// counts are checked before converting.
export function normalizeVideo(raw) {
  if (!raw || !isVideoId(raw.id)) return null;
  const views = raw.views == null ? NaN : Number(raw.views);
  const duration = raw.duration == null ? NaN : Number(raw.duration);
  return {
    kind: "video",
    key: "video:" + raw.id,
    id: raw.id,
    title: String(raw.title || "Untitled video"),
    channel: String(raw.channel || "YouTube"),
    channelId: String(raw.channelId || ""),
    channelAvatar: typeof raw.channelAvatar === "string" && raw.channelAvatar.startsWith("https://") ? raw.channelAvatar : "",
    published: raw.published || null,
    description: String(raw.description || ""),
    views: Number.isFinite(views) ? views : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    live: Boolean(raw.live),
    embeddable: raw.embeddable !== false,
    short: Boolean(raw.short),
    href: (raw.short ? "/shorts?v=" : "/watch?v=") + raw.id,
    thumb: "https://i.ytimg.com/vi/" + raw.id + "/hqdefault.jpg",
  };
}

// Newest first; dedupes by id, keeping the first copy (pass live data first).
export function mergeVideos(...lists) {
  const seen = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const video = raw && raw.kind === "video" ? raw : normalizeVideo(raw);
      if (video && !seen.has(video.id)) seen.set(video.id, video);
    }
  }
  return [...seen.values()].sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
}

export const SEED_VIDEOS = mergeVideos(videoData.videos);

// Combine lists keeping their order (first copy wins), for mixing ranked
// YouTube results with the channel's own videos.
export function uniqueVideos(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const video of list || []) {
      if (video && !seen.has(video.id)) {
        seen.add(video.id);
        out.push(video);
      }
    }
  }
  return out;
}

// YouTube categories with a "most popular" chart: the Videos page filters,
// also mixed together server-side for Recommended.
export const YOUTUBE_CATEGORIES = [
  { id: "20", label: "Gaming" },
  { id: "10", label: "Music" },
  { id: "24", label: "Entertainment" },
  { id: "23", label: "Comedy" },
  { id: "17", label: "Sports" },
  { id: "28", label: "Science & Tech" },
  { id: "1", label: "Film & Animation" },
];

/* ------------------------------------------------------------------ *
 *  Community posts
 * ------------------------------------------------------------------ */

export const POSTS = postsIndex.map((post) => ({
  kind: "post",
  key: "post:" + post.slug,
  slug: post.slug,
  title: post.title || post.slug,
  excerpt: post.excerpt || "",
  href: "/posts/" + encodeURIComponent(post.slug),
}));

// Key used in lib/likes. Games keep the bare slug the old gallery stored, so
// existing likes carry over; videos are prefixed.
export function likeKey(item) {
  return item.kind === "game" ? item.slug : item.key;
}

/* ------------------------------------------------------------------ *
 *  Search
 * ------------------------------------------------------------------ */

function haystack(item) {
  if (item.kind === "game") return [item.title, item.genre, item.studio, item.excerpt, ...item.tags, "game cloud"].join(" ");
  if (item.kind === "video") return [item.title, item.channel, item.description, item.short ? "short shorts" : "video"].join(" ");
  return [item.title, item.excerpt, "post community"].join(" ");
}

export function searchCatalog(query, videos, games = GAMES) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const items = [...videos, ...games, ...POSTS];
  return items
    .map((item) => {
      const title = item.title.toLowerCase();
      const text = haystack(item).toLowerCase();
      if (!words.every((word) => text.includes(word))) return null;
      const score = (title.includes(q) ? 4 : 0) + words.filter((word) => title.includes(word)).length;
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
