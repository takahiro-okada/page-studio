import http from 'node:http';
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { sites } from './sites.mjs';
import { hash, inspectPage, renderPage } from './content.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = process.env.STUDIO_DATA_DIR || path.join(root, '.data');
const port = Number(process.env.PORT || 4317);
const address = `http://127.0.0.1:${port}`;
const stateFiles = new Map();
const locks = new Map();
const releaseCache = new Map();
const fail = (status, message) => Object.assign(new Error(message), { status });
const publicSite = site => ({ id: site.id, name: site.name, owner: site.owner, domain: site.domain, pages: site.pages });
const mime = file => ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.zip': 'application/zip' }[path.extname(file)] || 'application/octet-stream');
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
function safePath(base, relative) {
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(`${path.resolve(base)}${path.sep}`)) throw fail(403, 'このファイルにはアクセスできません。');
  return resolved;
}
async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}
async function modelFor(site) {
  const pages = await Promise.all(site.pages.map(async page => ({ ...page, html: await readFile(path.join(site.root, page.path), 'utf8') })));
  const fields = new Map();
  for (const page of pages) {
    for (const { field } of inspectPage(page.html, page).bindings) {
      if (fields.has(field.id)) {
        const existing = fields.get(field.id);
        if (!existing.pages.includes(page.id)) existing.pages.push(page.id);
      } else fields.set(field.id, { ...field, pages: [page.id] });
    }
  }
  return { pages, fields, template: hash(pages.map(page => page.html).join('\n')) };
}
async function draftFor(site, model) {
  const file = path.join(dataRoot, site.id, 'draft.json');
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  state ||= { revision: 0, template: model.template, values: {}, updatedAt: null };
  stateFiles.set(site.id, file);
  if (state.template !== model.template) throw fail(409, '元のテンプレートが更新されています。下書きとの対応を確認してから再開してください。保存データは保持されています。');
  return state;
}
async function payload(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 2_000_000) throw fail(413, '変更内容が大きすぎます。');
  }
  try { return JSON.parse(body); } catch { throw fail(400, '送信内容を読み取れません。'); }
}
function validateValues(values, model) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw fail(400, '文章データが不正です。');
  const clean = {};
  for (const [id, value] of Object.entries(values)) {
    if (!model.fields.has(id) || typeof value !== 'string' || value.length > 12000) throw fail(400, '編集項目または文字数が不正です。');
    if (value !== model.fields.get(id).original) clean[id] = value;
  }
  return clean;
}
async function locked(id, task) {
  const previous = locks.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  locks.set(id, next);
  return next;
}
async function assetsFrom(base, prefix = '') {
  const output = {};
  for (const entry of await readdir(path.join(base, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(output, await assetsFrom(base, relative));
    else if (!relative.endsWith('.html')) output[relative] = new Uint8Array(await readFile(path.join(base, relative)));
  }
  return output;
}
async function releasesFor(site) {
  const directory = path.join(dataRoot, site.id, 'releases');
  let entries;
  try { entries = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const releases = await Promise.all(entries.filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
  return releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) throw fail(403, 'ローカルホストから利用してください。');
    const url = new URL(req.url, address);
    const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-src 'self'; connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    if (!['GET', 'POST', 'PUT'].includes(req.method)) throw fail(405, '対応していない操作です。');
    if (req.method !== 'GET' && ![address, `http://localhost:${port}`].includes(req.headers.origin)) throw fail(403, 'この操作は編集画面から行ってください。');
    if (url.pathname === '/api/sites' && req.method === 'GET') return json(res, sites.map(publicSite));
    if (parts[0] === 'api' && parts[1] === 'sites') {
      const site = sites.find(item => item.id === parts[2]);
      if (!site) throw fail(404, 'サイトが見つかりません。');
      if (req.method === 'GET' && parts[3] === 'model') {
        const model = await modelFor(site);
        const draft = await draftFor(site, model);
        return json(res, { site: publicSite(site), fields: [...model.fields.values()], draft, releases: await releasesFor(site) });
      }
      if (req.method === 'GET' && parts[3] === 'download') {
        if (!/^[a-z0-9-]+$/.test(parts[4] || '')) throw fail(404, 'スナップショットが見つかりません。');
        const file = path.join(dataRoot, site.id, 'releases', `${parts[4]}.zip`);
        const buffer = await readFile(file);
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${site.id}-${parts[4]}.zip"` });
        return res.end(buffer);
      }
      if ((req.method === 'PUT' && parts[3] === 'draft') || (req.method === 'POST' && parts[3] === 'release')) {
        const input = await payload(req);
        return await locked(site.id, async () => {
          const model = await modelFor(site);
          const current = await draftFor(site, model);
          if (input.revision !== current.revision || input.template !== model.template) throw fail(409, '別の画面で下書きが更新されました。現在の文章をコピーしてから画面を再読み込みしてください。');
          if (parts[3] === 'draft') {
            const draft = { revision: current.revision + 1, template: model.template, values: validateValues(input.values, model), updatedAt: new Date().toISOString() };
            await atomic(stateFiles.get(site.id), draft);
            return json(res, draft);
          }
          const id = `${Date.now()}-${hash(JSON.stringify(current.values)).slice(0, 6)}`;
          const directory = path.join(dataRoot, site.id, 'releases');
          const files = await assetsFrom(site.root);
          for (const page of model.pages) files[page.path] = strToU8(renderPage(page.html, page, site, current.values));
          const release = { id, createdAt: new Date().toISOString(), revision: current.revision, changedCount: Object.keys(current.values).length, values: current.values };
          await mkdir(directory, { recursive: true });
          await writeFile(path.join(directory, `${id}.zip`), zipSync(files));
          await atomic(path.join(directory, `${id}.json`), release);
          return json(res, release, 201);
        });
      }
      throw fail(404, '操作が見つかりません。');
    }
    if (parts[0] === 'snapshot') {
      const site = sites.find(item => item.id === parts[1]);
      const id = parts[2];
      if (!site || !/^[a-z0-9-]+$/.test(id || '')) throw fail(404, 'スナップショットが見つかりません。');
      const key = `${site.id}/${id}`;
      if (!releaseCache.has(key)) {
        if (releaseCache.size >= 5) releaseCache.delete(releaseCache.keys().next().value);
        releaseCache.set(key, unzipSync(new Uint8Array(await readFile(path.join(dataRoot, site.id, 'releases', `${id}.zip`)))));
      }
      let relative = parts.slice(3).join('/');
      if (!relative || url.pathname.endsWith('/')) relative += `${relative ? '/' : ''}index.html`;
      const buffer = releaseCache.get(key)[relative];
      if (!buffer) throw fail(404, 'この試作には該当ページが含まれていません。');
      res.writeHead(200, { 'Content-Type': mime(relative) });
      const prefix = `/snapshot/${site.id}/${id}`;
      return res.end(relative.endsWith('.html')
        ? renderPage(strFromU8(buffer), { id: 'snapshot' }, { sourcePrefix: '/' }, {}, { assetPrefix: prefix, navigationPrefix: prefix })
        : buffer);
    }
    if (parts[0] === 'review') {
      const site = sites.find(item => item.id === parts[1]);
      const page = site?.pages.find(item => item.id === parts[3]);
      if (!page || !/^[a-z0-9-]+$/.test(parts[2] || '')) throw fail(404, 'スナップショットが見つかりません。');
      res.writeHead(302, { Location: `/snapshot/${site.id}/${parts[2]}/${page.path}` });
      return res.end();
    }
    if (parts[0] === 'preview') {
      const site = sites.find(item => item.id === parts[1]);
      if (!site) throw fail(404, 'サイトが見つかりません。');
      const pageId = parts[2];
      const model = await modelFor(site);
      const page = model.pages.find(item => item.id === pageId);
      if (!page) throw fail(404, 'ページが見つかりません。');
      const values = (await draftFor(site, model)).values;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderPage(page.html, page, site, values, { editing: parts[0] === 'preview', assetPrefix: `/site-assets/${site.id}` }));
    }
    if (parts[0] === 'site-assets') {
      const site = sites.find(item => item.id === parts[1]);
      if (!site) throw fail(404, 'サイトが見つかりません。');
      const relative = parts.slice(2).join('/');
      if (!/^(images|css|js)\//.test(relative)) throw fail(404, '素材が見つかりません。');
      const file = safePath(site.root, relative);
      const buffer = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime(file) });
      return res.end(buffer);
    }
    if (req.method !== 'GET') throw fail(405, '対応していない操作です。');
    const relative = url.pathname === '/' ? 'index.html' : parts[0] === 'studio' ? parts.slice(1).join('/') : '';
    if (!relative || !['index.html', 'app.js', 'style.css', 'bridge.js', 'bridge.css'].includes(relative)) throw fail(404, 'ページが見つかりません。');
    const file = safePath(path.join(root, 'public'), relative);
    const buffer = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime(file) });
    res.end(buffer);
  } catch (error) {
    const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error(error);
    if (!res.headersSent) json(res, { error: status === 500 ? '保存・読み込みに失敗しました。サーバーの状態を確認してください。' : error.message }, status);
    else res.end();
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Page Studio: ${address}\nLocal prototype. Netlify publishing is not connected. Drafts: ${dataRoot}`));
