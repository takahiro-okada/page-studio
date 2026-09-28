import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

test('draft persistence, validation, conflicts and immutable complete-site exports', async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'page-studio-test-'));
  const port = 4400 + Math.floor(Math.random() * 1000);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: String(port), STUDIO_DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = new Promise(resolve => child.once('exit', resolve));
  let startupTimer;
  await new Promise((resolve, reject) => {
    startupTimer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.stdout.once('data', () => { clearTimeout(startupTimer); resolve(); });
    child.once('error', reject);
    child.stderr.once('data', message => { clearTimeout(startupTimer); reject(new Error(message.toString())); });
  });
  const call = (suffix, method = 'GET', body, customOrigin = origin) => fetch(`${origin}/api/sites/karen/${suffix}`, { method, headers: { Origin: customOrigin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const initial = await (await call('model')).json();
    const field = initial.fields.find(field => field.original.trim() === 'Become Yourself Again');
    const base = { revision: initial.draft.revision, template: initial.draft.template };
    const payload = { ...base, values: { [field.id]: 'A meaningful change & <safe text>' } };
    assert.equal((await call('draft', 'PUT', payload, 'https://unrelated.example')).status, 403);
    assert.equal((await call('draft', 'PUT', { ...base, values: { unexpected: 'bad' } })).status, 400);
    const response = await call('draft', 'PUT', payload);
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.revision, 1);
    assert.equal((await call('draft', 'PUT', payload)).status, 409);
    const reloaded = await (await call('model')).json();
    assert.equal(reloaded.draft.values[field.id], payload.values[field.id]);
    const releaseResponse = await call('release', 'POST', { ...base, revision: saved.revision });
    assert.equal(releaseResponse.status, 201);
    const release = await releaseResponse.json();
    const download = await call(`download/${release.id}`);
    const files = unzipSync(new Uint8Array(await download.arrayBuffer()));
    for (const required of ['index.html', 'about-karen/index.html', 'shop/index.html', 'css/style.css', 'js/site.js', 'images/karen-hero.jpg']) assert.ok(files[required], required);
    assert.ok(strFromU8(files['index.html']).includes('A meaningful change &amp; &lt;safe text&gt;'));
    assert.ok(!strFromU8(files['index.html']).includes('data-studio-field'));
    const reset = await call('draft', 'PUT', { ...base, revision: saved.revision, values: {} });
    assert.equal(reset.status, 200);
    const snapshot = await fetch(`${origin}/review/karen/${release.id}/home`);
    const snapshotHtml = await snapshot.text();
    assert.ok(snapshotHtml.includes('A meaningful change &amp; &lt;safe text&gt;'));
    assert.ok(snapshotHtml.includes(`/snapshot/karen/${release.id}/images/karen-hero.jpg`));
    assert.ok(snapshotHtml.includes(`/snapshot/karen/${release.id}/about-karen/`));
    const asset = await fetch(`${origin}/snapshot/karen/${release.id}/images/karen-hero.jpg`);
    assert.equal(asset.status, 200);
    assert.equal((await call('download/invalid')).status, 404);
    assert.equal((await fetch(`${origin}/site-assets/karen/../../.git/config`)).status, 404);
  } finally {
    clearTimeout(startupTimer);
    child.kill();
    await exit;
  }
});
