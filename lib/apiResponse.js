export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// For per-user or just-changed data that no cache should keep.
export function privateJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// The value of the path segment right after `after`, e.g.
// pathSegment("/api/hub-projects/space-run/html", "hub-projects") is "space-run".
export function pathSegment(url, after) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const index = parts.indexOf(after);
  if (index < 0 || index + 1 >= parts.length) return "";
  try {
    return decodeURIComponent(parts[index + 1]);
  } catch {
    return "";
  }
}
