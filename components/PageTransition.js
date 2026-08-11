import { useEffect, useState } from "react";

export default function PageTransition({ router }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!router?.events) return undefined;

    const start = () => setLoading(true);
    const finish = () => setLoading(false);

    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", finish);
    router.events.on("routeChangeError", finish);

    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", finish);
      router.events.off("routeChangeError", finish);
    };
  }, [router]);

  return (
    <div
      className={`page-transition${loading ? " is-loading" : ""}`}
      aria-hidden={!loading}
      aria-live="polite"
    >
      <div className="page-transition-glass" role="status" aria-label="Loading page">
        <div className="page-transition-orb" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="page-transition-title">digitbox.dev</div>
        <div className="page-transition-track" aria-hidden="true"><span></span></div>
      </div>
    </div>
  );
}
