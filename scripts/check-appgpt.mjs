import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'public', 'appgpt');

function assert(condition, message) {
  if (!condition) throw new Error(`AppGPT smoke check failed: ${message}`);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function walk(dir) {
  const rows = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) rows.push(...await walk(full));
    else rows.push(full);
  }
  return rows;
}

async function checkEscaper() {
  const source = await read('public/appgpt/app-state.js');
  const start = source.indexOf('export function esc');
  const end = source.indexOf('export function slug', start);
  assert(start >= 0 && end > start, 'could not locate esc() in app-state.js');

  const definition = source.slice(start, end).replace(/^export\s+/, '');
  const esc = Function(`${definition}; return esc;`)();
  const input = `A & B <tag> "quoted" 'single' \\ path`;
  const expected = `A &amp; B &lt;tag&gt; &quot;quoted&quot; &#39;single&#39; \\ path`;
  assert(esc(input) === expected, `esc() corrupted text: ${JSON.stringify(esc(input))}`);
}

async function checkRelativeImports() {
  const files = (await walk(appDir)).filter(file => file.endsWith('.js'));
  const importPattern = /\bimport\s+(?:[^'";]+?\s+from\s+)?['"](\.[^'"]+)['"]/g;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1].split(/[?#]/, 1)[0];
      const target = path.resolve(path.dirname(file), specifier);
      const candidates = path.extname(target) ? [target] : [`${target}.js`, path.join(target, 'index.js')];
      assert(candidates.some(existsSync), `${path.relative(root, file)} imports missing ${specifier}`);
    }
  }
}

async function checkIndexAssets() {
  const html = await read('public/appgpt/index.html');
  const refs = [
    ...html.matchAll(/<script[^>]+src="([^"]+)"/gi),
    ...html.matchAll(/<link[^>]+href="([^"]+)"/gi)
  ].map(match => match[1]);

  for (const ref of refs) {
    if (/^(?:https?:)?\/\//i.test(ref) || ref.startsWith('data:')) continue;
    const clean = ref.split(/[?#]/, 1)[0];
    const full = clean.startsWith('/')
      ? path.join(root, 'public', clean.replace(/^\/+/, ''))
      : path.resolve(appDir, clean);
    assert(existsSync(full), `index.html references missing asset ${ref}`);
  }
}

async function checkFreeAIConsistency() {
  const hooks = await read('public/appgpt/ai-switcher-hooks.js');
  const thinking = await read('public/appgpt/thinking.js');
  assert(hooks.includes('PROVIDERS.appgptFree'), 'free-AI switcher must read the live provider preset');
  assert(!/(?:Qwen2\.5-Coder|Llama-3\.2-1B|SmolLM2-360M)-[^'"\s]*/.test(hooks), 'free-AI switcher hardcodes a model and can drift from the runtime preset');

  const bootstrap = thinking.indexOf("'./free-ai-bootstrap.js'");
  const hooksImport = thinking.indexOf("'./ai-switcher-hooks.js'");
  assert(bootstrap >= 0 && hooksImport > bootstrap, 'free AI bootstrap must load before switcher compatibility hooks');
}

await checkEscaper();
await checkRelativeImports();
await checkIndexAssets();
await checkFreeAIConsistency();

console.log('AppGPT smoke checks passed.');
