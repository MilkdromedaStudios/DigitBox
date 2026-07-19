// digitbox/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function hasValidSupabaseEnv() {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      supabaseUrl.startsWith("https://") &&
      supabaseUrl.includes(".supabase.co")
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase is disabled because NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set."
  );
} else if (!hasValidSupabaseEnv()) {
  console.warn(
    `Supabase is disabled because NEXT_PUBLIC_SUPABASE_URL has an invalid format: "${supabaseUrl}".`
  );
}

export const supabase = hasValidSupabaseEnv()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
