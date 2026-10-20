import { pathSegment, privateJson } from "../../../../lib/apiResponse";
import { loadHtmlPart, projectHtmlResponse } from "../../../../lib/hubProjects";
import { getD1 } from "../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET /api/hub-projects/<slug>/html?v=<version>&part=<i>: one piece of a
// shown project's game HTML, as text for the sandboxed player (see
// projectHtmlResponse). The player fetches parts 0..htmlParts-1 and joins
// them. A `v` that isn't the current version answers 409, so pieces of two
// versions are never mixed; a matching `v` is cached for a day.
export default async function handler(req) {
  if (req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const db = getD1();
  if (!db) return privateJson({ error: "Project storage isn't available on this deployment." }, 503);

  const slug = pathSegment(req.url, "hub-projects");
  const params = new URL(req.url).searchParams;
  try {
    const piece = await loadHtmlPart(db, slug, Number(params.get("part") || 0));
    if (!piece || !piece.visible) return privateJson({ error: "Project not found." }, 404);
    const version = params.get("v");
    if (version !== null && version !== String(piece.version)) return privateJson({ error: "This game was just updated.", code: "stale" }, 409);
    return projectHtmlResponse(piece.body, version !== null ? "public, max-age=86400" : "no-cache");
  } catch {
    return privateJson({ error: "Couldn't load this project. Try again." }, 500);
  }
}
