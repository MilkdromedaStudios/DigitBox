import { privateJson } from "../../../../lib/apiResponse";
import { ProjectError, createProject, listProjects } from "../../../../lib/hubProjects";
import { validateProjectFields } from "../../../../lib/projectRules";
import { requireAdmin } from "../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET  /api/admin/projects  every project, hidden ones included
// POST /api/admin/projects  create one from JSON { name, emoji, hue,
//                           description?, genre?, visible? }; the HTML is
//                           uploaded next with PUT .../<slug>/html
// Admins only (see lib/serverAuth.js).
export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  try {
    if (req.method === "GET") return privateJson({ projects: await listProjects(auth.db, { includeHidden: true }) });

    const body = await req.json().catch(() => null);
    const { value, errors } = validateProjectFields(body);
    if (errors) return privateJson({ error: Object.values(errors)[0], fields: errors }, 400);
    const project = await createProject(auth.db, value);
    return privateJson({ project }, 201);
  } catch (error) {
    if (error instanceof ProjectError) return privateJson({ error: error.message, fields: error.field ? { [error.field]: error.message } : undefined }, error.status);
    return privateJson({ error: "Couldn't save the project. Try again." }, 500);
  }
}
