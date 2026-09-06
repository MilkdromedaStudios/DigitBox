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
      view: raw && ["cheats", "manage", "access"].includes(raw.view) ? raw.view : "cheats",
      infinite: Boolean(raw && raw.infinite),
    };
  } catch (_) {
    return { open: false, view: "cheats", infinite: false };
  }
}

export default function DeepforgeOwnerTools() {
  const [owner, setOwner] = useState(false);
  const [access, setAccess] = useState({ permanentOwner: false, delegatedAdmin: false, username: "" });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("cheats");
  const [infinite, setInfinite] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [adminData, setAdminData] = useState({
    users: [],
    clans: [],
    ownerId: "",
    permanentOwner: false,
    delegatedAdmin: false,
    adminClan: null,
    adminClanRequests: [],
    adminClanMembers: [],
  });
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
      if (!user) {
        setOwner(false);
        setAccess({ permanentOwner: false, delegatedAdmin: false, username: "" });
        return false;
      }
      const response = await fetch("/api/deepforge/owner", {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      const ok = Boolean(response.ok && body.owner);
      setOwner(ok);
      setAccess({
        permanentOwner: Boolean(body.permanentOwner),
        delegatedAdmin: Boolean(body.delegatedAdmin),
        username: body.username || user.displayName || "",
      });
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
      setAdminData({
        users: body.users || [],
        clans: body.clans || [],
        ownerId: body.ownerId || "",
        permanentOwner: Boolean(body.permanentOwner),
        delegatedAdmin: Boolean(body.delegatedAdmin),
        adminClan: body.adminClan || null,
        adminClanRequests: body.adminClanRequests || [],
        adminClanMembers: body.adminClanMembers || [],
      });
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
    if (owner && open) refreshAdmin();
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

  async function adminClanDecision(requestRow, action) {
    if (!owner || busy || !access.permanentOwner || !requestRow) return;
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
        body: JSON.stringify({ type: "adminClanRequest", playerId: requestRow.playerId, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Admin request action failed.");
      setMessage((requestRow.displayName || "Player") + (action === "approve" ? " approved as Admin." : " request rejected."));
      await refreshAdmin();
    } catch (error) {
      setMessage(error.message || "Admin request action failed.");
      setBusy(false);
    }
  }

  async function adminClanRemove(member) {
    if (!owner || busy || !access.permanentOwner || !member || member.permanentOwner) return;
    if (!window.confirm("Remove " + member.displayName + " from Admin and revoke their permissions?")) return;
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
        body: JSON.stringify({ type: "adminClanRemove", playerId: member.playerId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not revoke Admin access.");
      setMessage(member.displayName + "'s Admin permissions were revoked.");
      await refreshAdmin();
    } catch (error) {
      setMessage(error.message || "Could not revoke Admin access.");
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
        <span>{access.permanentOwner ? "♛" : "◆"}</span>
        <b>{access.permanentOwner ? (infinite ? "OWNER ∞" : "OWNER") : "ADMIN"}</b>
      </button>

      {open && (
        <aside className="df-owner-console">
          <header className="df-owner-head">
            <div className="df-owner-brand">
              <span>{access.permanentOwner ? "♛" : "◆"}</span>
              <div>
                <small>DEEPFORGE CONTROL CENTER</small>
                <h3>{access.permanentOwner ? "Owner Dashboard" : "Admin Dashboard"}</h3>
                <p>{access.username || "Admin"} · {access.permanentOwner ? "Permanent owner" : "Approved Admin clan member"}</p>
              </div>
            </div>
            <div className="df-owner-head-actions">
              <em>{access.permanentOwner ? "OWNER" : "ADMIN"}</em>
              <button onClick={() => setOpen(false)}>×</button>
            </div>
          </header>

          <nav className="df-owner-sidebar">
            <small>CONTROL</small>
            <button className={view === "cheats" ? "active" : ""} onClick={() => setView("cheats")}>
              <span>⌁</span><div><b>Overview</b><em>Power & cheats</em></div>
            </button>
            <button className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>
              <span>▦</span><div><b>World Admin</b><em>Players, cities, clans</em></div>
            </button>
            <button className={view === "access" ? "active" : ""} onClick={() => setView("access")}>
              <span>♜</span><div><b>Admin Access</b><em>{adminData.adminClanRequests.length} pending</em></div>
            </button>
            <div className="df-owner-sidebar-note">
              <small>PERMISSION SOURCE</small>
              <b>{access.permanentOwner ? "Numberstring" : "Admin clan"}</b>
              <span>{access.permanentOwner ? "Cannot be revoked." : "Leaving Admin removes dashboard access."}</span>
            </div>
          </nav>

          <main className="df-owner-main">
            <div className="df-owner-page-head">
              <div>
                <small>{view === "cheats" ? "COMMAND OVERVIEW" : view === "manage" ? "WORLD ADMINISTRATION" : "PRIVILEGED MEMBERSHIP"}</small>
                <h2>{view === "cheats" ? "Control Center" : view === "manage" ? "Players & Clans" : "Admin Clan Access"}</h2>
              </div>
              <button disabled={busy} onClick={refreshAdmin}>↻ Refresh</button>
            </div>

            {view === "cheats" && (
              <>
                <div className="df-owner-stat-grid">
                  <article><span>👥</span><div><small>ACCOUNTS</small><b>{adminData.users.length || "—"}</b></div></article>
                  <article><span>⚑</span><div><small>CLANS</small><b>{adminData.clans.length || "—"}</b></div></article>
                  <article><span>♜</span><div><small>ADMINS</small><b>{adminData.adminClanMembers.length || "—"}</b></div></article>
                  <article><span>⌛</span><div><small>PENDING</small><b>{adminData.adminClanRequests.length}</b></div></article>
                </div>

                <section className="df-owner-panel">
                  <div className="df-owner-section-title">
                    <div><small>YOUR ACCOUNT</small><h3>Game overrides</h3></div>
                    <span>{access.permanentOwner ? "Permanent owner powers" : "Admin powers"}</span>
                  </div>
                  <div className={"df-owner-infinity" + (infinite ? " on" : "")}>
                    <div><small>PERSISTENT POWER</small><b>∞ INFINITE EVERYTHING</b><span>Repairs itself after normal game reset on this browser.</span></div>
                    <button disabled={busy} onClick={toggleInfinite}>{infinite ? "∞ ON" : "TURN ON"}</button>
                  </div>
                  <div className="df-owner-grid">
                    <button disabled={busy} onClick={() => applyCheat("money")}><b>+$1,000,000</b><small>Cash</small></button>
                    <button disabled={busy} onClick={() => applyCheat("research")}><b>+10,000 RP</b><small>Research</small></button>
                    <button disabled={busy} onClick={() => applyCheat("trophies")}><b>+10,000</b><small>Trophies</small></button>
                    <button disabled={busy} onClick={() => applyCheat("heal")}><b>GOD SUPPLY</b><small>HP + boosts</small></button>
                    <button className="max" disabled={busy} onClick={() => applyCheat("max")}><b>MAX EVERYTHING</b><small>Gear · town · research · money</small></button>
                  </div>
                </section>
              </>
            )}

            {view === "manage" && (
              <div className="df-owner-manage">
                <section className="df-owner-panel">
                  <div className="df-owner-section-title"><div><small>PLAYERS</small><h3>Accounts & Cities</h3></div><span>{adminData.users.length}</span></div>
                  <div className="df-owner-account-grid">
                    {adminData.users.map((user) => (
                      <article key={user.id} className="df-owner-user-card">
                        <div className="df-owner-user-main">
                          <div><b>{user.displayName}</b><small>{user.email}</small></div>
                          {user.permanent
                            ? <span className="permanent">PERMANENT OWNER</span>
                            : <button disabled={busy} onClick={() => adminDelete("user", user.id, "account " + user.displayName, false)}>Delete</button>}
                        </div>
                        {user.city ? (
                          <div className={"df-owner-city-admin" + (user.city.ownerFortress ? " fortress" : "")}>
                            <div className="df-owner-city-summary">
                              <span>{user.city.ownerFortress ? "🏰" : "🏙"}</span>
                              <div><b>{user.city.name}</b><small>{user.city.ownerFortress ? "♛ OWNER FORTRESS · ∞ ARMOR · ∞ PROPERTY" : "LEVEL " + user.city.level + " · " + user.city.style}</small></div>
                              {!user.city.ownerFortress && <button disabled={busy} onClick={() => adminSetCityLevel(user)}>SET LVL</button>}
                            </div>
                            {user.city.ownerFortress ? (
                              <div className="df-owner-fortress-lock"><b>OWNER ONLY</b><span>All city systems maxed · 4 turrets</span></div>
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
                        ) : <div className="df-owner-no-city">No city yet.</div>}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="df-owner-panel">
                  <div className="df-owner-section-title"><div><small>GROUPS</small><h3>Clans</h3></div><span>{adminData.clans.length}</span></div>
                  <div className="df-owner-clan-grid">
                    {adminData.clans.map((clan) => (
                      <article key={clan.id} className={clan.adminClan ? "admin-clan" : ""}>
                        <div><b>{clan.adminClan ? "♜ " : ""}[{clan.tag}] {clan.name}</b><small>{clan.memberCount} member{clan.memberCount === 1 ? "" : "s"}{clan.adminClan ? " · REQUEST ONLY" : ""}</small></div>
                        <button
                          disabled={busy || (clan.adminClan && !access.permanentOwner)}
                          onClick={() => adminDelete("clan", clan.id, "clan " + clan.name, false)}
                        >Delete</button>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {view === "access" && (
              <div className="df-owner-access">
                <section className="df-owner-access-hero">
                  <span>♜</span>
                  <div>
                    <small>CANONICAL ADMIN CLAN</small>
                    <h3>{adminData.adminClan ? "[" + adminData.adminClan.tag + "] " + adminData.adminClan.name : "Admin clan not found"}</h3>
                    <p>{adminData.adminClan
                      ? "Membership grants the full admin dashboard. Nobody joins automatically; every request waits for Numberstring."
                      : "Create a clan named Admin while logged in as Numberstring. Only that exact owner-controlled clan can grant admin permissions."}</p>
                  </div>
                  {adminData.adminClan && <div className="df-owner-access-code"><small>REQUEST CODE</small><b>{adminData.adminClan.inviteCode}</b></div>}
                </section>

                <div className="df-owner-access-columns">
                  <section className="df-owner-panel">
                    <div className="df-owner-section-title"><div><small>PENDING</small><h3>Join Requests</h3></div><span>{adminData.adminClanRequests.length}</span></div>
                    <div className="df-owner-request-list">
                      {adminData.adminClanRequests.length === 0 && <div className="df-owner-empty">No pending Admin requests.</div>}
                      {adminData.adminClanRequests.map((requestRow) => (
                        <article key={requestRow.playerId}>
                          <div><b>{requestRow.displayName}</b><small>{requestRow.email}</small><span>◆ {Number(requestRow.companyValue || 0).toLocaleString()} · 🏆 {Number(requestRow.trophies || 0).toLocaleString()}</span></div>
                          {access.permanentOwner ? (
                            <div className="df-owner-request-actions">
                              <button className="approve" disabled={busy} onClick={() => adminClanDecision(requestRow, "approve")}>Approve</button>
                              <button className="reject" disabled={busy} onClick={() => adminClanDecision(requestRow, "reject")}>Reject</button>
                            </div>
                          ) : <em>NUMBERSTRING APPROVAL REQUIRED</em>}
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="df-owner-panel">
                    <div className="df-owner-section-title"><div><small>AUTHORIZED</small><h3>Admin Members</h3></div><span>{adminData.adminClanMembers.length}</span></div>
                    <div className="df-owner-member-list">
                      {adminData.adminClanMembers.length === 0 && <div className="df-owner-empty">No Admin members.</div>}
                      {adminData.adminClanMembers.map((member) => (
                        <article key={member.playerId}>
                          <span className="member-icon">{member.permanentOwner ? "♛" : "◆"}</span>
                          <div><b>{member.displayName}</b><small>{member.email}</small></div>
                          <em>{member.permanentOwner ? "PERMANENT OWNER" : "ADMIN"}</em>
                          {access.permanentOwner && !member.permanentOwner && <button disabled={busy} onClick={() => adminClanRemove(member)}>Revoke</button>}
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                {!access.permanentOwner && (
                  <div className="df-owner-delegated-note"><b>Delegated Admin</b><span>You have owner-level management controls through approved Admin-clan membership, but only Numberstring can approve or revoke Admin access.</span></div>
                )}
              </div>
            )}

            {message && <div className="df-owner-message">{message}</div>}
          </main>
        </aside>
      )}

      <style jsx global>{`
        .df-owner-fab{position:fixed;right:18px;bottom:18px;z-index:1401;height:44px;padding:0 15px;display:flex;align-items:center;gap:8px;border:1px solid rgba(228,188,91,.42);border-radius:11px;background:#302515;color:#efd18a;box-shadow:0 12px 32px rgba(0,0,0,.4);font-weight:950;cursor:pointer}.df-owner-fab.infinite{box-shadow:0 0 22px rgba(235,190,70,.18),0 12px 32px rgba(0,0,0,.4)}.df-owner-fab b{font-size:.64rem;letter-spacing:.12em}
        .df-owner-console{position:fixed;inset:0;z-index:1400;width:100vw;height:100svh;display:grid;grid-template-columns:220px minmax(0,1fr);grid-template-rows:72px minmax(0,1fr);overflow:hidden;background:#0d1011;color:#e5e0d6}
        .df-owner-head{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid rgba(255,255,255,.07);background:#121617}.df-owner-brand{display:flex;align-items:center;gap:11px}.df-owner-brand>span{display:grid;place-items:center;width:40px;height:40px;border:1px solid rgba(220,180,82,.2);border-radius:9px;background:rgba(150,105,27,.08);color:#dfbd67;font-size:1.15rem}.df-owner-brand small{display:block;color:#8e7e5d;font-size:.44rem;letter-spacing:.15em;font-weight:900}.df-owner-brand h3{margin:2px 0 0;font-size:1rem}.df-owner-brand p{margin:2px 0 0;color:#697173;font-size:.5rem}.df-owner-head-actions{display:flex;align-items:center;gap:8px}.df-owner-head-actions em{padding:5px 8px;border-radius:6px;background:rgba(71,133,151,.1);color:#9bd1dd;font-size:.44rem;font-style:normal;font-weight:950;letter-spacing:.1em}.df-owner-head-actions button{width:34px;height:34px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.02);color:#aaa;font-size:1.1rem;cursor:pointer}
        .df-owner-sidebar{grid-column:1;grid-row:2;display:flex;flex-direction:column;gap:5px;padding:14px 10px;border-right:1px solid rgba(255,255,255,.06);background:#101415}.df-owner-sidebar>small{padding:5px 8px;color:#545d5f;font-size:.42rem;letter-spacing:.14em;font-weight:900}.df-owner-sidebar>button{display:flex;align-items:center;gap:9px;min-height:56px;padding:8px;border:1px solid transparent;border-radius:8px;background:transparent;color:#828b8d;text-align:left;cursor:pointer}.df-owner-sidebar>button>span{width:26px;text-align:center;font-size:.9rem}.df-owner-sidebar button b,.df-owner-sidebar button em{display:block}.df-owner-sidebar button b{font-size:.58rem;color:#a6adae}.df-owner-sidebar button em{margin-top:2px;color:#5f696b;font-size:.45rem;font-style:normal}.df-owner-sidebar>button.active{border-color:rgba(215,176,85,.13);background:rgba(145,102,31,.07)}.df-owner-sidebar>button.active span,.df-owner-sidebar>button.active b{color:#d8b96d}.df-owner-sidebar-note{margin-top:auto;padding:9px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(255,255,255,.014)}.df-owner-sidebar-note small,.df-owner-sidebar-note b,.df-owner-sidebar-note span{display:block}.df-owner-sidebar-note small{font-size:.39rem;color:#596164;letter-spacing:.1em}.df-owner-sidebar-note b{margin-top:3px;font-size:.52rem}.df-owner-sidebar-note span{margin-top:2px;color:#62696a;font-size:.43rem;line-height:1.35}
        .df-owner-main{grid-column:2;grid-row:2;overflow:auto;padding:22px}.df-owner-page-head{display:flex;align-items:center;justify-content:space-between;margin:0 auto 14px;width:min(1180px,100%)}.df-owner-page-head small{display:block;color:#7d6f51;font-size:.43rem;letter-spacing:.15em;font-weight:900}.df-owner-page-head h2{margin:3px 0 0;font-size:1.35rem}.df-owner-page-head>button{min-height:32px;padding:0 10px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.02);color:#929a9c;font-size:.5rem;cursor:pointer}.df-owner-main>*,.df-owner-manage,.df-owner-access{width:min(1180px,100%);margin-left:auto;margin-right:auto}
        .df-owner-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:11px}.df-owner-stat-grid article{display:flex;align-items:center;gap:9px;padding:12px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:#14191a}.df-owner-stat-grid article>span{font-size:1rem}.df-owner-stat-grid small,.df-owner-stat-grid b{display:block}.df-owner-stat-grid small{font-size:.4rem;color:#667073;letter-spacing:.08em}.df-owner-stat-grid b{margin-top:2px;font-size:.9rem}
        .df-owner-panel{padding:13px;border:1px solid rgba(255,255,255,.055);border-radius:10px;background:#14191a}.df-owner-panel+.df-owner-panel{margin-top:10px}.df-owner-section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.df-owner-section-title small{display:block;color:#656e70;font-size:.4rem;letter-spacing:.1em}.df-owner-section-title h3{margin:2px 0 0;font-size:.73rem}.df-owner-section-title>span{color:#737c7e;font-size:.47rem}
        .df-owner-infinity{display:flex;align-items:center;gap:10px;padding:11px;margin-bottom:8px;border:1px solid rgba(220,178,75,.11);border-radius:8px;background:rgba(120,84,21,.05)}.df-owner-infinity.on{border-color:rgba(231,191,81,.24);background:rgba(130,90,18,.09)}.df-owner-infinity>div{flex:1}.df-owner-infinity small,.df-owner-infinity b,.df-owner-infinity span{display:block}.df-owner-infinity small{font-size:.4rem;color:#827352;letter-spacing:.1em}.df-owner-infinity b{margin-top:2px;color:#ddbd70;font-size:.64rem}.df-owner-infinity span{margin-top:2px;color:#6f7270;font-size:.48rem}.df-owner-infinity>button{min-width:76px;min-height:35px;border:1px solid rgba(221,179,77,.16);border-radius:7px;background:#5e451b;color:#dfc278;font-size:.52rem;font-weight:900;cursor:pointer}
        .df-owner-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.df-owner-grid button{min-height:62px;padding:9px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(255,255,255,.02);color:#d2c5aa;text-align:left;cursor:pointer}.df-owner-grid button b,.df-owner-grid button small{display:block}.df-owner-grid button b{font-size:.59rem}.df-owner-grid button small{margin-top:3px;color:#697071;font-size:.46rem}.df-owner-grid .max{grid-column:span 2;text-align:center;border-color:rgba(214,173,77,.13);background:rgba(130,90,23,.06)}
        .df-owner-manage{display:grid;gap:10px}.df-owner-account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.df-owner-user-card{padding:9px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(255,255,255,.015)}.df-owner-user-main{display:flex;align-items:center;gap:7px}.df-owner-user-main>div{flex:1;min-width:0}.df-owner-user-main b,.df-owner-user-main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.df-owner-user-main b{font-size:.57rem}.df-owner-user-main small{margin-top:2px;color:#646d6e;font-size:.45rem}.df-owner-user-main>button,.df-owner-clan-grid article>button{min-height:27px;border:1px solid rgba(190,75,62,.14);border-radius:6px;background:rgba(116,42,34,.08);color:#ca877d;font-size:.43rem;cursor:pointer}.permanent{padding:4px 6px;border-radius:5px;background:rgba(171,122,29,.09);color:#ddbd6c;font-size:.4rem;font-weight:950}
        .df-owner-city-admin{display:grid;gap:5px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.045)}.df-owner-city-summary{display:flex;align-items:center;gap:6px}.df-owner-city-summary>span{font-size:.85rem}.df-owner-city-summary>div{flex:1;min-width:0}.df-owner-city-summary b,.df-owner-city-summary small{display:block}.df-owner-city-summary b{font-size:.51rem}.df-owner-city-summary small{margin-top:2px;color:#676f70;font-size:.41rem}.df-owner-city-summary>button{min-height:25px;border:1px solid rgba(206,169,83,.12);border-radius:5px;background:rgba(122,87,28,.07);color:#bda05f;font-size:.4rem;cursor:pointer}.df-owner-city-grants{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}.df-owner-city-grants button{min-height:26px;border:1px solid rgba(206,169,83,.08);border-radius:5px;background:rgba(122,87,28,.045);color:#aa925e;font-size:.39rem;cursor:pointer}.df-owner-city-grants small{color:#776947}.df-owner-city-admin.fortress{padding:6px;border:1px solid rgba(94,195,220,.11);border-radius:7px;background:rgba(43,94,107,.035)}.df-owner-fortress-lock{display:flex;align-items:center;justify-content:space-between;padding:6px;border-radius:6px;background:rgba(51,111,127,.05)}.df-owner-fortress-lock b{color:#96cfdb;font-size:.42rem}.df-owner-fortress-lock span{color:#627d83;font-size:.39rem}.df-owner-no-city{margin-top:7px;padding:5px;border-radius:5px;background:rgba(255,255,255,.012);color:#5f6869;font-size:.43rem}
        .df-owner-clan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.df-owner-clan-grid article{display:flex;align-items:center;gap:7px;padding:8px;border:1px solid rgba(255,255,255,.05);border-radius:7px;background:rgba(255,255,255,.015)}.df-owner-clan-grid article>div{flex:1;min-width:0}.df-owner-clan-grid b,.df-owner-clan-grid small{display:block}.df-owner-clan-grid b{font-size:.53rem}.df-owner-clan-grid small{margin-top:2px;color:#636c6e;font-size:.43rem}.df-owner-clan-grid .admin-clan{border-color:rgba(91,190,214,.11);background:rgba(43,95,108,.04)}
        .df-owner-access-hero{display:flex;align-items:center;gap:12px;padding:14px;margin-bottom:10px;border:1px solid rgba(89,190,215,.12);border-radius:10px;background:rgba(43,94,108,.05)}.df-owner-access-hero>span{font-size:1.45rem;color:#91cfdd}.df-owner-access-hero>div:nth-child(2){flex:1;min-width:0}.df-owner-access-hero small{display:block;color:#608a94;font-size:.4rem;letter-spacing:.1em}.df-owner-access-hero h3{margin:2px 0 0;font-size:.78rem}.df-owner-access-hero p{margin:3px 0 0;color:#707b7e;font-size:.47rem;line-height:1.4}.df-owner-access-code{padding:8px 10px;border:1px solid rgba(86,183,207,.1);border-radius:7px;background:rgba(0,0,0,.12);text-align:center}.df-owner-access-code b{display:block;margin-top:2px;color:#a9dce7;font-size:.65rem;letter-spacing:.1em}
        .df-owner-access-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.df-owner-request-list,.df-owner-member-list{display:grid;gap:5px}.df-owner-request-list article,.df-owner-member-list article{display:flex;align-items:center;gap:7px;padding:8px;border:1px solid rgba(255,255,255,.045);border-radius:7px;background:rgba(255,255,255,.012)}.df-owner-request-list article>div:first-child,.df-owner-member-list article>div{flex:1;min-width:0}.df-owner-request-list b,.df-owner-request-list small,.df-owner-request-list span,.df-owner-member-list b,.df-owner-member-list small{display:block}.df-owner-request-list b,.df-owner-member-list b{font-size:.51rem}.df-owner-request-list small,.df-owner-member-list small{margin-top:2px;color:#626b6d;font-size:.42rem}.df-owner-request-list span{margin-top:2px;color:#756b54;font-size:.39rem}.df-owner-request-actions{display:flex!important;gap:3px;flex:0 0 auto!important}.df-owner-request-actions button,.df-owner-member-list article>button{min-height:27px;padding:0 7px;border-radius:5px;font-size:.4rem;cursor:pointer}.df-owner-request-actions .approve{border:1px solid rgba(70,180,110,.13);background:rgba(48,112,72,.07);color:#80c99a}.df-owner-request-actions .reject,.df-owner-member-list article>button{border:1px solid rgba(183,72,59,.13);background:rgba(109,42,34,.07);color:#c77d73}.df-owner-request-list em,.df-owner-member-list em{color:#756f62;font-size:.38rem;font-style:normal}.member-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,.025);color:#87c4d1}.df-owner-empty{padding:16px;border:1px dashed rgba(255,255,255,.06);border-radius:7px;color:#5d6668;text-align:center;font-size:.47rem}.df-owner-delegated-note{margin-top:10px;padding:9px;border:1px solid rgba(214,174,78,.09);border-radius:7px;background:rgba(111,79,25,.035)}.df-owner-delegated-note b,.df-owner-delegated-note span{display:block}.df-owner-delegated-note b{color:#b99d5c;font-size:.5rem}.df-owner-delegated-note span{margin-top:2px;color:#68665f;font-size:.45rem}
        .df-owner-message{position:sticky;bottom:0;margin-top:10px;padding:8px 10px;border:1px solid rgba(218,178,83,.1);border-radius:7px;background:#272217;color:#ccb16e;font-size:.48rem}
        @media(max-width:850px){.df-owner-console{grid-template-columns:170px minmax(0,1fr)}.df-owner-account-grid,.df-owner-access-columns{grid-template-columns:1fr}.df-owner-stat-grid{grid-template-columns:1fr 1fr}.df-owner-grid{grid-template-columns:1fr 1fr}.df-owner-grid .max{grid-column:1/-1}}
        @media(max-width:600px){.df-owner-console{grid-template-columns:1fr;grid-template-rows:64px auto minmax(0,1fr)}.df-owner-head{grid-column:1;grid-row:1;padding:0 9px}.df-owner-brand p{display:none}.df-owner-sidebar{grid-column:1;grid-row:2;flex-direction:row;padding:5px;overflow-x:auto;border-right:0;border-bottom:1px solid rgba(255,255,255,.06)}.df-owner-sidebar>small,.df-owner-sidebar-note{display:none}.df-owner-sidebar>button{min-width:125px;min-height:43px}.df-owner-main{grid-column:1;grid-row:3;padding:11px}.df-owner-page-head h2{font-size:1rem}.df-owner-stat-grid{gap:6px}.df-owner-clan-grid{grid-template-columns:1fr}.df-owner-access-hero{align-items:flex-start;flex-wrap:wrap}.df-owner-access-code{width:100%}}
      `}</style>
    </>
  );
}
