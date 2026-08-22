import { S, toast } from './app-state.js';

const BLOCKED_WHILE_BUSY = [
  '#buildBtn',
  '#createAppBtn',
  '#newChatBtn',
  '#editBtn',
  '#autoFixBtn',
  '#confirmCreateAppBtn',
  '#workspaceSidebarNew',
  '[data-chat="open"]',
  '[data-chat="delete"]',
  '[data-template="use"]',
  '#aiSwitchApply'
].join(',');

// The build engine currently keeps the active chat in shared state. Prevent
// navigation/actions that could swap that chat while an AI request is in flight.
document.addEventListener('click', event => {
  if (!S.busy) return;
  const target = event.target.closest?.(BLOCKED_WHILE_BUSY);
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  toast('AppGPT is still working. Finish this build before switching projects.');
}, true);

window.addEventListener('appgpt-progress', event => {
  const detail = event.detail || {};
  document.documentElement.classList.toggle('appgpt-busy', Boolean(S.busy && !detail.done && !detail.error));
});
