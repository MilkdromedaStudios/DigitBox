import { privateJson } from "../../../../lib/apiResponse";
import { GAMES } from "../../../../lib/catalog";
import { ProjectError, createProject, listBuiltInChanges, listProjects } from "../../../../lib/hubProjects";
import { validateProjectFields } from "../../../../lib/projectRules";
import { requireAdmin } from "../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET  /api/admin/projects  every added project, hidden ones included, and
//                           every built-in game with its edits ({ projects,
//                           builtIns }; see pages/api/admin/builtins)
// POST /api/admin/projects  create one from JSON { name, emoji, hue,
//                           description?, genre?, visible? }; the HTML is
//                           uploaded next with PUT .../<slug>/html
// Admins only (see lib/serverAuth.js).
export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST") return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  try {
    if (req.method === "GET") {
      const [projects, changes] = await Promise.all([listProjects(auth.db, { includeHidden: true }), listBuiltInChanges(auth.db)]);
      const bySlug = new Map(changes.map((change) => [change.slug, change]));
      const builtIns = GAMES.map((game) => {
        const change = bySlug.get(game.slug) || {};
        const original = { name: game.title, emoji: game.icon, hue: game.hue, description: game.excerpt, genre: game.genre };
        return {
          slug: game.slug,
          href: game.href,
          name: change.name || original.name,
          emoji: change.emoji || original.emoji,
          hue: Number.isFinite(change.hue) ? change.hue : original.hue,
          description: change.description || original.description,
          genre: change.genre || original.genre,
          visible: change.visible !== false,
          deleted: Boolean(change.deleted),
          edited: ["name", "emoji", "hue", "description", "genre"].some((field) => field in change),
          original,
        };
      });
      return privateJson({ projects, builtIns });
    }

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
