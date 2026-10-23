import { getD1 } from "../../../lib/serverAuth";
import {
  aiConfigured,
  aiJson,
  aiPreflight,
  aiStream,
  aiUser,
  cleanMessages,
  defaultModelId,
  ensureAiSchema,
  findModel,
  planFor,
  pruneUsage,
  refundMessage,
  reserveMessage,
  startCompletion,
} from "../../../lib/aiServer";

export const config = { runtime: "edge" };

// POST /api/ai/chat  (Authorization: Bearer <login or AI token>)
//   { messages: [{ role: "user" | "assistant", content }], model?, surface?:
//     "digitbox" | "static", context?: { name, preferences } }
// Streams the provider's OpenAI-style server-sent events straight through
// (data: {"choices":[{"delta":{"content":"…"}}]} … data: [DONE]). Errors
// before the stream starts are JSON { error, code }: signed_out (401),
// pro_required (403), limit_reached (429, with resetsAt), provider_busy
// (429), not_configured / no_storage (503) or provider_error (502).
export default async function handler(req) {
  if (req.method === "OPTIONS") return aiPreflight(req);
  if (req.method !== "POST") return aiJson(req, { error: "Method not allowed" }, 405);

  const db = getD1();
  if (!db) return aiJson(req, { error: "DigitBox AI isn't available on this deployment. Use digitbox.dev.", code: "no_storage" }, 503);

  let user = null;
  let model = null;
  let reserved = false;
  try {
    await ensureAiSchema(db);
    user = await aiUser(req, db);
    if (!user) return aiJson(req, { error: "Sign in to DigitBox to use DigitBox AI.", code: "signed_out" }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return aiJson(req, { error: "Send a JSON body.", code: "bad_request" }, 400);
    const messages = cleanMessages(body.messages);
    if (!messages) return aiJson(req, { error: "Send at least one message to answer.", code: "bad_request" }, 400);

    if (!aiConfigured()) {
      return aiJson(req, { error: "DigitBox AI isn't switched on yet. The site owner needs to add AI_API_KEY.", code: "not_configured" }, 503);
    }
    const plan = await planFor(db, user);
    model = findModel(String(body.model || "") || defaultModelId(plan));
    if (!model) return aiJson(req, { error: "That model isn't available.", code: "unknown_model" }, 400);
    if (model.tier === "pro" && plan !== "pro") {
      return aiJson(req, { error: model.label + " is part of DigitBox Pro.", code: "pro_required" }, 403);
    }
    if (!model.configured) {
      return aiJson(req, { error: "DigitBox AI isn't switched on yet. The site owner needs to add AI_API_KEY.", code: "not_configured" }, 503);
    }

    const usage = await reserveMessage(db, user, plan, model);
    if (!usage) {
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      return aiJson(
        req,
        {
          error:
            plan === "pro"
              ? "You've used today's " + model.label + " messages. The free models are still unlimited."
              : "You've used today's free messages. They come back tomorrow, or go unlimited with DigitBox Pro.",
          code: "limit_reached",
          plan,
          resetsAt: tomorrow.getTime(),
        },
        429
      );
    }
    reserved = true;
    if (Math.random() < 0.02) await pruneUsage(db);

    const surface = body.surface === "static" ? "static" : "digitbox";
    const upstream = await startCompletion(model, messages, { surface, context: surface === "static" ? body.context : null });
    return aiStream(req, upstream.body, {
      "X-AI-Model": model.label,
      "X-AI-Plan": plan,
      "X-AI-Remaining": usage.remaining === null ? "unlimited" : String(usage.remaining),
    });
  } catch (error) {
    if (reserved && user && model) await refundMessage(db, user, model);
    if (error && error.code && error.status) return aiJson(req, { error: error.message, code: error.code }, error.status);
    console.error("DigitBox AI chat failed", error);
    return aiJson(req, { error: "DigitBox AI ran into a problem. Try again.", code: "server_error" }, 500);
  }
}
