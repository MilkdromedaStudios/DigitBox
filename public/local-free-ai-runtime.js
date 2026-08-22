const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm';

export const LOCAL_FREE_MODELS = [
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC'
];

let webllmPromise = null;
const engines = new Map();
const enginePromises = new Map();

export function isLocalAISupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}

export async function localChat(messages, options = {}) {
  const model = options.model || LOCAL_FREE_MODELS[0];
  if (!isLocalAISupported()) {
    throw new Error('Local Free AI needs a WebGPU-capable browser. Your work is saved — choose another AI to continue.');
  }

  const engine = await getEngine(model);
  const prepared = prepareMessages(messages, options.task || 'chat');
  const inputChars = prepared.reduce((sum, message) => sum + String(message.content || '').length, 0);
  const requested = Number(options.maxTokens || options.max_tokens || 900);
  const outputLimit = options.task === 'app-builder'
    ? Math.min(requested, inputChars > 7000 ? 900 : inputChars > 4000 ? 1200 : 1600)
    : Math.min(requested, 900);

  const response = await engine.chat.completions.create({
    messages: prepared,
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.55,
    max_tokens: Math.max(64, outputLimit)
  });

  const content = response?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map(part => typeof part === 'string' ? part : part?.text || '').join('')
    : String(content || '');
  if (!text.trim()) throw new Error('Local Free AI returned an empty response.');
  return { text, model };
}

async function getEngine(model) {
  if (engines.has(model)) return engines.get(model);
  if (enginePromises.has(model)) return enginePromises.get(model);

  const promise = (async () => {
    dispatchProgress({ model, value: 0, text: 'Loading Local Free AI…' });
    const webllm = await loadWebLLM();
    let lastBucket = -1;
    const engine = await webllm.CreateMLCEngine(model, {
      initProgressCallback(report) {
        const value = Math.max(0, Math.min(1, Number(report?.progress || 0)));
        const bucket = Math.floor(value * 10);
        if (bucket !== lastBucket) {
          lastBucket = bucket;
          dispatchProgress({
            model,
            value,
            text: report?.text || (value < 1 ? 'Downloading the local model…' : 'Local model ready.')
          });
        }
      }
    });
    engines.set(model, engine);
    dispatchProgress({ model, value: 1, text: 'Local Free AI ready.' });
    return engine;
  })();

  enginePromises.set(model, promise);
  try {
    return await promise;
  } finally {
    enginePromises.delete(model);
  }
}

function loadWebLLM() {
  if (!webllmPromise) webllmPromise = import(WEBLLM_URL);
  return webllmPromise;
}

function prepareMessages(messages, task) {
  const input = Array.isArray(messages) ? messages : [];
  if (task !== 'app-builder') {
    return input
      .filter(message => message && message.content != null)
      .slice(-10)
      .map(message => ({
        role: normalizeRole(message.role),
        content: trimText(flattenContent(message.content), 5000)
      }));
  }

  const system = {
    role: 'system',
    content: 'You are AppGPT Local Free AI. Build or edit a compact, functional Telegram Mini App. Return ONLY one complete self-contained HTML document starting with <!doctype html> and ending with </html>. Put CSS and JavaScript in the file. Use window.Telegram?.WebApp safely, keep normal-browser fallback working, make every visible control functional, never embed secrets, and keep the code concise because this local model has a small context window.'
  };
  const nonSystem = input.filter(message => message?.role !== 'system' && message?.content != null);
  const recent = nonSystem.slice(-2).map(message => ({
    role: normalizeRole(message.role),
    content: trimText(flattenContent(message.content), 7600)
  }));
  return [system, ...recent];
}

function flattenContent(content) {
  if (!Array.isArray(content)) return String(content || '');
  return content
    .filter(part => part?.type !== 'image')
    .map(part => part?.text || '')
    .join('\n');
}

function trimText(value, maxChars) {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.62);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[...middle omitted for local-model context...]\n\n${text.slice(-tail)}`;
}

function normalizeRole(role) {
  return role === 'assistant' || role === 'system' ? role : 'user';
}

function dispatchProgress(detail) {
  try {
    window.dispatchEvent(new CustomEvent('digitbox-local-ai-progress', { detail }));
  } catch {}
}

const runtime = {
  models: LOCAL_FREE_MODELS,
  supported: isLocalAISupported,
  chat: localChat
};

try {
  window.DigitboxLocalAI = runtime;
  window.dispatchEvent(new CustomEvent('digitbox-local-ai-ready', { detail: runtime }));
} catch {}
