import { S, tg, latest, infer, toast, haptic, success, failHaptic } from './app-state.js';
import { draft, runBuild, editCurrent } from './build-engine.js';
import { saveChat, setLastChatId } from './storage.js';

const $ = s => document.querySelector(s);
let sending = false;

boot();

function boot(attempt = 0) {
  const content = $('#workspace-tab-content');
  if (!content) {
    if (attempt < 120) setTimeout(() => boot(attempt + 1), 50);
    return;
  }

  mountComposer(content);
  interceptCreateApp();
  hideLegacyCreateSheet();
  suppressOldTelegramMainButton();
  sync();

  window.addEventListener('appgpt-chat-changed', sync);
  window.addEventListener('appgpt-progress', () => {
    syncBusy();
    suppressOldTelegramMainButton();
  });
}

function mountComposer(content) {
  if ($('#simpleChatComposerWrap')) return;

  const wrap = document.createElement('div');
  wrap.id = 'simpleChatComposerWrap';
  wrap.className = 'simple-chat-composer-wrap';
  wrap.innerHTML = `
    <div class="simple-chat-composer">
      <textarea id="simpleChatComposer" rows="1" aria-label="Message AppGPT" placeholder="Describe the app you want…"></textarea>
      <button id="simpleChatSend" class="simple-chat-send" type="button" aria-label="Send">↑</button>
    </div>
    <div class="simple-chat-hint">
      <strong id="simpleChatMode">Build this chat into an app</strong>
      <span>Enter to send · Shift+Enter for a new line</span>
    </div>`;

  content.append(wrap);

  const input = $('#simpleChatComposer');
  const send = $('#simpleChatSend');
  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  input.addEventListener('input', autoSize);

  window.addEventListener('appgpt-focus-composer', focusComposer);
}

function interceptCreateApp() {
  document.addEventListener('click', e => {
    const button = e.target.closest?.('#createAppBtn');
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    createFromCurrentChat();
  }, true);
}

function hideLegacyCreateSheet() {
  const modal = $('#createAppModal');
  if (modal) modal.hidden = true;
}

function suppressOldTelegramMainButton() {
  try {
    tg?.MainButton?.hide?.();
    tg?.MainButton?.setParams?.({ is_visible: false });
  } catch {}
}

async function ensureCurrentChat(seed = '') {
  if (!S.chat) {
    S.chat = draft(seed ? infer(seed) : 'New app');
    await saveChat(S.chat);
    await setLastChatId(S.chat.id);
    window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
    return S.chat;
  }

  // A failed or interrupted first build should retry in the SAME chat.
  if (!latest() && S.chat.status !== 'draft') {
    S.chat.status = 'draft';
    S.chat.updatedAt = new Date().toISOString();
    await saveChat(S.chat);
  }
  return S.chat;
}

async function createFromCurrentChat() {
  if (sending) return;
  await ensureCurrentChat();
  haptic('medium');

  if (latest()) {
    await telegramNotice(
      'This chat is already an app',
      'Type any change in the message box below. AppGPT will update this same app and save a new version.',
      'Edit app'
    );
    focusComposer();
    return;
  }

  const request = currentChatRequest();
  if (!request) {
    await telegramNotice(
      'Create an app from this chat',
      'Write what you want in the message box below, then press Create App or send the message.',
      'Write idea'
    );
    focusComposer();
    return;
  }

  const ok = await telegramConfirm(
    'Turn this chat into an app?',
    'AppGPT will use the current chat as the app brief and generate one complete Telegram Mini App.',
    'Create app'
  );
  if (!ok) return;

  await buildCurrent(request);
}

function currentChatRequest() {
  const typed = $('#simpleChatComposer')?.value.trim();
  if (typed) return typed;

  const userMessages = (S.chat?.messages || [])
    .filter(m => m.role === 'user' && m.content)
    .map(m => String(m.content).trim())
    .filter(Boolean);

  if (userMessages.length) return userMessages.join('\n\n');
  return String(S.chat?.project?.prompt || '').trim();
}

async function sendMessage() {
  if (sending) return;
  const input = $('#simpleChatComposer');
  const request = input?.value.trim();
  if (!request) {
    focusComposer();
    return;
  }

  await ensureCurrentChat(request);
  sending = true;
  syncBusy();
  haptic('light');

  try {
    try { tg?.hideKeyboard?.(); } catch {}

    if (latest()) {
      await editCurrent(request);
      toast('App updated in this chat');
    } else {
      await buildCurrent(request, false);
    }

    input.value = '';
    autoSize();
    success();
    window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
  } catch (error) {
    failHaptic();
    if (/API key/i.test(error?.message || '')) {
      document.querySelector('.nav-item[data-view="settings"]')?.click();
    }
    toast(error?.message || 'Could not update the app.');
  } finally {
    sending = false;
    syncBusy();
  }
}

async function buildCurrent(request, announce = true) {
  await ensureCurrentChat(request);

  if (S.chat.title === 'New app' || !S.chat.title) {
    S.chat.title = infer(request);
    S.chat.project = { ...(S.chat.project || {}), name: S.chat.title, prompt: request };
    S.chat.updatedAt = new Date().toISOString();
    await saveChat(S.chat);
  }

  sending = true;
  syncBusy();
  try {
    await runBuild(request, {
      title: S.chat.title || infer(request),
      quality: 'fast',
      image: null
    });
    if (announce) toast('This chat is now an app ✦');
    window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
  } catch (error) {
    if (/API key/i.test(error?.message || '')) {
      document.querySelector('.nav-item[data-view="settings"]')?.click();
    }
    toast(error?.message || 'Could not create the app.');
    throw error;
  } finally {
    sending = false;
    syncBusy();
  }
}

function sync() {
  const hasApp = Boolean(latest());
  const mode = $('#simpleChatMode');
  const input = $('#simpleChatComposer');
  const create = $('#createAppBtn');

  if (mode) mode.textContent = hasApp ? 'Changes update this same app' : 'Build this chat into an app';
  if (input) input.placeholder = hasApp
    ? 'Ask for a change… e.g. add settings, fix mobile layout, change colors…'
    : 'Describe the app you want…';
  if (create) create.textContent = hasApp ? '✦ App from this chat' : '✦ Create App';

  syncBusy();
}

function syncBusy() {
  const busy = sending || Boolean(S.busy);
  const send = $('#simpleChatSend');
  const input = $('#simpleChatComposer');
  if (send) {
    send.disabled = busy;
    send.textContent = busy ? '…' : '↑';
  }
  if (input) input.disabled = busy;
}

function autoSize() {
  const input = $('#simpleChatComposer');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(160, Math.max(42, input.scrollHeight))}px`;
}

function focusComposer() {
  const input = $('#simpleChatComposer');
  input?.focus({ preventScroll: false });
  input?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function telegramConfirm(title, message, actionText) {
  if (tg?.showPopup) {
    return new Promise(resolve => {
      try {
        tg.showPopup({
          title,
          message,
          buttons: [
            { id: 'create', type: 'default', text: actionText },
            { id: 'cancel', type: 'cancel' }
          ]
        }, id => resolve(id === 'create'));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

function telegramNotice(title, message, actionText = 'OK') {
  if (tg?.showPopup) {
    return new Promise(resolve => {
      try {
        tg.showPopup({
          title,
          message,
          buttons: [{ id: 'ok', type: 'default', text: actionText }]
        }, () => resolve(true));
      } catch {
        resolve(true);
      }
    });
  }
  toast(message);
  return Promise.resolve(true);
}
