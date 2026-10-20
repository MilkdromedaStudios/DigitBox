import { useEffect } from "react";
import "../styles/global.css";
import "../styles/login.css";
import "../styles/motion.css";
import "../styles/hub.css";
import Layout from "../components/Layout";
import PageTransition from "../components/PageTransition";
import { PROFILE_PREFS_UPDATED_EVENT, readProfilePrefsFromCookie } from "../lib/profilePreferences";

// Pages with a YouTube player must not run ad or tracking scripts (YouTube's
// Made for Kids rules). _document.js only adds ads to a few server-rendered
// routes, but client-side navigation keeps a loaded ad script running, so a
// player page reached from an ad page reloads itself without it.
const PLAYER_ROUTES = new Set(["/watch", "/shorts"]);

export default function MyApp({ Component, pageProps, router }) {
  const pathname = router?.pathname;
  useEffect(() => {
    if (PLAYER_ROUTES.has(pathname) && document.querySelector('script[src*="adsbygoogle"]')) window.location.reload();
  }, [pathname]);

  useEffect(() => {
    const applyTheme = () => {
      const prefs = readProfilePrefsFromCookie();
      document.body.dataset.theme = prefs.theme || "dark";
      document.body.style.setProperty("--accent", prefs.accentColor || "#8b5cf6");
    };

    applyTheme();
    window.addEventListener("focus", applyTheme);
    window.addEventListener(PROFILE_PREFS_UPDATED_EVENT, applyTheme);
    window.addEventListener("storage", applyTheme);

    return () => {
      window.removeEventListener("focus", applyTheme);
      window.removeEventListener(PROFILE_PREFS_UPDATED_EVENT, applyTheme);
      window.removeEventListener("storage", applyTheme);
    };
  }, []);

  // Cloud games run full screen in GameFrame, without the hub chrome.
  if (router?.pathname?.startsWith("/projects/")) {
    return (
      <>
        <Component {...pageProps} />
        <PageTransition router={router} />
      </>
    );
  }

  return (
    <>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <PageTransition router={router} />
    </>
  );
}
