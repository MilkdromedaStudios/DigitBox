# AppGPT Telegram bot workspace

This directory contains the Cloudflare Worker used for the AppGPT Telegram bot hosted through DigitBox.

## Chat-first workspace

The bot can now build and edit apps directly in Telegram without opening the visual AppGPT site.

`/start` and `/menu` open a workspace menu:

- **➕ New app** — asks what to build, then returns a complete `.html` file
- **📂 Existing app** — tells the user to select any previously generated HTML version in the chat
- **🤖 Create bot** — starts Telegram's Managed Bot creation flow
- **▦ Templates** — opens templates
- **🌐 Open visual AppGPT** — optional full preview/visual-editor workflow

Every generated HTML file has a **✏️ Work on this app** button. Selecting it makes that exact Telegram file version active. AppGPT then uses Telegram ForceReply context so the user can type normal requests such as `add dark mode` or `make the buttons rounder`; each successful edit comes back as a new versioned HTML file.

This Telegram-only version history does not require D1/KV/database storage: the Telegram document `file_id` is carried through the bot's reply context and the bot downloads the selected HTML from Telegram when it needs to edit it.

Current commands:

- `/start` — open the workspace menu
- `/menu` — choose a new or existing app
- `/new` — start a new app
- `/build <idea>` — build directly from a prompt
- `/projects` — existing-app instructions plus visual projects
- `/templates` — open Templates
- `/providers` — open AI settings
- `/createbot` — start Telegram Managed Bot creation when enabled
- `/help` — workspace help

The bot also handles `callback_query` and `managed_bot` updates.

## Telegram chat AI

The chat builder uses Cloudflare Workers AI through the `AI` binding configured in `wrangler.toml`:

```toml
[ai]
binding = "AI"
```

The current coding model is:

`@cf/qwen/qwen2.5-coder-32b-instruct`

The Worker gives the model a strict raw-HTML contract and retries once if the first response is not a complete `<!doctype html> ... </html>` document.

The bot token is **never committed to GitHub**.

## URLs

- AppGPT: `https://digitbox.dev/appgpt`
- Quick Start: `https://digitbox.dev/appgpt/getting-started.html`
- Repository: `https://github.com/MilkdromedaStudios/DigitBox`

## Full setup

Use the complete guide:

`docs/APPGPT_TELEGRAM_ACCOUNT_SETUP.md`

## Worker deployment

From this directory:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```

Then run from the DigitBox repository root:

```bash
BOT_TOKEN='your-telegram-bot-token' \
WORKER_URL='https://appgpt-bot.<your-cloudflare-subdomain>.workers.dev' \
WEBHOOK_SECRET='the-same-webhook-secret' \
APP_URL='https://digitbox.dev/appgpt' \
node appgpt-bot/setup.mjs
```

The setup script configures the workspace commands, descriptions, command menu, and webhook delivery for `message`, `callback_query`, and `managed_bot` updates.

## Security

- `BOT_TOKEN` is a Cloudflare Worker secret.
- `WEBHOOK_SECRET` is a Cloudflare Worker secret and is checked against Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- Telegram document `file_id` values are references usable by the bot; no bot token is exposed in generated HTML.
- The DigitBox server uses its own `APPGPT_TELEGRAM_BOT_TOKEN` copy only to validate Telegram Mini App `initData` for account sync.
- `SUPABASE_SERVICE_ROLE_KEY` and `APPGPT_SYNC_ENCRYPTION_KEY` stay server-side when account sync is configured.
- Never place any private secrets in `public/appgpt/` or generated apps.
