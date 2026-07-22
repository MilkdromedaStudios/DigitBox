# Digitbox AI setup

Digitbox AI is the built-in chat assistant (the **Digitbox AI** tab) and a
public request API. It talks to any **OpenAI-compatible** chat-completions
provider, so you can run it on a free tier — you just add one API key.

The default provider is **GitHub Models** (free for GitHub users), so the key
is a **GitHub token**.

## 1. Get a free key

### GitHub Models (default) — key is a GitHub token

1. Go to **https://github.com/settings/tokens** and create a token with the
   **`Models: read`** permission (a fine-grained token is recommended; a
   classic token also works).
2. Copy the token — that is your `AI_API_KEY`.

Free, OpenAI-compatible, rate-limited per GitHub account. Catalog:
https://github.com/marketplace/models

### Other providers (optional)

| Provider | Where | `AI_PROVIDER` | Default model |
| --- | --- | --- | --- |
| **GitHub Models** (default) | https://github.com/settings/tokens | `github` | `openai/gpt-4o-mini` |
| **Groq** | https://console.groq.com | `groq` | `llama-3.1-8b-instant` |
| **Google Gemini** | https://aistudio.google.com/apikey | `gemini` | `gemini-1.5-flash` |
| **OpenRouter** | https://openrouter.ai/keys | `openrouter` | `meta-llama/llama-3.1-8b-instruct:free` |
| **Hugging Face** | https://huggingface.co/settings/tokens | `huggingface` | `meta-llama/Llama-3.1-8B-Instruct` |

## 2. Where to put the key (important)

`AI_API_KEY` is read **at runtime** by the deployed site's edge function, so it
must live in the **hosting** environment:

- **Cloudflare Pages** (this project's primary host): Project → **Settings →
  Environment variables** → add `AI_API_KEY` (and optionally `AI_PROVIDER`).
  Redeploy.
- **Vercel**: Project → **Settings → Environment Variables**.
- **Local dev**: add it to `.env.local`.

> ⚠️ A **GitHub repository secret/variable is _not_ enough** on its own. Those
> are only exposed to GitHub Actions, not to the deployed site — since this
> repo deploys through Cloudflare Pages' Git integration (no Actions deploy),
> the live site can't read a repo secret. Put `AI_API_KEY` in the Cloudflare
> Pages env. (The **value** can absolutely be a GitHub token — GitHub Models —
> it just has to be stored in the host env.)

```
AI_PROVIDER=github
AI_API_KEY=your_github_token_here
# optional:
# AI_MODEL=openai/gpt-4o-mini
# AI_BASE_URL=https://models.github.ai/inference
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
