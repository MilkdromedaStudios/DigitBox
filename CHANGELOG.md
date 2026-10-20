# Changelog

All notable changes to **digitbox.dev**. This list is grouped by feature; the
most recent work is at the top.

## YouTube videos

- **Videos from all of YouTube.** With a YouTube Data API key
  (`YOUTUBE_API_KEY`, see `docs/YOUTUBE_API_SETUP.md`) the site shows popular
  videos (US charts by default; `YOUTUBE_REGION` picks another country, or
  `auto` for each visitor's own), Shorts, and YouTube search.
- **Sections:** the home page is organised as **Recommended** (first),
  **Videos**, **Shorts** and **Games**. Videos has category filters, such as
  Gaming and Music, where YouTube has a chart.
- **The DigitBox channel** has its own section near the bottom of the home page
  and a chip on the Videos page.
- Videos show their length, LIVE status and channel picture. Videos whose owners
  block playback on other sites show a "Watch on YouTube" button instead of a broken player.
- The watch page loads YouTube's player only when you press play.
- Watch history is kept for 30 days, and cached YouTube data for at most a few
  days, as YouTube's API policies require.
- "Like" is now **Save** (it saves to your Library, not to YouTube). New
  **Terms** page, and YouTube attribution where videos appear.
- The DigitBox logo in the header is now the box mark from the favicon.

## Entertainment hub

DigitBox is now an entertainment site for videos and cloud games instead of a
portfolio. The old site is saved in `archive/digitbox-portfolio-2026-10-20.zip`.

- **YouTube-style layout** — a top bar with search, a sidebar that collapses
  to an icon rail, and a bottom tab bar on phones. Works in dark and light
  themes with your accent colour.
- **Videos** — uploads from the DigitBox YouTube channel appear automatically.
  Watch them on a full watch page with Like, Share, Subscribe, a description
  and an Up next list.
- **Shorts** — a swipeable, full-screen vertical feed.
- **Cloud Games** — every project is now a cloud game with its own cover art,
  genre tags and filters. Games still open in the full-screen player with
  autosave.
- **Search** across videos, Shorts, games and posts.
- **Library** — watch/play history, liked videos and games, and the notes
  scratchpad, all saved on your device.
- **Removed** — Digitbox AI, AppGPT and the DEEPFORGE beta, along with their
  workflows. Accounts, profiles and DigitBox Pro are unchanged.

## Digitbox AI + easter eggs

- **Digitbox AI** — a real, built-in AI assistant with its own **Digitbox AI**
  tab.
  - Chat interface with a saved-conversations sidebar. Chats are stored on your
    device (no account needed); create, switch, and delete conversations.
  - **Public request API**, CORS-enabled:
    - `GET /ai/api/request?message=Hello`
    - `GET /ai/api/request/Hello%20there`
    - `POST /api/ai/request` with `{ "message": "…" }` or
      `{ "messages": [ … ] }`
    - Returns `{ "ok": true, "reply": "…", "model": "…" }`; add `?info=1` to
      check configuration.
  - Provider-agnostic: works with any free OpenAI-compatible provider (Groq,
    Google Gemini, OpenRouter, Hugging Face) via a single `AI_API_KEY`. Shows a
    friendly "not switched on" notice until a key is configured. See
    `docs/DIGITBOX_AI_SETUP.md`.
- **Secret easter eggs** (trigger-only, so they cost nothing at idle):
  - The Konami code (↑ ↑ ↓ ↓ ← → ← → B A) rains emoji.
  - Typing `digitbox` anywhere triggers a rainbow flash.
  - Tapping the footer five times quickly starts party mode.
  - Sending "do a barrel roll" to Digitbox AI spins the page.

## Gallery

- Replaced the **View Raw** button with a per-project **Like (♥)** toggle;
  likes are saved on your device.
- Added **All / ♥ Liked** tabs to view just your liked projects.
- Added a **project search bar** (filters by title / name).
- Added a **"Jot things down"** notes scratchpad that auto-saves on your device.
- Removed the "view other people" community/stats section.
- Fixed the Gallery briefly showing "no projects" before the list finished
  loading (now shows a clear "Loading…" state).

## Look & performance

- Refreshed the whole site with a **dark "liquid glass"** look — frosted glass
  surfaces, gradient headings, clean hairline borders.
- **Performance pass:** removed the CPU-heavy effects (the WebGL hero effect,
  SVG refraction, cursor-follow highlight, looping animations, and hover
  motion). The glass is now fully static, so it stays light on the CPU/GPU.
- Themed focus rings, scrollbars, and refined buttons; light theme preserved.

## Games — autosave (beta)

- **Autosave for every game.** Progress is captured from each game's own
  browser storage and mirrored to durable places so you don't have to start
  over:
  - three tiers per game — **localStorage**, a **cookie**, and **IndexedDB**;
  - covers games that save in **IndexedDB** (Unity/Godot/Construct-style
    exports), not just localStorage.
- A floating **save panel** on each game: autosave toggle, **Save now**,
  **Load save**, **Reset**, and **Export / Import** a save file.
- Safety: autosave is armed only after restore, never shrinks an existing save
  (so a freshly-started game can't overwrite real progress), and restores only
  when a game boots empty. Honest status — it only says "Saved" when data was
  actually captured.
- External, cross-origin games (e.g. the Eaglercraft Launcher) are detected and
  clearly marked as not autosaveable.

## Accounts

- The **Login** button now auto-disables when the site has no Supabase keys
  configured, with a clear notice on the login page (accounts can't work
  without them). Everything else stays fully usable.

## Housekeeping

- Removed **Octo Loader** from the site (it moved to its own repository):
  deleted its pages, nav tab, bundled download, CI workflow, and styles.
- Added a public changelog (this page).
