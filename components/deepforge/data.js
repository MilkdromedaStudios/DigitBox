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
  researchTech: { drilling: 0, processing: 0, survey: 0, tactics: 0 },
  boostCharges: 0,
  buildings: { refinery: 0, workshop: 0, academy: 0, walls: 0 },
  buildingHp: { refinery: 100, workshop: 100, academy: 100, walls: 160 },
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


function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffled(values) {
  const list = values.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function numericChoices(answer, spread, suffix) {
  const values = new Set([answer]);
  const step = Math.max(1, Math.round(spread || Math.max(2, Math.abs(answer) * 0.15)));
  let guard = 0;
  while (values.size < 4 && guard < 30) {
    guard += 1;
    const direction = Math.random() < 0.5 ? -1 : 1;
    const distance = randomInt(1, 3) * step;
    const value = Math.max(0, answer + direction * distance);
    values.add(value);
  }
  let filler = answer + step;
  while (values.size < 4) {
    values.add(Math.max(0, filler));
    filler += step;
  }
  return shuffled(Array.from(values).map((value) => String(value) + (suffix || "")));
}

export function generateResearchMathQuestion() {
  const type = randomInt(0, 17);

  if (type === 0) {
    const a = randomInt(18, 180);
    const b = randomInt(12, 140);
    const answer = a + b;
    return {
      title: "Ore inventory",
      text: "The depot has " + a + " iron samples and receives " + b + " more. How many samples are there now?",
      choices: numericChoices(answer, randomInt(4, 13), ""),
      answer: String(answer),
      explain: a + " + " + b + " = " + answer + ".",
    };
  }

  if (type === 1) {
    const start = randomInt(90, 350);
    const used = randomInt(20, start - 20);
    const answer = start - used;
    return {
      title: "Supply count",
      text: "A workshop starts with " + start + " bolts and uses " + used + ". How many remain?",
      choices: numericChoices(answer, randomInt(3, 11), ""),
      answer: String(answer),
      explain: start + " − " + used + " = " + answer + ".",
    };
  }

  if (type === 2) {
    const trucks = randomInt(3, 12);
    const each = randomInt(8, 45);
    const answer = trucks * each;
    return {
      title: "Hauling capacity",
      text: trucks + " mining carts each carry " + each + " kg. What is the total carrying capacity?",
      choices: numericChoices(answer, each, " kg"),
      answer: String(answer) + " kg",
      explain: trucks + " × " + each + " = " + answer + " kg.",
    };
  }

  if (type === 3) {
    const groups = randomInt(3, 15);
    const each = randomInt(4, 24);
    const total = groups * each;
    return {
      title: "Sample crates",
      text: total + " mineral samples are split equally into " + groups + " crates. How many samples go in each crate?",
      choices: numericChoices(each, randomInt(1, 5), ""),
      answer: String(each),
      explain: total + " ÷ " + groups + " = " + each + ".",
    };
  }

  if (type === 4) {
    const length = randomInt(6, 28);
    const width = randomInt(5, 22);
    const answer = length * width;
    return {
      title: "Factory lot",
      text: "A factory lot is " + length + " m by " + width + " m. What is its area?",
      choices: numericChoices(answer, randomInt(6, 20), " m²"),
      answer: String(answer) + " m²",
      explain: "Area = " + length + " × " + width + " = " + answer + " m².",
    };
  }

  if (type === 5) {
    const length = randomInt(8, 32);
    const width = randomInt(5, 20);
    const answer = 2 * (length + width);
    return {
      title: "Claim fence",
      text: "A rectangular claim is " + length + " m long and " + width + " m wide. How much fencing is needed for the perimeter?",
      choices: numericChoices(answer, randomInt(4, 12), " m"),
      answer: String(answer) + " m",
      explain: "Perimeter = 2(" + length + " + " + width + ") = " + answer + " m.",
    };
  }

  if (type === 6) {
    const percent = [10, 20, 25, 40, 50, 75][randomInt(0, 5)];
    const baseUnit = percent === 25 || percent === 75 ? 4 : percent === 20 || percent === 40 ? 5 : 10;
    const total = randomInt(4, 24) * baseUnit;
    const answer = total * percent / 100;
    return {
      title: "Ore percentage",
      text: percent + "% of a " + total + " kg ore load is copper. How many kilograms are copper?",
      choices: numericChoices(answer, Math.max(2, Math.round(total / 10)), " kg"),
      answer: String(answer) + " kg",
      explain: percent + "% of " + total + " = " + answer + " kg.",
    };
  }

  if (type === 7) {
    const percent = [10, 20, 25, 40, 50][randomInt(0, 4)];
    const baseUnit = percent === 25 ? 4 : percent === 20 || percent === 40 ? 5 : 10;
    const original = randomInt(5, 25) * baseUnit;
    const removed = original * percent / 100;
    return {
      title: "Fence damage",
      text: "A claim has " + original + " fence posts. Zombies destroy " + removed + ". What percent of the posts were destroyed?",
      choices: shuffled([percent, Math.max(5, percent - 10), Math.min(95, percent + 10), Math.min(95, percent + 20)].map((v) => String(v) + "%")),
      answer: String(percent) + "%",
      explain: removed + " ÷ " + original + " = " + (percent / 100) + " = " + percent + "%.",
    };
  }

  if (type === 8) {
    const x = randomInt(2, 18);
    const a = randomInt(2, 9);
    const b = randomInt(3, 25);
    const total = a * x + b;
    return {
      title: "Pump calibration",
      text: "A pump setting follows " + a + "x + " + b + " = " + total + ". What is x?",
      choices: numericChoices(x, randomInt(1, 3), ""),
      answer: String(x),
      explain: "Subtract " + b + ", then divide by " + a + ": x = " + x + ".",
    };
  }

  if (type === 9) {
    const left = randomInt(2, 7);
    const right = randomInt(2, 7);
    const scale = randomInt(3, 12);
    const known = left * scale;
    const answer = right * scale;
    return {
      title: "Alloy ratio",
      text: "Copper : iron must be " + left + " : " + right + ". If you use " + known + " copper samples, how many iron samples are needed?",
      choices: numericChoices(answer, right, ""),
      answer: String(answer),
      explain: known + " ÷ " + left + " = " + scale + " groups, so " + right + " × " + scale + " = " + answer + ".",
    };
  }

  if (type === 10) {
    const a = randomInt(20, 90);
    const b = randomInt(20, 90);
    const c = randomInt(20, 90);
    const sum = a + b + c;
    const adjustedC = c + ((3 - (sum % 3)) % 3);
    const answer = (a + b + adjustedC) / 3;
    return {
      title: "Daily production",
      text: "A mill processes " + a + ", " + b + ", and " + adjustedC + " tons over three shifts. What is the average per shift?",
      choices: numericChoices(answer, randomInt(3, 9), " tons"),
      answer: String(answer) + " tons",
      explain: "(" + a + " + " + b + " + " + adjustedC + ") ÷ 3 = " + answer + " tons.",
    };
  }

  if (type === 11) {
    const meters = randomInt(2, 35);
    const answer = meters * 100;
    return {
      title: "Survey conversion",
      text: "A tunnel section is " + meters + " meters long. How many centimeters is that?",
      choices: numericChoices(answer, 100, " cm"),
      answer: String(answer) + " cm",
      explain: meters + " × 100 = " + answer + " cm.",
    };
  }

  if (type === 12) {
    const denominator = [2, 3, 4, 5, 6, 8][randomInt(0, 5)];
    const numerator = randomInt(1, denominator - 1);
    const total = randomInt(3, 18) * denominator;
    const answer = total * numerator / denominator;
    return {
      title: "Refinery fraction",
      text: numerator + "/" + denominator + " of a " + total + " kg batch is high-grade ore. How many kilograms is that?",
      choices: numericChoices(answer, randomInt(2, 8), " kg"),
      answer: String(answer) + " kg",
      explain: total + " × " + numerator + "/" + denominator + " = " + answer + " kg.",
    };
  }

  if (type === 13) {
    const price = randomInt(4, 30) * 10;
    const discount = [10, 20, 25, 50][randomInt(0, 3)];
    const saved = price * discount / 100;
    const answer = price - saved;
    return {
      title: "Equipment discount",
      text: "A mining tool costs $" + price + " and is discounted " + discount + "%. What is the sale price?",
      choices: numericChoices(answer, 10, ""),
      answer: String(answer),
      explain: "$" + price + " − $" + saved + " = $" + answer + ".",
    };
  }

  if (type === 14) {
    const speed = randomInt(4, 18);
    const hours = randomInt(2, 8);
    const answer = speed * hours;
    return {
      title: "Haul route",
      text: "A crawler travels " + speed + " km each hour for " + hours + " hours. How far does it travel?",
      choices: numericChoices(answer, speed, " km"),
      answer: String(answer) + " km",
      explain: speed + " × " + hours + " = " + answer + " km.",
    };
  }

  if (type === 15) {
    const length = randomInt(3, 12);
    const width = randomInt(2, 9);
    const height = randomInt(2, 7);
    const answer = length * width * height;
    return {
      title: "Storage volume",
      text: "A storage chamber measures " + length + " m × " + width + " m × " + height + " m. What is its volume?",
      choices: numericChoices(answer, randomInt(8, 30), " m³"),
      answer: String(answer) + " m³",
      explain: length + " × " + width + " × " + height + " = " + answer + " m³.",
    };
  }

  if (type === 16) {
    const angle = randomInt(2, 16) * 5;
    const answer = 90 - angle;
    return {
      title: "Tunnel angle",
      text: "A support beam makes a " + angle + "° angle with the floor. What angle completes a right angle?",
      choices: numericChoices(answer, 5, "°"),
      answer: String(answer) + "°",
      explain: "90° − " + angle + "° = " + answer + "°.",
    };
  }

  const red = randomInt(2, 8);
  const blue = randomInt(2, 8);
  const total = red + blue;
  const numerator = red;
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const divisor = gcd(numerator, total);
  const simpleN = numerator / divisor;
  const simpleD = total / divisor;
  const answer = simpleN + "/" + simpleD;
  const distractors = new Set([answer, red + "/" + blue, blue + "/" + total, "1/" + total]);
  while (distractors.size < 4) distractors.add(randomInt(1, total - 1) + "/" + total);
  return {
    title: "Core sample probability",
    text: "A bin has " + red + " red markers and " + blue + " blue markers. What is the probability of randomly choosing a red marker?",
    choices: shuffled(Array.from(distractors).slice(0, 4)),
    answer,
    explain: red + " red out of " + total + " total = " + answer + ".",
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
