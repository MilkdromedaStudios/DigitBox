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
  const [view, setView] = useState("cheats");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adminData, setAdminData] = useState({ users: [], clans: [], ownerId: "" });

  async function verifyOwner() {
    const token = getCloudAuthToken();
    if (!token) {
      setOwner(false);
      return false;
    }
    try {
      const user = await loadCloudAuth();
      if (!user || user.displayName !== "Numberstring") {
        setOwner(false);
        return false;
      }
      const response = await fetch("/api/deepforge/owner", {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      const ok = Boolean(response.ok && body.owner);
      setOwner(ok);
      return ok;
    } catch (_) {
      setOwner(false);
      return false;
    }
  }

  async function refreshAdmin() {
    const token = getCloudAuthToken();
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/deepforge/admin", {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load admin data.");
      setAdminData({ users: body.users || [], clans: body.clans || [], ownerId: body.ownerId || "" });
    } catch (error) {
      setMessage(error.message || "Could not load admin data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!mounted) return;
      await verifyOwner();
    }
    check();
    const timer = setInterval(check, 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (owner && open && view === "manage") refreshAdmin();
  }, [owner, open, view]);

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

  async function adminDelete(type, id, label, permanent) {
    if (!owner || busy || permanent) return;
    if (!window.confirm("Delete " + label + " permanently?")) return;
    const typed = window.prompt("Type DELETE to confirm.");
    if (typed !== "DELETE") return;
    setBusy(true);
    setMessage("");
    try {
      const token = getCloudAuthToken();
      const response = await fetch("/api/deepforge/admin", {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ type, id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Delete failed.");
      setMessage(label + " deleted.");
      await refreshAdmin();
    } catch (error) {
      setMessage(error.message || "Delete failed.");
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

          <div className="df-owner-tabs">
            <button className={view === "cheats" ? "active" : ""} onClick={() => setView("cheats")}>Cheats</button>
            <button className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>Manage</button>
          </div>

          {view === "cheats" ? (
            <>
              <p>Private owner tools. These changes sync to the current DEEPFORGE save.</p>
              <div className="df-owner-grid">
                <button disabled={busy} onClick={() => applyCheat("money")}><b>+$1,000,000</b><small>Cash</small></button>
                <button disabled={busy} onClick={() => applyCheat("research")}><b>+10,000 RP</b><small>Research</small></button>
                <button disabled={busy} onClick={() => applyCheat("trophies")}><b>+10,000</b><small>Trophies</small></button>
                <button disabled={busy} onClick={() => applyCheat("heal")}><b>GOD SUPPLY</b><small>HP + boosts</small></button>
                <button className="max" disabled={busy} onClick={() => applyCheat("max")}><b>MAX EVERYTHING</b><small>Gear · town · research · money</small></button>
              </div>
            </>
          ) : (
            <div className="df-owner-manage">
              <div className="df-owner-manage-title"><b>Accounts</b><button disabled={busy} onClick={refreshAdmin}>Refresh</button></div>
              <div className="df-owner-list">
                {adminData.users.map((user) => (
                  <article key={user.id}>
                    <div><b>{user.displayName}</b><small>{user.email}</small></div>
                    {user.permanent ? <span className="permanent">PERMANENT</span> : <button disabled={busy} onClick={() => adminDelete("user", user.id, "account " + user.displayName, false)}>Delete</button>}
                  </article>
                ))}
              </div>

              <div className="df-owner-manage-title clans"><b>Clans</b><span>{adminData.clans.length}</span></div>
              <div className="df-owner-list">
                {adminData.clans.map((clan) => (
                  <article key={clan.id}>
                    <div><b>[{clan.tag}] {clan.name}</b><small>{clan.memberCount} member{clan.memberCount === 1 ? "" : "s"}</small></div>
                    <button disabled={busy} onClick={() => adminDelete("clan", clan.id, "clan " + clan.name, false)}>Delete</button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {message && <div className="df-owner-message">{message}</div>}
        </aside>
      )}

      <style jsx global>{`
        .df-owner-fab{position:fixed;right:18px;bottom:18px;z-index:1400;display:flex;align-items:center;gap:7px;height:42px;padding:0 13px;border:1px solid rgba(255,212,105,.45);border-radius:12px;background:linear-gradient(180deg,#6b5124,#322410);color:#ffe09a;box-shadow:0 12px 34px rgba(0,0,0,.42);font-weight:950;cursor:pointer}.df-owner-fab span{font-size:1rem}.df-owner-fab b{font-size:.65rem;letter-spacing:.12em}.df-owner-console{position:fixed;right:18px;bottom:70px;z-index:1399;width:min(430px,calc(100vw - 24px));max-height:calc(100svh - 95px);overflow:auto;padding:14px;border:1px solid rgba(255,214,116,.27);border-radius:16px;background:linear-gradient(180deg,rgba(50,38,19,.98),rgba(20,16,11,.99));color:#f3e4c4;box-shadow:0 24px 70px rgba(0,0,0,.58)}.df-owner-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.df-owner-head small{display:block;color:#cda95d;font-size:.5rem;letter-spacing:.15em;font-weight:950}.df-owner-head h3{margin:2px 0 0;font-size:1.2rem}.df-owner-head>button{width:32px;height:32px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);color:#d9c8a7;font-size:1.1rem;cursor:pointer}.df-owner-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}.df-owner-tabs button{min-height:35px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.025);color:#9e9076;font-weight:850;cursor:pointer}.df-owner-tabs button.active{border-color:rgba(224,183,90,.28);background:rgba(189,136,37,.13);color:#ebcc82}.df-owner-console>p{margin:9px 0 12px;color:#9d8f75;font-size:.65rem;line-height:1.45}.df-owner-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.df-owner-grid button{min-height:58px;padding:8px;border:1px solid rgba(255,220,140,.12);border-radius:10px;background:rgba(255,255,255,.035);color:#ecd7ae;text-align:left;cursor:pointer}.df-owner-grid button:hover{background:rgba(255,211,112,.08)}.df-owner-grid button:disabled{opacity:.5;cursor:default}.df-owner-grid button b,.df-owner-grid button small{display:block}.df-owner-grid button b{font-size:.68rem}.df-owner-grid button small{margin-top:3px;color:#8f826c;font-size:.55rem}.df-owner-grid .max{grid-column:1/-1;background:linear-gradient(180deg,rgba(179,130,42,.24),rgba(105,72,20,.18));border-color:rgba(255,205,92,.25);text-align:center}.df-owner-manage{display:grid;gap:8px}.df-owner-manage-title{display:flex;align-items:center;justify-content:space-between;margin-top:4px}.df-owner-manage-title.clans{margin-top:12px}.df-owner-manage-title>b{font-size:.68rem;color:#dfc88f}.df-owner-manage-title>button{min-height:30px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(255,255,255,.03);color:#aa9b80;font-size:.58rem;cursor:pointer}.df-owner-manage-title>span{color:#8e8067;font-size:.58rem}.df-owner-list{display:grid;gap:5px;max-height:210px;overflow:auto}.df-owner-list article{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:rgba(255,255,255,.02)}.df-owner-list article>div{min-width:0;flex:1}.df-owner-list article b,.df-owner-list article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.df-owner-list article b{font-size:.63rem;color:#d6c5a6}.df-owner-list article small{margin-top:2px;color:#756b5b;font-size:.52rem}.df-owner-list article>button{min-width:58px;min-height:31px;border:1px solid rgba(205,92,70,.2);border-radius:7px;background:rgba(125,48,36,.16);color:#dfa595;font-size:.56rem;font-weight:850;cursor:pointer}.df-owner-list .permanent{padding:5px 7px;border:1px solid rgba(224,182,84,.2);border-radius:6px;background:rgba(176,123,28,.1);color:#e2c06c;font-size:.48rem;font-weight:950}.df-owner-message{margin-top:9px;padding:8px;border-radius:8px;background:rgba(255,222,143,.08);color:#e8ce95;font-size:.6rem}@media(max-width:520px){.df-owner-fab{right:10px;bottom:10px}.df-owner-console{right:10px;bottom:60px}.df-owner-grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </>
  );
}
