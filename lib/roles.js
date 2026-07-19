import { supabase } from "./supabaseClient";

const ADMIN_EMAILS = [
  "wong.christopher501@gmail.com",
  "Studio.Milkdromeda@planetmail.net",
];

export async function getCurrentUserWithRole() {
  if (!supabase) return { user: null, role: null };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, role: null };
  const role = ADMIN_EMAILS.includes(user.email) ? "admin" : "user";
  return { user, role };
}

export function isAdminRole(role) {
  return role === "admin";
}
