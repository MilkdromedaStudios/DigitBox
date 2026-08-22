import { E } from './app-state.js';

const params = new URLSearchParams(window.location.search);
const prompt = params.get('prompt');
const autoBuild = params.get('autobuild') === '1';
const requestedView = params.get('view');

if (prompt || requestedView) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (requestedView) {
        const nav = [...document.querySelectorAll('.nav-item')].find(item => item.dataset.view === requestedView);
        nav?.click();
      }

      if (!prompt || !E.prompt) return;
      E.prompt.value = prompt;
      E.prompt.dispatchEvent(new Event('input', { bubbles: true }));
      E.prompt.focus();

      if (autoBuild) {
        setTimeout(() => {
          if (!E.build?.disabled) E.build?.click();
        }, 450);
      }

      // Clean the transfer parameters so refreshing does not rebuild again.
      try {
        const clean = new URL(window.location.href);
        clean.searchParams.delete('prompt');
        clean.searchParams.delete('autobuild');
        history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
      } catch {}
    }, 700);
  }, { once: true });
}
