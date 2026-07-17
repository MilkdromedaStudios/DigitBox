import { supabase } from "../../../../lib/supabaseClient";
import { jsonResponse } from "../../../../lib/apiResponse";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Route shape: /api/projects/[slug]/track — the edge runtime does not
  // provide req.query, so read the slug from the URL path.
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(segments[2] || "");

  if (!slug) return jsonResponse({ error: "Missing slug" }, 400);
  if (!supabase) return jsonResponse({ ok: false });

  const { error } = await supabase.rpc("track_project_view", { project_slug: slug });
  if (error) return jsonResponse({ ok: false });

  return jsonResponse({ ok: true });
}
