const DEFAULT_APP_URL = 'https://digitbox.dev/appgpt';
const DEFAULT_GUIDE_URL = 'https://digitbox.dev/appgpt/getting-started.html';
const DEFAULT_GITHUB_URL = 'https://github.com/MilkdromedaStudios/DigitBox';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const me = env.BOT_TOKEN ? await telegram(env, 'getMe', {}).catch(() => null) : null;
      return json({ ok: true, service: 'AppGPT Telegram bot', bot: me ? { username: me.username, can_manage_bots: Boolean(me.can_manage_bots) } : null });
    }

    if (request.method !== 'POST' || url.pathname !== '/webhook') return new Response('AppGPT bot webhook', { status: 200 });
    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) return new Response('Bot is not configured', { status: 503 });

    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });

    let update;
    try { update = await request.json(); }
    catch { return new Response('Bad request', { status: 400 }); }

    try { await handleUpdate(update, env); }
    catch (error) { console.error('Telegram update failed', error); }
    return new Response('OK');
  }
};

async function handleUpdate(update, env) {
  if (update?.managed_bot) return handleManagedBot(update.managed_bot, env);

  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== 'string') return;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const command = text.split(/\s+/, 1)[0].split('@')[0].toLowerCase();
  const payload = command === '/start' && text.includes(' ') ? text.slice(text.indexOf(' ') + 1).trim() : '';

  if (command === '/start') return sendStart(chatId, message.from, env, payload);
  if (command === '/help') return sendHelp(chatId, env);
  if (command === '/app') return sendSection(chatId, env, 'build');
  if (command === '/templates') return sendSection(chatId, env, 'templates');
  if (command === '/providers') return sendSection(chatId, env, 'settings');
  if (command === '/keys') return sendKeys(chatId, env);
  if (command === '/projects') return sendProjects(chatId, env);
  if (command === '/createbot') return sendCreateBot(chatId, message.from, env);
  if (text.startsWith('/')) return sendHelp(chatId, env);
}

async function sendStart(chatId, user, env, payload = '') {
  const firstName = escapeHtml(user?.first_name || 'there');
  const appUrl = appUrlForPayload(getAppUrl(env), payload);
  const guideUrl = env.GUIDE_URL || DEFAULT_GUIDE_URL;
  const githubUrl = env.GITHUB_URL || DEFAULT_GITHUB_URL;
  const me = await telegram(env, 'getMe', {}).catch(() => null);
  const createBotUrl = managedBotUrl(me, suggestedManagedUsername(user?.id), 'My AppGPT Bot');

  const text = [
    `<b>Welcome to AppGPT, ${firstName} ✦</b>`,
    '',
    'AppGPT turns a normal chat into a complete Telegram Mini App, then lets you keep chatting to edit the same app.',
    '',
    '<b>1 · Open AppGPT</b>',
    'Tap the button below. When AppGPT opens inside Telegram, your Telegram account is used automatically — there is no separate AppGPT password.',
    '',
    '<b>2 · Connect an AI provider</b>',
    'Choose Gemini, Hugging Face, OpenAI, Claude, OpenRouter, or another supported provider and paste your own API key. AppGPT never writes that key into the generated public <code>index.html</code>.',
    '',
    '<b>3 · Build</b>',
    'Type what you want, press Create App, then keep chatting with changes like “add settings”, “make this button blue”, or “add a leaderboard”.',
    '',
    '<b>4 · Your account & projects</b>',
    'Project sync can follow your Telegram account across devices. API-key cloud sync is optional and uses AppGPT’s encrypted vault; Telegram SecureStorage is also used on supported devices.',
    '',
    '<b>5 · Make a real Telegram bot</b>',
    createBotUrl
      ? 'AppGPT supports Telegram’s Managed Bots flow. You can create a bot owned by you and managed by AppGPT without manually copying its token.'
      : 'Managed-bot creation becomes available after Bot Management Mode is enabled for this bot in BotFather.',
    '',
    'Use /keys for API-key help, /projects for saved projects, /createbot for bot creation, or /help for all commands.'
  ].join('\n');

  const keyboard = [
    [{ text: '🚀 Open AppGPT', web_app: { url: appUrl } }],
    [
      { text: '🔑 Connect API Key', web_app: { url: withView(getAppUrl(env), 'settings') } },
      { text: '🗂 My Projects', web_app: { url: withView(getAppUrl(env), 'chats') } }
    ],
    [
      { text: '▦ Templates', web_app: { url: withView(getAppUrl(env), 'templates') } },
      { text: '📖 Quick Start', url: guideUrl }
    ]
  ];
  if (createBotUrl) keyboard.push([{ text: '🤖 Create My Telegram Bot', url: createBotUrl }]);
  keyboard.push([{ text: '💻 GitHub', url: githubUrl }]);

  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function sendKeys(chatId, env) {
  const text = [
    '<b>🔑 AppGPT API Keys</b>',
    '',
    'AppGPT is bring-your-own-key. The key pays the AI provider directly; AppGPT does not bundle a shared AI account.',
    '',
    '<b>Where to get one</b>',
    '• Gemini — create a Gemini API key in Google AI Studio.',
    '• Hugging Face — create an access token with Inference Providers access.',
    '• OpenAI — create an API key in the OpenAI developer platform.',
    '• Anthropic — create an API key in the Anthropic Console.',
    '• OpenRouter / Groq / DeepSeek / Mistral / Together / xAI — create a key in that provider’s dashboard.',
    '',
    '<b>How AppGPT stores it</b>',
    '• Current Telegram device: Telegram SecureStorage when supported.',
    '• Cross-device: only if you enable “Sync my AI API key securely” in AppGPT Settings. The server copy is encrypted and is returned only after Telegram initData is validated.',
    '• Turning key sync off removes the encrypted cloud key copy.',
    '• Generated apps: the provider key is never embedded into the public index.html.',
    '',
    'If you do not enable cross-device key sync, you may need to enter the key again on another phone or computer.'
  ].join('\n');
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: '🔑 Open API Key Settings', web_app: { url: withView(getAppUrl(env), 'settings') } }]] }
  });
}

async function sendProjects(chatId, env) {
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: [
      '<b>🗂 Your AppGPT Projects</b>',
      '',
      'One AppGPT chat equals one evolving app. When Telegram account sync is enabled, your recent chat history and generated index.html versions are copied into your encrypted account vault and can be restored on another Telegram device.',
      '',
      'AppGPT still keeps a local IndexedDB copy for fast loading and offline resilience.'
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: 'Open My Projects', web_app: { url: withView(getAppUrl(env), 'chats') } }]] }
  });
}

async function sendCreateBot(chatId, user, env) {
  const me = await telegram(env, 'getMe', {}).catch(() => null);
  if (!me?.can_manage_bots) {
    return telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: [
        '<b>🤖 Managed Bot setup is not enabled yet</b>',
        '',
        'Telegram lets manager bots create and manage bots for users. To enable it once:',
        '1. Open @BotFather.',
        '2. Open this bot in /mybots.',
        '3. Open Bot Settings.',
        '4. Enable <b>Bot Management Mode</b>.',
        '5. Run /createbot here again.',
        '',
        'The new bot will still be owned by you. AppGPT acts as its manager so it can configure the bot without asking you to paste the bot token into the web app.'
      ].join('\n'),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Open BotFather', url: 'https://t.me/BotFather' }]] }
    });
  }

  const requestId = Math.floor(Date.now() / 1000) & 0x7fffffff;
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: [
      '<b>🤖 Create a Telegram bot for your AppGPT project</b>',
      '',
      'Tap the Telegram button below. Telegram will open its native Managed Bot creation flow. You can edit the suggested name and @username before confirming.',
      '',
      'The bot is owned by your Telegram account. AppGPT becomes its manager and can configure it later without exposing its token in the browser.'
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [[{
        text: '🤖 Create My AppGPT Bot',
        request_managed_bot: {
          request_id: requestId,
          suggested_name: 'My AppGPT Bot',
          suggested_username: suggestedManagedUsername(user?.id || chatId)
        }
      }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: 'Create or share a managed bot'
    }
  });
}

async function handleManagedBot(event, env) {
  const owner = event?.user;
  const bot = event?.bot;
  if (!owner?.id || !bot?.id) return;
  const botName = bot.username ? `@${escapeHtml(bot.username)}` : escapeHtml(bot.first_name || 'your new bot');
  return telegram(env, 'sendMessage', {
    chat_id: owner.id,
    text: [
      `<b>✅ ${botName} is connected to AppGPT</b>`,
      '',
      'Telegram created the bot under your account and notified AppGPT as its manager.',
      '',
      'You do <b>not</b> need to paste the bot token into AppGPT. The manager can request the managed-bot token from Telegram only when it needs to configure that bot.',
      '',
      'Open AppGPT and continue the project you want to connect to this bot.'
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🚀 Open AppGPT', web_app: { url: getAppUrl(env) } }]] }
  });
}

async function sendHelp(chatId, env) {
  const text = [
    '<b>AppGPT Help</b>',
    '',
    '<b>/start</b> — first-time guide and quick links',
    '<b>/app</b> — open the AppGPT builder',
    '<b>/projects</b> — open synced projects/chats',
    '<b>/keys</b> — API-key setup and security',
    '<b>/templates</b> — browse Mini App templates',
    '<b>/providers</b> — open AI provider settings',
    '<b>/createbot</b> — create a Telegram Managed Bot for a project',
    '<b>/help</b> — show this guide',
    '',
    'Inside Telegram, AppGPT uses your Telegram identity automatically. One chat becomes one evolving app, and every successful build/edit remains a versioned index.html artifact.'
  ].join('\n');

  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Open AppGPT', web_app: { url: getAppUrl(env) } }],
        [{ text: '📖 Full Quick Start', url: env.GUIDE_URL || DEFAULT_GUIDE_URL }]
      ]
    }
  });
}

async function sendSection(chatId, env, view) {
  const labels = {
    build: ['Open AppGPT', 'Launch the builder and create a Telegram Mini App from a chat.'],
    templates: ['Browse Templates', 'Start from AppGPT’s template library, then customize the app in chat.'],
    settings: ['Connect an AI Provider', 'Choose Gemini, Hugging Face, OpenAI, Claude, OpenRouter, or another supported provider.']
  };
  const [buttonText, description] = labels[view] || labels.build;
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: `<b>${escapeHtml(buttonText)}</b>\n${escapeHtml(description)}`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: buttonText, web_app: { url: withView(getAppUrl(env), view) } }]] }
  });
}

function suggestedManagedUsername(seed) {
  const digits = String(seed || Date.now()).replace(/\D/g, '').slice(-8) || String(Date.now()).slice(-8);
  return `AppGPT${digits}Bot`.slice(0, 32);
}

function managedBotUrl(me, suggestedUsername, suggestedName) {
  if (!me?.can_manage_bots || !me?.username) return '';
  return `https://t.me/newbot/${encodeURIComponent(me.username)}/${encodeURIComponent(suggestedUsername)}?name=${encodeURIComponent(suggestedName || 'My AppGPT Bot')}`;
}

function appUrlForPayload(appUrl, payload) {
  const value = String(payload || '').toLowerCase();
  if (value === 'templates') return withView(appUrl, 'templates');
  if (value === 'providers' || value === 'settings' || value === 'keys') return withView(appUrl, 'settings');
  if (value === 'projects' || value === 'chats') return withView(appUrl, 'chats');
  if (value === 'debug') return withView(appUrl, 'debug');
  return appUrl;
}

function withView(appUrl, view) {
  const url = new URL(appUrl);
  url.searchParams.set('view', view);
  return url.href;
}

function getAppUrl(env) {
  return String(env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data?.description || `Telegram ${method} failed (${response.status})`);
  return data.result;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[char]));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
