import { useEffect, useRef, useState } from "react";
import {
  chunkFor,
  cutsNear,
  groundMaterialAt,
  isSolidAt,
  noise,
  normalizeWorldChanges,
  oreDepositsNear,
  surfaceHeight,
} from "./world";

const DAY_MS = 150000;
const PLAYER_RADIUS = 0.34;

const MATERIAL = {
  topsoil: { light: "#7a5838", mid: "#65472e", dark: "#503622" },
  dirt: { light: "#755337", mid: "#5d402b", dark: "#49311f" },
  hardDirt: { light: "#64503d", mid: "#4f3e30", dark: "#3d3026" },
  gravel: { light: "#77736b", mid: "#5b5852", dark: "#44423e" },
  stone: { light: "#686a67", mid: "#50524f", dark: "#393b39" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function visualNoise(x, y, salt) {
  return noise(x, y, salt);
}

function colorMix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = pa >> 16;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = pb >> 16;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return "rgb(" + r + "," + g + "," + bl + ")";
}

function daylightState(now) {
  const phase = ((now % DAY_MS) / DAY_MS + 0.5) % 1;
  const angle = phase * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(angle);
  const light = clamp((sunHeight + 0.18) / 0.95, 0.06, 1);
  const sunset = clamp(1 - Math.abs(sunHeight) * 3.4, 0, 1) * (sunHeight > -0.28 ? 1 : 0);
  return { phase, angle, sunHeight, light, sunset };
}

function drawSky(ctx, width, height, cameraX, now) {
  const day = daylightState(now);
  const topNight = "#071220";
  const bottomNight = "#172031";
  const topDay = "#4ba9ec";
  const bottomDay = "#bde8ff";
  const topSunset = "#e98458";
  const bottomSunset = "#f5bd7b";

  let top = colorMix(topNight, topDay, day.light);
  let bottom = colorMix(bottomNight, bottomDay, day.light);
  top = colorMix(top, topSunset, day.sunset * 0.48);
  bottom = colorMix(bottom, bottomSunset, day.sunset * 0.68);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * (0.08 + day.phase * 0.84);
  const sunY = height * (0.76 - Math.max(-0.12, day.sunHeight) * 0.68);
  if (day.sunHeight > -0.18) {
    const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 58);
    glow.addColorStop(0, "rgba(255,247,205,.95)");
    glow.addColorStop(0.15, "rgba(255,225,145,.72)");
    glow.addColorStop(1, "rgba(255,210,125,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,244,196,.92)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Slow parallax clouds.
  const cloudShift = cameraX * 3.5 + now * 0.004;
  ctx.save();
  ctx.globalAlpha = 0.18 + day.light * 0.42;
  for (let i = -2; i < 7; i += 1) {
    const seed = i + Math.floor((cloudShift / 260));
    const x = ((i * 260 - cloudShift) % (width + 520)) - 130;
    const y = 55 + visualNoise(seed, 0, 303) * 135;
    const scale = 0.75 + visualNoise(seed, 0, 304) * 0.85;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, y, 55 * scale, 17 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 42 * scale, y - 8 * scale, 42 * scale, 22 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 78 * scale, y + 2 * scale, 49 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return day;
}

function worldToScreenX(worldX, cameraX, ppu, width) {
  return width / 2 + (worldX - cameraX) * ppu;
}

function worldToScreenY(worldY, cameraY, ppu, height) {
  return height / 2 + (worldY - cameraY) * ppu;
}

function surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, offset) {
  const step = Math.max(0.35, 8 / ppu);
  ctx.beginPath();
  let first = true;
  for (let wx = minWorldX; wx <= maxWorldX + step; wx += step) {
    const sx = worldToScreenX(wx, cameraX, ppu, width);
    const sy = worldToScreenY(surfaceHeight(wx) + offset, cameraY, ppu, height);
    if (first) {
      ctx.moveTo(sx, sy);
      first = false;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
}

function fillLayer(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, topOffset, bottomOffset, topColor, bottomColor) {
  const step = Math.max(0.35, 8 / ppu);
  const topPoints = [];
  const bottomPoints = [];
  for (let wx = minWorldX; wx <= maxWorldX + step; wx += step) {
    topPoints.push([
      worldToScreenX(wx, cameraX, ppu, width),
      worldToScreenY(surfaceHeight(wx) + topOffset, cameraY, ppu, height),
    ]);
  }
  for (let i = topPoints.length - 1; i >= 0; i -= 1) {
    const wx = minWorldX + i * step;
    bottomPoints.push([
      worldToScreenX(wx, cameraX, ppu, width),
      worldToScreenY(surfaceHeight(wx) + bottomOffset, cameraY, ppu, height),
    ]);
  }

  ctx.beginPath();
  topPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  bottomPoints.forEach((p) => ctx.lineTo(p[0], p[1]));
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, height * 0.2, 0, height);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawGroundTexture(ctx, minX, minY, maxX, maxY, cameraX, cameraY, ppu, width, height) {
  const spacing = 0.82;
  const startX = Math.floor(minX / spacing) * spacing;
  const startY = Math.floor(minY / spacing) * spacing;

  for (let wy = startY; wy <= maxY; wy += spacing) {
    for (let wx = startX; wx <= maxX; wx += spacing) {
      if (wy < surfaceHeight(wx) + 0.35) continue;
      const material = groundMaterialAt(wx, wy);
      if (material === "air" || material === "grass") continue;
      const seedX = Math.floor(wx * 9);
      const seedY = Math.floor(wy * 9);
      if (visualNoise(seedX, seedY, 501) < 0.52) continue;

      const sx = worldToScreenX(wx + (visualNoise(seedX, seedY, 502) - 0.5) * 0.42, cameraX, ppu, width);
      const sy = worldToScreenY(wy + (visualNoise(seedX, seedY, 503) - 0.5) * 0.42, cameraY, ppu, height);
      const radius = clamp(ppu * (0.018 + visualNoise(seedX, seedY, 504) * 0.026), 0.7, 2.3);

      if (material === "stone" || material === "gravel") {
        ctx.fillStyle = visualNoise(seedX, seedY, 505) > 0.5 ? "rgba(220,214,202,.11)" : "rgba(20,18,16,.16)";
      } else {
        ctx.fillStyle = visualNoise(seedX, seedY, 505) > 0.5 ? "rgba(213,166,111,.08)" : "rgba(37,25,17,.13)";
      }
      ctx.beginPath();
      ctx.ellipse(sx, sy, radius * 1.7, radius, visualNoise(seedX, seedY, 506) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGrass(ctx, minX, maxX, cameraX, cameraY, ppu, width, height) {
  const step = 0.26;
  for (let wx = Math.floor(minX / step) * step; wx <= maxX; wx += step) {
    const n = visualNoise(Math.floor(wx * 18), 0, 601);
    if (n < 0.34) continue;
    const groundY = surfaceHeight(wx);
    const sx = worldToScreenX(wx, cameraX, ppu, width);
    const sy = worldToScreenY(groundY, cameraY, ppu, height);
    const blade = 3 + n * 6;
    const lean = (visualNoise(Math.floor(wx * 21), 0, 602) - 0.5) * 3.5;
    ctx.strokeStyle = n > 0.72 ? "#7ea64c" : "#567b35";
    ctx.lineWidth = clamp(ppu * 0.022, 1, 2);
    ctx.beginPath();
    ctx.moveTo(sx, sy + 1);
    ctx.lineTo(sx + lean, sy - blade);
    ctx.stroke();
  }

  surfacePath(ctx, minX, maxX, cameraX, cameraY, ppu, width, height, 0);
  ctx.strokeStyle = "#4d6f31";
  ctx.lineWidth = clamp(ppu * 0.1, 3, 6);
  ctx.stroke();
  surfacePath(ctx, minX, maxX, cameraX, cameraY, ppu, width, height, 0.07);
  ctx.strokeStyle = "#7d9c4b";
  ctx.lineWidth = clamp(ppu * 0.035, 1, 2.4);
  ctx.stroke();
}

function rockPath(ctx, cx, cy, rx, ry, seedX, seedY) {
  const points = 11;
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const jitter = 0.78 + visualNoise(seedX + i, seedY - i, 701 + i) * 0.25;
    const px = cx + Math.cos(angle) * rx * jitter;
    const py = cy + Math.sin(angle) * ry * jitter;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawOreDeposit(ctx, deposit, cameraX, cameraY, ppu, width, height, light) {
  const ore = deposit.resource;
  const cx = worldToScreenX(deposit.x, cameraX, ppu, width);
  const cy = worldToScreenY(deposit.y, cameraY, ppu, height);
  const rx = deposit.rx * ppu;
  const ry = deposit.ry * ppu;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deposit.angle);
  ctx.translate(-cx, -cy);

  const shadow = ctx.createRadialGradient(cx, cy + ry * 0.25, 1, cx, cy + ry * 0.25, rx * 1.15);
  shadow.addColorStop(0, "rgba(0,0,0,.34)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.22, rx * 1.08, ry * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  rockPath(ctx, cx, cy, rx, ry, deposit.seedX, deposit.seedY);
  ctx.clip();

  const grad = ctx.createRadialGradient(cx - rx * 0.38, cy - ry * 0.48, 1, cx, cy, rx * 1.2);
  grad.addColorStop(0, colorMix(ore.hostLight, "#ffffff", light * 0.08));
  grad.addColorStop(0.52, ore.hostMid);
  grad.addColorStop(1, ore.hostDark);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - rx * 1.4, cy - ry * 1.4, rx * 2.8, ry * 2.8);

  for (let i = 0; i < 8; i += 1) {
    const px = cx + (visualNoise(deposit.seedX, deposit.seedY, 720 + i) - 0.5) * rx * 1.45;
    const py = cy + (visualNoise(deposit.seedX, deposit.seedY, 740 + i) - 0.5) * ry * 1.35;
    const r = clamp(ppu * (0.025 + visualNoise(deposit.seedX, deposit.seedY, 760 + i) * 0.03), 0.8, 2.4);
    ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.15)";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (ore.material === "coal") {
    for (let i = 0; i < 5; i += 1) {
      const px = cx + (visualNoise(deposit.seedX, deposit.seedY, 801 + i) - 0.5) * rx;
      const py = cy + (visualNoise(deposit.seedX, deposit.seedY, 821 + i) - 0.5) * ry;
      ctx.fillStyle = i % 2 ? ore.mineral : ore.mineral2;
      ctx.beginPath();
      ctx.moveTo(px - rx * 0.2, py + ry * 0.08);
      ctx.lineTo(px - rx * 0.04, py - ry * 0.23);
      ctx.lineTo(px + rx * 0.22, py - ry * 0.08);
      ctx.lineTo(px + rx * 0.1, py + ry * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(220,225,220,.17)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (ore.material === "quartz") {
    for (let i = 0; i < 5; i += 1) {
      const px = cx + (i - 2) * rx * 0.22;
      const baseY = cy + ry * 0.35;
      const h = ry * (0.7 + visualNoise(deposit.seedX, deposit.seedY, 850 + i) * 0.7);
      ctx.fillStyle = i % 2 ? "rgba(238,235,226,.82)" : "rgba(199,196,190,.8)";
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - rx * 0.08, baseY);
      ctx.lineTo(px - rx * 0.045, baseY - h * 0.72);
      ctx.lineTo(px, baseY - h);
      ctx.lineTo(px + rx * 0.065, baseY - h * 0.68);
      ctx.lineTo(px + rx * 0.09, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    const veinColor = ore.material === "gold" ? "rgba(220,211,196,.9)" : ore.mineral2;
    ctx.strokeStyle = veinColor;
    ctx.lineWidth = clamp(ppu * (ore.material === "gold" ? 0.1 : 0.075), 2, 6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.75, cy + ry * 0.25);
    ctx.lineTo(cx - rx * 0.25, cy - ry * 0.12);
    ctx.lineTo(cx + rx * 0.12, cy + ry * 0.03);
    ctx.lineTo(cx + rx * 0.7, cy - ry * 0.3);
    ctx.stroke();

    const flecks = ore.material === "gold" ? 8 : 5;
    for (let i = 0; i < flecks; i += 1) {
      const px = cx + (visualNoise(deposit.seedX, deposit.seedY, 900 + i) - 0.5) * rx * 1.35;
      const py = cy + (visualNoise(deposit.seedX, deposit.seedY, 920 + i) - 0.5) * ry * 1.2;
      const r = clamp(ppu * (0.025 + visualNoise(deposit.seedX, deposit.seedY, 940 + i) * 0.035), 1, 3);
      const metallic = ctx.createRadialGradient(px - r * 0.4, py - r * 0.5, 0, px, py, r);
      metallic.addColorStop(0, ore.highlight);
      metallic.addColorStop(0.45, ore.mineral2);
      metallic.addColorStop(1, ore.mineral);
      ctx.fillStyle = metallic;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (ore.material === "copper") {
      ctx.fillStyle = ore.highlight;
      for (let i = 0; i < 4; i += 1) {
        const px = cx + (visualNoise(deposit.seedX, deposit.seedY, 970 + i) - 0.5) * rx * 1.2;
        const py = cy + (visualNoise(deposit.seedX, deposit.seedY, 980 + i) - 0.5) * ry;
        ctx.beginPath();
        ctx.arc(px, py, clamp(ppu * 0.03, 1, 2.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
  ctx.restore();
}

function surfaceBridgeAt(x, y, changes) {
  const nearby = cutsNear(normalizeWorldChanges(changes), x - 5.5, y - 4, x + 5.5, y + 4);
  for (const cut of nearby) {
    const radius = Number(cut.r) || 0;
    if (radius < 1.25) continue;
    const surface = surfaceHeight(cut.x);
    if (Math.abs(Number(cut.y) - surface) > radius + 0.9) continue;
    const halfSpan = Math.max(1.8, Math.min(7.5, radius * 1.35));
    if (Math.abs(x - Number(cut.x)) > halfSpan) continue;
    const deckY = surface - 0.18;
    if (y >= deckY - 0.08 && y <= deckY + 0.24) return { x: Number(cut.x), y: deckY, halfSpan, radius };
  }
  return null;
}

function visibleSurfaceBridges(changes, minX, maxX) {
  const cuts = cutsNear(normalizeWorldChanges(changes), minX - 8, -30, maxX + 8, 40);
  const bridges = [];
  const used = [];
  for (const cut of cuts) {
    const radius = Number(cut.r) || 0;
    if (radius < 1.25) continue;
    const cx = Number(cut.x);
    const cy = Number(cut.y);
    const surface = surfaceHeight(cx);
    if (Math.abs(cy - surface) > radius + 0.9) continue;
    if (used.some((x) => Math.abs(x - cx) < 2.2)) continue;
    used.push(cx);
    bridges.push({ x: cx, y: surface - 0.18, halfSpan: Math.max(1.8, Math.min(7.5, radius * 1.35)) });
  }
  return bridges;
}

function drawSurfaceBridge(ctx, bridge, cameraX, cameraY, ppu, width, height) {
  const left = worldToScreenX(bridge.x - bridge.halfSpan, cameraX, ppu, width);
  const right = worldToScreenX(bridge.x + bridge.halfSpan, cameraX, ppu, width);
  const y = worldToScreenY(bridge.y, cameraY, ppu, height);
  const plankW = Math.max(7, ppu * 0.32);
  ctx.save();
  ctx.strokeStyle = "rgba(30,20,13,.95)";
  ctx.lineWidth = Math.max(3, ppu * 0.08);
  ctx.beginPath(); ctx.moveTo(left, y + 5); ctx.lineTo(right, y + 5); ctx.moveTo(left, y - 5); ctx.lineTo(right, y - 5); ctx.stroke();
  for (let x = left; x <= right; x += plankW) {
    ctx.fillStyle = "#6f4b2d"; ctx.fillRect(x, y - 7, Math.min(plankW - 1, right - x), 13);
    ctx.strokeStyle = "rgba(32,20,12,.75)"; ctx.lineWidth = 1; ctx.strokeRect(x, y - 7, Math.min(plankW - 1, right - x), 13);
  }
  ctx.strokeStyle = "#3b2a1b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left, y - 17); ctx.lineTo(right, y - 17); ctx.stroke();
  for (let x = left; x <= right; x += ppu * 1.4) { ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.lineTo(x, y - 6); ctx.stroke(); }
  ctx.restore();
}

function collides(x, y, changes) {
  const samples = [
    [0, 0],
    [-PLAYER_RADIUS, 0],
    [PLAYER_RADIUS, 0],
    [0, -PLAYER_RADIUS * 0.95],
    [0, PLAYER_RADIUS],
    [-PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 0.72],
    [PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 0.72],
  ];
  const terrainHit = samples.some(([ox, oy]) => isSolidAt(x + ox, y + oy, changes));
  if (terrainHit) return true;
  return Boolean(surfaceBridgeAt(x, y + PLAYER_RADIUS, changes));
}

function drawMiner(ctx, x, y, facing, moving, ppu, light, sunAngle) {
  const scale = clamp(ppu / 44, 0.9, 1.35);
  const bob = moving ? Math.sin(performance.now() / 90) * 1.4 : 0;
  const shadowOffset = Math.cos(sunAngle) * 8 * light;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(facing < 0 ? -scale : scale, scale);

  ctx.fillStyle = "rgba(20,16,12," + (0.18 + light * 0.16) + ")";
  ctx.beginPath();
  ctx.ellipse(shadowOffset, 20, 16 + light * 5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#252d31";
  ctx.fillRect(-9, 5, 7, 16);
  ctx.fillRect(2, 5, 7, 16);
  ctx.fillStyle = "#171a1b";
  ctx.fillRect(-11, 18, 10, 5);
  ctx.fillRect(1, 18, 10, 5);

  ctx.fillStyle = "#8a5d37";
  ctx.fillRect(-13, -8, 26, 17);
  ctx.fillStyle = "#d5b15f";
  ctx.fillRect(-13, -1, 26, 3);

  ctx.fillStyle = "#d4aa81";
  ctx.beginPath();
  ctx.arc(0, -14, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d2a425";
  ctx.beginPath();
  ctx.arc(0, -18, 12, Math.PI, Math.PI * 2);
  ctx.lineTo(12, -16);
  ctx.lineTo(-12, -16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f4e7ad";
  ctx.fillRect(6, -23, 6, 4);

  ctx.strokeStyle = "#684c32";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(24, -12);
  ctx.stroke();

  ctx.strokeStyle = "#777976";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(19, -16);
  ctx.lineTo(30, -9);
  ctx.stroke();

  ctx.restore();
}

function drawLighting(ctx, width, height, playerScreenX, playerScreenY, depth, dayLight) {
  const underground = clamp((depth - 1.2) / 14, 0, 1);
  const darkness = underground * (0.74 - dayLight * 0.12);
  if (darkness <= 0.01) return;

  const lampRadius = 125 + underground * 70;
  const darknessField = ctx.createRadialGradient(
    playerScreenX,
    playerScreenY - 10,
    28,
    playerScreenX,
    playerScreenY - 10,
    lampRadius
  );
  darknessField.addColorStop(0, "rgba(3,5,5," + (darkness * 0.06) + ")");
  darknessField.addColorStop(0.42, "rgba(3,5,5," + (darkness * 0.22) + ")");
  darknessField.addColorStop(1, "rgba(3,5,5," + darkness + ")");
  ctx.fillStyle = darknessField;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    playerScreenX + 9,
    playerScreenY - 21,
    0,
    playerScreenX + 9,
    playerScreenY - 21,
    58
  );
  glow.addColorStop(0, "rgba(255,232,161," + (0.15 + underground * 0.13) + ")");
  glow.addColorStop(1, "rgba(255,205,105,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(playerScreenX + 9, playerScreenY - 21, 58, 0, Math.PI * 2);
  ctx.fill();
}


function resolveDrillTarget(player, aim, radius, changes) {
  let ax = Number(aim && aim.x) || 0;
  let ay = Number(aim && aim.y) || 0;
  let magnitude = Math.sqrt(ax * ax + ay * ay);
  if (magnitude < 0.08) {
    ax = 0;
    ay = 1;
    magnitude = 1;
  }
  ax /= magnitude;
  ay /= magnitude;

  const start = PLAYER_RADIUS + 0.08;
  const maxDistance = 1.18 + radius * 0.9;
  let hitDistance = null;
  for (let distance = start; distance <= maxDistance; distance += 0.08) {
    if (isSolidAt(player.x + ax * distance, player.y + ay * distance, changes)) {
      hitDistance = distance;
      break;
    }
  }

  if (hitDistance === null) {
    return {
      x: player.x + ax * maxDistance,
      y: player.y + ay * maxDistance,
      ax,
      ay,
      hit: false,
    };
  }

  const centerDistance = Math.min(maxDistance, hitDistance + Math.min(0.38, radius * 0.42));
  return {
    x: player.x + ax * centerDistance,
    y: player.y + ay * centerDistance,
    ax,
    ay,
    hit: true,
  };
}

function drawWorldCity(ctx, city, cameraX, cameraY, ppu, width, height, light) {
  const centerX = Number(city && city.x);
  if (!Number.isFinite(centerX)) return;
  const centerScreenX = worldToScreenX(centerX, cameraX, ppu, width);
  if (centerScreenX < -520 || centerScreenX > width + 520) return;

  ctx.save();
  ctx.globalAlpha = 0.78 + light * 0.2;
  ctx.strokeStyle = "rgba(68,62,54,.9)";
  ctx.lineWidth = Math.max(4, ppu * 0.12);
  ctx.beginPath();
  let first = true;
  for (let wx = centerX - 7.5; wx <= centerX + 7.5; wx += 0.35) {
    const sx = worldToScreenX(wx, cameraX, ppu, width);
    const sy = worldToScreenY(surfaceHeight(wx) - 0.02, cameraY, ppu, height);
    if (first) { ctx.moveTo(sx, sy); first = false; }
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  const buildings = [
    { dx: -5.2, w: 1.8, h: 2.7 },
    { dx: -2.5, w: 2.2, h: 3.8 },
    { dx: 0.3, w: 2.4, h: 4.7 },
    { dx: 3.2, w: 2.0, h: 3.3 },
    { dx: 5.6, w: 1.5, h: 2.4 },
  ];

  buildings.forEach((building, index) => {
    const wx = centerX + building.dx;
    const ground = surfaceHeight(wx);
    const sx = worldToScreenX(wx, cameraX, ppu, width);
    const sy = worldToScreenY(ground, cameraY, ppu, height);
    const bw = building.w * ppu;
    const bh = building.h * ppu;
    ctx.fillStyle = index === 2 ? "#5a5042" : index % 2 ? "#6b5a47" : "#51483d";
    ctx.fillRect(sx - bw / 2, sy - bh, bw, bh);
    ctx.fillStyle = "#342f2a";
    ctx.fillRect(sx - bw * 0.57, sy - bh - ppu * 0.18, bw * 1.14, ppu * 0.2);
    ctx.fillStyle = city.online ? "rgba(255,219,126,.72)" : "rgba(150,164,166,.36)";
    const windowSize = Math.max(2, ppu * 0.12);
    for (let wy = sy - bh + ppu * 0.45; wy < sy - ppu * 0.35; wy += ppu * 0.55) {
      ctx.fillRect(sx - bw * 0.24, wy, windowSize, windowSize);
      ctx.fillRect(sx + bw * 0.13, wy, windowSize, windowSize);
    }
  });

  const signY = worldToScreenY(surfaceHeight(centerX) - 5.8, cameraY, ppu, height);
  const label = String(city.ownerName || "MINER").toUpperCase() + " CITY";
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(17,22,22,.84)";
  ctx.fillRect(centerScreenX - textWidth / 2 - 9, signY - 14, textWidth + 18, 23);
  ctx.strokeStyle = city.online ? "rgba(91,217,143,.65)" : "rgba(173,157,122,.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(centerScreenX - textWidth / 2 - 9, signY - 14, textWidth + 18, 23);
  ctx.fillStyle = "#e5dcc7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centerScreenX, signY - 2);
  ctx.restore();
}

function drawRemoteMiner(ctx, remote, cameraX, cameraY, ppu, width, height, light, sunAngle, changes) {
  if (!remote || !Number.isFinite(Number(remote.x)) || !Number.isFinite(Number(remote.y))) return;
  const rx = Number(remote.x);
  const ry = Number(remote.y);
  const depth = ry - surfaceHeight(rx);
  if (depth > 1.2 && isSolidAt(rx, ry, changes)) return;
  const sx = worldToScreenX(rx, cameraX, ppu, width);
  const sy = worldToScreenY(ry, cameraY, ppu, height);
  if (sx < -80 || sx > width + 80 || sy < -100 || sy > height + 100) return;

  ctx.save();
  ctx.globalAlpha = 0.9;
  drawMiner(ctx, sx, sy, 1, false, ppu * 0.9, light, sunAngle);
  const label = String(remote.name || "Miner").slice(0, 22);
  ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(10,17,19,.82)";
  ctx.fillRect(sx - tw / 2 - 6, sy - 58, tw + 12, 18);
  ctx.fillStyle = "#bfe8d0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, sx, sy - 49);
  ctx.restore();
}

function drawZombie(ctx, zombie, cameraX, cameraY, ppu, width, height, light) {
  const sx = worldToScreenX(zombie.x, cameraX, ppu, width);
  const sy = worldToScreenY(zombie.y, cameraY, ppu, height);
  if (sx < -70 || sx > width + 70 || sy < -80 || sy > height + 80) return;
  const scale = clamp(ppu / 48, 0.82, 1.18);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 20, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light < 0.35 ? "#436a45" : "#5b7f55";
  ctx.fillRect(-10, -6, 20, 22);
  ctx.fillStyle = "#6f8f63";
  ctx.beginPath(); ctx.arc(0, -14, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff5148";
  ctx.fillRect(-5, -17, 3, 2); ctx.fillRect(3, -17, 3, 2);
  ctx.strokeStyle = "#4c382f"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-18, 8); ctx.moveTo(9, 0); ctx.lineTo(18, 8); ctx.stroke();
  ctx.strokeStyle = "#313638";
  ctx.beginPath(); ctx.moveTo(-5, 15); ctx.lineTo(-8, 24); ctx.moveTo(5, 15); ctx.lineTo(8, 24); ctx.stroke();
  const ratio = clamp(zombie.hp / zombie.maxHp, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(-15, -31, 30, 4);
  ctx.fillStyle = ratio > 0.5 ? "#63d17d" : "#d66b58"; ctx.fillRect(-15, -31, 30 * ratio, 4);
  ctx.restore();
}

export default function InfiniteWorld(props) {
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const playerRef = useRef({
    x: Number.isFinite(props.player.x) ? props.player.x : 0,
    y: Number.isFinite(props.player.y) ? props.player.y : surfaceHeight(0) - 0.38,
  });
  const velocityRef = useRef({ x: 0, y: 0 });
  const moveRef = useRef({ x: 0, y: 0 });
  const aimRef = useRef({ x: 0, y: 1 });
  const keysRef = useRef({});
  const pointerRef = useRef(null);
  const facingRef = useRef(1);
  const groundedRef = useRef(false);
  const changesRef = useRef(normalizeWorldChanges(props.worldChanges));
  const positionCbRef = useRef(props.onPosition);
  const drillCbRef = useRef(props.onDrill);
  const pausedRef = useRef(props.paused);
  const drillTimerRef = useRef(null);
  const freshCutsRef = useRef([]);
  const lastReportRef = useRef(0);
  const [joystick, setJoystick] = useState({ visible: false, x: 0, y: 0, dx: 0, dy: 0 });
  const hudRef = useRef({ chunkX: 0, chunkY: 0, depth: 0, time: "DAY" });
  const [hud, setHud] = useState(hudRef.current);
  const drillRadiusRef = useRef(props.drillRadius || 0.78);
  const mouseAimRef = useRef(false);
  const playerScreenRef = useRef({ x: 0, y: 0 });
  const citiesRef = useRef(Array.isArray(props.cities) ? props.cities : []);
  const remotePlayersRef = useRef(Array.isArray(props.remotePlayers) ? props.remotePlayers : []);
  const myUserIdRef = useRef(props.myUserId || "");
  const playerAttackCbRef = useRef(props.onPlayerAttack);
  const zombieDamageCbRef = useRef(props.onZombieDamage);
  const zombieKillCbRef = useRef(props.onZombieKill);
  const swordDamageRef = useRef(Number(props.swordDamage) || 14);
  const zombiesRef = useRef([]);
  const lastZombieSpawnRef = useRef(0);
  const lastZombieBiteRef = useRef(0);
  const swordSwingRef = useRef(0);

  useEffect(() => { changesRef.current = normalizeWorldChanges(props.worldChanges); }, [props.worldChanges]);
  useEffect(() => { positionCbRef.current = props.onPosition; }, [props.onPosition]);
  useEffect(() => { drillCbRef.current = props.onDrill; }, [props.onDrill]);
  useEffect(() => { pausedRef.current = props.paused; }, [props.paused]);
  useEffect(() => { drillRadiusRef.current = props.drillRadius || 0.78; }, [props.drillRadius]);
  useEffect(() => { citiesRef.current = Array.isArray(props.cities) ? props.cities : []; }, [props.cities]);
  useEffect(() => { remotePlayersRef.current = Array.isArray(props.remotePlayers) ? props.remotePlayers : []; }, [props.remotePlayers]);
  useEffect(() => { myUserIdRef.current = props.myUserId || ""; }, [props.myUserId]);
  useEffect(() => { playerAttackCbRef.current = props.onPlayerAttack; }, [props.onPlayerAttack]);
  useEffect(() => { zombieDamageCbRef.current = props.onZombieDamage; }, [props.onZombieDamage]);
  useEffect(() => { zombieKillCbRef.current = props.onZombieKill; }, [props.onZombieKill]);
  useEffect(() => { swordDamageRef.current = Number(props.swordDamage) || 14; }, [props.swordDamage]);

  useEffect(() => {
    if (Number.isFinite(props.player.x) && Number.isFinite(props.player.y)) {
      const p = playerRef.current;
      if (Math.abs(p.x - props.player.x) > 0.8 || Math.abs(p.y - props.player.y) > 0.8) {
        playerRef.current = { x: props.player.x, y: props.player.y };
        velocityRef.current = { x: 0, y: 0 };
      }
    }
  }, [props.player.x, props.player.y]);

  useEffect(() => {
    if (!Number.isFinite(props.player.x) || !Number.isFinite(props.player.y)) return;
    playerRef.current = { x: props.player.x, y: props.player.y };
    velocityRef.current = { x: 0, y: 0 };
    moveRef.current = { x: 0, y: 0 };
    aimRef.current = { x: 0, y: 1 };
    pointerRef.current = null;
    groundedRef.current = false;
    facingRef.current = 1;
    mouseAimRef.current = false;
    lastReportRef.current = 0;
    setJoystick({ visible: false, x: 0, y: 0, dx: 0, dy: 0 });
    const spawnChunk = chunkFor(props.player.x, props.player.y);
    const nextHud = { chunkX: spawnChunk.x, chunkY: spawnChunk.y, depth: 0, time: "DAY" };
    hudRef.current = nextHud;
    setHud(nextHud);
  }, [props.resetKey]);

  useEffect(() => {
    function down(event) {
      keysRef.current[event.key.toLowerCase()] = true;
      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        fireDrill();
        if (!drillTimerRef.current) drillTimerRef.current = setInterval(fireDrill, 180);
      } else if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        fireDrill();
      } else if (event.code === "KeyF" && !event.repeat) {
        event.preventDefault();
        swingSword();
      }
    }
    function up(event) {
      keysRef.current[event.key.toLowerCase()] = false;
      if (event.code === "KeyE" && drillTimerRef.current) {
        clearInterval(drillTimerRef.current);
        drillTimerRef.current = null;
      }
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function swingSword(event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (pausedRef.current) return;
    swordSwingRef.current = performance.now();
    const p = playerRef.current;
    let bestZombie = null;
    let bestZombieDistance = Infinity;
    for (const zombie of zombiesRef.current) {
      const dx = zombie.x - p.x;
      const dy = zombie.y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 2.35 && distance < bestZombieDistance) { bestZombie = zombie; bestZombieDistance = distance; }
    }
    if (bestZombie) {
      bestZombie.hp -= Math.max(1, Number(swordDamageRef.current) || 14);
      if (bestZombie.hp <= 0) {
        zombiesRef.current = zombiesRef.current.filter((zombie) => zombie.id !== bestZombie.id);
        if (zombieKillCbRef.current) zombieKillCbRef.current(bestZombie);
      }
      return;
    }
    let bestPlayer = null;
    let bestDistance = Infinity;
    for (const remote of remotePlayersRef.current) {
      if (!remote || remote.id === myUserIdRef.current) continue;
      const dx = Number(remote.x) - p.x;
      const dy = Number(remote.y) - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 2.45 && distance < bestDistance) { bestPlayer = remote; bestDistance = distance; }
    }
    if (bestPlayer && playerAttackCbRef.current) playerAttackCbRef.current(bestPlayer.id);
  }

  function fireDrill() {
    if (pausedRef.current || !drillCbRef.current) return;
    const p = playerRef.current;
    let aim = aimRef.current;
    const liveMove = moveRef.current;
    const liveMagnitude = Math.sqrt(liveMove.x * liveMove.x + liveMove.y * liveMove.y);
    const surfaceDepth = p.y - surfaceHeight(p.x);
    if (!mouseAimRef.current && surfaceDepth < 0.9 && liveMagnitude < 0.2) {
      aim = { x: 0, y: 1 };
    }
    const radius = drillRadiusRef.current;
    const target = resolveDrillTarget(p, aim, radius, changesRef.current);
    if (!target.hit) return;

    freshCutsRef.current.push({ x: target.x, y: target.y, r: radius, shape: "square", born: performance.now() });
    if (freshCutsRef.current.length > 18) freshCutsRef.current.splice(0, freshCutsRef.current.length - 18);

    drillCbRef.current({
      x: target.x,
      y: target.y,
      radius,
      shape: "square",
      aimX: target.ax,
      aimY: target.ay,
    });
  }

  function returnToSurface(event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const p = playerRef.current;
    p.y = surfaceHeight(p.x) - 0.42;
    velocityRef.current = { x: 0, y: 0 };
    groundedRef.current = false;
    moveRef.current = { x: 0, y: 0 };
    if (positionCbRef.current) {
      positionCbRef.current({ x: p.x, y: p.y });
    }
  }

  function startDrilling(event) {
    event.stopPropagation();
    event.preventDefault();
    fireDrill();
    if (drillTimerRef.current) clearInterval(drillTimerRef.current);
    drillTimerRef.current = setInterval(fireDrill, 180);
  }

  function stopDrilling(event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (drillTimerRef.current) {
      clearInterval(drillTimerRef.current);
      drillTimerRef.current = null;
    }
  }

  useEffect(() => () => stopDrilling(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return undefined;

    const groundCanvas = document.createElement("canvas");
    const groundCtx = groundCanvas.getContext("2d");
    const ctx = canvas.getContext("2d");
    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let previous = performance.now();

    function resize() {
      const rect = viewport.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      groundCanvas.width = Math.floor(width * dpr);
      groundCanvas.height = Math.floor(height * dpr);

      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
    }

    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(viewport);
    window.addEventListener("resize", resize);

    function frame(now) {
      const dt = clamp((now - previous) / 1000, 0, 0.045);
      previous = now;
      const changes = changesRef.current;
      freshCutsRef.current = freshCutsRef.current.filter((cut) => now - cut.born < 900);
      const p = playerRef.current;
      const v = velocityRef.current;
      const keys = keysRef.current;

      let inputX = moveRef.current.x;
      let inputY = moveRef.current.y;
      const keyX = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
      const keyY = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      if (keyX || keyY) {
        const m = Math.sqrt(keyX * keyX + keyY * keyY) || 1;
        inputX = keyX / m;
        inputY = keyY / m;
        if (!mouseAimRef.current) aimRef.current = { x: inputX, y: inputY };
      }

      if (!pausedRef.current) {
        const surface = surfaceHeight(p.x);
        const depth = p.y - surface;
        const underground = depth > 0.65;

        const targetSpeed = inputX * (underground ? 3.2 : 4.5);
        v.x += (targetSpeed - v.x) * Math.min(1, dt * 10);

        if (inputX < -0.08) facingRef.current = -1;
        else if (inputX > 0.08) facingRef.current = 1;

        if (inputY < -0.42 && groundedRef.current) {
          v.y = -6.3;
          groundedRef.current = false;
        }
        v.y += 12.5 * dt;

        v.x = clamp(v.x, -4.8, 4.8);
        v.y = clamp(v.y, -7.5, 8.5);

        const nx = p.x + v.x * dt;
        if (!collides(nx, p.y, changes)) {
          p.x = nx;
        } else {
          let stepped = false;
          if (Math.abs(v.x) > 0.08 && depth < 1.35) {
            for (let step = 0.1; step <= 0.6; step += 0.1) {
              if (!collides(p.x, p.y - step, changes) && !collides(nx, p.y - step, changes)) {
                p.y -= step;
                p.x = nx;
                stepped = true;
                break;
              }
            }
          }
          if (!stepped) v.x = 0;
        }

        const ny = p.y + v.y * dt;
        if (!collides(p.x, ny, changes)) {
          p.y = ny;
          groundedRef.current = false;
        } else {
          if (v.y > 0) groundedRef.current = true;
          v.y = 0;
        }

        // Keep a fresh save position without React rerendering every animation frame.
        if (now - lastReportRef.current > 120) {
          lastReportRef.current = now;
          if (positionCbRef.current) positionCbRef.current({ x: p.x, y: p.y });
        }
      }

      const ppu = width < 560 ? 40 : 48;
      const playerSurface = surfaceHeight(p.x);
      const depth = p.y - playerSurface;

      // Camera keeps generous sky visible near the surface and follows underground.
      const cameraX = p.x;
      const surfaceCameraY = playerSurface - Math.min(2.6, height / ppu * 0.16);
      const cameraY = depth < 4.5 ? surfaceCameraY + depth * 0.32 : p.y - 0.5;
      const minWorldX = cameraX - width / (2 * ppu) - 2;
      const maxWorldX = cameraX + width / (2 * ppu) + 2;
      const minWorldY = cameraY - height / (2 * ppu) - 2;
      const maxWorldY = cameraY + height / (2 * ppu) + 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      groundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      groundCtx.clearRect(0, 0, width, height);

      const day = drawSky(ctx, width, height, cameraX, now);

      // Night survival: surface zombies spawn around the active miner and chase them until sunrise.
      const nearSurface = depth < 1.4;
      if (day.light < 0.27 && nearSurface && !pausedRef.current) {
        if (now - lastZombieSpawnRef.current > 2400 && zombiesRef.current.length < 6) {
          lastZombieSpawnRef.current = now;
          const side = visualNoise(Math.floor(now / 2400), Math.floor(p.x), 1201) > 0.5 ? 1 : -1;
          let zx = p.x + side * (6.5 + visualNoise(Math.floor(now / 1700), 0, 1202) * 5.5);
          let attempts = 0;
          while (citiesRef.current.some((city) => Math.abs(Number(city.x) - zx) < 9) && attempts < 4) { zx += side * 5; attempts += 1; }
          zombiesRef.current.push({ id: "z_" + now + "_" + Math.random().toString(36).slice(2, 7), x: zx, y: surfaceHeight(zx) - 0.38, hp: 35, maxHp: 35 });
        }
        for (const zombie of zombiesRef.current) {
          const direction = p.x < zombie.x ? -1 : 1;
          zombie.x += direction * 1.15 * dt;
          zombie.y = surfaceHeight(zombie.x) - 0.38;
          const dx = zombie.x - p.x;
          const dy = zombie.y - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < 0.72 && now - lastZombieBiteRef.current > 950) {
            lastZombieBiteRef.current = now;
            if (zombieDamageCbRef.current) zombieDamageCbRef.current(7);
          }
        }
      } else if (day.light > 0.42) {
        zombiesRef.current = [];
      }

      // Distant hills above the true terrain give the surface more depth.
      ctx.save();
      ctx.globalAlpha = 0.28 + day.light * 0.22;
      ctx.fillStyle = colorMix("#415841", "#789966", day.light);
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let sx = 0; sx <= width + 16; sx += 16) {
        const wx = cameraX + (sx - width / 2) / ppu * 0.6;
        const sy = height * 0.42 + (surfaceHeight(wx * 0.65) - 3.8) * 12;
        ctx.lineTo(sx, sy);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Dark subsurface background is what circular excavations reveal.
      const caveGrad = ctx.createLinearGradient(0, 0, 0, height);
      caveGrad.addColorStop(0, "rgba(4,4,5,.98)");
      caveGrad.addColorStop(0.35, "rgba(1,2,3,.995)");
      caveGrad.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = caveGrad;
      surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0.1);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Continuous geological layers.
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0, 0.24, "#678f3e", "#496d31");
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0.24, 5.5, "#735334", "#5d4029");
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 5.5, 13, "#5c412e", "#493428");
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 13, 22, "#4e4033", "#3f352c");
      const deepestNeeded = Math.max(
        90,
        maxWorldY - Math.min(surfaceHeight(minWorldX), surfaceHeight(maxWorldX)) + 24
      );
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 22, deepestNeeded, "#50514e", "#303230");

      drawGroundTexture(groundCtx, minWorldX, minWorldY, maxWorldX, maxWorldY, cameraX, cameraY, ppu, width, height);

      const changesNow = normalizeWorldChanges(changes);
      const deposits = oreDepositsNear(minWorldX, minWorldY, maxWorldX, maxWorldY);
      for (const deposit of deposits) {
        if (!changesNow.mined[deposit.id]) {
          drawOreDeposit(groundCtx, deposit, cameraX, cameraY, ppu, width, height, day.light);
        }
      }

      drawGrass(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height);

      // Organic circular mining: subtract actual circles from the terrain layer.
      const visibleCuts = cutsNear(changesNow, minWorldX - 2, minWorldY - 2, maxWorldX + 2, maxWorldY + 2);
      groundCtx.save();
      groundCtx.globalCompositeOperation = "destination-out";
      for (const cut of visibleCuts) {
        const sx = worldToScreenX(cut.x, cameraX, ppu, width);
        const sy = worldToScreenY(cut.y, cameraY, ppu, height);
        let radius = cut.r * ppu;
        const fresh = freshCutsRef.current.find((f) => Math.abs(f.x - cut.x) < 0.12 && Math.abs(f.y - cut.y) < 0.12);
        if (fresh) { const age = now - fresh.born; const growth = clamp(age / 320, 0.12, 1); radius *= 1 - Math.pow(1 - growth, 3); }
        if (cut.shape === "square") {
          groundCtx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
        } else {
          groundCtx.beginPath();
          groundCtx.arc(sx, sy, radius, 0, Math.PI * 2);
          groundCtx.fill();
        }
      }
      groundCtx.restore();

      ctx.drawImage(groundCanvas, 0, 0, width, height);

      // Sunlight affects the actual ground, not only the sky. At night the
      // surface cools toward blue; at golden hour it picks up warm low-angle light.
      surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      if (day.light < 0.96) {
        ctx.fillStyle = "rgba(11,20,34," + ((1 - day.light) * 0.48) + ")";
        ctx.fill();
      }
      if (day.sunset > 0.04) {
        surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = "rgba(238,137,72," + (day.sunset * 0.11) + ")";
        ctx.fill();
      }

      // Clip every black excavation effect below the terrain surface so sky/grass never gets black overlays.
      ctx.save();
      surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0.02);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.clip();

      // Excavation rims are intentionally very dark underground.
      for (const cut of visibleCuts) {
        const sx = worldToScreenX(cut.x, cameraX, ppu, width);
        const sy = worldToScreenY(cut.y, cameraY, ppu, height);
        const radius = cut.r * ppu;
        if (cut.shape === "square") {
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,.78)";
          ctx.shadowColor = "rgba(0,0,0,.98)";
          ctx.shadowBlur = Math.max(8, radius * 0.28);
          ctx.fillRect(sx - radius * 1.05, sy - radius * 1.05, radius * 2.1, radius * 2.1);
          ctx.restore();
        } else {
          const rim = ctx.createRadialGradient(sx, sy, radius * 0.76, sx, sy, radius * 1.08);
          rim.addColorStop(0, "rgba(0,0,0,.92)");
          rim.addColorStop(0.68, "rgba(0,0,0,.72)");
          rim.addColorStop(0.9, "rgba(9,6,4,.34)");
          rim.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = rim;
          ctx.beginPath();
          ctx.arc(sx, sy, radius * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Auto-build timber bridges over large surface excavations so travel routes remain passable.
      for (const bridge of visibleSurfaceBridges(changesNow, minWorldX, maxWorldX)) {
        drawSurfaceBridge(ctx, bridge, cameraX, cameraY, ppu, width, height);
      }

      for (const city of citiesRef.current) {
        drawWorldCity(ctx, city, cameraX, cameraY, ppu, width, height, day.light);
      }
      for (const zombie of zombiesRef.current) {
        drawZombie(ctx, zombie, cameraX, cameraY, ppu, width, height, day.light);
      }

      for (const remote of remotePlayersRef.current) {
        if (remote.id !== myUserIdRef.current) {
          drawRemoteMiner(ctx, remote, cameraX, cameraY, ppu, width, height, day.light, day.angle, changesNow);
        }
      }

      const playerScreenX = width / 2;
      const playerScreenY = worldToScreenY(p.y, cameraY, ppu, height);
      playerScreenRef.current = { x: playerScreenX, y: playerScreenY };

      let previewAim = aimRef.current;
      const previewMoveMagnitude = Math.sqrt(moveRef.current.x * moveRef.current.x + moveRef.current.y * moveRef.current.y);
      if (!mouseAimRef.current && depth < 0.9 && previewMoveMagnitude < 0.2) previewAim = { x: 0, y: 1 };
      const previewTarget = resolveDrillTarget(p, previewAim, drillRadiusRef.current, changesNow);
      const reticleX = worldToScreenX(previewTarget.x, cameraX, ppu, width);
      const reticleY = worldToScreenY(previewTarget.y, cameraY, ppu, height);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = previewTarget.hit
        ? (depth < 1 ? "rgba(255,248,218,.68)" : "rgba(255,224,155,.58)")
        : "rgba(164,177,177,.27)";
      ctx.lineWidth = previewTarget.hit ? 1.7 : 1.2;
      const reticleRadius = drillRadiusRef.current * ppu;
      ctx.strokeRect(reticleX - reticleRadius, reticleY - reticleRadius, reticleRadius * 2, reticleRadius * 2);
      ctx.restore();

      const moving = Math.abs(v.x) > 0.12 || Math.abs(v.y) > 0.3;
      drawMiner(ctx, playerScreenX, playerScreenY, facingRef.current, moving, ppu, day.light, day.angle);
      if (now - swordSwingRef.current < 230) {
        const progress = clamp((now - swordSwingRef.current) / 230, 0, 1);
        ctx.save();
        ctx.strokeStyle = "rgba(225,235,238," + (0.9 - progress * 0.5) + ")";
        ctx.lineWidth = 4;
        ctx.beginPath();
        const direction = facingRef.current < 0 ? -1 : 1;
        ctx.arc(playerScreenX, playerScreenY - 8, 32, direction < 0 ? Math.PI * 0.75 : -Math.PI * 0.25, direction < 0 ? Math.PI * 1.35 : Math.PI * 0.35);
        ctx.stroke();
        ctx.restore();
      }

      drawLighting(ctx, width, height, playerScreenX, playerScreenY, depth, day.light);

      const chunk = chunkFor(p.x, p.y);
      const nextHud = {
        chunkX: chunk.x,
        chunkY: chunk.y,
        depth: Math.max(0, depth),
        time: day.light > 0.72 ? "DAY" : day.light > 0.28 ? "GOLDEN HOUR" : "NIGHT",
      };
      const previousHud = hudRef.current;
      if (
        nextHud.chunkX !== previousHud.chunkX ||
        nextHud.chunkY !== previousHud.chunkY ||
        Math.abs(nextHud.depth - previousHud.depth) > 0.5 ||
        nextHud.time !== previousHud.time
      ) {
        hudRef.current = nextHud;
        setHud(nextHud);
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  function setMouseAim(event) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const playerScreen = playerScreenRef.current;
    const dx = event.clientX - rect.left - playerScreen.x;
    const dy = event.clientY - rect.top - playerScreen.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 5) {
      aimRef.current = { x: dx / magnitude, y: dy / magnitude };
      mouseAimRef.current = true;
    }
  }

  function startStick(event) {
    if (props.paused) return;
    if (event.pointerType === "mouse") {
      if (event.button !== 0) return;
      setMouseAim(event);
      event.preventDefault();
      return;
    }
    const rect = viewportRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { id: event.pointerId, x, y };
    moveRef.current = { x: 0, y: 0 };
    setJoystick({ visible: true, x, y, dx: 0, dy: 0 });
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveStick(event) {
    if (event.pointerType === "mouse") {
      setMouseAim(event);
      return;
    }
    const active = pointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const rawX = event.clientX - rect.left - active.x;
    const rawY = event.clientY - rect.top - active.y;
    const max = 62;
    const length = Math.sqrt(rawX * rawX + rawY * rawY);
    const scale = length > max ? max / length : 1;
    const dx = rawX * scale;
    const dy = rawY * scale;
    const magnitude = Math.sqrt(dx * dx + dy * dy);

    moveRef.current = magnitude < 7 ? { x: 0, y: 0 } : { x: dx / max, y: dy / max };
    if (magnitude >= 7) aimRef.current = { x: dx / max, y: dy / max };
    setJoystick({ visible: true, x: active.x, y: active.y, dx, dy });
    event.preventDefault();
  }

  function endStick(event) {
    if (!pointerRef.current || pointerRef.current.id !== event.pointerId) return;
    pointerRef.current = null;
    moveRef.current = { x: 0, y: 0 };
    setJoystick((old) => ({ ...old, visible: false, dx: 0, dy: 0 }));
    event.preventDefault();
  }

  return (
    <div className="df-world-wrap">
      <div className="df-world-hud">
        <span>AREA {hud.chunkX},{hud.chunkY}</span>
        <b>{hud.depth < 0.7 ? "SURFACE" : Math.round(hud.depth) + " m DEEP"}</b>
        <small>{hud.time} · HP {Math.max(0, Math.round(Number(props.playerHp) || 0))}/{Math.max(1, Math.round(Number(props.playerMaxHp) || 100))}</small>
      </div>

      <div
        ref={viewportRef}
        className="df-world-viewport"
        onPointerDown={startStick}
        onPointerMove={moveStick}
        onPointerUp={endStick}
        onPointerCancel={endStick}
      >
        <canvas ref={canvasRef} className="df-world-canvas" />

        {joystick.visible && (
          <div className="df-floating-stick" style={{ left: joystick.x, top: joystick.y }}>
            <div
              className="df-floating-stick-knob"
              style={{ transform: "translate(" + joystick.dx + "px," + joystick.dy + "px)" }}
            />
          </div>
        )}

        {hud.depth >= 1.25 && (
          <button
            className="df-surface-action"
            onPointerDown={returnToSurface}
            aria-label="Return to surface for free"
          >
            <span>↑</span>
            <b>SURFACE</b>
            <small>FREE</small>
          </button>
        )}

        <button
          className="df-drill-action"
          onPointerDown={startDrilling}
          onPointerUp={stopDrilling}
          onPointerCancel={stopDrilling}
          onPointerLeave={stopDrilling}
          aria-label="Excavate square terrain"
        >
          <span>⛏</span>
          <b>DIG</b>
        </button>

        <button
          onPointerDown={swingSword}
          aria-label="Swing sword"
          style={{position:"absolute",right:92,bottom:14,zIndex:8,minWidth:66,height:48,border:"1px solid rgba(225,235,238,.22)",borderRadius:12,background:"rgba(24,30,32,.9)",color:"#e6ecee",fontWeight:900,cursor:"pointer",touchAction:"none"}}
        >
          <span style={{display:"block",fontSize:18}}>⚔</span>
          <b style={{fontSize:9}}>SWORD</b>
        </button>

        <div className="df-world-tip">WASD moves · mouse aims · hold E or DIG · F sword · touch: drag to move</div>
      </div>
    </div>
  );
}
