const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm';

export const LOCAL_FREE_MODELS = [
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC'
];

const APP_BUILDER_SYSTEM_PROMPT = `You are AppGPT Local Free AI. Your ONLY job in this mode is to output one complete HTML document for a small Telegram Mini App.

STRICT OUTPUT CONTRACT:
- OUTPUT RAW HTML ONLY.
- Your response MUST begin with exactly: <!doctype html>
- Your response MUST end with exactly: </html>
- Do NOT write any explanation before or after the HTML.
- Do NOT use Markdown or triple-backtick code fences.
- Do NOT return JSON.
- Do NOT say "Here is", "Sure", "I created", or anything similar.
- Do NOT return a partial file, patch, excerpt, pseudocode, TODO, ellipsis, or placeholder.
- Include <html>, <head>, <style>, <body>, and <script> as needed in the SAME document.
- Put all app CSS and JavaScript inside this single HTML file.
- Every visible primary control must actually work.
- Use window.Telegram?.WebApp safely and keep a normal-browser fallback.
- Never embed private API keys or secrets.

COMPLETION IS MORE IMPORTANT THAN EXTRA FEATURES. If the requested app is too large, simplify the design and features so you can FINISH the entire document and still end with </html>. Before responding, silently verify that the first characters are <!doctype html> and the final characters are </html>. Return the HTML document and NOTHING ELSE.`;

const HTML_RETRY_SYSTEM_PROMPT = `Your previous answer was rejected because it was not one complete HTML document.

TRY AGAIN FROM SCRATCH. This is a machine-readable file response, not a conversation.
1. First characters: <!doctype html>
2. Return ONLY raw HTML. No Markdown fences and no explanation.
3. Make a compact but functional single-file app with inline CSS and JavaScript.
4. Do not use TODO, placeholders, ellipses, or omit code.
5. If necessary, REMOVE optional features so the file can be completed.
6. Final characters: </html>

Anything outside the HTML document is an invalid answer.`;

let webllmPromise = null;
const engines = new Map();
const enginePromises = new Map();

export function isLocalAISupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}

export async function localChat(messages, options = {}) {
  const model = options.model || LOCAL_FREE_MODELS[0];
  const task = options.task || 'chat';
  if (!isLocalAISupported()) {
    throw new Error('Local Free AI needs a WebGPU-capable browser. Your work is saved — choose another AI to continue.');
  }

  const engine = await getEngine(model);
  const prepared = prepareMessages(messages, task);
  const inputChars = prepared.reduce((sum, message) => sum + String(message.content || '').length, 0);
  const requested = Number(options.maxTokens || options.max_tokens || 900);
  const outputLimit = task === 'app-builder'
    ? Math.min(requested, inputChars > 11000 ? 2600 : inputChars > 7000 ? 3200 : 3800)
    : Math.min(requested, 900);

  let text = await runCompletion(engine, prepared, {
    temperature: task === 'app-builder' ? Math.min(Number(options.temperature) || 0.35, 0.35) : options.temperature,
    maxTokens: outputLimit
  });

  if (task === 'app-builder' && !isCompleteHtml(text)) {
    dispatchRetry({ model, reason: htmlFailureReason(text) });
    const retryMessages = prepareHtmlRetryMessages(messages);
    text = await runCompletion(engine, retryMessages, {
      temperature: 0.1,
      maxTokens: Math.max(outputLimit, Math.min(requested, 3800))
    });
  }

  if (!text.trim()) throw new Error('Local Free AI returned an empty response.');
  if (task === 'app-builder' && !isCompleteHtml(text)) {
    throw new Error(`Local Free AI could not finish a valid HTML document after retrying (${htmlFailureReason(text)}). Your project is saved — try a shorter request or switch AI.`);
  }

  return { text: cleanHtmlResponse(text, task), model };
}

async function runCompletion(engine, messages, { temperature, maxTokens }) {
  const response = await engine.chat.completions.create({
    messages,
    temperature: Number.isFinite(temperature) ? temperature : 0.55,
    max_tokens: Math.max(64, maxTokens)
  });

  const content = response?.choices?.[0]?.message?.content;
  return Array.isArray(content)
    ? content.map(part => typeof part === 'string' ? part : part?.text || '').join('')
    : String(content || '');
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

  const nonSystem = input.filter(message => message?.role !== 'system' && message?.content != null);
  const recent = nonSystem.slice(-2).map(message => ({
    role: normalizeRole(message.role),
    content: trimText(flattenContent(message.content), 9000)
  }));
  return [{ role: 'system', content: APP_BUILDER_SYSTEM_PROMPT }, ...recent];
}

function prepareHtmlRetryMessages(messages) {
  const input = Array.isArray(messages) ? messages : [];
  const nonSystem = input.filter(message => message?.role !== 'system' && message?.content != null);
  const userBrief = nonSystem.length
    ? trimText(flattenContent(nonSystem.at(-1)?.content), 8500)
    : 'Build the requested compact Telegram Mini App.';

  return [
    { role: 'system', content: `${APP_BUILDER_SYSTEM_PROMPT}\n\n${HTML_RETRY_SYSTEM_PROMPT}` },
    { role: 'user', content: userBrief }
  ];
}

function isCompleteHtml(value) {
  const text = cleanHtmlResponse(value, 'app-builder').trim();
  return /^<!doctype html>/i.test(text) && /<html(?:\s|>)/i.test(text) && /<head(?:\s|>)/i.test(text) && /<body(?:\s|>)/i.test(text) && /<\/html>\s*$/i.test(text);
}

function cleanHtmlResponse(value, task) {
  let text = String(value || '').trim();
  if (task !== 'app-builder') return text;

  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.search(/<!doctype html>/i);
  if (start >= 0) text = text.slice(start);
  const end = text.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) text = text.slice(0, end + 7);
  return text.trim();
}

function htmlFailureReason(value) {
  const text = String(value || '').trim();
  if (!text) return 'empty response';
  if (!/<!doctype html>/i.test(text) && !/<html(?:\s|>)/i.test(text)) return 'response was not HTML';
  if (!/<head(?:\s|>)/i.test(text)) return 'missing <head>';
  if (!/<body(?:\s|>)/i.test(text)) return 'missing <body>';
  if (!/<\/html>/i.test(text)) return 'response was cut off before </html>';
  return 'extra or malformed output';
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

function dispatchRetry(detail) {
  try {
    window.dispatchEvent(new CustomEvent('digitbox-local-ai-retry', { detail }));
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
