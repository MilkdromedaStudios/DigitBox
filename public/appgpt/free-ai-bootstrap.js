import { PROVIDERS } from './providers.js';
import { E, toast } from './app-state.js';

// AppGPT Free intentionally falls back only among models that Puter currently
// exposes at $0 input / $0 output. A paid/BYOK provider is never selected
// automatically when these models are unavailable or rate-limited.
const FREE_MODELS = [
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'liquid/lfm-2.5-2.6b:free'
];

const provider = PROVIDERS.appgptFree;
let puterReady = null;
let authRunning = false;
let replaying = false;

if (provider) {
  provider.model = FREE_MODELS[0];
  provider.fallbackModels = FREE_MODELS.slice(1);
  provider.freeTier = true;
  provider.requiresKey = false;
  provider.freeLabel = 'No API key · $0 hosted fallback chain';
  provider.hint = 'Already connected · free coding model with automatic $0 fallbacks';
}

migrateSavedFreePreset();
preloadPuter();
syncLivePreset();
wireFreeLock();
wireFirstUseGate();

function migrateSavedFreePreset() {
  try {
    const key = 'appgpt_provider_config';
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || saved.provider !== 'appgptFree') return;
    if (!FREE_MODELS.includes(saved.model)) saved.model = FREE_MODELS[0];
    saved.baseUrl = 'puter://ai';
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {}
}

function wireFreeLock() {
  E.provider?.addEventListener('change', () => setTimeout(syncLivePreset, 0));
  E.modelInput?.addEventListener('change', syncLivePreset);
  E.base?.addEventListener('change', syncLivePreset);
  setTimeout(syncLivePreset, 120);
  setTimeout(syncLivePreset, 700);
}

function syncLivePreset() {
  const free = isFreeSelected();
  if (E.modelInput) E.modelInput.readOnly = free;
  if (E.base) E.base.readOnly = free;
  if (!free) return;
  E.modelInput.value = FREE_MODELS[0];
  E.base.value = 'puter://ai';
  if (E.key) E.key.value = '';
  if (E.badge) E.badge.textContent = `AppGPT Free · ${FREE_MODELS[0]}`;
  if (E.model) E.model.textContent = `AppGPT Free · ${FREE_MODELS[0]}`;
}

function preloadPuter() {
  if (window.puter?.ai?.chat) {
    puterReady = Promise.resolve(window.puter);
    return puterReady;
  }
  if (puterReady) return puterReady;
  puterReady = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-appgpt-puter]');
    if (existing) {
      if (window.puter?.ai?.chat) return resolve(window.puter);
      existing.addEventListener('load', () => resolve(window.puter), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load AppGPT Free AI.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.async = true;
    script.dataset.appgptPuter = '1';
    script.onload = () => window.puter?.ai?.chat ? resolve(window.puter) : reject(new Error('AppGPT Free AI did not initialize.'));
    script.onerror = () => reject(new Error('Could not load AppGPT Free AI.'));
    document.head.append(script);
  });
  return puterReady;
}

function wireFirstUseGate() {
  // Capture before the chat/build handlers. If Puter needs first-use auth,
  // perform it from the same user gesture and replay the original action only
  // after auth succeeds. This prevents popup blocking and prevents AppGPT from
  // falling into Provider settings just because first-use auth was not ready.
  document.addEventListener('click', event => {
    if (replaying || !isFreeSelected()) return;
    const target = event.target.closest?.('#simpleChatSend, #buildBtn, #createAppBtn');
    if (!target || isPuterSignedIn()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    gateAndReplay(() => target.click());
  }, true);

  document.addEventListener('keydown', event => {
    if (replaying || !isFreeSelected() || isPuterSignedIn()) return;
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    if (event.target?.id !== 'simpleChatComposer') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    gateAndReplay(() => document.getElementById('simpleChatSend')?.click());
  }, true);
}

async function gateAndReplay(action) {
  if (authRunning) return;
  authRunning = true;
  try {
    // The script is preloaded at startup. If it somehow has not finished yet,
    // do not start a build that will immediately fail; ask for one more tap.
    if (!window.puter?.auth) {
      toast('AppGPT Free is finishing setup — tap Send again in a moment.');
      preloadPuter().catch(() => {});
      return;
    }

    if (!isPuterSignedIn()) {
      await window.puter.auth.signIn({ attempt_temp_user_creation: true });
    }
    replaying = true;
    action();
  } catch (error) {
    const code = String(error?.error || error?.code || error?.message || '');
    if (/closed|cancel/i.test(code)) toast('Free AI setup was cancelled. Your chat is still here.');
    else toast('Could not start AppGPT Free. Try again or choose another AI.');
  } finally {
    setTimeout(() => { replaying = false; }, 0);
    authRunning = false;
  }
}

function isPuterSignedIn() {
  try { return Boolean(window.puter?.auth?.isSignedIn?.()); }
  catch { return false; }
}

function isFreeSelected() {
  return Boolean(provider && E.provider?.value === 'appgptFree');
}

export const APPGPT_FREE_MODELS = FREE_MODELS;