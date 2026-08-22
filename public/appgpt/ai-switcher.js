import { PROVIDERS } from './providers.js';
import { S, E, tg, latest, toast, status, success } from './app-state.js';
import { saveChat, saveApiKey, loadApiKey } from './storage.js';

const CFG = 'appgpt_provider_config';
const SCOPED_PREFIX = 'appgpt_provider_key_';
let ui = null;
let activeChatId = '';
let applyingProjectAI = false;
let stampingProjectAI = false;

requestAnimationFrame(init);

async function init() {
  loadCss();
  const settings = document.querySelector('#view-settings');
  if (!settings || document.getElementById('aiSwitchCard')) return;

  mount(settings);
  wire();
  await seedCurrentKey();
  await syncKeylessUI();
  await fillSwitchForm(projectAI()?.provider || E.provider?.value || 'appgptFree');
  renderProjectAI();

  window.addEventListener('appgpt-chat-changed', onChatChanged);
  window.addEventListener('appgpt-free-ai-warning', event => showFreeWarning(event.detail || {}));
  window.addEventListener('appgpt-free-ai-fallback', event => showFreeFallback(event.detail || {}));
  window.addEventListener('appgpt-progress', event => maybeStampProjectAI(event.detail || {}));

  setTimeout(syncKeylessUI, 100);
  setTimeout(syncKeylessUI, 600);
}

function loadCss() {
  if (document.querySelector('link[data-ai-switcher-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './ai-switcher.css';
  link.dataset.aiSwitcherCss = '1';
  document.head.append(link);
}

function mount(settings) {
  const card = document.createElement('section');
  card.id = 'aiSwitchCard';
  card.className = 'panel glass ai-switch-card';
  card.innerHTML = `
    <div class="panel-head">
      <div><p class="kicker">PROJECT AI</p><h2>Switch this app to another AI</h2></div>
      <span class="pill">0-token handoff</span>
    </div>
    <div class="ai-project-current" id="aiProjectCurrent"></div>
    <p class="muted ai-switch-explain">The app itself is normal HTML, so it is not locked to the AI that created it. Switching preserves the exact current <code>index.html</code>, chat and version history. The next edit is simply handled by the new AI.</p>
    <div class="ai-switch-grid">
      <label>Provider<select id="aiSwitchProvider"></select></label>
      <label>Model<input id="aiSwitchModel" type="text"></label>
      <label class="wide ai-switch-key-row" id="aiSwitchKeyRow">API key<div class="secret-row"><input id="aiSwitchKey" type="password" autocomplete="off" placeholder="Key for this provider"><button id="aiSwitchKeyToggle" class="ghost-btn" type="button">Show</button></div></label>
      <label class="wide">Base URL<input id="aiSwitchBase" type="text"></label>
    </div>
    <div class="ai-switch-free-note" id="aiSwitchFreeNote" hidden>
      <strong>✦ AppGPT Free</strong>
      <span>No API key. Puter supplies a free monthly user allowance and AppGPT tries multiple free hosted models before giving up. If the allowance is exhausted, AppGPT stops and asks you to choose another AI — it never silently spends a saved paid key.</span>
    </div>
    <div class="ai-switch-actions">
      <label id="aiSwitchRememberRow"><input id="aiSwitchRemember" type="checkbox" checked> Remember this provider's key</label>
      <button id="aiSwitchApply" class="primary-btn small" type="button">↹ Switch project AI</button>
    </div>
    <div class="inline-status" id="aiSwitchStatus"></div>
    <div class="ai-switch-history" id="aiSwitchHistory"></div>`;

  const settingsCard = settings.querySelector('.settings-card');
  if (settingsCard) settingsCard.insertAdjacentElement('afterend', card);
  else settings.prepend(card);

  ui = {
    card,
    current: card.querySelector('#aiProjectCurrent'),
    provider: card.querySelector('#aiSwitchProvider'),
    model: card.querySelector('#aiSwitchModel'),
    keyRow: card.querySelector('#aiSwitchKeyRow'),
    key: card.querySelector('#aiSwitchKey'),
    keyToggle: card.querySelector('#aiSwitchKeyToggle'),
    base: card.querySelector('#aiSwitchBase'),
    freeNote: card.querySelector('#aiSwitchFreeNote'),
    rememberRow: card.querySelector('#aiSwitchRememberRow'),
    remember: card.querySelector('#aiSwitchRemember'),
    apply: card.querySelector('#aiSwitchApply'),
    status: card.querySelector('#aiSwitchStatus'),
    history: card.querySelector('#aiSwitchHistory')
  };

  ui.provider.innerHTML = Object.entries(PROVIDERS)
    .map(([key, provider]) => `<option value="${escapeHtml(key)}">${provider.freeTier ? '✦ ' : ''}${escapeHtml(provider.name)}</option>`)
    .join('');
}

function wire() {
  ui.provider.addEventListener('change', () => fillSwitchForm(ui.provider.value));
  ui.keyToggle.addEventListener('click', () => {
    ui.key.type = ui.key.type === 'password' ? 'text' : 'password';
    ui.keyToggle.textContent = ui.key.type === 'password' ? 'Show' : 'Hide';
  });
  ui.apply.addEventListener('click', switchProjectAI);

  E.provider?.addEventListener('change', async () => {
    await rememberProviderKey(lastGlobalProvider());
    await syncKeylessUI();
    const key = E.provider.value;
    if (PROVIDERS[key]?.requiresKey !== false) {
      const saved = await loadScopedKey(key);
      E.key.value = saved.key || '';
      E.remember.checked = saved.remembered;
    }
    setLastGlobalProvider(key);
  });

  // main.js treats every provider as BYOK. Intercept only the keyless free
  // preset so its synthetic config marker can never be persisted as a secret.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#saveProviderBtn');
    if (!button || PROVIDERS[E.provider?.value]?.requiresKey !== false) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveKeylessProviderSettings();
  }, true);

  E.saveProvider?.addEventListener('click', () => {
    if (PROVIDERS[E.provider?.value]?.requiresKey === false) return;
    setTimeout(() => rememberProviderKey(E.provider.value), 0);
  });
}

async function syncKeylessUI() {
  if (!E.provider) return;
  const provider = PROVIDERS[E.provider.value];
  const keyless = provider?.requiresKey === false;
  const keyLabel = E.key?.closest('label.wide') || E.key?.closest('label');
  if (keyLabel) keyLabel.hidden = keyless;
  const rememberLabel = E.remember?.closest('label');
  if (rememberLabel) rememberLabel.hidden = keyless;
  if (keyless) {
    E.key.value = '';
    E.badge.textContent = `${provider.name} · ${E.modelInput.value || provider.model}`;
    E.model.textContent = `${provider.name} · ${E.modelInput.value || provider.model}`;
    if (E.providerStatus && !E.providerStatus.textContent) status(E.providerStatus, 'Ready — no API key required. A Puter sign-in may appear on first use.', 'ok');
  }
}

async function saveKeylessProviderSettings() {
  const key = E.provider.value;
  const provider = PROVIDERS[key];
  if (!provider || provider.requiresKey !== false) return;
  const value = {
    provider: key,
    model: E.modelInput.value.trim() || provider.model,
    baseUrl: E.base.value.trim() || provider.baseUrl
  };
  try { localStorage.setItem(CFG, JSON.stringify(value)); } catch {}
  E.key.value = '';
  E.badge.textContent = `${provider.name} · ${value.model}`;
  E.model.textContent = `${provider.name} · ${value.model}`;
  status(E.providerStatus, 'AppGPT Free saved — no API key required.', 'ok');
  setLastGlobalProvider(key);
  success();
}

async function fillSwitchForm(providerKey) {
  const key = PROVIDERS[providerKey] ? providerKey : 'appgptFree';
  const provider = PROVIDERS[key];
  ui.provider.value = key;
  ui.model.value = provider.model || '';
  ui.base.value = provider.baseUrl || '';
  const keyless = provider.requiresKey === false;
  ui.keyRow.hidden = keyless;
  ui.rememberRow.hidden = keyless;
  ui.freeNote.hidden = !keyless;
  ui.key.value = '';
  if (!keyless) {
    const saved = await loadScopedKey(key);
    ui.key.value = saved.key || '';
    ui.remember.checked = saved.remembered;
  }
  setSwitchStatus(keyless ? 'Free AI is already connected. First use may ask the user to sign in to Puter.' : '');
}

async function switchProjectAI() {
  const key = ui.provider.value;
  const provider = PROVIDERS[key];
  const model = ui.model.value.trim() || provider?.model || '';
  const baseUrl = ui.base.value.trim() || provider?.baseUrl || '';
  const keyless = provider?.requiresKey === false;
  const apiKey = keyless ? '' : ui.key.value.trim();

  if (!provider || !model || !baseUrl) return setSwitchStatus('Choose a provider, model and Base URL.', 'error');
  if (!keyless && !apiKey) return setSwitchStatus('Add this provider’s API key first.', 'error');

  ui.apply.disabled = true;
  try {
    await rememberProviderKey(E.provider?.value);
    if (!keyless) await storeScopedKey(key, apiKey, ui.remember.checked);
    await activateProvider(key, model, baseUrl, apiKey, keyless ? false : ui.remember.checked);

    if (S.chat) {
      const now = new Date().toISOString();
      const from = projectAI() || { provider: '', providerName: 'Legacy / unknown AI', model: '' };
      const to = aiSnapshot(key, model, baseUrl, now);
      const changed = from.provider !== to.provider || from.model !== to.model || from.baseUrl !== to.baseUrl;
      if (changed) {
        S.chat.project = { ...(S.chat.project || {}) };
        S.chat.project.aiHistory = [
          ...(Array.isArray(S.chat.project.aiHistory) ? S.chat.project.aiHistory : []),
          { from: cleanAI(from), to: cleanAI(to), at: now, version: latest()?.version || 0 }
        ].slice(-20);
        S.chat.project.ai = to;
        S.chat.updatedAt = now;
        S.chat.messages = [...(S.chat.messages || []), {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'assistant',
          content: `AI handoff: ${aiName(from)} → ${aiName(to)}. No regeneration was needed; the current index.html and all saved versions were preserved.`,
          status: 'ready',
          ts: now
        }];
        await saveChat(S.chat);
      }
      activeChatId = S.chat.id;
      window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
      setSwitchStatus(`Project moved to ${provider.name}. Migration used 0 AI tokens.`, 'ok');
      toast(`Project AI → ${provider.name}`);
    } else {
      setSwitchStatus(`${provider.name} is now your default AI.`, 'ok');
      toast(`Default AI → ${provider.name}`);
    }
    success();
  } catch (error) {
    setSwitchStatus(error.message || 'Could not switch AI.', 'error');
  } finally {
    ui.apply.disabled = false;
    renderProjectAI();
  }
}

async function activateProvider(key, model, baseUrl, apiKey, remember) {
  applyingProjectAI = true;
  try {
    try { localStorage.setItem(CFG, JSON.stringify({ provider: key, model, baseUrl })); } catch {}
    E.provider.value = key;
    E.modelInput.value = model;
    E.base.value = baseUrl;
    if (PROVIDERS[key].requiresKey === false) {
      E.key.value = '';
    } else {
      E.key.value = apiKey || '';
      E.remember.checked = Boolean(remember);
      await saveApiKey(apiKey || '', Boolean(remember));
    }
    setLastGlobalProvider(key);
    await syncKeylessUI();
  } finally {
    applyingProjectAI = false;
  }
}

async function onChatChanged() {
  renderProjectAI();
  if (!S.chat?.id || S.chat.id === activeChatId || applyingProjectAI) return;
  activeChatId = S.chat.id;
  const ai = projectAI();
  if (!ai?.provider || !PROVIDERS[ai.provider]) return;
  const provider = PROVIDERS[ai.provider];
  let saved = { key: '', remembered: false };
  if (provider.requiresKey !== false) saved = await loadScopedKey(ai.provider);
  await activateProvider(ai.provider, ai.model || provider.model, ai.baseUrl || provider.baseUrl, saved.key, saved.remembered);
  await fillSwitchForm(ai.provider);
}

async function maybeStampProjectAI(detail) {
  if (stampingProjectAI || !S.chat || projectAI()) return;
  const phase = String(detail.phase || '');
  if (!detail.waiting || !/Generating with|Editing with|Repairing with/i.test(phase)) return;
  const key = E.provider?.value;
  if (!PROVIDERS[key]) return;
  stampingProjectAI = true;
  try {
    S.chat.project = { ...(S.chat.project || {}), ai: aiSnapshot(key, E.modelInput.value.trim(), E.base.value.trim()) };
    S.chat.updatedAt = new Date().toISOString();
    await saveChat(S.chat);
    renderProjectAI();
  } catch {} finally {
    stampingProjectAI = false;
  }
}

function renderProjectAI() {
  if (!ui) return;
  const ai = projectAI();
  if (!S.chat) {
    ui.current.innerHTML = '<div class="ai-project-icon">AI</div><div><strong>No project selected</strong><span>Choose a provider below to set the default.</span></div>';
    ui.history.innerHTML = '';
    return;
  }
  if (!ai) {
    ui.current.innerHTML = `<div class="ai-project-icon">?</div><div><strong>Legacy project · AI not recorded</strong><span>${latest() ? `Current app v${latest().version} is preserved.` : 'Saved draft.'} Pick any AI to take over.</span></div>`;
  } else {
    const p = PROVIDERS[ai.provider];
    ui.current.innerHTML = `<div class="ai-project-icon">${p?.requiresKey === false ? '✦' : 'AI'}</div><div><strong>${escapeHtml(aiName(ai))}</strong><span>${latest() ? `Current app v${latest().version}` : 'Saved draft'} · future edits use this AI</span></div>`;
  }
  const history = Array.isArray(S.chat.project?.aiHistory) ? S.chat.project.aiHistory.slice(-5).reverse() : [];
  ui.history.innerHTML = history.length
    ? `<strong>AI handoffs</strong>${history.map(item => `<span>${escapeHtml(aiName(item.from))} → ${escapeHtml(aiName(item.to))}${item.version ? ` · preserved v${item.version}` : ''}</span>`).join('')}`
    : '';
}

async function showFreeWarning(detail) {
  const message = detail.message || 'AppGPT Free hit a limit. Your project is saved. Switch AI to continue.';
  setSwitchStatus(message, 'error');
  if (tg?.showPopup) {
    try {
      tg.showPopup({
        title: 'AppGPT Free limit',
        message: 'Your project is saved. The free AI could not continue. You can wait and retry, or switch this project to another AI. No paid provider will be used automatically.',
        buttons: [
          { id: 'switch', type: 'default', text: 'Switch AI' },
          { id: 'later', type: 'cancel', text: 'Later' }
        ]
      }, id => { if (id === 'switch') openAISettings(); });
      return;
    } catch {}
  }
  if (window.confirm(`${message}\n\nOpen AI settings now?`)) openAISettings();
}

function showFreeFallback(detail) {
  const from = shortModel(detail.from);
  const to = shortModel(detail.to);
  window.dispatchEvent(new CustomEvent('appgpt-build-note', { detail: { text: `AppGPT Free fallback: ${from} was unavailable, continuing with ${to}.` } }));
  toast(`Free AI fallback → ${to}`);
}

function openAISettings() {
  document.querySelector('.nav-item[data-view="settings"]')?.click();
  setTimeout(() => ui?.card?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
}

async function seedCurrentKey() {
  const provider = E.provider?.value;
  if (!provider || PROVIDERS[provider]?.requiresKey === false) return;
  const existing = await loadScopedKey(provider);
  if (existing.key) return;
  try {
    const legacy = await loadApiKey();
    if (legacy.key) await storeScopedKey(provider, legacy.key, legacy.remembered);
  } catch {}
  setLastGlobalProvider(provider);
}

async function rememberProviderKey(provider) {
  if (!provider || !PROVIDERS[provider] || PROVIDERS[provider].requiresKey === false) return;
  if (E.provider?.value !== provider) return;
  const key = E.key?.value?.trim() || '';
  if (!key || key === '__APPGPT_KEYLESS__') return;
  await storeScopedKey(provider, key, Boolean(E.remember?.checked));
}

function scopedKey(provider) {
  return `${SCOPED_PREFIX}${String(provider || '').replace(/[^a-z0-9_-]/gi, '_')}`;
}

async function loadScopedKey(provider) {
  const keyName = scopedKey(provider);
  try {
    const session = sessionStorage.getItem(keyName);
    if (session) return { key: session, remembered: false };
  } catch {}
  if (tg?.isVersionAtLeast?.('9.0') && tg?.SecureStorage?.getItem) {
    try {
      const value = await secureCall('getItem', keyName);
      if (value) return { key: value, remembered: true };
    } catch {}
  }
  try {
    const value = localStorage.getItem(keyName) || '';
    if (value) return { key: value, remembered: true };
  } catch {}
  return { key: '', remembered: false };
}

async function storeScopedKey(provider, key, remember) {
  const keyName = scopedKey(provider);
  try { sessionStorage.setItem(keyName, key || ''); } catch {}
  if (!remember) {
    try { localStorage.removeItem(keyName); } catch {}
    if (tg?.isVersionAtLeast?.('9.0') && tg?.SecureStorage?.removeItem) {
      try { await secureCall('removeItem', keyName); } catch {}
    }
    return;
  }
  if (tg?.isVersionAtLeast?.('9.0') && tg?.SecureStorage?.setItem) {
    try {
      await secureCall('setItem', keyName, key || '');
      try { localStorage.removeItem(keyName); } catch {}
      return;
    } catch {}
  }
  try { localStorage.setItem(keyName, key || ''); } catch {}
}

function secureCall(method, ...args) {
  return new Promise((resolve, reject) => {
    try { tg.SecureStorage[method](...args, (error, value) => error ? reject(new Error(String(error))) : resolve(value)); }
    catch (error) { reject(error); }
  });
}

function aiSnapshot(provider, model, baseUrl, updatedAt = new Date().toISOString()) {
  return { provider, providerName: PROVIDERS[provider]?.name || provider, model, baseUrl, updatedAt };
}

function cleanAI(ai) {
  if (!ai) return null;
  return { provider: ai.provider || '', providerName: ai.providerName || PROVIDERS[ai.provider]?.name || 'Unknown AI', model: ai.model || '', baseUrl: ai.baseUrl || '' };
}

function projectAI() { return S.chat?.project?.ai || null; }
function aiName(ai) { return `${ai?.providerName || PROVIDERS[ai?.provider]?.name || 'Unknown AI'}${ai?.model ? ` (${ai.model})` : ''}`; }
function shortModel(value = '') { return String(value).split('/').pop() || value; }
function setSwitchStatus(text, kind = '') { if (ui?.status) status(ui.status, text, kind); }
function setLastGlobalProvider(value) { try { sessionStorage.setItem('appgpt_last_provider', value || ''); } catch {} }
function lastGlobalProvider() { try { return sessionStorage.getItem('appgpt_last_provider') || E.provider?.value || ''; } catch { return E.provider?.value || ''; } }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
