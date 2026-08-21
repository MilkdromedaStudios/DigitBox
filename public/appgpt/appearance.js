const THEME_KEY = 'appgpt_theme';
const APPEARANCE_CSS = './appearance.css';
const LIQUID_GL_URL = 'https://cdn.jsdelivr.net/npm/liquid-gl@2.0.1/liquidGL.js';
const HF_MODELS_URL = 'https://router.huggingface.co/v1/models';
const HF_MODELS = [
  'Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest',
  'openai/gpt-oss-120b:fastest',
  'deepseek-ai/DeepSeek-R1:fastest',
  'Qwen/Qwen2.5-Coder-32B-Instruct:fastest',
  'Qwen/Qwen3-4B-Thinking-2507:fastest',
  'zai-org/GLM-4.5V:fastest',
  'Qwen/Qwen2.5-VL-3B-Instruct:fastest'
];
const VALID_VIEWS = new Set(['build','chats','templates','debug','publish','settings']);
const root = document.documentElement;
const tg = window.Telegram?.WebApp;
let liquidReady = false;
let liquidInstance = null;
let hfRequest = 0;

init();

function init() {
  loadAppearanceCss();
  mountDock();
  setupProviderModels();
  openRequestedView();
  applyTheme(readTheme(), false);
  if (document.readyState === 'complete') initLiquidGL();
  else window.addEventListener('load', () => initLiquidGL(), { once: true });
  window.addEventListener('appgpt-chat-changed', recaptureSoon);
}

function loadAppearanceCss() {
  if (document.querySelector('link[data-appgpt-appearance]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = APPEARANCE_CSS;
  link.dataset.appgptAppearance = 'true';
  document.head.append(link);
}

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

function openRequestedView() {
  let requested = '';
  try { requested = new URL(location.href).searchParams.get('view') || ''; } catch {}
  if (!VALID_VIEWS.has(requested) || requested === 'build') return;
  let attempts = 0;
  const tryOpen = () => {
    const button = document.querySelector(`.nav-item[data-view="${requested}"]`);
    if (button && typeof button.onclick === 'function') return button.click();
    if (++attempts < 30) setTimeout(tryOpen, 80);
  };
  setTimeout(tryOpen, 0);
}

function setupProviderModels() {
  const provider = document.getElementById('providerSelect');
  const model = document.getElementById('modelInput');
  const key = document.getElementById('apiKeyInput');
  if (!provider || !model) return;

  let list = document.getElementById('appgptModelSuggestions');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'appgptModelSuggestions';
    document.body.append(list);
  }
  model.setAttribute('list', list.id);

  let hint = document.getElementById('providerModelHint');
  if (!hint) {
    hint = document.createElement('span');
    hint.id = 'providerModelHint';
    hint.className = 'provider-model-hint';
    model.insertAdjacentElement('afterend', hint);
  }

  const renderOptions = values => {
    const unique = [...new Set(values)].slice(0, 350);
    list.innerHTML = unique.map(value => `<option value="${escapeAttr(value)}"></option>`).join('');
  };

  const refresh = async () => {
    const ticket = ++hfRequest;
    const isHF = provider.value === 'huggingface';
    if (!isHF) {
      list.innerHTML = '';
      hint.hidden = true;
      return;
    }

    renderOptions(HF_MODELS);
    hint.hidden = false;
    hint.textContent = 'Hugging Face: curated coding/vision models shown. Enter an HF token to load the live Inference Providers model catalog. You can also type any compatible model ID.';

    const token = key?.value?.trim();
    if (!token) return;
    hint.textContent = 'Hugging Face: loading the current Inference Providers model catalog…';
    try {
      const response = await fetch(HF_MODELS_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Model catalog request failed (${response.status})`);
      const data = await response.json();
      if (ticket !== hfRequest || provider.value !== 'huggingface') return;
      const live = Array.isArray(data?.data) ? data.data.map(item => item?.id).filter(Boolean) : [];
      const routed = live.flatMap(id => [id, `${id}:fastest`]);
      renderOptions([...HF_MODELS, ...routed]);
      hint.textContent = `Hugging Face: ${live.length} live chat models loaded. Add :fastest, :cheapest, or :preferred to control provider routing.`;
    } catch {
      if (ticket !== hfRequest || provider.value !== 'huggingface') return;
      hint.textContent = 'Hugging Face: using curated suggestions. The live catalog could not be loaded, but you can still type any compatible model ID.';
    }
  };

  provider.addEventListener('change', () => setTimeout(refresh, 0));
  key?.addEventListener('change', refresh);
  key?.addEventListener('blur', refresh);
  new MutationObserver(refresh).observe(provider, { childList: true });
  refresh();
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char]));
}

function mountDock() {
  if (document.getElementById('liquidDock')) return;

  const dock = document.createElement('div');
  dock.id = 'liquidDock';
  dock.className = 'liquid-dock';
  dock.setAttribute('aria-label', 'AppGPT quick controls');

  const lens = document.createElement('div');
  lens.id = 'liquidDockLens';
  lens.className = 'liquid-lens liquidGL';
  lens.setAttribute('aria-hidden', 'true');
  dock.append(lens);

  const content = document.createElement('div');
  content.className = 'liquid-content';
  const existingActions = document.querySelector('.top-actions');
  if (existingActions) content.append(existingActions);

  const theme = document.createElement('button');
  theme.id = 'themeToggleBtn';
  theme.className = 'theme-toggle';
  theme.type = 'button';
  theme.innerHTML = '<span class="theme-icon" aria-hidden="true">☾</span><span class="theme-label">Dark</span>';
  theme.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
    try { tg?.HapticFeedback?.selectionChanged?.(); } catch {}
  });
  content.append(theme);

  const badge = document.createElement('span');
  badge.id = 'liquidGlBadge';
  badge.className = 'liquid-badge';
  badge.dataset.state = 'loading';
  badge.innerHTML = '<i></i><span>LiquidGL</span>';
  content.append(badge);

  dock.append(content);
  document.body.append(dock);
}

function applyTheme(theme, persist = true) {
  const next = theme === 'light' ? 'light' : 'dark';

  root.dataset.theme = next;
  root.style.colorScheme = next;
  if (document.body) document.body.dataset.theme = next;

  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'light' ? '#edf3fb' : '#070b14';

  const button = document.getElementById('themeToggleBtn');
  if (button) {
    button.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    button.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
    button.dataset.theme = next;
    const icon = button.querySelector('.theme-icon');
    const label = button.querySelector('.theme-label');
    if (icon) icon.textContent = next === 'light' ? '☀' : '☾';
    if (label) label.textContent = next === 'light' ? 'Light' : 'Dark';
  }

  try {
    const bg = next === 'light' ? '#edf3fb' : '#070b14';
    tg?.setHeaderColor?.(bg);
    tg?.setBackgroundColor?.(bg);
    tg?.setBottomBarColor?.(bg);
  } catch {}

  void root.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(recaptureSoon));
  window.dispatchEvent(new CustomEvent('appgpt-theme-changed', { detail: { theme: next } }));
}

async function initLiquidGL() {
  const dock = document.getElementById('liquidDock');
  const lens = document.getElementById('liquidDockLens');
  const badge = document.getElementById('liquidGlBadge');
  if (!dock || !lens) return;

  try {
    const module = await import(LIQUID_GL_URL);
    const liquidGL = module.default;
    if (typeof liquidGL !== 'function') throw new Error('liquidGL did not load correctly');
    const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    liquidInstance = liquidGL({
      snapshot: 'body',
      target: '#liquidDockLens',
      resolution: Math.min(1.3, Math.max(1, (window.devicePixelRatio || 1) * 0.62)),
      refraction: 0.009,
      aberration: 0.014,
      bevelDepth: 0.05,
      bevelWidth: 0.12,
      frost: 0.56,
      shadow: true,
      specular: !reduced,
      reveal: reduced ? 'none' : 'fade',
      tilt: false,
      magnify: 1.002,
      on: {
        init() {
          liquidReady = true;
          dock.dataset.liquidReady = 'true';
          if (badge) badge.dataset.state = 'ready';
        }
      }
    });
    if (badge && !liquidReady) badge.dataset.state = 'loading';
  } catch (error) {
    console.warn('LiquidGL unavailable; CSS glass fallback is active.', error);
    dock.classList.add('liquid-fallback');
    if (badge) {
      badge.dataset.state = 'fallback';
      const label = badge.querySelector('span');
      if (label) label.textContent = 'Glass fallback';
    }
  }
}

function recaptureSoon() {
  if (!liquidReady) return;
  clearTimeout(recaptureSoon.timer);
  recaptureSoon.timer = setTimeout(() => {
    try {
      window.__liquidGLRenderer__?.captureSnapshot?.();
      window.__liquidGLRenderer__?.render?.();
    } catch {}
  }, 120);
}

export function getAppearanceState() {
  return { theme: root.dataset.theme || 'dark', liquidReady, liquidInstance };
}
