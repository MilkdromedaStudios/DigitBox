// YouTube's official logo, shown unmodified next to YouTube content and
// linked back to YouTube, as the YouTube API Services Branding Guidelines
// require (developers.google.com/youtube/terms/branding-guidelines). The
// files in public/brand are Google's own; don't recolour or edit them.

export function YouTubeLogo({ height = 20 }) {
  return (
    <span className="yt-logo">
      <img className="yt-logo-on-dark" src="/brand/youtube-logo-dark.svg" alt="YouTube" style={{ height }} />
      <img className="yt-logo-on-light" src="/brand/youtube-logo.svg" alt="YouTube" style={{ height }} />
    </span>
  );
}

// "Videos from [YouTube]" link for sections that list YouTube content.
export function YouTubeAttribution({ href = "https://www.youtube.com/", label = "Videos from" }) {
  return (
    <a className="yt-attrib" href={href} target="_blank" rel="noopener noreferrer">
      <span>{label}</span>
      <YouTubeLogo height={18} />
    </a>
  );
}
