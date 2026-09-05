import { useEffect, useState } from "react";
import { getCloudAuthToken } from "./cloudSync";

const DEFAULT_DESIGN = {
  shape: "shield",
  pattern: "split",
  primary: "#C99A4C",
  secondary: "#403326",
  symbol: "⛏",
};

const SHAPES = ["shield", "round", "hex", "diamond", "badge"];
const PATTERNS = ["solid", "split", "stripe", "chevron", "rings"];
const SYMBOLS = ["⛏", "◆", "★", "⚡", "⛰", "👑"];

let designCache = {};
let designPromise = null;

function background(design) {
  const a = design.primary || DEFAULT_DESIGN.primary;
  const b = design.secondary || DEFAULT_DESIGN.secondary;
  if (design.pattern === "solid") return a;
  if (design.pattern === "stripe") return `repeating-linear-gradient(90deg,${a} 0 11px,${b} 11px 22px)`;
  if (design.pattern === "chevron") return `linear-gradient(135deg,transparent 42%,${b} 42% 58%,transparent 58%),${a}`;
  if (design.pattern === "rings") return `radial-gradient(circle,${a} 0 28%,${b} 29% 52%,${a} 53%)`;
  return `linear-gradient(135deg,${a} 0 50%,${b} 50%)`;
}

function shapeStyle(shape) {
  if (shape === "round") return { borderRadius: "50%", clipPath: "none" };
  if (shape === "hex") return { borderRadius: 0, clipPath: "polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)" };
  if (shape === "diamond") return { borderRadius: "10%", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" };
  if (shape === "badge") return { borderRadius: "22%", clipPath: "polygon(10% 0,90% 0,100% 20%,100% 80%,50% 100%,0 80%,0 20%)" };
  return { borderRadius: "14%", clipPath: "polygon(8% 0,92% 0,100% 28%,82% 82%,50% 100%,18% 82%,0 28%)" };
}

async function loadDesigns(force) {
  if (!force && Object.keys(designCache).length) return designCache;
  if (!force && designPromise) return designPromise;
  designPromise = fetch("/api/deepforge/clan-design", { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load clan designs.");
      designCache = body.designs || {};
      return designCache;
    })
    .finally(() => { designPromise = null; });
  return designPromise;
}

function emitDesign(clanId, design) {
  designCache = { ...designCache, [clanId]: design };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("deepforge-clan-design", { detail: { clanId, design } }));
  }
}

export function ClanBadge({ clan, small }) {
  const [design, setDesign] = useState(() => ({ ...DEFAULT_DESIGN, ...(designCache[clan && clan.id] || {}) }));

  useEffect(() => {
    let mounted = true;
    loadDesigns(false).then((all) => {
      if (mounted) setDesign({ ...DEFAULT_DESIGN, ...(all[clan.id] || {}) });
    }).catch(() => {});

    function onDesign(event) {
      if (event.detail && event.detail.clanId === clan.id) {
        setDesign({ ...DEFAULT_DESIGN, ...(event.detail.design || {}) });
      }
    }
    window.addEventListener("deepforge-clan-design", onDesign);
    return () => {
      mounted = false;
      window.removeEventListener("deepforge-clan-design", onDesign);
    };
  }, [clan && clan.id]);

  return (
    <div
      className={small ? "df-custom-clan-badge small" : "df-custom-clan-badge"}
      style={{ background: background(design), ...shapeStyle(design.shape) }}
      title={clan && clan.name ? clan.name : "Clan emblem"}
    >
      <span>{design.symbol || "⛏"}</span>
    </div>
  );
}

export function ClanDesignerControl({ clan, authUser, onNotice, compact }) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(DEFAULT_DESIGN);

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!authUser || !clan) {
        if (mounted) setAllowed(false);
        return;
      }
      if (clan.role === "owner") {
        if (mounted) setAllowed(true);
        return;
      }
      const token = getCloudAuthToken();
      if (!token) return;
      try {
        const response = await fetch("/api/deepforge/owner", {
          headers: { Authorization: "Bearer " + token, Accept: "application/json" },
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (mounted) setAllowed(Boolean(response.ok && body.owner));
      } catch (_) {
        if (mounted) setAllowed(false);
      }
    }
    check();
    return () => { mounted = false; };
  }, [authUser && authUser.id, clan && clan.id, clan && clan.role]);

  async function show() {
    try {
      const all = await loadDesigns(false);
      setDraft({ ...DEFAULT_DESIGN, ...(all[clan.id] || {}) });
    } catch (_) {
      setDraft(DEFAULT_DESIGN);
    }
    setError("");
    setOpen(true);
  }

  async function save() {
    const token = getCloudAuthToken();
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/deepforge/clan-design", {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ clanId: clan.id, design: draft }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save clan design.");
      emitDesign(clan.id, body.design);
      setOpen(false);
      onNotice && onNotice("Clan design saved to D1.");
    } catch (err) {
      setError(err.message || "Could not save clan design.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return null;

  return (
    <>
      <button className={compact ? "df-clan-designer-open compact" : "df-clan-designer-open"} type="button" onClick={show}>
        {compact ? "🎨" : "🎨 Design clan"}
      </button>
      {open && (
        <div className="df-clan-designer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="df-clan-designer-card">
            <div className="df-clan-designer-head">
              <div><small>CLAN DESIGNER</small><h2>{clan.name}</h2></div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="df-clan-designer-preview">
              <div className="df-custom-clan-badge designer" style={{ background: background(draft), ...shapeStyle(draft.shape) }}><span>{draft.symbol}</span></div>
              <b>{clan.tag}</b>
            </div>

            <label>Shape</label>
            <div className="df-clan-designer-options">{SHAPES.map((value) => <button type="button" key={value} className={draft.shape === value ? "active" : ""} onClick={() => setDraft({ ...draft, shape: value })}>{value}</button>)}</div>
            <label>Pattern</label>
            <div className="df-clan-designer-options">{PATTERNS.map((value) => <button type="button" key={value} className={draft.pattern === value ? "active" : ""} onClick={() => setDraft({ ...draft, pattern: value })}>{value}</button>)}</div>
            <label>Colors</label>
            <div className="df-clan-designer-colors">
              <div><input type="color" value={draft.primary} onChange={(event) => setDraft({ ...draft, primary: event.target.value.toUpperCase() })} /><span>Primary</span></div>
              <div><input type="color" value={draft.secondary} onChange={(event) => setDraft({ ...draft, secondary: event.target.value.toUpperCase() })} /><span>Secondary</span></div>
            </div>
            <label>Symbol</label>
            <div className="df-clan-designer-symbols">{SYMBOLS.map((value) => <button type="button" key={value} className={draft.symbol === value ? "active" : ""} onClick={() => setDraft({ ...draft, symbol: value })}>{value}</button>)}</div>
            {error && <div className="df-clan-designer-error">{error}</div>}
            <button className="df-clan-designer-save" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save design"}</button>
          </section>
        </div>
      )}

      <style jsx global>{`
        .df-custom-clan-badge{width:72px;height:72px;display:grid;place-items:center;flex:0 0 72px;border:2px solid rgba(255,255,255,.2);filter:drop-shadow(0 7px 12px rgba(0,0,0,.25))}.df-custom-clan-badge.small{width:42px;height:42px;flex-basis:42px}.df-custom-clan-badge.designer{width:82px;height:82px}.df-custom-clan-badge span{font-size:1.55rem;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))}.df-custom-clan-badge.small span{font-size:.95rem}.df-clan-designer-open{width:100%;min-height:40px;margin:9px 0;padding:7px 10px;border:1px solid rgba(207,167,84,.24);border-radius:9px;background:rgba(190,139,47,.11);color:#e5c987;font-weight:900;cursor:pointer}.df-clan-designer-open.compact{width:auto;min-width:38px;margin:0;padding:5px 8px}.df-clan-designer-backdrop{position:fixed;inset:0;z-index:1600;display:grid;place-items:center;padding:12px;background:rgba(9,7,5,.82);backdrop-filter:blur(5px)}.df-clan-designer-card{width:min(510px,100%);max-height:calc(100svh - 24px);overflow:auto;padding:16px;border:1px solid rgba(235,207,155,.18);border-radius:16px;background:linear-gradient(180deg,#493a2c,#2c241d);color:#eee1cb;box-shadow:0 30px 85px rgba(0,0,0,.62)}.df-clan-designer-head{display:flex;align-items:center;justify-content:space-between}.df-clan-designer-head small{display:block;color:#caa25c;font-size:.5rem;letter-spacing:.14em;font-weight:950}.df-clan-designer-head h2{margin:3px 0 0}.df-clan-designer-head>button{width:34px;height:34px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);color:#d9cbb4;font-size:1.1rem;cursor:pointer}.df-clan-designer-preview{display:flex;align-items:center;justify-content:center;gap:16px;margin:16px 0;padding:18px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(0,0,0,.12)}.df-clan-designer-preview>b{font-size:1.4rem;letter-spacing:.12em}.df-clan-designer-card>label{display:block;margin:13px 0 6px;color:#9f917e;font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.df-clan-designer-options,.df-clan-designer-symbols{display:flex;flex-wrap:wrap;gap:6px}.df-clan-designer-options button,.df-clan-designer-symbols button{min-height:34px;padding:6px 9px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);color:#cfc0a9;cursor:pointer;text-transform:capitalize}.df-clan-designer-options button.active,.df-clan-designer-symbols button.active{border-color:rgba(220,181,96,.45);background:rgba(220,181,96,.14);color:#f1d89d}.df-clan-designer-colors{display:grid;grid-template-columns:1fr 1fr;gap:8px}.df-clan-designer-colors>div{display:flex;align-items:center;gap:9px;padding:8px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(0,0,0,.09)}.df-clan-designer-colors input{width:42px;height:34px;padding:0;border:0;background:transparent}.df-clan-designer-colors span{font-size:.62rem;color:#b4a58e}.df-clan-designer-symbols button{width:44px;font-size:1.05rem}.df-clan-designer-error{margin-top:10px;padding:8px;border:1px solid rgba(190,87,67,.2);border-radius:8px;background:rgba(129,55,41,.14);color:#efc2b4;font-size:.62rem}.df-clan-designer-save{width:100%;min-height:44px;margin-top:16px;border:0;border-radius:9px;background:linear-gradient(180deg,#d0ad63,#a88447);color:#261d13;font-weight:950;cursor:pointer}.df-clan-designer-save:disabled{opacity:.55}
      `}</style>
    </>
  );
}
