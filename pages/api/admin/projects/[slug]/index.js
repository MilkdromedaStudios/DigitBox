import { pathSegment, privateJson } from "../../../../../lib/apiResponse";
import { ProjectError, deleteProject, getProject, isValidSlug, updateProject } from "../../../../../lib/hubProjects";
import { validateProjectFields } from "../../../../../lib/projectRules";
import { requireAdmin } from "../../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET    /api/admin/projects/<slug>  one project
// PATCH  /api/admin/projects/<slug>  change any of name, emoji, hue,
//                                    description, genre, visible (the slug,
//                                    and so the address, stays the same)
// DELETE /api/admin/projects/<slug>  remove it and its HTML
// Admins only (see lib/serverAuth.js).
export default async function handler(req) {
  if (!["GET", "PATCH", "DELETE"].includes(req.method)) return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const slug = pathSegment(req.url, "projects");
  if (!isValidSlug(slug)) return privateJson({ error: "Project not found." }, 404);

  try {
    if (req.method === "GET") {
      const project = await getProject(auth.db, slug);
      return project ? privateJson({ project }) : privateJson({ error: "Project not found." }, 404);
    }

    if (req.method === "DELETE") {
      const removed = await deleteProject(auth.db, slug);
      return removed ? privateJson({ deleted: slug }) : privateJson({ error: "Project not found." }, 404);
    }

    const body = await req.json().catch(() => null);
    const { value, errors } = validateProjectFields(body, { partial: true });
    if (errors) return privateJson({ error: Object.values(errors)[0], fields: errors }, 400);
    const project = await updateProject(auth.db, slug, value);
    return project ? privateJson({ project }) : privateJson({ error: "Project not found." }, 404);
  } catch (error) {
    if (error instanceof ProjectError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Couldn't save the project. Try again." }, 500);
  }
}
