// digitbox/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
