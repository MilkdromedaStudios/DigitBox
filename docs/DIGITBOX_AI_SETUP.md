# Digitbox AI setup

Digitbox AI is the built-in chat assistant (the **Digitbox AI** tab) and a
public request API. It talks to any **OpenAI-compatible** chat-completions
provider, so you can run it on a free tier — you just add one API key.

The default provider is **OpenRouter**, so the key is an **OpenRouter API
key**.

## 1. Get a free key

### OpenRouter (default)

1. Go to **https://openrouter.ai/keys** and create an API key.
2. Copy the key — that is your `AI_API_KEY`.

OpenRouter exposes many **free** models (their ids end in `:free`). The default
is `meta-llama/llama-3.1-8b-instruct:free`; pick any other from
https://openrouter.ai/models and set it as `AI_MODEL`. Free models are
rate-limited per account.

### Other providers (optional)

| Provider | Where | `AI_PROVIDER` | Default model |
| --- | --- | --- | --- |
| **OpenRouter** (default) | https://openrouter.ai/keys | `openrouter` | `meta-llama/llama-3.1-8b-instruct:free` |
| **Hugging Face** | https://huggingface.co/settings/tokens | `huggingface` | `meta-llama/Llama-3.1-8B-Instruct` |
| **GitHub Models** | https://github.com/settings/tokens | `github` | `openai/gpt-4o-mini` |
| **Groq** | https://console.groq.com | `groq` | `llama-3.1-8b-instant` |
| **Google Gemini** | https://aistudio.google.com/apikey | `gemini` | `gemini-1.5-flash` |

## 2. Where to put the key (important)

`AI_API_KEY` is read **at runtime** by the deployed site's edge function, so it
must live in the **hosting** environment:

- **Cloudflare Pages** (this project's primary host): Project → **Settings →
  Environment variables** → add `AI_API_KEY` (and optionally `AI_PROVIDER`).
  Redeploy.
- **Vercel**: Project → **Settings → Environment Variables**.
- **Local dev**: add it to `.env.local`.

> ⚠️ A **GitHub repository secret/variable is _not_ enough** on its own. Repo
> secrets are only exposed to **GitHub Actions**, not to the deployed site —
> and this repo deploys through Cloudflare Pages' Git integration (there is no
> Actions deploy), so the live site can't read a repo secret. Put `AI_API_KEY`
> in the **Cloudflare Pages** env instead. (Cloudflare's env vars are their own
> encrypted secret store, so your token still isn't in the repo.)

```
AI_PROVIDER=openrouter
AI_API_KEY=your_openrouter_key_here
# optional (any model id from https://openrouter.ai/models):
# AI_MODEL=meta-llama/llama-3.1-8b-instruct:free
# AI_BASE_URL=https://openrouter.ai/api/v1
```

`AI_API_KEY` is a **server-side secret** — never prefix it with
`NEXT_PUBLIC_`. Until it is set, the Digitbox AI tab shows a "not switched on"
notice and the API returns HTTP 503.

## 3. Use the API

- `GET  https://digitbox.dev/ai/api/request?message=Hello`
- `GET  https://digitbox.dev/ai/api/request/Hello%20there`
- `POST https://digitbox.dev/api/ai/request` with
  `{ "message": "Hello" }` or `{ "messages": [{ "role": "user", "content": "Hi" }] }`

Responses are `{ "ok": true, "reply": "…", "model": "…" }`. It is CORS-enabled
for use from any site. Add `?info=1` to check whether AI is configured.
