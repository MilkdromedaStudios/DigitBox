import { pathSegment, privateJson } from "../../../../lib/apiResponse";
import { GAMES } from "../../../../lib/catalog";
import { isBuiltInSlug, resetBuiltIn, saveBuiltInChange } from "../../../../lib/hubProjects";
import { validateProjectFields } from "../../../../lib/projectRules";
import { requireAdmin } from "../../../../lib/serverAuth";

export const config = { runtime: "edge" };

// Built-in games (data/projects-index.json) can't be changed without a
// rebuild, so edits are kept in D1 and applied by the site at runtime.
//
// PATCH  /api/admin/builtins/<slug>  JSON with any of name, emoji, hue,
//        description, genre, visible, deleted (false restores a deleted
//        game), or { reset: true } to undo every change
// DELETE /api/admin/builtins/<slug>  take the game down: it leaves every
//        list and its page and files answer 404. Restorable.
// Admins only (see lib/serverAuth.js).

// The game as it ships, in the editor's field names.
function original(game) {
  return { name: game.title, emoji: game.icon, hue: game.hue, description: game.excerpt, genre: game.genre };
}

export default async function handler(req) {
  if (req.method !== "PATCH" && req.method !== "DELETE") return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const slug = pathSegment(req.url, "builtins");
  if (!isBuiltInSlug(slug)) return privateJson({ error: "Game not found." }, 404);
  const game = GAMES.find((item) => item.slug === slug);

  try {
    if (req.method === "DELETE") return privateJson({ change: await saveBuiltInChange(auth.db, slug, { deleted: true }) });

    const body = await req.json().catch(() => null);
    if (body && body.reset === true) {
      await resetBuiltIn(auth.db, slug);
      return privateJson({ change: null });
    }
    const { deleted, ...rest } = body && typeof body === "object" ? body : {};
    if (deleted !== undefined && typeof deleted !== "boolean") return privateJson({ error: "Invalid request." }, 400);
    const { value, errors } = validateProjectFields(rest, { partial: true });
    if (errors) return privateJson({ error: Object.values(errors)[0], fields: errors }, 400);
    // Keep only real changes, so "edited" means something and a field set
    // back to the original follows future updates to the game. An emptied
    // description or genre also means "the original".
    const shipped = original(game);
    const fields = {};
    for (const [field, fieldValue] of Object.entries(value)) {
      const unchanged = field in shipped && (fieldValue === shipped[field] || fieldValue === "");
      fields[field] = unchanged ? null : fieldValue;
    }
    if (deleted !== undefined) fields.deleted = deleted;
    return privateJson({ change: await saveBuiltInChange(auth.db, slug, fields) });
  } catch {
    return privateJson({ error: "Couldn't save the game. Try again." }, 500);
  }
}
