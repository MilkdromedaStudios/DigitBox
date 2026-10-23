export const config = { runtime: "edge" };

// Ownership is provisioned through trusted hosting configuration or D1 only.
// A public HTTP request must never select or replace the site's owner.
export default function handler() {
  return new Response(JSON.stringify({ error: "This endpoint has been retired." }), {
    status: 410,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
