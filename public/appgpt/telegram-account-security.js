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
