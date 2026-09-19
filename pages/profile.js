import { useEffect, useMemo, useState } from "react";
import {
  loadCloudProfile,
  uploadCloudAvatar,
  deleteCloudAvatar,
} from "../components/deepforge/cloudSync";
import {
  loadBillingStatus,
  startBillingCheckout,
  openBillingPortal,
} from "../components/deepforge/billing";
import {
  DEFAULT_PROFILE_PREFS,
  THEME_PRESETS,
  readProfilePrefsFromCookie,
  saveProfilePrefsToCookie,
  sanitizeProfilePrefs,
} from "../lib/profilePreferences";

const FOUR_MB = 4 * 1024 * 1024;

function formatBillingDate(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(timestamp));
  } catch (_) {
    return "";
  }
}

export default function ProfilePage() {
  const [prefs, setPrefs] = useState(DEFAULT_PROFILE_PREFS);
  const [account, setAccount] = useState(null);
  const [billing, setBilling] = useState(null);
  const [billingBusy, setBillingBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    setPrefs(readProfilePrefsFromCookie());

    async function load() {
      const nextAccount = await loadCloudProfile().catch(() => null);
      if (!mounted) return;
      setAccount(nextAccount);
      if (!nextAccount) return;

      if (typeof window !== "undefined") {
        const result = new URLSearchParams(window.location.search).get("billing");
        if (result === "success") setMessage("Payment received. DigitBox Pro will unlock as soon as Stripe confirms the subscription.");
        if (result === "cancelled") setMessage("Checkout was cancelled. No subscription changes were made.");
      }

      const nextBilling = await loadBillingStatus().catch(() => null);
      if (mounted) setBilling(nextBilling);
    }

    load();
    return () => { mounted = false; };
  }, []);

  const previewName = useMemo(
    () => prefs.displayName || account?.displayName || "Player",
    [prefs.displayName, account]
  );

  const isPro = !!billing?.entitlements?.features?.includes("nexus_pro");
  const subscriptionStatus = billing?.entitlements?.subscriptionStatus || "none";
  const renewalDate = formatBillingDate(billing?.entitlements?.currentPeriodEnd);

  function updateField(field, value) {
    const next = sanitizeProfilePrefs({ ...prefs, [field]: value });
    setPrefs(next);
    saveProfilePrefsToCookie(next);
  }

  async function refreshBilling() {
    try {
      const next = await loadBillingStatus();
      setBilling(next);
      return next;
    } catch (_) {
      return null;
    }
  }

  async function beginCheckout(interval) {
    setBillingBusy(interval);
    setMessage("");
    try {
      const result = await startBillingCheckout(interval);
      window.location.assign(result.url);
    } catch (error) {
      if (error?.code === "subscription_exists") await refreshBilling();
      setMessage(error?.message || "Could not start Stripe Checkout.");
      setBillingBusy("");
    }
  }

  async function manageSubscription() {
    setBillingBusy("portal");
    setMessage("");
    try {
      const result = await openBillingPortal();
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error?.message || "Could not open Stripe billing settings.");
      setBillingBusy("");
    }
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > FOUR_MB) return setMessage("Image is too large. Maximum size is 4MB.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return setMessage("Please upload a PNG, JPG, or WebP image.");
    }

    if (account) {
      setMessage("Uploading profile image…");
      try {
        const result = await uploadCloudAvatar(file);
        setAccount((current) => ({ ...(current || {}), avatarUrl: result.avatarUrl, avatarVersion: result.avatarVersion }));
        updateField("avatarDataUrl", "");
        setMessage("Profile image synced to your DigitBox account.");
      } catch (error) {
        setMessage(error?.message || "Could not upload the profile image.");
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      updateField("avatarDataUrl", dataUrl);
      setMessage("Profile image updated on this device. Sign in to sync it with Nexus.");
    };
    reader.readAsDataURL(file);
  }

  async function removeAvatar() {
    if (account) {
      try {
        await deleteCloudAvatar();
        setAccount((current) => ({ ...(current || {}), avatarUrl: "", avatarVersion: 0 }));
        setMessage("Profile image removed from your DigitBox account.");
      } catch (error) {
        setMessage(error?.message || "Could not remove the profile image.");
      }
    }
    updateField("avatarDataUrl", "");
  }

  return (
    <div className="content profile-liquid-page">
      <section className="section profile-account-card">
        <small className="post-meta">DIGITBOX ACCOUNT</small>
        <h1>{account ? account.displayName || "Player" : "Profile"}</h1>
        <p>{account ? account.email : "Log in to connect this profile to your DigitBox / DEEPFORGE account."}</p>
        {account && (
          <div className="profile-account-flags">
            <span>{account.owner ? "♛ OWNER" : account.admin ? "◆ ADMIN" : "PLAYER"}</span>
            <span>{isPro ? "DIGITBOX PRO" : "FREE MEMBER"}</span>
          </div>
        )}
      </section>

      <section className="section" style={{ maxWidth: 760 }} id="digitbox-pro">
        <small className="post-meta">SUBSCRIPTION</small>
        <h2>DigitBox Pro</h2>
        <p>
          DigitBox Pro unlocks the full Nexus Sidebar. Free DigitBox members keep the same feature limits as Nexus Guest mode.
        </p>

        {!account ? (
          <p>Sign in to your DigitBox account before subscribing.</p>
        ) : isPro ? (
          <div className="profile-account-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Pro is active</h3>
            {subscriptionStatus === "past_due" && (
              <p>Your payment needs attention. Pro remains available while Stripe retries the payment.</p>
            )}
            {billing?.entitlements?.cancelAtPeriodEnd ? (
              <p>Your subscription is set to cancel{renewalDate ? ` on ${renewalDate}` : " at the end of the paid period"}. Pro stays unlocked until then.</p>
            ) : renewalDate ? (
              <p>Current paid period runs through {renewalDate}.</p>
            ) : null}
            <button type="button" className="btn-base" disabled={!!billingBusy} onClick={manageSubscription}>
              {billingBusy === "portal" ? "Opening Stripe…" : "Manage subscription"}
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 16 }}>
            <div className="profile-account-card">
              <small className="post-meta">MONTHLY</small>
              <h3 style={{ margin: "8px 0" }}>$1.99 / month</h3>
              <p>Recurring monthly subscription. Cancel anytime; access continues through the paid period.</p>
              <button
                type="button"
                className="btn-base"
                disabled={!!billingBusy || billing?.configuration?.monthly === false}
                onClick={() => beginCheckout("monthly")}
              >
                {billingBusy === "monthly" ? "Opening Stripe…" : "Choose monthly"}
              </button>
            </div>
            <div className="profile-account-card">
              <small className="post-meta">YEARLY</small>
              <h3 style={{ margin: "8px 0" }}>Yearly plan</h3>
              <p>The annual price is set by the Stripe yearly Price you configure. Checkout will show the exact total before payment.</p>
              <button
                type="button"
                className="btn-base"
                disabled={!!billingBusy || billing?.configuration?.yearly === false}
                onClick={() => beginCheckout("yearly")}
              >
                {billingBusy === "yearly" ? "Opening Stripe…" : "Choose yearly"}
              </button>
            </div>
          </div>
        )}

        {account && billing?.configuration?.stripe === false && (
          <p style={{ marginTop: 12 }}>Billing is not active yet. The Stripe server key still needs to be added to the DigitBox Cloudflare environment.</p>
        )}
      </section>

      <section className="section">
        <h2>Profile preferences</h2>
        <p>Theme preferences are stored on this device. When you are signed in, your profile picture syncs with your DigitBox account and Nexus.</p>

        <form className="post-form" style={{ maxWidth: 680 }}>
          <label>
            Display nickname
            <input
              className="auth-input"
              value={prefs.displayName}
              onChange={(event) => updateField("displayName", event.target.value)}
              placeholder={account?.displayName || "Set a local nickname"}
              maxLength={32}
            />
          </label>

          <label>
            Public label
            <input
              className="auth-input"
              value={prefs.identityLabel}
              onChange={(event) => updateField("identityLabel", event.target.value)}
              placeholder="e.g. Builder, PvP Main, Coder"
              maxLength={48}
            />
          </label>

          <label>
            Profile image (max 4MB)
            <input className="auth-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} />
            {(account?.avatarUrl || prefs.avatarDataUrl) && (
              <button type="button" className="btn-base" onClick={removeAvatar} style={{ marginTop: 8 }}>
                Remove profile image
              </button>
            )}
          </label>

          <div className="theme-row">
            <label>
              Theme
              <select className="auth-input" value={prefs.theme} onChange={(event) => updateField("theme", event.target.value)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label>
              Accent color
              <input className="auth-input" type="color" value={prefs.accentColor} onChange={(event) => updateField("accentColor", event.target.value)} />
            </label>
          </div>

          <div>
            <p style={{ marginBottom: 8 }}>Preset accents</p>
            <div className="theme-presets">
              {Object.entries(THEME_PRESETS).map(([key, color]) => (
                <button key={key} type="button" className="btn-base" onClick={() => updateField("accentColor", color)} style={{ borderColor: color }}>
                  {key}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>

      <section className="section" style={{ maxWidth: 680 }}>
        <h3>Preview</h3>
        <div className="profile-box">
          <img
            src={account?.avatarUrl || prefs.avatarDataUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(previewName) + "&background=14213d&color=eef7ff"}
            alt="Avatar preview"
            className="profile-avatar"
          />
          <div className="profile-text">
            <span className="profile-name">{previewName}</span>
            {(account?.owner || account?.admin || prefs.identityLabel) && (
              <span className="admin-badge">
                {account?.owner ? "OWNER" : account?.admin ? "ADMIN" : prefs.identityLabel}
              </span>
            )}
          </div>
        </div>
      </section>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}
