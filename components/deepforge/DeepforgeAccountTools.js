import { useEffect, useState } from "react";
import { deleteCloudAccount, getCloudAuthToken, loadCloudAuth } from "./cloudSync";

export default function DeepforgeAccountTools() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      if (!getCloudAuthToken()) {
        if (mounted) setUser(null);
        return;
      }
      const next = await loadCloudAuth().catch(() => null);
      if (mounted) setUser(next);
    }
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  async function removeAccount() {
    if (!user || busy || user.owner || user.displayName === "Numberstring") return;
    const typed = window.prompt('Type DELETE to permanently delete your DEEPFORGE account.');
    if (typed !== "DELETE") return;
    if (!window.confirm("This deletes the account, sessions, and clan membership. Continue?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteCloudAccount();
      setUser(null);
      setOpen(false);
      window.location.reload();
    } catch (err) {
      setError(err.message || "Could not delete account.");
      setBusy(false);
    }
  }

  if (!user) return null;
  const permanent = Boolean(user.owner || user.displayName === "Numberstring");

  return (
    <>
      <button className="df-account-settings-fab" onClick={() => setOpen(true)}>⚙ Account</button>
      {open && (
        <div className="df-account-settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="df-account-settings-card">
            <div className="df-account-settings-head">
              <div><small>ACCOUNT SETTINGS</small><h3>{user.displayName || user.email}</h3></div>
              <button onClick={() => setOpen(false)}>×</button>
            </div>
            <p>{user.email}</p>
            {permanent ? (
              <div className="df-account-permanent">♛ Permanent DEEPFORGE owner account · deletion disabled</div>
            ) : (
              <div className="df-account-danger">
                <b>Delete account</b>
                <span>This removes your cloud account and clan membership. If you own a clan, ownership transfers to its oldest remaining member.</span>
                <button disabled={busy} onClick={removeAccount}>{busy ? "Deleting…" : "Delete my account"}</button>
              </div>
            )}
            {error && <div className="df-account-settings-error">{error}</div>}
          </section>
        </div>
      )}

      <style jsx global>{`
        .df-account-settings-fab{position:fixed;left:14px;bottom:14px;z-index:1350;min-height:36px;padding:0 11px;border:1px solid rgba(224,203,167,.16);border-radius:10px;background:rgba(34,28,23,.9);color:#cbbb9f;font-size:.61rem;font-weight:850;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3)}.df-account-settings-backdrop{position:fixed;inset:0;z-index:1700;display:grid;place-items:center;padding:12px;background:rgba(8,6,5,.82);backdrop-filter:blur(4px)}.df-account-settings-card{width:min(430px,100%);padding:16px;border:1px solid rgba(233,211,176,.15);border-radius:15px;background:linear-gradient(180deg,#493a2e,#2e261f);color:#eadcc6;box-shadow:0 28px 80px rgba(0,0,0,.58)}.df-account-settings-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.df-account-settings-head small{display:block;color:#aa9678;font-size:.49rem;letter-spacing:.13em;font-weight:900}.df-account-settings-head h3{margin:3px 0 0}.df-account-settings-head>button{width:33px;height:33px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);color:#d7c7ad;font-size:1.1rem;cursor:pointer}.df-account-settings-card>p{margin:8px 0 15px;color:#9d907d;font-size:.67rem}.df-account-permanent{padding:11px;border:1px solid rgba(225,184,86,.19);border-radius:9px;background:rgba(174,124,32,.1);color:#e3c576;font-size:.65rem;font-weight:850}.df-account-danger{display:grid;gap:6px;padding:12px;border:1px solid rgba(196,93,70,.22);border-radius:10px;background:rgba(120,49,38,.12)}.df-account-danger b{color:#efb5a4;font-size:.72rem}.df-account-danger span{color:#aa8d83;font-size:.6rem;line-height:1.45}.df-account-danger button{min-height:39px;margin-top:5px;border:1px solid rgba(231,120,91,.24);border-radius:8px;background:#743f35;color:#f0d2c9;font-weight:900;cursor:pointer}.df-account-danger button:disabled{opacity:.5}.df-account-settings-error{margin-top:9px;padding:8px;border-radius:8px;background:rgba(126,53,40,.16);color:#efb9aa;font-size:.62rem}
      `}</style>
    </>
  );
}
