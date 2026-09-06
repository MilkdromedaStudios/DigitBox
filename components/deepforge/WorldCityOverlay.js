import { useMemo, useState } from "react";
import { surfaceHeight } from "./world";

function distanceTo(player, city) {
  return Math.abs((Number(city && city.x) || 0) - (Number(player && player.x) || 0));
}

function directionTo(player, city) {
  const dx = (Number(city && city.x) || 0) - (Number(player && player.x) || 0);
  if (Math.abs(dx) < 1.2) return "HERE";
  return dx < 0 ? "←" : "→";
}

function drillToolName(level) {
  const n = Number(level) || 1;
  if (n <= 1) return "Rusty Pickaxe";
  if (n === 2) return "Iron Pickaxe";
  if (n === 3) return "Steel Pickaxe";
  if (n === 4) return "Pneumatic Pick";
  if (n === 5) return "Power Drill";
  return "Deepcore Drill Mk " + (n - 4);
}

export default function WorldCityOverlay(props) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const player = props.player || { x: 0, y: 0 };
  const cities = Array.isArray(props.cities) ? props.cities : [];
  const players = Array.isArray(props.players) ? props.players : [];
  const myCity = props.myCity || null;
  const waypoint = props.waypoint || myCity || null;

  const nearest = useMemo(() => {
    let best = null;
    let bestDistance = Infinity;
    cities.forEach((city) => {
      const d = distanceTo(player, city);
      if (d < bestDistance) {
        bestDistance = d;
        best = city;
      }
    });
    return best ? { city: best, distance: bestDistance } : null;
  }, [cities, player.x]);

  const depth = Number(player.y) - surfaceHeight(Number(player.x) || 0);
  const visiting = nearest && nearest.distance <= 7.5 && depth < 1.5 ? nearest.city : null;
  const isMyCity = Boolean(visiting && myCity && visiting.ownerId === myCity.ownerId);
  const orderedCities = useMemo(() => {
    return cities.slice().sort((a, b) => distanceTo(player, a) - distanceTo(player, b));
  }, [cities, player.x]);

  return (
    <div className="df-world-city-ui">
      <div className="df-mp-status">
        <span className="dot" />
        <b>{players.length}</b>
        <small>online miner{players.length === 1 ? "" : "s"}</small>
      </div>

      {waypoint && (
        <div className="df-city-waypoint">
          <small>{waypoint.ownerId === (myCity && myCity.ownerId) ? "YOUR CITY" : "VISITING"}</small>
          <b>{directionTo(player, waypoint)} {Math.round(distanceTo(player, waypoint))}m</b>
          <span>{waypoint.ownerName}</span>
        </div>
      )}

      <button className="df-city-directory-toggle" onClick={() => setDirectoryOpen((value) => !value)}>
        🏘 <b>CITIES</b>
      </button>

      {directoryOpen && (
        <aside className="df-city-directory">
          <header>
            <div><small>SHARED SURFACE</small><b>City directory</b></div>
            <button onClick={() => setDirectoryOpen(false)}>×</button>
          </header>
          <p>Track a city, then walk there. Tracking never teleports you.</p>
          <div className="df-city-directory-list">
            {orderedCities.length === 0 && <div className="empty">Log in and sync to discover player cities.</div>}
            {orderedCities.map((city) => {
              const mine = myCity && city.ownerId === myCity.ownerId;
              const active = waypoint && city.ownerId === waypoint.ownerId;
              return (
                <button key={city.ownerId} className={active ? "active" : ""} onClick={() => props.onWaypoint && props.onWaypoint(city)}>
                  <span className={city.online ? "city-online online" : "city-online"} />
                  <div>
                    <b>{mine ? "YOUR CITY" : city.ownerName + "'s city"}</b>
                    <small>{Math.round(distanceTo(player, city))}m away · X {Math.round(city.x)}</small>
                  </div>
                  <em>{directionTo(player, city)}</em>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {visiting && (
        <aside className={"df-city-arrival" + (isMyCity ? " mine" : " visitor")}>
          <div className="df-city-arrival-head">
            <span>{isMyCity ? "🏚" : "🏙"}</span>
            <div>
              <small>{isMyCity ? "YOU WALKED HOME" : "PLAYER CITY"}</small>
              <b>{isMyCity ? "Your mining town" : visiting.ownerName + "'s city"}</b>
            </div>
          </div>

          {isMyCity ? (
            <>
              <p><b>MINING SUPPLY DEPOT</b> · Gear can only be purchased while you are physically inside your own city.</p>
              <div className="df-city-buildings">
                {[
                  { key: "drill", icon: "⛏", name: drillToolName(props.game.drill), detail: "Mining tool · power " + (props.drillDamage || props.game.drill) },
                  { key: "cargoMax", icon: "🛒", name: "Heavy Haul Cart", detail: props.game.cargoMax + " ore capacity" },
                  { key: "armor", icon: "🛡", name: "Reinforced Mining Suit", detail: props.game.maxHp + " protection" },
                  { key: "blaster", icon: "⚔", name: "Steel Mining Sword", detail: "Sword level " + props.game.blaster },
                ].map((item) => {
                  const cost = props.gearCost ? props.gearCost(item.key) : 0;
                  return (
                    <button key={item.key} onClick={() => props.upgradeGear && props.upgradeGear(item.key)}>
                      <span>{item.icon}</span>
                      <div><b>{item.name}</b><small>{item.detail}</small></div>
                      <em>${cost.toLocaleString()}</em>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="df-city-visitor-stats">
              <div><small>COMPANY</small><b>{Number(visiting.companyValue || 0).toLocaleString()}</b></div>
              <div><small>TROPHIES</small><b>{Number(visiting.trophies || 0).toLocaleString()}</b></div>
              <div><small>STATUS</small><b>{visiting.online ? "ONLINE" : "OFFLINE"}</b></div>
            </div>
          )}
        </aside>
      )}

      <style jsx global>{`
        .df-world-city-ui{pointer-events:none;position:absolute;inset:0;z-index:18}.df-world-city-ui button,.df-world-city-ui aside{pointer-events:auto}.df-mp-status{position:absolute;left:12px;top:58px;display:flex;align-items:center;gap:5px;padding:6px 8px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:rgba(14,23,27,.76);backdrop-filter:blur(8px);color:#c8d4d9}.df-mp-status .dot{width:7px;height:7px;border-radius:99px;background:#58d58b;box-shadow:0 0 9px rgba(88,213,139,.55)}.df-mp-status b{font-size:.65rem}.df-mp-status small{font-size:.52rem;color:#8d9da4}.df-city-waypoint{position:absolute;top:9px;left:50%;transform:translateX(-50%);min-width:155px;padding:6px 12px;border:1px solid rgba(255,220,141,.16);border-radius:9px;background:rgba(26,28,24,.78);backdrop-filter:blur(8px);text-align:center;color:#ead7ab}.df-city-waypoint small,.df-city-waypoint b,.df-city-waypoint span{display:block}.df-city-waypoint small{font-size:.42rem;letter-spacing:.14em;color:#a89266}.df-city-waypoint b{margin-top:1px;font-size:.72rem}.df-city-waypoint span{font-size:.5rem;color:#8f8777}.df-city-directory-toggle{position:absolute;right:12px;top:58px;min-height:34px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(14,23,27,.8);color:#cbd8dc;font-size:.58rem;cursor:pointer}.df-city-directory{position:absolute;right:12px;top:98px;width:min(320px,calc(100vw - 24px));max-height:58vh;overflow:auto;padding:11px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(14,22,25,.95);box-shadow:0 18px 50px rgba(0,0,0,.42);color:#d8e0e3}.df-city-directory header{display:flex;align-items:center;justify-content:space-between}.df-city-directory header small,.df-city-directory header b{display:block}.df-city-directory header small{font-size:.45rem;letter-spacing:.13em;color:#78919c}.df-city-directory header b{font-size:.82rem}.df-city-directory header button{width:28px;height:28px;border:0;border-radius:7px;background:rgba(255,255,255,.05);color:#9eabb0;cursor:pointer}.df-city-directory>p{margin:7px 0 9px;color:#84959c;font-size:.55rem;line-height:1.4}.df-city-directory-list{display:grid;gap:5px}.df-city-directory-list>button{display:flex;align-items:center;gap:8px;width:100%;padding:7px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:rgba(255,255,255,.025);color:#c7d0d4;text-align:left;cursor:pointer}.df-city-directory-list>button.active{border-color:rgba(224,190,111,.24);background:rgba(187,143,55,.09)}.df-city-directory-list .city-online{width:7px;height:7px;border-radius:99px;background:#606b70}.df-city-directory-list .city-online.online{background:#56ce86;box-shadow:0 0 8px rgba(86,206,134,.45)}.df-city-directory-list button>div{min-width:0;flex:1}.df-city-directory-list b,.df-city-directory-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.df-city-directory-list b{font-size:.58rem}.df-city-directory-list small{margin-top:2px;color:#77878e;font-size:.48rem}.df-city-directory-list em{font-style:normal;color:#d8bd7b;font-weight:900}.df-city-directory-list .empty{padding:9px;color:#708187;font-size:.55rem}.df-city-arrival{position:absolute;left:50%;bottom:9px;transform:translateX(-50%);width:min(620px,calc(100vw - 150px));padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(19,24,24,.92);box-shadow:0 16px 45px rgba(0,0,0,.4);color:#dbe1e0}.df-city-arrival.mine{border-color:rgba(213,176,95,.22);background:rgba(30,27,20,.94)}.df-city-arrival-head{display:flex;align-items:center;gap:8px}.df-city-arrival-head>span{font-size:1.2rem}.df-city-arrival-head small,.df-city-arrival-head b{display:block}.df-city-arrival-head small{font-size:.43rem;letter-spacing:.13em;color:#8d927f}.df-city-arrival-head b{font-size:.72rem}.df-city-arrival>p{margin:6px 0;color:#8e9999;font-size:.52rem}.df-city-buildings{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.df-city-buildings button{display:flex;align-items:center;gap:6px;min-width:0;padding:7px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(255,255,255,.025);color:#ddd1b7;text-align:left;cursor:pointer}.df-city-buildings button>span{font-size:.9rem}.df-city-buildings button>div{min-width:0;flex:1}.df-city-buildings b,.df-city-buildings small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.df-city-buildings b{font-size:.52rem}.df-city-buildings small{font-size:.43rem;color:#7f796d}.df-city-buildings em{font-size:.48rem;font-style:normal;color:#d2b367}.df-city-visitor-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.df-city-visitor-stats>div{padding:7px;border-radius:7px;background:rgba(255,255,255,.03)}.df-city-visitor-stats small,.df-city-visitor-stats b{display:block}.df-city-visitor-stats small{font-size:.43rem;color:#718187}.df-city-visitor-stats b{margin-top:2px;font-size:.63rem}@media(max-width:720px){.df-city-arrival{width:calc(100vw - 20px);bottom:78px}.df-city-buildings{grid-template-columns:1fr 1fr}.df-city-directory-toggle{right:8px}.df-mp-status{left:8px}.df-city-waypoint{top:8px}}
      `}</style>
    </div>
  );
}
