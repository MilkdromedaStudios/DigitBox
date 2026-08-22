import './appearance.js';

const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';
const PROVIDER_CONFIG_KEY = 'appgpt_provider_config';
migrateLegacyGeminiDefault();

export const PROVIDERS = {
  openai: { name: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', vision: true, hint: 'OpenAI-compatible chat endpoint' },
  openrouter: { name: 'OpenRouter', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-5-mini', vision: true, hint: 'Many models through one API' },
  huggingface: {
    name: 'Hugging Face',
    kind: 'openai-compatible',
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest',
    vision: true,
    hint: 'Hugging Face Inference Providers router · LLMs and VLMs',
    modelHint: 'Use any chat-capable Hugging Face model ID. Routing suffixes like :fastest, :cheapest, and :preferred are supported.',
    models: [
      'Qwen/Qwen3-Coder-480B-A35B-Instruct:fastest',
      'openai/gpt-oss-120b:fastest',
      'deepseek-ai/DeepSeek-R1:fastest',
      'Qwen/Qwen2.5-Coder-32B-Instruct:fastest',
      'Qwen/Qwen3-4B-Thinking-2507:fastest',
      'Qwen/Qwen2.5-7B-Instruct-1M:fastest',
      'google/gemma-2-2b-it:fastest',
      'zai-org/GLM-4.5V:fastest',
      'Qwen/Qwen2.5-VL-3B-Instruct:fastest'
    ]
  },
  groq: { name: 'Groq', kind: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', vision: false, hint: 'Fast OpenAI-compatible inference' },
  deepseek: { name: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', vision: false, hint: 'OpenAI-compatible API' },
  mistral: { name: 'Mistral', kind: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', vision: false, hint: 'Mistral chat completions' },
  together: { name: 'Together AI', kind: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', vision: false, hint: 'Open-source model hosting' },
  xai: { name: 'xAI', kind: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini', vision: true, hint: 'OpenAI-style chat API' },
  gemini: { name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: GEMINI_DEFAULT_MODEL, vision: true, hint: 'Gemini multimodal generateContent API · 3.5 Flash default' },
  anthropic: { name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-0', vision: true, hint: 'Claude Messages API' },
  custom: { name: 'Custom OpenAI-compatible', kind: 'openai-compatible', baseUrl: 'https://example.com/v1', model: 'your-model', vision: true, hint: 'Any compatible /chat/completions endpoint' }
};

function migrateLegacyGeminiDefault() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROVIDER_CONFIG_KEY) || 'null');
    if (!saved || saved.provider !== 'gemini') return;
    if (!saved.model || saved.model === 'gemini-2.5-flash' || saved.model === 'gemini-2.5-flash-001') {
      saved.model = GEMINI_DEFAULT_MODEL;
      localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(saved));
    }
  } catch {}
}

function trimSlash(url) { return String(url || '').replace(/\/+$/, ''); }

export async function callProvider(config, messages, options = {}) {
  const { temperature = 0.35, maxTokens = 9000, responseMode = 'text', thinkingBudget, thinkingLevel } = options;
  if (!config?.apiKey) throw new Error('Add an API key first.');
  if (!config?.model) throw new Error('Choose a model first.');
  if (!config?.baseUrl) throw new Error('Add a provider base URL first.');
  if (config.kind === 'gemini') return callGemini(config, messages, { temperature, maxTokens, responseMode, thinkingBudget, thinkingLevel });
  if (config.kind === 'anthropic') return callAnthropic(config, messages, { temperature, maxTokens });
  return callOpenAICompatible(config, messages, { temperature, maxTokens });
}

async function callOpenAICompatible(config, messages, { temperature, maxTokens }) {
  const response = await fetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...(config.provider === 'openrouter' ? { 'HTTP-Referer': location.origin, 'X-Title': 'AppGPT' } : {})
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(toOpenAIMessage),
      temperature,
      max_tokens: maxTokens
    })
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(extractError(data, response.status));
  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map(p => p?.text || '').join('') : content;
  if (!text) throw new Error('Provider returned an empty response.');
  return text;
}

function toOpenAIMessage(message) {
  if (!Array.isArray(message.content)) return message;
  return {
    role: message.role,
    content: message.content.map(part => {
      if (part.type === 'image') return { type: 'image_url', image_url: { url: part.dataUrl } };
      return { type: 'text', text: part.text || '' };
    })
  };
}

async function callGemini(config, messages, { temperature, maxTokens, responseMode, thinkingBudget, thinkingLevel }) {
  const system = messages.filter(m => m.role === 'system').map(m => flattenText(m.content)).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m.content)
  }));

  const name = String(config.model || '').toLowerCase();
  const isGemini3 = /^gemini-3(?:\.|-|$)/.test(name);
  const thinkingConfig = geminiThinkingConfig(config.model, { thinkingBudget, thinkingLevel });
  const generationConfig = {
    maxOutputTokens: maxTokens,
    ...(!isGemini3 ? { temperature } : {}),
    ...(thinkingConfig ? { thinkingConfig } : {})
  };
  if (responseMode === 'html') {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = {
      type: 'object',
      properties: { html: { type: 'string', description: 'One complete HTML document beginning with <!doctype html> and ending with </html>.' } },
      required: ['html']
    };
  }

  const response = await fetch(`${trimSlash(config.baseUrl)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig
    })
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(extractError(data, response.status));
  reportGeminiUsage(config, data?.usageMetadata, thinkingConfig);
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
  if (!text) throw new Error('Gemini returned an empty response.');
  if (responseMode === 'html') {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.html) return parsed.html;
    } catch {}
  }
  return text;
}

function geminiThinkingConfig(model, explicit = {}) {
  const name = String(model || '').toLowerCase();
  if (/^gemini-3(?:\.|-|$)/.test(name)) {
    const level = String(explicit.thinkingLevel || 'LOW').toUpperCase();
    return { thinkingLevel: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'].includes(level) ? level : 'LOW' };
  }
  if (Number.isFinite(explicit.thinkingBudget)) return { thinkingBudget: Math.trunc(explicit.thinkingBudget) };
  // Keep legacy 2.5 Flash predictable if somebody deliberately switches back.
  if (/^gemini-2\.5-flash(?:-|$)/.test(name)) return { thinkingBudget: 0 };
  return null;
}

function reportGeminiUsage(config, usage, thinkingConfig) {
  if (!usage) return;
  const detail = {
    provider: 'gemini',
    model: config.model,
    promptTokens: Number(usage.promptTokenCount || 0),
    outputTokens: Number(usage.candidatesTokenCount || 0),
    thoughtTokens: Number(usage.thoughtsTokenCount || 0),
    cachedTokens: Number(usage.cachedContentTokenCount || 0),
    totalTokens: Number(usage.totalTokenCount || 0),
    thinkingBudget: Number.isFinite(thinkingConfig?.thinkingBudget) ? thinkingConfig.thinkingBudget : null,
    thinkingLevel: thinkingConfig?.thinkingLevel || ''
  };

  try {
    const key = 'appgpt_gemini_usage_session_v1';
    let totals = { calls: 0, promptTokens: 0, outputTokens: 0, thoughtTokens: 0, totalTokens: 0 };
    try { totals = { ...totals, ...(JSON.parse(sessionStorage.getItem(key) || '{}') || {}) }; } catch {}
    totals.calls += 1;
    totals.promptTokens += detail.promptTokens;
    totals.outputTokens += detail.outputTokens;
    totals.thoughtTokens += detail.thoughtTokens;
    totals.totalTokens += detail.totalTokens;
    sessionStorage.setItem(key, JSON.stringify(totals));
    detail.session = totals;
  } catch {}

  window.dispatchEvent(new CustomEvent('appgpt-provider-usage', { detail }));
}

function toGeminiParts(content) {
  if (!Array.isArray(content)) return [{ text: String(content || '') }];
  return content.map(part => {
    if (part.type === 'image') {
      const parsed = parseDataUrl(part.dataUrl);
      return { inlineData: { mimeType: parsed.mime, data: parsed.base64 } };
    }
    return { text: part.text || '' };
  });
}

async function callAnthropic(config, messages, { temperature, maxTokens }) {
  const system = messages.filter(m => m.role === 'system').map(m => flattenText(m.content)).join('\n\n');
  const claudeMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: toAnthropicContent(m.content)
  }));
  const response = await fetch(`${trimSlash(config.baseUrl)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: claudeMessages
    })
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(extractError(data, response.status));
  const text = data?.content?.filter(x => x.type === 'text').map(x => x.text).join('\n');
  if (!text) throw new Error('Anthropic returned an empty response.');
  return text;
}

function toAnthropicContent(content) {
  if (!Array.isArray(content)) return String(content || '');
  return content.map(part => {
    if (part.type === 'image') {
      const parsed = parseDataUrl(part.dataUrl);
      return { type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.base64 } };
    }
    return { type: 'text', text: part.text || '' };
  });
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error('Could not read the selected image.');
  return { mime: match[1], base64: match[2] };
}

function flattenText(content) {
  if (!Array.isArray(content)) return String(content || '');
  return content.filter(x => x.type !== 'image').map(x => x.text || '').join('\n');
}

async function safeJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error: { message: text || response.statusText } }; }
}

function extractError(data, status) {
  return data?.error?.message || data?.message || `Request failed (${status}). This provider may block direct browser requests.`;
}
