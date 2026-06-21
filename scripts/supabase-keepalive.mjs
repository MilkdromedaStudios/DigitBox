import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const keepAliveEmail = process.env.SUPABASE_KEEPALIVE_EMAIL;
const keepAlivePassword = process.env.SUPABASE_KEEPALIVE_PASSWORD;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

requireEnv("SUPABASE_URL", supabaseUrl);
requireEnv("SUPABASE_ANON_KEY", supabaseAnonKey);

if (!supabaseUrl.startsWith("https://") || !supabaseUrl.includes(".supabase.co")) {
  throw new Error("SUPABASE_URL must be a valid Supabase project URL.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

if (keepAliveEmail && keepAlivePassword) {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: keepAliveEmail,
    password: keepAlivePassword,
  });

  if (signInError) {
    throw new Error(`Supabase keepalive sign-in failed: ${signInError.message}`);
  }

  const { error: signOutError } = await supabase.auth.signOut();

  if (signOutError) {
    throw new Error(`Supabase keepalive sign-out failed: ${signOutError.message}`);
  }

  console.log("Supabase keepalive completed with sign-in and sign-out.");
} else {
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase keepalive health request failed (${response.status}): ${body}`);
  }

  console.log("Supabase keepalive completed with an Auth settings health request.");
}
