import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const THEME_OPTIONS = ["default", "forest", "sunset", "ocean"];

const ADMIN_EMAILS = [
  "wong.christopher501@gmail.com",
  "Studio.Milkdromeda@planetmail.net",
];

export default function Layout({ children }) {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState("default");
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const savedTheme = typeof window !== "undefined" ? localStorage.getItem("digitbox-theme") : null;
    const initialTheme = THEME_OPTIONS.includes(savedTheme) ? savedTheme : "default";
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);

    let isMounted = true;

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
      listener?.subscription?.unsubscribe();
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

  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email));
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

        <nav className="nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/posts">Posts</Link>
          {isAdmin && <Link href="/admin">Admin</Link>}
          {!isAuthLoading && !user && <Link href="/login">Login</Link>}

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

      <main className="main">
        <div className="content">{children}</div>
      </main>

      <footer className="footer">© {new Date().getFullYear()} digitbox.dev</footer>
    </div>
  );
}
