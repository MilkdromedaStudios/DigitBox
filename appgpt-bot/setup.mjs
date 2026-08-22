const BOT_TOKEN = process.env.BOT_TOKEN;
const WORKER_URL = process.env.WORKER_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'https://digitbox.dev/appgpt';

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required.');
if (!WORKER_URL) throw new Error('WORKER_URL is required, e.g. https://appgpt-bot.<account>.workers.dev');
if (!WEBHOOK_SECRET) throw new Error('WEBHOOK_SECRET is required. Use only A-Z, a-z, 0-9, _ and -.');
if (!/^[A-Za-z0-9_-]{1,256}$/.test(WEBHOOK_SECRET)) throw new Error('WEBHOOK_SECRET contains unsupported characters.');

const worker = WORKER_URL.replace(/\/+$/, '');
const app = APP_URL.replace(/\/+$/, '');

const me = await api('getMe');
console.log(`Configuring @${me.username}…`);

await api('setMyCommands', {
  commands: [
    { command: 'start', description: 'First-time guide and AppGPT quick links' },
    { command: 'app', description: 'Open the AppGPT builder' },
    { command: 'projects', description: 'Open your saved AppGPT projects' },
    { command: 'keys', description: 'API-key setup and security guide' },
    { command: 'templates', description: 'Browse Mini App templates' },
    { command: 'providers', description: 'Connect an AI provider' },
    { command: 'createbot', description: 'Create a Telegram bot for an AppGPT project' },
    { command: 'help', description: 'Show all AppGPT commands' }
  ]
});

await api('setMyDescription', {
  description: 'Build Telegram Mini Apps with AI. Turn a chat into a complete app, sync projects to your Telegram account, edit visually, debug, and connect managed bots.'
});

await api('setMyShortDescription', {
  short_description: 'AI builder for Telegram Mini Apps.'
});

await api('setChatMenuButton', {
  menu_button: {
    type: 'web_app',
    text: 'Open AppGPT',
    web_app: { url: app }
  }
});

await api('setWebhook', {
  url: `${worker}/webhook`,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'managed_bot'],
  drop_pending_updates: false
});

const webhook = await api('getWebhookInfo');
console.log('✓ Commands configured');
console.log('✓ Bot description configured');
console.log('✓ Menu button opens AppGPT');
console.log(`✓ Managed Bot mode: ${me.can_manage_bots ? 'enabled' : 'not enabled — turn on Bot Management Mode in BotFather for /createbot'}`);
console.log(`✓ App URL: ${app}`);
console.log(`✓ Webhook: ${webhook.url}`);
console.log(`✓ Bot: https://t.me/${me.username}`);

async function api(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`${method}: ${data.description || response.statusText || response.status}`);
  }
  return data.result;
}
