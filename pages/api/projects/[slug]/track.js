import { supabase } from "../../../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!supabase) return res.status(200).json({ ok: false });

  const { error } = await supabase.rpc("track_project_view", { project_slug: slug });
  if (error) return res.status(200).json({ ok: false });

  return res.status(200).json({ ok: true });
}
