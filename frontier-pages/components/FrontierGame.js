import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COLS, INITIAL, ORES, RIVALS, ROWS, SAVE_KEY, VIEW_ROWS,
  challengeFor, clamp, createWorld
} from "./deepforgeData";
import DeepforgeMine from "./DeepforgeMine";
import DeepforgeCity from "./DeepforgeCity";
import DeepforgeLeague from "./DeepforgeLeague";
import DeepforgeLab from "./DeepforgeLab";

export default function FrontierGame() {
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

  useEffect(function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.game) setGame(function (g) { return { ...g, ...saved.game }; });
        if (saved && saved.player) setPlayer(saved.player);
        if (saved && saved.world) setWorld(saved.world);
      }
    } catch (error) {
      console.warn("DEEPFORGE save could not be loaded.", error);
    }
    setLoaded(true);
  }, []);

  useEffect(function () {
    if (!loaded) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ game: game, player: player, world: world }));
    } catch (error) {
      console.warn("DEEPFORGE save could not be written.", error);
    }
  }, [game, player, world, loaded]);

  const workshopDamage = Math.floor((game.buildings.workshop || 0) / 2);
  const drillDamage = game.drill + workshopDamage;
  const refineryMult = 1 + (game.buildings.refinery || 0) * 0.12;
  const academyBonus = game.buildings.academy || 0;
  const cityDefense = game.armor * 15 + (game.buildings.walls || 0) * 18;
  const raidPower = game.blaster * 22 + game.drill * 8 + Math.floor(game.trophies / 20);
  const buildingLevels = Object.values(game.buildings).reduce(function (a, b) { return a + b; }, 0);
  const companyValue = Math.round(game.coins + game.blocksMined * 3 + game.trophies * 5 + buildingLevels * 180);

  const windowStart = clamp(player.row - 4, 0, ROWS - VIEW_ROWS);
  const visibleRows = useMemo(function () {
    return Array.from({ length: VIEW_ROWS }, function (_, index) { return windowStart + index; });
  }, [windowStart]);

  const leaderboard = useMemo(function () {
    return RIVALS
      .map(function (rival) { return { name: rival.name, trophies: rival.trophies, npc: true }; })
      .concat([{ name: "YOU", trophies: game.trophies, npc: false }])
      .sort(function (a, b) { return b.trophies - a.trophies; });
  }, [game.trophies]);

  const mineOrMove = useCallback(function (row, col) {
    const distance = Math.abs(player.row - row) + Math.abs(player.col - col);
    if (distance !== 1) {
      setNotice("Your digger can only move or drill one adjacent tile.");
      return;
    }

    const block = world[row] && world[row][col];
    if (!block) {
      setPlayer({ row: row, col: col });
      setNotice("Moved to depth " + row * 10 + " m.");
      return;
    }

    if (game.cargoCount >= game.cargoMax) {
      setNotice("Cargo full. Sell ore or upgrade cargo before drilling more.");
      return;
    }

    const newHp = block.hp - drillDamage;
    if (newHp > 0) {
      setWorld(function (current) {
        return current.map(function (r, ri) {
          if (ri !== row) return r;
          return r.map(function (b, ci) {
            return ci === col && b ? { ...b, hp: newHp } : b;
          });
        });
      });
      setNotice(ORES[block.type].name + " cracked for " + drillDamage + " damage.");
      return;
    }

    setWorld(function (current) {
      return current.map(function (r, ri) {
        if (ri !== row) return r;
        return r.map(function (b, ci) { return ci === col ? null : b; });
      });
    });
    setPlayer({ row: row, col: col });

    const nextCount = game.blocksMined + 1;
    setGame(function (g) {
      return {
        ...g,
        cargo: { ...g.cargo, [block.type]: (g.cargo[block.type] || 0) + 1 },
        cargoCount: g.cargoCount + 1,
        blocksMined: g.blocksMined + 1,
        research: g.research + (block.type === "crystal" || block.type === "relic" ? 1 : 0)
      };
    });
    setNotice("Mined " + ORES[block.type].name + " worth $" + ORES[block.type].value + " base value.");

    if (nextCount % 7 === 0) {
      setChallenge(challengeFor(nextCount + row));
      setChallengeResult(null);
    }
  }, [player, world, game.cargoCount, game.cargoMax, game.blocksMined, drillDamage]);

  useEffect(function () {
    function handler(event) {
      if (challenge || tab !== "mine") return;
      const key = event.key.toLowerCase();
      const dirs = {
        arrowleft: [0, -1], a: [0, -1],
        arrowright: [0, 1], d: [0, 1],
        arrowup: [-1, 0], w: [-1, 0],
        arrowdown: [1, 0], s: [1, 0]
      };
      if (!dirs[key]) return;
      event.preventDefault();
      const direction = dirs[key];
      const row = player.row + direction[0];
      const col = player.col + direction[1];
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) mineOrMove(row, col);
    }
    window.addEventListener("keydown", handler);
    return function () { window.removeEventListener("keydown", handler); };
  }, [challenge, tab, player, mineOrMove]);

  function sellCargo() {
    if (!game.cargoCount) {
      setNotice("Cargo hold is empty. Dig something valuable first.");
      return;
    }
    let raw = 0;
    Object.entries(game.cargo).forEach(function (entry) {
      raw += (ORES[entry[0]] ? ORES[entry[0]].value : 0) * entry[1];
    });
    const boost = game.boostCharges > 0 ? 1.25 : 1;
    const payout = Math.round(raw * refineryMult * boost);
    setGame(function (g) {
      return {
        ...g,
        coins: g.coins + payout,
        cargo: {},
        cargoCount: 0,
        boostCharges: Math.max(0, g.boostCharges - (g.boostCharges > 0 ? 1 : 0))
      };
    });
    setNotice("Ore sold for $" + payout.toLocaleString() + ". The empire grows.");
  }

  function gearCost(key) {
    const base = key === "drill" ? 130 : key === "cargoMax" ? 110 : key === "armor" ? 150 : 180;
    const level = key === "cargoMax" ? Math.max(1, Math.round((game.cargoMax - 10) / 8)) : game[key];
    return Math.round(base * Math.pow(1.65, level - 1));
  }

  function upgradeGear(key) {
    const cost = gearCost(key);
    if (game.coins < cost) {
      setNotice("Need $" + cost.toLocaleString() + " for that upgrade.");
      return;
    }
    setGame(function (g) {
      return {
        ...g,
        coins: g.coins - cost,
        [key]: key === "cargoMax" ? g.cargoMax + 8 : g[key] + 1,
        maxHp: key === "armor" ? g.maxHp + 15 : g.maxHp,
        hp: key === "armor" ? g.hp + 15 : g.hp
      };
    });
    setNotice((key === "cargoMax" ? "Cargo" : key) + " upgraded.");
  }

  function buildingCost(building) {
    const level = game.buildings[building.key] || 0;
    return Math.round(building.base * Math.pow(1.8, level));
  }

  function upgradeBuilding(building) {
    const cost = buildingCost(building);
    if (game.coins < cost) {
      setNotice("Your city needs $" + cost.toLocaleString() + " for " + building.name + ".");
      return;
    }
    setGame(function (g) {
      return {
        ...g,
        coins: g.coins - cost,
        buildings: { ...g.buildings, [building.key]: (g.buildings[building.key] || 0) + 1 }
      };
    });
    setNotice(building.name + " expanded. City value increased.");
  }

  function openChallenge() {
    setChallenge(challengeFor(game.research + game.blocksMined + 3));
    setChallengeResult(null);
  }

  function answerChallenge(choice) {
    if (!challenge) return;
    const correct = choice === challenge.answer;
    setChallengeResult({
      correct: correct,
      text: correct
        ? "Correct. +" + (4 + academyBonus) + " overclock charges and +1 research."
        : "Not quite. " + challenge.explain
    });
    if (correct) {
      setGame(function (g) {
        return { ...g, boostCharges: g.boostCharges + 4 + academyBonus, research: g.research + 1 };
      });
    }
  }

  function raid() {
    const tactical = challengeFor(game.trophies + selectedRival + game.blocksMined);
    setChallenge({ ...tactical, raid: true });
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
      correct: correct,
      text: (correct ? "Tactical solution locked. +25% raid power. " : "Wrong calibration: -8% raid power. ") + challenge.explain
    });
    setGame(function (g) {
      return {
        ...g,
        trophies: Math.max(0, g.trophies + trophyDelta),
        coins: g.coins + coins,
        hp: win ? g.hp : Math.max(20, g.hp - 12)
      };
    });
    setRaidLog(
      win
        ? "Victory over " + rival.name + ". +" + trophyDelta + " trophies, +$" + coins + ". Attack " + Math.round(attack) + " vs defense " + defense + "."
        : rival.name + " held the line. " + trophyDelta + " trophies. Attack " + Math.round(attack) + " vs defense " + defense + ". Upgrade and try again."
    );
  }

  function closeChallenge() {
    setChallenge(null);
    setChallengeResult(null);
  }

  function resetSave() {
    if (typeof window !== "undefined" && !window.confirm("Reset the DEEPFORGE prototype save?")) return;
    setWorld(createWorld());
    setPlayer({ row: 0, col: 3 });
    setGame(INITIAL);
    setNotice("New company founded. Start digging.");
    try { localStorage.removeItem(SAVE_KEY); } catch (error) {}
  }

  return (
    <div className="df-shell">
      <header className="df-topbar">
        <div>
          <div className="df-eyebrow">DIGITBOX // PROTOTYPE 0.1</div>
          <h1>DEEPFORGE</h1>
          <p>Dig. Engineer. Build an empire. Take the league.</p>
        </div>
        <div className="df-top-stats">
          <div><span>$</span><b>{game.coins.toLocaleString()}</b><small>credits</small></div>
          <div><span>🏆</span><b>{game.trophies}</b><small>trophies</small></div>
          <div><span>◆</span><b>{companyValue.toLocaleString()}</b><small>company value</small></div>
        </div>
      </header>

      <nav className="df-tabs">
        {[
          ["mine", "⛏ Mine"],
          ["city", "▦ Empire"],
          ["league", "⚔ League"],
          ["lab", "▣ Engineer Lab"]
        ].map(function (item) {
          return (
            <button
              key={item[0]}
              onClick={function () { setTab(item[0]); }}
              className={tab === item[0] ? "df-active-tab" : ""}
            >
              {item[1]}
            </button>
          );
        })}
      </nav>

      <div className="df-notice">{notice}</div>

      {tab === "mine" && (
        <DeepforgeMine
          game={game}
          player={player}
          world={world}
          visibleRows={visibleRows}
          drillDamage={drillDamage}
          mineOrMove={mineOrMove}
          sellCargo={sellCargo}
          upgradeGear={upgradeGear}
          gearCost={gearCost}
        />
      )}

      {tab === "city" && (
        <DeepforgeCity
          game={game}
          companyValue={companyValue}
          cityDefense={cityDefense}
          buildingCost={buildingCost}
          upgradeBuilding={upgradeBuilding}
        />
      )}

      {tab === "league" && (
        <DeepforgeLeague
          selectedRival={selectedRival}
          setSelectedRival={setSelectedRival}
          raidPower={raidPower}
          raid={raid}
          raidLog={raidLog}
          leaderboard={leaderboard}
          cityDefense={cityDefense}
        />
      )}

      {tab === "lab" && <DeepforgeLab game={game} openChallenge={openChallenge} />}

      <footer className="df-footer">
        <span>Local autosave active</span>
        <button onClick={resetSave}>Reset prototype</button>
      </footer>

      {challenge && (
        <div className="df-modal-backdrop">
          <section className="df-challenge" role="dialog" aria-modal="true">
            <span className="df-kicker">{challenge.raid ? "TACTICAL CALCULATION" : "ENGINEER BOOST"}</span>
            <h2>{challenge.title}</h2>
            <p>{challenge.text}</p>
            <div className="df-choices">
              {challenge.choices.map(function (choice) {
                return (
                  <button
                    key={choice}
                    disabled={Boolean(challengeResult)}
                    onClick={function () { challenge.raid ? answerRaid(choice) : answerChallenge(choice); }}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
            {challengeResult && (
              <div className={challengeResult.correct ? "df-correct" : "df-wrong"}>
                {challengeResult.text}
              </div>
            )}
            {challengeResult && <button className="df-primary" onClick={closeChallenge}>Back to game</button>}
          </section>
        </div>
      )}
    </div>
  );
}