# DEEPFORGE prototype

DEEPFORGE is the flagship game experiment for DigitBox.

## Core loop

1. Dig through a procedural 2D mine.
2. Collect and sell ore.
3. Upgrade drill, cargo, armor, and raid equipment.
4. Build a mining city with permanent economic and defensive bonuses.
5. Solve short engineering/math problems for direct gameplay boosts.
6. Raid ghost rivals and climb the prototype league.

The game is intentionally designed as a game first. Learning tasks are tied to
systems the player cares about: refinery recipes, drill calibration, city
construction, power grids, and raid telemetry.

## Prototype multiplayer

The GitHub Pages build is static, so version 0.1 uses simulated "ghost" rivals.
The UI labels these clearly. A future Supabase-backed version can store player
profiles, city snapshots, trophy ratings, seasons, and asynchronous raid
results without changing the basic game loop.

## Running locally

    cd frontier-pages
    npm install
    npm run dev

The same FrontierGame component is also used by /frontier in the main
DigitBox Next.js app.

## GitHub Pages

.github/workflows/frontier-pages.yml builds the isolated static Next.js app
from frontier-pages/ on the dev branch. This keeps the production DigitBox
app's API routes, Supabase features, and dynamic routes untouched while still
providing a real GitHub Pages-compatible prototype.
