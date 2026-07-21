// digitbox/lib/ai.js
//
// Digitbox AI — a small, provider-agnostic client for any OpenAI-compatible
// "chat completions" API. This keeps us free of a specific vendor: point it at
// a free provider (Groq, Google Gemini, OpenRouter, Hugging Face…) with two
// env vars and it just works. Edge-runtime safe (only uses fetch).
//
// Configure with:
//   AI_API_KEY   – required to enable Digitbox AI (server-side secret).
//   AI_PROVIDER  – one of the presets below (default: "groq").
//   AI_MODEL     – optional model override.
//   AI_BASE_URL  – optional base URL override (for "custom"/self-hosted).
//
// See docs/DIGITBOX_AI_SETUP.md for free key options.

const PRESETS = {
  // Fast, generous free tier, OpenAI-compatible. https://console.groq.com
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    label: "Groq",
  },
  // Google Gemini via its OpenAI-compatible endpoint. Free tier.
  // https://aistudio.google.com/apikey
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-1.5-flash",
    label: "Google Gemini",
  },
  // Many free community models (use a ":free" model id). https://openrouter.ai
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.1-8b-instruct:free",
    label: "OpenRouter",
  },
  // Hugging Face Inference Providers router (OpenAI-compatible).
  huggingface: {
    baseUrl: "https://router.huggingface.co/v1",
    model: "meta-llama/Llama-3.1-8B-Instruct",
    label: "Hugging Face",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    label: "OpenAI",
  },
};

export const DIGITBOX_AI_SYSTEM_PROMPT =
  "You are Digitbox AI, the friendly built-in assistant for digitbox.dev — a site full of browser games and creative HTML5 projects. " +
  "Be concise, helpful, and upbeat. Use plain language. If you don't know something, say so.";

export function getAiConfig() {
  const provider = String(process.env.AI_PROVIDER || "groq").toLowerCase();
  const preset = PRESETS[provider] || PRESETS.groq;
  const apiKey = process.env.AI_API_KEY || "";
  const baseUrl = (process.env.AI_BASE_URL || preset.baseUrl).replace(/\/+$/, "");
  const model = process.env.AI_MODEL || preset.model;
  return {
    provider,
    label: preset.label || provider,
    baseUrl,
    model,
    apiKey,
    enabled: Boolean(apiKey),
  };
}

export function isAiConfigured() {
  return Boolean(process.env.AI_API_KEY);
}

function clampMessages(messages, maxTurns = 20) {
  const cleaned = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
      content: String(m.content).slice(0, 8000),
    }));
  // Keep the most recent turns to stay within context/rate limits.
  return cleaned.slice(-maxTurns);
}

/**
 * Runs a chat completion against the configured provider. `input` may be a
 * single string prompt or an array of {role, content} messages. Returns
 * { reply, model }. Throws { status, message } on failure.
 */
export async function chatCompletion(input, { temperature = 0.7, maxTokens = 800 } = {}) {
  const cfg = getAiConfig();
  if (!cfg.enabled) {
    throw {
      status: 503,
      message:
        "Digitbox AI is not configured on this deployment. An admin needs to set the AI_API_KEY environment variable.",
    };
  }

  const base = typeof input === "string"
    ? [{ role: "user", content: input }]
    : clampMessages(input);

  const messages = base.some((m) => m.role === "system")
    ? base
    : [{ role: "system", content: DIGITBOX_AI_SYSTEM_PROMPT }, ...base];

  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        // OpenRouter likes these; harmless elsewhere.
        "HTTP-Referer": "https://digitbox.dev",
        "X-Title": "Digitbox AI",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch (err) {
    throw { status: 502, message: `Could not reach the AI provider (${cfg.label}).` };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || body?.error || body?.message || "";
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
    }
    const status = res.status === 429 ? 429 : res.status >= 500 ? 502 : 400;
    throw {
      status,
      message:
        status === 429
          ? "Digitbox AI is busy right now (rate limited). Please try again in a moment."
          : `AI provider error (${res.status})${detail ? `: ${String(detail).slice(0, 300)}` : ""}.`,
    };
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    throw { status: 502, message: "The AI provider returned an empty response." };
  }
  return { reply: String(reply), model: data.model || cfg.model };
}
