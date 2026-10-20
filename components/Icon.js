// Inline stroke icons for the hub chrome. 24×24 grid, currentColor.

const PATHS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />,
  shorts: (
    <>
      <path d="M14.6 3.4 7.1 7.8a3.4 3.4 0 0 0 0 5.9l.9.5-.9.5a3.4 3.4 0 0 0 3.4 5.9l7.5-4.4a3.4 3.4 0 0 0 0-5.9l-.9-.5.9-.5a3.4 3.4 0 0 0-3.4-5.9z" />
      <path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor" stroke="none" />
    </>
  ),
  games: (
    <>
      <path d="M7 7.5h10a4.5 4.5 0 0 1 4.4 5.4l-.6 3a2.8 2.8 0 0 1-4.9 1.2L14.4 15H9.6l-1.5 2.1a2.8 2.8 0 0 1-4.9-1.2l-.6-3A4.5 4.5 0 0 1 7 7.5z" />
      <path d="M8 10.5v3M6.5 12h3" />
      <path d="M15.5 11h.01M17.5 13h.01" strokeWidth="2.6" />
    </>
  ),
  videos: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3.5" />
      <path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor" stroke="none" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 3.5v5h5M12 7.5V12l3 2" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  heartFill: <path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" fill="currentColor" />,
  posts: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" />,
  pro: <path d="m3.5 8 4.2 4 4.3-7 4.3 7 4.2-4-1.8 11H5.3z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  shield: <path d="M12 3.5 19.5 6v5.6c0 4.7-3.2 7.8-7.5 8.9-4.3-1.1-7.5-4.2-7.5-8.9V6z" />,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  share: <path d="m14 5 6 6-6 6M20 11H10a6 6 0 0 0-6 6v2" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  login: <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M9.5 16.5 14 12 9.5 7.5M14 12H4" />,
  logout: <path d="M10 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H10M15.5 16.5 20 12l-4.5-4.5M20 12H10" />,
  cloud: <path d="M7.5 18.5h9.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.4 3.3 3.3 0 0 0 1.3 6.6z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <path d="M12 15.5V4.5m-4.5 4.5L12 4.5 16.5 9M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  trash: <path d="M4.5 7h15M10 4h4M6.5 7l1 12.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12.5" />,
};

export default function Icon({ name, size = 24, className = "", strokeWidth = 1.8 }) {
  return (
    <svg
      className={"hub-icon " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] || null}
    </svg>
  );
}
