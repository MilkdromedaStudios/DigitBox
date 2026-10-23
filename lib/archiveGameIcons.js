// Curated emoji motifs for every imported game in the archive.
// Use exact original game filenames, not loose keyword matching, so
// similar titles don't accidentally get incorrect artwork.
// Names in each group are whitespace-separated archive IDs.
const ICON_GROUPS = [
  [
    "⚽",
    "1-on-1-soccer football-bros football-legends soccer-bros soccer-random ragdoll-soccer rocket-soccer-derby super-liquid-soccer"
  ],
  [
    "🎾",
    "1-on-1-tennis"
  ],
  [
    "🏓",
    "ping-pong-chaos retro-ping-pong table-tennis-world-tour"
  ],
  [
    "🏀",
    "basket-bros basket-random basketball-legends basketball-stars"
  ],
  [
    "🏈",
    "retro-bowl retro-bowl-college"
  ],
  [
    "⚾",
    "baseball-bros google-baseball"
  ],
  [
    "🎱",
    "8-ball-classic"
  ],
  [
    "♟️",
    "chess"
  ],
  [
    "🎲",
    "12-mini-battles idle-dice"
  ],
  [
    "🔢",
    "2048 2048-cupcakes 9007199254740992"
  ],
  [
    "🛩️",
    "3D-flight-simulator bit-planes"
  ],
  [
    "🥅",
    "3d-free-kick"
  ],
  [
    "🎯",
    "1v1.lol bow-masters stick-archers-battle ragdoll-archers coreball"
  ],
  [
    "🦠",
    "agar-io-lite eugenes-life"
  ],
  [
    "⚔️",
    "age-of-war age-of-war-2 ages-of-conflict clash-of-vikings chaos-faction-2 war-the-knights funny-battle funny-battle-2 gladi-hoppers"
  ],
  [
    "👨‍🚀",
    "among-us"
  ],
  [
    "🐦",
    "angry-birds angry-birds-space angry-birds-showdown flappy-bird"
  ],
  [
    "🚜",
    "awesome-tanks awesome-tanks-2"
  ],
  [
    "🚪",
    "backrooms"
  ],
  [
    "🐷",
    "bad-piggies"
  ],
  [
    "🥓",
    "bacon-may-die"
  ],
  [
    "🍦",
    "bad-ice-cream bad-ice-cream-2 bad-ice-cream-3 papas-freezeria"
  ],
  [
    "🧸",
    "bad-parenting pou"
  ],
  [
    "💀",
    "bad-time-simulator 10-minutes-till-dawn"
  ],
  [
    "📚",
    "baldis-basics"
  ],
  [
    "💰",
    "bank-robbery-2 bank-robbery-3 bob-the-robber bob-the-robber-2 bob-the-robber-5 breaking-the-bank stealing-the-diamond"
  ],
  [
    "🗼",
    "big-ice-tower-tiny-square big-neon-tower-tiny-square big-tower-tiny-square big-tower-tiny-square-2"
  ],
  [
    "💭",
    "bitlife"
  ],
  [
    "🐍",
    "blocky-snakes"
  ],
  [
    "🎈",
    "bloons-TD bloons-TD-2 bloons-TD-3 bloons-TD-4 bloons-TD-5"
  ],
  [
    "🧩",
    "bloxorz boxel-rebound"
  ],
  [
    "🏎️",
    "blumgi-racers blumgi-rocket funny-mad-racing kart-bros merge-round-racers"
  ],
  [
    "🚙",
    "bouncy-motors crazy-cars crazy-crash-landing car-king-arena"
  ],
  [
    "🥊",
    "boxing-random get-on-top ragdoll-hit wrestle-bros stick-fighter karate-bros"
  ],
  [
    "🫧",
    "bubble-shooter"
  ],
  [
    "🦬",
    "burrito-bison-launcha-libre"
  ],
  [
    "🍬",
    "candy-crush cut-the-rope cut-the-rope-2 cut-the-rope-holiday-gift cut-the-rope-time-travel"
  ],
  [
    "🦫",
    "capybara-clicker"
  ],
  [
    "✏️",
    "car-drawing draw-climber"
  ],
  [
    "🪓",
    "choppy-orc"
  ],
  [
    "🔄",
    "circloO circloO-2"
  ],
  [
    "🧹",
    "cleanup-io"
  ],
  [
    "🏃",
    "cluster-rush dreadhead-parkour death-run-3D flood-runner-2 flood-runner-3 flood-runner-4 pixel-speedrun rooftop-run run run-2 run-3 ovo ovo-2 ovo-3-dimensions vex-4 vex-5 vex-6 vex-7 vex-8 tag"
  ],
  [
    "🍪",
    "cookie-clicker"
  ],
  [
    "🐄",
    "crazy-cattle-3D"
  ],
  [
    "🏍️",
    "crazy-motorcycle moto-x3m moto-x3m-2 moto-x3m-3 moto-x3m-pool-party moto-x3m-spooky-land moto-x3m-winter wheelie-bike super-bike-the-champion"
  ],
  [
    "🐔",
    "crossy-road"
  ],
  [
    "🌱",
    "dadish dadish-2 dadish-3"
  ],
  [
    "🏔️",
    "deadly-descent hill-climb-racing-lite"
  ],
  [
    "💨",
    "death-chase"
  ],
  [
    "💥",
    "demolition-derby-crash-racing"
  ],
  [
    "🪂",
    "doodle-jump helix-jump jumping-shell"
  ],
  [
    "🚘",
    "drift-boss drift-hunters-pro drive-mad escape-road escape-road-2 escape-road-3 highway-traffic madalin-stunt-cars-2 parking-fury parking-fury-2 parking-fury-3 super-star-car"
  ],
  [
    "🦆",
    "duck-life duck-life-2 duck-life-3 duck-life-4 duck-life-5 ducklings-io"
  ],
  [
    "🦅",
    "eagle-ride"
  ],
  [
    "🧟",
    "earn-to-die earn-to-die-2 zombie-rush plants-vs-zombies"
  ],
  [
    "🥚",
    "eggy-car"
  ],
  [
    "😆",
    "elastic-face"
  ],
  [
    "🔐",
    "escaping-the-prison infiltrating-the-airship fleeing-the-complex"
  ],
  [
    "👾",
    "evil-glitch"
  ],
  [
    "👖",
    "fancy-pants-adventure fancy-pants-adventure-2"
  ],
  [
    "🔥",
    "fireblob fireboy-and-watergirl fireboy-and-watergirl-2 fireboy-and-watergirl-3 fireboy-and-watergirl-4"
  ],
  [
    "🐻",
    "fnaf fnaf-2 fnaf-3 fnaf-4 fnaf-sister-location"
  ],
  [
    "🚴",
    "free-rider-3"
  ],
  [
    "🎤",
    "friday-night-funkin sprunki"
  ],
  [
    "🍉",
    "fruit-ninja melon-playground"
  ],
  [
    "🔫",
    "funny-shooter-2 getaway-shootout rooftop-snipers rooftop-snipers-2 time-shooter-2 time-shooter-3 superhot"
  ],
  [
    "💠",
    "geometry-dash geometry-dash-lite geometry-vibes"
  ],
  [
    "🦖",
    "google-dino"
  ],
  [
    "👵",
    "granny granny-2"
  ],
  [
    "❓",
    "guess-their-answer the-impossible-quiz the-impossible-quiz-2 trivia-crack"
  ],
  [
    "🪝",
    "hanger-2 stickman-hook"
  ],
  [
    "🛞",
    "happy-wheels"
  ],
  [
    "🕳️",
    "hole-io"
  ],
  [
    "🏠",
    "house-of-hazards"
  ],
  [
    "🚀",
    "hover-racer-drive"
  ],
  [
    "🐧",
    "ice-dodo learn-to-fly learn-to-fly-2 learn-to-fly-3 learn-to-fly-idle"
  ],
  [
    "🧱",
    "idle-breakout red-ball-4-vol-1 red-ball-4-vol-2 red-ball-4-vol-3 tetrominoes"
  ],
  [
    "🐗",
    "iron-snout"
  ],
  [
    "🔨",
    "jacksmith"
  ],
  [
    "🎒",
    "jetpack-joyride"
  ],
  [
    "🕵️",
    "johnny-trigger"
  ],
  [
    "🐈",
    "kittytoy six-cats-under trap-the-cat"
  ],
  [
    "😈",
    "level-devil"
  ],
  [
    "⚗️",
    "little-alchemy-2"
  ],
  [
    "⚡",
    "madness-project-nexus zrist"
  ],
  [
    "💣",
    "minesweeper temple-of-boom"
  ],
  [
    "🐒",
    "monkey-mart"
  ],
  [
    "🚚",
    "monster-tracks"
  ],
  [
    "⛏️",
    "motherload noob-miner"
  ],
  [
    "🚂",
    "openTTD"
  ],
  [
    "🔀",
    "opposite-day"
  ],
  [
    "🟡",
    "pac-man"
  ],
  [
    "🥐",
    "papas-bakeria"
  ],
  [
    "🍔",
    "papas-burgeria"
  ],
  [
    "🧀",
    "papas-cheeseria"
  ],
  [
    "🧁",
    "papas-cupcakeria"
  ],
  [
    "🍩",
    "papas-donuteria"
  ],
  [
    "🌭",
    "papas-hot-doggeria"
  ],
  [
    "🥞",
    "papas-pancakeria"
  ],
  [
    "🍝",
    "papas-pastaria"
  ],
  [
    "🍕",
    "papas-pizzeria"
  ],
  [
    "🍨",
    "papas-scooperia"
  ],
  [
    "🍣",
    "papas-sushiria"
  ],
  [
    "🌮",
    "papas-taco-mia"
  ],
  [
    "🍗",
    "papas-wingeria"
  ],
  [
    "🗺️",
    "paper-io-2 territorial-io state-io"
  ],
  [
    "🏫",
    "picos-school riddle-school riddle-school-2 riddle-school-3 riddle-school-4 riddle-school-5 riddle-transfer riddle-transfer-2"
  ],
  [
    "🌌",
    "plonky"
  ],
  [
    "🏁",
    "polytrack"
  ],
  [
    "🐰",
    "poor-bunny"
  ],
  [
    "🛣️",
    "retro-highway slow-roads tap-road"
  ],
  [
    "⌛",
    "short-life"
  ],
  [
    "🏙️",
    "sandbox-city"
  ],
  [
    "⛷️",
    "snow-rider snow-road"
  ],
  [
    "❄️",
    "snowball-io"
  ],
  [
    "🔑",
    "space-is-key space-is-key-2"
  ],
  [
    "🌊",
    "space-waves"
  ],
  [
    "⌨️",
    "spacebar-clicker"
  ],
  [
    "🏅",
    "speed-stars"
  ],
  [
    "🏗️",
    "stack stacktris"
  ],
  [
    "🛹",
    "subway-surfers-beijing subway-surfers-havana subway-surfers-san-francisco"
  ],
  [
    "🦝",
    "tanuki-sunset"
  ],
  [
    "🏛️",
    "temple-run-2 tomb-of-the-mask"
  ],
  [
    "🚫",
    "there-is-no-g"
  ],
  [
    "👥",
    "they-are-coming"
  ],
  [
    "🐘",
    "this-is-the-only-level this-is-the-only-level-too"
  ],
  [
    "🎣",
    "tiny-fishing"
  ],
  [
    "🤸",
    "tube-jumpers"
  ],
  [
    "🌀",
    "tunnel-rush"
  ],
  [
    "🚲",
    "unicycle-hero"
  ],
  [
    "🚵",
    "vex-x3m vex-x3m-2"
  ],
  [
    "🏐",
    "volley-random"
  ],
  [
    "👀",
    "we-become-what-we-behold"
  ],
  [
    "🚗",
    "wheely wheely-2 wheely-3 wheely-4 wheely-5 wheely-6 wheely-7 wheely-8"
  ],
  [
    "🟩",
    "wordle-unlimited"
  ],
  [
    "🏆",
    "worlds-hardest-game worlds-hardest-game-2 worlds-hardest-game-3"
  ],
  [
    "🏴‍☠️",
    "yohoho-io"
  ],
  [
    "🔪",
    "murder"
  ],
  [
    "🏜️",
    "sand-game"
  ],
  [
    "🔵",
    "slope slope-2-player slope-3"
  ],
  [
    "🍄",
    "sm-63 sm-64"
  ],
  [
    "🐌",
    "snail-bob snail-bob-2 snail-bob-3 snail-bob-4 snail-bob-5 snail-bob-6 snail-bob-7 snail-bob-8"
  ],
  [
    "🪖",
    "stick-merge"
  ]
];

const ICON_BY_NAME = new Map(
  ICON_GROUPS.flatMap(([emoji, titles]) =>
    titles.split(/\s+/).map((title) => [title.toLowerCase(), emoji])
  )
);

export function iconForArchiveGame(filename) {
  return ICON_BY_NAME.get(String(filename || "").toLowerCase()) || "🕹️";
}
