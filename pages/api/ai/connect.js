import { getD1 } from "../../../lib/serverAuth";
import {
  aiJson,
  aiPreflight,
  aiUser,
  connectOrigins,
  createConnectToken,
  ensureAiSchema,
  revokeConnectToken,
} from "../../../lib/aiServer";

export const config = { runtime: "edge" };

// Connecting another site (the Static web demo) to someone's DigitBox AI.
//   POST   { origin }  with a DigitBox login token: an AI-only token for one
//          of the allowed origins (AI_CONNECT_ORIGINS). /ai/connect hands it
//          back to that site after the person allows it.
//   DELETE             with the AI-only token: disconnects it.
export default async function handler(req) {
  if (req.method === "OPTIONS") return aiPreflight(req);
  const db = getD1();
  if (!db) return aiJson(req, { error: "DigitBox AI isn't available on this deployment. Use digitbox.dev.", code: "no_storage" }, 503);

  try {
    await ensureAiSchema(db);
    if (req.method === "DELETE") {
      const revoked = await revokeConnectToken(db, req);
      return aiJson(req, { ok: true, revoked });
    }
    if (req.method !== "POST") return aiJson(req, { error: "Method not allowed" }, 405);

    const user = await aiUser(req, db);
    if (!user) return aiJson(req, { error: "Sign in to DigitBox first.", code: "signed_out" }, 401);
    // An AI-only token can't mint more tokens.
    if (user.via !== "session") return aiJson(req, { error: "Use your DigitBox login to connect a site.", code: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const origin = String(body?.origin || "").replace(/\/+$/, "");
    if (!connectOrigins().includes(origin)) {
      return aiJson(req, { error: "That site can't connect to DigitBox AI.", code: "origin_not_allowed", allowed: connectOrigins() }, 400);
    }
    const { token, expiresAt } = await createConnectToken(db, user, origin);
    return aiJson(req, { token, expiresAt, origin });
  } catch (error) {
    console.error("DigitBox AI connect failed", error);
    return aiJson(req, { error: "Couldn't connect DigitBox AI. Try again.", code: "server_error" }, 500);
  }
}
