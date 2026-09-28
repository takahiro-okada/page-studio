(() => {
  const send = (type, data = {}) => parent.postMessage({ source: 'page-studio-frame', type, ...data }, location.origin);
  let selected = null;
  let preview = false;
  const all = id => [...document.querySelectorAll('[data-studio-field]')].filter(node => node.dataset.studioField === id);
  function select(node, focus = true) {
    if (selected && selected !== node) { selected.removeAttribute('contenteditable'); selected.classList.remove('studio-selected'); }
    selected = node;
    if (!node || preview) return;
    let ancestor = node.parentElement;
    while (ancestor) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
    node.classList.add('studio-selected');
    node.setAttribute('contenteditable', 'plaintext-only');
    node.setAttribute('spellcheck', 'true');
    if (focus) node.focus({ preventScroll: true });
    send('select', { id: node.dataset.studioField });
  }
  document.addEventListener('click', event => {
    const field = event.target.closest('[data-studio-field]');
    const interactive = event.target.closest('a,button,input,form');
    if (interactive || field) event.preventDefault();
    if (field && !preview) { event.stopPropagation(); select(field); return; }
    const toggle = event.target.closest('.nav-toggle');
    if (toggle) {
      const header = toggle.closest('.site-header');
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    }
    const link = event.target.closest('a');
    if (link) send('navigate', { url: link.getAttribute('href') });
  }, true);
  document.addEventListener('submit', event => event.preventDefault(), true);
  document.addEventListener('input', event => {
    const field = event.target.closest('[data-studio-field]');
    if (!field) return;
    const id = field.dataset.studioField;
    const value = field.textContent;
    all(id).forEach(node => { if (node !== field) node.textContent = value; });
    send('change', { id, value });
  });
  document.addEventListener('keydown', event => {
    const field = event.target.closest('[data-studio-field]');
    if (event.key === 'Escape') { if (selected) selected.blur(); select(null); }
    if ((event.ctrlKey || event.metaKey) && ['s', 'z'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      send('shortcut', { action: event.key.toLowerCase() === 's' ? 'save' : event.shiftKey ? 'redo' : 'undo' });
    }
    if (field && event.key === 'Enter' && !field.isContentEditable && !preview) { event.preventDefault(); select(field); }
  });
  document.addEventListener('paste', event => {
    if (!event.target.closest('[contenteditable]')) return;
    event.preventDefault();
    const selection = getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const text = document.createTextNode(event.clipboardData.getData('text/plain'));
    range.insertNode(text);
    range.setStartAfter(text); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    event.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'page-studio') return;
    const message = event.data;
    if (message.type === 'values') {
      Object.entries(message.values).forEach(([id, value]) => all(id).forEach(node => { if (node.textContent !== value) node.textContent = value; }));
      document.querySelectorAll('[data-studio-attributes]').forEach(node => {
        const mapping = JSON.parse(node.dataset.studioAttributes);
        Object.entries(mapping).forEach(([id, attribute]) => { if (Object.hasOwn(message.values, id)) node.setAttribute(attribute, message.values[id]); });
      });
    }
    if (message.type === 'select') {
      const node = all(message.id)[0];
      if (node) { select(node, false); node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
    if (message.type === 'preview') {
      preview = message.enabled;
      document.body.classList.toggle('studio-preview', preview);
      if (preview) select(null);
    }
  });
  send('ready');
})();
