export const COLS = 7;
export const ROWS = 34;
export const VIEW_ROWS = 10;
export const SAVE_KEY = "digitbox-deepforge-beta-v1";

export const ORES = {
  dirt: { icon: "·", name: "Dirt", value: 1, hp: 1, css: "df-dirt" },
  stone: { icon: "◆", name: "Stone", value: 2, hp: 2, css: "df-stone" },
  coal: { icon: "●", name: "Coal", value: 5, hp: 2, css: "df-coal" },
  copper: { icon: "Cu", name: "Copper", value: 8, hp: 3, css: "df-copper" },
  iron: { icon: "Fe", name: "Iron", value: 13, hp: 4, css: "df-iron" },
  silver: { icon: "Ag", name: "Silver", value: 22, hp: 5, css: "df-silver" },
  crystal: { icon: "✦", name: "Crystal", value: 42, hp: 6, css: "df-crystal" },
  relic: { icon: "⬢", name: "Relic", value: 90, hp: 8, css: "df-relic" },
};

export const BUILDINGS = [
  { key: "refinery", name: "Ore Mill", icon: "⚙", desc: "+12% ore sale value per level", base: 160 },
  { key: "workshop", name: "Machine Shop", icon: "🔧", desc: "+1 mining power every 2 levels", base: 190 },
  { key: "academy", name: "Survey Office", icon: "📐", desc: "Engineering boosts last longer", base: 230 },
  { key: "walls", name: "Claim Fence", icon: "▥", desc: "+18 claim defense per level", base: 260 },
];

export const RIVALS = [
  { name: "Quartz Creek Co.", trophies: 118, power: 58, city: "Dust Creek" },
  { name: "Red Ridge Mining", trophies: 176, power: 76, city: "Red Ridge" },
  { name: "Pine Quarry", trophies: 238, power: 96, city: "Pine Hollow" },
  { name: "Deep Shaft Co.", trophies: 315, power: 122, city: "Black Basin" },
  { name: "Copper Trail", trophies: 402, power: 150, city: "Copper Trail" },
  { name: "Highland Works", trophies: 520, power: 184, city: "Highland Camp" },
];

export const INITIAL = {
  coins: 120,
  cargo: {},
  cargoCount: 0,
  cargoMax: 18,
  drill: 1,
  armor: 1,
  blaster: 1,
  hp: 100,
  maxHp: 100,
  trophies: 100,
  blocksMined: 0,
  research: 0,
  boostCharges: 0,
  buildings: { refinery: 0, workshop: 0, academy: 0, walls: 0 },
};

function seededNoise(row, col) {
  const x = Math.sin((row + 11) * 91.733 + (col + 7) * 47.173) * 43758.5453;
  return x - Math.floor(x);
}

function oreFor(row, col) {
  if (row === 0) return null;
  const n = seededNoise(row, col);
  const d = row / ROWS;
  if (row > 24 && n > 0.965) return "relic";
  if (row > 18 && n > 0.89) return "crystal";
  if (row > 12 && n > 0.82) return "silver";
  if (row > 7 && n > 0.72) return "iron";
  if (row > 4 && n > 0.61) return "copper";
  if (n > 0.48) return "coal";
  return n > 0.22 + d * 0.08 ? "stone" : "dirt";
}

export function createWorld() {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col) => {
      const type = oreFor(row, col);
      if (!type) return null;
      const ore = ORES[type];
      const depthBonus = Math.floor(row / 8);
      return { type, hp: ore.hp + depthBonus, maxHp: ore.hp + depthBonus };
    })
  );
}

export function challengeFor(seed) {
  const challenges = [
    {
      title: "Ore-mill ratio",
      text: "A sorting batch uses copper : iron in a 3 : 2 ratio. If you load 18 copper samples, how many iron samples keep the ratio exact?",
      choices: ["10", "12", "15", "27"],
      answer: "12",
      explain: "18 ÷ 3 = 6 groups. Iron needs 2 groups: 6 × 2 = 12.",
    },
    {
      title: "Pump calibration",
      text: "A water pump gauge follows 4x + 6 = 34. What value of x gives the correct setting?",
      choices: ["5", "6", "7", "10"],
      answer: "7",
      explain: "Subtract 6: 4x = 28. Divide by 4: x = 7.",
    },
    {
      title: "City expansion",
      text: "A new factory lot is 14 m by 9 m. What area must the construction drones clear?",
      choices: ["23 m²", "46 m²", "126 m²", "252 m²"],
      answer: "126 m²",
      explain: "Area = length × width = 14 × 9 = 126 m².",
    },
    {
      title: "Hauling schedule",
      text: "Four trucks can each haul 75 kg in this test run. The mill needs 230 kg. How much carrying capacity remains?",
      choices: ["30 kg", "70 kg", "130 kg", "300 kg"],
      answer: "70 kg",
      explain: "4 × 75 = 300 kg total. 300 − 230 = 70 kg spare.",
    },
    {
      title: "Claim survey",
      text: "A rival claim has 160 marked fence posts and 56 are removed. What percent of the original posts were removed?",
      choices: ["35%", "44%", "56%", "65%"],
      answer: "35%",
      explain: "56 ÷ 160 = 0.35 = 35%.",
    },
  ];
  return challenges[Math.abs(Number(seed) || 0) % challenges.length];
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
