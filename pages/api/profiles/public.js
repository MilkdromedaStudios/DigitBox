import { supabase } from "../../../lib/supabaseClient";
import { jsonResponse } from "../../../lib/apiResponse";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 10);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  if (!supabase) return jsonResponse({ items: [] });

  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,identity_label")
    .eq("show_off_stats", true)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ items: data || [] });
}
