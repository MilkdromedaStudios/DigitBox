import { useEffect, useMemo, useState } from "react";
import { cloudEnabled, getOrCreatePlayerId, loadClans } from "./cloudSync";

function compact(value) {
  return Number(value || 0).toLocaleString();
}

export default function ClanWarScreen({ authUser, warPower, onWarResult, onNotice }) {
  const [data, setData] = useState({ myClan: null, clans: [] });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [battleLog, setBattleLog] = useState("Choose an enemy clan to contest a mining claim.");
  const playerId = useMemo(() => (authUser && authUser.id) || getOrCreatePlayerId(), [authUser]);
  const online = cloudEnabled();

  async function refresh() {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await loadClans(playerId);
      setData(next || { myClan: null, clans: [] });
      setError("");
    } catch (err) {
      setError(err.message || "Could not load clan rankings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [playerId, online]);

  const enemies = (data.clans || []).filter((clan) => !data.myClan || clan.id !== data.myClan.id);
  const selected = enemies.find((clan) => clan.id === selectedId) || enemies[0] || null;

  useEffect(() => {
    if (!selectedId && enemies.length) setSelectedId(enemies[0].id);
    if (selectedId && !enemies.some((clan) => clan.id === selectedId)) {
      setSelectedId(enemies[0] ? enemies[0].id : "");
    }
  }, [selectedId, enemies.map((clan) => clan.id).join("|")]);

  function fight() {
    if (!data.myClan || !selected) return;

    const ownBase =
      Number(data.myClan.companyValue || 0) * 0.012 +
      Number(data.myClan.trophies || 0) * 1.3 +
      Number(warPower || 0);

    const enemyBase =
      Number(selected.companyValue || 0) * 0.012 +
      Number(selected.trophies || 0) * 1.3 +
      Number(selected.memberCount || 1) * 12;

    const ownRoll = ownBase * (0.9 + Math.random() * 0.22);
    const enemyRoll = enemyBase * (0.9 + Math.random() * 0.22);
    const win = ownRoll >= enemyRoll;
    const trophyDelta = win ? 18 + Math.min(22, selected.memberCount || 0) : -Math.min(12, 5 + Math.floor((selected.memberCount || 1) / 3));
    const reward = win ? 90 + Math.min(260, Math.floor((selected.companyValue || 0) / 140)) : 0;

    const message = win
      ? data.myClan.name + " defeated " + selected.name + " and captured the claim."
      : selected.name + " held the claim against " + data.myClan.name + ".";

    setBattleLog(message + (win ? " +" + trophyDelta + " trophies · $" + reward.toLocaleString() : " " + trophyDelta + " trophies."));
    if (onWarResult) onWarResult({ win, trophyDelta, reward, enemy: selected });
    if (onNotice) onNotice(message);
    setTimeout(refresh, 250);
  }

  if (!online) {
    return (
      <div className="df2-screen-scroll df-war-screen">
        <section className="df-war-empty">
          <span className="df-kicker">CLAN WARS</span>
          <h2>Shared clan battles need D1.</h2>
          <p>Connect the DEEPFORGE Cloudflare API to load real clans as opponents.</p>
        </section>
      </div>
    );
  }

  if (loading) {
    return <div className="df2-screen-scroll df-war-screen"><div className="df-clan-loading">Loading clan battlefield…</div></div>;
  }

  if (error) {
    return <div className="df2-screen-scroll df-war-screen"><div className="df-clan-error">{error}</div></div>;
  }

  if (!data.myClan) {
    return (
      <div className="df2-screen-scroll df-war-screen">
        <section className="df-war-empty">
          <span className="df-kicker">CLAN WARS</span>
          <h2>Join a clan before fighting.</h2>
          <p>Clan Wars use your whole clan's company value and trophies. Create or join one in the Clans tab first.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="df2-screen-scroll df-war-screen">
      <div className="df-war-header">
        <div>
          <span className="df-kicker">CLAN WARS</span>
          <h2>{data.myClan.name} vs. rival clans</h2>
          <p>Fight real clans from the shared clan rankings for trophies and mining cash.</p>
        </div>
        <div className="df-war-power">
          <small>YOUR WAR POWER</small>
          <b>{compact(Math.round(warPower))}</b>
        </div>
      </div>

      <div className="df-war-grid">
        <section>
          <div className="df-clan-section-title">
            <div><span className="df-kicker">TARGETS</span><h3>Choose a rival clan</h3></div>
            <button onClick={refresh}>Refresh</button>
          </div>
          <div className="df-war-targets">
            {enemies.length === 0 ? (
              <div className="df-clan-empty">No rival clans exist yet.</div>
            ) : enemies.map((clan, index) => (
              <button
                key={clan.id}
                className={selected && selected.id === clan.id ? "active" : ""}
                onClick={() => setSelectedId(clan.id)}
              >
                <span>#{index + 1}</span>
                <i>{clan.tag}</i>
                <div><b>{clan.name}</b><small>{clan.memberCount}/30 miners</small></div>
                <em>◆ {compact(clan.companyValue)}</em>
                <strong>🏆 {compact(clan.trophies)}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="df-war-battle">
          {selected ? (
            <>
              <span className="df-kicker">CLAIM BATTLE</span>
              <h3>[{selected.tag}] {selected.name}</h3>
              <div className="df-war-versus">
                <article><small>YOUR CLAN</small><b>{data.myClan.tag}</b><span>🏆 {compact(data.myClan.trophies)}</span></article>
                <div>VS</div>
                <article><small>RIVAL</small><b>{selected.tag}</b><span>🏆 {compact(selected.trophies)}</span></article>
              </div>
              <button className="df2-raid" onClick={fight}>Fight for claim</button>
              <div className="df2-raid-log">{battleLog}</div>
            </>
          ) : (
            <div className="df-clan-empty">Select a rival clan.</div>
          )}
        </section>
      </div>
    </div>
  );
}
