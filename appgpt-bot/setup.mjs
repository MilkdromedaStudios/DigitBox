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
    { command: 'start', description: 'Open your AppGPT workspace menu' },
    { command: 'menu', description: 'Choose a new or existing app' },
    { command: 'new', description: 'Start a new app in Telegram' },
    { command: 'build', description: 'Build an app directly from a prompt' },
    { command: 'projects', description: 'Choose existing apps or visual projects' },
    { command: 'templates', description: 'Browse Mini App templates' },
    { command: 'createbot', description: 'Create a Telegram bot for an AppGPT project' },
    { command: 'providers', description: 'Open AI settings' },
    { command: 'help', description: 'Show Telegram workspace help' }
  ]
});

await api('setMyDescription', {
  description: 'Build and edit Telegram Mini Apps directly in chat. Pick an app, type changes, and AppGPT sends each version back as an HTML file.'
});

await api('setMyShortDescription', {
  short_description: 'Build Telegram Mini Apps directly in chat.'
});

await api('setChatMenuButton', {
  menu_button: {
    type: 'commands'
  }
});

await api('setWebhook', {
  url: `${worker}/webhook`,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query', 'managed_bot'],
  drop_pending_updates: false
});

const webhook = await api('getWebhookInfo');
console.log('✓ Telegram workspace commands configured');
console.log('✓ Callback menu updates enabled');
console.log('✓ Bot description configured');
console.log('✓ Chat menu shows bot commands');
console.log(`✓ Managed Bot mode: ${me.can_manage_bots ? 'enabled' : 'not enabled — turn on Bot Management Mode in BotFather for /createbot'}`);
console.log(`✓ Visual App URL: ${app}`);
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
