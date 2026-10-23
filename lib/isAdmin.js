export function isAdmin(user) {
  // UI hint only. Privileged API routes must call requireAdmin on the server.
  return user?.owner === true || user?.admin === true;
}

