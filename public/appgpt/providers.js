import './appearance.js';

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
  gemini: { name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', vision: true, hint: 'Gemini multimodal generateContent API' },
  anthropic: { name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-0', vision: true, hint: 'Claude Messages API' },
  custom: { name: 'Custom OpenAI-compatible', kind: 'openai-compatible', baseUrl: 'https://example.com/v1', model: 'your-model', vision: true, hint: 'Any compatible /chat/completions endpoint' }
};

function trimSlash(url) { return String(url || '').replace(/\/+$/, ''); }

export async function callProvider(config, messages, options = {}) {
  const { temperature = 0.35, maxTokens = 9000, responseMode = 'text' } = options;
  if (!config?.apiKey) throw new Error('Add an API key first.');
  if (!config?.model) throw new Error('Choose a model first.');
  if (!config?.baseUrl) throw new Error('Add a provider base URL first.');
  if (config.kind === 'gemini') return callGemini(config, messages, { temperature, maxTokens, responseMode });
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

async function callGemini(config, messages, { temperature, maxTokens, responseMode }) {
  const system = messages.filter(m => m.role === 'system').map(m => flattenText(m.content)).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m.content)
  }));

  const generationConfig = { temperature, maxOutputTokens: maxTokens };
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