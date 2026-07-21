import { useEffect } from "react";

// Hidden fun. Everything here is trigger-only (no timers/animation running at
// idle), so it costs nothing until a secret is found.
//
// Secrets:
//   • Konami code  ↑ ↑ ↓ ↓ ← → ← → B A     → emoji rain + toast
//   • type "digitbox" anywhere (not in a field) → rainbow flash
//   • other components can fire  window.dispatchEvent(
//       new CustomEvent("digitbox:easteregg", { detail: { type: "party" } }))

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

function isTyping() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function showToast(text) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "egg-toast";
  el.textContent = text;
  document.body.appendChild(el);
  // force reflow so the fade-in transition runs
  void el.offsetWidth;
  el.classList.add("is-in");
  window.setTimeout(() => el.classList.remove("is-in"), 2600);
  window.setTimeout(() => el.remove(), 3200);
}

function emojiRain(set) {
  if (typeof document === "undefined") return;
  const layer = document.createElement("div");
  layer.className = "egg-rain";
  const count = 26;
  for (let i = 0; i < count; i += 1) {
    const span = document.createElement("span");
    span.textContent = set[i % set.length];
    span.style.left = `${Math.random() * 100}%`;
    span.style.fontSize = `${18 + Math.random() * 26}px`;
    span.style.animationDelay = `${Math.random() * 0.8}s`;
    span.style.animationDuration = `${2.6 + Math.random() * 1.8}s`;
    layer.appendChild(span);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 5200);
}

function rainbowFlash() {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "egg-rainbow";
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1600);
}

export default function EasterEggs() {
  useEffect(() => {
    let konamiIdx = 0;
    let wordBuffer = "";

    const onKeyDown = (e) => {
      if (isTyping()) {
        konamiIdx = 0;
        wordBuffer = "";
        return;
      }

      // Konami code
      const expected = KONAMI[konamiIdx];
      if (e.key === expected || e.key.toLowerCase() === expected) {
        konamiIdx += 1;
        if (konamiIdx === KONAMI.length) {
          konamiIdx = 0;
          emojiRain(["🎮", "⭐", "🕹️", "🎉", "✨", "👾"]);
          showToast("🎮 Konami code! You found a secret.");
        }
      } else {
        konamiIdx = e.key === KONAMI[0] ? 1 : 0;
      }

      // Secret word
      if (e.key.length === 1) {
        wordBuffer = (wordBuffer + e.key.toLowerCase()).slice(-12);
        if (wordBuffer.endsWith("digitbox")) {
          wordBuffer = "";
          rainbowFlash();
          showToast("🌈 digitbox!");
        }
      }
    };

    const onCustom = (e) => {
      const type = e?.detail?.type;
      if (type === "party") {
        emojiRain(["🎉", "🎊", "🥳", "🎈", "✨"]);
        showToast("🎉 Party mode!");
      } else if (type === "rainbow") {
        rainbowFlash();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("digitbox:easteregg", onCustom);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("digitbox:easteregg", onCustom);
    };
  }, []);

  return null;
}
