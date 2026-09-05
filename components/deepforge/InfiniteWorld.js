import { useEffect, useMemo, useRef, useState } from "react";
import { CHUNK_SIZE, chunkFor, getWorldTile, tileKey } from "./world";

const BIOME_COLORS = {
  grass: "#315e3c",
  forest: "#244a34",
  sand: "#9a7c4e",
  stone: "#46515b",
  snow: "#8fa8aa",
  volcanic: "#553236",
  water: "#285875",
};

function drawMiner(ctx, cx, cy, facing, walking) {
  ctx.save();
  ctx.translate(cx, cy + (walking ? Math.sin(Date.now() / 90) * 1.5 : 0));
  ctx.scale(facing < 0 ? -1 : 1, 1);

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 19, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#233746";
  ctx.fillRect(-11, 5, 8, 18);
  ctx.fillRect(3, 5, 8, 18);

  ctx.fillStyle = "#38c6d9";
  ctx.fillRect(-15, -8, 30, 23);
  ctx.fillStyle = "#162732";
  ctx.fillRect(-11, 9, 22, 6);

  ctx.fillStyle = "#e6b98d";
  ctx.beginPath();
  ctx.arc(0, -15, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1c94f";
  ctx.beginPath();
  ctx.arc(0, -19, 15, Math.PI, Math.PI * 2);
  ctx.lineTo(15, -16);
  ctx.lineTo(-15, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff8be";
  ctx.fillRect(7, -25, 7, 6);

  ctx.strokeStyle = "#b7d2e5";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(25, -9);
  ctx.stroke();
  ctx.strokeStyle = "#7b5b3b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(23, -11);
  ctx.lineTo(30, -5);
  ctx.stroke();

  ctx.restore();
}

function drawTile(ctx, tile, x, y, size, change, chunkEdgeX, chunkEdgeY) {
  ctx.fillStyle = BIOME_COLORS[tile.biome] || BIOME_COLORS.grass;
  ctx.fillRect(x, y, size + 1, size + 1);

  const shade = tile.shade;
  ctx.fillStyle = shade > 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.055)";
  ctx.fillRect(x, y, size + 1, size + 1);

  if (tile.biome === "water") {
    ctx.strokeStyle = "rgba(125,214,255,.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + size * 0.42);
    ctx.lineTo(x + size - 8, y + size * 0.42);
    ctx.stroke();
  } else if (tile.biome === "forest" && tile.deco > 0.45) {
    ctx.fillStyle = "#163c27";
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y + size * 0.72);
    ctx.lineTo(x + size * 0.34, y + size * 0.28);
    ctx.lineTo(x + size * 0.47, y + size * 0.72);
    ctx.closePath();
    ctx.fill();
  } else if (tile.biome === "sand" && tile.deco > 0.7) {
    ctx.fillStyle = "rgba(255,229,160,.28)";
    ctx.fillRect(x + size * 0.18, y + size * 0.68, size * 0.18, 2);
  } else if (tile.biome === "snow" && tile.deco > 0.62) {
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.arc(x + size * 0.25, y + size * 0.25, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.biome === "volcanic" && tile.deco > 0.65) {
    ctx.fillStyle = "rgba(255,112,57,.45)";
    ctx.fillRect(x + size * 0.22, y + size * 0.72, size * 0.36, 2);
  }

  if (tile.resource && !(change && change.mined)) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.18, size * 0.25, size * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = tile.resource.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.25);
    ctx.lineTo(cx + size * 0.24, cy - size * 0.04);
    ctx.lineTo(cx + size * 0.16, cy + size * 0.23);
    ctx.lineTo(cx - size * 0.18, cy + size * 0.2);
    ctx.lineTo(cx - size * 0.25, cy - size * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tile.resource.name === "Coal" ? "#d7e0e7" : "#061019";
    ctx.font = "900 " + Math.max(10, Math.floor(size * 0.18)) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tile.resource.icon, cx, cy);

    if (change && change.damage) {
      const maxHp = tile.resource.hp;
      const pct = Math.min(1, change.damage / maxHp);
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(x + 7, y + size - 7, size - 14, 3);
      ctx.fillStyle = "#ffcb57";
      ctx.fillRect(x + 7, y + size - 7, (size - 14) * pct, 3);
    }
  }

  if (chunkEdgeX || chunkEdgeY) {
    ctx.strokeStyle = "rgba(81,230,255,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (chunkEdgeX) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + size);
    }
    if (chunkEdgeY) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + size, y);
    }
    ctx.stroke();
  }
}

export default function InfiniteWorld({ player, worldChanges, onPosition, onDrill, paused }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const playerRef = useRef({ x: player.x || 0, y: player.y || 0 });
  const changesRef = useRef(worldChanges || {});
  const vectorRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef({});
  const pointerRef = useRef(null);
  const facingRef = useRef(1);
  const onPositionRef = useRef(onPosition);
  const onDrillRef = useRef(onDrill);
  const pausedRef = useRef(paused);
  const lastReportRef = useRef(0);
  const [joystick, setJoystick] = useState({ visible: false, x: 0, y: 0, dx: 0, dy: 0 });
  const [hud, setHud] = useState({ chunkX: 0, chunkY: 0, biome: "grass" });

  useEffect(() => { changesRef.current = worldChanges || {}; }, [worldChanges]);
  useEffect(() => { onPositionRef.current = onPosition; }, [onPosition]);
  useEffect(() => { onDrillRef.current = onDrill; }, [onDrill]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (Number.isFinite(player.x) && Number.isFinite(player.y)) {
      const current = playerRef.current;
      if (Math.abs(current.x - player.x) > 0.35 || Math.abs(current.y - player.y) > 0.35) {
        playerRef.current = { x: player.x, y: player.y };
      }
    }
  }, [player.x, player.y]);

  useEffect(() => {
    const down = (event) => { keysRef.current[event.key.toLowerCase()] = true; };
    const up = (event) => { keysRef.current[event.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
    }

    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(wrap);
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d");
    let raf = 0;
    let previous = performance.now();

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;

      if (!pausedRef.current) {
        let vx = vectorRef.current.x;
        let vy = vectorRef.current.y;
        const keys = keysRef.current;
        const keyX = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
        const keyY = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
        if (keyX || keyY) {
          const m = Math.sqrt(keyX * keyX + keyY * keyY) || 1;
          vx = keyX / m;
          vy = keyY / m;
        }

        const magnitude = Math.min(1, Math.sqrt(vx * vx + vy * vy));
        if (magnitude > 0.04) {
          const p = playerRef.current;
          const terrain = getWorldTile(Math.floor(p.x), Math.floor(p.y));
          const speed = 3.9 * (terrain.biome === "water" ? 0.62 : 1);
          p.x += vx * speed * dt;
          p.y += vy * speed * dt;
          if (vx < -0.05) facingRef.current = -1;
          if (vx > 0.05) facingRef.current = 1;
        }

        if (now - lastReportRef.current > 110) {
          lastReportRef.current = now;
          onPositionRef.current && onPositionRef.current({ ...playerRef.current });
        }
      }

      const p = playerRef.current;
      const size = width < 560 ? 46 : 54;
      const centerX = width / 2;
      const centerY = height / 2;
      const minX = Math.floor(p.x - centerX / size) - 2;
      const maxX = Math.ceil(p.x + centerX / size) + 2;
      const minY = Math.floor(p.y - centerY / size) - 2;
      const maxY = Math.ceil(p.y + centerY / size) + 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0a1117";
      ctx.fillRect(0, 0, width, height);

      for (let ty = minY; ty <= maxY; ty += 1) {
        for (let tx = minX; tx <= maxX; tx += 1) {
          const screenX = centerX + (tx - p.x) * size;
          const screenY = centerY + (ty - p.y) * size;
          const tile = getWorldTile(tx, ty);
          const key = tileKey(tx, ty);
          const change = changesRef.current[key];
          drawTile(
            ctx,
            tile,
            screenX,
            screenY,
            size,
            change,
            ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE === 0,
            ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE === 0
          );
        }
      }

      const movement = Math.sqrt(vectorRef.current.x ** 2 + vectorRef.current.y ** 2) > 0.05 ||
        keysRef.current.w || keysRef.current.a || keysRef.current.s || keysRef.current.d ||
        keysRef.current.arrowup || keysRef.current.arrowdown || keysRef.current.arrowleft || keysRef.current.arrowright;
      drawMiner(ctx, centerX, centerY, facingRef.current, Boolean(movement));

      const chunk = chunkFor(p.x, p.y);
      const biome = getWorldTile(Math.floor(p.x), Math.floor(p.y)).biome;
      if (chunk.x !== hud.chunkX || chunk.y !== hud.chunkY || biome !== hud.biome) {
        setHud({ chunkX: chunk.x, chunkY: chunk.y, biome });
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

  const startJoystick = (event) => {
    if (paused) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { id: event.pointerId, x, y };
    vectorRef.current = { x: 0, y: 0 };
    setJoystick({ visible: true, x, y, dx: 0, dy: 0 });
    event.currentTarget.setPointerCapture && event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveJoystick = (event) => {
    const active = pointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const rawX = px - active.x;
    const rawY = py - active.y;
    const max = 58;
    const length = Math.sqrt(rawX * rawX + rawY * rawY);
    const scale = length > max ? max / length : 1;
    const dx = rawX * scale;
    const dy = rawY * scale;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    vectorRef.current = magnitude < 7 ? { x: 0, y: 0 } : { x: dx / max, y: dy / max };
    setJoystick({ visible: true, x: active.x, y: active.y, dx, dy });
    event.preventDefault();
  };

  const endJoystick = (event) => {
    if (!pointerRef.current || pointerRef.current.id !== event.pointerId) return;
    pointerRef.current = null;
    vectorRef.current = { x: 0, y: 0 };
    setJoystick((j) => ({ ...j, visible: false, dx: 0, dy: 0 }));
    event.preventDefault();
  };

  const chunk = useMemo(() => chunkFor(player.x || 0, player.y || 0), [player.x, player.y]);

  return (
    <div className="df-world-wrap">
      <div className="df-world-hud">
        <span>CHUNK {hud.chunkX},{hud.chunkY}</span>
        <b>{hud.biome.toUpperCase()}</b>
        <small>∞ terrain</small>
      </div>

      <div
        ref={wrapRef}
        className="df-world-viewport"
        onPointerDown={startJoystick}
        onPointerMove={moveJoystick}
        onPointerUp={endJoystick}
        onPointerCancel={endJoystick}
      >
        <canvas ref={canvasRef} className="df-world-canvas" />

        {joystick.visible && (
          <div className="df-floating-stick" style={{ left: joystick.x, top: joystick.y }}>
            <div className="df-floating-stick-knob" style={{ transform: "translate(" + joystick.dx + "px," + joystick.dy + "px)" }} />
          </div>
        )}

        <button
          className="df-drill-action"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onDrillRef.current && onDrillRef.current({ ...playerRef.current })}
          aria-label="Drill nearest ore"
        >
          <span>⛏</span>
          <b>DRILL</b>
        </button>

        <div className="df-world-tip">Drag anywhere to move · WASD works too</div>
      </div>
    </div>
  );
}
