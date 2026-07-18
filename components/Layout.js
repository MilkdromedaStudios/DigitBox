import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PROFILE_PREFS_UPDATED_EVENT, readProfilePrefsFromCookie } from "../lib/profilePreferences";

const ADMIN_EMAILS = [
  "wong.christopher501@gmail.com",
  "Studio.Milkdromeda@planetmail.net",
];

export default function Layout({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profilePrefs, setProfilePrefs] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadPrefs = () => setProfilePrefs(readProfilePrefsFromCookie());
    loadPrefs();
    window.addEventListener("focus", loadPrefs);
    window.addEventListener(PROFILE_PREFS_UPDATED_EVENT, loadPrefs);
    window.addEventListener("storage", loadPrefs);

    if (!supabase) {
      setIsAuthLoading(false);
      return () => {
        isMounted = false;
        window.removeEventListener("focus", loadPrefs);
        window.removeEventListener(PROFILE_PREFS_UPDATED_EVENT, loadPrefs);
        window.removeEventListener("storage", loadPrefs);
      };
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data?.user || null);
      setIsAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user || null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      window.removeEventListener("focus", loadPrefs);
      window.removeEventListener(PROFILE_PREFS_UPDATED_EVENT, loadPrefs);
      window.removeEventListener("storage", loadPrefs);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  }

  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
  const avatar = profilePrefs?.avatarDataUrl || user?.user_metadata?.avatar_url || "https://ui-avatars.com/api/?name=User&background=444&color=fff";
  const username = profilePrefs?.displayName || user?.user_metadata?.user_name || user?.email?.split("@")[0] || "User";
  const identityLabel = profilePrefs?.identityLabel || (isAdmin ? "Admin" : "");

  return (
    <div className="page">
      <header className="header">
        <div className="logo"><Link href="/">digitbox.dev</Link></div>
        <nav className="nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/posts">Posts</Link>
          <Link href="/octoloader">Octo Loader</Link>
          {isAdmin && <Link href="/admin">Admin</Link>}
          {!isAuthLoading && !user && <Link href="/login">Login</Link>}

          {user && (
            <>
              <Link href="/profile" className="profile-box" aria-label="Open profile">
                <img src={avatar} alt="Profile avatar" className="profile-avatar" />
                <div className="profile-text">
                  <span className="profile-name">{username}</span>
                  {identityLabel && <span className="admin-badge">{identityLabel}</span>}
                </div>
              </Link>
              <button className="logout-btn btn-base" onClick={logout}>Logout</button>
            </>
          )}
        </nav>
      </header>
      <main className="main"><div className="content">{children}</div></main>
      <footer className="footer">© {new Date().getFullYear()} digitbox.dev</footer>
    </div>
  );
}
