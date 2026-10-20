import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { GameCard, PostCard, ShortCard, VideoCard } from "../components/Cards";
import { GAMES, GAME_TAGS, POSTS, likeKey } from "../lib/catalog";
import { formatViews, timeAgo } from "../lib/format";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";

const CHIPS = ["All", "Videos", "Shorts", "Cloud Games", ...GAME_TAGS.filter((tag) => tag !== "Scratch"), "Community"];

// Featured games lead the shelf; the rest keep their index order.
const GAMES_BY_FEATURE = [...GAMES].sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order);

function Shelf({ icon, title, href, linkLabel = "View all", children }) {
  return (
    <section className="hub-shelf">
      <div className="hub-shelf-head">
        <h2><Icon name={icon} />{title}</h2>
        {href && (
          <Link href={href} className="hub-pill-btn">
            {linkLabel} <Icon name="chevron" size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Spotlight({ video }) {
  if (!video) return null;
  return (
    <section className="hub-spotlight" aria-label="Featured video">
      <div className="hub-spotlight-copy">
        <span className="hub-kicker">NEW ON DIGITBOX</span>
        <h1>{video.title}</h1>
        <div className="hub-spotlight-meta">
          {video.channel}
          {video.views != null ? " • " + formatViews(video.views) : ""}
          {video.published ? " • " : ""}
          <span suppressHydrationWarning>{timeAgo(video.published)}</span>
        </div>
        <p>{video.description || "The latest upload from " + video.channel + ", playing right here on DigitBox."}</p>
        <div className="hub-spotlight-actions">
          <Link href={video.href} className="hub-pill-btn is-primary"><Icon name="play" size={18} />Watch now</Link>
          <Link href="/games" className="hub-pill-btn"><Icon name="games" size={18} />Play cloud games</Link>
        </div>
      </div>
      <Link href={video.href} className="hub-spotlight-media" aria-label={"Watch " + video.title}>
        <img src={video.thumb} alt="" />
        <span className="hub-spotlight-play"><span><Icon name="play" size={30} /></span></span>
      </Link>
    </section>
  );
}

export default function HomePage() {
  const videos = useVideos();
  const [likes, toggleLike] = useLikes();
  const [chip, setChip] = useState("All");

  const longVideos = useMemo(() => videos.filter((video) => !video.short), [videos]);
  const shorts = useMemo(() => videos.filter((video) => video.short), [videos]);
  const minecraftGames = GAMES_BY_FEATURE.filter((game) => game.tags.includes("Minecraft"));

  const renderGame = (game) => (
    <GameCard key={game.key} game={game} liked={likes.includes(likeKey(game))} onToggleLike={toggleLike} />
  );

  let filtered = null;
  if (chip === "Videos") filtered = longVideos.map((video) => <VideoCard key={video.key} video={video} />);
  else if (chip === "Cloud Games") filtered = GAMES_BY_FEATURE.map(renderGame);
  else if (chip === "Community") filtered = POSTS.map((post) => <PostCard key={post.key} post={post} />);
  else if (chip !== "All" && chip !== "Shorts") filtered = GAMES_BY_FEATURE.filter((game) => game.tags.includes(chip)).map(renderGame);

  return (
    <>
      <Head>
        <title>DigitBox — Videos &amp; Cloud Games</title>
        <meta name="description" content="Watch videos and play cloud games in your browser. No downloads, no installs: DigitBox entertainment." />
      </Head>

      <div className="hub-page">
        <div className="hub-chips" role="tablist" aria-label="Browse by category">
          {CHIPS.map((label) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={chip === label}
              className={"hub-chip" + (chip === label ? " is-active" : "")}
              onClick={() => setChip(label)}
            >
              {label}
            </button>
          ))}
        </div>

        {chip === "All" && (
          <>
            <Spotlight video={longVideos[0]} />

            <Shelf icon="games" title="Cloud Games" href="/games" linkLabel="All games">
              <div className="hub-row">{GAMES_BY_FEATURE.map(renderGame)}</div>
            </Shelf>

            <Shelf icon="videos" title="Latest videos" href="/videos">
              <div className="hub-grid">
                {longVideos.slice(0, 8).map((video) => <VideoCard key={video.key} video={video} />)}
              </div>
            </Shelf>

            {shorts.length > 0 && (
              <Shelf icon="shorts" title="Shorts" href="/shorts" linkLabel="Watch Shorts">
                <div className="hub-row hub-row-shorts">
                  {shorts.map((video) => <ShortCard key={video.key} video={video} />)}
                </div>
              </Shelf>
            )}

            {minecraftGames.length > 0 && (
              <Shelf icon="cloud" title="Minecraft in your browser">
                <div className="hub-row">{minecraftGames.map(renderGame)}</div>
              </Shelf>
            )}

            {POSTS.length > 0 && (
              <Shelf icon="posts" title="From the community" href="/posts">
                <div className="hub-grid hub-grid-posts">
                  {POSTS.slice(0, 3).map((post) => <PostCard key={post.key} post={post} />)}
                </div>
              </Shelf>
            )}

            <section className="hub-banner" aria-label="DigitBox Pro">
              <span className="hub-banner-icon"><Icon name="pro" size={28} /></span>
              <div>
                <span className="hub-kicker">DIGITBOX PRO</span>
                <h2>Go Pro for $1.99 a month</h2>
                <p>Pro unlocks the full Nexus Sidebar on your DigitBox account. Billing runs through Stripe, and you can cancel anytime.</p>
              </div>
              <Link href="/profile#digitbox-pro" className="hub-pill-btn is-primary">See DigitBox Pro</Link>
            </section>
          </>
        )}

        {chip === "Shorts" && (
          shorts.length > 0 ? (
            <div className="hub-grid hub-grid-shorts">
              {shorts.map((video) => <ShortCard key={video.key} video={video} />)}
            </div>
          ) : (
            <div className="hub-empty"><Icon name="shorts" /><h3>No Shorts yet</h3><p>New Shorts from the channel will show up here.</p></div>
          )
        )}

        {filtered && (
          filtered.length > 0 ? (
            <div className={"hub-grid" + (chip === "Community" ? " hub-grid-posts" : "")}>{filtered}</div>
          ) : (
            <div className="hub-empty"><Icon name="search" /><h3>Nothing here yet</h3><p>Try another category.</p></div>
          )
        )}
      </div>
    </>
  );
}
