import { useEffect, useMemo, useState } from "react";
import {
  cloudEnabled,
  cloudLogout,
  createClan,
  getCloudAuthToken,
  getOrCreatePlayerId,
  joinClan,
  joinClanById,
  leaveClan,
  loadClans,
  syncClanProfile,
} from "./cloudSync";
import { ClanBadge, ClanDesignerControl } from "./ClanDesigner";

function minerName(playerId) {
  const id = String(playerId || "");
  return "Miner #" + id.slice(-4).toUpperCase();
}

function compact(value) {
  return Number(value || 0).toLocaleString();
}

export default function ClanScreen({ companyValue, trophies, onNotice, authUser, authLoading, onAuthChanged, onOpenAccount }) {
  const [data, setData] = useState({ myClan: null, clans: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [invite, setInvite] = useState("");
  const guestPlayerId = useMemo(() => getOrCreatePlayerId(), []);
  const playerId = authUser && authUser.id ? authUser.id : guestPlayerId;
  const online = cloudEnabled();

  async function refresh(showLoading) {
    if (!online) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const next = await loadClans(playerId);
      setData(next || { myClan: null, clans: [] });
      setError("");
    } catch (err) {
      setError(err.message || "Could not load clans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    if (!online) return undefined;
    const timer = setInterval(() => refresh(false), 15000);
    return () => clearInterval(timer);
  }, [online, playerId]);

  useEffect(() => {
    if (!online || !data.myClan) return undefined;
    const timer = setTimeout(() => {
      syncClanProfile(playerId, companyValue, trophies).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [online, playerId, companyValue, trophies, Boolean(data.myClan)]);

  async function run(label, action, success) {
    if (!online || busy) return;
    setBusy(label);
    setError("");
    try {
      const next = await action();
      if (next && next.clans) setData(next);
      else await refresh(false);
      if (next && next.requested) {
        onNotice && onNotice("Admin access request sent. Numberstring must approve it.");
      } else if (success) {
        onNotice && onNotice(success);
      }
    } catch (err) {
      setError(err.message || "Clan action failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!authUser) {
      setError("You must log in to create a clan.");
      return;
    }
    const accessToken = getCloudAuthToken();
    if (!accessToken) {
      setError("Your Cloudflare login session expired. Log in again.");
      if (onAuthChanged) onAuthChanged(null);
      return;
    }
    const cleanName = name.trim();
    const cleanTag = tag.trim().toUpperCase();
    await run(
      "create",
      () => createClan(authUser.id, cleanName, cleanTag, companyValue, trophies, accessToken),
      "Clan created. You can customize its emblem now."
    );
    if (cleanName && cleanTag) {
      setName("");
      setTag("");
    }
  }

  async function handleLogout() {
    if (busy) return;
    setBusy("logout");
    try {
      await cloudLogout();
      if (onAuthChanged) onAuthChanged(null);
      onNotice && onNotice("Logged out of DEEPFORGE.");
    } finally {
      setBusy("");
    }
  }

  function handleJoinCode(event) {
    event.preventDefault();
    const code = invite.trim().toUpperCase();
    run("join-code", () => joinClan(playerId, code, companyValue, trophies), "Joined the clan.")
      .then(() => setInvite(""));
  }

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      onNotice && onNotice("Clan invite code copied.");
    } catch (_) {
      onNotice && onNotice("Invite code: " + code);
    }
  }

  if (!online) {
    return (
      <div className="df2-screen-scroll df-clan-screen">
        <section className="df-clan-offline">
          <span className="df-kicker">SHARED CLANS</span>
          <h2>Clans are offline.</h2>
          <p>The shared clan backend is unavailable right now.</p>
        </section>
      </div>
    );
  }

  const myClan = data.myClan;
  const clans = data.clans || [];

  return (
    <div className="df2-screen-scroll df-clan-screen">
      {loading && <div className="df-clan-loading">Loading shared clans…</div>}
      {error && <div className="df-clan-error">{error}</div>}

      {myClan ? (
        <section className="df-clan-home">
          <div className="df-clan-banner">
            <ClanBadge clan={myClan} />
            <div>
              <span className="df-kicker">YOUR CLAN</span>
              <h2>{myClan.name}</h2>
              <p>{myClan.adminClan ? "♛ ADMIN CLAN · owner permissions enabled" : myClan.memberCount + "/30 miners · shared mining company"}</p>
            </div>
            <div className="df-clan-totals">
              <div><span>◆</span><b>{compact(myClan.companyValue)}</b><small>company</small></div>
              <div><span>🏆</span><b>{compact(myClan.trophies)}</b><small>trophies</small></div>
            </div>
          </div>

          <div className={"df-clan-code" + (myClan.adminClan ? " admin-request-only" : "")}>
            <div>
              <small>{myClan.adminClan ? "REQUEST-ONLY ACCESS CODE" : "INVITE CODE"}</small>
              <b>{myClan.inviteCode}</b>
            </div>
            <button onClick={() => copyCode(myClan.inviteCode)}>Copy code</button>
            {myClan.adminClan && <p>Using this code only sends a request. Numberstring must approve every Admin member.</p>}
          </div>

          <ClanDesignerControl clan={myClan} authUser={authUser} onNotice={onNotice} />

          <div className="df-clan-members">
            <div className="df-clan-section-title">
              <div><span className="df-kicker">MEMBERS</span><h3>Mining crew</h3></div>
              <button onClick={() => refresh(true)} disabled={Boolean(busy)}>Refresh</button>
            </div>
            {myClan.members.map((member, index) => (
              <article key={member.playerId} className={member.playerId === playerId ? "you" : ""}>
                <span className="df-clan-member-rank">#{index + 1}</span>
                <div>
                  <b>{member.playerId === playerId ? "YOU" : minerName(member.playerId)}</b>
                  <small>{member.role === "owner" ? "Clan owner" : "Member"}</small>
                </div>
                <em>◆ {compact(member.companyValue)}</em>
                <strong>🏆 {compact(member.trophies)}</strong>
              </article>
            ))}
          </div>

          <button
            className="df-clan-leave"
            disabled={Boolean(busy)}
            onClick={() => run("leave", () => leaveClan(playerId), "You left the clan.")}
          >
            {myClan.role === "owner" ? "Leave clan / transfer ownership" : "Leave clan"}
          </button>
        </section>
      ) : (
        <>
          <section className="df-clan-start">
            <form onSubmit={handleCreate}>
              <span className="df-kicker">START A CLAN</span>
              <h2>Create your mining crew</h2>
              <label>
                Clan name
                <input value={name} maxLength={24} minLength={3} placeholder="Canyon Mining Co." onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Tag
                <input value={tag} maxLength={5} minLength={2} placeholder="CMC" onChange={(event) => setTag(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
              </label>
              {authLoading ? (
                <button disabled>Checking login…</button>
              ) : authUser ? (
                <>
                  <div className="df-clan-auth-status">
                    <span>Logged in as <b>{authUser.displayName || authUser.email}</b></span>
                    <button type="button" onClick={handleLogout} disabled={Boolean(busy)}>Log out</button>
                  </div>
                  <button disabled={Boolean(busy) || name.trim().length < 3 || tag.trim().length < 2}>
                    {busy === "create" ? "Creating…" : "Create clan"}
                  </button>
                </>
              ) : (
                <div className="df-clan-login-prompt">
                  <div><b>Account required</b><small>Log in to create and own a clan.</small></div>
                  <button type="button" onClick={() => onOpenAccount && onOpenAccount()}>Log in</button>
                </div>
              )}
            </form>

            <form onSubmit={handleJoinCode}>
              <span className="df-kicker">JOIN A FRIEND</span>
              <h2>Use an invite code</h2>
              <p>Ask another miner for the six-character code shown inside their clan screen.</p>
              <input className="df-clan-invite-input" value={invite} maxLength={6} placeholder="ABC123" onChange={(event) => setInvite(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
              <button disabled={Boolean(busy) || invite.length !== 6}>{busy === "join-code" ? "Submitting…" : "Join / request access"}</button>
            </form>
          </section>

          <section className="df-clan-browser">
            <div className="df-clan-section-title">
              <div><span className="df-kicker">PUBLIC CLANS</span><h3>Mining clan rankings</h3></div>
              <button onClick={() => refresh(true)} disabled={Boolean(busy)}>Refresh</button>
            </div>

            {clans.length === 0 ? (
              <div className="df-clan-empty">No clans yet. You can be the first founder.</div>
            ) : (
              <div className="df-clan-list">
                {clans.map((clan, index) => (
                  <article key={clan.id}>
                    <span className="df-clan-list-rank">#{index + 1}</span>
                    <ClanBadge clan={clan} small />
                    <div>
                      <b>{clan.adminClan ? "♛ " + clan.name : clan.name}</b>
                      <small>{clan.adminClan ? "REQUEST ONLY · grants admin permissions" : clan.memberCount + "/30 miners"}</small>
                    </div>
                    <em>◆ {compact(clan.companyValue)}</em>
                    <strong>🏆 {compact(clan.trophies)}</strong>
                    <div className="df-clan-public-actions">
                      <ClanDesignerControl clan={clan} authUser={authUser} onNotice={onNotice} compact />
                      <button
                        disabled={
                          Boolean(busy) ||
                          clan.memberCount >= 30 ||
                          Boolean(clan.requestPending) ||
                          Boolean(clan.adminClan && !authUser)
                        }
                        onClick={() => run(
                          "join-" + clan.id,
                          () => joinClanById(playerId, clan.id, companyValue, trophies),
                          clan.adminClan ? "Admin request submitted." : "Joined " + clan.name + "."
                        )}
                      >
                        {busy === "join-" + clan.id
                          ? "Submitting…"
                          : clan.requestPending
                            ? "Requested"
                            : clan.adminClan && !authUser
                              ? "Log in to request"
                              : clan.memberCount >= 30
                                ? "Full"
                                : clan.requestOnly
                                  ? "Request access"
                                  : "Join"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <style jsx global>{`
        .df-clan-public-actions{display:flex;align-items:center;gap:6px}.df-clan-public-actions>button{min-width:76px}.df-clan-code.admin-request-only{border-color:rgba(255,201,92,.22);background:rgba(98,67,18,.09)}.df-clan-code.admin-request-only p{grid-column:1/-1;margin:2px 0 0;color:#a88b54;font-size:.55rem}.df-clan-list article:has(.df-clan-public-actions button:disabled){opacity:.92}@media(max-width:620px){.df-clan-public-actions{flex-direction:column}}
      `}</style>
    </div>
  );
}
