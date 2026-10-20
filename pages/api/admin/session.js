import { privateJson } from "../../../lib/apiResponse";
import { requireAdmin } from "../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET /api/admin/session: whether the signed-in account (Authorization:
// Bearer <token>) may use the admin pages, and whether this deployment has
// project storage. The pages ask this instead of trusting a role stored in
// the browser. Works without D1 too (the account is checked remotely), so
// the dashboard opens on every deployment.
export default async function handler(req) {
  if (req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req, { storage: false });
  if (auth.response) return auth.response;
  return privateJson({
    admin: true,
    storage: Boolean(auth.db),
    user: { id: auth.user.id, email: auth.user.email, displayName: auth.user.display_name || "" },
  });
}
