import { supabase } from "./supabaseClient";

export async function getCurrentUserWithRole() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, role: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return { user, role: null };
  }

  return { user, role: profile?.role ?? null };
}

export function isAdminRole(role) {
  return role === "admin";
}
