import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  cloudLogin,
  cloudSignup,
  getCloudAuthToken,
  loadCloudAuth,
} from "../components/deepforge/cloudSync";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkExisting() {
      if (!getCloudAuthToken()) return;
      const user = await loadCloudAuth().catch(() => null);
      if (!mounted || !user) return;
      const requested = typeof router.query.next === "string" ? router.query.next : "/profile";
      const safeNext = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/profile";
      router.replace(safeNext);
    }
    checkExisting();
    return () => { mounted = false; };
  }, [router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Enter your email and password.");
      return;
    }
    if (mode === "signup" && !displayName.trim()) {
      setMessage("Choose a display name.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await cloudSignup(email.trim(), password, displayName.trim());
        setMessage("Account created — you are signed in.");
      } else {
        await cloudLogin(email.trim(), password);
        setMessage("Signed in.");
      }

      const requested = typeof router.query.next === "string" ? router.query.next : "/";
      const safeNext = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
      router.replace(safeNext);
    } catch (error) {
      setMessage(error?.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper digitbox-auth-page">
      <section className="auth-box liquid-auth-card">
        <div className="auth-brand-orb">DB</div>
        <small className="auth-kicker">ONE ACCOUNT · ALL DIGITBOX</small>
        <h1>{mode === "login" ? "Welcome back" : "Create your DigitBox account"}</h1>
        <p className="auth-subcopy">
          This is the same account used by DEEPFORGE, including your game identity, clan access, and admin permissions.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <input
              className="auth-input"
              type="text"
              placeholder="Display name"
              value={displayName}
              maxLength={24}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
            />
          )}

          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />

          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch-button"
          onClick={() => {
            setMessage("");
            setMode(mode === "login" ? "signup" : "login");
          }}
        >
          {mode === "login" ? "New to DigitBox? Create an account" : "Already have an account? Log in"}
        </button>

        {message && <div className="auth-message">{message}</div>}
      </section>
    </div>
  );
}
