import { createBrowserClient } from "@supabase/ssr";

function getValidatedSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  if (!supabaseUrl.startsWith("https://") || !supabaseUrl.includes(".supabase.co")) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: \"${supabaseUrl}\". Expected format: https://<project-ref>.supabase.co`
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getValidatedSupabaseEnv();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
