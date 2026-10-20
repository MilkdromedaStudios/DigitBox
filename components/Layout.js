import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import EasterEggs from "./EasterEggs";
import Icon from "./Icon";
import KubeLiquidGlass from "./KubeLiquidGlass";
import {
  CLOUD_AUTH_UPDATED_EVENT,
  cloudLogout,
  getCloudAuthToken,
  loadCloudAuth,
} from "../lib/account";
import {
  PROFILE_PREFS_UPDATED_EVENT,
  readProfilePrefsFromCookie,
} from "../lib/profilePreferences";

const PRIMARY_LINKS = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/shorts", icon: "shorts", label: "Shorts" },
  { href: "/games", icon: "games", label: "Cloud Games" },
  { href: "/videos", icon: "videos", label: "Videos" },
];

const YOU_LINKS = [
  { href: "/library", icon: "user", label: "Library", mobileLabel: "You" },
  { href: "/library#history", icon: "history", label: "History" },
  { href: "/library#liked", icon: "heart", label: "Liked" },
];

function isActive(pathname, href) {
  const path = href.split("#")[0];
  if (href.includes("#")) return false;
  if (path === "/") return pathname === "/";
  if (path === "/games") return pathname === "/games" || pathname.startsWith("/projects");
  return pathname === path || pathname.startsWith(path + "/");
}

function SideLink({ href, icon, label, pathname, onClick }) {
  const active = isActive(pathname, href);
  return (
    <Link href={href} className={"hub-side-link" + (active ? " is-active" : "")} aria-current={active ? "page" : undefined} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}

export default function Layout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profilePrefs, setProfilePrefs] = useState(null);
  const [navToggled, setNavToggled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);

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

  // The drawer (tablet/phone) and mobile search close on navigation.
  useEffect(() => {
    const close = () => {
      setSearchOpen(false);
      if (typeof window !== "undefined" && window.innerWidth < 1200) setNavToggled(false);
    };
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  useEffect(() => {
    if (router.pathname === "/search" && typeof router.query.q === "string") setQuery(router.query.q);
  }, [router.pathname, router.query.q]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  async function logout() {
    setIsAuthLoading(true);
    await cloudLogout().catch(() => null);
    setUser(null);
    setIsAuthLoading(false);
  }

  function submitSearch(event) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push({ pathname: "/search", query: { q } });
  }

  const permanentOwner = Boolean(user && (user.owner || String(user.displayName || "").toLowerCase() === "numberstring"));
  const isAdmin = Boolean(user && (user.admin || permanentOwner));
  const displayName = profilePrefs?.displayName || user?.displayName || user?.email?.split("@")[0] || "Player";
  const avatar =
    user?.avatarUrl ||
    profilePrefs?.avatarDataUrl ||
    "https://ui-avatars.com/api/?name=" + encodeURIComponent(displayName) + "&background=14213d&color=eef7ff";

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

  const pathname = router.pathname;
  const closeDrawer = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1200) setNavToggled(false);
  };

  return (
    <div className={"hub page digitbox-liquid-page" + (navToggled ? " is-nav-toggled" : "")}>
      <KubeLiquidGlass />

      <header className={"hub-top" + (searchOpen ? " is-searching" : "")}>
        <div className="hub-top-start">
          <button
            type="button"
            className="hub-icon-btn"
            aria-label="Toggle navigation"
            aria-expanded={navToggled}
            onClick={() => setNavToggled((value) => !value)}
          >
            <Icon name="menu" />
          </button>
          <Link href="/" className="hub-logo" aria-label="DigitBox home">
            <span className="hub-logo-mark"><Icon name="play" size={16} /></span>
            <span className="hub-logo-word">DigitBox</span>
          </Link>
        </div>

        <form className="hub-search" role="search" onSubmit={submitSearch}>
          <button type="button" className="hub-icon-btn hub-search-back" aria-label="Close search" onClick={() => setSearchOpen(false)}>
            <Icon name="back" />
          </button>
          <input
            ref={searchInputRef}
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search videos, games and posts"
            aria-label="Search DigitBox"
            autoComplete="off"
          />
          <button type="submit" className="hub-search-go" aria-label="Search">
            <Icon name="search" size={20} />
          </button>
        </form>

        <div className="hub-top-end">
          <button type="button" className="hub-icon-btn hub-search-toggle" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <Icon name="search" />
          </button>
          {user ? (
            <Link href="/profile" className="hub-account" aria-label="Your profile" title={displayName}>
              <img src={avatar} alt="" />
            </Link>
          ) : (
            !isAuthLoading && (
              <Link href="/login" className="hub-signin">
                <Icon name="user" size={20} />
                <span>Sign in</span>
              </Link>
            )
          )}
        </div>
      </header>

      <div className="hub-scrim" onClick={() => setNavToggled(false)} aria-hidden="true" />

      <aside className="hub-side" aria-label="Main navigation">
        <nav className="hub-side-group">
          {PRIMARY_LINKS.map((link) => (
            <SideLink key={link.href} {...link} pathname={pathname} onClick={closeDrawer} />
          ))}
        </nav>

        <nav className="hub-side-group" aria-label="You">
          <div className="hub-side-title">You</div>
          {YOU_LINKS.map((link) => (
            <SideLink key={link.href} {...link} pathname={pathname} onClick={closeDrawer} />
          ))}
        </nav>

        <nav className="hub-side-group hub-side-extra" aria-label="More from DigitBox">
          <div className="hub-side-title">Explore</div>
          <SideLink href="/posts" icon="posts" label="Community" pathname={pathname} onClick={closeDrawer} />
          <SideLink href="/profile#digitbox-pro" icon="pro" label="DigitBox Pro" pathname={pathname} onClick={closeDrawer} />
          {isAdmin && <SideLink href="/admin" icon="settings" label="Admin" pathname={pathname} onClick={closeDrawer} />}
        </nav>

        <nav className="hub-side-group hub-side-extra" aria-label="Account">
          {user ? (
            <>
              <Link href="/profile" className={"hub-side-link" + (pathname === "/profile" ? " is-active" : "")} onClick={closeDrawer}>
                <img src={avatar} alt="" className="hub-side-avatar" />
                <span>{displayName}</span>
              </Link>
              <button type="button" className="hub-side-link" onClick={logout}>
                <Icon name="logout" />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <SideLink href="/login" icon="login" label="Sign in" pathname={pathname} onClick={closeDrawer} />
          )}
        </nav>

        <footer className="hub-side-foot" onClick={onFooterTap}>
          <div>
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/changelog">Changelog</Link>
          </div>
          <span>© {new Date().getFullYear()} digitbox.dev</span>
        </footer>
      </aside>

      <main className="hub-main">{children}</main>

      <nav className="hub-tabs" aria-label="Quick navigation">
        {[...PRIMARY_LINKS, YOU_LINKS[0]].map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link key={link.href} href={link.href} className={"hub-tab" + (active ? " is-active" : "")} aria-current={active ? "page" : undefined}>
              <Icon name={link.icon} />
              <span>{link.mobileLabel || (link.label === "Cloud Games" ? "Games" : link.label)}</span>
            </Link>
          );
        })}
      </nav>

      <EasterEggs />
    </div>
  );
}
