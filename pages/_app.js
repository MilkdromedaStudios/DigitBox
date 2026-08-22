import { useEffect } from "react";
import "../styles/global.css";
import "../styles/login.css";
import "../styles/motion.css";
import Layout from "../components/Layout";
import PageTransition from "../components/PageTransition";
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

  const cleanPath = String(router?.asPath || "").split(/[?#]/, 1)[0];
  const isAppGPT = router?.pathname === "/appgpt" || cleanPath === "/appgpt" || cleanPath === "/appgpt/";

  // AppGPT is a standalone product surface. Never wrap it in DigitBox's
  // header, navigation, content container, footer, or page transition UI.
  if (isAppGPT) {
    return <Component {...pageProps} />;
  }

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
