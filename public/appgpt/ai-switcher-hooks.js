import { PROVIDERS } from './providers.js';

// Small compatibility hooks for the legacy chat/sidebar renderer. They keep the
// project-AI switcher informed when a chat is opened without changing main.js.
boot();

function boot() {
  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-chat="open"], .chat-card');
    const fresh = event.target.closest?.('#newChatBtn, #workspaceSidebarNew');
    if (open || fresh) {
      setTimeout(notifyChatChange, 60);
      setTimeout(notifyChatChange, 220);
    }
    if (event.target.closest?.('#aiSwitchProvider')) setTimeout(syncFreeCopy, 0);
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'aiSwitchProvider' || event.target?.id === 'providerSelect') {
      setTimeout(syncFreeCopy, 20);
      setTimeout(lockFreeSwitchFields, 40);
    }
  }, true);

  window.addEventListener('appgpt-chat-changed', () => {
    decorateFreeProvider();
    setTimeout(syncFreeCopy, 0);
    setTimeout(lockFreeSwitchFields, 0);
  });

  setTimeout(() => {
    decorateFreeProvider();
    notifyChatChange();
    syncFreeCopy();
    lockFreeSwitchFields();
  }, 700);
}

function notifyChatChange() {
  window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
}

function decorateFreeProvider() {
  document.querySelectorAll('.provider-card').forEach(card => {
    const free = /AppGPT Free/i.test(card.textContent || '');
    if (free) card.dataset.freeAi = 'true';
  });
}

function syncFreeCopy() {
  const note = document.querySelector('#aiSwitchFreeNote span');
  if (note) note.textContent = 'No API key and no sign-in. AppGPT Free runs a small AI model directly in this browser. The first use downloads the model once; afterward it can reuse the browser cache. If this device cannot run it, your project stays saved and you can switch to any other AI.';

  const selected = document.getElementById('providerSelect')?.value === 'appgptFree';
  const providerStatus = document.getElementById('providerStatus');
  if (selected && providerStatus && /Puter|sign.?in|API key required|no API key required/i.test(providerStatus.textContent || '')) {
    providerStatus.textContent = 'Local Free AI · no sign-in or API key.';
    providerStatus.className = 'inline-status ok';
  }

  const switchProvider = document.getElementById('aiSwitchProvider');
  const switchStatus = document.getElementById('aiSwitchStatus');
  if (switchProvider?.value === 'appgptFree' && switchStatus && /Puter|sign.?in|already connected/i.test(switchStatus.textContent || '')) {
    switchStatus.textContent = 'Local Free AI · no sign-in or API key.';
    switchStatus.className = 'inline-status ok';
  }
}

function lockFreeSwitchFields() {
  const provider = document.getElementById('aiSwitchProvider');
  const model = document.getElementById('aiSwitchModel');
  const base = document.getElementById('aiSwitchBase');
  if (!provider || !model || !base) return;
  const free = provider.value === 'appgptFree';
  model.readOnly = free;
  base.readOnly = free;
  if (free) {
    const preset = PROVIDERS.appgptFree;
    model.value = preset?.model || model.value;
    base.value = preset?.baseUrl || base.value;
  }
}
