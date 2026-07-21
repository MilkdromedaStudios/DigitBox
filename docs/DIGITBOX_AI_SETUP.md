# Digitbox AI setup

Digitbox AI is the built-in chat assistant (the **Digitbox AI** tab) and a
public request API. It talks to any **OpenAI-compatible** chat-completions
provider, so you can run it on a free tier — you just add one API key.

## 1. Get a free key (pick one)

| Provider | Where | `AI_PROVIDER` | Default model |
| --- | --- | --- | --- |
| **Groq** (fast, generous free tier) | https://console.groq.com | `groq` | `llama-3.1-8b-instant` |
| **Google Gemini** | https://aistudio.google.com/apikey | `gemini` | `gemini-1.5-flash` |
| **OpenRouter** (free `:free` models) | https://openrouter.ai/keys | `openrouter` | `meta-llama/llama-3.1-8b-instruct:free` |
| **Hugging Face** | https://huggingface.co/settings/tokens | `huggingface` | `meta-llama/Llama-3.1-8B-Instruct` |

## 2. Add environment variables

Set these where the site is deployed (Cloudflare Pages → Settings → Environment
variables, or Vercel → Project → Settings → Environment Variables), and in a
local `.env.local` for development:

```
AI_PROVIDER=groq
AI_API_KEY=your_key_here
# optional:
# AI_MODEL=llama-3.1-8b-instant
# AI_BASE_URL=https://api.groq.com/openai/v1
```

`AI_API_KEY` is a **server-side secret** — do not prefix it with
`NEXT_PUBLIC_`. Until it is set, the Digitbox AI tab shows a "not switched on"
notice and the API returns HTTP 503.

## 3. Use the API

- `GET  https://digitbox.dev/ai/api/request?message=Hello`
- `GET  https://digitbox.dev/ai/api/request/Hello%20there`
- `POST https://digitbox.dev/api/ai/request` with
  `{ "message": "Hello" }` or `{ "messages": [{ "role": "user", "content": "Hi" }] }`

Responses are `{ "ok": true, "reply": "…", "model": "…" }`. It is CORS-enabled
for use from any site. Add `?info=1` to check whether AI is configured.
