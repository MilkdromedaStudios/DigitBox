import { supabase } from "../../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 10);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  if (!supabase) return res.status(200).json({ items: [] });

  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,identity_label")
    .eq("show_off_stats", true)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ items: data || [] });
}
