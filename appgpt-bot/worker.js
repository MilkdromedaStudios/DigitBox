const DEFAULT_APP_URL = 'https://digitbox.dev/appgpt';
const DEFAULT_GUIDE_URL = 'https://digitbox.dev/appgpt/getting-started.html';
const DEFAULT_GITHUB_URL = 'https://github.com/MilkdromedaStudios/DigitBox';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'AppGPT Telegram bot' });
    }

    if (request.method !== 'POST' || url.pathname !== '/webhook') {
      return new Response('AppGPT bot webhook', { status: 200 });
    }

    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
      return new Response('Bot is not configured', { status: 503 });
    }

    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let update;
    try { update = await request.json(); }
    catch { return new Response('Bad request', { status: 400 }); }

    try {
      await handleUpdate(update, env);
    } catch (error) {
      console.error('Telegram update failed', error);
    }

    return new Response('OK');
  }
};

async function handleUpdate(update, env) {
  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== 'string') return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const command = text.split(/\s+/, 1)[0].split('@')[0].toLowerCase();
  const payload = command === '/start' ? text.slice(text.indexOf(' ') + 1).trim() : '';

  if (command === '/start') return sendStart(chatId, message.from, env, payload);
  if (command === '/help') return sendHelp(chatId, env);
  if (command === '/app') return sendSection(chatId, env, 'build');
  if (command === '/templates') return sendSection(chatId, env, 'templates');
  if (command === '/providers') return sendSection(chatId, env, 'settings');

  if (text.startsWith('/')) return sendHelp(chatId, env);
}

async function sendStart(chatId, user, env, payload = '') {
  const firstName = escapeHtml(user?.first_name || 'there');
  const appUrl = appUrlForPayload(getAppUrl(env), payload);
  const guideUrl = env.GUIDE_URL || DEFAULT_GUIDE_URL;
  const githubUrl = env.GITHUB_URL || DEFAULT_GITHUB_URL;

  const text = [
    `<b>Welcome to AppGPT, ${firstName} ✦</b>`,
    '',
    'Build complete Telegram Mini Apps with AI — then preview, edit, debug, download, or publish the generated <code>index.html</code>.',
    '',
    '<b>Start in 3 steps</b>',
    '1. Open AppGPT and connect an AI provider.',
    '2. Start a chat describing the app you want.',
    '3. Turn that chat into an app, then keep chatting to update the same app.',
    '',
    'Use the buttons below to jump straight in.'
  ].join('\n');

  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Open AppGPT', web_app: { url: appUrl } }],
        [
          { text: '▦ Templates', web_app: { url: withView(getAppUrl(env), 'templates') } },
          { text: '⚙️ AI Providers', web_app: { url: withView(getAppUrl(env), 'settings') } }
        ],
        [
          { text: '📖 Quick Start', url: guideUrl },
          { text: '💻 GitHub', url: githubUrl }
        ]
      ]
    }
  });
}

async function sendHelp(chatId, env) {
  const text = [
    '<b>AppGPT Help</b>',
    '',
    '<b>/start</b> — onboarding and quick links',
    '<b>/app</b> — open the builder',
    '<b>/templates</b> — open the template library',
    '<b>/providers</b> — connect Gemini, Hugging Face, OpenAI, Claude, and other providers',
    '<b>/help</b> — show this guide',
    '',
    'One chat becomes one evolving app. AppGPT stores versioned <code>index.html</code> artifacts as you build and edit.'
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

function appUrlForPayload(appUrl, payload) {
  const value = String(payload || '').toLowerCase();
  if (value === 'templates') return withView(appUrl, 'templates');
  if (value === 'providers' || value === 'settings') return withView(appUrl, 'settings');
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
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data?.description || `Telegram ${method} failed (${response.status})`);
  }
  return data.result;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[char]));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
