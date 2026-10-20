import { pathSegment, privateJson } from "../../../../lib/apiResponse";
import { getProject, loadHtml, projectHtmlResponse } from "../../../../lib/hubProjects";
import { getD1 } from "../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET /api/hub-projects/<slug>/html: a shown project's game HTML, as text
// for the sandboxed player (see projectHtmlResponse). The player adds
// ?v=<version>, so a cached copy is replaced as soon as the HTML changes.
export default async function handler(req) {
  if (req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const db = getD1();
  if (!db) return privateJson({ error: "Project storage isn't available on this deployment." }, 503);

  const slug = pathSegment(req.url, "hub-projects");
  try {
    const project = await getProject(db, slug);
    const html = project && project.visible ? await loadHtml(db, slug) : null;
    if (html === null) return privateJson({ error: "Project not found." }, 404);
    const versioned = new URL(req.url).searchParams.get("v") === String(project.version);
    return projectHtmlResponse(html, versioned ? "public, max-age=86400" : "no-cache");
  } catch {
    return privateJson({ error: "Couldn't load this project. Try again." }, 500);
  }
}
