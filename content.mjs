import { parse, serialize } from 'parse5';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const setAttr = (node, name, value) => {
  const item = node.attrs?.find(item => item.name === name);
  if (item) item.value = value;
  else (node.attrs ||= []).push({ name, value });
};
const textOf = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join('');
const excluded = new Set(['script', 'style', 'noscript', 'svg', 'template', 'code', 'pre', 'textarea']);
const meaningful = value => /[\p{L}\p{N}]/u.test(value);
const walk = (node, visitor, path = '0') => {
  visitor(node, path);
  [...(node.childNodes || [])].forEach((child, i) => walk(child, visitor, `${path}.${i}`));
};
function sectionName(node) {
  let parent = node.parentNode;
  while (parent) {
    if (parent.tagName === 'header') return '共通 · ヘッダー';
    if (parent.tagName === 'footer' && parent.parentNode?.tagName === 'body') return '共通 · フッター';
    if (parent.tagName === 'section') {
      let heading;
      walk(parent, child => { if (!heading && /^h[12]$/.test(child.tagName)) heading = textOf(child).trim(); });
      return heading || 'ページ本文';
    }
    parent = parent.parentNode;
  }
  return 'ページ設定';
}
function regionOf(node) {
  let parent = node;
  while (parent) {
    if (parent.tagName === 'header') return 'header';
    if (parent.tagName === 'footer' && parent.parentNode?.tagName === 'body') return 'footer';
    parent = parent.parentNode;
  }
  return null;
}
export function inspectPage(html, page) {
  const document = parse(html);
  const bindings = [];
  walk(document, (node, path) => {
    let parent = node.parentNode;
    let skipped = false;
    let inHead = false;
    while (parent) {
      if (excluded.has(parent.tagName)) skipped = true;
      if (parent.tagName === 'head') inHead = true;
      parent = parent.parentNode;
    }
    if (skipped || excluded.has(node.tagName)) return;
    const region = regionOf(node);
    const add = (original, type, attribute, label) => {
      if (!meaningful(original)) return;
      const id = region
        ? `shared-${hash(`${region}|${type}|${attribute || ''}|${original}`)}`
        : `${page.id}-${hash(`${path}|${attribute || 'text'}`)}`;
      bindings.push({ node, attribute, field: {
        id, original, type, scope: region ? 'shared' : 'page',
        label: label || original.trim().replace(/\s+/g, ' ').slice(0, 72),
        section: inHead ? '検索・ページ設定' : sectionName(node),
        pageId: page.id
      } });
    };
    if (node.nodeName === '#text' && (!inHead || node.parentNode?.tagName === 'title')) {
      add(node.value, inHead ? 'metadata' : 'text', null, inHead ? 'ブラウザ・検索結果のタイトル' : undefined);
    }
    if (node.tagName === 'meta' && ['description', 'og:title', 'og:description'].includes(attr(node, 'name') || attr(node, 'property'))) {
      add(attr(node, 'content') || '', 'metadata', 'content', attr(node, 'name') || attr(node, 'property'));
    }
    for (const key of ['placeholder', 'alt', 'aria-label']) {
      const value = attr(node, key);
      if (value) add(value, 'attribute', key, `${key} · ${value}`);
    }
  });
  return { document, bindings };
}

function element(tagName, attrs = [], children = []) {
  const node = { nodeName: tagName, tagName, attrs, namespaceURI: 'http://www.w3.org/1999/xhtml', childNodes: children };
  for (const child of children) child.parentNode = node;
  return node;
}
export function renderPage(html, page, site, values = {}, { editing = false, assetPrefix = '', navigationPrefix = '' } = {}) {
  const { document, bindings } = inspectPage(html, page);
  for (const { node, attribute, field } of bindings) {
    const value = Object.hasOwn(values, field.id) ? values[field.id] : field.original;
    if (attribute) {
      setAttr(node, attribute, value);
      if (editing) {
        const mapping = JSON.parse(attr(node, 'data-studio-attributes') || '{}');
        mapping[field.id] = attribute;
        setAttr(node, 'data-studio-attributes', JSON.stringify(mapping));
      }
    }
    else {
      node.value = value;
      if (editing && field.type === 'text') {
        const parent = node.parentNode;
        const index = parent.childNodes.indexOf(node);
        // A custom inline element avoids matching site CSS such as `.logo span`.
        const wrapper = element('studio-text', [
          { name: 'data-studio-field', value: field.id },
          { name: 'tabindex', value: '0' },
          { name: 'aria-label', value: `編集: ${field.label}` }
        ], [node]);
        wrapper.parentNode = parent;
        parent.childNodes[index] = wrapper;
      }
    }
  }
  let body;
  walk(document, node => {
    if (node.tagName === 'base' || (editing && node.tagName === 'script')) {
      const parent = node.parentNode;
      if (parent) parent.childNodes = parent.childNodes.filter(child => child !== node);
      return;
    }
    for (const item of node.attrs || []) {
      if (!['href', 'src', 'poster', 'action'].includes(item.name)) continue;
      let value = item.value;
      // Only remap resources inside this registered site, never the whole repository.
      if (value.startsWith(site.sourcePrefix)) value = value.slice(site.sourcePrefix.length);
      else continue;
      if (item.name === 'href' && node.tagName === 'a') item.value = `${navigationPrefix}/${value}`;
      else item.value = `${assetPrefix}/${value}`;
    }
    if (node.tagName === 'body') body = node;
  });
  if (editing && body) {
    const script = element('script', [{ name: 'src', value: '/studio/bridge.js' }]);
    const css = element('link', [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: '/studio/bridge.css' }]);
    script.parentNode = body;
    css.parentNode = body;
    body.childNodes.push(css, script);
  }
  return serialize(document);
}
