import { useEffect, useMemo, useRef, useState } from "react";
import InfiniteWorld from "./InfiniteWorld";
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

const DEFAULT_PLAYER = { x: 0, y: surfaceHeight(0) - 0.38 };

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
          return { ...INITIAL, ...clean, buildings: { ...INITIAL.buildings, ...(raw.game.buildings || {}) }, researchTech: { ...INITIAL.researchTech, ...(raw.game.researchTech || {}) } };
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
        <RigPanel game={game} drillDamage={props.drillDamage} gearCost={props.gearCost} upgradeGear={props.upgradeGear} />
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
  const playerIdRef = useRef(null);
  const lastCloudSaveRef = useRef(0);

  const researchTech = game.researchTech || INITIAL.researchTech;
  const drillDamage = game.drill + Math.floor((game.buildings.workshop || 0) / 2);
  const drillRadius = 0.7 + Math.min(0.42, drillDamage * 0.055) + (researchTech.drilling || 0) * 0.04;
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
      const payload = { version: 3, updatedAt: Date.now(), player: player, game: game, worldChanges: normalizeWorldChanges(worldChanges) };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch (_) {}
      if (cloudEnabled() && Date.now() - lastCloudSaveRef.current > 3500) {
        lastCloudSaveRef.current = Date.now();
        setCloudStatus("D1 saving");
        saveCloudSave(playerIdRef.current, payload)
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

    const radius = Number(excavation.radius) || drillRadius;
    const circle = {
      x: Number(excavation.x),
      y: Number(excavation.y),
      r: radius,
    };

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
      setNotice(depth < 5.5 ? "Excavated a round cut through soil." : depth < 22 ? "Excavated a round cut through compact earth." : "Cut a round section of bedrock.");
    }
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
    const cost = gearCost(key);
    if (game.coins < cost) { setNotice("Need $" + cost.toLocaleString() + "."); return; }
    setGame(function (g) { return { ...g, coins: g.coins - cost, [key]: key === "cargoMax" ? g.cargoMax + 8 : g[key] + 1, maxHp: key === "armor" ? g.maxHp + 15 : g.maxHp, hp: key === "armor" ? g.hp + 15 : g.hp }; });
    setNotice("Upgrade installed.");
  }

  function buildingCost(building) { return Math.round(building.base * Math.pow(1.8, game.buildings[building.key] || 0)); }
  function upgradeBuilding(building) {
    const cost = buildingCost(building);
    if (game.coins < cost) { setNotice("Need $" + cost.toLocaleString() + " for " + building.name + "."); return; }
    setGame(function (g) { return { ...g, coins: g.coins - cost, buildings: { ...g.buildings, [building.key]: (g.buildings[building.key] || 0) + 1 } }; });
    setNotice(building.name + " upgraded.");
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
    setWorldChanges(emptyWorldChanges());
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
      worldChanges: emptyWorldChanges(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(resetPayload));
    } catch (_) {}
    if (cloudEnabled() && playerIdRef.current) {
      lastCloudSaveRef.current = Date.now();
      setCloudStatus("D1 saving");
      saveCloudSave(playerIdRef.current, resetPayload)
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
        {[["world","⛏ Mine"],["empire","🏚 Town"],["clan","👥 Clans"],["league","⚔ Clan Wars"],["research","🔬 Research"]].map(function (item) {
          return <button key={item[0]} className={tab === item[0] ? "active" : ""} onClick={function () { setTab(item[0]); }}>{item[1]}</button>;
        })}
      </nav>

      <div className="df2-notice">{notice}</div>
      <main className="df2-stage">
        {tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} resetKey={resetKey} drillDamage={drillDamage} drillRadius={drillRadius} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} />}
        {tab === "empire" && <EmpireScreen game={game} companyValue={companyValue} cityDefense={cityDefense} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} />}
        {tab === "clan" && <ClanScreen companyValue={companyValue} trophies={game.trophies} onNotice={setNotice} authUser={authUser} authLoading={authLoading} onAuthChanged={setAuthUser} onOpenAccount={function () { setAccountError(""); setAccountOpen(true); }} />}
        {tab === "league" && <ClanWarScreen authUser={authUser} warPower={warPower} onWarResult={applyClanWarResult} onNotice={setNotice} />}
        {tab === "research" && <ResearchScreen game={game} researchCost={researchCost} buyResearch={buyResearch} />}
      </main>

      <footer className="df2-footer"><span>{cloudStatus}</span><span>{player.x.toFixed(1)}, {player.y.toFixed(1)}</span><button onClick={reset}>Reset</button></footer>

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
