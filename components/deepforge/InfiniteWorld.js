import { useEffect, useRef, useState } from "react";
import { CHUNK_SIZE, chunkFor, getWorldTile, tileKey } from "./world";

const BASE = {
  dirt: "#684b32",
  dry: "#78583a",
  grass: "#566a3f",
  sand: "#a4865b",
  gravel: "#5e5b54",
  stone: "#4d5050",
  water: "#4f7180",
};

function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return "#" + [r, g, b].map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
}

function visualNoise(x, y, salt) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 91.7) * 43758.5453123;
  return n - Math.floor(n);
}

function rockPath(ctx, cx, cy, rx, ry, tx, ty, salt) {
  const points = 10;
  for (let i = 0; i < points; i += 1) {
    const angle = (Math.PI * 2 * i) / points;
    const jitter = 0.78 + visualNoise(tx + i, ty - i, salt + i) * 0.28;
    const px = cx + Math.cos(angle) * rx * jitter;
    const py = cy + Math.sin(angle) * ry * jitter;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawVein(ctx, points, width, dark, light) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = dark;
  ctx.lineWidth = width + 2;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
  ctx.strokeStyle = light;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

function drawGround(ctx, tile, x, y, size, change) {
  const base = BASE[tile.biome] || BASE.dirt;
  const shift = Math.round((tile.shade - 0.5) * 20);
  ctx.fillStyle = tint(base, shift);
  ctx.fillRect(x, y, size + 1, size + 1);

  // Dirt texture: subtle speckles and embedded pebbles rather than a futuristic grid.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = tile.speckle > 0.5 ? "#2d2118" : "#b2875e";
  ctx.beginPath();
  ctx.arc(x + size * (0.18 + tile.speckle * 0.46), y + size * (0.22 + tile.pebble * 0.5), Math.max(1, size * 0.035), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (tile.biome === "grass") {
    ctx.strokeStyle = "rgba(48,76,39,.75)";
    ctx.lineWidth = Math.max(1, size * 0.026);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.28, y + size * 0.72);
    ctx.lineTo(x + size * 0.25, y + size * 0.57);
    ctx.moveTo(x + size * 0.32, y + size * 0.72);
    ctx.lineTo(x + size * 0.37, y + size * 0.55);
    ctx.stroke();
  }

  if (tile.biome === "gravel" || tile.biome === "stone") {
    ctx.fillStyle = "rgba(35,35,33,.35)";
    ctx.beginPath();
    ctx.ellipse(x + size * 0.72, y + size * 0.32, size * 0.11, size * 0.07, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (tile.biome === "water") {
    ctx.strokeStyle = "rgba(210,235,235,.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.12, y + size * 0.42);
    ctx.lineTo(x + size * 0.72, y + size * 0.42);
    ctx.stroke();
  }

  if (change && change.mined) {
    ctx.fillStyle = "rgba(37,25,17,.38)";
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y + size / 2, size * 0.27, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,15,11,.28)";
    ctx.stroke();
  }
}

function drawOre(ctx, tile, x, y, size, change, tx, ty) {
  if (!tile.resource || (change && change.mined)) return;
  const ore = tile.resource;
  const cx = x + size * 0.52;
  const cy = y + size * 0.52;
  const rx = size * (0.27 + visualNoise(tx, ty, 4) * 0.035);
  const ry = size * (0.22 + visualNoise(tx, ty, 7) * 0.035);

  // Soft contact shadow gives the rock weight against the soil.
  const shadow = ctx.createRadialGradient(cx, cy + size * 0.16, 2, cx, cy + size * 0.16, rx * 1.15);
  shadow.addColorStop(0, "rgba(0,0,0,.34)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.17, rx * 1.08, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Irregular host-rock body with directional light, not a flat game polygon.
  ctx.save();
  ctx.beginPath();
  rockPath(ctx, cx, cy, rx, ry, tx, ty, 13);
  ctx.clip();
  const rockGrad = ctx.createRadialGradient(cx - rx * 0.42, cy - ry * 0.55, 1, cx, cy, rx * 1.25);
  rockGrad.addColorStop(0, ore.hostLight);
  rockGrad.addColorStop(0.48, ore.hostMid);
  rockGrad.addColorStop(1, ore.hostDark);
  ctx.fillStyle = rockGrad;
  ctx.fillRect(cx - rx * 1.3, cy - ry * 1.3, rx * 2.6, ry * 2.6);

  // Faceted stone planes and granular inclusions.
  for (let i = 0; i < 5; i += 1) {
    const a = visualNoise(tx, ty, 20 + i) * Math.PI * 2;
    const px = cx + Math.cos(a) * rx * (0.15 + visualNoise(tx, ty, 30 + i) * 0.45);
    const py = cy + Math.sin(a) * ry * (0.15 + visualNoise(tx, ty, 40 + i) * 0.45);
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.06)";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + rx * 0.35, py - ry * 0.12);
    ctx.lineTo(px + rx * 0.08, py + ry * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < 10; i += 1) {
    const px = cx + (visualNoise(tx + i, ty, 70 + i) - 0.5) * rx * 1.45;
    const py = cy + (visualNoise(tx, ty + i, 80 + i) - 0.5) * ry * 1.35;
    const r = 0.6 + visualNoise(tx, ty, 90 + i) * 1.2;
    ctx.fillStyle = i % 3 === 0 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.14)";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (ore.material === "coal") {
    for (let i = 0; i < 4; i += 1) {
      const px = cx + (visualNoise(tx, ty, 120 + i) - 0.5) * rx;
      const py = cy + (visualNoise(tx, ty, 130 + i) - 0.5) * ry * 0.9;
      ctx.fillStyle = i % 2 ? ore.mineral : ore.mineral2;
      ctx.beginPath();
      ctx.moveTo(px - size * 0.08, py + size * 0.02);
      ctx.lineTo(px - size * 0.02, py - size * 0.09);
      ctx.lineTo(px + size * 0.09, py - size * 0.03);
      ctx.lineTo(px + size * 0.04, py + size * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(205,214,207,.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - size * 0.02, py - size * 0.07);
      ctx.lineTo(px + size * 0.06, py - size * 0.03);
      ctx.stroke();
    }
  } else if (ore.material === "copper") {
    drawVein(ctx, [
      [cx - rx * 0.65, cy + ry * 0.15],
      [cx - rx * 0.2, cy - ry * 0.12],
      [cx + rx * 0.08, cy + ry * 0.04],
      [cx + rx * 0.58, cy - ry * 0.28],
    ], Math.max(2.2, size * 0.055), "#653520", ore.mineral2);
    ctx.fillStyle = ore.highlight;
    for (let i = 0; i < 4; i += 1) {
      const px = cx + (visualNoise(tx, ty, 150 + i) - 0.5) * rx * 1.25;
      const py = cy + (visualNoise(tx, ty, 160 + i) - 0.5) * ry;
      ctx.beginPath(); ctx.arc(px, py, size * 0.018, 0, Math.PI * 2); ctx.fill();
    }
  } else if (ore.material === "iron") {
    ctx.strokeStyle = ore.mineral2;
    ctx.lineWidth = Math.max(3, size * 0.07);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(cx - rx * 0.05, cy, rx * 0.58, -1.2, 1.05);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ore.highlight;
    for (let i = 0; i < 5; i += 1) {
      const px = cx + (visualNoise(tx, ty, 180 + i) - 0.5) * rx * 1.1;
      const py = cy + (visualNoise(tx, ty, 190 + i) - 0.5) * ry * 1.1;
      ctx.beginPath(); ctx.arc(px, py, size * 0.018, 0, Math.PI * 2); ctx.fill();
    }
  } else if (ore.material === "silver") {
    drawVein(ctx, [
      [cx - rx * 0.55, cy - ry * 0.18],
      [cx - rx * 0.15, cy + ry * 0.05],
      [cx + rx * 0.22, cy - ry * 0.02],
      [cx + rx * 0.62, cy + ry * 0.22],
    ], Math.max(2, size * 0.045), "#555e5d", ore.mineral2);
    for (let i = 0; i < 4; i += 1) {
      const px = cx + (visualNoise(tx, ty, 210 + i) - 0.5) * rx * 1.2;
      const py = cy + (visualNoise(tx, ty, 220 + i) - 0.5) * ry * 1.1;
      const shine = ctx.createRadialGradient(px - 1, py - 1, 0, px, py, size * 0.04);
      shine.addColorStop(0, ore.highlight);
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.beginPath(); ctx.arc(px, py, size * 0.04, 0, Math.PI * 2); ctx.fill();
    }
  } else if (ore.material === "quartz") {
    for (let i = 0; i < 4; i += 1) {
      const px = cx + (i - 1.5) * size * 0.07;
      const baseY = cy + size * 0.13;
      const h = size * (0.16 + visualNoise(tx, ty, 240 + i) * 0.14);
      ctx.fillStyle = i % 2 ? "rgba(238,233,223,.8)" : "rgba(201,196,188,.76)";
      ctx.strokeStyle = "rgba(255,255,255,.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - size * 0.045, baseY);
      ctx.lineTo(px - size * 0.025, baseY - h * 0.72);
      ctx.lineTo(px, baseY - h);
      ctx.lineTo(px + size * 0.035, baseY - h * 0.7);
      ctx.lineTo(px + size * 0.05, baseY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  } else if (ore.material === "gold") {
    // Gold appears as sparse metallic inclusions in pale quartz, not a yellow boulder.
    drawVein(ctx, [
      [cx - rx * 0.58, cy + ry * 0.25],
      [cx - rx * 0.18, cy - ry * 0.1],
      [cx + rx * 0.22, cy + ry * 0.02],
      [cx + rx * 0.52, cy - ry * 0.24],
    ], Math.max(3, size * 0.075), "rgba(92,87,79,.8)", "rgba(214,207,194,.88)");
    for (let i = 0; i < 6; i += 1) {
      const px = cx + (visualNoise(tx, ty, 270 + i) - 0.5) * rx * 1.15;
      const py = cy + (visualNoise(tx, ty, 280 + i) - 0.5) * ry * 1.05;
      const r = size * (0.014 + visualNoise(tx, ty, 290 + i) * 0.016);
      const gold = ctx.createRadialGradient(px - r * 0.4, py - r * 0.5, 0, px, py, r);
      gold.addColorStop(0, ore.highlight);
      gold.addColorStop(0.45, ore.mineral2);
      gold.addColorStop(1, ore.mineral);
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();

  // Edge bevel and mining fractures remain above the clipped material.
  ctx.strokeStyle = "rgba(27,22,18,.42)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  rockPath(ctx, cx, cy, rx, ry, tx, ty, 13);
  ctx.stroke();

  if (change && change.damage) {
    const pct = Math.min(1, change.damage / ore.hp);
    ctx.strokeStyle = "rgba(29,22,17,.78)";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.02, cy - ry * 0.88);
    ctx.lineTo(cx - size * 0.08, cy - size * 0.02);
    ctx.lineTo(cx + size * 0.03, cy + size * 0.04);
    ctx.lineTo(cx - size * 0.01, cy + ry * 0.78);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.46)";
    ctx.fillRect(x + 7, y + size - 7, size - 14, 3);
    ctx.fillStyle = "#c9a45d";
    ctx.fillRect(x + 7, y + size - 7, (size - 14) * pct, 3);
  }
}
function drawMiner(ctx, x, y, direction, moving) {
  const bob = moving ? Math.sin(performance.now() / 95) * 1.4 : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(direction < 0 ? -1 : 1, 1);

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Boots and work pants.
  ctx.fillStyle = "#2c3436";
  ctx.fillRect(-10, 6, 8, 17);
  ctx.fillRect(2, 6, 8, 17);
  ctx.fillStyle = "#171b1b";
  ctx.fillRect(-12, 19, 10, 5);
  ctx.fillRect(2, 19, 10, 5);

  // Jacket / reflective vest.
  ctx.fillStyle = "#8b6337";
  ctx.fillRect(-14, -8, 28, 18);
  ctx.fillStyle = "#d5ad55";
  ctx.fillRect(-14, -1, 28, 4);

  // Head.
  ctx.fillStyle = "#d7ad82";
  ctx.beginPath();
  ctx.arc(0, -15, 10, 0, Math.PI * 2);
  ctx.fill();

  // Hard hat and lamp.
  ctx.fillStyle = "#d3a72c";
  ctx.beginPath();
  ctx.arc(0, -19, 13, Math.PI, Math.PI * 2);
  ctx.lineTo(13, -17);
  ctx.lineTo(-13, -17);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f3e3a0";
  ctx.fillRect(6, -24, 6, 5);

  // Pickaxe.
  ctx.strokeStyle = "#6b5136";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(11, -1);
  ctx.lineTo(25, -13);
  ctx.stroke();
  ctx.strokeStyle = "#777b78";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(20, -17);
  ctx.lineTo(31, -10);
  ctx.stroke();
  ctx.restore();
}

export default function InfiniteWorld(props) {
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const playerRef = useRef({ x: props.player.x || 0.5, y: props.player.y || 0.5 });
  const changesRef = useRef(props.worldChanges || {});
  const moveRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef({});
  const pointerRef = useRef(null);
  const facingRef = useRef(1);
  const positionCbRef = useRef(props.onPosition);
  const drillCbRef = useRef(props.onDrill);
  const pausedRef = useRef(props.paused);
  const lastReportRef = useRef(0);
  const hudRef = useRef({ chunkX: 0, chunkY: 0, biome: "dirt" });
  const [hud, setHud] = useState(hudRef.current);
  const [joystick, setJoystick] = useState({ visible: false, x: 0, y: 0, dx: 0, dy: 0 });

  useEffect(function () { changesRef.current = props.worldChanges || {}; }, [props.worldChanges]);
  useEffect(function () { positionCbRef.current = props.onPosition; }, [props.onPosition]);
  useEffect(function () { drillCbRef.current = props.onDrill; }, [props.onDrill]);
  useEffect(function () { pausedRef.current = props.paused; }, [props.paused]);

  useEffect(function () {
    if (Number.isFinite(props.player.x) && Number.isFinite(props.player.y)) {
      const p = playerRef.current;
      if (Math.abs(p.x - props.player.x) > 0.45 || Math.abs(p.y - props.player.y) > 0.45) {
        playerRef.current = { x: props.player.x, y: props.player.y };
      }
    }
  }, [props.player.x, props.player.y]);

  useEffect(function () {
    function down(event) { keysRef.current[event.key.toLowerCase()] = true; }
    function up(event) { keysRef.current[event.key.toLowerCase()] = false; }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return function () { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(function () {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return undefined;
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
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
    }

    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(viewport);
    window.addEventListener("resize", resize);

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;

      let vx = moveRef.current.x;
      let vy = moveRef.current.y;
      const keys = keysRef.current;
      const kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
      const ky = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      if (kx || ky) {
        const m = Math.sqrt(kx * kx + ky * ky) || 1;
        vx = kx / m;
        vy = ky / m;
      }

      if (!pausedRef.current) {
        const magnitude = Math.min(1, Math.sqrt(vx * vx + vy * vy));
        if (magnitude > 0.045) {
          const p = playerRef.current;
          const under = getWorldTile(Math.floor(p.x), Math.floor(p.y));
          const speed = 4.2 * (under.biome === "water" ? 0.52 : under.biome === "stone" ? 0.86 : 1);
          p.x += vx * speed * dt;
          p.y += vy * speed * dt;
          if (vx < -0.05) facingRef.current = -1;
          else if (vx > 0.05) facingRef.current = 1;
        }
        if (now - lastReportRef.current > 105) {
          lastReportRef.current = now;
          if (positionCbRef.current) positionCbRef.current({ x: playerRef.current.x, y: playerRef.current.y });
        }
      }

      const p = playerRef.current;
      const tileSize = width < 560 ? 50 : 60;
      const centerX = width / 2;
      const centerY = height / 2;
      const minX = Math.floor(p.x - centerX / tileSize) - 2;
      const maxX = Math.ceil(p.x + centerX / tileSize) + 2;
      const minY = Math.floor(p.y - centerY / tileSize) - 2;
      const maxY = Math.ceil(p.y + centerY / tileSize) + 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#3f3024";
      ctx.fillRect(0, 0, width, height);

      for (let ty = minY; ty <= maxY; ty += 1) {
        for (let tx = minX; tx <= maxX; tx += 1) {
          const sx = centerX + (tx - p.x) * tileSize;
          const sy = centerY + (ty - p.y) * tileSize;
          const tile = getWorldTile(tx, ty);
          const change = changesRef.current[tileKey(tx, ty)];
          drawGround(ctx, tile, sx, sy, tileSize, change);
          drawOre(ctx, tile, sx, sy, tileSize, change, tx, ty);

          // Invisible chunk system; only a faint survey mark at chunk boundaries.
          const cx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE === 0;
          const cy = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE === 0;
          if (cx || cy) {
            ctx.strokeStyle = "rgba(255,240,205,.035)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (cx) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + tileSize); }
            if (cy) { ctx.moveTo(sx, sy); ctx.lineTo(sx + tileSize, sy); }
            ctx.stroke();
          }
        }
      }

      const moving = Math.sqrt(vx * vx + vy * vy) > 0.05;
      drawMiner(ctx, centerX, centerY, facingRef.current, moving);

      const chunk = chunkFor(p.x, p.y);
      const biome = getWorldTile(Math.floor(p.x), Math.floor(p.y)).biome;
      const old = hudRef.current;
      if (chunk.x !== old.chunkX || chunk.y !== old.chunkY || biome !== old.biome) {
        const next = { chunkX: chunk.x, chunkY: chunk.y, biome: biome };
        hudRef.current = next;
        setHud(next);
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return function () {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  function startStick(event) {
    if (props.paused) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { id: event.pointerId, x: x, y: y };
    moveRef.current = { x: 0, y: 0 };
    setJoystick({ visible: true, x: x, y: y, dx: 0, dy: 0 });
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
    const m = Math.sqrt(dx * dx + dy * dy);
    moveRef.current = m < 7 ? { x: 0, y: 0 } : { x: dx / max, y: dy / max };
    setJoystick({ visible: true, x: active.x, y: active.y, dx: dx, dy: dy });
    event.preventDefault();
  }

  function endStick(event) {
    if (!pointerRef.current || pointerRef.current.id !== event.pointerId) return;
    pointerRef.current = null;
    moveRef.current = { x: 0, y: 0 };
    setJoystick(function (old) { return { visible: false, x: old.x, y: old.y, dx: 0, dy: 0 }; });
    event.preventDefault();
  }

  function drill(event) {
    event.stopPropagation();
    if (drillCbRef.current) drillCbRef.current({ x: playerRef.current.x, y: playerRef.current.y });
  }

  return (
    <div className="df-world-wrap">
      <div className="df-world-hud">
        <span>AREA {hud.chunkX},{hud.chunkY}</span>
        <b>{hud.biome.toUpperCase()}</b>
        <small>∞ terrain</small>
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
            <div className="df-floating-stick-knob" style={{ transform: "translate(" + joystick.dx + "px," + joystick.dy + "px)" }} />
          </div>
        )}
        <button
          className="df-drill-action"
          onPointerDown={function (event) { event.stopPropagation(); }}
          onClick={drill}
          aria-label="Drill nearest ore"
        >
          <span>⛏</span><b>DRILL</b>
        </button>
        <div className="df-world-tip">Drag anywhere to walk · WASD · Space drills</div>
      </div>
    </div>
  );
}
