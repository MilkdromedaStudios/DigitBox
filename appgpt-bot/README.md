# AppGPT Telegram bot onboarding

This directory contains the Cloudflare Worker used for the AppGPT Telegram bot hosted through DigitBox.

Current commands:

- `/start` — full first-time guide, account sync explanation, API-key help, project links, and Managed Bot creation when enabled
- `/app` — opens the builder
- `/projects` — opens saved AppGPT chats/projects
- `/keys` — explains provider API keys and how AppGPT stores them
- `/templates` — opens Templates
- `/providers` — opens AI Provider settings
- `/createbot` — starts Telegram's Managed Bot creation flow when Bot Management Mode is enabled
- `/help` — command help
- persistent Telegram menu button — opens AppGPT

The bot also handles `managed_bot` updates so it can acknowledge bots users create through Telegram's Managed Bots flow.

The bot token is **never committed to GitHub**.

## URLs

- AppGPT: `https://digitbox.dev/appgpt`
- Quick Start: `https://digitbox.dev/appgpt/getting-started.html`
- Repository: `https://github.com/MilkdromedaStudios/DigitBox`

## Full setup

Use the complete guide:

`docs/APPGPT_TELEGRAM_ACCOUNT_SETUP.md`

That guide covers:

1. BotFather bot creation
2. Main Mini App setup
3. Bot Management Mode
4. Cloudflare Worker deployment
5. Supabase encrypted Telegram account vault
6. required server environment variables
7. `/start` onboarding behavior
8. API-key security
9. cross-device project sync

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

The setup script configures commands, descriptions, the persistent **Open AppGPT** menu button, and webhook delivery for both messages and Managed Bot updates.

## Security

- `BOT_TOKEN` is a Cloudflare Worker secret.
- `WEBHOOK_SECRET` is a Cloudflare Worker secret and is checked against Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- The DigitBox server uses its own `APPGPT_TELEGRAM_BOT_TOKEN` copy only to validate Telegram Mini App `initData` for account sync.
- `SUPABASE_SERVICE_ROLE_KEY` and `APPGPT_SYNC_ENCRYPTION_KEY` stay server-side.
- Never place any of those secrets in `public/appgpt/` or generated apps.
