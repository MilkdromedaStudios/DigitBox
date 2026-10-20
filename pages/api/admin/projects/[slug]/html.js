import { pathSegment, privateJson } from "../../../../../lib/apiResponse";
import { ProjectError, isValidSlug, loadHtmlPart, projectHtmlResponse, saveHtmlPart } from "../../../../../lib/hubProjects";
import { PART_CHARS } from "../../../../../lib/projectRules";
import { requireAdmin } from "../../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// PUT /api/admin/projects/<slug>/html?upload=<id>&part=<i>&parts=<n>
//   One piece of a new HTML file (the raw text, not JSON; at most PART_CHARS
//   UTF-16 units). The last piece swaps the new HTML in. `upload` is any
//   16-64 hex characters, the same for every piece. Without these
//   parameters the body is a whole (small) file in one piece.
// GET /api/admin/projects/<slug>/html?part=<i>
//   One piece of the current HTML, hidden projects included, for previews.
// Admins only (see lib/serverAuth.js).

// The most UTF-8 bytes a piece can take (3 per UTF-16 unit).
const MAX_PART_BYTES = PART_CHARS * 3;

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
      if (seen > 4 * MAX_PART_BYTES) return void (await reader.cancel());
    }
  } catch {
    /* the client went away */
  }
}

function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
  const params = new URL(req.url).searchParams;

  try {
    if (req.method === "GET") {
      const piece = await loadHtmlPart(auth.db, slug, Number(params.get("part") || 0));
      return piece ? projectHtmlResponse(piece.body, "no-store") : privateJson({ error: "This project has no HTML yet." }, 404);
    }

    // Refuse oversized pieces before reading them, when the size is known.
    const declared = Number(req.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > MAX_PART_BYTES) {
      await discardBody(req);
      return privateJson({ error: "Upload the HTML in smaller pieces (see PART_CHARS)." }, 413);
    }

    const upload = params.get("upload");
    const result = await saveHtmlPart(auth.db, slug, {
      uploadId: upload || randomId(),
      part: upload ? Number(params.get("part")) : 0,
      parts: upload ? Number(params.get("parts")) : 1,
      body: await req.text(),
    });
    if (!result) return privateJson({ error: "Project not found." }, 404);
    return result.done ? privateJson({ project: result.project }) : privateJson({ received: Number(params.get("part")) }, 202);
  } catch (error) {
    if (error instanceof ProjectError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Couldn't save the HTML. Try again." }, 500);
  }
}
