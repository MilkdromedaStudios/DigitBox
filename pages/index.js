import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { GameCard, PostCard, ShortCard, SkeletonGrid, VideoCard } from "../components/Cards";
import { CHANNELS, GAMES, POSTS, channelUrl, likeKey, uniqueVideos } from "../lib/catalog";
import { formatViews, timeAgo } from "../lib/format";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";
import { useYouTubeFeed } from "../lib/useYouTube";
import { YouTubeAttribution } from "../components/YouTubeLogo";

const CHIPS = ["Recommended", "Videos", "Shorts", "Games"];
const CHANNEL = CHANNELS[0];

// Featured games lead the shelf; the rest keep their index order.
const GAMES_BY_FEATURE = [...GAMES].sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order);

function Shelf({ icon, title, subtitle, href, linkLabel = "View all", action, children }) {
  return (
    <section className="hub-shelf">
      <div className="hub-shelf-head">
        <div>
          <h2><Icon name={icon} />{title}</h2>
          {subtitle && <p className="hub-shelf-sub">{subtitle}</p>}
        </div>
        {(action || href) && (
          <div className="hub-shelf-actions">
            {action}
            {href && (
              <Link href={href} className="hub-pill-btn">
                {linkLabel} <Icon name="chevron" size={16} />
              </Link>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function Spotlight({ video, kicker, attribution }) {
  if (!video) return null;
  return (
    <section className="hub-spotlight" aria-label="Featured video">
      <div className="hub-spotlight-copy">
        <span className="hub-kicker">{kicker}</span>
        <h1>{video.title}</h1>
        <div className="hub-spotlight-meta">
          {video.channel}
          {video.views != null ? " • " + formatViews(video.views) : ""}
          {video.published ? " • " : ""}
          <span suppressHydrationWarning>{timeAgo(video.published)}</span>
        </div>
        <p>{video.description || "Playing right here on DigitBox."}</p>
        <div className="hub-spotlight-actions">
          <Link href={video.href} className="hub-pill-btn is-primary"><Icon name="play" size={18} />Watch now</Link>
          <Link href="/games" className="hub-pill-btn"><Icon name="games" size={18} />Play games</Link>
          {attribution}
        </div>
      </div>
      <Link href={video.href} className="hub-spotlight-media" aria-label={"Watch " + video.title}>
        <img src={video.thumb} alt="" />
        <span className="hub-spotlight-play"><span><Icon name="play" size={30} /></span></span>
      </Link>
    </section>
  );
}

function SpotlightSkeleton() {
  return (
    <section className="hub-spotlight" aria-hidden="true">
      <div className="hub-spotlight-copy">
        <span className="skeleton-line is-short" />
        <span className="skeleton-line" style={{ height: 34 }} />
        <span className="skeleton-line" />
      </div>
      <span className="hub-spotlight-media skeleton" />
    </section>
  );
}

function MoreButton({ feed, label = "Show more" }) {
  if (!feed.hasMore) return null;
  return (
    <div className="hub-more">
      <button type="button" className="hub-pill-btn" onClick={feed.loadMore} disabled={feed.loading}>
        {feed.loading ? "Loading…" : label}
      </button>
    </div>
  );
}

export default function HomePage() {
  const [chip, setChip] = useState("Recommended");
  const [likes, toggleLike] = useLikes();
  const ownVideos = useVideos();
  const recommended = useYouTubeFeed("recommended");
  const ytShorts = useYouTubeFeed("shorts", {}, { enabled: chip === "Recommended" || chip === "Shorts" });
  const popular = useYouTubeFeed("videos", {}, { enabled: chip === "Videos" });

  const ownLong = useMemo(() => ownVideos.filter((video) => !video.short), [ownVideos]);
  const ownShorts = useMemo(() => ownVideos.filter((video) => video.short), [ownVideos]);

  // YouTube feeds when the API key is set up and answering; otherwise the
  // channel's own uploads, so the page is never empty.
  const youtubeOn = recommended.videos.length > 0;
  const waiting = recommended.loading && !youtubeOn;
  const feed = youtubeOn ? recommended.videos : ownLong;
  const shorts = uniqueVideos(ytShorts.videos, ownShorts);
  const popularList = popular.videos.length ? popular.videos.filter((video) => !video.short) : popular.loading ? [] : ownLong;

  const renderGame = (game) => (
    <GameCard key={game.key} game={game} liked={likes.includes(likeKey(game))} onToggleLike={toggleLike} />
  );

  return (
    <>
      <Head>
        <title>DigitBox — Videos, Shorts &amp; Games</title>
        <meta name="description" content="Watch videos and Shorts and play cloud games in your browser. No downloads, no installs: DigitBox entertainment." />
      </Head>

      <div className="hub-page">
        <div className="hub-chips" role="tablist" aria-label="Sections">
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

        {chip === "Recommended" && (
          <>
            {waiting ? (
              <SpotlightSkeleton />
            ) : (
              <Spotlight
                video={feed[0]}
                kicker={youtubeOn ? "RECOMMENDED" : "NEW ON DIGITBOX"}
                attribution={<YouTubeAttribution href={feed[0] ? "https://www.youtube.com/watch?v=" + feed[0].id : undefined} label="Watch on" />}
              />
            )}

            <Shelf icon="videos" title="Recommended" href="/videos" linkLabel="All videos" action={<YouTubeAttribution />}>
              {waiting ? (
                <SkeletonGrid count={8} />
              ) : (
                <div className="hub-grid">{feed.slice(1, 9).map((video) => <VideoCard key={video.key} video={video} />)}</div>
              )}
            </Shelf>

            {(shorts.length > 0 || ytShorts.loading) && (
              <Shelf icon="shorts" title="Shorts" href="/shorts" linkLabel="Watch Shorts" action={<YouTubeAttribution label="Shorts from" />}>
                <div className="hub-row hub-row-shorts">
                  {shorts.length
                    ? shorts.slice(0, 12).map((video) => <ShortCard key={video.key} video={video} />)
                    : Array.from({ length: 6 }, (_, index) => <span key={index} className="short-card skeleton" />)}
                </div>
              </Shelf>
            )}

            <Shelf icon="games" title="Games" href="/games" linkLabel="All games">
              <div className="hub-row">{GAMES_BY_FEATURE.map(renderGame)}</div>
            </Shelf>

            {youtubeOn && feed.length > 9 && (
              <Shelf icon="videos" title="More to watch" href="/videos" linkLabel="All videos" action={<YouTubeAttribution />}>
                <div className="hub-grid">{feed.slice(9, 21).map((video) => <VideoCard key={video.key} video={video} />)}</div>
              </Shelf>
            )}

            {youtubeOn && CHANNEL && (ownLong.length > 0 || ownShorts.length > 0) && (
              <Shelf
                icon="user"
                title={"From " + CHANNEL.name}
                subtitle="DigitBox's own channel"
                action={
                  <>
                    <YouTubeAttribution href={channelUrl(CHANNEL.id)} label="Channel on" />
                    <a className="hub-pill-btn is-inverse" href={channelUrl(CHANNEL.id) + "?sub_confirmation=1"} target="_blank" rel="noopener noreferrer">
                      Subscribe
                    </a>
                  </>
                }
              >
                <div className="hub-channel-card">
                  <div className="hub-row">{uniqueVideos(ownLong, ownShorts).map((video) => <VideoCard key={video.key} video={video} />)}</div>
                </div>
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

        {chip === "Videos" && (
          <Shelf icon="videos" title="Popular" href="/videos" linkLabel="Browse categories" action={<YouTubeAttribution />}>
            {popular.loading && !popular.videos.length ? (
              <SkeletonGrid count={12} />
            ) : (
              <>
                <div className="hub-grid">{popularList.map((video) => <VideoCard key={video.key} video={video} />)}</div>
                <MoreButton feed={popular} />
              </>
            )}
          </Shelf>
        )}

        {chip === "Shorts" && (
          <Shelf icon="shorts" title="Shorts" href="/shorts" linkLabel="Watch Shorts" action={<YouTubeAttribution label="Shorts from" />}>
            {shorts.length > 0 ? (
              <>
                <div className="hub-grid hub-grid-shorts">{shorts.map((video) => <ShortCard key={video.key} video={video} />)}</div>
                <MoreButton feed={ytShorts} />
              </>
            ) : ytShorts.loading ? (
              <SkeletonGrid count={10} shorts />
            ) : (
              <div className="hub-empty"><Icon name="shorts" /><h3>No Shorts yet</h3><p>Check back soon.</p></div>
            )}
          </Shelf>
        )}

        {chip === "Games" && <div className="hub-grid">{GAMES_BY_FEATURE.map(renderGame)}</div>}
      </div>
    </>
  );
}
