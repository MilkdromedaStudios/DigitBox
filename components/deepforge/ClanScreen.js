import { useEffect, useMemo, useState } from "react";
import {
  cloudEnabled,
  cloudLogin,
  cloudLogout,
  cloudSignup,
  createClan,
  getCloudAuthToken,
  getOrCreatePlayerId,
  joinClan,
  joinClanById,
  leaveClan,
  loadClans,
  syncClanProfile,
} from "./cloudSync";

function minerName(playerId) {
  const id = String(playerId || "");
  return "Miner #" + id.slice(-4).toUpperCase();
}

function compact(value) {
  return Number(value || 0).toLocaleString();
}

export default function ClanScreen({ companyValue, trophies, onNotice, authUser, authLoading, onAuthChanged }) {
  const [data, setData] = useState({ myClan: null, clans: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [invite, setInvite] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
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
      if (success) {
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
    run(
      "create",
      () => createClan(authUser.id, cleanName, cleanTag, companyValue, trophies, accessToken),
      "Clan created. Share its invite code with another miner."
    ).then(() => {
      if (cleanName && cleanTag) {
        setName("");
        setTag("");
      }
    });
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("auth");
    setError("");
    try {
      const result = authMode === "signup"
        ? await cloudSignup(authEmail.trim(), authPassword, authDisplayName.trim())
        : await cloudLogin(authEmail.trim(), authPassword);
      if (onAuthChanged) onAuthChanged(result && result.user ? result.user : null);
      setAuthPassword("");
      onNotice && onNotice(authMode === "signup" ? "DEEPFORGE account created." : "Logged in to DEEPFORGE.");
    } catch (err) {
      setError(err.message || "Cloudflare login failed.");
    } finally {
      setBusy("");
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
    run(
      "join-code",
      () => joinClan(playerId, code, companyValue, trophies),
      "Joined the clan."
    ).then(() => setInvite(""));
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
          <h2>Clans are ready for Cloudflare D1.</h2>
          <p>
            The game code now supports real cross-player clans, but the shared feature activates only after
            the DEEPFORGE Worker/D1 endpoint is connected through <code>NEXT_PUBLIC_DEEPFORGE_API</code>.
          </p>
          <div className="df-clan-preview-grid">
            <article><b>Create a clan</b><span>Name + 2–5 character tag + invite code.</span></article>
            <article><b>Join friends</b><span>Use their six-character invite code.</span></article>
            <article><b>Browse clans</b><span>Join public mining clans from the ranking list.</span></article>
            <article><b>Shared totals</b><span>Members contribute company value and trophies.</span></article>
          </div>
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
            <div className="df-clan-emblem">{myClan.tag}</div>
            <div>
              <span className="df-kicker">YOUR CLAN</span>
              <h2>{myClan.name}</h2>
              <p>{myClan.memberCount}/30 miners · shared mining company</p>
            </div>
            <div className="df-clan-totals">
              <div><span>◆</span><b>{compact(myClan.companyValue)}</b><small>company</small></div>
              <div><span>🏆</span><b>{compact(myClan.trophies)}</b><small>trophies</small></div>
            </div>
          </div>

          <div className="df-clan-code">
            <div>
              <small>INVITE CODE</small>
              <b>{myClan.inviteCode}</b>
            </div>
            <button onClick={() => copyCode(myClan.inviteCode)}>Copy code</button>
          </div>

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
                <input
                  value={name}
                  maxLength={24}
                  minLength={3}
                  placeholder="Canyon Mining Co."
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Tag
                <input
                  value={tag}
                  maxLength={5}
                  minLength={2}
                  placeholder="CMC"
                  onChange={(event) => setTag(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
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
                <div className="df-clan-inline-auth">
                  <b>Cloudflare account required to create a clan</b>
                  <form onSubmit={handleAuth}>
                    {authMode === "signup" && (
                      <input
                        value={authDisplayName}
                        maxLength={24}
                        placeholder="Miner name"
                        onChange={(event) => setAuthDisplayName(event.target.value)}
                      />
                    )}
                    <input
                      type="email"
                      value={authEmail}
                      placeholder="Email"
                      onChange={(event) => setAuthEmail(event.target.value)}
                    />
                    <input
                      type="password"
                      value={authPassword}
                      minLength={8}
                      placeholder="Password"
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                    <button disabled={busy === "auth" || !authEmail.trim() || authPassword.length < 8}>
                      {busy === "auth" ? "Working…" : authMode === "signup" ? "Create account" : "Log in"}
                    </button>
                  </form>
                  <button
                    type="button"
                    className="df-clan-auth-switch"
                    onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}
                  >
                    {authMode === "signup" ? "Already have an account? Log in" : "New player? Create an account"}
                  </button>
                </div>
              )}
            </form>

            <form onSubmit={handleJoinCode}>
              <span className="df-kicker">JOIN A FRIEND</span>
              <h2>Use an invite code</h2>
              <p>Ask another miner for the six-character code shown inside their clan screen.</p>
              <input
                className="df-clan-invite-input"
                value={invite}
                maxLength={6}
                placeholder="ABC123"
                onChange={(event) => setInvite(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <button disabled={Boolean(busy) || invite.length !== 6}>
                {busy === "join-code" ? "Joining…" : "Join clan"}
              </button>
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
                    <span className="df-clan-list-tag">{clan.tag}</span>
                    <div>
                      <b>{clan.name}</b>
                      <small>{clan.memberCount}/30 miners</small>
                    </div>
                    <em>◆ {compact(clan.companyValue)}</em>
                    <strong>🏆 {compact(clan.trophies)}</strong>
                    <button
                      disabled={Boolean(busy) || clan.memberCount >= 30}
                      onClick={() => run(
                        "join-" + clan.id,
                        () => joinClanById(playerId, clan.id, companyValue, trophies),
                        "Joined " + clan.name + "."
                      )}
                    >
                      {busy === "join-" + clan.id ? "Joining…" : clan.memberCount >= 30 ? "Full" : "Join"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
