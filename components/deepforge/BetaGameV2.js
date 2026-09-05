import { useEffect, useMemo, useRef, useState } from "react";
import InfiniteWorld from "./InfiniteWorld";
import { BUILDINGS, INITIAL, RIVALS, SAVE_KEY, challengeFor } from "./data";
import { RESOURCE_TYPES, nearestResource } from "./world";
import { cloudEnabled, getOrCreatePlayerId, loadCloudSave, saveCloudSave } from "./cloudSync";

const DEFAULT_PLAYER = { x: 0.5, y: 0.5 };

function normalizeSave(raw) {
  if (!raw || typeof raw !== "object") return null;
  const player = raw.player && Number.isFinite(raw.player.x) && Number.isFinite(raw.player.y)
    ? raw.player
    : DEFAULT_PLAYER;
  return {
    updatedAt: Number(raw.updatedAt) || 0,
    player: player,
    game: raw.game ? { ...INITIAL, ...raw.game, buildings: { ...INITIAL.buildings, ...(raw.game.buildings || {}) } } : INITIAL,
    worldChanges: raw.worldChanges && typeof raw.worldChanges === "object" ? raw.worldChanges : {},
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

export default function BetaGameV2() {
  const [player, setPlayer] = useState(DEFAULT_PLAYER);
  const [game, setGame] = useState(INITIAL);
  const [worldChanges, setWorldChanges] = useState({});
  const [tab, setTab] = useState("world");
  const [notice, setNotice] = useState("Drag anywhere on the dirt to move your miner.");
  const [challenge, setChallenge] = useState(null);
  const [challengeResult, setChallengeResult] = useState(null);
  const [selectedRival, setSelectedRival] = useState(0);
  const [raidLog, setRaidLog] = useState("Scout the league, upgrade, then challenge another mining company.");
  const [loaded, setLoaded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(cloudEnabled() ? "D1 connecting" : "D1-ready · local save");
  const playerIdRef = useRef(null);
  const lastCloudSaveRef = useRef(0);

  const drillDamage = game.drill + Math.floor((game.buildings.workshop || 0) / 2);
  const refineryMult = 1 + (game.buildings.refinery || 0) * 0.12;
  const academyBonus = game.buildings.academy || 0;
  const cityDefense = game.armor * 15 + (game.buildings.walls || 0) * 18;
  const raidPower = game.blaster * 22 + game.drill * 8 + Math.floor(game.trophies / 20);
  const companyValue = Math.round(game.coins + game.blocksMined * 4 + game.trophies * 5 + Object.values(game.buildings).reduce(function (a, b) { return a + b; }, 0) * 180);
  const leaderboard = useMemo(function () {
    return RIVALS.map(function (rival) { return { name: rival.name, trophies: rival.trophies, npc: true }; })
      .concat([{ name: "YOU", trophies: game.trophies, npc: false }])
      .sort(function (a, b) { return b.trophies - a.trophies; });
  }, [game.trophies]);

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
      const payload = { version: 2, updatedAt: Date.now(), player: player, game: game, worldChanges: worldChanges };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch (_) {}
      if (cloudEnabled() && Date.now() - lastCloudSaveRef.current > 3500) {
        lastCloudSaveRef.current = Date.now();
        setCloudStatus("D1 saving");
        saveCloudSave(playerIdRef.current, payload).then(function () { setCloudStatus("D1 synced"); }).catch(function () { setCloudStatus("D1 offline · local save"); });
      }
    }, 650);
    return function () { clearTimeout(timer); };
  }, [player, game, worldChanges, loaded]);

  function drill(position) {
    if (challenge || tab !== "world") return;
    if (game.cargoCount >= game.cargoMax) { setNotice("Cargo cart is full. Sell before mining more."); return; }
    const target = nearestResource(position.x, position.y, worldChanges, 1.8);
    if (!target) { setNotice("No ore in reach. Walk closer to a rock with visible mineral veins."); return; }
    const damage = (target.change && target.change.damage ? target.change.damage : 0) + drillDamage;
    if (damage < target.resource.hp) {
      setWorldChanges(function (current) { return { ...current, [target.key]: { damage: damage } }; });
      setNotice(target.resource.name + " rock: " + damage + "/" + target.resource.hp + " broken.");
      return;
    }
    const type = target.resourceType;
    const nextCount = game.blocksMined + 1;
    setWorldChanges(function (current) { return { ...current, [target.key]: { mined: true, minedAt: Date.now() } }; });
    setGame(function (g) {
      return { ...g, cargo: { ...g.cargo, [type]: (g.cargo[type] || 0) + 1 }, cargoCount: g.cargoCount + 1, blocksMined: g.blocksMined + 1, research: g.research + (type === "crystal" || type === "relic" ? 1 : 0) };
    });
    setNotice("Mined " + target.resource.name + ".");
    if (nextCount % 7 === 0) { setChallenge(challengeFor(nextCount + Math.floor(position.x + position.y))); setChallengeResult(null); }
  }

  useEffect(function () {
    function keydown(event) {
      if ((event.key === " " || event.code === "Space") && tab === "world" && !challenge) { event.preventDefault(); drill(player); }
    }
    window.addEventListener("keydown", keydown);
    return function () { window.removeEventListener("keydown", keydown); };
  }, [player, tab, challenge, worldChanges, game.cargoCount, game.cargoMax, game.blocksMined, drillDamage]);

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

  function closeChallenge() { setChallenge(null); setChallengeResult(null); }
  function reset() {
    if (typeof window !== "undefined" && !window.confirm("Reset DEEPFORGE beta progress?")) return;
    setPlayer(DEFAULT_PLAYER); setGame(INITIAL); setWorldChanges({}); setNotice("New mining company founded.");
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  return (
    <div className="df2-shell">
      <header className="df2-header">
        <div><span>PRIVATE BETA</span><h1>DEEPFORGE</h1><p>Mine the dirt. Build the town. Own the claim.</p></div>
        <div className="df2-stats">
          <Stat icon="$" value={game.coins.toLocaleString()} label="cash" />
          <Stat icon="🏆" value={game.trophies} label="rank" />
          <Stat icon="◆" value={companyValue.toLocaleString()} label="company" />
        </div>
      </header>

      <nav className="df2-tabs">
        {[["world","⛏ Mine"],["empire","🏚 Town"],["league","⚔ League"],["lab","📐 Learn"]].map(function (item) {
          return <button key={item[0]} className={tab === item[0] ? "active" : ""} onClick={function () { setTab(item[0]); }}>{item[1]}</button>;
        })}
      </nav>

      <div className="df2-notice">{notice}</div>
      <main className="df2-stage">
        {tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} drillDamage={drillDamage} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} />}
        {tab === "empire" && <EmpireScreen game={game} companyValue={companyValue} cityDefense={cityDefense} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} />}
        {tab === "league" && <LeagueScreen selectedRival={selectedRival} setSelectedRival={setSelectedRival} raid={raid} raidLog={raidLog} leaderboard={leaderboard} />}
        {tab === "lab" && <LabScreen game={game} openChallenge={openChallenge} />}
      </main>

      <footer className="df2-footer"><span>{cloudStatus}</span><span>{player.x.toFixed(1)}, {player.y.toFixed(1)}</span><button onClick={reset}>Reset</button></footer>

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
