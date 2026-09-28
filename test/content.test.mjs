import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectPage, renderPage } from '../content.mjs';
import { sites } from '../sites.mjs';
const site = sites[0];
const page = site.pages[0];
const html = await readFile(`${site.root}/${page.path}`, 'utf8');

test('actual Karen home supports title, body, button, footer and alternative text', () => {
  const { bindings } = inspectPage(html, page);
  assert.ok(bindings.length > 70);
  for (const text of ['Become Yourself Again', 'Shop the Collection', 'Midlife Miracles — Become Yourself Again | Karen Dugdale']) {
    assert.ok(bindings.some(item => item.field.original.trim() === text), text);
  }
  assert.ok(bindings.some(item => item.attribute === 'alt'));
  assert.ok(bindings.some(item => item.field.scope === 'shared'));
});

test('untrusted edited text is escaped while nested design markup is retained', () => {
  const source = '<html><body><h1>Hello <em>world</em></h1></body></html>';
  const binding = inspectPage(source, page).bindings.find(item => item.field.original === 'world');
  const output = renderPage(source, page, site, { [binding.field.id]: '<script>alert(1)</script> & "text"' });
  assert.ok(output.includes('<em>&lt;script&gt;alert(1)&lt;/script&gt; &amp; "text"</em>'));
  assert.ok(!output.includes('<script>'));
  assert.ok(!output.includes('data-studio'));
});

test('editor bridge survives script stripping and resources are local', () => {
  const output = renderPage(html, page, site, {}, { editing: true, assetPrefix: '/site-assets/karen' });
  assert.ok(output.includes('src="/studio/bridge.js"'));
  assert.ok(output.includes('/site-assets/karen/images/karen-hero.jpg'));
  assert.ok(!output.includes('<base'));
  assert.ok(!output.includes('src="/site-assets/karen/js/site.js"'));
  assert.ok(output.includes('data-studio-field'));
  assert.ok(output.includes('<studio-text'), 'editor marker must not introduce spans matching site styles');
});

test('shared navigation field propagates across different page templates', async () => {
  const about = site.pages[1];
  const aboutHtml = await readFile(`${site.root}/${about.path}`, 'utf8');
  const find = (source, descriptor) => inspectPage(source, descriptor).bindings.find(item => item.field.original.trim() === 'About Karen' && item.field.scope === 'shared');
  const first = find(html, page);
  const second = find(aboutHtml, about);
  assert.equal(first.field.id, second.field.id);
  const output = renderPage(aboutHtml, about, site, { [first.field.id]: 'Meet Karen' });
  assert.ok(output.includes('>Meet Karen</a>'));
});

test('export uses standalone site paths and contains no editor infrastructure', () => {
  const output = renderPage(html, page, site);
  assert.ok(output.includes('href="/about-karen/"'));
  assert.ok(output.includes('src="/images/karen-hero.jpg"'));
  assert.ok(output.includes('src="/js/site.js"'));
  assert.ok(!output.includes('data-studio-'));
  assert.ok(!output.includes('/studio/'));
});
