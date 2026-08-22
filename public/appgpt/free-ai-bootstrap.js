import { PROVIDERS } from './providers.js';
import { E, toast } from './app-state.js';
import { LOCAL_FREE_MODELS, localChat, isLocalAISupported } from '../local-free-ai-runtime.js';

const FREE_MODELS = [...LOCAL_FREE_MODELS];
const provider = PROVIDERS.appgptFree;
let lastProgressBucket = -1;

if (provider) {
  provider.model = FREE_MODELS[0];
  provider.fallbackModels = FREE_MODELS.slice(1);
  provider.baseUrl = 'local://webllm';
  provider.freeTier = true;
  provider.requiresKey = false;
  provider.freeLabel = 'No API key · no sign-in · runs locally';
  provider.hint = 'Local browser AI · no account, API key, or cloud quota';
}

installLocalCompatibilityShim();
migrateSavedFreePreset();
syncLivePreset();
wireFreeLock();
wireProgress();

function installLocalCompatibilityShim() {
  // Keep the existing keyless-provider interface stable while fulfilling the
  // request locally with WebLLM.
  const root = window.puter || {};
  root.ai = {
    ...(root.ai || {}),
    async chat(messages, options = {}) {
      const result = await localChat(messages, {
        model: options.model || FREE_MODELS[0],
        temperature: options.temperature,
        maxTokens: options.max_tokens,
        task: 'app-builder'
      });
      return { message: { content: result.text }, model: result.model };
    }
  };
  window.puter = root;
}

function migrateSavedFreePreset() {
  try {
    const key = 'appgpt_provider_config';
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || saved.provider !== 'appgptFree') return;
    saved.model = FREE_MODELS[0];
    saved.baseUrl = 'local://webllm';
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {}
}

function wireFreeLock() {
  E.provider?.addEventListener('change', () => setTimeout(syncLivePreset, 0));
  E.modelInput?.addEventListener('change', syncLivePreset);
  E.base?.addEventListener('change', syncLivePreset);
  window.addEventListener('appgpt-chat-changed', () => setTimeout(syncLivePreset, 0));
  setTimeout(syncLivePreset, 120);
  setTimeout(syncLivePreset, 700);
}

function syncLivePreset() {
  const free = Boolean(provider && E.provider?.value === 'appgptFree');
  if (E.modelInput) E.modelInput.readOnly = free;
  if (E.base) E.base.readOnly = free;
  if (!free) return;

  E.modelInput.value = FREE_MODELS[0];
  E.base.value = 'local://webllm';
  if (E.key) E.key.value = '';
  if (E.badge) E.badge.textContent = `AppGPT Free · ${shortModel(FREE_MODELS[0])}`;
  if (E.model) E.model.textContent = `AppGPT Free · ${shortModel(FREE_MODELS[0])}`;

  if (E.providerStatus && !isLocalAISupported()) {
    E.providerStatus.textContent = 'This browser does not expose WebGPU. Your projects are safe; choose another AI to generate.';
    E.providerStatus.className = 'inline-status error';
  }
}

function wireProgress() {
  window.addEventListener('digitbox-local-ai-progress', event => {
    if (!isFreeSelected()) return;
    const value = Math.max(0, Math.min(1, Number(event.detail?.value || 0)));
    const bucket = Math.floor(value * 4);
    if (bucket === lastProgressBucket && value < 1) return;
    lastProgressBucket = bucket;
    const percent = Math.round(value * 100);
    const text = value >= 1
      ? 'Local Free AI model is ready.'
      : `Preparing Local Free AI · ${percent}%${percent < 100 ? ' · first load downloads the model once' : ''}`;
    window.dispatchEvent(new CustomEvent('appgpt-build-note', { detail: { text } }));
    if (value >= 1) toast('Local Free AI ready');
  });

  window.addEventListener('digitbox-local-ai-retry', event => {
    if (!isFreeSelected()) return;
    const reason = String(event.detail?.reason || 'invalid HTML response');
    window.dispatchEvent(new CustomEvent('appgpt-build-note', {
      detail: { text: `Local AI response was ${reason}. Retrying automatically with a stricter raw-HTML instruction…` }
    }));
  });
}

function isFreeSelected() {
  return Boolean(provider && E.provider?.value === 'appgptFree');
}

function shortModel(value = '') {
  return String(value).replace(/-Instruct.*$/i, '').replace(/-q\w+.*$/i, '') || value;
}

export const APPGPT_FREE_MODELS = FREE_MODELS;
