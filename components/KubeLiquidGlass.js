import { useEffect, useState } from "react";

const REFRACTIVE_INDEX = 1.5;
const SAMPLES = 127;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function convexSquircle(x) {
  const t = clamp(x, 0, 1);
  return Math.pow(Math.max(0, 1 - Math.pow(1 - t, 4)), 0.25);
}

function displacementCurve() {
  const values = [];
  let maximum = 0.0001;
  const delta = 0.001;
  for (let index = 0; index < SAMPLES; index += 1) {
    const x = index / (SAMPLES - 1);
    const y1 = convexSquircle(Math.max(0, x - delta));
    const y2 = convexSquircle(Math.min(1, x + delta));
    const derivative = (y2 - y1) / (2 * delta);
    const theta1 = Math.atan(Math.abs(derivative));
    const theta2 = Math.asin(clamp(Math.sin(theta1) / REFRACTIVE_INDEX, -1, 1));
    const bend = Math.max(0, theta1 - theta2);
    const magnitude = Math.tan(bend) * (1 - x) * 1.15;
    values.push(magnitude);
    maximum = Math.max(maximum, magnitude);
  }
  return values.map((value) => value / maximum);
}

const CURVE = displacementCurve();

function roundedRectSdf(x, y, width, height, radius) {
  const px = Math.abs(x - width / 2) - (width / 2 - radius);
  const py = Math.abs(y - height / 2) - (height / 2 - radius);
  const ox = Math.max(px, 0);
  const oy = Math.max(py, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(px, py), 0) - radius;
}

function normalAt(x, y, width, height, radius) {
  const epsilon = 0.75;
  const gx = roundedRectSdf(x + epsilon, y, width, height, radius) - roundedRectSdf(x - epsilon, y, width, height, radius);
  const gy = roundedRectSdf(x, y + epsilon, width, height, radius) - roundedRectSdf(x, y - epsilon, width, height, radius);
  const length = Math.hypot(gx, gy) || 1;
  return { x: gx / length, y: gy / length };
}

function curveMagnitude(distance, bezel) {
  const t = clamp(distance / bezel, 0, 1);
  const position = t * (CURVE.length - 1);
  const left = Math.floor(position);
  const right = Math.min(CURVE.length - 1, left + 1);
  const mix = position - left;
  return CURVE[left] * (1 - mix) + CURVE[right] * mix;
}

function generateMaps(width, height, radius, bezel) {
  if (typeof document === "undefined") return null;
  const displacementCanvas = document.createElement("canvas");
  const highlightCanvas = document.createElement("canvas");
  displacementCanvas.width = width;
  displacementCanvas.height = height;
  highlightCanvas.width = width;
  highlightCanvas.height = height;

  const displacementCtx = displacementCanvas.getContext("2d", { willReadFrequently: false });
  const highlightCtx = highlightCanvas.getContext("2d", { willReadFrequently: false });
  if (!displacementCtx || !highlightCtx) return null;

  const displacement = displacementCtx.createImageData(width, height);
  const highlight = highlightCtx.createImageData(width, height);
  const lightX = -0.72;
  const lightY = -0.69;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const sdf = roundedRectSdf(x + 0.5, y + 0.5, width, height, radius);
      const insideDistance = -sdf;

      let red = 128;
      let green = 128;
      let alpha = 255;
      let shine = 0;

      if (insideDistance >= 0 && insideDistance <= bezel) {
        const normal = normalAt(x + 0.5, y + 0.5, width, height, radius);
        const magnitude = curveMagnitude(insideDistance, bezel);
        // The displacement image stores a normalized vector in R/G exactly as
        // feDisplacementMap expects: 128 is neutral, 0..255 are -1..1.
        const dx = -normal.x * magnitude;
        const dy = -normal.y * magnitude;
        red = clamp(Math.round(128 + dx * 127), 0, 255);
        green = clamp(Math.round(128 + dy * 127), 0, 255);

        const facingLight = clamp(-(normal.x * lightX + normal.y * lightY), 0, 1);
        const rim = Math.pow(1 - insideDistance / bezel, 1.65);
        shine = Math.round(255 * rim * (0.14 + facingLight * 0.72));
      } else if (insideDistance < 0) {
        alpha = 0;
      }

      displacement.data[index] = red;
      displacement.data[index + 1] = green;
      displacement.data[index + 2] = 128;
      displacement.data[index + 3] = alpha;

      highlight.data[index] = 255;
      highlight.data[index + 1] = 255;
      highlight.data[index + 2] = 255;
      highlight.data[index + 3] = shine;
    }
  }

  displacementCtx.putImageData(displacement, 0, 0);
  highlightCtx.putImageData(highlight, 0, 0);
  return {
    displacement: displacementCanvas.toDataURL("image/png"),
    highlight: highlightCanvas.toDataURL("image/png"),
  };
}

function GlassFilter({ id, maps, scale }) {
  if (!maps) return null;
  return (
    <filter id={id} x="-12%" y="-18%" width="124%" height="136%" colorInterpolationFilters="sRGB">
      <feImage href={maps.displacement} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="displacement_map" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="displacement_map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="refracted"
      />
      <feImage href={maps.highlight} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="specular_map" />
      <feBlend in="refracted" in2="specular_map" mode="screen" />
    </filter>
  );
}

export default function KubeLiquidGlass() {
  const [maps, setMaps] = useState(null);

  useEffect(() => {
    setMaps({
      panel: generateMaps(360, 220, 34, 30),
      pill: generateMaps(420, 112, 55, 24),
      card: generateMaps(300, 180, 24, 20),
    });
  }, []);

  return (
    <>
      <svg aria-hidden="true" width="0" height="0" style={{ position: "fixed", left: -9999, top: -9999, pointerEvents: "none" }}>
        <defs>
          <GlassFilter id="beta-kube-liquid-panel" maps={maps && maps.panel} scale={22} />
          <GlassFilter id="beta-kube-liquid-pill" maps={maps && maps.pill} scale={18} />
          <GlassFilter id="beta-kube-liquid-card" maps={maps && maps.card} scale={15} />
        </defs>
      </svg>

      <style jsx global>{`
        /*
          Kube-style liquid glass: convex-squircle displacement map + specular
          image blended over the refracted backdrop. Chromium currently supports
          SVG filters in backdrop-filter; the existing blur remains the fallback.
        */
        @supports (backdrop-filter: url("#beta-kube-liquid-panel")) {
          .beta-liquid-active .header,
          .beta-liquid-active .footer,
          .beta-deepforge-pill,
          .beta-news-pill,
          .beta-mini-pill {
            -webkit-backdrop-filter: url("#beta-kube-liquid-pill") blur(7px) saturate(150%) !important;
            backdrop-filter: url("#beta-kube-liquid-pill") blur(7px) saturate(150%) !important;
          }

          .beta-liquid-hero-glass,
          .beta-liquid-section {
            -webkit-backdrop-filter: url("#beta-kube-liquid-panel") blur(8px) saturate(155%) !important;
            backdrop-filter: url("#beta-kube-liquid-panel") blur(8px) saturate(155%) !important;
          }

          .beta-liquid-card,
          .beta-deepforge-orb,
          .beta-deepforge-cta {
            -webkit-backdrop-filter: url("#beta-kube-liquid-card") blur(5px) saturate(145%) !important;
            backdrop-filter: url("#beta-kube-liquid-card") blur(5px) saturate(145%) !important;
          }
        }
      `}</style>
    </>
  );
}
