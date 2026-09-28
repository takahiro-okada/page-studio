const $ = id => document.getElementById(id);
const frame = $('site-frame');
let model, site, page, fields = new Map(), values = {}, saved = {}, revision = 0;
let selectedId = null, timer, toastTimer, saveFlight = null, preview = false;
let undoStack = [], redoStack = [];
let viewport = 'desktop';
function fitFrame() {
  const shell = $('browser-shell');
  const available = shell.clientWidth;
  const width = viewport === 'desktop' ? 1200 : Math.min(390, available);
  const scale = available / width;
  frame.style.width = `${width}px`;
  frame.style.height = `${Math.max(100, shell.clientHeight - 34) / scale}px`;
  frame.style.transform = `scale(${scale})`;
}
new ResizeObserver(fitFrame).observe($('browser-shell'));
const valueOf = id => Object.hasOwn(values, id) ? values[id] : fields.get(id).original;
const isDirty = () => JSON.stringify(values) !== JSON.stringify(saved);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const formatDate = value => new Date(value).toLocaleString('en-NZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, error ? 8000 : 3500);
}
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}
const endpoint = suffix => `/api/sites/${site.id}/${suffix}`;
const send = (type, data = {}) => frame.contentWindow?.postMessage({ source: 'page-studio', type, ...data }, location.origin);
function syncFrame() {
  const current = {};
  for (const field of model.fields) current[field.id] = valueOf(field.id);
  send('values', { values: current });
}
function renderPages() {
  $('pages').replaceChildren();
  for (const item of site.pages) {
    const button = node('button', `page-button${page?.id === item.id ? ' active' : ''}`);
    button.append(node('span', 'page-icon', '▤'), node('span', '', item.label));
    button.setAttribute('aria-current', item.id === page?.id ? 'page' : 'false');
    if (model.fields.some(field => field.pages.includes(item.id) && Object.hasOwn(values, field.id))) button.append(node('span', 'page-dirty'));
    button.addEventListener('click', () => changePage(item));
    $('pages').append(button);
  }
}
function renderFields() {
  const search = $('field-search').value.toLowerCase();
  $('fields').replaceChildren();
  let section = null;
  let count = 0;
  for (const field of model.fields.filter(field => field.pages.includes(page.id))) {
    const value = valueOf(field.id);
    if (search && !`${value} ${field.original} ${field.section} ${field.label}`.toLowerCase().includes(search)) continue;
    if (field.section !== section) {
      section = field.section;
      $('fields').append(node('h3', 'field-group', section));
    }
    const button = node('button', `field-item${field.id === selectedId ? ' active' : ''}${Object.hasOwn(values, field.id) ? ' changed' : ''}`, (field.type === 'text' ? value.trim() || '(Empty text)' : field.label).slice(0, 100));
    button.dataset.fieldId = field.id;
    button.addEventListener('click', () => selectField(field.id, true));
    $('fields').append(button);
    count++;
  }
  if (!count) $('fields').append(node('p', 'empty', 'No matching content.'));
}
function selectField(id, scroll = false) {
  const field = fields.get(id);
  if (!field) return;
  selectedId = id;
  $('field-section').textContent = field.section;
  $('field-label').textContent = field.type === 'text' ? 'Text' : field.label;
  $('field-value').disabled = false;
  $('field-value').value = valueOf(id);
  $('character-count').textContent = `${Array.from(valueOf(id)).length} characters`;
  $('scope').textContent = field.scope === 'shared' ? 'SHARED' : 'PAGE';
  $('shared-note').hidden = field.scope !== 'shared';
  $('shared-note').textContent = `This shared content is applied across ${field.pages.length} pages.`;
  $('original-text').textContent = field.original;
  $('reset-field').disabled = !Object.hasOwn(values, id);
  $('fields').querySelectorAll('[data-field-id]').forEach(item => item.classList.toggle('active', item.dataset.fieldId === id));
  if (scroll) send('select', { id });
}
function renderChanges() {
  $('changes').replaceChildren();
  for (const [id, value] of Object.entries(values)) {
    const field = fields.get(id);
    const card = node('div', 'change-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.append(node('small', '', `${field.scope === 'shared' ? 'Shared' : site.pages.find(item => item.id === field.pageId).label} / ${field.section}`), node('p', 'before', field.original), node('p', 'after', value || '(Empty text)'));
    const activate = () => {
      if (!field.pages.includes(page.id)) changePage(site.pages.find(item => item.id === field.pageId), id);
      else selectField(id, true);
      showTab('edit');
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => { if (event.key === 'Enter') activate(); });
    $('changes').append(card);
  }
  if (!Object.keys(values).length) $('changes').append(node('p', 'empty', 'No changes yet.\nClick some copy on the page to get started.'));
}
function updateUI() {
  $('change-count').textContent = Object.keys(values).length;
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
  $('history-count').textContent = model.releases.length;
  if (selectedId) {
    $('character-count').textContent = `${Array.from(valueOf(selectedId)).length} characters`;
    $('reset-field').disabled = !Object.hasOwn(values, selectedId);
  }
  renderPages();
  renderChanges();
}
function setValue(id, value, track = true) {
  if (!fields.has(id) || value.length > 12000) { toast('Each field must contain no more than 12,000 characters.', true); syncFrame(); return; }
  const before = valueOf(id);
  if (value === before) return;
  if (track) {
    const previous = undoStack.at(-1);
    if (previous?.id === id && Date.now() - previous.time < 800) { previous.after = value; previous.time = Date.now(); }
    else undoStack.push({ id, before, after: value, time: Date.now() });
    redoStack = [];
  }
  if (value === fields.get(id).original) delete values[id];
  else values[id] = value;
  if (selectedId === id && document.activeElement !== $('field-value')) $('field-value').value = value;
  $('save-status').textContent = 'Waiting to save…';
  $('save-status').classList.remove('error');
  document.body.classList.remove('save-error');
  updateUI();
  // Re-render only the compact list; the input and iframe keep their caret/selection.
  renderFields();
  clearTimeout(timer);
  timer = setTimeout(() => saveDraft().catch(() => {}), 800);
}
async function saveDraft() {
  clearTimeout(timer);
  if (saveFlight) { await saveFlight; if (isDirty()) return saveDraft(); return; }
  if (!isDirty()) return;
  const snapshot = { ...values };
  $('save-status').textContent = 'Saving…';
  saveFlight = api(endpoint('draft'), { method: 'PUT', body: JSON.stringify({ revision, template: model.draft.template, values: snapshot }) })
    .then(draft => {
      revision = draft.revision;
      saved = { ...snapshot };
      model.draft = draft;
      $('save-status').textContent = isDirty() ? 'Waiting to save…' : '✓ Saved on this computer';
      $('save-status').classList.remove('error');
      document.body.classList.remove('save-error');
    })
    .catch(error => {
      $('save-status').textContent = 'Could not save';
      $('save-status').classList.add('error');
      document.body.classList.add('save-error');
      toast(error.message, true);
      throw error;
    });
  try { await saveFlight; } finally { saveFlight = null; }
  if (isDirty()) return saveDraft();
}
function undo() {
  const item = undoStack.pop();
  if (!item) return;
  redoStack.push(item);
  setValue(item.id, item.before, false); syncFrame(); selectField(item.id); updateUI();
}
function redo() {
  const item = redoStack.pop();
  if (!item) return;
  undoStack.push({ ...item, time: 0 });
  setValue(item.id, item.after, false); syncFrame(); selectField(item.id); updateUI();
}
function changePage(item, fieldId) {
  page = item;
  selectedId = fieldId || null;
  $('current-page').textContent = page.label;
  $('preview-address').textContent = `${site.domain}${page.url === '/' ? '' : page.url}`;
  $('field-count').textContent = model.fields.filter(field => field.pages.includes(page.id)).length;
  $('field-search').value = '';
  frame.src = `/preview/${site.id}/${page.id}`;
  renderPages(); renderFields();
  const defaultField = model.fields.find(field => field.pages.includes(page.id) && field.original.trim() === 'Become Yourself Again') || model.fields.find(field => field.pages.includes(page.id) && field.scope === 'page' && field.type === 'text');
  if (fieldId || defaultField) selectField(fieldId || defaultField.id);
}
function showTab(tab) {
  $('tab-edit').classList.toggle('active', tab === 'edit');
  $('tab-changes').classList.toggle('active', tab === 'changes');
  $('edit-panel').hidden = tab !== 'edit';
  $('changes-panel').hidden = tab !== 'changes';
}
function previewMode() {
  preview = !preview;
  document.body.classList.toggle('preview-mode', preview);
  $('preview-toggle').textContent = preview ? 'Back to editing' : 'Preview';
  $('preview-toggle').setAttribute('aria-pressed', String(preview));
  $('tip').textContent = preview ? 'Preview mode · Editing outlines are hidden.' : 'Click any text to edit it in place.';
  send('preview', { enabled: preview });
}
function link(label, href, download = false) {
  const a = node('a', '', label); a.href = href;
  if (download) a.download = '';
  else { a.target = '_blank'; a.rel = 'noopener'; }
  return a;
}
function releaseLinks(release) {
  const links = node('div', 'history-links');
  links.append(link('Download ZIP', endpoint(`download/${release.id}`), true));
  for (const item of site.pages) links.append(link(item.label, `/review/${site.id}/${release.id}/${item.id}`));
  return links;
}
async function openPublish() {
  try { await saveDraft(); } catch { return; }
  $('release-changes').textContent = `${Object.keys(values).length} changes`;
  $('release-pages').textContent = `${site.pages.length} pages`;
  $('release-result').hidden = true;
  $('create-release').disabled = false;
  $('create-release').textContent = 'Create release ZIP ↓';
  $('release-dialog').showModal();
}
async function createRelease() {
  $('create-release').disabled = true;
  $('create-release').textContent = 'Creating…';
  try {
    await saveDraft();
    const release = await api(endpoint('release'), { method: 'POST', body: JSON.stringify({ revision, template: model.draft.template }) });
    model.releases.unshift(release);
    $('release-result').replaceChildren(node('strong', '', 'Release files created.'), node('p', '', 'The live website has not been updated.'), releaseLinks(release));
    $('release-result').hidden = false;
    $('create-release').textContent = 'Created ✓';
    updateUI();
  } catch (error) { toast(error.message, true); $('create-release').disabled = false; $('create-release').textContent = 'Try again'; }
}
function openHistory() {
  $('history-list').replaceChildren();
  for (const release of model.releases) {
    const item = node('div', 'history-item');
    item.append(node('strong', '', formatDate(release.createdAt)), node('small', '', `Draft v${release.revision} · ${release.changedCount} changes · Not published`), releaseLinks(release));
    $('history-list').append(item);
  }
  if (!model.releases.length) $('history-list').append(node('p', 'empty', 'No exports yet. Create one from Prepare release.'));
  $('history-dialog').showModal();
}
async function loadSite(id) {
  model = await api(`/api/sites/${id}/model`);
  site = model.site;
  fields = new Map(model.fields.map(field => [field.id, field]));
  values = { ...model.draft.values }; saved = { ...values }; revision = model.draft.revision;
  undoStack = []; redoStack = []; selectedId = null;
  $('domain').textContent = site.domain;
  $('site-owner').textContent = site.owner;
  $('page-count').textContent = site.pages.length;
  $('save-status').textContent = '✓ Saved on this computer';
  $('save-status').classList.remove('error');
  changePage(site.pages[0]); updateUI();
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'page-studio-frame') return;
  const message = event.data;
  if (message.type === 'ready') { syncFrame(); send('preview', { enabled: preview }); }
  if (message.type === 'select' && fields.has(message.id)) { selectField(message.id); showTab('edit'); }
  if (message.type === 'change') setValue(message.id, message.value);
  if (message.type === 'shortcut') {
    if (message.action === 'save') saveDraft().catch(() => {});
    if (message.action === 'undo') undo();
    if (message.action === 'redo') redo();
  }
  if (message.type === 'navigate') {
    const target = site.pages.find(item => item.url === message.url?.split('#')[0]);
    if (target && target.id !== page.id) changePage(target);
    else if (!target) toast('This prototype includes Home, About Karen, and Shop.');
  }
});
$('field-value').addEventListener('input', event => { if (selectedId) { setValue(selectedId, event.target.value); syncFrame(); } });
$('field-search').addEventListener('input', renderFields);
$('reset-field').addEventListener('click', () => { if (selectedId) { setValue(selectedId, fields.get(selectedId).original); syncFrame(); } });
$('save').addEventListener('click', async () => { try { await saveDraft(); toast('Draft saved on this computer.'); } catch {} });
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('publish').addEventListener('click', openPublish);
$('create-release').addEventListener('click', createRelease);
$('close-release').addEventListener('click', () => $('release-dialog').close());
$('history-button').addEventListener('click', openHistory);
$('close-history').addEventListener('click', () => $('history-dialog').close());
$('tab-edit').addEventListener('click', () => showTab('edit'));
$('tab-changes').addEventListener('click', () => showTab('changes'));
$('preview-toggle').addEventListener('click', previewMode);
$('inspector-toggle').addEventListener('click', () => {
  const open = document.body.classList.toggle('inspector-open');
  $('inspector-toggle').setAttribute('aria-expanded', String(open));
  $('inspector-toggle').textContent = open ? 'Close content list' : 'Content list';
});
for (const mode of ['desktop', 'mobile']) $(mode).addEventListener('click', () => {
  viewport = mode;
  $('browser-shell').classList.toggle('mobile', mode === 'mobile');
  $('desktop').classList.toggle('active', mode === 'desktop');
  $('mobile').classList.toggle('active', mode === 'mobile');
  $('viewport-label').textContent = mode === 'mobile' ? 'Mobile · 390px or less' : 'Desktop · 1200px / scaled view';
  fitFrame();
});
$('site-select').addEventListener('change', async event => {
  const id = event.target.value;
  try { await saveDraft(); await loadSite(id); } catch (error) { event.target.value = site.id; toast(error.message, true); }
});
$('reload').addEventListener('click', () => location.reload());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveDraft().catch(() => {}); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['TEXTAREA', 'INPUT'].includes(event.target.tagName)) { event.preventDefault(); event.shiftKey ? redo() : undo(); }
});
window.addEventListener('beforeunload', event => { if (model && isDirty()) { event.preventDefault(); event.returnValue = ''; } });
try {
  const sites = await api('/api/sites');
  for (const item of sites) { const option = node('option', '', item.name); option.value = item.id; $('site-select').append(option); }
  await loadSite(sites[0].id);
} catch (error) { $('fatal-message').textContent = error.message; $('fatal').hidden = false; }
