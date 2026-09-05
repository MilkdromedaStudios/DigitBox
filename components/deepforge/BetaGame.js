import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUILDINGS,
  COLS,
  INITIAL,
  ORES,
  RIVALS,
  ROWS,
  SAVE_KEY,
  VIEW_ROWS,
  challengeFor,
  clamp,
  createWorld,
} from "./data";

function MineView({ game, player, world, visibleRows, drillDamage, mineOrMove, moveBy, sellCargo, upgradeGear, gearCost }) {
  const gear = [
    { key: "drill", icon: "⛏", name: "Drill", desc: `${drillDamage} damage / hit` },
    { key: "cargoMax", icon: "▰", name: "Cargo", desc: `${game.cargoMax} ore capacity` },
    { key: "armor", icon: "◈", name: "Armor", desc: `${game.maxHp} max hull` },
    { key: "blaster", icon: "⌁", name: "Blaster", desc: `Raid weapon level ${game.blaster}` },
  ];

  return (
    <main className="df-mine-layout">
      <section className="df-panel df-mine-panel">
        <div className="df-panel-head">
          <div>
            <span className="df-kicker">ACTIVE SHAFT</span>
            <h2>Sector D-{Math.floor(player.row / 6) + 1}</h2>
          </div>
          <div className="df-depth">{player.row * 10} m</div>
        </div>

        <div className="df-mine-grid" style={{ "--cols": COLS }}>
          {visibleRows.flatMap((row) =>
            Array.from({ length: COLS }, (_, col) => {
              const block = world[row][col];
              const isPlayer = player.row === row && player.col === col;
              const adjacent = Math.abs(player.row - row) + Math.abs(player.col - col) === 1;
              const ore = block ? ORES[block.type] : null;
              const className = [
                "df-tile",
                block ? ore.css : "df-empty",
                isPlayer ? "df-player" : "",
                adjacent ? "df-adjacent" : "",
              ].join(" ");

              return (
                <button
                  key={`${row}-${col}`}
                  className={className}
                  onClick={() => !isPlayer && mineOrMove(row, col)}
                  aria-label={isPlayer ? "Your digger" : block ? `${ore.name}, ${block.hp} durability` : "Open tunnel"}
                >
                  {isPlayer ? (
                    <span className="df-digger">▼</span>
                  ) : block ? (
                    <>
                      <span className="df-ore-icon">{ore.icon}</span>
                      {block.hp < block.maxHp && (
                        <span className="df-hpbar" style={{ "--hp": `${(block.hp / block.maxHp) * 100}%` }} />
                      )}
                    </>
                  ) : (
                    <span className="df-tunnel-dot">·</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="df-mobile-controls" aria-label="Digger movement controls">
          <button className="df-dpad-up" onClick={() => moveBy(-1, 0)} aria-label="Move or drill up">▲</button>
          <button className="df-dpad-left" onClick={() => moveBy(0, -1)} aria-label="Move or drill left">◀</button>
          <div className="df-dpad-core" aria-hidden="true">⛏</div>
          <button className="df-dpad-right" onClick={() => moveBy(0, 1)} aria-label="Move or drill right">▶</button>
          <button className="df-dpad-down" onClick={() => moveBy(1, 0)} aria-label="Move or drill down">▼</button>
        </div>

        <div className="df-mine-hint">
          Tap an outlined tile, use the touch controls, or use WASD / arrow keys.
        </div>
      </section>

      <aside className="df-side">
        <section className="df-panel df-side-panel">
          <div className="df-panel-head">
            <div>
              <span className="df-kicker">CARGO</span>
              <h3>{game.cargoCount} / {game.cargoMax}</h3>
            </div>
            <span className="df-boost">{game.boostCharges ? `⚡ ${game.boostCharges} boost` : "normal yield"}</span>
          </div>
          <div className="df-cargo-list">
            {Object.keys(game.cargo).length === 0 && <p>No ore yet.</p>}
            {Object.entries(game.cargo).map(([type, qty]) => (
              <div key={type}><span>{ORES[type].icon} {ORES[type].name}</span><b>x{qty}</b></div>
            ))}
          </div>
          <button className="df-primary" onClick={sellCargo}>Sell cargo</button>
        </section>

        <section className="df-panel df-side-panel">
          <span className="df-kicker">RIG UPGRADES</span>
          <div className="df-gear-grid">
            {gear.map((item) => (
              <button key={item.key} onClick={() => upgradeGear(item.key)}>
                <span>{item.icon}</span>
                <b>{item.name}</b>
                <small>{item.desc}</small>
                <small>${gearCost(item.key).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

function CityView({ game, companyValue, cityDefense, buildingCost, upgradeBuilding }) {
  return (
    <main className="df-city-layout">
      <section className="df-panel df-city-scene">
        <div className="df-city-sky">
          <span className="df-moon">◉</span>
          <div className="df-skyline">
            <div className="df-tower-a" />
            <div className="df-tower-b" />
            <div className="df-tower-c" />
            <div className="df-tower-d" />
          </div>
        </div>
        <div className="df-city-info">
          <span className="df-kicker">YOUR CAPITAL</span>
          <h2>Forge City</h2>
          <p>Company value <b>${companyValue.toLocaleString()}</b> · Defense <b>{cityDefense}</b></p>
        </div>
      </section>

      <section className="df-building-grid">
        {BUILDINGS.map((building) => {
          const level = game.buildings[building.key] || 0;
          const cost = buildingCost(building);
          return (
            <article className="df-panel" key={building.key}>
              <div className="df-building-icon">{building.icon}</div>
              <div>
                <span className="df-kicker">LEVEL {level}</span>
                <h3>{building.name}</h3>
                <p>{building.desc}</p>
              </div>
              <button className="df-primary" onClick={() => upgradeBuilding(building)}>
                Upgrade · ${cost.toLocaleString()}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function LeagueView({ selectedRival, setSelectedRival, raidPower, raid, raidLog, leaderboard, cityDefense }) {
  return (
    <main className="df-league-layout">
      <section className="df-panel df-league-panel">
        <div className="df-panel-head">
          <div>
            <span className="df-kicker">GHOST LEAGUE // BETA</span>
            <h2>Rival claims</h2>
          </div>
          <div className="df-depth">⚔ {raidPower}</div>
        </div>
        <p className="df-muted">Rivals are simulated snapshots in this private beta. Real player cities can replace them later.</p>
        <div className="df-rivals">
          {RIVALS.map((rival, index) => (
            <button
              key={rival.name}
              onClick={() => setSelectedRival(index)}
              className={selectedRival === index ? "df-selected-rival" : ""}
            >
              <span className="df-rival-avatar">{rival.name.slice(0, 2).toUpperCase()}</span>
              <span><b>{rival.name}</b><small>{rival.city} · ⚔ {rival.power}</small></span>
              <em>🏆 {rival.trophies}</em>
            </button>
          ))}
        </div>
        <button className="df-raid" onClick={raid}>Raid {RIVALS[selectedRival].name}</button>
        <div className="df-raid-log">{raidLog}</div>
      </section>

      <section className="df-panel df-league-panel">
        <span className="df-kicker">LEADERBOARD</span>
        <h2>Bronze Circuit</h2>
        <div className="df-rank-list">
          {leaderboard.map((entry, index) => (
            <div key={entry.name} className={!entry.npc ? "df-you-rank" : ""}>
              <span>#{index + 1}</span><b>{entry.name}</b><em>{entry.trophies} 🏆</em>
            </div>
          ))}
        </div>
        <div className="df-defense-box">
          <span>City defense</span><b>{cityDefense}</b>
          <small>Armor + city walls determine how hard your city is to raid.</small>
        </div>
      </section>
    </main>
  );
}

function LabView({ game, openChallenge }) {
  return (
    <main className="df-lab-layout">
      <section className="df-panel df-lab-hero">
        <div className="df-lab-orb">∑</div>
        <div>
          <span className="df-kicker">ENGINEER LAB</span>
          <h2>Knowledge is an upgrade.</h2>
          <p>Solve compact engineering problems to overclock your rigs. No worksheets: every correct answer changes the game economy.</p>
        </div>
      </section>
      <section className="df-lab-stats">
        <div><span>▣</span><b>{game.research}</b><small>research</small></div>
        <div><span>⚡</span><b>{game.boostCharges}</b><small>boost charges</small></div>
        <div><span>⛏</span><b>{game.blocksMined}</b><small>blocks mined</small></div>
      </section>
      <button className="df-primary" onClick={openChallenge}>Run engineer challenge</button>
      <section className="df-learning-map">
        <article className="df-panel"><b>Ratios</b><span>Refinery recipes & production</span></article>
        <article className="df-panel"><b>Algebra</b><span>Machine calibration & automation</span></article>
        <article className="df-panel"><b>Geometry</b><span>City lots, tunnels & construction</span></article>
        <article className="df-panel"><b>Percent</b><span>Markets, shields & efficiency</span></article>
      </section>
    </main>
  );
}

export default function BetaGame() {
  const [world, setWorld] = useState(createWorld);
  const [player, setPlayer] = useState({ row: 0, col: 3 });
  const [game, setGame] = useState(INITIAL);
  const [tab, setTab] = useState("mine");
  const [notice, setNotice] = useState("Welcome, Foreman. Dig deep, build smart, own the underground.");
  const [challenge, setChallenge] = useState(null);
  const [challengeResult, setChallengeResult] = useState(null);
  const [selectedRival, setSelectedRival] = useState(0);
  const [raidLog, setRaidLog] = useState("Ghost League ready. Scout a rival when your blaster is upgraded.");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.game) setGame((g) => ({ ...g, ...saved.game }));
        if (saved?.player) setPlayer(saved.player);
        if (saved?.world) setWorld(saved.world);
      }
    } catch (error) {
      console.warn("DEEPFORGE beta save could not be loaded.", error);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ game, player, world }));
    } catch (error) {
      console.warn("DEEPFORGE beta save could not be written.", error);
    }
  }, [game, player, world, loaded]);

  const workshopDamage = Math.floor((game.buildings.workshop || 0) / 2);
  const drillDamage = game.drill + workshopDamage;
  const refineryMult = 1 + (game.buildings.refinery || 0) * 0.12;
  const academyBonus = game.buildings.academy || 0;
  const cityDefense = game.armor * 15 + (game.buildings.walls || 0) * 18;
  const raidPower = game.blaster * 22 + game.drill * 8 + Math.floor(game.trophies / 20);
  const buildingLevels = Object.values(game.buildings).reduce((a, b) => a + b, 0);
  const companyValue = Math.round(game.coins + game.blocksMined * 3 + game.trophies * 5 + buildingLevels * 180);
  const windowStart = clamp(player.row - 4, 0, ROWS - VIEW_ROWS);
  const visibleRows = useMemo(() => Array.from({ length: VIEW_ROWS }, (_, index) => windowStart + index), [windowStart]);
  const leaderboard = useMemo(
    () => RIVALS.map((rival) => ({ name: rival.name, trophies: rival.trophies, npc: true }))
      .concat([{ name: "YOU", trophies: game.trophies, npc: false }])
      .sort((a, b) => b.trophies - a.trophies),
    [game.trophies]
  );

  const mineOrMove = useCallback((row, col) => {
    const distance = Math.abs(player.row - row) + Math.abs(player.col - col);
    if (distance !== 1) {
      setNotice("Your digger can only move or drill one adjacent tile.");
      return;
    }

    const block = world[row]?.[col];
    if (!block) {
      setPlayer({ row, col });
      setNotice(`Moved to depth ${row * 10} m.`);
      return;
    }

    if (game.cargoCount >= game.cargoMax) {
      setNotice("Cargo full. Sell ore or upgrade cargo before drilling more.");
      return;
    }

    const newHp = block.hp - drillDamage;
    if (newHp > 0) {
      setWorld((current) => current.map((r, ri) =>
        ri !== row ? r : r.map((b, ci) => (ci === col && b ? { ...b, hp: newHp } : b))
      ));
      setNotice(`${ORES[block.type].name} cracked for ${drillDamage} damage.`);
      return;
    }

    setWorld((current) => current.map((r, ri) =>
      ri !== row ? r : r.map((b, ci) => (ci === col ? null : b))
    ));
    setPlayer({ row, col });

    const nextCount = game.blocksMined + 1;
    setGame((g) => ({
      ...g,
      cargo: { ...g.cargo, [block.type]: (g.cargo[block.type] || 0) + 1 },
      cargoCount: g.cargoCount + 1,
      blocksMined: g.blocksMined + 1,
      research: g.research + (block.type === "crystal" || block.type === "relic" ? 1 : 0),
    }));
    setNotice(`Mined ${ORES[block.type].name} worth $${ORES[block.type].value} base value.`);

    if (nextCount % 7 === 0) {
      setChallenge(challengeFor(nextCount + row));
      setChallengeResult(null);
    }
  }, [player, world, game.cargoCount, game.cargoMax, game.blocksMined, drillDamage]);

  const moveBy = useCallback((rowDelta, colDelta) => {
    if (challenge || tab !== "mine") return;
    const row = player.row + rowDelta;
    const col = player.col + colDelta;
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) mineOrMove(row, col);
  }, [challenge, tab, player, mineOrMove]);

  useEffect(() => {
    function handler(event) {
      const key = event.key.toLowerCase();
      const dirs = {
        arrowleft: [0, -1], a: [0, -1],
        arrowright: [0, 1], d: [0, 1],
        arrowup: [-1, 0], w: [-1, 0],
        arrowdown: [1, 0], s: [1, 0],
      };
      if (!dirs[key] || challenge || tab !== "mine") return;
      event.preventDefault();
      moveBy(dirs[key][0], dirs[key][1]);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [challenge, tab, moveBy]);

  function sellCargo() {
    if (!game.cargoCount) {
      setNotice("Cargo hold is empty. Dig something valuable first.");
      return;
    }
    let raw = 0;
    Object.entries(game.cargo).forEach(([type, qty]) => {
      raw += (ORES[type]?.value || 0) * qty;
    });
    const boost = game.boostCharges > 0 ? 1.25 : 1;
    const payout = Math.round(raw * refineryMult * boost);
    setGame((g) => ({
      ...g,
      coins: g.coins + payout,
      cargo: {},
      cargoCount: 0,
      boostCharges: Math.max(0, g.boostCharges - (g.boostCharges > 0 ? 1 : 0)),
    }));
    setNotice(`Ore sold for $${payout.toLocaleString()}. The empire grows.`);
  }

  function gearCost(key) {
    const base = key === "drill" ? 130 : key === "cargoMax" ? 110 : key === "armor" ? 150 : 180;
    const level = key === "cargoMax" ? Math.max(1, Math.round((game.cargoMax - 10) / 8)) : game[key];
    return Math.round(base * Math.pow(1.65, level - 1));
  }

  function upgradeGear(key) {
    const cost = gearCost(key);
    if (game.coins < cost) {
      setNotice(`Need $${cost.toLocaleString()} for that upgrade.`);
      return;
    }
    setGame((g) => ({
      ...g,
      coins: g.coins - cost,
      [key]: key === "cargoMax" ? g.cargoMax + 8 : g[key] + 1,
      maxHp: key === "armor" ? g.maxHp + 15 : g.maxHp,
      hp: key === "armor" ? g.hp + 15 : g.hp,
    }));
    setNotice(`${key === "cargoMax" ? "Cargo" : key} upgraded.`);
  }

  function buildingCost(building) {
    return Math.round(building.base * Math.pow(1.8, game.buildings[building.key] || 0));
  }

  function upgradeBuilding(building) {
    const cost = buildingCost(building);
    if (game.coins < cost) {
      setNotice(`Your city needs $${cost.toLocaleString()} for ${building.name}.`);
      return;
    }
    setGame((g) => ({
      ...g,
      coins: g.coins - cost,
      buildings: { ...g.buildings, [building.key]: (g.buildings[building.key] || 0) + 1 },
    }));
    setNotice(`${building.name} expanded. City value increased.`);
  }

  function openChallenge() {
    setChallenge(challengeFor(game.research + game.blocksMined + 3));
    setChallengeResult(null);
  }

  function answerChallenge(choice) {
    if (!challenge) return;
    const correct = choice === challenge.answer;
    setChallengeResult({
      correct,
      text: correct ? `Correct. +${4 + academyBonus} overclock charges and +1 research.` : `Not quite. ${challenge.explain}`,
    });
    if (correct) {
      setGame((g) => ({ ...g, boostCharges: g.boostCharges + 4 + academyBonus, research: g.research + 1 }));
    }
  }

  function raid() {
    setChallenge({ ...challengeFor(game.trophies + selectedRival + game.blocksMined), raid: true });
    setChallengeResult(null);
  }

  function answerRaid(choice) {
    const correct = choice === challenge.answer;
    const rival = RIVALS[selectedRival];
    const attack = raidPower * (correct ? 1.25 : 0.92) + Math.floor(Math.random() * 16);
    const defense = rival.power + Math.floor(Math.random() * 20);
    const win = attack >= defense;
    const trophyDelta = win ? 22 + selectedRival * 3 : -(8 + selectedRival * 2);
    const coins = win ? 110 + selectedRival * 55 : 0;

    setChallengeResult({
      correct,
      text: `${correct ? "Tactical solution locked. +25% raid power. " : "Wrong calibration: -8% raid power. "}${challenge.explain}`,
    });
    setGame((g) => ({
      ...g,
      trophies: Math.max(0, g.trophies + trophyDelta),
      coins: g.coins + coins,
      hp: win ? g.hp : Math.max(20, g.hp - 12),
    }));
    setRaidLog(
      win
        ? `Victory over ${rival.name}. +${trophyDelta} trophies, +$${coins}. Attack ${Math.round(attack)} vs defense ${defense}.`
        : `${rival.name} held the line. ${trophyDelta} trophies. Attack ${Math.round(attack)} vs defense ${defense}. Upgrade and try again.`
    );
  }

  function closeChallenge() {
    setChallenge(null);
    setChallengeResult(null);
  }

  function resetSave() {
    if (typeof window !== "undefined" && !window.confirm("Reset the DEEPFORGE beta save?")) return;
    setWorld(createWorld());
    setPlayer({ row: 0, col: 3 });
    setGame(INITIAL);
    setNotice("New company founded. Start digging.");
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  }

  return (
    <div className="df-shell">
      <header className="df-topbar">
        <div>
          <div className="df-eyebrow">DIGITBOX // PRIVATE BETA</div>
          <h1>DEEPFORGE</h1>
          <p>Dig. Engineer. Build an empire. Take the league.</p>
        </div>
        <div className="df-top-stats">
          <div><span>$</span><b>{game.coins.toLocaleString()}</b><small>credits</small></div>
          <div><span>🏆</span><b>{game.trophies}</b><small>trophies</small></div>
          <div><span>◆</span><b>{companyValue.toLocaleString()}</b><small>company value</small></div>
        </div>
      </header>

      <nav className="df-tabs" aria-label="Game sections">
        {[["mine", "⛏ Mine"], ["city", "▦ Empire"], ["league", "⚔ League"], ["lab", "▣ Engineer Lab"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={tab === key ? "df-active-tab" : ""}>{label}</button>
        ))}
      </nav>

      <div className="df-notice" role="status">{notice}</div>

      {tab === "mine" && (
        <MineView
          game={game}
          player={player}
          world={world}
          visibleRows={visibleRows}
          drillDamage={drillDamage}
          mineOrMove={mineOrMove}
          moveBy={moveBy}
          sellCargo={sellCargo}
          upgradeGear={upgradeGear}
          gearCost={gearCost}
        />
      )}
      {tab === "city" && <CityView game={game} companyValue={companyValue} cityDefense={cityDefense} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} />}
      {tab === "league" && <LeagueView selectedRival={selectedRival} setSelectedRival={setSelectedRival} raidPower={raidPower} raid={raid} raidLog={raidLog} leaderboard={leaderboard} cityDefense={cityDefense} />}
      {tab === "lab" && <LabView game={game} openChallenge={openChallenge} />}

      <footer className="df-footer">
        <span>Local autosave active · beta progress stays on this device</span>
        <button onClick={resetSave}>Reset beta</button>
      </footer>

      {challenge && (
        <div className="df-modal-backdrop">
          <section className="df-challenge" role="dialog" aria-modal="true" aria-labelledby="df-challenge-title">
            <span className="df-kicker">{challenge.raid ? "TACTICAL CALCULATION" : "ENGINEER BOOST"}</span>
            <h2 id="df-challenge-title">{challenge.title}</h2>
            <p>{challenge.text}</p>
            <div className="df-choices">
              {challenge.choices.map((choice) => (
                <button key={choice} disabled={Boolean(challengeResult)} onClick={() => challenge.raid ? answerRaid(choice) : answerChallenge(choice)}>{choice}</button>
              ))}
            </div>
            {challengeResult && <div className={challengeResult.correct ? "df-correct" : "df-wrong"}>{challengeResult.text}</div>}
            {challengeResult && <button className="df-primary" onClick={closeChallenge}>Back to game</button>}
          </section>
        </div>
      )}
    </div>
  );
}
