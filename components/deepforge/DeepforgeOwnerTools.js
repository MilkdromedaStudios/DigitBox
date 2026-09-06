import { useEffect, useRef, useState } from "react";
import { INITIAL, SAVE_KEY } from "./data";
import { getCloudAuthToken, getOrCreatePlayerId, loadCloudAuth, saveCloudSave } from "./cloudSync";
import { emptyWorldChanges, surfaceHeight } from "./world";

const OWNER_PREF_KEY = "digitbox-deepforge-owner-prefs-v2";
const INFINITE = {
  coins: 1000000000000000,
  research: 1000000000000,
  trophies: 1000000000000,
  cargoMax: 999999,
  maxHp: 999999,
  boostCharges: 999999,
  drill: 50,
  armor: 50,
  blaster: 50,
  buildingLevel: 25,
  researchLevel: 25,
};

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
      buildingHp: { ...INITIAL.buildingHp, ...(game.buildingHp || {}) },
      researchTech: { ...INITIAL.researchTech, ...(game.researchTech || {}) },
    },
    worldChanges: raw && raw.worldChanges ? raw.worldChanges : emptyWorldChanges(),
  };
}

function maxedGame(game) {
  const buildings = Object.fromEntries(
    Object.keys(INITIAL.buildings).map((key) => [key, Math.max(Number(game.buildings && game.buildings[key]) || 0, INFINITE.buildingLevel)])
  );
  const buildingHp = Object.fromEntries(
    Object.keys(buildings).map((key) => {
      const base = key === "walls" ? 160 : 100;
      const perLevel = key === "walls" ? 55 : 45;
      return [key, base + buildings[key] * perLevel];
    })
  );
  return {
    ...game,
    coins: Math.max(Number(game.coins) || 0, INFINITE.coins),
    research: Math.max(Number(game.research) || 0, INFINITE.research),
    trophies: Math.max(Number(game.trophies) || 0, INFINITE.trophies),
    cargoMax: Math.max(Number(game.cargoMax) || 0, INFINITE.cargoMax),
    drill: Math.max(Number(game.drill) || 0, INFINITE.drill),
    armor: Math.max(Number(game.armor) || 0, INFINITE.armor),
    blaster: Math.max(Number(game.blaster) || 0, INFINITE.blaster),
    maxHp: Math.max(Number(game.maxHp) || 0, INFINITE.maxHp),
    hp: Math.max(Number(game.hp) || 0, INFINITE.maxHp),
    boostCharges: Math.max(Number(game.boostCharges) || 0, INFINITE.boostCharges),
    buildings,
    buildingHp,
    researchTech: Object.fromEntries(
      Object.keys(INITIAL.researchTech).map((key) => [key, Math.max(Number(game.researchTech && game.researchTech[key]) || 0, INFINITE.researchLevel)])
    ),
  };
}

function needsInfinityRepair(game) {
  if (!game) return true;
  if ((Number(game.coins) || 0) < 1000000000000) return true;
  if ((Number(game.research) || 0) < 100000000) return true;
  if ((Number(game.trophies) || 0) < 100000000) return true;
  if ((Number(game.cargoMax) || 0) < 10000) return true;
  if ((Number(game.maxHp) || 0) < 10000) return true;
  if ((Number(game.boostCharges) || 0) < 10000) return true;
  if ((Number(game.drill) || 0) < INFINITE.drill) return true;
  if ((Number(game.armor) || 0) < INFINITE.armor) return true;
  if ((Number(game.blaster) || 0) < INFINITE.blaster) return true;
  return Object.keys(INITIAL.buildings).some((key) => (Number(game.buildings && game.buildings[key]) || 0) < INFINITE.buildingLevel) ||
    Object.keys(INITIAL.researchTech).some((key) => (Number(game.researchTech && game.researchTech[key]) || 0) < INFINITE.researchLevel);
}

function readPrefs() {
  if (typeof window === "undefined") return { open: false, view: "cheats", infinite: false };
  try {
    const raw = JSON.parse(localStorage.getItem(OWNER_PREF_KEY) || "null");
    return {
      open: Boolean(raw && raw.open),
      view: raw && raw.view === "manage" ? "manage" : "cheats",
      infinite: Boolean(raw && raw.infinite),
    };
  } catch (_) {
    return { open: false, view: "cheats", infinite: false };
  }
}

export default function DeepforgeOwnerTools() {
  const [owner, setOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("cheats");
  const [infinite, setInfinite] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adminData, setAdminData] = useState({ users: [], clans: [], ownerId: "" });
  const repairBusyRef = useRef(false);
  const reloadQueuedRef = useRef(false);

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

  async function writeCheatSave(kind, options = {}) {
    if (!owner || typeof window === "undefined") return false;
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (_) {}
    const next = baseSave(raw);
    const g = next.game;

    if (kind === "money") g.coins = Math.max(g.coins + 1000000, 1000000);
    if (kind === "research") g.research = Math.max(g.research + 10000, 10000);
    if (kind === "trophies") g.trophies = Math.max(g.trophies + 10000, 10000);
    if (kind === "heal") {
      g.maxHp = Math.max(g.maxHp, 9999);
      g.hp = g.maxHp;
      g.boostCharges = Math.max(g.boostCharges, 9999);
    }
    if (kind === "max" || kind === "infinite") next.game = maxedGame(g);

    next.updatedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    await saveCloudSave(getOrCreatePlayerId(), next).catch(() => null);

    if (options.reload && !reloadQueuedRef.current) {
      reloadQueuedRef.current = true;
      setTimeout(() => window.location.reload(), 220);
    }
    return true;
  }

  async function repairInfiniteIfNeeded() {
    if (!owner || !infinite || repairBusyRef.current || typeof window === "undefined") return;
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (_) {}
    if (raw && raw.game && !needsInfinityRepair(raw.game)) return;

    repairBusyRef.current = true;
    try {
      await writeCheatSave("infinite", { reload: true });
    } finally {
      repairBusyRef.current = false;
    }
  }

  useEffect(() => {
    const prefs = readPrefs();
    setOpen(prefs.open);
    setView(prefs.view);
    setInfinite(prefs.infinite);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded || typeof window === "undefined") return;
    try { localStorage.setItem(OWNER_PREF_KEY, JSON.stringify({ open, view, infinite })); } catch (_) {}
  }, [open, view, infinite, prefsLoaded]);

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

  useEffect(() => {
    if (!owner || !infinite) return undefined;
    repairInfiniteIfNeeded();
    const timer = setInterval(repairInfiniteIfNeeded, 800);
    return () => clearInterval(timer);
  }, [owner, infinite]);

  async function applyCheat(kind) {
    if (!owner || busy || typeof window === "undefined") return;
    setBusy(true);
    setMessage("");
    try {
      await writeCheatSave(kind, { reload: true });
      setMessage("Cheat applied.");
    } catch (error) {
      setMessage(error && error.message ? error.message : "Cheat failed.");
      setBusy(false);
    }
  }

  async function toggleInfinite() {
    if (!owner || busy) return;
    const next = !infinite;
    setInfinite(next);
    setMessage(next ? "∞ OWNER MODE enabled permanently for this browser." : "∞ OWNER MODE disabled.");
    if (next) {
      setBusy(true);
      try {
        await writeCheatSave("infinite", { reload: true });
      } catch (error) {
        setMessage(error && error.message ? error.message : "Could not enable infinity mode.");
        setBusy(false);
      }
    }
  }

  async function adminCityGrant(user, key) {
    if (!owner || busy || !user || !user.city) return;
    setBusy(true);
    setMessage("");
    try {
      const token = getCloudAuthToken();
      const response = await fetch("/api/deepforge/admin", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ type: "cityGrant", userId: user.id, key, amount: 1 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "City grant failed.");
      setMessage("Granted " + key + " to " + user.displayName + "'s city.");
      await refreshAdmin();
    } catch (error) {
      setMessage(error.message || "City grant failed.");
      setBusy(false);
    }
  }

  async function adminSetCityLevel(user) {
    if (!owner || busy || !user || !user.city) return;
    const value = window.prompt("Set city level for " + user.displayName + ":", String(user.city.level || 1));
    if (value === null) return;
    const level = Math.max(1, Math.min(1000, Math.round(Number(value) || 1)));
    setBusy(true);
    setMessage("");
    try {
      const token = getCloudAuthToken();
      const response = await fetch("/api/deepforge/admin", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ type: "citySetLevel", userId: user.id, level }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not set city level.");
      setMessage(user.displayName + "'s city is now level " + level + ".");
      await refreshAdmin();
    } catch (error) {
      setMessage(error.message || "Could not set city level.");
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
      <button className={"df-owner-fab" + (infinite ? " infinite" : "")} onClick={() => setOpen(!open)}>
        <span>{infinite ? "∞" : "♛"}</span><b>{infinite ? "OWNER ∞" : "OWNER"}</b>
      </button>

      {open && (
        <aside className="df-owner-console">
          <div className="df-owner-head">
            <div><small>DEEPFORGE PERMANENT OWNER</small><h3>Numberstring</h3></div>
            <button onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="df-owner-tabs">
            <button className={view === "cheats" ? "active" : ""} onClick={() => setView("cheats")}>Cheats</button>
            <button className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>Manage</button>
          </div>

          {view === "cheats" ? (
            <>
              <div className={"df-owner-infinity" + (infinite ? " on" : "")}>
                <div><small>PERSISTENT OWNER POWER</small><b>∞ INFINITE EVERYTHING</b><span>Survives reloads and repairs itself after Reset.</span></div>
                <button disabled={busy} onClick={toggleInfinite}>{infinite ? "∞ ON" : "TURN ON"}</button>
              </div>
              <p>Owner preferences and infinity mode are kept outside the normal game reset.</p>
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
                  <article key={user.id} className="df-owner-user-row">
                    <div className="df-owner-user-main">
                      <div><b>{user.displayName}</b><small>{user.email}</small></div>
                      {user.permanent ? <span className="permanent">PERMANENT</span> : <button disabled={busy} onClick={() => adminDelete("user", user.id, "account " + user.displayName, false)}>Delete</button>}
                    </div>
                    {user.city ? (
                      <div className={"df-owner-city-admin" + (user.city.ownerFortress ? " fortress" : "")}>
                        <div className="df-owner-city-summary">
                          <span>{user.city.ownerFortress ? "🏰" : "🏙"}</span>
                          <div>
                            <b>{user.city.name}</b>
                            <small>{user.city.ownerFortress ? "♛ OWNER FORTRESS · ∞ PROPERTY · ∞ ARMOR · 4 TURRETS" : "LEVEL " + user.city.level + " · " + user.city.style}</small>
                          </div>
                          {!user.city.ownerFortress && <button disabled={busy} onClick={() => adminSetCityLevel(user)}>SET LVL</button>}
                        </div>
                        {user.city.ownerFortress ? (
                          <div className="df-owner-fortress-lock">
                            <span>OWNER ONLY</span><b>ALL CITY SYSTEMS MAXED</b><small>Permanent server-side fortress status</small>
                          </div>
                        ) : (
                          <div className="df-owner-city-grants">
                            <button disabled={busy} onClick={() => adminCityGrant(user, "cityLevel")}>+ City Lv</button>
                            <button disabled={busy} onClick={() => adminCityGrant(user, "refinery")}>+ Mill <small>{user.city.upgrades.refinery}</small></button>
                            <button disabled={busy} onClick={() => adminCityGrant(user, "workshop")}>+ Shop <small>{user.city.upgrades.workshop}</small></button>
                            <button disabled={busy} onClick={() => adminCityGrant(user, "academy")}>+ Survey <small>{user.city.upgrades.academy}</small></button>
                            <button disabled={busy} onClick={() => adminCityGrant(user, "walls")}>+ Walls <small>{user.city.upgrades.walls}</small></button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="df-owner-no-city">No city yet — this player must found one in the world.</div>
                    )}
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
        .df-owner-fab{position:fixed;right:18px;bottom:18px;z-index:1400;display:flex;align-items:center;gap:7px;height:42px;padding:0 13px;border:1px solid rgba(255,212,105,.45);border-radius:12px;background:linear-gradient(180deg,#6b5124,#322410);color:#ffe09a;box-shadow:0 12px 34px rgba(0,0,0,.42);font-weight:950;cursor:pointer}.df-owner-fab.infinite{border-color:rgba(255,225,111,.75);background:linear-gradient(180deg,#8a671d,#3b2a0b);box-shadow:0 0 24px rgba(255,199,57,.2),0 12px 34px rgba(0,0,0,.42)}.df-owner-fab span{font-size:1rem}.df-owner-fab b{font-size:.65rem;letter-spacing:.12em}.df-owner-console{position:fixed;right:18px;bottom:70px;z-index:1399;width:min(430px,calc(100vw - 24px));max-height:calc(100svh - 95px);overflow:auto;padding:14px;border:1px solid rgba(255,214,116,.27);border-radius:16px;background:linear-gradient(180deg,rgba(50,38,19,.98),rgba(20,16,11,.99));color:#f3e4c4;box-shadow:0 24px 70px rgba(0,0,0,.58)}.df-owner-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.df-owner-head small{display:block;color:#cda95d;font-size:.5rem;letter-spacing:.15em;font-weight:950}.df-owner-head h3{margin:2px 0 0;font-size:1.2rem}.df-owner-head>button{width:32px;height:32px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);color:#d9c8a7;font-size:1.1rem;cursor:pointer}.df-owner-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}.df-owner-tabs button{min-height:35px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.025);color:#9e9076;font-weight:850;cursor:pointer}.df-owner-tabs button.active{border-color:rgba(224,183,90,.28);background:rgba(189,136,37,.13);color:#ebcc82}.df-owner-console>p{margin:9px 0 12px;color:#9d8f75;font-size:.65rem;line-height:1.45}.df-owner-infinity{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid rgba(255,212,99,.16);border-radius:11px;background:rgba(125,89,22,.08)}.df-owner-infinity.on{border-color:rgba(255,214,75,.4);background:linear-gradient(135deg,rgba(185,127,24,.21),rgba(82,57,15,.16))}.df-owner-infinity>div{min-width:0;flex:1}.df-owner-infinity small,.df-owner-infinity b,.df-owner-infinity span{display:block}.df-owner-infinity small{color:#a8905f;font-size:.46rem;letter-spacing:.12em;font-weight:900}.df-owner-infinity b{margin-top:2px;color:#f1cf75;font-size:.72rem}.df-owner-infinity span{margin-top:2px;color:#8f8065;font-size:.55rem}.df-owner-infinity>button{min-width:72px;min-height:38px;border:1px solid rgba(255,214,99,.25);border-radius:8px;background:#77551d;color:#f7d987;font-weight:950;cursor:pointer}.df-owner-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.df-owner-grid button{min-height:58px;padding:8px;border:1px solid rgba(255,220,140,.12);border-radius:10px;background:rgba(255,255,255,.035);color:#ecd7ae;text-align:left;cursor:pointer}.df-owner-grid button:hover{background:rgba(255,211,112,.08)}.df-owner-grid button:disabled{opacity:.5;cursor:default}.df-owner-grid button b,.df-owner-grid button small{display:block}.df-owner-grid button b{font-size:.68rem}.df-owner-grid button small{margin-top:3px;color:#8f826c;font-size:.55rem}.df-owner-grid .max{grid-column:1/-1;background:linear-gradient(180deg,rgba(179,130,42,.24),rgba(105,72,20,.18));border-color:rgba(255,205,92,.25);text-align:center}.df-owner-manage{display:grid;gap:8px}.df-owner-manage-title{display:flex;align-items:center;justify-content:space-between;margin-top:4px}.df-owner-manage-title.clans{margin-top:12px}.df-owner-manage-title>b{font-size:.68rem;color:#dfc88f}.df-owner-manage-title>button{min-height:30px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(255,255,255,.03);color:#aa9b80;font-size:.58rem;cursor:pointer}.df-owner-manage-title>span{color:#8e8067;font-size:.58rem}.df-owner-list{display:grid;gap:5px;max-height:210px;overflow:auto}.df-owner-list article{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:rgba(255,255,255,.02)}.df-owner-list article>div{min-width:0;flex:1}.df-owner-list article b,.df-owner-list article small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.df-owner-list article b{font-size:.63rem;color:#d6c5a6}.df-owner-list article small{margin-top:2px;color:#756b5b;font-size:.52rem}.df-owner-list article>button{min-width:58px;min-height:31px;border:1px solid rgba(205,92,70,.2);border-radius:7px;background:rgba(125,48,36,.16);color:#dfa595;font-size:.56rem;font-weight:850;cursor:pointer}.df-owner-list .permanent{padding:5px 7px;border:1px solid rgba(224,182,84,.2);border-radius:6px;background:rgba(176,123,28,.1);color:#e2c06c;font-size:.48rem;font-weight:950}.df-owner-user-row{display:grid!important;gap:7px!important}.df-owner-user-main{display:flex;align-items:center;gap:8px;width:100%}.df-owner-user-main>div{min-width:0;flex:1}.df-owner-city-admin{display:grid;gap:5px;width:100%;padding-top:6px;border-top:1px solid rgba(255,255,255,.05)}.df-owner-city-summary{display:flex;align-items:center;gap:6px}.df-owner-city-summary>span{font-size:.9rem}.df-owner-city-summary>div{min-width:0;flex:1}.df-owner-city-summary b,.df-owner-city-summary small{display:block}.df-owner-city-summary b{font-size:.58rem;color:#d8c8a9}.df-owner-city-summary small{font-size:.48rem;color:#87785f;text-transform:uppercase}.df-owner-city-summary>button{min-height:27px!important;min-width:52px!important;border-color:rgba(215,180,94,.17)!important;background:rgba(137,99,30,.12)!important;color:#d7b86f!important}.df-owner-city-grants{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.df-owner-city-grants button{min-width:0;min-height:29px;border:1px solid rgba(224,186,101,.12);border-radius:6px;background:rgba(174,128,45,.08);color:#cdb47c;font-size:.47rem;font-weight:850;cursor:pointer}.df-owner-city-grants button small{display:inline;color:#8b7653;font-size:.43rem}.df-owner-city-admin.fortress{border-color:rgba(101,210,235,.18);background:rgba(46,105,120,.06);padding:7px;border-radius:8px}.df-owner-fortress-lock{display:flex;align-items:center;gap:7px;padding:7px;border:1px solid rgba(103,214,239,.13);border-radius:7px;background:rgba(49,114,131,.08)}.df-owner-fortress-lock span{padding:3px 5px;border-radius:5px;background:rgba(103,214,239,.12);color:#9eddeb;font-size:.42rem;font-weight:950}.df-owner-fortress-lock b{color:#c7edf4;font-size:.5rem}.df-owner-fortress-lock small{margin-left:auto;color:#7299a2;font-size:.43rem}.df-owner-no-city{width:100%;padding:6px;border-radius:6px;background:rgba(255,255,255,.018);color:#746958;font-size:.5rem}.df-owner-message{margin-top:9px;padding:8px;border-radius:8px;background:rgba(255,222,143,.08);color:#e8ce95;font-size:.6rem}@media(max-width:520px){.df-owner-fab{right:10px;bottom:10px}.df-owner-console{right:10px;bottom:60px}.df-owner-grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </>
  );
}
