# AppGPT Telegram bot onboarding

This directory contains the Cloudflare Worker used for the AppGPT Telegram bot now hosted through DigitBox.

It handles:

- `/start` — welcome message + Open AppGPT, Templates, AI Providers, Quick Start, and GitHub buttons
- `/app` — opens the builder
- `/templates` — opens AppGPT directly on Templates
- `/providers` — opens AppGPT directly on Provider settings
- `/help` — command help + quick-start link
- a persistent Telegram menu button that opens AppGPT

The bot token is **never committed to GitHub**.

## URLs

- AppGPT: `https://digitbox.dev/appgpt`
- Quick Start: `https://digitbox.dev/appgpt/getting-started.html`
- Repository: `https://github.com/MilkdromedaStudios/DigitBox`

## 1. Deploy the Worker

From this directory:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```

Use a random `WEBHOOK_SECRET` containing only letters, numbers, `_`, or `-` (1–256 characters). Use the same value for setup.

Wrangler prints a Worker URL similar to:

```text
https://appgpt-bot.<your-cloudflare-subdomain>.workers.dev
```

The Worker exposes `/health` and `/webhook`.

## 2. Configure Telegram

Run from the DigitBox repository root:

```bash
BOT_TOKEN='your-telegram-bot-token' \
WORKER_URL='https://appgpt-bot.<your-cloudflare-subdomain>.workers.dev' \
WEBHOOK_SECRET='the-same-webhook-secret' \
node appgpt-bot/setup.mjs
```

Optional overrides:

```bash
APP_URL='https://digitbox.dev/appgpt'
```

The setup script configures commands, descriptions, the persistent **Open AppGPT** menu button, and Telegram webhook delivery.

## Security

- `BOT_TOKEN` is a Cloudflare secret.
- `WEBHOOK_SECRET` is a Cloudflare secret and is checked against Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- Never put either secret into `public/appgpt/` or generated apps.
