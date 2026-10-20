import { privateJson } from "../../../lib/apiResponse";
import { listProjects } from "../../../lib/hubProjects";
import { getD1 } from "../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET /api/hub-projects: projects added from the admin page that are shown
// on the site, newest first, as { available, projects }. `available` is
// false where there is no project storage (e.g. the Vercel deployment).
// Not cached, so a project appears the moment it's saved.
export default async function handler(req) {
  if (req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const db = getD1();
  if (!db) return privateJson({ available: false, projects: [] });
  try {
    return privateJson({ available: true, projects: await listProjects(db) });
  } catch {
    return privateJson({ available: true, projects: [], error: "unavailable" }, 503);
  }
}
