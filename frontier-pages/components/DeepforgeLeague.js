import { RIVALS } from "./deepforgeData";

export default function DeepforgeLeague(props) {
  const {
    selectedRival, setSelectedRival, raidPower, raid, raidLog,
    leaderboard, cityDefense
  } = props;

  return (
    <main className="df-league-layout">
      <section className="df-panel">
        <div className="df-panel-head">
          <div>
            <span className="df-kicker">GHOST LEAGUE // STATIC PROTOTYPE</span>
            <h2>Rival claims</h2>
          </div>
          <div className="df-depth">⚔ {raidPower}</div>
        </div>

        <p className="df-muted">
          These rivals are simulated snapshots for the GitHub Pages prototype.
          Real player cities can replace them later.
        </p>

        <div className="df-rivals">
          {RIVALS.map(function (rival, index) {
            return (
              <button
                key={rival.name}
                onClick={function () { setSelectedRival(index); }}
                className={selectedRival === index ? "df-selected-rival" : ""}
              >
                <span className="df-rival-avatar">{rival.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <b>{rival.name}</b>
                  <small>{rival.city} · ⚔ {rival.power}</small>
                </span>
                <em>🏆 {rival.trophies}</em>
              </button>
            );
          })}
        </div>

        <button className="df-raid" onClick={raid}>Raid {RIVALS[selectedRival].name}</button>
        <div className="df-raid-log">{raidLog}</div>
      </section>

      <section className="df-panel">
        <span className="df-kicker">LEADERBOARD</span>
        <h2>Bronze Circuit</h2>
        <div className="df-rank-list">
          {leaderboard.map(function (entry, index) {
            return (
              <div key={entry.name} className={!entry.npc ? "df-you-rank" : ""}>
                <span>#{index + 1}</span>
                <b>{entry.name}</b>
                <em>{entry.trophies} 🏆</em>
              </div>
            );
          })}
        </div>

        <div className="df-defense-box">
          <span>City defense</span>
          <b>{cityDefense}</b>
          <small>Armor + city walls determine how hard your city is to raid.</small>
        </div>
      </section>
    </main>
  );
}