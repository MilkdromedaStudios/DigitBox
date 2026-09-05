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
  const phase = ((now % DAY_MS) / DAY_MS + 0.18) % 1;
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
  return samples.some(([ox, oy]) => isSolidAt(x + ox, y + oy, changes));
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
  const darkness = underground * (0.72 - dayLight * 0.12);
  if (darkness <= 0.01) return;

  const overlay = document.createElement("canvas");
  overlay.width = Math.max(1, Math.floor(width));
  overlay.height = Math.max(1, Math.floor(height));
  const octx = overlay.getContext("2d");
  octx.fillStyle = "rgba(3,5,5," + darkness + ")";
  octx.fillRect(0, 0, width, height);

  octx.globalCompositeOperation = "destination-out";
  const lampRadius = 115 + underground * 55;
  const lamp = octx.createRadialGradient(playerScreenX, playerScreenY - 8, 18, playerScreenX, playerScreenY - 8, lampRadius);
  lamp.addColorStop(0, "rgba(0,0,0,.95)");
  lamp.addColorStop(0.32, "rgba(0,0,0,.72)");
  lamp.addColorStop(1, "rgba(0,0,0,0)");
  octx.fillStyle = lamp;
  octx.beginPath();
  octx.arc(playerScreenX, playerScreenY - 8, lampRadius, 0, Math.PI * 2);
  octx.fill();

  ctx.drawImage(overlay, 0, 0, width, height);

  if (underground > 0.12) {
    const glow = ctx.createRadialGradient(playerScreenX + 8, playerScreenY - 20, 0, playerScreenX + 8, playerScreenY - 20, 48);
    glow.addColorStop(0, "rgba(255,229,150,.2)");
    glow.addColorStop(1, "rgba(255,205,105,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(playerScreenX + 8, playerScreenY - 20, 48, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const lastReportRef = useRef(0);
  const [joystick, setJoystick] = useState({ visible: false, x: 0, y: 0, dx: 0, dy: 0 });
  const [hud, setHud] = useState({ chunkX: 0, chunkY: 0, depth: 0, time: "DAY" });

  useEffect(() => { changesRef.current = normalizeWorldChanges(props.worldChanges); }, [props.worldChanges]);
  useEffect(() => { positionCbRef.current = props.onPosition; }, [props.onPosition]);
  useEffect(() => { drillCbRef.current = props.onDrill; }, [props.onDrill]);
  useEffect(() => { pausedRef.current = props.paused; }, [props.paused]);

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
    function down(event) {
      keysRef.current[event.key.toLowerCase()] = true;
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        fireDrill();
      }
    }
    function up(event) {
      keysRef.current[event.key.toLowerCase()] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function fireDrill() {
    if (pausedRef.current || !drillCbRef.current) return;
    const p = playerRef.current;
    let aim = aimRef.current;
    const magnitude = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
    if (magnitude < 0.2) aim = { x: 0, y: 1 };
    const normalized = Math.sqrt(aim.x * aim.x + aim.y * aim.y) || 1;
    const ax = aim.x / normalized;
    const ay = aim.y / normalized;
    const distance = 0.86 + (props.drillRadius || 0.78) * 0.38;

    drillCbRef.current({
      x: p.x + ax * distance,
      y: p.y + ay * distance,
      radius: props.drillRadius || 0.78,
      aimX: ax,
      aimY: ay,
    });
  }

  function startDrilling(event) {
    event.stopPropagation();
    event.preventDefault();
    fireDrill();
    if (drillTimerRef.current) clearInterval(drillTimerRef.current);
    drillTimerRef.current = setInterval(fireDrill, 260);
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
        aimRef.current = { x: inputX, y: inputY };
      }

      if (!pausedRef.current) {
        const surface = surfaceHeight(p.x);
        const depth = p.y - surface;
        const underground = depth > 0.65;

        const targetSpeed = inputX * (underground ? 3.2 : 4.5);
        v.x += (targetSpeed - v.x) * Math.min(1, dt * 10);

        if (inputX < -0.08) facingRef.current = -1;
        else if (inputX > 0.08) facingRef.current = 1;

        if (underground && !collides(p.x, p.y, changes)) {
          // In excavated shafts/tunnels the joystick can climb/swim through the
          // cavity slowly, keeping touch controls usable without ladders yet.
          v.y += inputY * 13 * dt;
          v.y *= Math.pow(0.9, dt * 30);
          v.y += 4.8 * dt;
        } else {
          if (inputY < -0.42 && groundedRef.current) {
            v.y = -6.3;
            groundedRef.current = false;
          }
          v.y += 12.5 * dt;
        }

        v.x = clamp(v.x, -4.8, 4.8);
        v.y = clamp(v.y, -7.5, 8.5);

        const nx = p.x + v.x * dt;
        if (!collides(nx, p.y, changes)) {
          p.x = nx;
        } else {
          v.x = 0;
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
      caveGrad.addColorStop(0, "rgba(59,47,37,.72)");
      caveGrad.addColorStop(1, "rgba(19,20,19,.98)");
      ctx.fillStyle = caveGrad;
      surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0.1);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Continuous geological layers.
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0, 5.5, "#735334", "#5d4029");
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 5.5, 13, "#5c412e", "#493428");
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 13, 22, "#4e4033", "#3f352c");
      fillLayer(groundCtx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 22, 200, "#50514e", "#303230");

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
        const radius = cut.r * ppu;
        groundCtx.beginPath();
        groundCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        groundCtx.fill();
      }
      groundCtx.restore();

      ctx.drawImage(groundCanvas, 0, 0, width, height);

      // Excavation rims receive soft occlusion shadows rather than block outlines.
      for (const cut of visibleCuts) {
        const sx = worldToScreenX(cut.x, cameraX, ppu, width);
        const sy = worldToScreenY(cut.y, cameraY, ppu, height);
        const radius = cut.r * ppu;
        const rim = ctx.createRadialGradient(sx, sy, radius * 0.76, sx, sy, radius * 1.08);
        rim.addColorStop(0, "rgba(0,0,0,0)");
        rim.addColorStop(0.82, "rgba(18,14,11,.12)");
        rim.addColorStop(1, "rgba(18,14,11,0)");
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      const playerScreenX = width / 2;
      const playerScreenY = worldToScreenY(p.y, cameraY, ppu, height);
      const moving = Math.abs(v.x) > 0.12 || Math.abs(v.y) > 0.3;
      drawMiner(ctx, playerScreenX, playerScreenY, facingRef.current, moving, ppu, day.light, day.angle);

      drawLighting(ctx, width, height, playerScreenX, playerScreenY, depth, day.light);

      const chunk = chunkFor(p.x, p.y);
      const nextHud = {
        chunkX: chunk.x,
        chunkY: chunk.y,
        depth: Math.max(0, depth),
        time: day.light > 0.72 ? "DAY" : day.light > 0.28 ? "GOLDEN HOUR" : "NIGHT",
      };
      if (
        nextHud.chunkX !== hud.chunkX ||
        nextHud.chunkY !== hud.chunkY ||
        Math.abs(nextHud.depth - hud.depth) > 0.5 ||
        nextHud.time !== hud.time
      ) {
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

  function startStick(event) {
    if (props.paused) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
        <small>{hud.time}</small>
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

        <button
          className="df-drill-action"
          onPointerDown={startDrilling}
          onPointerUp={stopDrilling}
          onPointerCancel={stopDrilling}
          onPointerLeave={stopDrilling}
          aria-label="Excavate circular terrain"
        >
          <span>⛏</span>
          <b>DIG</b>
        </button>

        <div className="df-world-tip">Drag anywhere to move · hold DIG to carve round tunnels</div>
      </div>
    </div>
  );
}
