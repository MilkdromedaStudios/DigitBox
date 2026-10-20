import { pathSegment, privateJson } from "../../../../../lib/apiResponse";
import { ProjectError, isValidSlug, loadHtml, projectHtmlResponse, saveHtml } from "../../../../../lib/hubProjects";
import { MAX_HTML_BYTES } from "../../../../../lib/projectRules";
import { requireAdmin } from "../../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// Read and drop an upload we're refusing, so the connection stays usable for
// the next request. Bodies past a few times the limit are cut off instead.
async function discardBody(req) {
  const reader = req.body && req.body.getReader();
  if (!reader) return;
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      seen += value.byteLength;
      if (seen > 4 * MAX_HTML_BYTES) return void (await reader.cancel());
    }
  } catch {
    /* the client went away */
  }
}

// PUT /api/admin/projects/<slug>/html  replace the game's HTML. The body is
//                                      the raw file (not JSON), up to 5 MB.
// GET /api/admin/projects/<slug>/html  the current HTML, hidden projects
//                                      included, for previews in the editor
// Admins only (see lib/serverAuth.js).
export default async function handler(req) {
  if (req.method !== "PUT" && req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req);
  if (auth.response) {
    if (req.method === "PUT") await discardBody(req);
    return auth.response;
  }

  const slug = pathSegment(req.url, "projects");
  if (!isValidSlug(slug)) {
    if (req.method === "PUT") await discardBody(req);
    return privateJson({ error: "Project not found." }, 404);
  }

  try {
    if (req.method === "GET") {
      const html = await loadHtml(auth.db, slug);
      return html === null ? privateJson({ error: "This project has no HTML yet." }, 404) : projectHtmlResponse(html, "no-store");
    }

    // Refuse oversized uploads before reading them, when the size is known.
    const declared = Number(req.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
      await discardBody(req);
      return privateJson({ error: "The HTML is bigger than 5 MB." }, 413);
    }

    const html = await req.text();
    const project = await saveHtml(auth.db, slug, html);
    return project ? privateJson({ project }) : privateJson({ error: "Project not found." }, 404);
  } catch (error) {
    if (error instanceof ProjectError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Couldn't save the HTML. Try again." }, 500);
  }
}
