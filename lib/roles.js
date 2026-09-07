import { loadCloudAuth } from "../components/deepforge/cloudSync";

export async function getCurrentUserWithRole() {
  const user = await loadCloudAuth().catch(() => null);
  if (!user) return { user: null, role: null };
  const role = user.owner ? "owner" : user.admin ? "admin" : "user";
  return { user, role };
}

export function isAdminRole(role) {
  return role === "owner" || role === "admin";
}
