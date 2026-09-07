import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import EasterEggs from "./EasterEggs";
import KubeLiquidGlass from "./KubeLiquidGlass";
import {
  CLOUD_AUTH_UPDATED_EVENT,
  cloudLogout,
  getCloudAuthToken,
  loadCloudAuth,
} from "./deepforge/cloudSync";
import {
  PROFILE_PREFS_UPDATED_EVENT,
  readProfilePrefsFromCookie,
} from "../lib/profilePreferences";

export default function Layout({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profilePrefs, setProfilePrefs] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadPrefs = () => setProfilePrefs(readProfilePrefsFromCookie());
    const loadUser = async () => {
      if (!getCloudAuthToken()) {
        if (mounted) {
          setUser(null);
          setIsAuthLoading(false);
        }
        return;
      }
      const next = await loadCloudAuth().catch(() => null);
      if (mounted) {
        setUser(next);
        setIsAuthLoading(false);
      }
    };

    document.body.classList.add("digitbox-liquid-active");
    loadPrefs();
    loadUser();

    window.addEventListener("focus", loadPrefs);
    window.addEventListener(PROFILE_PREFS_UPDATED_EVENT, loadPrefs);
    window.addEventListener("storage", loadPrefs);
    window.addEventListener("focus", loadUser);
    window.addEventListener(CLOUD_AUTH_UPDATED_EVENT, loadUser);
    window.addEventListener("storage", loadUser);

    return () => {
      mounted = false;
      document.body.classList.remove("digitbox-liquid-active");
      window.removeEventListener("focus", loadPrefs);
      window.removeEventListener(PROFILE_PREFS_UPDATED_EVENT, loadPrefs);
      window.removeEventListener("storage", loadPrefs);
      window.removeEventListener("focus", loadUser);
      window.removeEventListener(CLOUD_AUTH_UPDATED_EVENT, loadUser);
      window.removeEventListener("storage", loadUser);
    };
  }, []);

  async function logout() {
    setIsAuthLoading(true);
    await cloudLogout().catch(() => null);
    setUser(null);
    setIsAuthLoading(false);
  }

  const permanentOwner = Boolean(user && (user.owner || String(user.displayName || "").toLowerCase() === "numberstring"));
  const isAdmin = Boolean(user && (user.admin || permanentOwner));
  const displayName = profilePrefs?.displayName || user?.displayName || user?.email?.split("@")[0] || "Player";
  const avatar =
    profilePrefs?.avatarDataUrl ||
    "https://ui-avatars.com/api/?name=" + encodeURIComponent(displayName) + "&background=14213d&color=eef7ff";
  const identityLabel = permanentOwner
    ? "OWNER"
    : isAdmin
      ? "ADMIN"
      : profilePrefs?.identityLabel || "";

  const footerTapRef = useRef({ count: 0, last: 0 });
  function onFooterTap() {
    const now = Date.now();
    const state = footerTapRef.current;
    state.count = now - state.last < 1500 ? state.count + 1 : 1;
    state.last = now;
    if (state.count >= 5) {
      state.count = 0;
      window.dispatchEvent(new CustomEvent("digitbox:easteregg", { detail: { type: "party" } }));
    }
  }

  return (
    <div className="page digitbox-liquid-page">
      <KubeLiquidGlass />

      <header className="header digitbox-liquid-header">
        <div className="logo"><Link href="/">DigitBox</Link></div>

        <nav className="nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/posts">Posts</Link>
          <Link href="/ai" className="nav-ai">DigitBox AI</Link>
          <Link href="/beta/beta">DEEPFORGE</Link>
          {isAdmin && <Link href="/admin">Admin</Link>}

          {!isAuthLoading && !user && <Link href="/login" className="nav-login">Login</Link>}

          {user && (
            <>
              <Link href="/profile" className="profile-box" aria-label="Open profile">
                <img src={avatar} alt="" className="profile-avatar" />
                <div className="profile-text">
                  <span className="profile-name">{displayName}</span>
                  {identityLabel && <span className="admin-badge">{identityLabel}</span>}
                </div>
              </Link>
              <button className="logout-btn btn-base" onClick={logout}>Logout</button>
            </>
          )}
        </nav>
      </header>

      <main className="main"><div className="content">{children}</div></main>

      <footer className="footer" onClick={onFooterTap} title="…">
        © {new Date().getFullYear()} digitbox.dev · <Link href="/changelog">Changelog</Link> · <Link href="/about">About</Link> · <Link href="/privacy">Privacy</Link>
      </footer>

      <EasterEggs />
    </div>
  );
}
