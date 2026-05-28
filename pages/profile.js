import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  DEFAULT_PROFILE_PREFS,
  THEME_PRESETS,
  readProfilePrefsFromCookie,
  saveProfilePrefsToCookie,
  sanitizeProfilePrefs,
} from "../lib/profilePreferences";

const TEN_MB = 10 * 1024 * 1024;

export default function ProfilePage() {
  const [prefs, setPrefs] = useState(DEFAULT_PROFILE_PREFS);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const localPrefs = readProfilePrefsFromCookie();
    setPrefs(localPrefs);
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      if (!user) return;
      const { data: existing } = await supabase.from("profiles").select("display_name,identity_label,theme,accent_color,avatar_data_url").eq("id", user.id).maybeSingle();
      if (existing) {
        const merged = sanitizeProfilePrefs({
          displayName: existing.display_name, identityLabel: existing.identity_label, theme: existing.theme, accentColor: existing.accent_color, avatarDataUrl: existing.avatar_data_url
        });
        setPrefs(merged);
        saveProfilePrefsToCookie(merged);
      }
    });
  }, []);

  const previewName = useMemo(() => prefs.displayName || "Player", [prefs.displayName]);

  async function syncProfile(next) {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    await supabase.from("profiles").upsert({
      id: user.id,
      display_name: next.displayName,
      identity_label: next.identityLabel,
      theme: next.theme,
      accent_color: next.accentColor,
      avatar_data_url: next.avatarDataUrl,
      updated_at: new Date().toISOString(),
    });
  }

  function updateField(field, value) {
    const next = sanitizeProfilePrefs({ ...prefs, [field]: value });
    setPrefs(next);
    saveProfilePrefsToCookie(next);
    syncProfile(next);
  }

  function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > TEN_MB) return setMessage("Image is too large. Maximum size is 10MB.");
    if (!file.type.startsWith("image/")) return setMessage("Please upload an image file.");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      updateField("avatarDataUrl", dataUrl);
      setMessage("Profile image updated.");
    };
    reader.readAsDataURL(file);
  }

  return <div className="content"><h1>Profile Preferences</h1><p>Customize how other players see you.</p><form className="post-form" style={{ maxWidth: 620 }}>
<label>Optional username<input className="auth-input" value={prefs.displayName} onChange={(e) => updateField("displayName", e.target.value)} placeholder="Set your public name" maxLength={32}/></label>
<label>How other players should see you<input className="auth-input" value={prefs.identityLabel} onChange={(e) => updateField("identityLabel", e.target.value)} placeholder="e.g. Builder, PvP Main, Coder" maxLength={48}/></label>
<label>Profile image (max 10MB)<input className="auth-input" type="file" accept="image/*" onChange={handleAvatarUpload}/></label>
<div className="theme-row"><label>Theme<select className="auth-input" value={prefs.theme} onChange={(e)=>updateField("theme", e.target.value)}><option value="dark">Dark (default)</option><option value="light">Light</option></select></label>
<label>Accent color (RGB picker)<input className="auth-input" type="color" value={prefs.accentColor} onChange={(e)=>updateField("accentColor", e.target.value)}/></label></div>
<div><p style={{ marginBottom: 8 }}>Preset accents</p><div className="theme-presets">{Object.entries(THEME_PRESETS).map(([key,color]) => <button key={key} type="button" className="btn-base" onClick={()=>updateField("accentColor", color)} style={{ borderColor: color }}>{key}</button>)}</div></div></form>
<div className="section" style={{ maxWidth: 620 }}><h3>Preview</h3><div className="profile-box"><img src={prefs.avatarDataUrl || "https://ui-avatars.com/api/?name=Player&background=333&color=fff"} alt="Avatar preview" className="profile-avatar"/><div className="profile-text"><span className="profile-name">{previewName}</span>{prefs.identityLabel && <span className="admin-badge">{prefs.identityLabel}</span>}</div></div></div>{message && <p style={{ marginTop: 12 }}>{message}</p>}</div>;
}
