const DB_NAME = 'AppGPTDB';
const DB_VERSION = 2;
const CHAT_STORE = 'chats';
const TEMPLATE_STORE = 'templates';
const LAST_CHAT_KEY = 'appgpt_last_chat';
const API_KEY_KEY = 'appgpt_provider_key';
const GH_TOKEN_KEY = 'appgpt_github_token';
const CHAT_BACKUP_KEY = 'appgpt_chat_backup_v1';
const BACKUP_VERSION = 1;
const BACKUP_LIMIT_BYTES = 4.2 * 1024 * 1024;
const tg = window.Telegram?.WebApp;
const supportsV9 = !!tg?.isVersionAtLeast?.('9.0');
let persistRequested = false;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        const chats = db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
        chats.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
        const templates = db.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
        templates.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open local database'));
  });
}

async function put(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(clone(value));
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save local data')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Local save was aborted')); };
  });
}

async function get(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    req.onsuccess = () => { const value = req.result || null; db.close(); resolve(value); };
    req.onerror = () => { db.close(); reject(req.error || new Error('Could not read local data')); };
  });
}

async function getAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => { const value = req.result || []; db.close(); resolve(value); };
    req.onerror = () => { db.close(); reject(req.error || new Error('Could not read local data')); };
  });
}

async function remove(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not delete local data')); };
  });
}

export async function saveChat(chat) {
  if (!chat?.id) throw new Error('Cannot save a chat without an id.');
  requestPersistentBrowserStorage();

  let indexedDbSaved = false;
  let backupSaved = false;
  try {
    await put(CHAT_STORE, chat);
    indexedDbSaved = true;
  } catch (error) {
    console.warn('AppGPT IndexedDB save failed; using fallback backup.', error);
  }

  try {
    backupSaved = await backupChat(chat);
  } catch (error) {
    console.warn('AppGPT fallback chat backup failed.', error);
  }

  await setLastChatId(chat.id);
  if (!indexedDbSaved && !backupSaved) throw new Error('AppGPT could not save this chat on this device.');
  return chat;
}

export async function getChat(id) {
  if (!id) return null;
  try {
    const value = await get(CHAT_STORE, id);
    if (value) return value;
  } catch (error) {
    console.warn('AppGPT IndexedDB read failed; checking fallback backup.', error);
  }

  const backup = await readBackupEnvelope();
  const recovered = backup.chats.find(chat => chat.id === id) || null;
  if (recovered) {
    try { await put(CHAT_STORE, recovered); } catch {}
    return clone(recovered);
  }
  return null;
}

export async function listChats() {
  let indexed = [];
  try { indexed = await getAll(CHAT_STORE); }
  catch (error) { console.warn('AppGPT IndexedDB list failed; using fallback backup.', error); }

  const backup = await readBackupEnvelope();
  const merged = new Map();
  for (const chat of [...backup.chats, ...indexed]) {
    if (!chat?.id) continue;
    const existing = merged.get(chat.id);
    if (!existing || timestamp(chat.updatedAt) >= timestamp(existing.updatedAt)) merged.set(chat.id, chat);
  }

  const rows = [...merged.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
  if (rows.length && indexed.length < rows.length) {
    for (const chat of rows) {
      if (!indexed.some(local => local.id === chat.id)) {
        try { await put(CHAT_STORE, chat); } catch {}
      }
    }
  }
  return rows;
}

export async function deleteChat(id) {
  try { await remove(CHAT_STORE, id); } catch {}
  await removeBackupChat(id);
  if (await getLastChatId() === id) await setLastChatId('');
}

export const saveCustomTemplate = template => put(TEMPLATE_STORE, template);
export const getCustomTemplate = id => get(TEMPLATE_STORE, id);
export async function listCustomTemplates() {
  try {
    const rows = await getAll(TEMPLATE_STORE);
    return rows.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
  } catch { return []; }
}
export async function deleteCustomTemplate(id) { try { await remove(TEMPLATE_STORE, id); } catch {} }

export async function setLastChatId(id) {
  try { localStorage.setItem(LAST_CHAT_KEY, id || ''); } catch {}
  if (supportsV9 && tg?.DeviceStorage?.setItem) {
    try { await tgDevice('setItem', LAST_CHAT_KEY, id || ''); } catch {}
  }
}

export async function getLastChatId() {
  if (supportsV9 && tg?.DeviceStorage?.getItem) {
    try {
      const value = await tgDevice('getItem', LAST_CHAT_KEY);
      if (value) return value;
    } catch {}
  }
  try {
    const value = localStorage.getItem(LAST_CHAT_KEY) || '';
    if (value) return value;
  } catch {}
  const backup = await readBackupEnvelope();
  return backup.chats[0]?.id || '';
}

export async function saveApiKey(key, remember) {
  try { sessionStorage.setItem(API_KEY_KEY, key || ''); } catch {}
  if (!remember) {
    try { localStorage.removeItem(API_KEY_KEY); } catch {}
    if (supportsV9 && tg?.SecureStorage?.removeItem) {
      try { await tgSecure('removeItem', API_KEY_KEY); } catch {}
    }
    return;
  }
  if (supportsV9 && tg?.SecureStorage?.setItem) {
    try {
      await tgSecure('setItem', API_KEY_KEY, key || '');
      try { localStorage.removeItem(API_KEY_KEY); } catch {}
      return;
    } catch {}
  }
  try { localStorage.setItem(API_KEY_KEY, key || ''); } catch {}
}

export async function loadApiKey() {
  try {
    const session = sessionStorage.getItem(API_KEY_KEY);
    if (session) return { key: session, remembered: false };
  } catch {}
  if (supportsV9 && tg?.SecureStorage?.getItem) {
    try {
      const value = await tgSecure('getItem', API_KEY_KEY);
      if (value) return { key: value, remembered: true };
    } catch {}
  }
  try {
    const local = localStorage.getItem(API_KEY_KEY) || '';
    return { key: local, remembered: Boolean(local) };
  } catch { return { key: '', remembered: false }; }
}

export function saveGithubToken(token) { try { sessionStorage.setItem(GH_TOKEN_KEY, token || ''); } catch {} }
export function loadGithubToken() { try { return sessionStorage.getItem(GH_TOKEN_KEY) || ''; } catch { return ''; } }
export function clearGithubToken() { try { sessionStorage.removeItem(GH_TOKEN_KEY); } catch {} }

async function backupChat(chat) {
  const current = await readBackupEnvelope();
  const map = new Map(current.chats.map(item => [item.id, item]));
  map.set(chat.id, clone(chat));
  const envelope = fitBackup([...map.values()]);
  return writeBackupEnvelope(envelope);
}

async function removeBackupChat(id) {
  const current = await readBackupEnvelope();
  const envelope = fitBackup(current.chats.filter(chat => chat.id !== id));
  await writeBackupEnvelope(envelope);
}

function fitBackup(chats) {
  const sorted = chats.filter(Boolean).sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
  const plans = [
    { chats: 12, artifacts: 3, messages: 90 },
    { chats: 10, artifacts: 2, messages: 70 },
    { chats: 8, artifacts: 1, messages: 50 },
    { chats: 5, artifacts: 1, messages: 35 },
    { chats: 3, artifacts: 1, messages: 25 },
    { chats: 1, artifacts: 1, messages: 20 }
  ];

  for (const plan of plans) {
    const compacted = sorted.slice(0, plan.chats).map(chat => compactChat(chat, plan.artifacts, plan.messages));
    const envelope = { v: BACKUP_VERSION, savedAt: new Date().toISOString(), chats: compacted };
    if (byteLength(JSON.stringify(envelope)) <= BACKUP_LIMIT_BYTES) return envelope;
  }

  const newest = sorted[0];
  if (!newest) return { v: BACKUP_VERSION, savedAt: new Date().toISOString(), chats: [] };
  const metadataOnly = compactChat(newest, 0, 12);
  metadataOnly.backupWarning = 'Latest HTML was too large for the emergency backup.';
  return { v: BACKUP_VERSION, savedAt: new Date().toISOString(), chats: [metadataOnly] };
}

function compactChat(chat, artifactCount, messageCount) {
  const copy = clone(chat);
  copy.messages = (copy.messages || []).slice(-messageCount);
  copy.artifacts = artifactCount > 0 ? (copy.artifacts || []).slice(-artifactCount) : [];
  const latestId = copy.project?.latestArtifactId;
  if (copy.artifacts.length && latestId && !copy.artifacts.some(a => a.id === latestId)) {
    const latestArtifact = (chat.artifacts || []).find(a => a.id === latestId);
    if (latestArtifact) copy.artifacts[copy.artifacts.length - 1] = clone(latestArtifact);
  }
  const actualLatest = copy.artifacts.at(-1) || null;
  copy.project = {
    ...(copy.project || {}),
    html: '',
    latestArtifactId: actualLatest?.id || null
  };
  return copy;
}

async function readBackupEnvelope() {
  const candidates = [];
  try {
    const raw = localStorage.getItem(CHAT_BACKUP_KEY);
    const parsed = parseBackup(raw);
    if (parsed) candidates.push(parsed);
  } catch {}

  if (supportsV9 && tg?.DeviceStorage?.getItem) {
    try {
      const raw = await tgDevice('getItem', CHAT_BACKUP_KEY);
      const parsed = parseBackup(raw);
      if (parsed) candidates.push(parsed);
    } catch {}
  }

  if (!candidates.length) return { v: BACKUP_VERSION, savedAt: '', chats: [] };
  const merged = new Map();
  for (const envelope of candidates) {
    for (const chat of envelope.chats || []) {
      const existing = merged.get(chat.id);
      if (!existing || timestamp(chat.updatedAt) >= timestamp(existing.updatedAt)) merged.set(chat.id, chat);
    }
  }
  return {
    v: BACKUP_VERSION,
    savedAt: candidates.sort((a, b) => timestamp(b.savedAt) - timestamp(a.savedAt))[0]?.savedAt || '',
    chats: [...merged.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))
  };
}

async function writeBackupEnvelope(envelope) {
  const raw = JSON.stringify(envelope);
  let wrote = false;
  try { localStorage.setItem(CHAT_BACKUP_KEY, raw); wrote = true; } catch {}
  if (supportsV9 && tg?.DeviceStorage?.setItem) {
    try { await tgDevice('setItem', CHAT_BACKUP_KEY, raw); wrote = true; } catch (error) {
      console.warn('Telegram DeviceStorage chat backup failed.', error);
    }
  }
  return wrote;
}

function parseBackup(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.v !== BACKUP_VERSION || !Array.isArray(value.chats)) return null;
    return value;
  } catch { return null; }
}

function requestPersistentBrowserStorage() {
  if (persistRequested) return;
  persistRequested = true;
  try { navigator.storage?.persist?.().catch?.(() => {}); } catch {}
}

function tgDevice(method, ...args) {
  return new Promise((resolve, reject) => {
    try { tg.DeviceStorage[method](...args, (err, value) => err ? reject(new Error(String(err))) : resolve(value)); }
    catch (error) { reject(error); }
  });
}

function tgSecure(method, ...args) {
  return new Promise((resolve, reject) => {
    try { tg.SecureStorage[method](...args, (err, value) => err ? reject(new Error(String(err))) : resolve(value)); }
    catch (error) { reject(error); }
  });
}

function byteLength(value) {
  try { return new TextEncoder().encode(value).byteLength; }
  catch { return value.length * 2; }
}

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function clone(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}
