import { S, tg, toast, haptic } from './app-state.js';
import { listChats, saveChat, getChat, getLastChatId, setLastChatId, saveApiKey } from './storage.js';

const SYNC_API = '/api/appgpt/sync';
const CFG = 'appgpt_provider_config';
const LOCAL_AUTO = 'appgpt_tg_account_sync';
const LOCAL_KEYS = 'appgpt_tg_key_sync';
const LOCAL_BIO = 'appgpt_tg_biometric_lock';
const CLOUD_AUTO = 'appgpt_sync_enabled';
const CLOUD_KEYS = 'appgpt_key_sync';
const CLOUD_BIO = 'appgpt_biometric_lock';
let ui = null;
let applying = false;
let syncTimer = null;
let lastManagerBot = null;

requestAnimationFrame(init);

async function init() {
  loadCss();
  const settings = document.querySelector('#view-settings .settings-card');
  if (!settings || document.getElementById('telegramAccountCard')) return;
  mount(settings);
  wire();

  const user = tg?.initDataUnsafe?.user;
  const signedIn = Boolean(tg?.initData && user?.id);
  renderIdentity(user, signedIn);
  renderCapabilities();

  if (!signedIn) {
    setStatus('Open AppGPT from its Telegram bot to sign in automatically. Browser mode keeps data only on this device.');
    disableSyncControls(true);
    return;
  }

  const prefs = await readPreferences();
  ui.auto.checked = prefs.auto;
  ui.keys.checked = prefs.keys;
  ui.bio.checked = prefs.bio;
  disableSyncControls(false);

  window.addEventListener('appgpt-chat-changed', schedulePush);
  window.addEventListener('appgpt-theme-changed', schedulePush);
  document.getElementById('saveProviderBtn')?.addEventListener('click', () => setTimeout(schedulePush, 350));

  if (ui.auto.checked) {
    setStatus('Telegram recognized you. Checking your AppGPT cloud vault…');
    await pull({ silent: true });
  } else {
    setStatus('Telegram auto-login is active. Cloud project sync is currently off.', 'ok');
  }
}

function loadCss() {
  if (document.querySelector('link[data-telegram-account-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './telegram-account.css';
  link.dataset.telegramAccountCss = 'true';
  document.head.append(link);
}

function mount(settings) {
  const card = document.createElement('section');
  card.id = 'telegramAccountCard';
  card.className = 'telegram-account-card';
  card.innerHTML = `
    <div class="telegram-account-head">
      <div class="telegram-account-user">
        <div class="telegram-account-avatar" id="telegramAccountAvatar">T</div>
        <div><strong id="telegramAccountName">Telegram account</strong><span id="telegramAccountMeta">Checking Telegram…</span></div>
      </div>
      <span class="telegram-account-badge" id="telegramAccountBadge">Auto login</span>
    </div>
    <div class="telegram-sync-grid">
      <label class="telegram-sync-toggle"><input id="telegramAutoSync" type="checkbox"><span><strong>Sync projects across Telegram devices</strong><span>Uses your validated Telegram identity and an encrypted AppGPT vault. Local IndexedDB remains the fast offline cache.</span></span></label>
      <label class="telegram-sync-toggle"><input id="telegramKeySync" type="checkbox"><span><strong>Sync my AI API key securely</strong><span>Off by default. When enabled, the key is encrypted before storage in the AppGPT server vault and is also kept in Telegram SecureStorage on supported devices.</span></span></label>
      <label class="telegram-sync-toggle"><input id="telegramBiometricLock" type="checkbox"><span><strong>Require Telegram biometric unlock before restoring a synced key</strong><span>Uses Telegram BiometricManager when your device supports it.</span></span></label>
    </div>
    <div class="telegram-account-actions">
      <button class="primary" id="telegramSyncNow" type="button">↻ Sync now</button>
      <button id="telegramRestoreCloud" type="button">↓ Restore cloud copy</button>
      <button id="telegramClearCloud" type="button">Clear cloud copy</button>
    </div>
    <div class="telegram-native-actions">
      <button id="telegramWriteAccess" type="button">Allow bot messages</button>
      <button id="telegramHomeScreen" type="button">Add to Home Screen</button>
      <button id="telegramFullscreen" type="button">Fullscreen</button>
      <button id="telegramCreateBot" type="button" hidden>Create my bot</button>
    </div>
    <div class="telegram-capabilities" id="telegramCapabilities"></div>
    <div class="telegram-sync-status" id="telegramSyncStatus"></div>
    <p class="telegram-account-note">Telegram itself provides <code>CloudStorage</code>, <code>DeviceStorage</code>, and encrypted <code>SecureStorage</code>. Full project files and cross-device secret sync use AppGPT's encrypted account vault because Telegram CloudStorage values are intentionally small.</p>`;
  const head = settings.querySelector('.panel-head');
  if (head) head.insertAdjacentElement('afterend', card); else settings.prepend(card);

  ui = {
    card,
    avatar: card.querySelector('#telegramAccountAvatar'),
    name: card.querySelector('#telegramAccountName'),
    meta: card.querySelector('#telegramAccountMeta'),
    badge: card.querySelector('#telegramAccountBadge'),
    auto: card.querySelector('#telegramAutoSync'),
    keys: card.querySelector('#telegramKeySync'),
    bio: card.querySelector('#telegramBiometricLock'),
    sync: card.querySelector('#telegramSyncNow'),
    restore: card.querySelector('#telegramRestoreCloud'),
    clear: card.querySelector('#telegramClearCloud'),
    write: card.querySelector('#telegramWriteAccess'),
    home: card.querySelector('#telegramHomeScreen'),
    fullscreen: card.querySelector('#telegramFullscreen'),
    createBot: card.querySelector('#telegramCreateBot'),
    caps: card.querySelector('#telegramCapabilities'),
    status: card.querySelector('#telegramSyncStatus')
  };
}

function wire() {
  ui.auto.addEventListener('change', async () => {
    await savePreference(CLOUD_AUTO, LOCAL_AUTO, ui.auto.checked);
    if (ui.auto.checked) await push({ manual: true });
    else setStatus('Project cloud sync disabled. Local projects are unchanged.', 'ok');
  });
  ui.keys.addEventListener('change', async () => {
    await savePreference(CLOUD_KEYS, LOCAL_KEYS, ui.keys.checked);
    if (ui.keys.checked && ui.auto.checked) await push({ manual: true });
    else setStatus(ui.keys.checked ? 'API key sync will start when project sync is enabled.' : 'Cross-device API key sync disabled. Telegram SecureStorage may still remember the key on this device.', 'ok');
  });
  ui.bio.addEventListener('change', async () => {
    if (ui.bio.checked) {
      const ok = await authenticateBiometric('Enable biometric protection for synced API keys');
      if (!ok) ui.bio.checked = false;
    }
    await savePreference(CLOUD_BIO, LOCAL_BIO, ui.bio.checked);
  });
  ui.sync.addEventListener('click', () => push({ manual: true }));
  ui.restore.addEventListener('click', () => pull({ manual: true, force: true }));
  ui.clear.addEventListener('click', clearCloud);
  ui.write.addEventListener('click', requestWriteAccess);
  ui.home.addEventListener('click', addHomeScreen);
  ui.fullscreen.addEventListener('click', toggleFullscreen);
  ui.createBot.addEventListener('click', openManagedBotCreator);
}

function renderIdentity(user, signedIn) {
  if (!signedIn) {
    ui.name.textContent = 'Telegram not connected';
    ui.meta.textContent = 'Open from the AppGPT bot for automatic sign-in';
    ui.badge.textContent = 'Browser mode';
    ui.badge.classList.remove('online');
    return;
  }
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Telegram user';
  ui.name.textContent = name;
  ui.meta.textContent = user.username ? `@${user.username} · Telegram ID ${user.id}` : `Telegram ID ${user.id}`;
  ui.badge.textContent = user.is_premium ? 'Auto login · Premium' : 'Auto login';
  ui.badge.classList.add('online');
  if (user.photo_url) {
    const img = document.createElement('img');
    img.src = user.photo_url;
    img.alt = '';
    img.className = 'telegram-account-avatar';
    ui.avatar.replaceWith(img);
    ui.avatar = img;
  } else {
    ui.avatar.textContent = (user.first_name || 'T').slice(0, 1).toUpperCase();
  }
}

function renderCapabilities() {
  if (!ui) return;
  const caps = [];
  if (tg?.CloudStorage) caps.push('CloudStorage');
  if (tg?.DeviceStorage) caps.push('DeviceStorage');
  if (tg?.SecureStorage) caps.push('SecureStorage');
  if (tg?.BiometricManager) caps.push('Biometrics');
  if (tg?.requestFullscreen) caps.push('Fullscreen');
  if (tg?.addToHomeScreen) caps.push('Home Screen');
  if (tg?.requestWriteAccess) caps.push('Write access');
  if (tg?.shareMessage) caps.push('ShareMessage');
  if (tg?.downloadFile) caps.push('Native download');
  if (tg?.requestChat) caps.push('RequestChat 9.6');
  ui.caps.innerHTML = caps.length ? caps.map(x => `<span>${escapeHtml(x)}</span>`).join('') : '<span>Browser fallback</span>';
  ui.write.hidden = !tg?.requestWriteAccess;
  ui.home.hidden = !tg?.addToHomeScreen;
  ui.fullscreen.hidden = !tg?.requestFullscreen;
}

async function readPreferences() {
  return {
    auto: await readPreference(CLOUD_AUTO, LOCAL_AUTO, true),
    keys: await readPreference(CLOUD_KEYS, LOCAL_KEYS, false),
    bio: await readPreference(CLOUD_BIO, LOCAL_BIO, false)
  };
}

async function readPreference(cloudKey, localKey, fallback) {
  try {
    if (tg?.CloudStorage?.getItem) {
      const value = await cloudGet(cloudKey);
      if (value === '1' || value === '0') {
        localStorage.setItem(localKey, value);
        return value === '1';
      }
    }
  } catch {}
  const local = localStorage.getItem(localKey);
  return local === null ? fallback : local === '1';
}

async function savePreference(cloudKey, localKey, enabled) {
  const value = enabled ? '1' : '0';
  localStorage.setItem(localKey, value);
  try { if (tg?.CloudStorage?.setItem) await cloudSet(cloudKey, value); } catch {}
}

function schedulePush() {
  if (applying || !ui?.auto?.checked || !tg?.initData) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => push({ manual: false }), 1800);
}

async function push({ manual = false } = {}) {
  if (!tg?.initData) return manual && setStatus('Open AppGPT inside Telegram to use account sync.', 'error');
  if (!ui.auto.checked) return manual && setStatus('Turn on project sync first.', 'error');
  if (applying) return;
  setBusy(true);
  if (manual) setStatus('Preparing projects for encrypted sync…');
  try {
    const data = await collectSyncData();
    const response = await syncRequest('push', { data });
    setStatus(`Synced to your Telegram account${response.updatedAt ? ` · ${formatTime(response.updatedAt)}` : ''}.`, 'ok');
    haptic('light');
  } catch (error) {
    setStatus(error.message || 'Sync failed', 'error');
  } finally {
    setBusy(false);
  }
}

async function pull({ manual = false, force = false, silent = false } = {}) {
  if (!tg?.initData) return manual && setStatus('Open AppGPT inside Telegram to use account sync.', 'error');
  setBusy(true);
  if (!silent) setStatus('Restoring your encrypted Telegram account data…');
  try {
    const response = await syncRequest('pull', { includeSecrets: Boolean(ui.keys.checked) });
    lastManagerBot = response.managerBot || lastManagerBot;
    updateManagedBotButton();
    if (!response.data) {
      setStatus('Telegram auto-login is ready. No cloud project copy exists yet; your next edit will create one.', 'ok');
      if (ui.auto.checked && force) await push({ manual: false });
      return;
    }
    await applyRemoteData(response.data, { force });
    setStatus(`Restored your AppGPT account${response.updatedAt ? ` · cloud ${formatTime(response.updatedAt)}` : ''}.`, 'ok');
    haptic('selection');
  } catch (error) {
    const configured = !/not configured/i.test(error.message || '');
    setStatus(configured ? (error.message || 'Restore failed') : 'Telegram auto-login works, but cross-device vault setup is not finished on the server yet.', configured ? 'error' : '');
  } finally {
    setBusy(false);
  }
}

async function collectSyncData() {
  const chats = compactChats(await listChats());
  let provider = {};
  try { provider = JSON.parse(localStorage.getItem(CFG) || '{}') || {}; } catch {}
  provider = {
    provider: provider.provider || document.getElementById('providerSelect')?.value || '',
    model: provider.model || document.getElementById('modelInput')?.value || '',
    baseUrl: provider.baseUrl || document.getElementById('baseUrlInput')?.value || ''
  };
  if (ui.keys.checked) provider.apiKey = document.getElementById('apiKeyInput')?.value?.trim() || '';
  return {
    v: 1,
    lastChatId: await getLastChatId(),
    provider,
    chats,
    preferences: { theme: localStorage.getItem('appgpt_theme') || 'dark' },
    clientUpdatedAt: new Date().toISOString()
  };
}

function compactChats(chats) {
  const rows = chats.slice(0, 60).map(chat => ({
    ...chat,
    messages: (chat.messages || []).slice(-120),
    artifacts: (chat.artifacts || []).slice(-8),
    project: { ...(chat.project || {}), html: '' }
  }));
  let text = JSON.stringify(rows);
  if (new TextEncoder().encode(text).byteLength <= 5 * 1024 * 1024) return rows;
  const smaller = rows.slice(0, 35).map(chat => ({ ...chat, messages: (chat.messages || []).slice(-70), artifacts: (chat.artifacts || []).slice(-3) }));
  text = JSON.stringify(smaller);
  if (new TextEncoder().encode(text).byteLength <= 5 * 1024 * 1024) return smaller;
  return smaller.slice(0, 20).map(chat => ({ ...chat, messages: (chat.messages || []).slice(-35), artifacts: (chat.artifacts || []).slice(-1) }));
}

async function applyRemoteData(data, { force = false } = {}) {
  applying = true;
  try {
    const localById = new Map((await listChats()).map(chat => [chat.id, chat]));
    for (const remote of Array.isArray(data.chats) ? data.chats : []) {
      const local = localById.get(remote.id);
      const remoteTime = new Date(remote.updatedAt || 0).getTime();
      const localTime = new Date(local?.updatedAt || 0).getTime();
      if (force || !local || remoteTime > localTime) await saveChat(remote);
    }

    if (data.lastChatId) {
      await setLastChatId(data.lastChatId);
      const active = await getChat(data.lastChatId);
      if (active) S.chat = active;
    }

    if (data.provider?.provider) {
      localStorage.setItem(CFG, JSON.stringify({ provider: data.provider.provider, model: data.provider.model || '', baseUrl: data.provider.baseUrl || '' }));
      const providerEl = document.getElementById('providerSelect');
      const modelEl = document.getElementById('modelInput');
      const baseEl = document.getElementById('baseUrlInput');
      if (providerEl) providerEl.value = data.provider.provider;
      if (modelEl) modelEl.value = data.provider.model || '';
      if (baseEl) baseEl.value = data.provider.baseUrl || '';
    }

    if (ui.keys.checked && data.provider?.apiKey) {
      let allowed = true;
      if (ui.bio.checked) allowed = await authenticateBiometric('Unlock your synced AppGPT API key');
      if (allowed) {
        const keyEl = document.getElementById('apiKeyInput');
        const remember = document.getElementById('rememberKey');
        if (keyEl) keyEl.value = data.provider.apiKey;
        if (remember) remember.checked = true;
        await saveApiKey(data.provider.apiKey, true);
      } else {
        toast('Projects restored; API key stayed locked');
      }
    }

    document.getElementById('saveProviderBtn')?.click();
    window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
  } finally {
    applying = false;
  }
}

async function syncRequest(operation, extra = {}) {
  const response = await fetch(SYNC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData, operation, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Account sync failed (${response.status})`);
  if (data.managerBot) {
    lastManagerBot = data.managerBot;
    updateManagedBotButton();
  }
  return data;
}

async function clearCloud() {
  if (!tg?.initData) return;
  const yes = await confirmTelegram('Clear AppGPT cloud copy?', 'This removes the encrypted server copy for your Telegram account. Projects already stored on this device stay here.');
  if (!yes) return;
  setBusy(true);
  try {
    await syncRequest('clear');
    setStatus('Encrypted cloud copy cleared. Local projects were not deleted.', 'ok');
  } catch (error) { setStatus(error.message, 'error'); }
  finally { setBusy(false); }
}

async function requestWriteAccess() {
  try {
    tg.requestWriteAccess(granted => setStatus(granted ? 'Bot messaging permission enabled.' : 'Bot messaging permission was not granted.', granted ? 'ok' : ''));
  } catch (error) { setStatus(error.message || 'Write access is unavailable.', 'error'); }
}

function addHomeScreen() {
  try { tg.addToHomeScreen(); setStatus('Telegram opened the Add to Home Screen flow.', 'ok'); }
  catch (error) { setStatus(error.message || 'Home screen shortcuts are unavailable.', 'error'); }
}

function toggleFullscreen() {
  try {
    if (tg.isFullscreen && tg.exitFullscreen) tg.exitFullscreen(); else tg.requestFullscreen?.();
  } catch (error) { setStatus(error.message || 'Fullscreen is unavailable.', 'error'); }
}

function updateManagedBotButton() {
  if (!ui?.createBot) return;
  ui.createBot.hidden = !(lastManagerBot?.canManageBots && lastManagerBot?.username);
}

function openManagedBotCreator() {
  if (!lastManagerBot?.username) return setStatus('Bot Management Mode is not enabled yet.', 'error');
  const url = `https://t.me/newbot/${encodeURIComponent(lastManagerBot.username)}?name=${encodeURIComponent('My AppGPT Bot')}`;
  try { tg?.openTelegramLink?.(url); }
  catch { location.href = url; }
}

async function authenticateBiometric(reason) {
  const manager = tg?.BiometricManager;
  if (!manager || !tg?.isVersionAtLeast?.('7.2')) {
    setStatus('Telegram biometrics are not supported on this device.', 'error');
    return false;
  }
  try {
    await biometricCall(manager, 'init');
    if (!manager.isBiometricAvailable) {
      setStatus('No Telegram-supported biometric method is available on this device.', 'error');
      return false;
    }
    if (!manager.isAccessGranted) {
      const granted = await biometricAccess(manager, reason);
      if (!granted) return false;
    }
    const ok = await biometricAuthenticate(manager, reason);
    setStatus(ok ? 'Biometric check passed.' : 'Biometric check was cancelled.', ok ? 'ok' : '');
    return ok;
  } catch (error) {
    setStatus(error.message || 'Biometric authentication failed.', 'error');
    return false;
  }
}

function biometricCall(manager, method) {
  return new Promise((resolve, reject) => {
    try { manager[method]((...args) => resolve(args)); } catch (error) { reject(error); }
  });
}
function biometricAccess(manager, reason) {
  return new Promise((resolve, reject) => {
    try { manager.requestAccess({ reason: String(reason).slice(0, 128) }, granted => resolve(Boolean(granted))); } catch (error) { reject(error); }
  });
}
function biometricAuthenticate(manager, reason) {
  return new Promise((resolve, reject) => {
    try { manager.authenticate({ reason: String(reason).slice(0, 128) }, success => resolve(Boolean(success))); } catch (error) { reject(error); }
  });
}

function confirmTelegram(title, message) {
  if (tg?.showPopup) return new Promise(resolve => {
    try {
      tg.showPopup({ title, message, buttons: [{ id: 'yes', type: 'destructive', text: 'Clear' }, { id: 'no', type: 'cancel' }] }, id => resolve(id === 'yes'));
    } catch { resolve(window.confirm(`${title}\n\n${message}`)); }
  });
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}

function cloudGet(key) {
  return new Promise((resolve, reject) => {
    try { tg.CloudStorage.getItem(key, (err, value) => err ? reject(new Error(String(err))) : resolve(value || '')); }
    catch (error) { reject(error); }
  });
}
function cloudSet(key, value) {
  return new Promise((resolve, reject) => {
    try { tg.CloudStorage.setItem(key, value, (err, stored) => err ? reject(new Error(String(err))) : resolve(stored)); }
    catch (error) { reject(error); }
  });
}

function disableSyncControls(disabled) {
  [ui.auto, ui.keys, ui.bio, ui.sync, ui.restore, ui.clear].forEach(el => { if (el) el.disabled = disabled; });
}
function setBusy(busy) {
  [ui.sync, ui.restore, ui.clear].forEach(el => { if (el) el.disabled = busy; });
  ui.sync.textContent = busy ? 'Syncing…' : '↻ Sync now';
}
function setStatus(text, kind = '') {
  if (!ui?.status) return;
  ui.status.textContent = text || '';
  ui.status.className = `telegram-sync-status ${kind}`;
}
function formatTime(value) {
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
  catch { return String(value); }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
