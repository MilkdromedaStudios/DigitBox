import { privateJson } from "../../../lib/apiResponse";
import { requireAdmin } from "../../../lib/serverAuth";

export const config = { runtime: "edge" };

// GET /api/admin/session: whether the signed-in account (Authorization:
// Bearer <token>) may use the admin pages. The pages ask this instead of
// trusting a role stored in the browser.
export default async function handler(req) {
  if (req.method !== "GET") return privateJson({ error: "Method not allowed" }, 405);
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  return privateJson({ admin: true, user: { email: auth.user.email, displayName: auth.user.display_name || "" } });
}
