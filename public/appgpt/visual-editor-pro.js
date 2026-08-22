import { S, E, latest, toast, haptic } from './app-state.js';
import { saveManual } from './build-engine.js';
import {
  applyVisualPatch,
  applyVisualMove,
  applyVisualMoveRelative,
  applyVisualInsert,
  applyVisualDelete,
  applyVisualDuplicate,
  applyVisualAction
} from './preview-tools.js';

let selection = null;
let saving = false;

requestAnimationFrame(init);

function init() {
  const panel = E.visualPanel || document.getElementById('visualPanel');
  if (!panel || document.getElementById('visualProEditor')) return;

  const pro = document.createElement('div');
  pro.id = 'visualProEditor';
  pro.className = 'visual-pro-editor';
  pro.innerHTML = `
    <div class="visual-pro-intro">
      <div><strong>Direct design mode</strong><span>Click an element, then drag it in the phone preview to move it. Every change creates a new HTML version.</span></div>
      <span class="tiny-pill">No AI call</span>
    </div>

    <div class="visual-pro-toolbar">
      <button type="button" data-vpro-move="up">↑ Move up</button>
      <button type="button" data-vpro-move="down">↓ Move down</button>
      <button type="button" id="visualProDuplicate">⧉ Duplicate</button>
      <button type="button" id="visualProDelete" class="danger">⌫ Delete</button>
    </div>

    <section class="visual-pro-block">
      <div class="visual-pro-title"><strong>Custom styling</strong><span>Use any valid CSS value — hex, rgb(), gradients, transparency, shadows, etc.</span></div>
      <div class="visual-pro-grid">
        <label>Element ID<input id="visualProId" type="text" placeholder="details"></label>
        <label>Text color<input id="visualProColor" type="text" placeholder="#fff or rgba(...)"></label>
        <label class="wide">Background<input id="visualProBackground" type="text" placeholder="linear-gradient(135deg,#7c5cff,#38bdf8)"></label>
        <label>Border<input id="visualProBorder" type="text" placeholder="1px solid #ffffff22"></label>
        <label>Shadow<input id="visualProShadow" type="text" placeholder="0 12px 30px rgba(0,0,0,.2)"></label>
        <label>Margin<input id="visualProMargin" type="text" placeholder="8px 0"></label>
        <label>Width<input id="visualProWidth" type="text" placeholder="100% or 220px"></label>
        <label>Height<input id="visualProHeight" type="text" placeholder="auto or 48px"></label>
        <label>Opacity<input id="visualProOpacity" type="text" placeholder="1"></label>
      </div>
      <button type="button" class="primary-btn visual-pro-apply" id="visualProApplyStyles">Apply custom styles</button>
    </section>

    <section class="visual-pro-block">
      <div class="visual-pro-title"><strong>Make it do something</strong><span>Assign a real click action without asking the AI to regenerate the app.</span></div>
      <div class="visual-pro-action-row">
        <select id="visualProAction">
          <option value="none">No added action</option>
          <option value="open-url">Open URL</option>
          <option value="message">Show message</option>
          <option value="toggle">Show / hide element</option>
          <option value="scroll">Scroll to element</option>
        </select>
        <input id="visualProActionValue" type="text" placeholder="Action value">
        <button type="button" class="secondary-btn" id="visualProSetAction">Set action</button>
      </div>
      <p class="visual-pro-help" id="visualProActionHelp">Select an action. For toggle/scroll, use a selector such as <code>#details</code>.</p>
    </section>

    <section class="visual-pro-block">
      <div class="visual-pro-title"><strong>Add an element</strong><span>Insert a working component next to or inside the selected element.</span></div>
      <div class="visual-pro-add-grid">
        <label>Element<select id="visualProAddType"><option value="button">Button</option><option value="text">Text</option><option value="card">Card</option><option value="input">Input</option><option value="link">Link</option><option value="section">Section</option><option value="divider">Divider</option></select></label>
        <label>Placement<select id="visualProPlacement"><option value="after">After selected</option><option value="before">Before selected</option><option value="inside">Inside selected</option></select></label>
        <label class="wide">Text / label<input id="visualProAddText" type="text" placeholder="Open settings"></label>
        <label>Action<select id="visualProAddAction"><option value="none">None</option><option value="open-url">Open URL</option><option value="message">Show message</option><option value="toggle">Show / hide</option><option value="scroll">Scroll to</option></select></label>
        <label>Action value<input id="visualProAddActionValue" type="text" placeholder="https://… or #details"></label>
      </div>
      <button type="button" class="primary-btn visual-pro-apply" id="visualProAdd">＋ Add element</button>
    </section>
  `;
  panel.appendChild(pro);

  document.getElementById('visualProApplyStyles').addEventListener('click', applyStyles);
  document.getElementById('visualProSetAction').addEventListener('click', setAction);
  document.getElementById('visualProAdd').addEventListener('click', addElement);
  document.getElementById('visualProDuplicate').addEventListener('click', duplicateSelected);
  document.getElementById('visualProDelete').addEventListener('click', deleteSelected);
  pro.querySelectorAll('[data-vpro-move]').forEach(btn => btn.addEventListener('click', () => moveRelative(btn.dataset.vproMove)));
  document.getElementById('visualProAction').addEventListener('change', updateActionHelp);
  document.getElementById('visualProAddAction').addEventListener('change', updateAddActionPlaceholder);
  updateActionHelp();
  updateAddActionPlaceholder();
  syncEnabled();

  window.addEventListener('message', onPreviewMessage);
  window.addEventListener('appgpt-chat-changed', () => {
    selection = null;
    syncEnabled();
  });
}

function onPreviewMessage(event) {
  const data = event.data;
  if (!data || data.source !== 'appgpt-preview') return;
  if (data.type === 'visual-select') {
    selection = data;
    fillSelection(data);
    syncEnabled();
  }
  if (data.type === 'visual-move') commitDrag(data);
}

function fillSelection(data) {
  setValue('visualProId', data.id || '');
  setValue('visualProColor', data.styles?.color || '');
  setValue('visualProBackground', data.styles?.background || data.styles?.backgroundColor || '');
  setValue('visualProBorder', data.styles?.border || '');
  setValue('visualProShadow', normalizeNone(data.styles?.boxShadow));
  setValue('visualProMargin', data.styles?.margin || '');
  setValue('visualProWidth', data.styles?.width || '');
  setValue('visualProHeight', data.styles?.height || '');
  setValue('visualProOpacity', data.styles?.opacity || '1');
  setValue('visualProAction', data.action?.type || 'none');
  setValue('visualProActionValue', data.action?.value || '');
  updateActionHelp();
}

async function applyStyles() {
  const artifact = latest();
  if (!artifact || !selection) return toast('Select an element in the preview first.');
  const patch = {
    id: value('visualProId'),
    styles: {
      color: value('visualProColor'),
      background: value('visualProBackground'),
      border: value('visualProBorder'),
      boxShadow: value('visualProShadow'),
      margin: value('visualProMargin'),
      width: value('visualProWidth'),
      height: value('visualProHeight'),
      opacity: value('visualProOpacity')
    }
  };
  await commit(() => applyVisualPatch(artifact.content, selection.path, patch), 'Visual custom styles', 'Custom styles saved');
}

async function setAction() {
  const artifact = latest();
  if (!artifact || !selection) return toast('Select a button or element first.');
  const action = value('visualProAction');
  const actionValue = value('visualProActionValue');
  await commit(() => applyVisualAction(artifact.content, selection.path, action, actionValue), 'Visual action', action === 'none' ? 'Added action removed' : 'Action saved');
}

async function addElement() {
  const artifact = latest();
  if (!artifact) return toast('Generate an app first.');
  const spec = {
    type: value('visualProAddType'),
    placement: selection ? value('visualProPlacement') : 'inside',
    text: value('visualProAddText'),
    action: value('visualProAddAction'),
    actionValue: value('visualProAddActionValue')
  };
  let createdSelector = '';
  await commit(() => {
    const result = applyVisualInsert(artifact.content, selection?.path || 'body', spec);
    createdSelector = result.selector;
    return result.html;
  }, 'Visual add element', 'Element added');
  if (createdSelector) toast(`Added ${createdSelector}. Click it in the preview to style or drag it.`);
}

async function duplicateSelected() {
  const artifact = latest();
  if (!artifact || !selection) return toast('Select an element first.');
  await commit(() => applyVisualDuplicate(artifact.content, selection.path), 'Visual duplicate', 'Element duplicated');
}

async function deleteSelected() {
  const artifact = latest();
  if (!artifact || !selection) return toast('Select an element first.');
  if (!window.confirm('Delete the selected element? A new version will be saved.')) return;
  await commit(() => applyVisualDelete(artifact.content, selection.path), 'Visual delete', 'Element deleted');
}

async function moveRelative(direction) {
  const artifact = latest();
  if (!artifact || !selection) return toast('Select an element first.');
  await commit(() => applyVisualMoveRelative(artifact.content, selection.path, direction), 'Visual move', `Element moved ${direction}`);
}

async function commitDrag(data) {
  const artifact = latest();
  if (!artifact || saving) return;
  await commit(() => applyVisualMove(artifact.content, data.sourcePath, data.targetPath, data.position), 'Visual drag', 'Element moved');
}

async function commit(makeHtml, source, message) {
  if (saving) return;
  saving = true;
  syncEnabled();
  try {
    const html = makeHtml();
    await saveManual(html, source);
    selection = null;
    S.selected = null;
    haptic('selection');
    toast(message);
  } catch (error) {
    toast(error?.message || 'Visual edit failed.');
  } finally {
    saving = false;
    syncEnabled();
  }
}

function syncEnabled() {
  const hasSelection = Boolean(selection && latest());
  ['visualProApplyStyles', 'visualProSetAction', 'visualProDuplicate', 'visualProDelete'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = saving || !hasSelection;
  });
  document.querySelectorAll('[data-vpro-move]').forEach(el => { el.disabled = saving || !hasSelection; });
  const add = document.getElementById('visualProAdd');
  if (add) add.disabled = saving || !latest();
}

function updateActionHelp() {
  const action = value('visualProAction');
  const input = document.getElementById('visualProActionValue');
  const help = document.getElementById('visualProActionHelp');
  const map = {
    none: ['No value needed.', 'Action value'],
    'open-url': ['Opens an HTTPS, Telegram, mail, relative, or anchor URL.', 'https://example.com'],
    message: ['Shows a Telegram popup when available, with a browser fallback.', 'Saved!'],
    toggle: ['Shows or hides the first element matching a CSS selector.', '#details'],
    scroll: ['Smoothly scrolls to the first element matching a CSS selector.', '#pricing']
  };
  const [text, placeholder] = map[action] || map.none;
  if (help) help.textContent = text;
  if (input) { input.placeholder = placeholder; input.disabled = action === 'none'; }
}

function updateAddActionPlaceholder() {
  const action = value('visualProAddAction');
  const input = document.getElementById('visualProAddActionValue');
  const map = { none: 'No value needed', 'open-url': 'https://…', message: 'Message text', toggle: '#details', scroll: '#section' };
  if (input) { input.placeholder = map[action] || 'Action value'; input.disabled = action === 'none'; }
}

function value(id) { return document.getElementById(id)?.value?.trim() || ''; }
function setValue(id, next) { const el = document.getElementById(id); if (el) el.value = next ?? ''; }
function normalizeNone(v) { return !v || v === 'none' ? '' : v; }
