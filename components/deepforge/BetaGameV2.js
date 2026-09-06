import { useEffect, useMemo, useRef, useState } from "react";
import InfiniteWorld from "./InfiniteWorld";
import WorldCityOverlay from "./WorldCityOverlay";
import ClanScreen from "./ClanScreen";
import ClanWarScreen from "./ClanWarScreen";
import { BUILDINGS, INITIAL, RIVALS, SAVE_KEY, challengeFor } from "./data";
import {
  RESOURCE_TYPES,
  addDigCircle,
  depositsHitByCircle,
  emptyWorldChanges,
  markDepositMined,
  normalizeWorldChanges,
  surfaceHeight,
} from "./world";
import { checkCloudBackend, cloudEnabled, cloudLogin, cloudLogout, cloudSignup, getOrCreatePlayerId, loadCloudAuth, loadCloudSave, saveCloudSave, syncClanProfile } from "./cloudSync";
import { createMultiplayerCity, leaveMultiplayerWorld, syncMultiplayerPresence, updateMultiplayerCityProfile } from "./multiplayer";
import { loadSharedWorld, submitSharedDigs } from "./sharedWorld";
import { attackPlayer, loadCombatStatus, takeZombieDamage } from "./combat";

const DEFAULT_PLAYER = { x: 0, y: surfaceHeight(0) - 0.38 };
const MAX_SHARED_DIG_RADIUS = 1.25;
const CITY_PROTECTED_RADIUS = 9;

function buildingMaxHp(key, level) {
  const base = key === "walls" ? 160 : 100;
  return base + Math.max(0, Number(level) || 0) * (key === "walls" ? 55 : 45);
}

function normalizeSave(raw) {
  if (!raw || typeof raw !== "object") return null;
  const isContinuousWorld = Number(raw.version) >= 3;
  const player = isContinuousWorld && raw.player && Number.isFinite(raw.player.x) && Number.isFinite(raw.player.y)
    ? raw.player
    : DEFAULT_PLAYER;
  return {
    updatedAt: Number(raw.updatedAt) || 0,
    player,
    game: raw.game
      ? (function () {
          const clean = Object.keys(INITIAL).reduce(function (acc, key) {
            if (key !== "buildings" && Object.prototype.hasOwnProperty.call(raw.game, key)) {
              acc[key] = raw.game[key];
            }
            return acc;
          }, {});
          const buildings = { ...INITIAL.buildings, ...(raw.game.buildings || {}) };
          const rawBuildingHp = raw.game.buildingHp && typeof raw.game.buildingHp === "object" ? raw.game.buildingHp : {};
          const buildingHp = Object.keys(INITIAL.buildingHp).reduce(function (acc, key) {
            const maxHp = buildingMaxHp(key, buildings[key] || 0);
            const stored = Number(rawBuildingHp[key]);
            acc[key] = Number.isFinite(stored) ? Math.max(0, Math.min(maxHp, stored)) : maxHp;
            return acc;
          }, {});
          return {
            ...INITIAL,
            ...clean,
            buildings,
            buildingHp,
            researchTech: { ...INITIAL.researchTech, ...(raw.game.researchTech || {}) },
          };
        })()
      : INITIAL,
    worldChanges: isContinuousWorld ? normalizeWorldChanges(raw.worldChanges) : emptyWorldChanges(),
  };
}

function Stat(props) {
  return <div className="df2-stat"><span>{props.icon}</span><b>{props.value}</b><small>{props.label}</small></div>;
}

function RigPanel(props) {
  const game = props.game;
  const items = [
    ["drill", "⛏", "Pick & drill", props.drillDamage + " power"],
    ["cargoMax", "▰", "Cargo cart", game.cargoMax + " capacity"],
    ["armor", "🛡", "Work gear", game.maxHp + " protection"],
    ["blaster", "⚔", "Raid gear", "level " + game.blaster],
  ];
  return (
    <div className="df2-rig-panel">
      <div className="df2-panel-title"><b>MINING RIG</b><span>upgrade with ore money</span></div>
      <div className="df2-upgrade-grid">
        {items.map(function (item) {
          const key = item[0];
          return (
            <button key={key} onClick={function () { props.upgradeGear(key); }}>
              <span>{item[1]}</span><b>{item[2]}</b><small>{item[3]}</small>
              <em>{"$" + props.gearCost(key).toLocaleString()}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorldScreen(props) {
  const game = props.game;
  const [clock, setClock] = useState(Date.now());
  useEffect(function () {
    const timer = setInterval(function () { setClock(Date.now()); }, 1000);
    return function () { clearInterval(timer); };
  }, []);
  const secondsLeft = props.resetAt ? Math.max(0, Math.ceil((props.resetAt - clock) / 1000)) : 0;
  const resetLabel = String(Math.floor(secondsLeft / 60)).padStart(2, "0") + ":" + String(secondsLeft % 60).padStart(2, "0");
  return (
    <div className="df2-world-screen">
      <InfiniteWorld
        player={props.player}
        worldChanges={props.worldChanges}
        onPosition={props.onPosition}
        onDrill={props.onDrill}
        paused={props.paused}
        drillRadius={props.drillRadius}
        resetKey={props.resetKey}
        cities={props.cities}
        remotePlayers={props.remotePlayers}
        myUserId={props.myUserId}
        playerHp={props.playerHp}
        playerMaxHp={props.playerMaxHp}
        swordDamage={props.swordDamage}
        onPlayerAttack={props.onPlayerAttack}
        onZombieDamage={props.onZombieDamage}
        onZombieKill={props.onZombieKill}
        cityBuildings={game.buildings}
        cityBuildingHp={game.buildingHp}
        onBuildingDamage={props.onBuildingDamage}
      />

      <WorldCityOverlay
        player={props.player}
        cities={props.cities}
        players={props.remotePlayers}
        myCity={props.myCity}
        myUserId={props.myUserId}
        waypoint={props.waypoint}
        onWaypoint={props.onWaypoint}
        onCreateCity={props.onCreateCity}
        onCustomizeCity={props.onCustomizeCity}
        game={props.game}
        buildingCost={props.buildingCost}
        upgradeBuilding={props.upgradeBuilding}
        gearCost={props.gearCost}
        upgradeGear={props.upgradeGear}
        drillDamage={props.drillDamage}
      />

      <div className="df2-world-overlay">
        <div className="df2-cargo-strip">
          <b>CARGO {game.cargoCount}/{game.cargoMax}</b>
          <div>
            {Object.keys(game.cargo).length === 0 && <small>Find ore in the dirt.</small>}
            {Object.entries(game.cargo).map(function (entry) {
              const type = entry[0];
              return <span key={type}>{RESOURCE_TYPES[type] ? RESOURCE_TYPES[type].icon : "◆"} {entry[1]}</span>;
            })}
          </div>
          <button onClick={props.sellCargo}>SELL</button>
        </div>
      </div>
      <div style={{position:"absolute",left:12,top:94,zIndex:17,padding:"7px 9px",border:"1px solid rgba(255,255,255,.09)",borderRadius:8,background:"rgba(12,18,21,.82)",color:"#d7e0e2",fontSize:"10px",pointerEvents:"none"}}>
        <b style={{display:"block",fontSize:"9px",letterSpacing:".08em"}}>HOURLY MAP RESET</b>
        <span style={{display:"block",marginTop:2,color:props.sharedR2?"#8fe0ad":"#d8a46d"}}>{props.sharedR2 ? resetLabel : "R2 OFFLINE"}</span>
      </div>
    </div>
  );
}

function EmpireScreen(props) {
  return (
    <div className="df2-screen-scroll">
      <div className="df2-town-hero">
        <div className="df2-town-land">
          <span className="df2-mine-mouth">MINE</span>
          <i className="df2-building b1" /><i className="df2-building b2" /><i className="df2-building b3" />
          <i className="df2-road" />
        </div>
        <div><span className="df-kicker">YOUR MINING TOWN</span><h2>Dust Creek</h2><p>Turn ore into a working mining company and town.</p></div>
      </div>
      <div className="df2-building-grid">
        {BUILDINGS.map(function (building) {
          const level = props.game.buildings[building.key] || 0;
          const cost = props.buildingCost(building);
          return (
            <article key={building.key}>
              <span>{building.icon}</span>
              <div><small>LEVEL {level}</small><b>{building.name}</b><p>{building.desc}</p></div>
              <button onClick={function () { props.upgradeBuilding(building); }}>{"$" + cost.toLocaleString()}</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function LeagueScreen(props) {
  return (
    <div className="df2-screen-scroll df2-league">
      <section>
        <span className="df-kicker">MINING LEAGUE</span><h2>Rival companies</h2>
        <p>Prototype rivals are simulated company snapshots.</p>
        <div className="df2-rivals">
          {RIVALS.map(function (rival, index) {
            return (
              <button key={rival.name} className={props.selectedRival === index ? "active" : ""} onClick={function () { props.setSelectedRival(index); }}>
                <span>{rival.name.slice(0, 2).toUpperCase()}</span>
                <div><b>{rival.name}</b><small>{rival.city}</small></div>
                <em>🏆 {rival.trophies}</em>
              </button>
            );
          })}
        </div>
        <button className="df2-raid" onClick={props.raid}>Raid {RIVALS[props.selectedRival].name}</button>
        <div className="df2-raid-log">{props.raidLog}</div>
      </section>
      <section>
        <span className="df-kicker">RANKINGS</span><h2>Bronze claim</h2>
        <div className="df2-ranking">
          {props.leaderboard.map(function (entry, index) {
            return <div key={entry.name} className={entry.npc ? "" : "you"}><span>#{index + 1}</span><b>{entry.name}</b><em>{entry.trophies} 🏆</em></div>;
          })}
        </div>
      </section>
    </div>
  );
}

function LabScreen(props) {
  return (
    <div className="df2-screen-scroll">
      <div className="df2-lab-hero">
        <div>📐</div>
        <section><span className="df-kicker">ENGINEERING SHED</span><h2>Learn because the mine needs it.</h2><p>Math improves production, surveying, construction, and raids.</p></section>
      </div>
      <div className="df2-lab-stats">
        <Stat icon="📘" value={props.game.research} label="research" />
        <Stat icon="⚡" value={props.game.boostCharges} label="boosts" />
        <Stat icon="⛏" value={props.game.blocksMined} label="ore mined" />
      </div>
      <button className="df2-challenge-button" onClick={props.openChallenge}>Start engineering challenge</button>
      <div className="df2-learning">
        <article><b>Ratios</b><p>Mix alloys and refinery batches.</p></article>
        <article><b>Algebra</b><p>Calibrate machines and production rates.</p></article>
        <article><b>Geometry</b><p>Plan shafts, lots, roads, and buildings.</p></article>
        <article><b>Percent</b><p>Work with profit, efficiency, and damage.</p></article>
      </div>
    </div>
  );
}

function ResearchScreen(props) {
  const tech = props.game.researchTech || {};
  const projects = [
    { key: "drilling", icon: "⛏", name: "Drill Engineering", effect: "+0.04 m excavation radius per level" },
    { key: "processing", icon: "⚙", name: "Ore Processing", effect: "+5% ore sale value per level" },
    { key: "survey", icon: "🧭", name: "Geological Survey", effect: "More research from valuable mineral samples" },
    { key: "tactics", icon: "⚔", name: "Clan Tactics", effect: "+12% personal war contribution per level" },
  ];

  return (
    <div className="df2-screen-scroll df-research-screen">
      <div className="df-research-hero">
        <div className="df-research-icon">🔬</div>
        <section>
          <span className="df-kicker">RESEARCH WORKSHOP</span>
          <h2>Turn mineral samples into better technology.</h2>
          <p>Research is earned while mining. Spend it on permanent mine and clan upgrades.</p>
        </section>
        <div className="df-research-points"><small>AVAILABLE</small><b>{props.game.research}</b><span>research</span></div>
      </div>

      <div className="df-research-grid">
        {projects.map(function (project) {
          const level = tech[project.key] || 0;
          const cost = props.researchCost(project.key);
          return (
            <article key={project.key}>
              <span>{project.icon}</span>
              <div><small>LEVEL {level}</small><b>{project.name}</b><p>{project.effect}</p></div>
              <button disabled={props.game.research < cost} onClick={function () { props.buyResearch(project.key); }}>
                {cost} RP
              </button>
            </article>
          );
        })}
      </div>

      <div className="df-research-note">
        <b>How research is earned</b>
        <span>Every third ordinary ore sample can produce research. Quartz and gold produce extra research automatically.</span>
      </div>
    </div>
  );
}

export default function BetaGameV2() {
  const [player, setPlayer] = useState(DEFAULT_PLAYER);
  const [game, setGame] = useState(INITIAL);
  const [worldChanges, setWorldChanges] = useState(emptyWorldChanges);
  const [tab, setTab] = useState("world");
  const [notice, setNotice] = useState("Drag anywhere on the dirt to move your miner.");
  const [challenge, setChallenge] = useState(null);
  const [challengeResult, setChallengeResult] = useState(null);
  const [selectedRival, setSelectedRival] = useState(0);
  const [raidLog, setRaidLog] = useState("Scout the league, upgrade, then challenge another mining company.");
  const [loaded, setLoaded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [cloudStatus, setCloudStatus] = useState(cloudEnabled() ? "D1 connecting" : "D1-ready · local save");
  const [multiplayer, setMultiplayer] = useState({ players: [], cities: [], me: null });
  const [cityWaypoint, setCityWaypoint] = useState(null);
  const [sharedWorldMeta, setSharedWorldMeta] = useState({ r2: false, resetAt: 0, hourKey: null, maxDigRadius: MAX_SHARED_DIG_RADIUS, cityProtectedRadius: CITY_PROTECTED_RADIUS, error: "" });
  const [combatStatus, setCombatStatus] = useState({ hp: 100, maxHp: 100, swordDamage: 14, clanId: "", defeated: false });
  const playerIdRef = useRef(null);
  const lastCloudSaveRef = useRef(0);
  const multiplayerLiveRef = useRef({ player: DEFAULT_PLAYER, companyValue: 0, trophies: 0 });
  const pendingDigsRef = useRef([]);
  const sharedHourRef = useRef(null);
  const defeatHandledRef = useRef(false);
  const zombieDamageBusyRef = useRef(false);
  const myCityXRef = useRef(0);

  const researchTech = game.researchTech || INITIAL.researchTech;
  const drillDamage = game.drill + Math.floor((game.buildings.workshop || 0) / 2);
  const drillRadius = Math.min(MAX_SHARED_DIG_RADIUS, 0.7 + Math.min(0.42, drillDamage * 0.055) + (researchTech.drilling || 0) * 0.04);
  const refineryMult = 1 + (game.buildings.refinery || 0) * 0.12 + (researchTech.processing || 0) * 0.05;
  const academyBonus = game.buildings.academy || 0;
  const cityDefense = game.armor * 15 + (game.buildings.walls || 0) * 18;
  const raidPower = game.blaster * 22 + game.drill * 8 + Math.floor(game.trophies / 20);
  const companyValue = Math.round(
    game.coins +
    game.blocksMined * 4 +
    game.trophies * 5 +
    Object.values(game.buildings).reduce(function (a, b) { return a + b; }, 0) * 180 +
    Object.values(researchTech).reduce(function (a, b) { return a + b; }, 0) * 110
  );
  const warPower = Math.round((raidPower + game.armor * 12 + companyValue * 0.012) * (1 + (researchTech.tactics || 0) * 0.12));
  multiplayerLiveRef.current = { player, companyValue, trophies: game.trophies, buildings: game.buildings };
  const myCity = multiplayer.me && multiplayer.me.hasCity
    ? (multiplayer.cities.find(function (city) { return city.ownerId === multiplayer.me.id; }) || { ownerId: multiplayer.me.id, ownerName: multiplayer.me.name, x: multiplayer.me.cityX, online: true, level: 1, upgrades: {} })
    : null;
  myCityXRef.current = myCity ? Number(myCity.x) || 0 : 0;

  const leaderboard = useMemo(function () {
    return RIVALS.map(function (rival) { return { name: rival.name, trophies: rival.trophies, npc: true }; })
      .concat([{ name: "YOU", trophies: game.trophies, npc: false }])
      .sort(function (a, b) { return b.trophies - a.trophies; });
  }, [game.trophies]);

  useEffect(function () {
    let mounted = true;
    async function loadAuth() {
      try {
        const user = await loadCloudAuth();
        if (mounted) setAuthUser(user);
      } catch (_) {
        if (mounted) setAuthUser(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }
    loadAuth();
    return function () { mounted = false; };
  }, []);

  useEffect(function () {
    let mounted = true;
    checkCloudBackend()
      .then(function (health) {
        if (!mounted) return;
        setCloudStatus(health && health.r2 ? "D1 + R2 connected" : "D1 connected");
      })
      .catch(function (error) {
        if (!mounted) return;
        setCloudStatus("Cloud backend missing");
      });
    return function () { mounted = false; };
  }, []);


  useEffect(function () {
    if (!authUser || !authUser.id) {
      setMultiplayer({ players: [], cities: [], me: null });
      setCityWaypoint(null);
      return undefined;
    }

    let stopped = false;
    let timer = null;
    async function tick() {
      const live = multiplayerLiveRef.current;
      try {
        const data = await syncMultiplayerPresence({
          x: live.player.x,
          y: live.player.y,
          companyValue: live.companyValue,
          trophies: live.trophies,
          buildings: live.buildings,
        });
        if (stopped) return;
        const next = {
          players: Array.isArray(data.players) ? data.players : [],
          cities: Array.isArray(data.cities) ? data.cities : [],
          me: data.me || null,
        };
        setMultiplayer(next);
        const syncedCity = next.me && next.me.hasCity
          ? next.cities.find(function (city) { return city.ownerId === next.me.id; })
          : null;
        if (syncedCity && syncedCity.upgrades) {
          setGame(function (current) {
            let changed = false;
            const buildings = { ...current.buildings };
            const buildingHp = { ...INITIAL.buildingHp, ...(current.buildingHp || {}) };
            Object.keys(INITIAL.buildings).forEach(function (key) {
              const serverLevel = Math.max(0, Number(syncedCity.upgrades[key]) || 0);
              const localLevel = Math.max(0, Number(buildings[key]) || 0);
              if (serverLevel > localLevel) {
                buildings[key] = serverLevel;
                buildingHp[key] = buildingMaxHp(key, serverLevel);
                changed = true;
              }
            });
            return changed ? { ...current, buildings, buildingHp } : current;
          });
        }
        setCityWaypoint(function (current) {
          const own = next.me ? next.cities.find(function (city) { return city.ownerId === next.me.id; }) : null;
          if (!current) return own || null;
          return next.cities.find(function (city) { return city.ownerId === current.ownerId; }) || own || null;
        });
      } catch (_) {
        if (!stopped) setMultiplayer(function (current) { return { ...current, players: [] }; });
      }
    }

    tick();
    timer = setInterval(tick, 1000);
    return function () {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [authUser ? authUser.id : ""]);

  useEffect(function () {
    if (!authUser || !authUser.id) {
      setCombatStatus({ hp: 100, maxHp: 100, swordDamage: 14, clanId: "", defeated: false });
      defeatHandledRef.current = false;
      return undefined;
    }
    let stopped = false;
    async function tickCombat() {
      try {
        const data = await loadCombatStatus();
        if (stopped) return;
        setCombatStatus(data);
        setGame(function (current) {
          if (current.hp === Number(data.hp) && current.maxHp === Number(data.maxHp)) return current;
          return { ...current, hp: Number(data.hp), maxHp: Number(data.maxHp) };
        });
        if (data.defeated && !defeatHandledRef.current) {
          defeatHandledRef.current = true;
          const x = myCityXRef.current;
          setPlayer({ x: x, y: surfaceHeight(x) - 0.42 });
          setResetKey(function (value) { return value + 1; });
          setNotice("You were defeated. Respawning at your city…");
        }
        if (!data.defeated && Number(data.hp) > 0) defeatHandledRef.current = false;
      } catch (_) {}
    }
    tickCombat();
    const timer = setInterval(tickCombat, 900);
    return function () { stopped = true; clearInterval(timer); };
  }, [authUser ? authUser.id : ""]);

  useEffect(function () {
    if (!loaded || !authUser || !authUser.id) return undefined;
    let cancelled = false;
    loadCloudSave(authUser.id)
      .then(function (response) {
        if (cancelled || !response) return;
        const remote = normalizeSave(response && response.data ? response.data : response);
        if (!remote) return;
        setPlayer(remote.player);
        setGame(remote.game);
        setNotice("Account progression loaded from D1.");
      })
      .catch(function () {});
    return function () { cancelled = true; };
  }, [loaded, authUser ? authUser.id : ""]);

  useEffect(function () {
    if (!authUser || !authUser.id) {
      sharedHourRef.current = null;
      pendingDigsRef.current = [];
      setSharedWorldMeta({ r2: false, resetAt: 0, hourKey: null, maxDigRadius: MAX_SHARED_DIG_RADIUS, cityProtectedRadius: CITY_PROTECTED_RADIUS, error: "Log in for the shared map." });
      return undefined;
    }
    let stopped = false;
    async function refreshSharedWorld() {
      try {
        const data = await loadSharedWorld();
        if (stopped) return;
        const nextHour = Number(data.hourKey);
        const changedHour = sharedHourRef.current !== null && sharedHourRef.current !== nextHour;
        sharedHourRef.current = nextHour;
        let nextWorld = normalizeWorldChanges(data.worldChanges);
        pendingDigsRef.current.forEach(function (dig) { nextWorld = addDigCircle(nextWorld, dig); });
        setWorldChanges(nextWorld);
        setSharedWorldMeta({
          r2: Boolean(data.r2),
          resetAt: Number(data.resetAt) || 0,
          hourKey: nextHour,
          maxDigRadius: Math.min(MAX_SHARED_DIG_RADIUS, Number(data.maxDigRadius) || MAX_SHARED_DIG_RADIUS),
          cityProtectedRadius: Number(data.cityProtectedRadius) || CITY_PROTECTED_RADIUS,
          error: "",
        });
        if (changedHour) {
          pendingDigsRef.current = [];
          setPlayer(function (current) { return { x: current.x, y: surfaceHeight(current.x) - 0.42 }; });
          setResetKey(function (value) { return value + 1; });
          setNotice("New hourly map started. Terrain reset; account progress was kept.");
        }
      } catch (error) {
        if (stopped) return;
        const data = error && error.data ? error.data : {};
        setSharedWorldMeta(function (current) { return { ...current, r2: false, resetAt: Number(data.resetAt) || current.resetAt, error: error && error.message ? error.message : "R2 world unavailable." }; });
      }
    }
    refreshSharedWorld();
    const timer = setInterval(refreshSharedWorld, 1600);
    return function () { stopped = true; clearInterval(timer); };
  }, [authUser ? authUser.id : ""]);

  useEffect(function () {
    if (!authUser || !authUser.id) return undefined;
    let busy = false;
    const timer = setInterval(async function () {
      if (busy || !sharedWorldMeta.r2 || pendingDigsRef.current.length === 0) return;
      busy = true;
      const batch = pendingDigsRef.current.splice(0, 10);
      try {
        await submitSharedDigs(batch);
      } catch (error) {
        if (!(error && error.data && error.data.protectedCity)) pendingDigsRef.current = batch.concat(pendingDigsRef.current).slice(-80);
        if (error && error.message) setNotice(error.message);
      } finally {
        busy = false;
      }
    }, 450);
    return function () { clearInterval(timer); };
  }, [authUser ? authUser.id : "", sharedWorldMeta.r2]);

  useEffect(function () {
    let cancelled = false;
    const playerId = getOrCreatePlayerId();
    playerIdRef.current = playerId;
    let local = null;
    try {
      local = normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"));
      if (local) { setPlayer(local.player); setGame(local.game); setWorldChanges(local.worldChanges); }
    } catch (_) {}

    async function loadRemote() {
      if (!cloudEnabled()) { setLoaded(true); return; }
      try {
        const response = await loadCloudSave(playerId);
        if (cancelled) return;
        const remote = normalizeSave(response && response.data ? response.data : response);
        if (remote && (!local || remote.updatedAt > local.updatedAt)) {
          setPlayer(remote.player); setGame(remote.game); setWorldChanges(remote.worldChanges); setNotice("Cloudflare D1 save loaded.");
        }
        setCloudStatus("D1 connected");
      } catch (_) { if (!cancelled) setCloudStatus("D1 offline · local save"); }
      if (!cancelled) setLoaded(true);
    }
    loadRemote();
    return function () { cancelled = true; };
  }, []);

  useEffect(function () {
    if (!loaded) return undefined;
    const timer = setTimeout(function () {
      const accountPlayerId = (authUser && authUser.id) || playerIdRef.current;
      const payload = { version: 4, updatedAt: Date.now(), player: player, game: game, worldChanges: authUser ? emptyWorldChanges() : normalizeWorldChanges(worldChanges) };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch (_) {}
      if (cloudEnabled() && accountPlayerId && Date.now() - lastCloudSaveRef.current > 3500) {
        lastCloudSaveRef.current = Date.now();
        setCloudStatus(authUser ? "Account saving" : "D1 saving");
        saveCloudSave(accountPlayerId, payload)
          .then(function () {
            setCloudStatus("D1 synced");
            return syncClanProfile((authUser && authUser.id) || playerIdRef.current, companyValue, game.trophies).catch(function () {});
          })
          .catch(function () { setCloudStatus("D1 offline · local save"); });
      }
    }, 650);
    return function () { clearTimeout(timer); };
  }, [player, game, worldChanges, loaded, authUser]);

  function drill(excavation) {
    if (challenge || tab !== "world") return;

    const radius = Math.min(sharedWorldMeta.maxDigRadius || MAX_SHARED_DIG_RADIUS, Number(excavation.radius) || drillRadius);
    const circle = {
      x: Number(excavation.x),
      y: Number(excavation.y),
      r: radius,
      shape: "square",
    };

    const protectedRadius = sharedWorldMeta.cityProtectedRadius || CITY_PROTECTED_RADIUS;
    const protectedCity = multiplayer.cities.find(function (city) { return Math.abs(Number(city.x) - circle.x) <= protectedRadius; });
    if (protectedCity) {
      setNotice("City ground is protected. Walk outside " + protectedCity.ownerName + "'s city limits to mine.");
      return;
    }

    const hits = depositsHitByCircle(circle.x, circle.y, circle.r, worldChanges);
    if (hits.length && game.cargoCount >= game.cargoMax) {
      setNotice("Cargo cart is full. Sell ore before cutting into this deposit.");
      return;
    }

    let nextChanges = addDigCircle(worldChanges, circle);
    let collected = null;

    if (hits.length) {
      collected = hits[0];
      nextChanges = markDepositMined(nextChanges, collected.id);
    }

    setWorldChanges(nextChanges);
    if (authUser && authUser.id && sharedWorldMeta.r2) {
      pendingDigsRef.current.push({ x: circle.x, y: circle.y, r: circle.r, shape: "square" });
      if (pendingDigsRef.current.length > 80) pendingDigsRef.current.splice(0, pendingDigsRef.current.length - 80);
    }

    if (collected) {
      const type = collected.type;
      const nextCount = game.blocksMined + 1;
      const baseResearch = type === "quartz" || type === "gold" ? 2 : (nextCount % 3 === 0 ? 1 : 0);
      const surveyBonus = baseResearch > 0 ? Math.floor((researchTech.survey || 0) / 2) : 0;
      setGame(function (g) {
        return {
          ...g,
          cargo: { ...g.cargo, [type]: (g.cargo[type] || 0) + 1 },
          cargoCount: g.cargoCount + 1,
          blocksMined: g.blocksMined + 1,
          research: g.research + baseResearch + surveyBonus,
        };
      });
      setNotice(
        "Exposed and collected " + collected.resource.name +
        (baseResearch + surveyBonus > 0 ? " · +" + (baseResearch + surveyBonus) + " research." : ".")
      );
    } else {
      const depth = circle.y - surfaceHeight(circle.x);
      setNotice(depth < 5.5 ? "Excavated a square cut through soil." : depth < 22 ? "Excavated a square cut through compact earth." : "Cut a square section of bedrock.");
    }
  }

  async function handleCreateCity(name, style) {
    if (!authUser || !authUser.id) {
      setNotice("Log in before founding a city.");
      return false;
    }
    try {
      const data = await createMultiplayerCity(name, style);
      const next = {
        players: Array.isArray(data.players) ? data.players : [],
        cities: Array.isArray(data.cities) ? data.cities : [],
        me: data.me || null,
      };
      setMultiplayer(next);
      const city = next.me ? next.cities.find(function (entry) { return entry.ownerId === next.me.id; }) : null;
      setCityWaypoint(city || null);
      setNotice(city ? city.name + " founded. Walk there and start upgrading it." : "City founded.");
      return true;
    } catch (error) {
      setNotice(error && error.message ? error.message : "Could not create city.");
      return false;
    }
  }

  async function handleCustomizeCity(name, style) {
    if (!authUser || !authUser.id) return false;
    try {
      const data = await updateMultiplayerCityProfile(name, style);
      const next = {
        players: Array.isArray(data.players) ? data.players : [],
        cities: Array.isArray(data.cities) ? data.cities : [],
        me: data.me || null,
      };
      setMultiplayer(next);
      const city = next.me ? next.cities.find(function (entry) { return entry.ownerId === next.me.id; }) : null;
      if (city) setCityWaypoint(city);
      setNotice(city ? city.name + " updated." : "City updated.");
      return true;
    } catch (error) {
      setNotice(error && error.message ? error.message : "Could not update city.");
      return false;
    }
  }

  async function handlePlayerAttack(targetId) {
    if (!authUser || !authUser.id) { setNotice("Log in before fighting other players."); return; }
    try {
      const result = await attackPlayer(targetId);
      setNotice(result.defeated ? "Player defeated! ⚔" : "Sword hit for " + result.damage + " damage · " + result.targetHp + "/" + result.targetMaxHp + " HP");
    } catch (error) {
      setNotice(error && error.message ? error.message : "PvP attack failed.");
    }
  }

  async function handleZombieDamage(amount) {
    if (!authUser || !authUser.id || zombieDamageBusyRef.current) return;
    zombieDamageBusyRef.current = true;
    try {
      const result = await takeZombieDamage(amount);
      setCombatStatus(function (current) { return { ...current, hp: Number(result.hp), maxHp: Number(result.maxHp), defeated: Boolean(result.defeated) }; });
      setGame(function (current) { return { ...current, hp: Number(result.hp), maxHp: Number(result.maxHp) }; });
    } catch (_) {
    } finally {
      zombieDamageBusyRef.current = false;
    }
  }

  function handleZombieKill() {
    setGame(function (current) { return { ...current, coins: current.coins + 25 }; });
    setNotice("Zombie defeated · +$25 bounty.");
  }

  function handleBuildingDamage(key, amount) {
    if (!Object.prototype.hasOwnProperty.call(INITIAL.buildings, key)) return;
    setGame(function (current) {
      const level = (current.buildings && current.buildings[key]) || 0;
      const maxHp = buildingMaxHp(key, level);
      const stored = Number(current.buildingHp && current.buildingHp[key]);
      const hp = Number.isFinite(stored) ? Math.min(maxHp, stored) : maxHp;
      const nextHp = Math.max(0, hp - Math.max(1, Number(amount) || 1));
      if (nextHp === hp) return current;
      return {
        ...current,
        buildingHp: {
          ...INITIAL.buildingHp,
          ...(current.buildingHp || {}),
          [key]: nextHp,
        },
      };
    });
  }

  function sellCargo() {
    if (!game.cargoCount) { setNotice("Cargo cart is empty."); return; }
    let raw = 0;
    Object.entries(game.cargo).forEach(function (entry) { raw += (RESOURCE_TYPES[entry[0]] ? RESOURCE_TYPES[entry[0]].value : 1) * entry[1]; });
    const payout = Math.round(raw * refineryMult * (game.boostCharges > 0 ? 1.25 : 1));
    setGame(function (g) { return { ...g, coins: g.coins + payout, cargo: {}, cargoCount: 0, boostCharges: Math.max(0, g.boostCharges - (g.boostCharges > 0 ? 1 : 0)) }; });
    setNotice("Sold ore for $" + payout.toLocaleString() + ".");
  }

  function gearCost(key) {
    const base = key === "drill" ? 130 : key === "cargoMax" ? 110 : key === "armor" ? 150 : 180;
    const level = key === "cargoMax" ? Math.max(1, Math.round((game.cargoMax - 10) / 8)) : game[key];
    return Math.round(base * Math.pow(1.65, level - 1));
  }

  function upgradeGear(key) {
    const inOwnCity = myCity && Math.abs(Number(player.x) - Number(myCity.x)) <= 7.5 && (Number(player.y) - surfaceHeight(Number(player.x))) < 1.5;
    if (!inOwnCity) { setNotice("Walk to your city supply depot to buy mining gear."); return; }
    const cost = gearCost(key);
    if (game.coins < cost) { setNotice("Need $" + cost.toLocaleString() + "."); return; }
    setGame(function (g) { return { ...g, coins: g.coins - cost, [key]: key === "cargoMax" ? g.cargoMax + 8 : g[key] + 1, maxHp: key === "armor" ? g.maxHp + 15 : g.maxHp, hp: key === "armor" ? g.hp + 15 : g.hp }; });
    setNotice("Upgrade installed.");
  }

  function buildingCost(building) { return Math.round(building.base * Math.pow(1.8, game.buildings[building.key] || 0)); }
  function upgradeBuilding(building) {
    const cost = buildingCost(building);
    if (game.coins < cost) { setNotice("Need $" + cost.toLocaleString() + " for " + building.name + "."); return; }
    setGame(function (g) {
      const nextLevel = (g.buildings[building.key] || 0) + 1;
      return {
        ...g,
        coins: g.coins - cost,
        buildings: { ...g.buildings, [building.key]: nextLevel },
        buildingHp: {
          ...INITIAL.buildingHp,
          ...(g.buildingHp || {}),
          [building.key]: buildingMaxHp(building.key, nextLevel),
        },
      };
    });
    setNotice(building.name + " upgraded — construction is rising in the world.");
  }

  function openChallenge() { setChallenge(challengeFor(game.research + game.blocksMined + Math.floor(player.x + player.y))); setChallengeResult(null); }
  function answerChallenge(choice) {
    const correct = choice === challenge.answer;
    setChallengeResult({ correct: correct, text: correct ? "Correct. +" + (4 + academyBonus) + " production boosts." : "Not quite. " + challenge.explain });
    if (correct) setGame(function (g) { return { ...g, boostCharges: g.boostCharges + 4 + academyBonus, research: g.research + 1 }; });
  }
  function raid() { setChallenge({ ...challengeFor(game.trophies + selectedRival + game.blocksMined), raid: true }); setChallengeResult(null); }
  function answerRaid(choice) {
    const correct = choice === challenge.answer;
    const rival = RIVALS[selectedRival];
    const attack = raidPower * (correct ? 1.25 : 0.92) + Math.floor(Math.random() * 16);
    const defense = rival.power + Math.floor(Math.random() * 20);
    const win = attack >= defense;
    const delta = win ? 22 + selectedRival * 3 : -(8 + selectedRival * 2);
    const reward = win ? 110 + selectedRival * 55 : 0;
    setChallengeResult({ correct: correct, text: (correct ? "Survey math gave +25% raid power. " : "Bad calculation reduced raid power. ") + challenge.explain });
    setGame(function (g) { return { ...g, trophies: Math.max(0, g.trophies + delta), coins: g.coins + reward }; });
    setRaidLog(win ? "Won the claim. +" + delta + " trophies and $" + reward + "." : "The rival held the claim. " + delta + " trophies.");
  }

  function researchCost(key) {
    const level = (game.researchTech && game.researchTech[key]) || 0;
    const base = key === "drilling" ? 3 : key === "processing" ? 4 : key === "survey" ? 4 : 5;
    return base + level * 3;
  }

  function buyResearch(key) {
    const cost = researchCost(key);
    if (game.research < cost) {
      setNotice("Need " + cost + " research points.");
      return;
    }
    setGame(function (g) {
      return {
        ...g,
        research: g.research - cost,
        researchTech: {
          ...INITIAL.researchTech,
          ...(g.researchTech || {}),
          [key]: ((g.researchTech && g.researchTech[key]) || 0) + 1,
        },
      };
    });
    setNotice("Research completed: " + key + " upgraded.");
  }

  function applyClanWarResult(result) {
    setGame(function (g) {
      return {
        ...g,
        coins: g.coins + Math.max(0, Number(result.reward) || 0),
        trophies: Math.max(0, g.trophies + (Number(result.trophyDelta) || 0)),
      };
    });
  }

  async function submitAccount(event) {
    event.preventDefault();
    if (accountBusy) return;

    setAccountBusy(true);
    setAccountError("");
    try {
      const health = await checkCloudBackend();
      if (!health || !health.d1) {
        throw new Error("Cloudflare D1 backend is unavailable.");
      }

      const result = accountMode === "signup"
        ? await cloudSignup(accountEmail.trim(), accountPassword, accountName.trim())
        : await cloudLogin(accountEmail.trim(), accountPassword);
      const user = result && result.user ? result.user : null;
      setAuthUser(user);
      setAccountPassword("");
      setAccountOpen(false);
      setNotice(accountMode === "signup" ? "DEEPFORGE account created and logged in." : "Logged in to DEEPFORGE.");
    } catch (error) {
      setAccountError(error && error.message ? error.message : "Could not log in.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function signOutAccount() {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      await leaveMultiplayerWorld().catch(function () {});
      await cloudLogout();
      setAuthUser(null);
      setAccountOpen(false);
      setNotice("Logged out of DEEPFORGE.");
    } catch (error) {
      setAccountError(error && error.message ? error.message : "Could not log out.");
    } finally {
      setAccountBusy(false);
    }
  }

  function closeChallenge() { setChallenge(null); setChallengeResult(null); }
  function reset() {
    if (typeof window !== "undefined" && !window.confirm("Reset DEEPFORGE beta progress?")) return;
    const spawn = { x: 0, y: surfaceHeight(0) - 0.42 };
    setPlayer(spawn);
    setGame(INITIAL);
    if (!authUser) setWorldChanges(emptyWorldChanges());
    setChallenge(null);
    setChallengeResult(null);
    setTab("world");
    setResetKey(function (value) { return value + 1; });
    setNotice("Progress reset. Miner returned to the surface.");
    const resetPayload = {
      version: 3,
      updatedAt: Date.now(),
      player: spawn,
      game: INITIAL,
      worldChanges: authUser ? emptyWorldChanges() : emptyWorldChanges(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(resetPayload));
    } catch (_) {}
    const resetPlayerId = (authUser && authUser.id) || playerIdRef.current;
    if (cloudEnabled() && resetPlayerId) {
      lastCloudSaveRef.current = Date.now();
      setCloudStatus(authUser ? "Account saving" : "D1 saving");
      saveCloudSave(resetPlayerId, resetPayload)
        .then(function () { setCloudStatus("D1 synced"); })
        .catch(function () { setCloudStatus("D1 offline · local save"); });
    }
  }

  return (
    <div className="df2-shell">
      <header className="df2-header">
        <div><span>PRIVATE BETA</span><h1>DEEPFORGE</h1><p>Mine the dirt. Build the town. Own the claim.</p></div>
        <div className="df2-header-right">
          <div className="df2-stats">
            <Stat icon="$" value={game.coins.toLocaleString()} label="cash" />
            <Stat icon="🏆" value={game.trophies} label="rank" />
            <Stat icon="◆" value={companyValue.toLocaleString()} label="company" />
          </div>
          <button
            className={"df2-account-button" + (authUser ? " logged-in" : "")}
            onClick={function () { setAccountError(""); setAccountOpen(true); }}
            aria-label={authUser ? "Open DEEPFORGE account" : "Log in to DEEPFORGE"}
          >
            <span className="df2-account-avatar">{authUser ? "✓" : "👤"}</span>
            <span className="df2-account-copy">
              <small>{authUser ? "ACCOUNT" : "CLOUD SAVE"}</small>
              <b>{authLoading ? "Checking…" : authUser ? (authUser.displayName || authUser.email || "Account") : "Log in"}</b>
            </span>
          </button>
        </div>
      </header>

      <nav className="df2-tabs">
        {[["world","⛏ World"],["clan","👥 Clans"],["league","⚔ Clan Wars"],["research","🔬 Research"]].map(function (item) {
          return <button key={item[0]} className={tab === item[0] ? "active" : ""} onClick={function () { setTab(item[0]); }}>{item[1]}</button>;
        })}
      </nav>

      <div className="df2-notice">{notice}</div>
      <main className="df2-stage">
        {tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} resetKey={resetKey} drillDamage={drillDamage} drillRadius={drillRadius} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} cities={multiplayer.cities} remotePlayers={multiplayer.players} myUserId={authUser && authUser.id} myCity={myCity} waypoint={cityWaypoint} onWaypoint={setCityWaypoint} onCreateCity={handleCreateCity} onCustomizeCity={handleCustomizeCity} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} resetAt={sharedWorldMeta.resetAt} sharedR2={sharedWorldMeta.r2} playerHp={combatStatus.hp} playerMaxHp={combatStatus.maxHp} swordDamage={combatStatus.swordDamage || Math.min(60, 10 + game.blaster * 4)} onPlayerAttack={handlePlayerAttack} onZombieDamage={handleZombieDamage} onZombieKill={handleZombieKill} onBuildingDamage={handleBuildingDamage} />}
        {tab === "clan" && <ClanScreen companyValue={companyValue} trophies={game.trophies} onNotice={setNotice} authUser={authUser} authLoading={authLoading} onAuthChanged={setAuthUser} onOpenAccount={function () { setAccountError(""); setAccountOpen(true); }} />}
        {tab === "league" && <ClanWarScreen authUser={authUser} warPower={warPower} onWarResult={applyClanWarResult} onNotice={setNotice} />}
        {tab === "research" && <ResearchScreen game={game} researchCost={researchCost} buyResearch={buyResearch} />}
      </main>

      <footer className="df2-footer"><span>{cloudStatus}</span><span>{authUser ? multiplayer.players.length + " online · " : ""}{player.x.toFixed(1)}, {player.y.toFixed(1)}</span><button onClick={reset}>Reset</button></footer>

      {accountOpen && (
        <div className="df2-modal df2-account-modal" onMouseDown={function (event) { if (event.target === event.currentTarget) setAccountOpen(false); }}>
          <section className="df2-account-card">
            <div className="df2-account-card-head">
              <div className="df2-account-mark">DF</div>
              <div>
                <span>DEEPFORGE ACCOUNT</span>
                <small>Cloudflare Pages + D1</small>
              </div>
              <button type="button" className="df2-account-x" onClick={function () { setAccountOpen(false); }}>×</button>
            </div>
            {authUser ? (
              <>
                <div className="df2-account-user">
                  <div className="df2-account-user-avatar">⛏</div>
                  <div>
                    <small>SIGNED IN</small>
                    <h2>{authUser.displayName || "Miner account"}</h2>
                    <p>{authUser.email}</p>
                  </div>
                </div>
                <div className="df2-account-actions">
                  <button type="button" onClick={function () { setAccountOpen(false); setTab("clan"); }}>Open clans</button>
                  <button type="button" className="danger" disabled={accountBusy} onClick={signOutAccount}>
                    {accountBusy ? "Logging out…" : "Log out"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="df2-account-intro">
                  <small>{accountMode === "signup" ? "NEW MINER" : "WELCOME BACK"}</small>
                  <h2>{accountMode === "signup" ? "Create your miner account" : "Log in"}</h2>
                  <p>{accountMode === "signup" ? "Create one account for clans and future cloud progress." : "Continue with your DEEPFORGE account."}</p>
                </div>

                <form className="df2-account-form" onSubmit={submitAccount}>
                  {accountMode === "signup" && (
                    <label>
                      Miner name
                      <input
                        value={accountName}
                        maxLength={24}
                        placeholder="StoneRunner"
                        onChange={function (event) { setAccountName(event.target.value); }}
                      />
                    </label>
                  )}
                  <label>
                    Email
                    <input
                      type="email"
                      required
                      value={accountEmail}
                      placeholder="you@example.com"
                      onChange={function (event) { setAccountEmail(event.target.value); }}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={accountPassword}
                      placeholder="At least 8 characters"
                      onChange={function (event) { setAccountPassword(event.target.value); }}
                    />
                  </label>
                  {accountError && <aside className="bad">{accountError}</aside>}
                  <button className="df2-account-submit" disabled={accountBusy || !accountEmail.trim() || accountPassword.length < 8}>
                    {accountBusy ? "Working…" : accountMode === "signup" ? "Create account" : "Log in"}
                  </button>
                </form>
                <button
                  type="button"
                  className="df2-account-switch"
                  onClick={function () {
                    setAccountError("");
                    setAccountMode(accountMode === "signup" ? "login" : "signup");
                  }}
                >
                  {accountMode === "signup" ? "Already have an account? Log in" : "New miner? Create an account"}
                </button>
              </>
            )}
            {authUser && accountError && <aside className="bad">{accountError}</aside>}
            <div className="df2-account-storage-note"><span>☁</span><small>Account data is handled by your Cloudflare D1 backend.</small></div>
          </section>
        </div>
      )}

      {challenge && (
        <div className="df2-modal">
          <section>
            <span>{challenge.raid ? "CLAIM SURVEY" : "ENGINEERING JOB"}</span>
            <h2>{challenge.title}</h2><p>{challenge.text}</p>
            <div>{challenge.choices.map(function (choice) { return <button key={choice} disabled={Boolean(challengeResult)} onClick={function () { challenge.raid ? answerRaid(choice) : answerChallenge(choice); }}>{choice}</button>; })}</div>
            {challengeResult && <aside className={challengeResult.correct ? "good" : "bad"}>{challengeResult.text}</aside>}
            {challengeResult && <button className="close" onClick={closeChallenge}>Back to mine</button>}
          </section>
        </div>
      )}
    </div>
  );
}
