import { PROVIDERS } from './providers.js';
import { E } from './app-state.js';

// AppGPT Free intentionally falls back only among models that Puter currently
// exposes at $0 input / $0 output. A paid/BYOK provider is never selected
// automatically when these models are unavailable or rate-limited.
const FREE_MODELS = [
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'liquid/lfm-2.5-2.6b:free'
];

const provider = PROVIDERS.appgptFree;
if (provider) {
  provider.model = FREE_MODELS[0];
  provider.fallbackModels = FREE_MODELS.slice(1);
  provider.freeTier = true;
  provider.requiresKey = false;
  provider.freeLabel = 'No API key · $0 hosted fallback chain';
  provider.hint = 'Already connected · free coding model with automatic $0 fallbacks';
}

migrateSavedFreePreset();
applyLiveFreePreset();

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

function applyLiveFreePreset() {
  if (!provider || E.provider?.value !== 'appgptFree') return;
  E.modelInput.value = FREE_MODELS[0];
  E.base.value = 'puter://ai';
  if (E.key) E.key.value = '';
  if (E.badge) E.badge.textContent = `AppGPT Free · ${FREE_MODELS[0]}`;
  if (E.model) E.model.textContent = `AppGPT Free · ${FREE_MODELS[0]}`;
}

export const APPGPT_FREE_MODELS = FREE_MODELS;
