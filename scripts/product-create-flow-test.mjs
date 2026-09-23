import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { randomUUID } from 'node:crypto';

// Execute the actual rendered admin script against the real HTTP API and a
// disposable database. The small DOM adapter models only this form's controls;
// it is not a substitute for the authenticated production browser check.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'drevito-product-flow-'));
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', resolve);
});
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let cookie = '';
let output = '';
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), PUBLIC_URL: base,
    NODE_ENV: 'test', VERCEL: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
    SESSION_SECRET: 'isolated-product-flow-test',
    DREVITO_DATA_DIR: path.join(temp, 'data'), DREVITO_UPLOAD_DIR: path.join(temp, 'uploads') },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

async function request(url, options = {}) {
  return fetch(new URL(url, base), { ...options, redirect: 'manual',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...options.headers } });
}
async function api(url, options) {
  const response = await request(url, options);
  const data = await response.json();
  assert.ok(response.ok, `${url}: ${JSON.stringify(data)}`);
  return data;
}

async function editor() {
  const html = await (await request('/admin/products')).text();
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(code => code.includes("getElementById('product-form')"));
  assert.ok(script, 'Product editor script must be rendered');
  const elements = new Map();
  for (const match of html.matchAll(/\bid="(product[s]?-[-a-z]+)"/g)) {
    elements.set(match[1], { value: '', checked: false, hidden: false, disabled: false,
      innerHTML: '', textContent: '', files: [], listeners: new Map(),
      addEventListener(type, handler) { this.listeners.set(type, handler); },
      querySelectorAll() { return []; }, focus() {},
      fire(type, event = {}) { return this.listeners.get(type)?.({ preventDefault() {}, ...event }); }
    });
  }
  const el = id => { assert.ok(elements.has(id), `Missing control ${id}`); return elements.get(id); };
  el('product-form').reset = () => {
    for (const control of elements.values()) { control.value = ''; control.checked = false; }
    el('product-sort-order').value = '0';
  };
  let pending = 0;
  const writes = [];
  const context = {
    document: { getElementById: el },
    window: { location: { search: '' }, history: { replaceState() {} }, confirm: () => true },
    URLSearchParams, console, FormData,
    fetch: async (url, options = {}) => {
      pending++;
      if (options.method && options.method !== 'GET') writes.push({ url, ...options });
      try {
        const response = await request(url, options);
        const data = await response.json();
        return { ok: response.ok, json: async () => data };
      } finally { pending--; }
    }
  };
  new Script(script).runInNewContext(context);
  async function settle() {
    for (let i = 0; i < 200; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (!pending) return;
    }
    throw new Error('Editor request timed out');
  }
  await settle();
  return { el, writes, settle,
    async fill(title) {
      el('product-title').value = title;
      el('product-title').fire('input');
      el('product-price').value = '1234';
      el('product-short-description').value = `${title} short description`;
      el('product-description').value = `${title} full description`;
    },
    async submit(value = 'publish') {
      el('product-form').fire('submit', { submitter: { value } });
      await settle();
      assert.notEqual(el('product-message').className, 'alert', el('product-message').textContent);
    },
    async action(action, id) {
      el('products-root').fire('click', { target: { closest: () => ({ dataset: { action, id } }) } });
      await settle();
    }
  };
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/admin/login')).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, output);
  const login = await request('/admin/dev-login?next=/admin', { method: 'POST' });
  cookie = login.headers.get('set-cookie').split(';')[0];
  await api('/admin/api/products');
  const dbPath = path.join(temp, 'data', 'cms-db.json');
  const seed = JSON.parse(await readFile(dbPath, 'utf8'));
  seed.products = [];
  seed.product_category_links = [];
  seed.product_filter_value_links = [];
  await writeFile(dbPath, JSON.stringify(seed));
  for (let i = 1; i <= 7; i++) {
    await api('/admin/api/products', { method: 'POST', body: JSON.stringify({
      title: `Existing ${i}`, slug: `existing-${i}`, is_published: true, is_visible: true
    }) });
  }
  const originals = (await api('/admin/api/products')).products;
  assert.equal(originals.length, 7);
  let ui = await editor();
  const categoryId = (await api('/admin/api/products')).categories.find(row => !row.parent_id).id;
  const created = [];
  for (let number = 8; number <= 10; number++) {
    // Client flow: fill the form again immediately after publishing. A fresh
    // create must not silently become PATCH of the last-created record.
    await ui.fill(`TEST PRODUCT ${number}`);
    ui.el('product-root-category').value = categoryId;
    ui.el('product-root-category').fire('change');
    ui.el('product-photo-url').value = '/main.JPG';
    ui.el('product-photo-alt').value = `Test photo ${number}`;
    ui.el('product-add-photo').fire('click');
    await ui.submit();
    const rows = (await api('/admin/api/products')).products;
    assert.equal(rows.length, number, `Product ${number} must INSERT instead of overwriting the previous product`);
    const row = rows.find(item => item.title === `TEST PRODUCT ${number}`);
    assert.ok(row);
    assert.equal(row.price, 1234);
    assert.equal(row.description, `TEST PRODUCT ${number} full description`);
    assert.deepEqual(row.category_ids, [categoryId]);
    assert.equal(row.photos.length, 1, 'Previous product photos must not leak into new products');
    assert.equal(row.photos[0].alt, `Test photo ${number}`);
    for (const previous of [...originals, ...created]) {
      assert.deepEqual(rows.find(item => item.id === previous.id), previous, 'Earlier products must remain unchanged');
    }
    created.push(row);
    assert.equal(new Set(created.map(item => item.id)).size, created.length);
    assert.equal(new Set(created.map(item => item.slug)).size, created.length);
    const publicRows = (await api('/api/public-content?locale=cs')).products;
    for (const item of created) assert.ok(publicRows.some(row => row.id === item.id));
  }
  assert.deepEqual(ui.writes.map(write => write.method), ['POST', 'POST', 'POST']);
  ui = await editor(); // Reload the admin, not just the list.
  for (const item of created) assert.ok(ui.el('products-root').innerHTML.includes(item.title));
  await ui.action('edit', created[0].id);
  await ui.fill('TEST PRODUCT 8 edited');
  await ui.submit();
  assert.equal(ui.writes.at(-1).method, 'PATCH');
  let rows = (await api('/admin/api/products')).products;
  assert.equal(rows.length, 10);
  assert.equal(rows.find(row => row.id === created[0].id).title, 'TEST PRODUCT 8 edited');
  assert.equal(rows.find(row => row.id === created[0].id).slug, created[0].slug);
  assert.deepEqual(rows.find(row => row.id === created[0].id).photos, created[0].photos);
  assert.deepEqual(rows.find(row => row.id === created[0].id).category_ids, created[0].category_ids);
  for (const item of created.slice(1)) assert.deepEqual(rows.find(row => row.id === item.id), item);
  await ui.action('hide', created[1].id);
  rows = (await api('/admin/api/products')).products;
  assert.ok(rows.find(row => row.id === created[1].id).archived_at);
  assert.ok(!(await api('/api/public-content?locale=cs')).products.some(row => row.id === created[1].id));
  assert.equal(rows.length, 10);
  await api(`/admin/api/products/${created[1].id}/restore`, { method: 'POST', body: '{}' });
  await api(`/admin/api/products/${created[1].id}`, { method: 'PATCH', body: JSON.stringify(created[1]) });
  assert.ok((await api('/api/public-content?locale=cs')).products.some(row => row.id === created[1].id));
  await ui.action('edit', created[2].id);
  await ui.submit('save');
  assert.ok(!(await api('/api/public-content?locale=cs')).products.some(row => row.id === created[2].id));
  // Explicit NEW must clear identity, photos, slug state, categories and price
  // even when leaving an existing product's edit form.
  await ui.action('edit', created[0].id);
  ui.el('product-new').fire('click');
  assert.equal(ui.el('product-id').value, '');
  assert.equal(ui.el('product-slug').value, '');
  assert.equal(ui.el('product-price').value, '');
  assert.equal(ui.el('product-root-category').value, '');
  await ui.fill('TEST PRODUCT 8'); // Same title/slug must create an independent row.
  await ui.submit();
  rows = (await api('/admin/api/products')).products;
  const duplicate = rows.find(row => row.slug === 'test-product-8-2');
  assert.ok(duplicate);
  assert.notEqual(duplicate.id, created[0].id);
  assert.deepEqual(duplicate.photos, []);
  assert.deepEqual(duplicate.category_ids, []);
  assert.equal(rows.length, 11);
  assert.equal(ui.writes.at(-1).method, 'POST');
  // The canonical description is the optional product story. Exercise the
  // actual editor, persistence and public route, including clearing after reload.
  const storyProduct = duplicate;
  ui = await editor();
  assert.equal(ui.el('product-description').value, '', 'New product story starts empty');
  await ui.action('edit', storyProduct.id);
  const storyText = 'Made from the customer’s oak board.\n\nThe original edge was retained.';
  ui.el('product-description').value = storyText;
  await ui.submit();
  ui = await editor();
  await ui.action('edit', storyProduct.id);
  assert.equal(ui.el('product-description').value, storyText, 'Custom story survives save and reload');
  let page = await (await request(`/vyrobek/${storyProduct.slug}`)).text();
  assert.match(page, /<section class="story"/);
  assert.ok(page.includes('The original edge was retained.'));
  const beforeClear = (await api('/admin/api/products')).products.find(row => row.id === storyProduct.id);
  ui.el('product-description').value = '';
  await ui.submit();
  ui = await editor();
  await ui.action('edit', storyProduct.id);
  assert.equal(ui.el('product-description').value, '', 'Clearing survives save and reload');
  const afterClear = (await api('/admin/api/products')).products.find(row => row.id === storyProduct.id);
  assert.equal(afterClear.description, null);
  for (const key of Object.keys(beforeClear).filter(key => !['description', 'updated_at'].includes(key))) {
    assert.deepEqual(afterClear[key], beforeClear[key], `Clearing story changed ${key}`);
  }
  page = await (await request(`/vyrobek/${storyProduct.slug}`)).text();
  assert.doesNotMatch(page, /<section class="story"/);
  assert.doesNotMatch(page, /product-story-title|Příběh výrobku/);
  assert.ok(page.includes(afterClear.short_description), 'Other descriptions remain visible');
  ui.el('product-new').fire('click');
  assert.equal(ui.el('product-description').value, '', 'New product does not inherit the prior story');
  console.log('PASS: story edit/save/reload, custom public rendering, clear/save/reload, no empty section, other fields preserved, new story empty.');
  // Exercise the production persistence branch without contacting Supabase.
  // Simulate its existing unique constraint, including concurrent INSERTs.
  const source = await readFile(path.join(root, 'server.js'), 'utf8');
  const createSource = source.slice(source.indexOf('async function createProduct(input)'), source.indexOf('async function updateProduct(id, input)'));
  const remoteRows = new Map();
  const remoteWrites = [];
  let injectedFailure = null;
  const createRemote = new Script(`(${createSource})`).runInNewContext({
    normalizeProductInput: input => ({ product: { ...input }, categoryIds: [], filterOptionIds: [] }),
    isSupabaseConfigured: () => true,
    supabaseRequest: async (table, options) => {
      assert.equal(table, 'products');
      assert.equal(options.method, 'POST', 'New products must never PATCH/upsert');
      assert.equal(options.prefer, 'return=representation');
      remoteWrites.push({ ...options, body: { ...options.body } });
      if (injectedFailure) throw injectedFailure;
      if ([...remoteRows.values()].some(row => row.slug === options.body.slug)) {
        throw Object.assign(new Error('duplicate slug'), { code: '23505', details: { message: 'duplicate key value violates unique constraint "products_slug_key"' } });
      }
      const row = { ...options.body, id: randomUUID() };
      remoteRows.set(row.id, row);
      return [row];
    },
    replaceProductCategoryLinks: async () => {},
    replaceProductFilterLinks: async () => {},
    getProductById: async id => remoteRows.get(id)
  });
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => createRemote({ title: 'Same title', slug: 'same-title' })));
  assert.equal(remoteRows.size, 3);
  assert.equal(new Set(concurrent.map(row => row.id)).size, 3);
  assert.deepEqual(concurrent.map(row => row.slug).sort(), ['same-title', 'same-title-2', 'same-title-3']);
  injectedFailure = Object.assign(new Error('unrelated constraint'), { code: '23505', details: { message: 'duplicate key value violates unique constraint "products_pkey"' } });
  const beforeFailure = remoteWrites.length;
  await assert.rejects(createRemote({ title: 'Other', slug: 'other' }), /unrelated constraint/);
  assert.equal(remoteWrites.length, beforeFailure + 1, 'Unrelated database failures must not be retried');
  console.log('PASS: actual editor flow 7 → 8 → 9 → 10, unchanged earlier rows, unique IDs/slugs, reload, public API, edit, archive/unpublish/republish, photos/categories/prices, explicit NEW and duplicate titles.');
  console.log('PASS: Supabase adapter simulation uses INSERT only; concurrent slug collisions get unique suffixes and unrelated constraints fail safely.');
} finally {
  child.kill();
  if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}
