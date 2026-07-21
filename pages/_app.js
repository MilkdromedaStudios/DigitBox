import { useEffect } from "react";
import "../styles/global.css";
import "../styles/login.css";
import Layout from "../components/Layout";
import { PROFILE_PREFS_UPDATED_EVENT, readProfilePrefsFromCookie } from "../lib/profilePreferences";

export default function MyApp({ Component, pageProps, router }) {
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

  if (router?.pathname?.startsWith("/projects/")) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
