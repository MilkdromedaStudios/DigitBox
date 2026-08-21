import { callProvider, PROVIDERS } from './providers.js';
import { saveChat } from './storage.js';
import { auditHtml } from './preview-tools.js';
import { S, config, id, nextVersion, infer, progress, resetProgress, note, success, failHaptic } from './app-state.js';
import {
  PROMPT_VERSION,
  BUILDER_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  EDIT_SYSTEM_SUFFIX,
  REPAIR_SYSTEM_SUFFIX,
  REVIEWER_SYSTEM_PROMPT
} from './prompts.js';

const MAX = 30;

export function draft(title = 'New app') {
  const now = new Date().toISOString();
  return {
    id: id(),
    title,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    messages: [],
    artifacts: [],
    project: { name: title, prompt: '', html: '', latestArtifactId: null },
    audit: []
  };
}

export async function ensureDraft(title = 'New app') {
  if (!S.chat || S.chat.status !== 'draft' || S.chat.artifacts?.length) {
    S.chat = draft(title);
    await persist();
  }
  return S.chat;
}

export async function runBuild(request, { title, quality = 'fast', image = null } = {}) {
  if (S.busy) return;
  const c = config();
  if (!c.apiKey) throw new Error('Add an API key first.');
  if (image && PROVIDERS[c.provider]?.vision === false) {
    throw new Error(`${PROVIDERS[c.provider].name} is not configured for image input.`);
  }

  await ensureDraft(title || infer(request));
  S.busy = true;
  resetProgress();

  const pending = await startPending(request, title || S.chat.title, Boolean(image));
  progress(6, 'Chat saved', 'The chat exists before the AI request starts.', false, 'Saved the build request immediately.');

  try {
    let plan = '';

    if (quality === 'reviewed') {
      progress(12, 'Planning', `Asking ${PROVIDERS[c.provider].name} for a concise implementation plan.`, true);
      plan = await callProvider(
        c,
        [
          { role: 'system', content: PLANNER_SYSTEM_PROMPT },
          { role: 'user', content: request }
        ],
        { maxTokens: 900, temperature: 0.2 }
      );
      progress(22, 'Plan ready', 'Starting the main generation with the reviewed plan.', false);
      split(plan).forEach(note);
    } else {
      note('Fast mode: using the full Telegram engineering spec without a separate planner call.');
    }

    const content = image
      ? [
          {
            type: 'text',
            text: `Use the attached screenshot as a layout/style reference while implementing this Telegram Mini App. Follow the advanced builder specification and keep the result responsive and functional.\n\n${request}`
          },
          { type: 'image', dataUrl: image }
        ]
      : `Build this Telegram Mini App:\n\n${request}`;

    const system = plan
      ? `${BUILDER_SYSTEM_PROMPT}\n\nVISIBLE IMPLEMENTATION PLAN\nUse this plan as guidance, but correct it if it conflicts with the user's request or the builder specification:\n${plan}`
      : BUILDER_SYSTEM_PROMPT;

    progress(
      quality === 'reviewed' ? 28 : 14,
      `Generating with ${PROVIDERS[c.provider].name}`,
      'Waiting for the complete single-file app. Your chat is already saved.',
      true
    );

    let html = await callProvider(
      c,
      [
        { role: 'system', content: system },
        { role: 'user', content }
      ],
      { maxTokens: 18000, temperature: 0.28, responseMode: 'html' }
    );

    progress(quality === 'reviewed' ? 56 : 70, 'AI response received', 'Extracting and checking the HTML.', false);
    html = extract(html);
    validate(html);

    let issues = auditHtml(html);
    progress(quality === 'reviewed' ? 62 : 82, 'Static audit complete', summary(issues), false);

    if (quality === 'reviewed') {
      progress(
        68,
        'Reviewer running',
        'A second agent is checking functionality, Telegram behavior, security, reliability, and mobile UX.',
        true
      );

      const raw = await callProvider(
        c,
        [
          { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `USER REQUEST:\n${request}\n\nSTATIC AUDIT:\n${
              issues.map(x => `${x.severity}: ${x.title} — ${x.detail}`).join('\n') || 'No issues'
            }\n\nGENERATED HTML:\n${html}`
          }
        ],
        { maxTokens: 1600, temperature: 0.1 }
      );

      const r = parseReview(raw);
      note(r.summary || 'Reviewer completed its pass.');
      (r.issues || []).slice(0, 6).forEach(x => note(`Review: ${x}`));

      if (r.repair && r.issues.length) {
        progress(78, 'Repairing', 'Reviewer found material issues. Rebuilding the complete HTML.', true);

        html = await callProvider(
          c,
          [
            { role: 'system', content: `${BUILDER_SYSTEM_PROMPT}${REPAIR_SYSTEM_SUFFIX}` },
            {
              role: 'user',
              content: `ORIGINAL USER REQUEST:\n${request}\n\nREVIEW ISSUES TO FIX:\n- ${r.issues.join(
                '\n- '
              )}\n\nCURRENT HTML:\n${html}`
            }
          ],
          { maxTokens: 18000, temperature: 0.16, responseMode: 'html' }
        );

        html = extract(html);
        validate(html);
        issues = auditHtml(html);
        progress(88, 'Repair validated', 'The repaired file passed structural validation and was re-audited.', false);
      } else {
        progress(86, 'Review passed', 'No repair pass was required.', false);
      }
    }

    await finish(html, pending, request, issues, quality === 'reviewed' ? 'reviewed build' : 'fast build');
    progress(96, 'Artifact saved', 'index.html is stored in the chat. Loading preview…', false, 'Saved a versioned index.html artifact.');
    return html;
  } catch (e) {
    await failPending(pending, e);
    progress(0, 'Build failed', e.message || 'Generation failed', false, '', true);
    failHaptic();
    throw e;
  } finally {
    S.busy = false;
  }
}

export async function editCurrent(request) {
  const old = latestLocal();
  if (!old) throw new Error('Generate or open an app first.');
  if (!request) throw new Error('Describe the edit first.');

  const c = config();
  if (!c.apiKey) throw new Error('Add an API key first.');

  S.busy = true;
  resetProgress();
  const pending = await addPending(request, 'Applying edit…');
  progress(7, 'Edit saved', 'The edit request is stored before the AI call.', false);

  try {
    progress(16, `Editing with ${PROVIDERS[c.provider].name}`, 'Waiting for a complete replacement index.html.', true);

    let html = await callProvider(
      c,
      [
        { role: 'system', content: `${BUILDER_SYSTEM_PROMPT}${EDIT_SYSTEM_SUFFIX}` },
        { role: 'user', content: `CURRENT HTML:\n${old.content}\n\nNEW REQUEST:\n${request}` }
      ],
      { maxTokens: 18000, temperature: 0.2, responseMode: 'html' }
    );

    progress(72, 'Edit received', 'Extracting and validating replacement HTML.', false);
    html = extract(html);
    validate(html);

    await finish(html, pending, S.chat.project?.prompt || request, auditHtml(html), 'AI edit');
    progress(96, 'New version saved', 'Loading the edited preview…', false);
    return html;
  } catch (e) {
    await failPending(pending, e);
    progress(0, 'Edit failed', e.message, false, '', true);
    throw e;
  } finally {
    S.busy = false;
  }
}

export async function autoRepair(diagnostics) {
  const old = latestLocal();
  if (!old) throw new Error('Open an app first.');
  if (!diagnostics) throw new Error('No issues to repair.');
  const c = config();
  if (!c.apiKey) throw new Error('Add an API key first.');

  S.busy = true;
  resetProgress();
  const pending = await addPending('Auto-fix detected preview and audit issues.', 'Repairing detected issues…');
  progress(10, 'Repair saved', 'Preparing the current HTML and diagnostics.', false);

  try {
    progress(18, `Repairing with ${PROVIDERS[c.provider].name}`, 'Waiting for a complete corrected index.html.', true);

    let html = await callProvider(
      c,
      [
        { role: 'system', content: `${BUILDER_SYSTEM_PROMPT}${REPAIR_SYSTEM_SUFFIX}` },
        { role: 'user', content: `DIAGNOSTICS:\n${diagnostics}\n\nCURRENT HTML:\n${old.content}` }
      ],
      { maxTokens: 18000, temperature: 0.14, responseMode: 'html' }
    );

    html = extract(html);
    validate(html);
    await finish(html, pending, S.chat.project?.prompt || 'Repair app', auditHtml(html), 'automatic repair');
    progress(96, 'Repair saved', 'Loading the repaired preview.', false);
    return html;
  } catch (e) {
    await failPending(pending, e);
    progress(0, 'Repair failed', e.message, false, '', true);
    throw e;
  } finally {
    S.busy = false;
  }
}

export async function saveManual(html, source = 'visual edit') {
  validate(html);
  const now = new Date().toISOString();
  const v = nextVersion();
  const a = {
    id: id(),
    filename: 'index.html',
    version: v,
    mime: 'text/html',
    content: html,
    createdAt: now,
    source,
    promptVersion: PROMPT_VERSION,
    bytes: new Blob([html]).size
  };

  S.chat.artifacts = [...(S.chat.artifacts || []), a].slice(-MAX);
  S.chat.updatedAt = now;
  S.chat.status = 'ready';
  S.chat.audit = auditHtml(html);
  S.chat.project = { ...(S.chat.project || {}), html, latestArtifactId: a.id };
  S.chat.messages.push({
    id: id(),
    role: 'assistant',
    content: `${source} saved as index.html · v${v}`,
    artifactId: a.id,
    status: 'ready',
    ts: now
  });

  await persist();
  success();
  return a;
}

async function startPending(request, title, image) {
  S.chat.title = title;
  S.chat.status = 'building';
  S.chat.updatedAt = new Date().toISOString();
  S.chat.project = { ...(S.chat.project || {}), name: title, prompt: request };
  return addPending(request, `Building ${title}…`, image);
}

async function addPending(userText, assistantText, image = false) {
  const now = new Date().toISOString();
  const pid = id();
  S.chat.status = 'building';
  S.chat.updatedAt = now;
  S.chat.messages.push({ id: id(), role: 'user', content: userText, ts: now, imageAttached: Boolean(image) });
  S.chat.messages.push({ id: pid, role: 'assistant', content: assistantText, status: 'building', ts: now });
  await persist();
  return pid;
}

async function finish(html, pid, prompt, issues, source) {
  const now = new Date().toISOString();
  const v = nextVersion();
  const a = {
    id: id(),
    filename: 'index.html',
    version: v,
    mime: 'text/html',
    content: html,
    createdAt: now,
    source,
    promptVersion: PROMPT_VERSION,
    bytes: new Blob([html]).size
  };

  S.chat.updatedAt = now;
  S.chat.status = 'ready';
  S.chat.audit = issues;
  S.chat.artifacts = [...(S.chat.artifacts || []), a].slice(-MAX);
  S.chat.project = { ...(S.chat.project || {}), name: S.chat.title, prompt, html, latestArtifactId: a.id };

  const p = S.chat.messages.find(x => x.id === pid);
  if (p) {
    p.content = `Created index.html · v${v}`;
    p.status = 'ready';
    p.artifactId = a.id;
    p.ts = now;
  }

  await persist();
  success();
}

async function failPending(pid, e) {
  const now = new Date().toISOString();
  S.chat.status = 'error';
  S.chat.updatedAt = now;
  const p = S.chat.messages.find(x => x.id === pid);
  if (p) {
    p.content = `Build failed: ${e.message || 'Unknown error'}`;
    p.status = 'error';
    p.ts = now;
  }
  await persist();
}

async function persist() {
  await saveChat(S.chat);
  window.dispatchEvent(new CustomEvent('appgpt-chat-changed'));
}

function latestLocal() {
  const key = S.chat?.project?.latestArtifactId;
  return key ? S.chat?.artifacts?.find(a => a.id === key) : S.chat?.artifacts?.at(-1) || null;
}

export function extract(raw) {
  let t = String(raw || '').trim();
  try {
    const p = JSON.parse(t);
    if (p?.html) t = p.html;
  } catch {}

  const f = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (f) t = f[1].trim();

  const s = t.search(/<!doctype html>|<html[\s>]/i);
  if (s > 0) t = t.slice(s);

  const e = t.toLowerCase().lastIndexOf('</html>');
  if (e >= 0) t = t.slice(0, e + 7);

  return t.trim();
}

export function validate(html) {
  if (
    !/<!doctype html>|<html[\s>]/i.test(html) ||
    !/<head[\s>]/i.test(html) ||
    !/<body[\s>]/i.test(html) ||
    !/<\/html>/i.test(html)
  ) {
    throw new Error('The model did not return a complete HTML document.');
  }
}

function parseReview(raw) {
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    const p = JSON.parse(m ? m[0] : raw);
    return {
      repair: Boolean(p.repair),
      issues: Array.isArray(p.issues) ? p.issues.map(String) : [],
      summary: String(p.summary || '')
    };
  } catch {
    return { repair: false, issues: [], summary: String(raw).slice(0, 400) };
  }
}

function split(t) {
  return String(t)
    .split(/\r?\n/)
    .map(x => x.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 7);
}

function summary(i) {
  return `${i.filter(x => x.severity === 'error').length} errors and ${
    i.filter(x => x.severity === 'warning').length
  } warnings detected.`;
}