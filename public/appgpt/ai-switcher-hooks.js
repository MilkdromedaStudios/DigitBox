// Small compatibility hooks for the legacy chat/sidebar renderer. They keep the
// project-AI switcher informed when a chat is opened without changing main.js.
boot();

function boot() {
  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-chat="open"], .chat-card');
    const fresh = event.target.closest?.('#newChatBtn, #workspaceSidebarNew');
    if (!open && !fresh) return;
    setTimeout(notifyChatChange, 60);
    setTimeout(notifyChatChange, 220);
  }, true);

  window.addEventListener('appgpt-chat-changed', decorateFreeProvider);
  setTimeout(() => {
    decorateFreeProvider();
    notifyChatChange();
    rewriteFreeCopy();
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

function rewriteFreeCopy() {
  const note = document.querySelector('#aiSwitchFreeNote span');
  if (note) note.textContent = 'No API key. AppGPT starts with North Mini Code and falls back only to other $0 Puter-hosted models. Free services can still have rate or capacity limits; if every free model fails, your project stays saved and AppGPT asks you to switch AI. A paid/BYOK key is never used automatically.';
}
