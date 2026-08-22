import { S, toast } from './app-state.js';
import { saveChat } from './storage.js';

let recovering = false;

async function recoverInterruptedBuild() {
  if (recovering || S.busy || !S.chat || S.chat.status !== 'building') return;
  recovering = true;
  try {
    const now = new Date().toISOString();
    const pending = [...(S.chat.messages || [])]
      .reverse()
      .find(message => message?.role === 'assistant' && message?.status === 'building');

    S.chat.status = 'error';
    S.chat.updatedAt = now;
    if (pending) {
      pending.status = 'error';
      pending.ts = now;
      pending.content = 'Build interrupted before completion. Your request is still saved — retry when ready.';
    }

    await saveChat(S.chat);
    window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
    toast('Recovered an interrupted build. Your request is still saved.');
  } catch (error) {
    console.warn('Could not recover interrupted AppGPT build state.', error);
  } finally {
    recovering = false;
  }
}

window.addEventListener('appgpt-chat-changed', () => setTimeout(recoverInterruptedBuild, 0));
setTimeout(recoverInterruptedBuild, 500);
setTimeout(recoverInterruptedBuild, 1500);
