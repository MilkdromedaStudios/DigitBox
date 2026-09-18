import { useEffect, useMemo, useState } from "react";
import {
  loadCloudProfile,
  uploadCloudAvatar,
  deleteCloudAvatar,
} from "../components/deepforge/cloudSync";
import {
  DEFAULT_PROFILE_PREFS,
  THEME_PRESETS,
  readProfilePrefsFromCookie,
  saveProfilePrefsToCookie,
  sanitizeProfilePrefs,
} from "../lib/profilePreferences";

const FOUR_MB = 4 * 1024 * 1024;

export default function ProfilePage() {
  const [prefs, setPrefs] = useState(DEFAULT_PROFILE_PREFS);
  const [account, setAccount] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPrefs(readProfilePrefsFromCookie());
    loadCloudProfile().then(setAccount).catch(() => setAccount(null));
  }, []);

  const previewName = useMemo(
    () => prefs.displayName || account?.displayName || "Player",
    [prefs.displayName, account]
  );

  function updateField(field, value) {
    const next = sanitizeProfilePrefs({ ...prefs, [field]: value });
    setPrefs(next);
    saveProfilePrefsToCookie(next);
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
            <span>Same account used in DEEPFORGE</span>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Profile preferences</h2>
        <p>These visual preferences are stored on this device and apply across DigitBox.</p>

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
