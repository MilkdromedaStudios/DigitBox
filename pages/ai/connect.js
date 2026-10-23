import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Icon from "../../components/Icon";
import { getCloudAuthToken } from "../../lib/account";
import { connectSite, loadAiStatus } from "../../lib/aiClient";

// /ai/connect?origin=<site>&return=<url on that site>
// Lets another site (the Static web demo) use the visitor's DigitBox AI plan.
// After they allow it, the site gets an AI-only token in the URL fragment of
// its return page; fragments never reach a server. The API only issues
// tokens for the allowed origins (AI_CONNECT_ORIGINS).

const KNOWN_SITES = {
  "https://milkdromedastudios.github.io": "the Static web demo",
};

function parseRequest(query) {
  const origin = typeof query.origin === "string" ? query.origin.replace(/\/+$/, "") : "";
  const back = typeof query.return === "string" ? query.return : "";
  try {
    const url = new URL(back);
    if (!origin || url.origin !== origin || !/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return { origin, returnUrl: url.toString(), name: KNOWN_SITES[origin] || url.host };
  } catch (_) {
    return null;
  }
}

export default function ConnectDigitBoxAi() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [signedIn, setSignedIn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useMemo(() => (router.isReady ? parseRequest(router.query) : null), [router.isReady, router.query]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!getCloudAuthToken()) {
      setSignedIn(false);
      return;
    }
    loadAiStatus()
      .then((next) => {
        setStatus(next);
        setSignedIn(Boolean(next.signedIn));
      })
      .catch((err) => {
        setError(err?.message || "Couldn't reach DigitBox AI.");
        setSignedIn(true);
      });
  }, [router.isReady]);

  async function allow() {
    if (!request) return;
    setBusy(true);
    setError("");
    try {
      const { token } = await connectSite(request.origin);
      window.location.replace(request.returnUrl + "#digitbox-ai=" + encodeURIComponent(token));
    } catch (err) {
      setError(err?.message || "Couldn't connect.");
      setBusy(false);
    }
  }

  function cancel() {
    if (request) window.location.replace(request.returnUrl);
    else router.push("/ai");
  }

  const freeModel = status?.models?.find((m) => m.tier === "free");
  const proModel = status?.models?.find((m) => m.tier === "pro");
  const next = "/login?next=" + encodeURIComponent(router.asPath || "/ai/connect");

  return (
    <>
      <Head>
        <title>Connect DigitBox AI - DigitBox</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="ai-connect">
        <div className="ai-connect-card">
          <div className="ai-connect-marks">
            <img src="/favicon.svg" alt="" width={44} height={44} />
            <Icon name="chevron" size={18} />
            <div className="ai-welcome-mark"><Icon name="ai" size={22} /></div>
          </div>

          {router.isReady && !request ? (
            <>
              <h1>This link isn&apos;t valid</h1>
              <p>Go back to the site you came from and choose Connect again.</p>
              <div className="ai-connect-actions">
                <Link href="/ai" className="hub-pill-btn is-primary">Open DigitBox AI</Link>
              </div>
            </>
          ) : signedIn === false ? (
            <>
              <h1>Sign in to connect DigitBox AI</h1>
              <p>
                {request ? <>Use your DigitBox account in {request.name}. </> : null}
                Free accounts get {status?.freeDailyLimit ?? "a few"} messages a day; DigitBox Pro is unlimited.
              </p>
              <div className="ai-connect-actions">
                <Link href={next} className="hub-pill-btn is-primary"><Icon name="login" size={18} />Sign in</Link>
                <button type="button" className="hub-pill-btn" onClick={cancel}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <h1>Use DigitBox AI in {request ? request.name : "another site"}?</h1>
              {request && (
                <div className="ai-connect-site">
                  <Icon name="external" size={18} />
                  <span>{request.origin}</span>
                </div>
              )}
              <ul>
                <li>
                  <Icon name="check" size={18} />
                  <span>
                    It can chat with DigitBox AI on your{" "}
                    <strong>{status?.plan === "pro" ? "Pro plan (unlimited)" : "free plan (" + (status?.freeDailyLimit ?? 5) + " messages a day)"}</strong>
                    {status?.plan === "pro" && proModel ? ", with " + proModel.label + " and " + (freeModel?.label || "Nemotron") : freeModel ? ", with " + freeModel.label : ""}.
                  </span>
                </li>
                <li>
                  <Icon name="lock" size={18} />
                  <span>It can&apos;t see your email, password, saves or billing, and can&apos;t sign in as you.</span>
                </li>
                <li>
                  <Icon name="history" size={18} />
                  <span>Access lasts 30 days. Disconnect there at any time.</span>
                </li>
              </ul>
              {status?.user?.displayName && <p>Signed in as <strong>{status.user.displayName}</strong>.</p>}
              {error && <p role="alert"><b>{error}</b></p>}
              <div className="ai-connect-actions">
                <button type="button" className="hub-pill-btn is-primary" onClick={allow} disabled={busy || !request || signedIn === null}>
                  {busy ? "Connecting…" : "Allow"}
                </button>
                <button type="button" className="hub-pill-btn" onClick={cancel} disabled={busy}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
