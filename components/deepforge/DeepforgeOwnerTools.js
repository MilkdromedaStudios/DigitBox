import { useEffect, useState } from "react";
import { INITIAL, SAVE_KEY } from "./data";
import { getCloudAuthToken, getOrCreatePlayerId, loadCloudAuth, saveCloudSave } from "./cloudSync";
import { emptyWorldChanges, surfaceHeight } from "./world";

function baseSave(raw) {
  const game = raw && raw.game ? raw.game : {};
  return {
    version: 3,
    updatedAt: Date.now(),
    player: raw && raw.player ? raw.player : { x: 0, y: surfaceHeight(0) - 0.38 },
    game: {
      ...INITIAL,
      ...game,
      buildings: { ...INITIAL.buildings, ...(game.buildings || {}) },
      researchTech: { ...INITIAL.researchTech, ...(game.researchTech || {}) },
    },
    worldChanges: raw && raw.worldChanges ? raw.worldChanges : emptyWorldChanges(),
  };
}

export default function DeepforgeOwnerTools() {
  const [owner, setOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function check() {
      const token = getCloudAuthToken();
      if (!token) {
        if (mounted) setOwner(false);
        return;
      }

      try {
        const user = await loadCloudAuth();
        if (!user || user.displayName !== "Numberstring") {
          if (mounted) setOwner(false);
          return;
        }
        const response = await fetch("/api/deepforge/owner", {
          headers: { Authorization: "Bearer " + token, Accept: "application/json" },
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (mounted) setOwner(Boolean(response.ok && body.owner));
      } catch (_) {
        if (mounted) setOwner(false);
      }
    }

    check();
    const timer = setInterval(check, 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  async function applyCheat(kind) {
    if (!owner || busy || typeof window === "undefined") return;
    setBusy(true);
    setMessage("");
    try {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (_) {}
      const next = baseSave(raw);
      const g = next.game;

      if (kind === "money") g.coins += 1000000;
      if (kind === "research") g.research += 10000;
      if (kind === "trophies") g.trophies += 10000;
      if (kind === "heal") {
        g.maxHp = Math.max(g.maxHp, 9999);
        g.hp = g.maxHp;
        g.boostCharges = Math.max(g.boostCharges, 9999);
      }
      if (kind === "max") {
        g.coins = Math.max(g.coins, 999999999);
        g.research = Math.max(g.research, 99999);
        g.trophies = Math.max(g.trophies, 999999);
        g.drill = Math.max(g.drill, 50);
        g.armor = Math.max(g.armor, 50);
        g.blaster = Math.max(g.blaster, 50);
        g.cargoMax = Math.max(g.cargoMax, 999);
        g.maxHp = Math.max(g.maxHp, 9999);
        g.hp = g.maxHp;
        g.boostCharges = Math.max(g.boostCharges, 9999);
        g.buildings = Object.fromEntries(Object.keys(INITIAL.buildings).map((key) => [key, 25]));
        g.researchTech = Object.fromEntries(Object.keys(INITIAL.researchTech).map((key) => [key, 25]));
      }

      next.updatedAt = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      await saveCloudSave(getOrCreatePlayerId(), next).catch(() => null);
      setMessage("Cheat applied. Reloading…");
      setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setMessage(error && error.message ? error.message : "Cheat failed.");
      setBusy(false);
    }
  }

  if (!owner) return null;

  return (
    <>
      <button className="df-owner-fab" onClick={() => setOpen(!open)}>
        <span>♛</span><b>OWNER</b>
      </button>

      {open && (
        <aside className="df-owner-console">
          <div className="df-owner-head">
            <div><small>DEEPFORGE OWNER</small><h3>Numberstring</h3></div>
            <button onClick={() => setOpen(false)}>×</button>
          </div>
          <p>Private owner tools. These changes sync to the current DEEPFORGE save.</p>
          <div className="df-owner-grid">
            <button disabled={busy} onClick={() => applyCheat("money")}><b>+$1,000,000</b><small>Cash</small></button>
            <button disabled={busy} onClick={() => applyCheat("research")}><b>+10,000 RP</b><small>Research</small></button>
            <button disabled={busy} onClick={() => applyCheat("trophies")}><b>+10,000</b><small>Trophies</small></button>
            <button disabled={busy} onClick={() => applyCheat("heal")}><b>GOD SUPPLY</b><small>HP + boosts</small></button>
            <button className="max" disabled={busy} onClick={() => applyCheat("max")}><b>MAX EVERYTHING</b><small>Gear · town · research · money</small></button>
          </div>
          {message && <div className="df-owner-message">{message}</div>}
        </aside>
      )}

      <style jsx global>{`
        .df-owner-fab{position:fixed;right:18px;bottom:18px;z-index:1400;display:flex;align-items:center;gap:7px;height:42px;padding:0 13px;border:1px solid rgba(255,212,105,.45);border-radius:12px;background:linear-gradient(180deg,#6b5124,#322410);color:#ffe09a;box-shadow:0 12px 34px rgba(0,0,0,.42);font-weight:950;cursor:pointer}.df-owner-fab span{font-size:1rem}.df-owner-fab b{font-size:.65rem;letter-spacing:.12em}.df-owner-console{position:fixed;right:18px;bottom:70px;z-index:1399;width:min(360px,calc(100vw - 24px));padding:14px;border:1px solid rgba(255,214,116,.27);border-radius:16px;background:linear-gradient(180deg,rgba(50,38,19,.98),rgba(20,16,11,.99));color:#f3e4c4;box-shadow:0 24px 70px rgba(0,0,0,.58)}.df-owner-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.df-owner-head small{display:block;color:#cda95d;font-size:.5rem;letter-spacing:.15em;font-weight:950}.df-owner-head h3{margin:2px 0 0;font-size:1.2rem}.df-owner-head>button{width:32px;height:32px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);color:#d9c8a7;font-size:1.1rem;cursor:pointer}.df-owner-console>p{margin:9px 0 12px;color:#9d8f75;font-size:.65rem;line-height:1.45}.df-owner-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.df-owner-grid button{min-height:58px;padding:8px;border:1px solid rgba(255,220,140,.12);border-radius:10px;background:rgba(255,255,255,.035);color:#ecd7ae;text-align:left;cursor:pointer}.df-owner-grid button:hover{background:rgba(255,211,112,.08)}.df-owner-grid button:disabled{opacity:.5;cursor:default}.df-owner-grid button b,.df-owner-grid button small{display:block}.df-owner-grid button b{font-size:.68rem}.df-owner-grid button small{margin-top:3px;color:#8f826c;font-size:.55rem}.df-owner-grid .max{grid-column:1/-1;background:linear-gradient(180deg,rgba(179,130,42,.24),rgba(105,72,20,.18));border-color:rgba(255,205,92,.25);text-align:center}.df-owner-message{margin-top:9px;padding:8px;border-radius:8px;background:rgba(255,222,143,.08);color:#e8ce95;font-size:.6rem}@media(max-width:520px){.df-owner-fab{right:10px;bottom:10px}.df-owner-console{right:10px;bottom:60px}.df-owner-grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </>
  );
}
