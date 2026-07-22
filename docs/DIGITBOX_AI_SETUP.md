# Digitbox AI setup

Digitbox AI is the built-in chat assistant (the **Digitbox AI** tab) and a
public request API. It talks to any **OpenAI-compatible** chat-completions
provider, so you can run it on a free tier — you just add one API key.

The default provider is **Hugging Face**, so the key is a **Hugging Face
token**.

## 1. Get a free key

### Hugging Face (default) — key is an HF token

1. Go to **https://huggingface.co/settings/tokens** and create a token with
   **Read** access and permission to **make calls to Inference Providers**
   (a fine-grained token with the Inference permission works too).
2. Copy the token — that is your `AI_API_KEY`.

> Some models are **gated** (require accepting a licence on the model page).
> If you get a 403 / "gated" error, either accept the licence for
> `meta-llama/Llama-3.1-8B-Instruct` on Hugging Face, or set `AI_MODEL` to a
> non-gated model such as `Qwen/Qwen2.5-7B-Instruct`.

### Other providers (optional)

| Provider | Where | `AI_PROVIDER` | Default model |
| --- | --- | --- | --- |
| **Hugging Face** (default) | https://huggingface.co/settings/tokens | `huggingface` | `meta-llama/Llama-3.1-8B-Instruct` |
| **GitHub Models** | https://github.com/settings/tokens | `github` | `openai/gpt-4o-mini` |
| **Groq** | https://console.groq.com | `groq` | `llama-3.1-8b-instant` |
| **Google Gemini** | https://aistudio.google.com/apikey | `gemini` | `gemini-1.5-flash` |
| **OpenRouter** | https://openrouter.ai/keys | `openrouter` | `meta-llama/llama-3.1-8b-instruct:free` |

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
AI_PROVIDER=huggingface
AI_API_KEY=your_hugging_face_token_here
# optional (e.g. if the default model is gated for your token):
# AI_MODEL=Qwen/Qwen2.5-7B-Instruct
# AI_BASE_URL=https://router.huggingface.co/v1
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
