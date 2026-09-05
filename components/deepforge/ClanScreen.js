import { useEffect, useMemo, useState } from "react";
import {
  clanEmblemUrl,
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
  uploadClanEmblem,
  deleteClanEmblem,
} from "./cloudSync";

function minerName(playerId) {
  const id = String(playerId || "");
  return "Miner #" + id.slice(-4).toUpperCase();
}

function compact(value) {
  return Number(value || 0).toLocaleString();
}

function ClanEmblem({ clan, version, small }) {
  const [failed, setFailed] = useState(false);
  const src = clan && clan.id ? clanEmblemUrl(clan.id, version) : "";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={small ? "df-clan-list-emblem" : "df-clan-emblem"}>
      {src && !failed ? (
        <img src={src} alt={clan.name + " emblem"} onError={() => setFailed(true)} />
      ) : (
        <span>{clan.tag}</span>
      )}
    </div>
  );
}

export default function ClanScreen({ companyValue, trophies, onNotice, authUser, authLoading, onAuthChanged, onOpenAccount }) {
  const [data, setData] = useState({ myClan: null, clans: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [invite, setInvite] = useState("");
  const [emblemVersion, setEmblemVersion] = useState(0);
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

  async function handleEmblemUpload(event, clanId) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || busy) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Clan emblem must be 2 MB or smaller.");
      return;
    }
    setBusy("emblem");
    setError("");
    try {
      await uploadClanEmblem(clanId, file);
      setEmblemVersion(Date.now());
      onNotice && onNotice("Clan emblem uploaded to Cloudflare R2.");
    } catch (err) {
      setError(err.message || "Could not upload clan emblem.");
    } finally {
      setBusy("");
    }
  }

  async function handleEmblemDelete(clanId) {
    if (busy) return;
    setBusy("emblem-delete");
    setError("");
    try {
      await deleteClanEmblem(clanId);
      setEmblemVersion(Date.now());
      onNotice && onNotice("Clan emblem removed from R2.");
    } catch (err) {
      setError(err.message || "Could not remove clan emblem.");
    } finally {
      setBusy("");
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
            <ClanEmblem clan={myClan} version={emblemVersion} />
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

          {myClan.role === "owner" && (
            <div className="df-clan-r2-controls">
              <div>
                <small>CLAN EMBLEM · R2</small>
                <b>PNG, JPG or WebP · max 2 MB</b>
              </div>
              <label className="df-clan-upload-button">
                {busy === "emblem" ? "Uploading…" : "Upload / replace"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={Boolean(busy)}
                  onChange={(event) => handleEmblemUpload(event, myClan.id)}
                />
              </label>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => handleEmblemDelete(myClan.id)}
              >
                {busy === "emblem-delete" ? "Removing…" : "Remove"}
              </button>
            </div>
          )}

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
                <div className="df-clan-login-prompt">
                  <div>
                    <b>Account required</b>
                    <small>Log in to create and own a clan.</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAccount && onOpenAccount()}
                  >
                    Log in
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
                    <ClanEmblem clan={clan} small />
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
