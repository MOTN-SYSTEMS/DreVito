import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusResult = spawnSync('supabase', ['status', '--output', 'json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: { ...process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1' }
});
assert.equal(statusResult.status, 0, `Local Supabase is required: ${statusResult.stderr || statusResult.stdout}`);
const supabase = JSON.parse(statusResult.stdout);
assert.ok(supabase.API_URL && supabase.SERVICE_ROLE_KEY, 'Local Supabase did not expose required connection values.');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'drevito-supabase-app-'));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let serverOutput = '';
let cookie = '';
let child;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/admin/login`, { redirect: 'manual' });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Dřevito Supabase-mode server did not start.\n${serverOutput}`);
}

async function request(pathname, { method = 'GET', body, json, authenticated = true, expected = 200 } = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (authenticated && cookie) headers.set('Cookie', cookie);
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body, redirect: 'manual' });
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(expectedStatuses.includes(response.status), `${method} ${pathname} returned ${response.status}; expected ${expectedStatuses.join(' or ')}`);
  return response;
}

async function jsonRequest(pathname, options = {}) {
  const response = await request(pathname, options);
  const data = await response.json();
  assert.equal(data.ok === false, false, `${options.method || 'GET'} ${pathname} failed: ${data.error || response.status}`);
  return data;
}

async function supabaseRest(pathname, { method = 'GET', body, prefer = '' } = {}) {
  const headers = {
    apikey: supabase.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${supabase.SERVICE_ROLE_KEY}`,
    Accept: 'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabase.API_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  assert.ok(response.ok, `${method} ${pathname} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

try {
  child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_URL: baseUrl,
      SESSION_SECRET: 'drevito-local-supabase-app-test-secret',
      NODE_ENV: 'test',
      DREVITO_DATA_DIR: path.join(tempRoot, 'data'),
      DREVITO_UPLOAD_DIR: path.join(tempRoot, 'uploads'),
      SUPABASE_URL: supabase.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: supabase.SERVICE_ROLE_KEY,
      DREVITO_STATIC_FALLBACK: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  await waitForServer();

  const login = await request('/admin/dev-login?next=/admin', { method: 'POST', authenticated: false, expected: [302, 303] });
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /drevito_admin_session=/, 'Supabase-mode app login did not create a session.');

  let homepage = await jsonRequest('/admin/api/homepage');
  const beforePublishedBlog = homepage.published_layout.blocks.find((block) => block.id === 'blog').content.body;
  const draft = structuredClone(homepage.layout);
  draft.blocks.find((block) => block.id === 'blog').content.body = 'Supabase app: publikovaný text Z dílny.';
  homepage = await jsonRequest('/admin/api/homepage/draft', {
    method: 'PUT',
    json: { layout: draft, expected_revision: homepage.draft_revision }
  });
  let publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.homepage_layout.blocks.find((block) => block.id === 'blog').content.body, beforePublishedBlog, 'Supabase draft leaked into public content.');
  homepage = await jsonRequest('/admin/api/homepage/publish', {
    method: 'POST',
    json: { layout: homepage.layout, expected_revision: homepage.draft_revision }
  });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.homepage_source, 'published_layout', 'Supabase public homepage is not reading the published canonical layout.');
  assert.equal(publicContent.homepage_layout.blocks.find((block) => block.id === 'blog').content.body, 'Supabase app: publikovaný text Z dílny.', 'Published Supabase Z dílny text did not reach anonymous output.');

  const categoryList = await jsonRequest('/admin/api/product-categories');
  const clientCategory = categoryList.categories.find((category) => category.slug === 'client-category');
  const secondRoot = categoryList.categories.find((category) => category.slug === 'second-root');
  assert.ok(clientCategory && secondRoot, 'Migration integration fixture categories are missing. Run test:migration first.');
  const originalSlug = clientCategory.slug;
  const renamedCategory = (await jsonRequest(`/admin/api/product-categories/${clientCategory.id}`, {
    method: 'PATCH',
    json: {
      title: 'Client category renamed through admin',
      slug: originalSlug,
      parent_id: '',
      description: clientCategory.description || '',
      sort_order: clientCategory.sort_order,
      is_visible: true
    }
  })).category;
  assert.equal(renamedCategory.slug, originalSlug, 'Category title edit changed the stable slug.');
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.product_categories.find((category) => category.id === clientCategory.id).title, renamedCategory.title, 'Supabase category rename did not reach anonymous public content.');

  const rejectedParentMove = await request(`/admin/api/product-categories/${clientCategory.id}`, {
    method: 'PATCH',
    json: {
      title: renamedCategory.title,
      slug: renamedCategory.slug,
      parent_id: secondRoot.id,
      description: renamedCategory.description || '',
      sort_order: renamedCategory.sort_order,
      is_visible: true
    },
    expected: 400
  });
  assert.equal((await rejectedParentMove.json()).ok, false, 'Supabase branch reparented a parent that still has children.');

  const mediaSuffix = Date.now().toString(36);
  const canonicalMediaId = randomUUID();
  const privateMediaId = randomUUID();
  const legacyMediaId = randomUUID();
  await supabaseRest('/rest/v1/media', {
    method: 'POST',
    prefer: 'return=minimal',
    body: [
      {
        id: canonicalMediaId,
        bucket: 'site-media',
        storage_path: `canonical-test/${canonicalMediaId}.jpg`,
        public_url: '/main.JPG',
        alt_text: 'Canonical metadata-free media',
        mime_type: 'image/jpeg',
        width: 1200,
        height: 800,
        is_public: true,
        metadata: {}
      },
      {
        id: privateMediaId,
        bucket: 'site-media',
        storage_path: `canonical-test/${privateMediaId}.jpg`,
        public_url: '/main.JPG',
        alt_text: 'Private media must remain private',
        mime_type: 'image/jpeg',
        width: 1200,
        height: 800,
        is_public: false,
        metadata: {}
      },
      {
        id: legacyMediaId,
        bucket: 'site-media',
        storage_path: `legacy-test/${legacyMediaId}.jpg`,
        public_url: '/prods.jpg',
        alt_text: 'Legacy target media',
        mime_type: 'image/jpeg',
        width: 1200,
        height: 800,
        is_public: true,
        metadata: {
          target_type: 'site_sections',
          target_key: `legacy-test-${mediaSuffix}`,
          target_label: 'Legacy transition target'
        }
      }
    ]
  });

  const canonicalProduct = (await jsonRequest('/admin/api/products', {
    method: 'POST',
    expected: 201,
    json: {
      title: 'Canonical media product',
      slug: `canonical-media-product-${mediaSuffix}`,
      short_description: 'Canonical media lookup fixture.',
      description: 'References a public media UUID with empty metadata.',
      photos: [{ media_id: canonicalMediaId, url: '/stale-embedded-url.jpg', alt: 'Reference alt', sort_order: 0, is_featured: true }],
      price: 1,
      wood_types: [],
      availability: 'in_stock',
      use_context: [],
      category_ids: [],
      filter_option_ids: [],
      sort_order: 997,
      is_visible: true,
      is_published: true,
      published_at: ''
    }
  })).product;
  const missingMediaId = randomUUID();
  const missingMediaProduct = (await jsonRequest('/admin/api/products', {
    method: 'POST',
    expected: 201,
    json: {
      title: 'Missing media product',
      slug: `missing-media-product-${mediaSuffix}`,
      short_description: 'Missing media lookup fixture.',
      description: 'Must not use the embedded fallback URL.',
      photos: [{ media_id: missingMediaId, url: '/main.JPG', alt: 'Missing', sort_order: 0, is_featured: true }],
      price: 1,
      wood_types: [],
      availability: 'in_stock',
      use_context: [],
      category_ids: [],
      filter_option_ids: [],
      sort_order: 998,
      is_visible: true,
      is_published: true,
      published_at: ''
    }
  })).product;
  const privateMediaProduct = (await jsonRequest('/admin/api/products', {
    method: 'POST',
    expected: 201,
    json: {
      title: 'Private media product',
      slug: `private-media-product-${mediaSuffix}`,
      short_description: 'Private media lookup fixture.',
      description: 'Must not expose a private media row.',
      photos: [{ media_id: privateMediaId, url: '/main.JPG', alt: 'Private', sort_order: 0, is_featured: true }],
      price: 1,
      wood_types: [],
      availability: 'in_stock',
      use_context: [],
      category_ids: [],
      filter_option_ids: [],
      sort_order: 999,
      is_visible: true,
      is_published: true,
      published_at: ''
    }
  })).product;
  const canonicalMediaCategory = (await jsonRequest('/admin/api/product-categories', {
    method: 'POST',
    expected: 201,
    json: {
      title: 'Canonical media category',
      slug: `canonical-media-category-${mediaSuffix}`,
      parent_id: '',
      description: 'Shared canonical resolver fixture.',
      image_url: '/stale-category-url.jpg',
      image_alt: 'Category reference',
      image_media_id: canonicalMediaId,
      sort_order: 999,
      is_visible: true
    }
  })).category;

  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.products.find((product) => product.id === canonicalProduct.id).featured_image.url, '/main.JPG', 'Metadata-free canonical product media did not resolve by ID.');
  assert.deepEqual(publicContent.products.find((product) => product.id === missingMediaProduct.id).photos, [], 'Missing canonical media ID used a stale embedded URL.');
  assert.deepEqual(publicContent.products.find((product) => product.id === privateMediaProduct.id).photos, [], 'Private canonical media was exposed publicly.');
  assert.equal(publicContent.product_categories.find((category) => category.id === canonicalMediaCategory.id).image.url, '/main.JPG', 'Metadata-free canonical category media did not resolve through the shared ID resolver.');
  const legacyMediaDb = await jsonRequest('/admin/api/media');
  assert.equal(legacyMediaDb.targets.site_sections[`legacy-test-${mediaSuffix}`].images[0].media_id, legacyMediaId, 'Legacy target-based discovery stopped working independently of canonical resolution.');

  const categoryImageForm = new FormData();
  categoryImageForm.append('image', new Blob([await readFile(path.join(projectRoot, 'main.JPG'))], { type: 'image/jpeg' }), 'supabase-category.jpg');
  categoryImageForm.append('targetLabel', renamedCategory.title);
  categoryImageForm.append('targetKey', renamedCategory.slug);
  categoryImageForm.append('alt', 'Supabase category image');
  const categoryUpload = await jsonRequest('/admin/api/product-categories/photo-upload', { method: 'POST', body: categoryImageForm, expected: 201 });
  await jsonRequest(`/admin/api/product-categories/${clientCategory.id}`, {
    method: 'PATCH',
    json: {
      title: renamedCategory.title,
      slug: renamedCategory.slug,
      parent_id: '',
      description: renamedCategory.description || '',
      image_url: categoryUpload.photo.url,
      image_alt: categoryUpload.photo.alt,
      image_media_id: categoryUpload.photo.media_id,
      sort_order: renamedCategory.sort_order,
      is_visible: true
    }
  });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.product_categories.find((category) => category.id === clientCategory.id).image.url, categoryUpload.photo.url, 'Supabase category image did not reach public content.');
  assert.equal((await fetch(categoryUpload.photo.url)).status, 200, 'Supabase Storage public category image URL was not readable.');
  await jsonRequest(`/admin/api/product-categories/${clientCategory.id}`, {
    method: 'PATCH',
    json: {
      title: renamedCategory.title,
      slug: renamedCategory.slug,
      parent_id: '',
      description: renamedCategory.description || '',
      image_url: '',
      image_alt: '',
      image_media_id: '',
      sort_order: renamedCategory.sort_order,
      is_visible: true
    }
  });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.product_categories.find((category) => category.id === clientCategory.id).image, null, 'Removed Supabase category image remained public.');

  const suffix = `${mediaSuffix}-blog`;
  const blogCategory = (await jsonRequest('/admin/api/blog-categories', {
    method: 'POST',
    expected: 201,
    json: { title: 'Supabase app blog', slug: `supabase-app-blog-${suffix}`, description: 'Local integration fixture.', sort_order: 99, is_visible: true }
  })).category;
  const blogImageForm = new FormData();
  blogImageForm.append('image', new Blob([await readFile(path.join(projectRoot, 'main.JPG'))], { type: 'image/jpeg' }), 'supabase-blog.jpg');
  blogImageForm.append('targetLabel', 'Supabase app article');
  blogImageForm.append('targetKey', `supabase-app-article-${suffix}`);
  blogImageForm.append('alt', 'Supabase blog image');
  const blogUpload = await jsonRequest('/admin/api/blog-posts/photo-upload', { method: 'POST', body: blogImageForm, expected: 201 });
  const blogPost = (await jsonRequest('/admin/api/blog-posts', {
    method: 'POST',
    expected: 201,
    json: {
      title: 'Supabase app article',
      slug: `supabase-app-article-${suffix}`,
      excerpt: 'Local Supabase integration test.',
      main_content: 'Uploaded through the real application Storage path.',
      content_format: 'html',
      photos: [blogUpload.photo],
      author_name: 'Dřevito',
      category_ids: [blogCategory.id],
      status: 'published',
      published_at: '',
      sort_order: 99
    }
  })).post;
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.equal(publicContent.blog_posts.find((post) => post.id === blogPost.id).featured_image.url, blogUpload.photo.url, 'Supabase blog image did not reach public content.');
  const blogDetail = await request(`/blog/${blogPost.slug}`, { authenticated: false, expected: 200 });
  assert.match(await blogDetail.text(), new RegExp(blogUpload.photo.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Supabase blog detail did not render the uploaded image.');
  assert.equal((await fetch(blogUpload.photo.url)).status, 200, 'Supabase Storage public blog image URL was not readable.');

  await request('/server.js', { authenticated: false, expected: 404 });
  console.log('Dřevito Supabase application integration test passed.');
  console.log('Verified server RPC publishing, UUID-scoped canonical media resolution, legacy media discovery, anonymous reads, stable category slug propagation, hierarchy rejection, Supabase Storage category/blog uploads, public rendering, removal, and static-file denial.');
} finally {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}
