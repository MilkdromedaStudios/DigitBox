# DEEPFORGE Cloudflare D1 backend

The beta already works without a backend using localStorage. This folder is the drop-in cloud-save service for Cloudflare D1.

## Data path

Browser (`/beta`) → Cloudflare Worker → D1 (`player_saves`)

The generated terrain is deterministic and is **not** stored in D1. Saves contain only:

- player position
- money/upgrades/town progress
- ranking state
- sparse changed world nodes (mined ore/damage)

That keeps an infinite world save small.

## Setup

1. Create a Cloudflare D1 database named `digitbox-deepforge`.
2. Apply `schema.sql` to the database.
3. Copy `wrangler.toml.example` to `wrangler.toml` and set the D1 database ID.
4. Deploy the Worker.
5. Set the DigitBox Vercel environment variable:

   `NEXT_PUBLIC_DEEPFORGE_API=https://YOUR-WORKER.workers.dev`

6. Redeploy DigitBox. `/beta` will automatically prefer the D1 save and keep localStorage as an offline fallback.

## Security note

The current beta uses a random anonymous browser ID. Before public multiplayer, replace this with authenticated DigitBox user IDs and server-side authorization so players cannot overwrite another player save.
