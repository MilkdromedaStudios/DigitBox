export function auditHtml(html) {
  const issues = [];
  const text = String(html || '');
  if (!/<!doctype html>/i.test(text)) issues.push(issue('warning', 'Missing doctype', 'Add <!doctype html> for standards mode.'));
  if (!/<html[\s>]/i.test(text) || !/<\/html>/i.test(text)) issues.push(issue('error', 'Incomplete document', 'The file must contain a complete <html> document.'));
  const doc = new DOMParser().parseFromString(text, 'text/html');
  if (!doc.querySelector('meta[name="viewport"]')) issues.push(issue('warning', 'Missing mobile viewport', 'Telegram Mini Apps should define a mobile viewport meta tag.'));
  if (!text.includes('telegram.org/js/telegram-web-app.js')) issues.push(issue('warning', 'Telegram SDK not loaded', 'Load the official Telegram Web App bridge when Telegram APIs are used.'));
  if (!/Telegram\.WebApp\.ready\s*\(|\.ready\s*\(\s*\)/.test(text)) issues.push(issue('info', 'No Telegram ready() call detected', 'Calling Telegram.WebApp.ready() tells Telegram the Mini App is ready to display.'));
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) issues.push(issue('error', 'Unsafe dynamic JavaScript', 'Avoid eval() and new Function() in generated Mini Apps.'));
  if (/\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/.test(text)) issues.push(issue('error', 'Possible Telegram bot token exposed', 'Remove bot tokens from frontend HTML.'));
  if (/(sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,})/.test(text)) issues.push(issue('error', 'Possible API key exposed', 'Private provider keys must not be embedded in a public Mini App.'));
  const externalScripts = [...doc.querySelectorAll('script[src]')].map(x => x.src).filter(Boolean);
  if (externalScripts.length > 6) issues.push(issue('warning', 'Many external scripts', `${externalScripts.length} external scripts may slow Mini App startup.`));
  const imagesWithoutAlt = [...doc.querySelectorAll('img')].filter(img => !img.hasAttribute('alt')).length;
  if (imagesWithoutAlt) issues.push(issue('info', 'Images missing alt text', `${imagesWithoutAlt} image${imagesWithoutAlt === 1 ? '' : 's'} do not have alt text.`));
  return issues;
}

export function preparePreview(html, { visualEdit = false } = {}) {
  const bridge = `<script data-appgpt-bridge>${bridgeSource(Boolean(visualEdit))}<\/script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${bridge}</body>`);
  return `${html}${bridge}`;
}

function bridgeSource(visualEdit) {
  return `(function(){
var VISUAL=${visualEdit ? 'true' : 'false'};
var send=function(payload){parent.postMessage(Object.assign({source:'appgpt-preview'},payload),'*')};
var originalError=console.error.bind(console);
console.error=function(){try{send({type:'runtime-error',message:[].slice.call(arguments).map(String).join(' ')})}catch(e){}return originalError.apply(console,arguments)};
window.addEventListener('error',function(e){send({type:'runtime-error',message:e.message||'Runtime error',line:e.lineno||0,col:e.colno||0})});
window.addEventListener('unhandledrejection',function(e){send({type:'runtime-error',message:String((e.reason&&e.reason.message)||e.reason||'Unhandled promise rejection')})});
function path(el){var parts=[],node=el;while(node&&node.nodeType===1&&node!==document.documentElement){var tag=node.tagName.toLowerCase(),parent=node.parentElement;if(!parent){parts.unshift(tag);break}var siblings=[].slice.call(parent.children).filter(function(x){return x.tagName===node.tagName}),suffix=siblings.length>1?':nth-of-type('+(siblings.indexOf(node)+1)+')':'';parts.unshift(tag+suffix);node=parent}return 'html > '+parts.join(' > ')}
function editableTarget(node){if(!node||node.nodeType!==1)return null;return node.closest('button,a,input,textarea,select,article,section,li,nav,header,footer,main,div,p,h1,h2,h3,h4,img,label')||node}
function info(el){var cs=getComputedStyle(el);return{type:'visual-select',path:path(el),tag:el.tagName.toLowerCase(),id:el.id||'',text:el.children.length?'':(el.textContent||'').trim().slice(0,1000),action:{type:el.getAttribute('data-appgpt-action')||'none',value:el.getAttribute('data-appgpt-action-value')||''},styles:{color:cs.color,background:cs.background,backgroundColor:cs.backgroundColor,fontSize:cs.fontSize,borderRadius:cs.borderRadius,padding:cs.padding,margin:cs.margin,width:cs.width,height:cs.height,border:cs.border,boxShadow:cs.boxShadow,opacity:cs.opacity,gap:cs.gap}}}
if(VISUAL){
 var style=document.createElement('style');style.setAttribute('data-appgpt-visual-style','');style.textContent='[data-appgpt-selected="true"]{outline:2px solid #7c6cff!important;outline-offset:2px!important;cursor:grab!important}[data-appgpt-selected="true"]:active{cursor:grabbing!important}[data-appgpt-dragging="true"]{opacity:.45!important}.appgpt-drop-before{box-shadow:0 -3px 0 #63d8ff!important}.appgpt-drop-after{box-shadow:0 3px 0 #63d8ff!important}';document.head.appendChild(style);
 var selected=null,dragSource=null,dropTarget=null,dropPosition='after';
 function clearDrop(){if(dropTarget){dropTarget.classList.remove('appgpt-drop-before','appgpt-drop-after')}dropTarget=null}
 function select(el){if(!el||el===document.documentElement||el===document.body)return;if(selected&&selected!==el){selected.removeAttribute('data-appgpt-selected');selected.removeAttribute('draggable')}selected=el;selected.setAttribute('data-appgpt-selected','true');selected.setAttribute('draggable','true');send(info(selected))}
 document.addEventListener('click',function(e){var el=editableTarget(e.target);if(!el)return;e.preventDefault();e.stopPropagation();select(el)},true);
 document.addEventListener('dragstart',function(e){var el=e.target.closest&&e.target.closest('[data-appgpt-selected="true"]');if(!el)return;dragSource=el;dragSource.setAttribute('data-appgpt-dragging','true');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',path(el))}catch(err){}send({type:'visual-drag-start',path:path(el)})},true);
 document.addEventListener('dragover',function(e){if(!dragSource)return;var target=editableTarget(e.target);if(!target||target===dragSource||dragSource.contains(target))return;e.preventDefault();clearDrop();dropTarget=target;var r=target.getBoundingClientRect(),parentStyle=target.parentElement?getComputedStyle(target.parentElement):null,row=parentStyle&&/row/.test(parentStyle.flexDirection);dropPosition=row?(e.clientX<r.left+r.width/2?'before':'after'):(e.clientY<r.top+r.height/2?'before':'after');target.classList.add(dropPosition==='before'?'appgpt-drop-before':'appgpt-drop-after');try{e.dataTransfer.dropEffect='move'}catch(err){}},true);
 document.addEventListener('drop',function(e){if(!dragSource||!dropTarget)return;e.preventDefault();e.stopPropagation();var sourcePath=path(dragSource),targetPath=path(dropTarget),position=dropPosition;clearDrop();send({type:'visual-move',sourcePath:sourcePath,targetPath:targetPath,position:position})},true);
 document.addEventListener('dragend',function(){if(dragSource)dragSource.removeAttribute('data-appgpt-dragging');dragSource=null;clearDrop()},true);
 document.documentElement.style.cursor='crosshair';
}
send({type:'preview-ready'});
})();`;
}

export function applyVisualPatch(html, selector, patch = {}) {
  const { doc, el } = resolve(html, selector);
  if (Object.prototype.hasOwnProperty.call(patch, 'text') && el.children.length === 0) el.textContent = String(patch.text ?? '');
  if (Object.prototype.hasOwnProperty.call(patch, 'id')) {
    const value = String(patch.id || '').trim();
    if (value && !/^[A-Za-z][A-Za-z0-9_:\-.]*$/.test(value)) throw new Error('Element ID must start with a letter and use letters, numbers, -, _, : or .');
    if (value) el.id = value; else el.removeAttribute('id');
  }
  const legacyKeys = ['color', 'backgroundColor', 'fontSize', 'borderRadius', 'padding'];
  for (const key of legacyKeys) {
    if (patch[key] !== undefined && patch[key] !== '') el.style[key] = patch[key];
  }
  if (patch.styles && typeof patch.styles === 'object') {
    const allowed = ['color', 'background', 'backgroundColor', 'fontSize', 'borderRadius', 'padding', 'margin', 'width', 'height', 'border', 'boxShadow', 'opacity', 'gap', 'transform'];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(patch.styles, key)) continue;
      el.style[key] = String(patch.styles[key] ?? '');
    }
  }
  return serialize(doc);
}

export function applyVisualMove(html, sourceSelector, targetSelector, position = 'after') {
  const doc = parse(html);
  const source = query(doc, sourceSelector, 'The dragged element');
  const target = query(doc, targetSelector, 'The drop target');
  if (source === target || source.contains(target)) throw new Error('That move would place an element inside itself.');
  if (!target.parentNode) throw new Error('That drop target cannot accept an element.');
  if (position === 'before') target.parentNode.insertBefore(source, target);
  else target.parentNode.insertBefore(source, target.nextSibling);
  return serialize(doc);
}

export function applyVisualMoveRelative(html, selector, direction) {
  const { doc, el } = resolve(html, selector);
  const parent = el.parentElement;
  if (!parent) throw new Error('This element cannot be moved.');
  if (direction === 'up') {
    const prev = el.previousElementSibling;
    if (!prev) throw new Error('This element is already first.');
    parent.insertBefore(el, prev);
  } else {
    const next = el.nextElementSibling;
    if (!next) throw new Error('This element is already last.');
    parent.insertBefore(el, next.nextSibling);
  }
  return serialize(doc);
}

export function applyVisualInsert(html, targetSelector, spec = {}) {
  const doc = parse(html);
  const target = targetSelector ? query(doc, targetSelector, 'The selected element') : doc.body;
  const type = String(spec.type || 'button');
  const el = buildElement(doc, type, String(spec.text || '').trim());
  el.id = uniqueId(doc, `appgpt-${type}`);
  if (spec.action && spec.action !== 'none') setAction(doc, el, spec.action, spec.actionValue || '');
  const placement = spec.placement || 'inside';
  if (placement === 'before' && target !== doc.body && target.parentNode) target.parentNode.insertBefore(el, target);
  else if (placement === 'after' && target !== doc.body && target.parentNode) target.parentNode.insertBefore(el, target.nextSibling);
  else if (canContain(target)) target.appendChild(el);
  else if (target.parentNode) target.parentNode.insertBefore(el, target.nextSibling);
  else doc.body.appendChild(el);
  return { html: serialize(doc), selector: `#${el.id}` };
}

export function applyVisualDelete(html, selector) {
  const { doc, el } = resolve(html, selector);
  if (['HTML', 'HEAD', 'BODY', 'MAIN'].includes(el.tagName)) throw new Error('That root layout element cannot be deleted from the visual editor.');
  el.remove();
  return serialize(doc);
}

export function applyVisualDuplicate(html, selector) {
  const { doc, el } = resolve(html, selector);
  if (['HTML', 'HEAD', 'BODY'].includes(el.tagName)) throw new Error('That root element cannot be duplicated.');
  const clone = el.cloneNode(true);
  if (clone.id) clone.id = uniqueId(doc, clone.id + '-copy');
  clone.querySelectorAll('[id]').forEach(node => { node.id = uniqueId(doc, node.id + '-copy'); });
  el.parentNode.insertBefore(clone, el.nextSibling);
  return serialize(doc);
}

export function applyVisualAction(html, selector, action = 'none', value = '') {
  const { doc, el } = resolve(html, selector);
  setAction(doc, el, action, value);
  return serialize(doc);
}

function setAction(doc, el, action, value) {
  action = String(action || 'none');
  value = String(value || '').trim();
  if (action === 'none') {
    el.removeAttribute('data-appgpt-action');
    el.removeAttribute('data-appgpt-action-value');
    return;
  }
  const allowed = new Set(['open-url', 'message', 'toggle', 'scroll']);
  if (!allowed.has(action)) throw new Error('Unsupported visual action.');
  if (!value) throw new Error('Add a value for this action.');
  if (action === 'open-url' && !/^(https?:\/\/|tg:\/\/|mailto:|\/|#)/i.test(value)) throw new Error('Use an http(s), tg://, mailto:, /relative, or #anchor URL.');
  if ((action === 'toggle' || action === 'scroll')) {
    try { doc.querySelector(value); } catch { throw new Error('Use a valid CSS selector such as #details or .section-name.'); }
  }
  el.setAttribute('data-appgpt-action', action);
  el.setAttribute('data-appgpt-action-value', value);
  ensureActionRuntime(doc);
}

function ensureActionRuntime(doc) {
  if (doc.querySelector('script[data-appgpt-visual-actions]')) return;
  const script = doc.createElement('script');
  script.setAttribute('data-appgpt-visual-actions', '');
  script.textContent = `(function(){if(window.__appgptVisualActions)return;window.__appgptVisualActions=true;document.addEventListener('click',function(event){var trigger=event.target.closest&&event.target.closest('[data-appgpt-action]');if(!trigger)return;var action=trigger.getAttribute('data-appgpt-action'),value=trigger.getAttribute('data-appgpt-action-value')||'';if(action==='open-url'){if(/^\\s*javascript:/i.test(value))return;event.preventDefault();try{var tg=window.Telegram&&window.Telegram.WebApp;if(tg&&tg.openLink&&/^https?:\\/\\//i.test(value))tg.openLink(value);else location.assign(value)}catch(e){}}else if(action==='message'){event.preventDefault();try{var app=window.Telegram&&window.Telegram.WebApp;if(app&&app.showPopup)app.showPopup({message:value,buttons:[{type:'ok'}]});else alert(value)}catch(e){alert(value)}}else if(action==='toggle'){event.preventDefault();try{var target=document.querySelector(value);if(target)target.hidden=!target.hidden}catch(e){}}else if(action==='scroll'){event.preventDefault();try{var node=document.querySelector(value);if(node)node.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}}});})();`;
  doc.body.appendChild(script);
}

function buildElement(doc, type, text) {
  const label = text || ({ button: 'New button', text: 'New text', card: 'New card', input: 'Type here…', link: 'New link', section: 'New section' }[type] || 'New element');
  let el;
  if (type === 'button') {
    el = doc.createElement('button'); el.type = 'button'; el.textContent = label;
    el.style.cssText = 'padding:12px 16px;border:0;border-radius:12px;background:var(--tg-theme-button-color,#6d5dfc);color:var(--tg-theme-button-text-color,#fff);font:inherit;font-weight:600;cursor:pointer;';
  } else if (type === 'text') {
    el = doc.createElement('p'); el.textContent = label;
  } else if (type === 'card') {
    el = doc.createElement('div');
    el.style.cssText = 'padding:16px;border-radius:16px;background:var(--tg-theme-secondary-bg-color,rgba(127,127,127,.12));';
    const h = doc.createElement('h3'); h.textContent = label; const p = doc.createElement('p'); p.textContent = 'Add details here.'; el.append(h, p);
  } else if (type === 'input') {
    el = doc.createElement('input'); el.type = 'text'; el.placeholder = label;
    el.style.cssText = 'width:100%;padding:12px;border:1px solid rgba(127,127,127,.28);border-radius:12px;background:transparent;color:inherit;font:inherit;';
  } else if (type === 'link') {
    el = doc.createElement('a'); el.href = '#'; el.textContent = label;
  } else if (type === 'divider') {
    el = doc.createElement('hr'); el.style.cssText = 'border:0;border-top:1px solid rgba(127,127,127,.25);margin:16px 0;';
  } else if (type === 'section') {
    el = doc.createElement('section'); el.style.cssText = 'padding:16px 0;';
    const h = doc.createElement('h2'); h.textContent = label; const p = doc.createElement('p'); p.textContent = 'Add section content here.'; el.append(h, p);
  } else throw new Error('Unsupported element type.');
  el.setAttribute('data-appgpt-added', type);
  return el;
}

function canContain(el) {
  return !['INPUT', 'IMG', 'HR', 'BR', 'META', 'LINK'].includes(el.tagName);
}

function uniqueId(doc, base) {
  const safe = String(base || 'appgpt-element').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'appgpt-element';
  let id = safe, n = 2;
  while (doc.getElementById(id)) id = `${safe}-${n++}`;
  return id;
}

function resolve(html, selector) {
  if (!selector) throw new Error('Select an element in the preview first.');
  const doc = parse(html);
  return { doc, el: query(doc, selector, 'That element') };
}
function query(doc, selector, label) {
  let el;
  try { el = doc.querySelector(selector); } catch { throw new Error('The selected element path is no longer valid. Re-select it in the preview.'); }
  if (!el) throw new Error(`${label} could not be found in the current HTML. Re-select it in the preview.`);
  return el;
}
function parse(html) { return new DOMParser().parseFromString(String(html || ''), 'text/html'); }
function serialize(doc) { return '<!doctype html>\n' + doc.documentElement.outerHTML; }
function issue(severity, title, detail) { return { id: crypto.randomUUID?.() || String(Math.random()), severity, title, detail }; }
