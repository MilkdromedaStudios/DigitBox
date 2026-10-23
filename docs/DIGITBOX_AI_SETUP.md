# DigitBox AI setup

DigitBox AI is the **AI** tab (`/ai`): a chat assistant powered by
[Static](https://github.com/MilkdromedaStudios/Static). The same API also
gives real answers to the **Static web demo**
(<https://milkdromedastudios.github.io/Static/>), which connects to a
visitor's DigitBox account.

| Plan | Models | Limit |
| --- | --- | --- |
| Signed out | — | Sign in to chat |
| Free account | Nemotron 3.5 Lightning (`nvidia/nemotron-3.5-lightning:free`) | 5 messages a day |
| DigitBox Pro | Nemotron 3 Ultra (`nvidia/nemotron-3-ultra-550b-a55b:free`) **and** Nemotron 3.5 Lightning | Unlimited |

Both models are free on OpenRouter, so DigitBox AI costs nothing to run.

The site owner (the Numberstring account) and anyone in `ADMIN_USER_IDS` get
Pro. Pro comes from the same Stripe subscription as the rest of DigitBox Pro
(`billing_accounts` in D1), so nothing else needs setting up for billing.
Daily allowances reset at midnight UTC.

Replies can include files (Markdown, CSV, SVG images, OBJ models, calendar
events, email drafts, HTML…): the model writes them in a fenced block such as
` ```markdown file=plan.md `, and the page shows a download card.

## 1. Get an API key

The defaults use **OpenRouter**, so one key runs both (free) models:

1. Sign in at <https://openrouter.ai> and open **Keys → Create key**.
2. Copy the key (`sk-or-v1-…`). That is your `AI_API_KEY`.
3. **Settings → Privacy:** allow free model endpoints that may store or train
   on prompts. Without it, the free models fail with "No endpoints found
   matching your data policy".

OpenRouter caps `:free` models per minute and per day for the whole
**account**, so every DigitBox AI user, free and Pro, shares one allowance.
"Unlimited" for Pro means DigitBox doesn't count Pro messages; OpenRouter's
cap still applies. The daily cap is much higher once the account has bought a
small amount of credit (about $10 when this was written; the current numbers
are at <https://openrouter.ai/docs/api-reference/limits>). The credit isn't
spent by free models. Buy it before launching, or people will see "… is busy
right now" early in the day.

## 2. Add it to Cloudflare Pages

The key is read by the running site, so it goes in the hosting environment,
not in GitHub:

Cloudflare dashboard → **Workers & Pages → digitbox → Settings → Variables and
Secrets → Add**:

- `AI_API_KEY` = your OpenRouter key. Click **Encrypt**. Do this for
  **Production** (and **Preview** if you want PR previews to chat).

Then **redeploy** (push any commit, or **Deployments → Retry deployment**).
Variables only reach deployments made after you add them.

Check it: open `/ai` signed in. "DigitBox AI isn't switched on yet" means the
key isn't reaching the deployment. `GET https://digitbox.pages.dev/api/ai/status`
returns `"configured": true` once it is.

DigitBox AI needs the D1 database (for plans and daily allowances), so it only
answers on the Cloudflare deployment. The Vercel deployment and previews
without D1 say "Use digitbox.dev".

## 3. Optional settings

| Variable | Default | What it does |
| --- | --- | --- |
| `AI_FREE_DAILY_LIMIT` | `5` | Messages a day for free accounts. `0` turns the free plan off. |
| `AI_FREE_MODEL` / `AI_FREE_LABEL` | `nvidia/nemotron-3.5-lightning:free` / `Nemotron 3.5 Lightning` | The model everyone can use. |
| `AI_PRO_MODEL` / `AI_PRO_LABEL` | `nvidia/nemotron-3-ultra-550b-a55b:free` / `Nemotron 3 Ultra` | The Pro-only model. Any OpenRouter id; ids ending in `:free` cost nothing. |
| `AI_PRO_DAILY_LIMIT` | unlimited | Only matters if `AI_PRO_MODEL` is a **paid** model: caps it per day. Free models are never capped for Pro. |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | Any OpenAI-compatible provider (Groq, NVIDIA, a self-hosted server…). |
| `AI_MAX_TOKENS` | `4096` | Longest reply, in tokens. |
| `AI_CONNECT_ORIGINS` | — | Extra sites that may connect, comma separated (e.g. `http://localhost:8080` for a local Static preview). `https://milkdromedastudios.github.io` is always allowed. |
| `AI_MODELS` | — | Replaces the model list with JSON: `[{"id":"nemotron","label":"…","model":"…","tier":"free","paid":false},{"id":"pro","label":"…","model":"…","tier":"pro","baseUrl":"…","keyEnv":"OTHER_KEY"}]`. |

**Costs.** With the default models DigitBox AI costs nothing. If you switch
`AI_PRO_MODEL` to a paid model, you pay per message (DigitBox Pro is $1.99 a
month), so consider `AI_PRO_DAILY_LIMIT` too.

## 4. The Static web demo

The Static demo is a static GitHub Pages site, so it has no server of its own.
Its **Connect AI** button sends visitors to `https://digitbox.dev/ai/connect`,
where they confirm with their DigitBox account. DigitBox then hands the demo an
**AI-only token** (in the URL fragment of the demo's page, which never reaches
a server). That token:

- can only chat with DigitBox AI and read the plan; it isn't a DigitBox login
  and can't see email, saves or billing, or mint more tokens;
- is only issued for allowed origins (above), lasts 30 days, and is deleted
  when the visitor disconnects. Each account keeps at most 10.

Nothing needs setting up for this beyond `AI_API_KEY`.

## API

All routes are edge functions on the Cloudflare deployment
(`https://digitbox.pages.dev/api/ai/…`) and accept `Authorization: Bearer
<DigitBox login token or AI-only token>`. CORS allows digitbox.dev,
digitbox.pages.dev and the connect origins.

| Route | What it does |
| --- | --- |
| `GET /api/ai/status` | `{ configured, signedIn, plan, models, defaultModel, usage: { used, limit, remaining, resetsAt }, freeDailyLimit }` |
| `POST /api/ai/chat` | Body `{ messages: [{ role, content }], model?, surface?: "digitbox" \| "static" }`. Streams OpenAI-style server-sent events (`choices[0].delta.content`, then `[DONE]`). Headers `X-AI-Model`, `X-AI-Plan`, `X-AI-Remaining`. |
| `POST /api/ai/connect` | Body `{ origin }`, with a login token: returns `{ token, expiresAt }` for an allowed origin. |
| `DELETE /api/ai/connect` | With an AI-only token: disconnects it. |

Errors are JSON `{ error, code }`: `signed_out` (401), `pro_required` (403),
`limit_reached` (429, with `resetsAt`), `provider_busy` (429),
`not_configured` / `no_storage` (503), `provider_error` (502). A message that
fails before the model answers doesn't count against the allowance.

Storage (D1, created automatically): `ai_usage` (messages per account per UTC
day, kept for a month) and `ai_tokens` (SHA-256 hashes of AI-only tokens).
Chats themselves are only kept in the visitor's browser.
