// pages/login.js
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    await supabase.auth.signInWithOtp({ email });
    alert("Check your email for the login link.");
  }

  return (
    <div className="content">
      <h1>Login</h1>

      <form onSubmit={handleLogin}>
        <input
          className="auth-input"
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button className="auth-btn" type="submit">
          Send Login Link
        </button>
      </form>
    </div>
  );
}
