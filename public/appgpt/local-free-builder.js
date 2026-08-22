import {
  localChat as baseLocalChat,
  isLocalAISupported
} from '../local-free-ai-runtime.js';

export const LOCAL_FREE_MODELS = [
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC'
];

export { isLocalAISupported };

export async function localChat(messages, options = {}) {
  const preferred = options.model && LOCAL_FREE_MODELS.includes(options.model)
    ? options.model
    : LOCAL_FREE_MODELS[0];

  const attempts = [
    {
      model: preferred,
      messages,
      maxTokens: Math.min(Number(options.maxTokens || options.max_tokens || 2800), 2800),
      temperature: Math.min(Number(options.temperature) || 0.28, 0.28)
    },
    {
      model: preferred,
      messages: compactMessages(messages, 1700, 'compact'),
      maxTokens: 2250,
      temperature: 0.12
    },
    {
      model: LOCAL_FREE_MODELS[1],
      messages: compactMessages(messages, 1100, 'tiny'),
      maxTokens: 1800,
      temperature: 0.08
    }
  ];

  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (index > 0) {
      note(`Local Free AI is retrying with a smaller ${index === 1 ? 'code-focused' : 'fallback'} build so it can finish the entire HTML file.`);
    }

    try {
      return await baseLocalChat(attempt.messages, {
        model: attempt.model,
        temperature: attempt.temperature,
        maxTokens: attempt.maxTokens,
        task: 'app-builder'
      });
    } catch (error) {
      lastError = error;
      console.warn(`Local Free builder attempt ${index + 1} failed`, error);
    }
  }

  throw new Error(
    `Local Free AI could not finish the HTML after compact retries. ${cleanReason(lastError)} Try a shorter app request or use another AI for a larger app.`
  );
}

function compactMessages(messages, maxChars, mode) {
  const input = Array.isArray(messages) ? messages : [];
  const lastUser = [...input].reverse().find(message => message?.role !== 'system' && message?.content != null);
  const brief = flatten(lastUser?.content || 'Build a useful Telegram Mini App.').slice(0, maxChars);
  const sizeRule = mode === 'tiny'
    ? 'Keep the whole file extremely small: about 80-120 lines. Implement only the core interaction and finish every tag.'
    : 'Keep the whole file compact: about 120-180 lines. Prefer a small working app over extra features.';

  return [{
    role: 'user',
    content: `${sizeRule}\nUse inline CSS and JavaScript. Return one complete index.html only.\n\nUSER REQUEST:\n${brief}`
  }];
}

function flatten(content) {
  if (!Array.isArray(content)) return String(content || '');
  return content
    .filter(part => part?.type !== 'image')
    .map(part => part?.text || '')
    .join('\n');
}

function cleanReason(error) {
  const text = String(error?.message || error || '').trim();
  if (!text) return '';
  return text.replace(/^Local Free AI\s*/i, '').slice(0, 180);
}

function note(text) {
  try {
    window.dispatchEvent(new CustomEvent('appgpt-build-note', { detail: { text } }));
  } catch {}
}
