# Managing projects (admin)

The admin page at **[/admin/projects](https://digitbox.dev/admin/projects)**
manages the games on DigitBox:

- **Add projects:** each has a **name**, an **emoji**, a **colour theme** and
  its **HTML**, plus an optional description and genre.
- **Edit, hide or delete any game:** the projects you added and the
  **built-in games** the site ships with.

Changes show up straight away on the home page's Games shelf, the Games page,
search and the Library. No commit or rebuild is needed.

## Who can use it

The server checks every request; the page only decides what to show.

- **The site owner.** This is the DigitBox account that holds the owner slot,
  the one created with the display name **Numberstring**. It also sees
  **Admin** in the menu.
- **Optional extra admins**, by account ID:
  1. Have the person sign in and open `/admin/projects`. The "isn't an admin"
     page shows their **Account ID** (it starts with `user_`).
  2. On Cloudflare Pages, open **digitbox → Settings → Variables and Secrets**.
  3. Add `ADMIN_USER_IDS` with the IDs, separated by commas, and redeploy.

  IDs are used rather than emails because signing up doesn't verify an email
  address, so anyone could register a listed email first.

Sign in with that account on the site first. A signed-out visitor, or any
other account, gets a "sign in" or "isn't an admin" message, and the API
answers 401 or 403.

## Adding a game

1. Open **Admin → Projects → New project**.
2. **Name:** this also sets the address, `/projects/<name-in-lowercase>`. A
   name with no Latin letters gets an address like `/projects/game-1x2y3z`.
   The address doesn't change if you rename the project later. Names used by
   the built-in games are taken.
3. **Emoji:** pick one or paste any single emoji.
4. **Colour theme:** pick a preset or slide to any colour. It colours the
   game's card and its loading screen.
5. **Game HTML:** upload an `.html` file or paste the code (up to 5 MB).
6. **Test the game** runs it in a preview. **Add project** publishes it.

Each added project has **Edit**, **Hide**/**Show** and **Delete**. Hidden
projects stay in the admin list and can be previewed, but visitors can't see
or open them.

## Built-in games

The **Built-in games** section lists the games DigitBox ships with (from
`data/projects-index.json`).

- **Edit** changes the name, emoji, colour, description and genre. The game's
  files stay as they are. **Reset to original** undoes every change.
- **Hide** takes the game off the site until you **Show** it again.
- **Delete** takes the game down within a few seconds, for example for a
  copyright complaint:
  - it leaves every list, including search and the Library;
  - its page answers "not found";
  - its game files (`/api/content/file`, `/api/projects/…`,
    `/api/project-file/…`) stop being served, whatever folder, case or
    spelling of the file name a link uses.

  A deleted game stays in the admin list with **Restore**.

A deleted game's original file is **still in the GitHub repository** (and the
`game-assets` release) until it is removed there. The site no longer serves
it, but anyone browsing the repository can still find it. For a copyright
takedown, also delete the file from the repository and the release, and its
entry from `data/projects-index.json` and `data/cloud-games.json`.

## What a game's HTML can do

Added games run in a sandboxed frame with its own blank origin, so a game
can't read DigitBox's storage, cookies or login tokens. That matters because
game HTML often comes from elsewhere.

- **Saving works.** `localStorage`, `sessionStorage` and `document.cookie` work
  as normal, including when the game reloads itself. Progress in
  `localStorage` and cookies is kept per game in the player's browser (up to
  about 1 MB per game; the least recently played game's save makes room when
  needed). **Reset progress** on the player clears it.
- **One self-contained file.** Images, sounds and scripts must be inside the
  HTML (for example as data URLs, which is how TurboWarp packages Scratch
  games) or loaded from full `https://` links. Separate local files next to
  the HTML won't load.
- **Links** a game opens in a new tab work normally.
- **Not available:** IndexedDB, and anything that needs the DigitBox account.
  Games that save only to IndexedDB won't keep progress.
- **Bigger games** (over 5 MB, like Eaglercraft) still use the existing
  game-assets release (see [GITHUB_RELEASE_ASSETS.md](GITHUB_RELEASE_ASSETS.md)).

## Where it's stored

Everything lives in the site's **Cloudflare D1** database (the same one that
holds accounts), in tables the site creates on first use:

- `hub_projects`: one row per added project.
- `hub_project_html`: each game's HTML, in pieces of at most about 1.2 MB.
- `hub_project_uploads`: pieces of an upload in progress.
- `hub_builtin_changes`: edits, hides and deletions of built-in games.

The HTML is uploaded and loaded **one piece per request**. Copying a whole
multi-MB game through D1 in one request would use more CPU than the Workers
Free plan allows (10 ms per request). The last piece of an upload swaps the
new HTML in all at once, so players never get half of an update.

Nothing else needs setting up on Cloudflare Pages. The Vercel deployment and
Cloudflare preview deployments have no D1 database: there the admin page says
storage isn't available, and the built-in games show as they ship.

To back up, export the database with Wrangler:
`npx wrangler d1 export <database-name> --remote --output digitbox-backup.sql`

## API

All admin routes need `Authorization: Bearer <token>` from a signed-in admin
account.

| Route | What it does |
| --- | --- |
| `GET /api/admin/session` | Whether the signed-in account is an admin, and whether this deployment has storage |
| `GET /api/admin/projects` | All added projects and all built-in games with their edits |
| `POST /api/admin/projects` | Create a project from JSON `{ name, emoji, hue, description?, genre?, visible? }` |
| `GET` / `PATCH` / `DELETE /api/admin/projects/<slug>` | Read / edit / delete an added project |
| `PUT /api/admin/projects/<slug>/html?upload=<id>&part=<i>&parts=<n>` | Upload piece `i` of `n` of new HTML (raw text, at most 400,000 characters). `id` is 16–64 hex characters, the same for every piece. The last piece swaps the HTML in. A small file can be sent whole, without the query |
| `GET /api/admin/projects/<slug>/html?part=<i>` | Piece `i` of the current HTML (hidden projects too) |
| `PATCH /api/admin/builtins/<slug>` | Edit a built-in game: any of `name`, `emoji`, `hue`, `description`, `genre`, `visible`, `deleted` (`false` restores it), or `{ "reset": true }` |
| `DELETE /api/admin/builtins/<slug>` | Take a built-in game down |
| `GET /api/hub-projects` | Public: shown added projects (newest first) and the built-in games' edits |
| `GET /api/hub-projects/<slug>/html?v=<version>&part=<i>` | Public: piece `i` of a shown project's HTML, as text for the sandboxed player |

The older content endpoints `POST /api/content/publish` and
`/api/content/delete` require an admin too.
