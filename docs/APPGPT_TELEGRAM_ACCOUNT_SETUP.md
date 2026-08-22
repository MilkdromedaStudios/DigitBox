# AppGPT Telegram account + bot setup

This is the one-time setup needed for AppGPT to behave like a Telegram-native product with automatic Telegram identity, cross-device project sync, optional encrypted API-key sync, `/start` onboarding, and Telegram Managed Bot creation.

## 1. Create or choose the AppGPT manager bot

Open **@BotFather** in Telegram.

If you do not already have an AppGPT bot:

1. Send `/newbot`.
2. Choose a display name, e.g. `AppGPT`.
3. Choose a username ending in `bot`.
4. Save the bot token somewhere private. Do not put it in frontend code or commit it to GitHub.

## 2. Enable the Main Mini App

In @BotFather:

1. `/mybots`
2. Choose the AppGPT bot.
3. **Bot Settings → Configure Mini App / Main Mini App**.
4. Set the Mini App URL to:

   `https://digitbox.dev/appgpt`

This enables the profile-level **Launch app** experience. The setup script also configures the chat menu button through the Bot API.

## 3. Enable Bot Management Mode

Telegram Bot API 9.6 added Managed Bots. AppGPT can use this so a user can create a bot owned by their Telegram account while AppGPT is its manager.

In @BotFather:

1. `/mybots`
2. Choose the AppGPT bot.
3. **Bot Settings**.
4. Enable **Bot Management Mode**.

After this, `/createbot` can give users Telegram's native managed-bot creation link. When the user finishes creation, AppGPT receives a `managed_bot` update. The new bot token does not need to be pasted into the web app.

## 4. Deploy/configure the AppGPT bot Worker

The worker lives in `appgpt-bot/`.

Set Cloudflare Worker secrets:

```bash
cd appgpt-bot
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
```

Use a random webhook secret containing only letters, numbers, `_`, or `-`.

Then configure Telegram:

```bash
BOT_TOKEN='your-bot-token' \
WORKER_URL='https://appgpt-bot.<your-subdomain>.workers.dev' \
WEBHOOK_SECRET='the-same-secret' \
APP_URL='https://digitbox.dev/appgpt' \
node appgpt-bot/setup.mjs
```

The setup script configures:

- `/start`
- `/app`
- `/projects`
- `/keys`
- `/templates`
- `/providers`
- `/createbot`
- `/help`
- the persistent **Open AppGPT** menu button
- webhook updates for normal messages and `managed_bot` events

## 5. Create the encrypted Telegram account vault table

Run this file once in the Supabase SQL Editor:

`supabase/appgpt_telegram_vaults.sql`

The table has no anon/authenticated access. Only the server-side sync endpoint uses it.

## 6. Add server environment variables to the DigitBox deployment

Add these to the environment that runs the Next.js API routes:

```text
APPGPT_TELEGRAM_BOT_TOKEN=<same AppGPT bot token>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service-role key>
APPGPT_SYNC_ENCRYPTION_KEY=<long random secret, preferably 32+ random bytes>
```

DigitBox already uses:

```text
NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>
```

Do not prefix the service-role key, bot token, or encryption key with `NEXT_PUBLIC_`.

A strong encryption secret can be generated locally with a password manager or a cryptographically secure random generator. Keep it backed up: changing it makes old encrypted vault records unreadable.

## 7. What happens when the user sends `/start`

The bot now explains the whole AppGPT flow:

1. Open AppGPT.
2. Telegram automatically identifies the user inside the Mini App.
3. Connect a personal AI provider/API key.
4. Create an app from a chat and keep editing the same app.
5. Enable project sync and optionally encrypted API-key sync.
6. Optionally create a real Telegram Managed Bot for the generated project.

The `/start` message includes buttons for:

- **Open AppGPT**
- **Connect API Key**
- **My Projects**
- **Templates**
- **Quick Start**
- **Create My Telegram Bot** when Bot Management Mode is enabled

## 8. API-key behavior

AppGPT is BYOK (bring your own key).

Supported provider presets include Gemini, Hugging Face, OpenAI, Anthropic, OpenRouter, Groq, DeepSeek, Mistral, Together, xAI, and custom OpenAI-compatible endpoints.

Security layers:

- In Telegram 9.0+, remembered keys use **Telegram SecureStorage** on the current device.
- Cross-device API-key sync is **off by default** and must be enabled by the user in Settings.
- When enabled, AppGPT sends the key only over HTTPS to `/api/appgpt/sync` together with Telegram `initData`.
- The server validates the Telegram HMAC before accepting the request.
- The complete account payload is encrypted with AES-GCM before it is written to Supabase.
- The provider key is never written into a generated public `index.html`.
- Users can optionally require Telegram biometrics before a synced key is restored into the current Mini App session.

## 9. Project sync behavior

Inside Telegram, **project sync defaults on**.

AppGPT keeps:

- local IndexedDB as the fast/offline copy;
- Telegram CloudStorage for small account-sync preferences;
- the encrypted AppGPT vault for larger chat/project data.

To keep account payloads practical, the cloud snapshot keeps recent chats and a bounded amount of version history. Local IndexedDB remains the richest local history.

## 10. Telegram APIs AppGPT currently uses or can use

### Used directly in AppGPT

- `initData` / `initDataUnsafe` — automatic Telegram identity; only validated `initData` is trusted by the server.
- `MainButton`, `SecondaryButton`, `BackButton`, `SettingsButton` — Telegram-native navigation/actions.
- `HapticFeedback` — native feedback.
- `CloudStorage` — small sync preferences.
- `DeviceStorage` — persistent device-local state.
- `SecureStorage` — device-secure secrets.
- `BiometricManager` — optional API-key unlock protection.
- `showPopup` — native confirmations.
- `requestWriteAccess` — let the bot send future messages after permission.
- `requestFullscreen` / `exitFullscreen` — immersive AppGPT view.
- `addToHomeScreen` — Telegram Mini App shortcut.
- Telegram theme/safe-area APIs.

### Useful next integrations

- `shareMessage` + `savePreparedInlineMessage` — share a generated app card/project to chats.
- `downloadFile` — native Telegram download flow for exported `index.html` or project bundles.
- `requestChat` + `savePreparedKeyboardButton` — choose a chat or request a Managed Bot through Telegram-native UI.
- `requestEmojiStatusAccess` / `setEmojiStatus` — optional build/status indicators.
- `readTextFromClipboard` — import snippets/keys only from an explicit user action.
- QR scanning — useful for project/import flows.
- Location/sensors — available, but intentionally not used by AppGPT because they do not help the core app-building workflow.

## 11. Managed Bots vs Main Mini Apps

Telegram now provides an API-assisted **Managed Bot** creation flow. This is the feature AppGPT can automate.

A **Main Mini App** profile configuration is still configured through @BotFather. There is a Bot API method for configuring the normal bot menu button URL, and the setup script already uses it, but the profile-level Main Mini App configuration itself remains a BotFather setup step.

This means the ideal AppGPT flow is:

1. AppGPT manager bot is configured once in BotFather.
2. User creates a generated project.
3. User taps **Create My Bot**.
4. Telegram creates a managed bot owned by that user.
5. AppGPT receives the managed-bot update and can fetch/configure the managed bot token server-side without exposing it to the browser.
6. AppGPT can set the new bot's menu button to the published project URL.

That last project-to-managed-bot publishing connection is the next logical automation layer after account sync.
