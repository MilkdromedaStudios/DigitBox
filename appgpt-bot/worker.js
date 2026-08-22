const DEFAULT_APP_URL = 'https://digitbox.dev/appgpt';
const DEFAULT_GUIDE_URL = 'https://digitbox.dev/appgpt/getting-started.html';
const DEFAULT_GITHUB_URL = 'https://github.com/MilkdromedaStudios/DigitBox';
const TELEGRAM_BUILDER_MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct';
const CONTEXT_ORIGIN = 'https://digitbox.dev/appgpt-context';

const BUILD_SYSTEM_PROMPT = `You are AppGPT's Telegram chat builder.
The user expects an actual app file, not an explanation.

OUTPUT CONTRACT — ABSOLUTE:
- Return ONLY one complete raw HTML document.
- The FIRST characters must be <!doctype html>
- The LAST characters must be </html>
- Do NOT use Markdown code fences.
- Do NOT add commentary, explanations, JSON, headings, or text outside the HTML.
- Include <html>, <head>, and <body>.
- Put all app-specific CSS and JavaScript inside this one HTML file.
- Build a polished, functional, mobile-first Telegram Mini App.
- Use window.Telegram?.WebApp safely and keep normal-browser fallback working.
- Every visible primary control must work.
- Never embed API keys, bot tokens, or private secrets.
- If the requested app is too large, simplify it rather than returning partial HTML.
Before answering, silently verify the document ends with </html>.`;

const EDIT_SYSTEM_PROMPT = `${BUILD_SYSTEM_PROMPT}

EDIT MODE:
- You will receive an existing complete HTML app and one requested change.
- Preserve everything the user did not ask to change.
- Implement the requested change completely.
- Return the COMPLETE replacement HTML, never a patch or excerpt.
- Do not describe the changes. Raw HTML only.`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const me = env.BOT_TOKEN ? await telegram(env, 'getMe', {}).catch(() => null) : null;
      return json({
        ok: true,
        service: 'AppGPT Telegram bot',
        chat_builder: Boolean(env.AI),
        chat_builder_model: env.AI ? TELEGRAM_BUILDER_MODEL : null,
        bot: me ? { username: me.username, can_manage_bots: Boolean(me.can_manage_bots) } : null
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/webhook') {
      return new Response('AppGPT bot webhook', { status: 200 });
    }
    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
      return new Response('Bot is not configured', { status: 503 });
    }

    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });

    let update;
    try { update = await request.json(); }
    catch { return new Response('Bad request', { status: 400 }); }

    const work = handleUpdate(update, env).catch(error => console.error('Telegram update failed', error));
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else await work;
    return new Response('OK');
  }
};

async function handleUpdate(update, env) {
  if (update?.managed_bot) return handleManagedBot(update.managed_bot, env);
  if (update?.callback_query) return handleCallback(update.callback_query, env);

  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== 'string') return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  if (!text) return;

  const command = text.split(/\s+/, 1)[0].split('@')[0].toLowerCase();
  const payload = command === '/start' && text.includes(' ')
    ? text.slice(text.indexOf(' ') + 1).trim()
    : '';

  if (command === '/start' || command === '/menu') return sendWorkspaceMenu(chatId, message.from, env, payload);
  if (command === '/help') return sendHelp(chatId, env);
  if (command === '/new') return sendNewAppPrompt(chatId, env);
  if (command === '/build') {
    const prompt = text.includes(' ') ? text.slice(text.indexOf(' ') + 1).trim() : '';
    if (!prompt) return sendNewAppPrompt(chatId, env);
    return buildAppInTelegram(message, env, prompt);
  }
  if (command === '/app') return sendSection(chatId, env, 'build');
  if (command === '/templates') return sendSection(chatId, env, 'templates');
  if (command === '/providers') return sendSection(chatId, env, 'settings');
  if (command === '/keys') return sendKeys(chatId, env);
  if (command === '/projects') return sendProjects(chatId, env);
  if (command === '/createbot') return sendCreateBot(chatId, message.from, env);
  if (text.startsWith('/')) return sendHelp(chatId, env);

  // Direct reply to any AppGPT HTML file = edit that exact version.
  if (isHtmlDocument(message.reply_to_message?.document)) {
    return editAppInTelegram(message, env, {
      fileId: message.reply_to_message.document.file_id,
      fileName: message.reply_to_message.document.file_name || 'app-v1.html'
    });
  }

  // After an app is selected, AppGPT sends a ForceReply message whose hidden
  // text-link carries the Telegram file id. The user can then simply type.
  const active = activeContextFromReply(message.reply_to_message);
  if (active) return editAppInTelegram(message, env, active);

  // A reply to the New App prompt is the initial build request.
  if (isNewAppPrompt(message.reply_to_message)) {
    return buildAppInTelegram(message, env, text);
  }

  const action = naturalAction(text);
  if (action === 'createbot') return sendCreateBot(chatId, message.from, env);
  if (action === 'templates') return sendSection(chatId, env, 'templates');
  if (action === 'projects') return sendProjects(chatId, env);
  if (action === 'settings') return sendSection(chatId, env, 'settings');
  if (action === 'help') return sendHelp(chatId, env);
  if (action === 'new') return sendNewAppPrompt(chatId, env);

  // No app is selected. Ask first instead of guessing and creating a project.
  return sendWorkspaceMenu(chatId, message.from, env);
}

async function handleCallback(query, env) {
  const data = String(query?.data || '');
  const chatId = query?.message?.chat?.id;
  if (query?.id) await telegram(env, 'answerCallbackQuery', { callback_query_id: query.id }).catch(() => null);
  if (!chatId) return;

  if (data === 'workspace:new') return sendNewAppPrompt(chatId, env);
  if (data === 'workspace:existing') {
    return telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: [
        '<b>📂 Choose an app</b>',
        '',
        'Find any AppGPT HTML file in this chat and tap <b>✏️ Work on this app</b> underneath it.',
        '',
        'You can also reply directly to an HTML file with a change request.'
      ].join('\n'),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Workspace menu', callback_data: 'workspace:menu' }]] }
    });
  }
  if (data === 'workspace:menu') return sendWorkspaceMenu(chatId, query.from, env);
  if (data === 'workspace:createbot') return sendCreateBot(chatId, query.from, env);
  if (data === 'workspace:templates') return sendSection(chatId, env, 'templates');
  if (data === 'workspace:visual') return sendSection(chatId, env, 'build');

  if (data === 'work:this') {
    const document = query?.message?.document;
    if (!isHtmlDocument(document)) {
      return telegram(env, 'sendMessage', { chat_id: chatId, text: 'I could not find the HTML file for that version.' });
    }
    return sendActiveContext(chatId, document.file_id, document.file_name || 'app-v1.html', env, true);
  }
}

async function sendWorkspaceMenu(chatId, user, env, payload = '') {
  const firstName = escapeHtml(user?.first_name || 'there');
  const appUrl = appUrlForPayload(getAppUrl(env), payload);

  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: [
      `<b>AppGPT Workspace ✦</b>`,
      `Hi ${firstName}. What do you want to work on?`,
      '',
      'Pick an app first. After that, just type requests normally and I’ll keep editing that app in this Telegram chat.'
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ New app', callback_data: 'workspace:new' },
          { text: '📂 Existing app', callback_data: 'workspace:existing' }
        ],
        [
          { text: '🤖 Create bot', callback_data: 'workspace:createbot' },
          { text: '▦ Templates', callback_data: 'workspace:templates' }
        ],
        [{ text: '🌐 Open visual AppGPT', web_app: { url: appUrl } }]
      ]
    }
  });
}

async function sendNewAppPrompt(chatId, env) {
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: '<b>✦ New app</b>\nDescribe the app you want me to build. You can write normally — no special command needed.',
    parse_mode: 'HTML',
    reply_markup: {
      force_reply: true,
      selective: true,
      input_field_placeholder: 'e.g. Make a habit tracker with streaks…'
    }
  });
}

async function buildAppInTelegram(message, env, prompt) {
  const chatId = message.chat.id;
  if (!env.AI) return sendBuilderUnavailable(chatId, env);

  await telegram(env, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => null);
  const progress = await telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: '⚙️ Building your app… I’ll send the HTML file here when it is ready.'
  }).catch(() => null);

  try {
    const html = await generateHtml(env, [
      { role: 'system', content: BUILD_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]);
    const fileName = `${slugFromPrompt(prompt)}-v1.html`;
    const sent = await sendGeneratedApp(chatId, html, fileName, env, '✅ App created · v1');
    if (progress?.message_id) {
      await telegram(env, 'deleteMessage', { chat_id: chatId, message_id: progress.message_id }).catch(() => null);
    }
    return sendActiveContext(chatId, sent.document.file_id, sent.document.file_name || fileName, env, false);
  } catch (error) {
    if (progress?.message_id) {
      await telegram(env, 'editMessageText', {
        chat_id: chatId,
        message_id: progress.message_id,
        text: `Could not build that app: ${safeTelegramText(error?.message || 'AI generation failed.')}`
      }).catch(() => null);
    }
  }
}

async function editAppInTelegram(message, env, context) {
  const chatId = message.chat.id;
  const request = message.text.trim();
  if (!env.AI) return sendBuilderUnavailable(chatId, env);

  await telegram(env, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => null);
  const progress = await telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: `⚙️ Updating ${escapeHtml(context.fileName || 'this app')}…`,
    parse_mode: 'HTML'
  }).catch(() => null);

  try {
    const existing = await downloadTelegramDocument(context.fileId, env);
    if (existing.length > 120000) {
      throw new Error('This HTML version is too large for the Telegram chat editor. Open it in visual AppGPT for this edit.');
    }

    const html = await generateHtml(env, [
      { role: 'system', content: EDIT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `REQUEST:\n${request}\n\nCURRENT INDEX.HTML:\n${existing}`
      }
    ]);

    const fileName = nextVersionName(context.fileName || 'app-v1.html');
    const sent = await sendGeneratedApp(chatId, html, fileName, env, `✅ Updated · ${versionLabel(fileName)}`);
    if (progress?.message_id) {
      await telegram(env, 'deleteMessage', { chat_id: chatId, message_id: progress.message_id }).catch(() => null);
    }
    return sendActiveContext(chatId, sent.document.file_id, sent.document.file_name || fileName, env, false);
  } catch (error) {
    if (progress?.message_id) {
      await telegram(env, 'editMessageText', {
        chat_id: chatId,
        message_id: progress.message_id,
        text: `Could not update that app: ${safeTelegramText(error?.message || 'AI edit failed.')}`
      }).catch(() => null);
    }
  }
}

async function generateHtml(env, messages) {
  let result = await runBuilderAI(env, messages);
  let html = extractCompleteHtml(result);
  if (html) return html;

  const retryMessages = [
    ...messages,
    { role: 'assistant', content: String(result || '').slice(0, 12000) },
    {
      role: 'user',
      content: 'RETRY. Your previous response violated the output contract. Return ONLY a COMPLETE raw HTML document. Start exactly with <!doctype html> and end exactly with </html>. No Markdown, no explanation, no JSON, and do not truncate the file.'
    }
  ];
  result = await runBuilderAI(env, retryMessages);
  html = extractCompleteHtml(result);
  if (!html) throw new Error('The AI did not return a complete HTML document after retrying.');
  return html;
}

async function runBuilderAI(env, messages) {
  const response = await env.AI.run(TELEGRAM_BUILDER_MODEL, {
    messages,
    temperature: 0.25,
    max_tokens: 7000,
    stream: false
  });
  return aiText(response);
}

function aiText(response) {
  if (typeof response === 'string') return response;
  if (typeof response?.response === 'string') return response.response;
  if (typeof response?.result?.response === 'string') return response.result.response;
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('');
  return '';
}

function extractCompleteHtml(value) {
  let text = String(value || '').trim();
  text = text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = text.toLowerCase().indexOf('<!doctype html');
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (start < 0 || end < start) return '';
  const html = text.slice(start, end + 7).trim();
  if (!/<html[\s>]/i.test(html) || !/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) return '';
  return html;
}

async function sendGeneratedApp(chatId, html, fileName, env, caption) {
  const sent = await telegramUploadDocument(env, chatId, html, fileName, {
    caption: `${caption}\nTap “Work on this app” any time to make this version active again.`,
    reply_markup: {
      inline_keyboard: [[
        { text: '✏️ Work on this app', callback_data: 'work:this' },
        { text: '➕ New app', callback_data: 'workspace:new' }
      ]]
    }
  });
  if (!sent?.document?.file_id) throw new Error('Telegram accepted the file but did not return a reusable document id.');
  return sent;
}

async function sendActiveContext(chatId, fileId, fileName, env, selected) {
  const url = `${CONTEXT_ORIGIN}?file=${encodeURIComponent(fileId)}&name=${encodeURIComponent(fileName)}`;
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: [
      `<b>${selected ? '✏️ App selected' : '✦ Ready for changes'}</b>`,
      `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(fileName)}</a> is active.`,
      '',
      'Just type what you want changed. I’ll send back the next HTML version.'
    ].join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      force_reply: true,
      selective: true,
      input_field_placeholder: 'e.g. Add dark mode and round the buttons…'
    }
  });
}

function activeContextFromReply(reply) {
  if (!reply || !Array.isArray(reply.entities)) return null;
  for (const entity of reply.entities) {
    if (entity?.type !== 'text_link' || !entity.url?.startsWith(CONTEXT_ORIGIN)) continue;
    try {
      const url = new URL(entity.url);
      const fileId = url.searchParams.get('file');
      const fileName = url.searchParams.get('name') || 'app-v1.html';
      if (fileId) return { fileId, fileName };
    } catch {}
  }
  return null;
}

function isNewAppPrompt(reply) {
  return Boolean(reply?.from?.is_bot && typeof reply.text === 'string' && reply.text.includes('✦ New app'));
}

function isHtmlDocument(document) {
  if (!document?.file_id) return false;
  const name = String(document.file_name || '').toLowerCase();
  const mime = String(document.mime_type || '').toLowerCase();
  return name.endsWith('.html') || mime === 'text/html';
}

async function downloadTelegramDocument(fileId, env) {
  const file = await telegram(env, 'getFile', { file_id: fileId });
  if (!file?.file_path) throw new Error('Telegram could not locate that HTML file.');
  const response = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`);
  if (!response.ok) throw new Error(`Could not download the selected HTML file (${response.status}).`);
  return response.text();
}

async function telegramUploadDocument(env, chatId, html, fileName, options = {}) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('document', new Blob([html], { type: 'text/html;charset=utf-8' }), fileName);
  if (options.caption) form.set('caption', String(options.caption));
  if (options.reply_markup) form.set('reply_markup', JSON.stringify(options.reply_markup));

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data?.description || `Telegram sendDocument failed (${response.status})`);
  return data.result;
}

function slugFromPrompt(prompt) {
  const cleaned = String(prompt || 'app')
    .toLowerCase()
    .replace(/\b(make|build|create|please|me|an?|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 38);
  return cleaned || 'app';
}

function nextVersionName(fileName) {
  const name = String(fileName || 'app-v1.html').replace(/\.html$/i, '');
  const match = name.match(/^(.*)-v(\d+)$/i);
  if (match) return `${match[1]}-v${Number(match[2]) + 1}.html`;
  return `${name}-v2.html`;
}

function versionLabel(fileName) {
  const match = String(fileName || '').match(/-v(\d+)\.html$/i);
  return match ? `v${match[1]}` : 'new version';
}

function naturalAction(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(create|make|new)\b.{0,18}\bbot\b|\bbot\b.{0,18}\b(create|make)\b/.test(value)) return 'createbot';
  if (/\btemplate(s)?\b/.test(value)) return 'templates';
  if (/\b(projects?|my apps?)\b/.test(value)) return 'projects';
  if (/\b(provider|api key|settings?)\b/.test(value)) return 'settings';
  if (/^(help|what can you do|how does this work)[.!? ]*$/.test(value)) return 'help';
  if (/^(new app|make a new app|create a new app)[.!? ]*$/.test(value)) return 'new';
  return '';
}

async function sendBuilderUnavailable(chatId, env) {
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: 'The Telegram chat builder AI is not enabled on this bot deployment yet. Your visual AppGPT builder is still available.',
    reply_markup: { inline_keyboard: [[{ text: '🌐 Open AppGPT', web_app: { url: getAppUrl(env) } }]] }
  });
}

async function sendKeys(chatId, env) {
  const text = [
    '<b>🔑 AppGPT AI options</b>',
    '',
    'The Telegram chat builder uses AppGPT’s server-side Workers AI when enabled, so you do not paste an AI key into the Telegram conversation.',
    '',
    'The visual AppGPT builder also supports Local Free AI and your own Gemini, OpenAI, Claude, OpenRouter, Groq, Hugging Face, and other provider keys.',
    '',
    'Generated index.html files never contain your provider key.'
  ].join('\n');
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: 'Open AI Settings', web_app: { url: withView(getAppUrl(env), 'settings') } }]] }
  });
}

async function sendProjects(chatId, env) {
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: [
      '<b>📂 Existing apps</b>',
      '',
      'For Telegram-only editing, each generated HTML file in this chat is a saved version. Tap <b>✏️ Work on this app</b> under the version you want.',
      '',
      'Projects created in the visual AppGPT interface are still available from its Projects view.'
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '↩️ Workspace menu', callback_data: 'workspace:menu' }],
        [{ text: '🌐 Visual projects', web_app: { url: withView(getAppUrl(env), 'chats') } }]
      ]
    }
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
        '5. Try Create bot again here.',
        '',
        'The new bot is owned by you. AppGPT acts as its manager without exposing its token in the web app.'
      ].join('\n'),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Open BotFather', url: 'https://t.me/BotFather' }]] }
    });
  }

  const requestId = Math.floor(Date.now() / 1000) & 0x7fffffff;
  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: '<b>🤖 Create a Telegram bot</b>\nTap below. Telegram will let you edit the suggested name and @username before confirming.',
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
      'You do not need to paste the bot token anywhere.',
      '',
      'Use /menu to return to your AppGPT workspace.'
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Workspace', callback_data: 'workspace:menu' }]] }
  });
}

async function sendHelp(chatId, env) {
  const text = [
    '<b>AppGPT Telegram Workspace</b>',
    '',
    'You do not need the visual website for normal building and editing.',
    '',
    '• /menu — choose New app or Existing app',
    '• /new — start a new app',
    '• /build &lt;idea&gt; — build directly',
    '• Reply to an HTML file — edit that exact version',
    '• Tap “Work on this app” — make that version active',
    '• /createbot — create a Telegram Managed Bot',
    '• /templates — open templates',
    '• /projects — choose existing apps / visual projects',
    '',
    'Once an app is active, just type changes normally. AppGPT returns a new HTML version each time.'
  ].join('\n');

  return telegram(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Workspace menu', callback_data: 'workspace:menu' }]] }
  });
}

async function sendSection(chatId, env, view) {
  const labels = {
    build: ['Open visual AppGPT', 'Use the full preview, visual editor, debugging, and provider controls.'],
    templates: ['Browse Templates', 'Browse Mini App templates, then customize them in AppGPT.'],
    settings: ['AI Settings', 'Choose Local Free AI, Gemini, OpenAI, Claude, OpenRouter, or another provider.']
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

function safeTelegramText(value) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 800);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[char]));
}

function escapeHtmlAttribute(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
