import Head from "next/head";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { ShortCard, VideoCard } from "../components/Cards";
import { CHANNELS } from "../lib/catalog";
import { useVideos } from "../lib/useVideos";

const CHIPS = ["Latest", "Most viewed", "Shorts"];

export default function VideosPage() {
  const videos = useVideos();
  const [chip, setChip] = useState("Latest");
  const channel = CHANNELS[0];

  const list = useMemo(() => {
    if (chip === "Shorts") return videos.filter((video) => video.short);
    const longForm = videos.filter((video) => !video.short);
    if (chip === "Most viewed") return [...longForm].sort((a, b) => (b.views || 0) - (a.views || 0));
    return longForm;
  }, [videos, chip]);

  return (
    <>
      <Head>
        <title>Videos - DigitBox</title>
        <meta name="description" content="Watch the latest DigitBox videos and Shorts, updated automatically from the channel." />
      </Head>

      <div className="hub-page">
        <div className="hub-chips" role="tablist" aria-label="Sort videos">
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

        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">VIDEOS</span>
            <h1>{chip === "Shorts" ? "Shorts" : "Videos"}</h1>
            <p>New uploads from {channel ? channel.name : "the channel"} appear here automatically.</p>
          </div>
          {channel && (
            <a className="hub-pill-btn is-inverse" href={channel.url + "?sub_confirmation=1"} target="_blank" rel="noopener noreferrer">
              Subscribe on YouTube
            </a>
          )}
        </div>

        {list.length === 0 ? (
          <div className="hub-empty"><Icon name="videos" /><h3>No videos yet</h3><p>New uploads will show up here.</p></div>
        ) : chip === "Shorts" ? (
          <div className="hub-grid hub-grid-shorts">{list.map((video) => <ShortCard key={video.key} video={video} />)}</div>
        ) : (
          <div className="hub-grid">{list.map((video) => <VideoCard key={video.key} video={video} />)}</div>
        )}
      </div>
    </>
  );
}
