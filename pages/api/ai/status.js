import { getD1 } from "../../../lib/serverAuth";
import {
  aiConfigured,
  aiJson,
  aiPreflight,
  aiUser,
  defaultModelId,
  ensureAiSchema,
  freeDailyLimit,
  planFor,
  publicModels,
  usageFor,
} from "../../../lib/aiServer";

export const config = { runtime: "edge" };

// GET /api/ai/status (Authorization: Bearer <login or AI token>, optional):
// whether DigitBox AI is switched on, the caller's plan, the models they may
// use and what's left of today's allowance. Signed-out callers get the
// models and the free allowance, so the page can explain the plans.
export default async function handler(req) {
  if (req.method === "OPTIONS") return aiPreflight(req);
  if (req.method !== "GET") return aiJson(req, { error: "Method not allowed" }, 405);

  const base = { configured: aiConfigured(), freeDailyLimit: freeDailyLimit() };
  const db = getD1();
  if (!db) {
    return aiJson(req, {
      ...base,
      storage: false,
      signedIn: false,
      models: publicModels("free"),
      error: "DigitBox AI isn't available on this deployment. Use digitbox.dev.",
    });
  }

  try {
    await ensureAiSchema(db);
    const user = await aiUser(req, db);
    if (!user) {
      const hadToken = /^Bearer\s+\S+/i.test(req.headers.get("Authorization") || "");
      return aiJson(req, { ...base, storage: true, signedIn: false, tokenInvalid: hadToken, models: publicModels("free") });
    }
    const plan = await planFor(db, user);
    return aiJson(req, {
      ...base,
      storage: true,
      signedIn: true,
      via: user.via,
      user: { displayName: user.display_name || String(user.email || "").split("@")[0] || "Player" },
      plan,
      models: publicModels(plan),
      defaultModel: defaultModelId(plan),
      usage: await usageFor(db, user, plan),
    });
  } catch (error) {
    console.error("DigitBox AI status failed", error);
    return aiJson(req, { ...base, error: "Couldn't check DigitBox AI. Try again." }, 500);
  }
}
