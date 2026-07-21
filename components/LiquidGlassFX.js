import { useEffect } from "react";

// Glass surfaces that get the pointer-following specular highlight.
const GLASS_SELECTOR = [
  ".nav a",
  ".btn-base",
  ".auth-btn",
  ".like-btn",
  ".exit-btn",
  ".card",
  ".gallery-item",
  ".post-card",
  ".support-pill",
  ".hero-scroller span",
  ".game-btn",
  ".save-act",
].join(",");

/**
 * Powers the site's "liquid glass" material:
 *   1. Renders the SVG displacement filter (#lg-refraction) that global.css
 *      references via `backdrop-filter: url(#lg-refraction)` for real light
 *      refraction through the glass. Rendered in the markup (SSR) so the
 *      reference always resolves — no flash of an unfiltered surface.
 *   2. Tracks the pointer and writes --lg-x / --lg-y onto whichever glass
 *      element is under the cursor, so the specular highlight follows it.
 *
 * Reduced-motion users get the static frosted glass with no pointer tracking.
 */
export default function LiquidGlassFX() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    let rafId = 0;
    let pending = null;

    const apply = () => {
      rafId = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      const rect = el.getBoundingClientRect();
      if (rect.width && rect.height) {
        el.style.setProperty("--lg-x", `${((x - rect.left) / rect.width) * 100}%`);
        el.style.setProperty("--lg-y", `${((y - rect.top) / rect.height) * 100}%`);
      }
    };

    const onMove = (event) => {
      const el = event.target?.closest?.(GLASS_SELECTOR);
      if (!el) return;
      pending = { el, x: event.clientX, y: event.clientY };
      if (!rafId) rafId = requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <defs>
        <filter
          id="lg-refraction"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.009"
            numOctaves="2"
            seed="17"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.2" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
