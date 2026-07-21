import { useEffect } from "react";

// Loads the vendored liquidGL + html2canvas scripts once and applies the
// liquid-glass refraction effect to elements matching `target`. Everything is
// defensive: if WebGL is missing liquidGL falls back to a CSS blur on its own,
// and if the scripts fail to load at all the target keeps whatever CSS glass
// styling it already has. Nothing here can break the page.

let scriptsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-liquidgl="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
      }
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.liquidgl = src;
    el.addEventListener("load", () => {
      el.dataset.loaded = "true";
      resolve();
    });
    el.addEventListener("error", reject);
    document.head.appendChild(el);
  });
}

function ensureScripts() {
  if (scriptsPromise) return scriptsPromise;
  scriptsPromise = loadScript("/vendor/html2canvas.min.js")
    .then(() => loadScript("/vendor/liquidGL.js"))
    .catch((err) => {
      scriptsPromise = null;
      throw err;
    });
  return scriptsPromise;
}

export default function LiquidGlass({
  target = ".liquidGL",
  options = {},
  enabled = true,
  deps = [],
}) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    let cancelled = false;
    let instance = null;

    // Respect users who prefer reduced motion / reduced effects.
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return undefined;

    const start = () => {
      if (cancelled) return;
      if (!document.querySelector(target)) return;
      ensureScripts()
        .then(() => {
          if (cancelled || typeof window.liquidGL !== "function") return;
          try {
            instance = window.liquidGL({
              target,
              resolution: 1,
              refraction: 0.012,
              bevelDepth: 0.06,
              bevelWidth: 0.12,
              frost: 2,
              shadow: true,
              specular: true,
              reveal: "none",
              ...options,
            });
          } catch {
            /* liquidGL failed — CSS fallback stays in place */
          }
        })
        .catch(() => {
          /* scripts blocked — CSS fallback stays in place */
        });
    };

    // Defer to idle so the effect never competes with first paint.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : setTimeout(start, 400);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback && typeof idle === "number") {
        window.cancelIdleCallback(idle);
      } else {
        clearTimeout(idle);
      }
      try {
        if (instance && typeof instance.destroy === "function") instance.destroy();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, ...deps]);

  return null;
}
