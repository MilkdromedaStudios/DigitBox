import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!email || !password) {
      setMessage("Please enter both email and password.");
      return;
    }

    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage("Logged in successfully.");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage("Account created. You can now log in.");
        setMode("login");
      }
    }

    setLoading(false);
  }

  return (
    <div className="content">
      <h1>{mode === "login" ? "Login" : "Create Account"}</h1>

      <form onSubmit={handleSubmit} className="post-form" style={{ maxWidth: 460 }}>
        <input
          className="auth-input"
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="auth-input"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="auth-btn" type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : mode === "login"
              ? "Login"
              : "Create Account"}
        </button>
      </form>

      <div style={{ marginTop: "1rem" }}>
        {mode === "login" ? (
          <button className="logout-btn" onClick={() => setMode("signup")}>
            Need an account? Sign up
          </button>
        ) : (
          <button className="logout-btn" onClick={() => setMode("login")}>
            Already have an account? Log in
          </button>
        )}
      </div>

      {message && <p style={{ marginTop: "1rem" }}>{message}</p>}
    </div>
  );
}
