import { tg } from './app-state.js';

// Keep the security meaning of the checkbox literal: turning cloud key sync off
// removes any previously stored server copy instead of merely hiding it.
document.addEventListener('change', async event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== 'telegramKeySync' || target.checked || !tg?.initData) return;
  const status = document.getElementById('telegramSyncStatus');
  try {
    if (status) status.textContent = 'Removing the synced API-key copy…';
    const response = await fetch('/api/appgpt/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, operation: 'clearKey' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Could not remove cloud key (${response.status})`);
    if (status) {
      status.textContent = 'Cross-device API-key sync disabled and the encrypted cloud key copy was removed.';
      status.className = 'telegram-sync-status ok';
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message || 'Could not remove the cloud API-key copy.';
      status.className = 'telegram-sync-status error';
    }
  }
});

// Use Telegram's documented Managed Bot deep-link shape, including a suggested
// bot username. Capture the click before the older fallback handler runs.
document.addEventListener('click', async event => {
  const button = event.target?.closest?.('#telegramCreateBot');
  if (!button || !tg?.initData) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const status = document.getElementById('telegramSyncStatus');
  try {
    if (status) status.textContent = 'Opening Telegram’s Managed Bot creator…';
    const response = await fetch('/api/appgpt/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, operation: 'status' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Could not check Bot Management Mode.');
    const manager = data.managerBot;
    if (!manager?.canManageBots || !manager?.username) throw new Error('Enable Bot Management Mode for the AppGPT bot in BotFather first.');
    const seed = String(tg.initDataUnsafe?.user?.id || Date.now()).replace(/\D/g, '').slice(-8) || String(Date.now()).slice(-8);
    const suggestedUsername = `AppGPT${seed}Bot`.slice(0, 32);
    const url = `https://t.me/newbot/${encodeURIComponent(manager.username)}/${encodeURIComponent(suggestedUsername)}?name=${encodeURIComponent('My AppGPT Bot')}`;
    if (tg.openTelegramLink) tg.openTelegramLink(url); else location.href = url;
    if (status) {
      status.textContent = 'Telegram opened the Managed Bot creation flow.';
      status.className = 'telegram-sync-status ok';
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message || 'Could not open Managed Bot creation.';
      status.className = 'telegram-sync-status error';
    }
  }
}, true);
