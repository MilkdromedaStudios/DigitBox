import { BUILDINGS } from "./deepforgeData";

export default function DeepforgeCity(props) {
  const { game, companyValue, cityDefense, buildingCost, upgradeBuilding } = props;

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
          <p>
            Company value <b>{"$"}{companyValue.toLocaleString()}</b>
            {" · "}Defense <b>{cityDefense}</b>
          </p>
        </div>
      </section>

      <section className="df-building-grid">
        {BUILDINGS.map(function (building) {
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
              <button className="df-primary" onClick={function () { upgradeBuilding(building); }}>
                Upgrade · {"$"}{cost.toLocaleString()}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}