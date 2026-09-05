import { COLS, ORES } from "./deepforgeData";

export default function DeepforgeMine(props) {
  const {
    game, player, world, visibleRows, drillDamage,
    mineOrMove, sellCargo, upgradeGear, gearCost
  } = props;

  const gear = [
    { key: "drill", icon: "⛏", name: "Drill", desc: drillDamage + " damage / hit" },
    { key: "cargoMax", icon: "▰", name: "Cargo", desc: game.cargoMax + " ore capacity" },
    { key: "armor", icon: "◈", name: "Armor", desc: game.maxHp + " max hull" },
    { key: "blaster", icon: "⌁", name: "Blaster", desc: "Raid weapon level " + game.blaster }
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
          {visibleRows.flatMap(function (row) {
            return Array.from({ length: COLS }, function (_, col) {
              const block = world[row][col];
              const isPlayer = player.row === row && player.col === col;
              const adjacent = Math.abs(player.row - row) + Math.abs(player.col - col) === 1;
              const ore = block ? ORES[block.type] : null;
              const className = [
                "df-tile",
                block ? ore.css : "df-empty",
                isPlayer ? "df-player" : "",
                adjacent ? "df-adjacent" : ""
              ].join(" ");

              return (
                <button
                  key={row + "-" + col}
                  className={className}
                  onClick={function () { if (!isPlayer) mineOrMove(row, col); }}
                  aria-label={isPlayer ? "Your digger" : block ? ore.name + ", " + block.hp + " durability" : "Open tunnel"}
                >
                  {isPlayer ? (
                    <span className="df-digger">▼</span>
                  ) : block ? (
                    <>
                      <span className="df-ore-icon">{ore.icon}</span>
                      {block.hp < block.maxHp && (
                        <span className="df-hpbar" style={{ "--hp": (block.hp / block.maxHp * 100) + "%" }} />
                      )}
                    </>
                  ) : (
                    <span className="df-tunnel-dot">·</span>
                  )}
                </button>
              );
            });
          })}
        </div>

        <div className="df-mine-hint">
          Click an adjacent tile or use WASD / arrow keys. Outlined tiles are reachable.
        </div>
      </section>

      <aside className="df-side">
        <section className="df-panel">
          <div className="df-panel-head">
            <div>
              <span className="df-kicker">CARGO</span>
              <h3>{game.cargoCount} / {game.cargoMax}</h3>
            </div>
            <span className="df-boost">{game.boostCharges ? "⚡ " + game.boostCharges + " boost" : "normal yield"}</span>
          </div>
          <div className="df-cargo-list">
            {Object.keys(game.cargo).length === 0 && <p>No ore yet.</p>}
            {Object.entries(game.cargo).map(function (entry) {
              const type = entry[0];
              const qty = entry[1];
              return <div key={type}><span>{ORES[type].icon} {ORES[type].name}</span><b>x{qty}</b></div>;
            })}
          </div>
          <button className="df-primary" onClick={sellCargo}>Sell cargo</button>
        </section>

        <section className="df-panel">
          <span className="df-kicker">RIG UPGRADES</span>
          <div className="df-gear-grid">
            {gear.map(function (item) {
              return (
                <button key={item.key} onClick={function () { upgradeGear(item.key); }}>
                  <span>{item.icon}</span>
                  <b>{item.name}</b>
                  <small>{item.desc}</small>
                  <small>{"$"}{gearCost(item.key).toLocaleString()}</small>
                </button>
              );
            })}
          </div>
        </section>
      </aside>
    </main>
  );
}