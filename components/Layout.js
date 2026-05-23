// digitbox/components/Layout.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const THEME_OPTIONS = ["default", "forest", "sunset", "ocean"];

export default function Layout({ children }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState("default");

  useEffect(() => {
    const savedTheme = typeof window !== "undefined" ? localStorage.getItem("digitbox-theme") : null;
    const initialTheme = THEME_OPTIONS.includes(savedTheme) ? savedTheme : "default";
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);

    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      if (listener && listener.subscription) listener.subscription.unsubscribe();
    };
  }, []);

  function onThemeChange(nextTheme) {
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("digitbox-theme", nextTheme);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  const adminEmails = [
    "wong.christopher501@gmail.com",
    "Studio.Milkdromeda@planetmail.net",
  ];

  const isAdmin = user && adminEmails.includes(user.email);
  const avatar =
    user?.user_metadata?.avatar_url ||
    "https://ui-avatars.com/api/?name=User&background=444&color=fff";

  const username = user?.user_metadata?.user_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="page">
      <header className="header">
        <div className="logo">
          <Link href="/">digitbox.dev</Link>
        </div>

        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/posts">Posts</Link>
          {isAdmin && <Link href="/admin">Admin</Link>}
          {!user && <Link href="/login">Login</Link>}

          <select
            className="theme-select"
            aria-label="Select theme"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
          >
            <option value="default">Theme: Default</option>
            <option value="forest">Theme: Forest</option>
            <option value="sunset">Theme: Sunset</option>
            <option value="ocean">Theme: Ocean</option>
          </select>

          {user && (
            <div className="profile-box">
              <img src={avatar} alt="Profile avatar" className="profile-avatar" />
              <div className="profile-text">
                <span className="profile-name">{username}</span>
                {isAdmin && <span className="admin-badge">Admin</span>}
              </div>
              <button className="logout-btn btn-base" onClick={logout}>Logout</button>
            </div>
          )}
        </nav>
      </header>

      {settingsOpen && (
        <aside className="settings-panel" id="site-settings">
          <h3>Site Settings</h3>
          <label htmlFor="theme-select">Theme</label>
          <select
            id="theme-select"
            className="theme-select"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
          >
            <option value="default">Default</option>
            <option value="forest">Forest</option>
            <option value="sunset">Sunset</option>
            <option value="ocean">Ocean</option>
          </select>
        </aside>
      )}

      <footer className="footer">© {new Date().getFullYear()} digitbox.dev</footer>
    </div>
  );
}
