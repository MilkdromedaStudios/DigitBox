// digitbox/components/Layout.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Layout({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => {
      if (listener && listener.subscription) {
        listener.subscription.unsubscribe();
      }
    };
  }, []);

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

  const username =
    user?.user_metadata?.user_name ||
    user?.email?.split("@")[0] ||
    "User";

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

          {user && (
            <div className="profile-box">
              <img src={avatar} className="profile-avatar" />
              <div className="profile-text">
                <span className="profile-name">{username}</span>
                {isAdmin && <span className="admin-badge">Admin</span>}
              </div>
              <button className="logout-btn" onClick={logout}>
                Logout
              </button>
            </div>
          )}
        </nav>
      </header>

      <main className="main">{children}</main>

      <footer className="footer">
        © {new Date().getFullYear()} digitbox.dev
      </footer>
    </div>
  );
}
