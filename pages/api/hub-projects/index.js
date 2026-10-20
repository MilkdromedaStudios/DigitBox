import { privateJson } from "../../../lib/apiResponse";
import { listProjects, publicBuiltInChanges } from "../../../lib/hubProjects";
import { getD1 } from "../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET /api/hub-projects: the game catalog as edited from the admin page, as
// { available, projects, builtIns }. `projects` are the added projects that
// are shown, newest first; `builtIns` maps a built-in game's slug to its
// edits, { hidden, name?, emoji?, hue?, description?, genre? }. `available`
// is false where there is no project storage (e.g. the Vercel deployment).
// Not cached, so a change shows up the moment it's saved.
export default async function handler(req) {
  if (req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const db = getD1();
  if (!db) return privateJson({ available: false, projects: [], builtIns: {} });
  try {
    const [projects, builtIns] = await Promise.all([listProjects(db), publicBuiltInChanges(db)]);
    return privateJson({ available: true, projects, builtIns });
  } catch {
    return privateJson({ available: true, projects: [], builtIns: {}, error: "unavailable" }, 503);
  }
}
