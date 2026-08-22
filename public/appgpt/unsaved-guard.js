import { S, tg, latest } from './app-state.js';

let telegramGuardOn = null;
let lastUnsafe = false;

boot();

function boot() {
  document.addEventListener('input', refreshGuard, true);
  document.addEventListener('change', refreshGuard, true);
  window.addEventListener('appgpt-chat-changed', refreshGuard);
  window.addEventListener('appgpt-progress', refreshGuard);
  window.addEventListener('appgpt-build-reset', refreshGuard);
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', refreshGuard);
  setInterval(refreshGuard, 800);
  refreshGuard();
}

function unsavedState() {
  const composer = document.getElementById('simpleChatComposer');
  const composerDirty = Boolean(composer?.value?.trim());

  const code = document.getElementById('workspaceCodeEditor');
  const savedHtml = latest()?.content || '';
  const codeDirty = Boolean(code && savedHtml && code.value !== savedHtml);

  const building = Boolean(S.busy || S.chat?.status === 'building');
  return { unsafe: composerDirty || codeDirty || building, composerDirty, codeDirty, building };
}

function beforeUnload(event) {
  const state = unsavedState();
  if (!state.unsafe) return;
  event.preventDefault();
  event.returnValue = '';
  return '';
}

function refreshGuard() {
  const state = unsavedState();
  lastUnsafe = state.unsafe;

  // Telegram has its own native close confirmation. Keep it enabled only while
  // the user has typed-but-unsent text, unsaved code, or an active build/edit.
  if (!tg) return;
  if (telegramGuardOn === state.unsafe) return;
  telegramGuardOn = state.unsafe;
  try {
    if (state.unsafe) tg.enableClosingConfirmation?.();
    else tg.disableClosingConfirmation?.();
  } catch {}
}

export function hasUnsavedWork() {
  return unsavedState();
}
