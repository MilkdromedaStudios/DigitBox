import { useEffect } from "react";
import "../styles/global.css";
import "../styles/login.css";
import "../styles/motion.css";
import "../styles/hub.css";
import "../styles/tab-settings.css";
import "../styles/minecraft.css";
import "../styles/ai.css";
import Layout from "../components/Layout";
import { TabSettingsSync } from "../components/TabSettings";
import PageTransition from "../components/PageTransition";
import { PROFILE_PREFS_UPDATED_EVENT, readProfilePrefsFromCookie } from "../lib/profilePreferences";

// Match the server document allowlist: client-side navigation must not carry
// the AdSense script from an editorial article onto unrelated app screens.
const AD_ELIGIBLE_ROUTES = new Set(["/guides/[guide]"]);

export default function MyApp({ Component, pageProps, router }) {
  const pathname = router?.pathname;
  useEffect(() => {
    const hasAdScript = Boolean(document.querySelector('script[src*="adsbygoogle.js"]'));
    const routeAllowsAds = AD_ELIGIBLE_ROUTES.has(pathname);
    if (hasAdScript !== routeAllowsAds) window.location.reload();
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

  const fullscreenGame = router?.pathname?.startsWith("/projects/");
  return (
    <>
      <TabSettingsSync />
      {fullscreenGame ? <Component {...pageProps} /> : <Layout><Component {...pageProps} /></Layout>}
      <PageTransition router={router} />
    </>
  );
}
