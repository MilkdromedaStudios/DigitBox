# Adding projects (admin)

The admin page at **[/admin/projects](https://digitbox.dev/admin/projects)**
adds games to DigitBox. Each project has a **name**, an **emoji**, a **colour
theme** and its **HTML**, plus an optional description and genre. A saved
project appears straight away on the home page's Games shelf, the Games page,
search and the Library. No commit or rebuild is needed.

## Who can use it

The server checks every request; the page only decides what to show.

- **The site owner.** This is the DigitBox account that holds the owner slot,
  the one created with the display name **Numberstring**. It also sees
  **Admin** in the menu.
- **Optional extra admins.** On Cloudflare Pages, open **digitbox → Settings →
  Variables and Secrets**. Add a variable `ADMIN_EMAILS` with the account
  emails, separated by commas (for example `me@example.com,friend@example.com`),
  and redeploy.

Sign in with that account on the site first. A signed-out visitor, or any
other account, gets a "sign in" or "isn't an admin" message, and the API
answers 401 or 403.

## Adding a game

1. Open **Admin → Projects → New project**.
2. **Name:** this also sets the address, `/projects/<name-in-lowercase>`. The
   address doesn't change if you rename the project later. Names used by the
   built-in games are taken.
3. **Emoji:** pick one or paste any single emoji.
4. **Colour theme:** pick a preset or slide to any colour. It colours the card,
   the Games page spotlight and the loading screen.
5. **Game HTML:** upload an `.html` file or paste the code (up to 5 MB).
6. **Test the game** runs it in a preview. **Add project** publishes it.

Each project row has **Edit**, **Hide**/**Show** and **Delete**. Hidden
projects stay in the admin list and can be previewed, but visitors can't see
or open them.

## What a game's HTML can do

Games run in a sandboxed frame with its own blank origin, so a game can't read
DigitBox's storage, cookies or login tokens. That matters because game HTML
often comes from elsewhere.

- **Saving works.** `localStorage`, `sessionStorage` and `document.cookie` work
  as normal. Progress in `localStorage` and cookies is kept per game in the
  player's browser, and **Reset progress** on the player clears it.
- **One self-contained file.** Images, sounds and scripts must be inside the
  HTML (for example as data URLs, which is how TurboWarp packages Scratch
  games) or loaded from full `https://` links. Separate local files next to
  the HTML won't load.
- **Not available:** IndexedDB, and anything that needs the DigitBox account.
  Games that save only to IndexedDB won't keep progress.
- **Bigger games** (over 5 MB, like Eaglercraft) still use the existing
  game-assets release (see [GITHUB_RELEASE_ASSETS.md](GITHUB_RELEASE_ASSETS.md)).

## Where it's stored

Projects live in the site's **Cloudflare D1** database, the same one that
holds accounts, in two tables the site creates on first use:

- `hub_projects`: one row per project.
- `hub_project_html`: the HTML, split into pieces of about 1 MB, because D1
  caps one value at 2 MB.

Nothing else needs setting up on Cloudflare Pages. The Vercel deployment has
no D1 database, so the admin page says storage isn't available there and only
the built-in games show.

To back up, export the database with Wrangler:
`npx wrangler d1 export <database-name> --remote --output digitbox-backup.sql`

## API

All admin routes need `Authorization: Bearer <token>` from a signed-in admin
account.

| Route | What it does |
| --- | --- |
| `GET /api/admin/session` | Whether the signed-in account is an admin |
| `GET` / `POST /api/admin/projects` | List all projects / create one from JSON `{ name, emoji, hue, description?, genre?, visible? }` |
| `GET` / `PATCH` / `DELETE /api/admin/projects/<slug>` | Read / edit / delete one project |
| `GET` / `PUT /api/admin/projects/<slug>/html` | Read / replace the HTML (the raw file as the request body) |
| `GET /api/hub-projects` | Public: shown projects, newest first |
| `GET /api/hub-projects/<slug>/html` | Public: a shown project's HTML, as text for the sandboxed player |

The older content endpoints `POST /api/content/publish` and
`/api/content/delete` now require an admin too.
