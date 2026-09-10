import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'drevito-smoke-'));
const dataDir = path.join(tempRoot, 'data');
const uploadDir = path.join(tempRoot, 'uploads');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
let serverOutput = '';
let sessionCookie = '';
let child;
const auxiliaryChildren = [];

function check(condition, message) {
  assert.ok(condition, message);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/admin/login`, { redirect: 'manual' });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start.\n${serverOutput}`);
}

async function startAuxiliaryServer(envOverrides) {
  const auxiliaryPort = await getFreePort();
  const auxiliaryBaseUrl = `http://127.0.0.1:${auxiliaryPort}`;
  const state = { output: '' };
  const processHandle = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(auxiliaryPort),
      PUBLIC_URL: auxiliaryBaseUrl,
      SESSION_SECRET: 'drevito-auxiliary-smoke-test-secret',
      NODE_ENV: 'test',
      ...envOverrides
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  processHandle.stdout.on('data', (chunk) => { state.output += chunk; });
  processHandle.stderr.on('data', (chunk) => { state.output += chunk; });
  auxiliaryChildren.push(processHandle);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${auxiliaryBaseUrl}/admin/login`, { redirect: 'manual' });
      if (response.status === 200) return auxiliaryBaseUrl;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Auxiliary server did not start.\n${state.output}`);
}

async function auxiliaryRequest(auxiliaryBaseUrl, pathname, expectedStatus) {
  const response = await fetch(`${auxiliaryBaseUrl}${pathname}`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual'
  });
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  check(expectedStatuses.includes(response.status), `Auxiliary GET ${pathname} returned ${response.status}; expected ${expectedStatuses.join(' or ')}`);
  return response;
}

async function request(pathname, {
  method = 'GET',
  body,
  json,
  authenticated = true,
  expectedStatus
} = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (authenticated && sessionCookie) headers.set('Cookie', sessionCookie);
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body,
    redirect: 'manual'
  });
  if (expectedStatus !== undefined) {
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    check(expectedStatuses.includes(response.status), `${method} ${pathname} returned ${response.status}; expected ${expectedStatuses.join(' or ')}`);
  }
  return response;
}

async function jsonRequest(pathname, options = {}) {
  const response = await request(pathname, options);
  const data = await response.json();
  check(response.ok, `${options.method || 'GET'} ${pathname} failed: ${data.error || response.status}`);
  check(data.ok !== false, `${options.method || 'GET'} ${pathname} returned ok:false`);
  return data;
}

try {
  child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_URL: baseUrl,
      SESSION_SECRET: 'drevito-isolated-smoke-test-secret',
      DREVITO_DATA_DIR: dataDir,
      DREVITO_UPLOAD_DIR: uploadDir,
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  await waitForServer();

  const protectedResponse = await request('/admin', {
    authenticated: false,
    expectedStatus: [302, 303]
  });
  check((protectedResponse.headers.get('location') || '').startsWith('/admin/login'), 'Admin did not redirect to login.');

  const unauthenticatedHomepageApi = await request('/admin/api/homepage', {
    authenticated: false,
    expectedStatus: 401
  });
  check((unauthenticatedHomepageApi.headers.get('content-type') || '').includes('application/json'), 'Unauthenticated homepage API response was not JSON.');
  const unauthenticatedHomepageData = await unauthenticatedHomepageApi.json();
  check(unauthenticatedHomepageData.ok === false, 'Unauthenticated homepage API response did not return ok:false.');

  const loginResponse = await request('/admin/dev-login?next=/admin', {
    method: 'POST',
    authenticated: false,
    expectedStatus: [302, 303]
  });
  const setCookie = loginResponse.headers.get('set-cookie') || '';
  check(setCookie.includes('drevito_admin_session='), 'Login did not issue the admin session cookie.');
  sessionCookie = setCookie.split(';')[0];

  const dashboardResponse = await request('/admin', { expectedStatus: 200 });
  check((await dashboardResponse.text()).includes('Administrace obsahu'), 'Authenticated dashboard did not render.');

  const homepageEditorResponse = await request('/admin/homepage', { expectedStatus: 200 });
  const homepageEditorHtml = await homepageEditorResponse.text();
  check(homepageEditorHtml.includes('id="homepage-editor"') && homepageEditorHtml.includes('Domovská stránka'), 'Authenticated homepage editor did not render.');
  check(homepageEditorHtml.includes('id="homepage-publish" type="button" disabled'), 'Homepage publish control was enabled before initial state loading.');
  check(homepageEditorHtml.includes('data-open-library disabled'), 'Homepage add-block control was enabled before initial state loading.');

  const reservedHomepageCreate = await request('/admin/api/site-content', {
    method: 'POST',
    json: {
      content_key: 'homepage.layout.draft',
      locale: 'cs',
      section: 'homepage',
      label: 'Unsafe generic draft',
      content_type: 'json',
      value: { version: 1, blocks: [] },
      status: 'published',
      sort_order: 0
    },
    expectedStatus: 409
  });
  check((await reservedHomepageCreate.json()).ok === false, 'Generic site-content API accepted a reserved homepage key.');

  const legacyHomepageCreate = await request('/admin/api/site-content', {
    method: 'POST',
    json: {
      content_key: 'blog.intro',
      locale: 'cs',
      section: 'blog',
      label: 'Obsolete homepage editor value',
      content_type: 'rich_text',
      value: { html: 'This must never report success.' },
      status: 'published',
      sort_order: 0
    },
    expectedStatus: 409
  });
  check((await legacyHomepageCreate.json()).ok === false, 'Generic site-content API accepted a superseded homepage key.');

  const ineffectiveHomepageUpload = new FormData();
  ineffectiveHomepageUpload.append('image', new Blob([await readFile(path.join(projectRoot, 'main.JPG'))], { type: 'image/jpeg' }), 'legacy-hero.jpg');
  const ineffectiveHomepageUploadResponse = await request('/admin/api/site-content/photo-upload', {
    method: 'POST',
    body: ineffectiveHomepageUpload,
    expectedStatus: 409
  });
  check((await ineffectiveHomepageUploadResponse.json()).ok === false, 'Legacy homepage image upload reported success outside the canonical editor.');

  const retiredMediaUploadResponse = await request('/admin/api/media/upload', {
    method: 'POST',
    body: new FormData(),
    expectedStatus: 410
  });
  check((await retiredMediaUploadResponse.json()).ok === false, 'Retired media editor still accepted a mutation.');

  const fixedHomepageBlockIds = ['hero', 'about', 'products', 'blog', 'author', 'custom'];
  let homepageState = await jsonRequest('/admin/api/homepage');
  check(homepageState.has_draft === false, 'Fresh homepage state unexpectedly contained a draft.');
  check(homepageState.has_published_layout === false, 'Fresh homepage state unexpectedly contained a published layout.');
  check(homepageState.draft_revision === null, 'Fresh homepage state unexpectedly had a draft revision.');
  check(homepageState.layout?.blocks?.length === fixedHomepageBlockIds.length, 'Default homepage did not contain exactly six fixed blocks.');
  check(fixedHomepageBlockIds.every((id) => homepageState.layout.blocks.some((block) => block.id === id)), 'Default homepage was missing a fixed block.');
  const defaultHero = homepageState.layout.blocks.find((block) => block.id === 'hero');
  const defaultAuthor = homepageState.layout.blocks.find((block) => block.id === 'author');
  check(defaultHero?.content?.title === 'Dřevito – když se umění snoubí s citem k přirozenosti', 'Default homepage did not contain the confirmed hero copy.');
  check(defaultHero?.content?.eyebrow === '', 'Default homepage still contained the removed workshop phrase.');
  check(defaultAuthor?.content?.title === 'Příběh za značkou – Vít Thorio, tvůrce Dřevito', 'Default homepage did not contain the complete author identification.');

  const publicHomepageResponse = await request('/', { authenticated: false, expectedStatus: 200 });
  const publicHomepageHtml = await publicHomepageResponse.text();
  check(publicHomepageHtml.includes('Dřevito – když se umění snoubí s citem k přirozenosti'), 'Static homepage fallback did not contain the confirmed hero copy.');
  check(!publicHomepageHtml.includes('Rodinná dílna · Dolní Ředice'), 'Static homepage fallback still contained the removed workshop phrase.');
  check(publicHomepageHtml.includes('data-cms-mode="configured"'), 'Configured local CMS was not identified in the served page.');
  check(publicHomepageHtml.includes('Příběh za značkou – Vít Thorio, tvůrce Dřevito'), 'Static homepage did not contain the complete author identification.');

  const homepageCmsDbPath = path.join(dataDir, 'cms-db.json');
  const cmsFixture = JSON.parse(await readFile(homepageCmsDbPath, 'utf8'));
  const originalSiteContent = cloneJson(cmsFixture.site_content);
  const persistedLegacyLayout = cloneJson(homepageState.layout);
  persistedLegacyLayout.blocks.find((block) => block.id === 'hero').content.title = 'Dřevito — dřevěné výrobky zhotovené srdcem';
  persistedLegacyLayout.blocks.find((block) => block.id === 'hero').content.eyebrow = 'Rodinná dílna · Dolní Ředice';
  persistedLegacyLayout.blocks.find((block) => block.id === 'hero').content.image = { media_id: 'legacy-production-homepage', url: '/main.JPG', alt: 'Legacy production hero' };
  persistedLegacyLayout.blocks.find((block) => block.id === 'author').content.title = 'Příběh za značkou';
  const persistedAt = new Date().toISOString();
  cmsFixture.site_content.push({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    content_key: 'homepage.layout',
    locale: 'cs',
    section: 'homepage',
    label: 'Persisted legacy homepage',
    content_type: 'json',
    value: persistedLegacyLayout,
    status: 'published',
    sort_order: 0,
    published_at: persistedAt,
    created_at: persistedAt,
    updated_at: persistedAt
  });
  await writeFile(homepageCmsDbPath, `${JSON.stringify(cmsFixture, null, 2)}\n`);

  let publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  const compatibleHero = publicContent.homepage_layout?.blocks?.find((block) => block.id === 'hero');
  const compatibleAuthor = publicContent.homepage_layout?.blocks?.find((block) => block.id === 'author');
  check(publicContent.homepage_source === 'published_layout', 'Persisted homepage layout did not remain the public source.');
  check(compatibleHero?.content?.title === 'Dřevito – když se umění snoubí s citem k přirozenosti', 'Persisted homepage kept the obsolete hero title.');
  check(compatibleHero?.content?.eyebrow === '', 'Persisted homepage kept the obsolete workshop eyebrow.');
  check(compatibleHero?.content?.image?.url === '/main.JPG' && compatibleHero?.content?.image?.media_id === 'legacy-production-homepage', 'Persisted legacy homepage image lost its embedded compatibility URL.');
  check(compatibleAuthor?.content?.title === 'Příběh za značkou – Vít Thorio, tvůrce Dřevito', 'Persisted homepage kept the incomplete author title.');

  cmsFixture.site_content = originalSiteContent;
  await writeFile(homepageCmsDbPath, `${JSON.stringify(cmsFixture, null, 2)}\n`);

  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.homepage_source === 'legacy_bridge', 'Legacy-only homepage was not exposed through the controlled bridge.');
  check(publicContent.homepage_layout?.blocks?.find((block) => block.id === 'hero')?.content?.title === 'Dřevito – když se umění snoubí s citem k přirozenosti', 'Legacy bridge restored an obsolete hero title.');

  await request('/vyrobky', { authenticated: false, expectedStatus: 200 });
  await request('/vyrobky/rustikalni-nabytek', { authenticated: false, expectedStatus: 200 });
  await request('/vyrobky/rustikalni-nabytek/stoly', { authenticated: false, expectedStatus: 200 });
  await request('/vyrobky/rustikalni-nabytek/stoly/neplatna-uroven', { authenticated: false, expectedStatus: 404 });

  const defaultHomepageBlocks = new Map(homepageState.layout.blocks.map((block) => [block.id, cloneJson(block)]));
  const legacyHero = cloneJson(defaultHomepageBlocks.get('hero'));
  legacyHero.content.image = {
    media_id: 'legacy-production-homepage',
    url: '/main.JPG',
    alt: 'Legacy production hero'
  };
  const homepageStory = {
    id: 'story-smoke-homepage',
    kind: 'story',
    label: 'Smoke příběh',
    visible: true,
    content: {
      eyebrow: 'Ze zákulisí',
      title: 'Smoke blok domovské stránky',
      body: 'První publikovaný text vlastního bloku.',
      image: {
        url: '/stale-embedded-url.jpg',
        alt: 'Missing canonical media',
        caption: '',
        media_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      },
      layout: 'image-left',
      theme: 'cream',
      cta_label: 'Napište nám',
      cta_url: '#contact'
    }
  };
  const homepageDraftLayout = {
    version: 1,
    blocks: [
      defaultHomepageBlocks.get('blog'),
      defaultHomepageBlocks.get('about'),
      homepageStory,
      defaultHomepageBlocks.get('author'),
      defaultHomepageBlocks.get('custom'),
      legacyHero
    ]
  };

  homepageState = await jsonRequest('/admin/api/homepage/draft', {
    method: 'PUT',
    json: {
      layout: homepageDraftLayout,
      expected_revision: homepageState.draft_revision
    }
  });
  check(homepageState.has_draft === true && homepageState.draft_revision, 'Saving the homepage draft did not create a revision.');
  check(homepageState.layout.blocks.length === fixedHomepageBlockIds.length + 1, 'Saved homepage draft did not contain six fixed blocks and one story.');
  check(homepageState.layout.blocks[0]?.id === 'hero', 'Homepage normalization did not keep the hero first.');
  check(homepageState.layout.blocks.some((block) => block.id === 'products'), 'Homepage normalization did not restore an omitted fixed block.');
  check(homepageState.layout.blocks.some((block) => block.id === homepageStory.id), 'Saved homepage draft was missing its story block.');
  check(homepageState.layout.blocks.map((block) => block.id).join(',') === 'hero,blog,about,story-smoke-homepage,author,custom,products', 'Homepage fixed-block reorder was not preserved after normalization.');

  const firstHomepageRevision = homepageState.draft_revision;
  const reloadedHomepageState = await jsonRequest('/admin/api/homepage');
  check(reloadedHomepageState.draft_revision === firstHomepageRevision, 'Reloaded homepage draft had a different revision.');
  assert.deepEqual(reloadedHomepageState.layout, homepageState.layout, 'Reloaded homepage draft did not match the saved draft.');

  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.homepage_source === 'legacy_bridge', 'Saving the first draft changed the public homepage source before publication.');
  check(!publicContent.homepage_layout.blocks.some((block) => block.id === homepageStory.id), 'Saving a draft leaked a story into the public homepage.');

  const publishableHomepageLayout = cloneJson(homepageState.layout);
  publishableHomepageLayout.blocks.find((block) => block.id === homepageStory.id).content.body = 'Publikovaná verze vlastního bloku.';
  publishableHomepageLayout.blocks.find((block) => block.id === 'blog').content.body = 'Smoke text Z dílny publikovaný z editoru.';
  await new Promise((resolve) => setTimeout(resolve, 10));
  homepageState = await jsonRequest('/admin/api/homepage/draft', {
    method: 'PUT',
    json: {
      layout: publishableHomepageLayout,
      expected_revision: firstHomepageRevision
    }
  });
  const latestHomepageRevision = homepageState.draft_revision;
  check(latestHomepageRevision && latestHomepageRevision !== firstHomepageRevision, 'Updating the homepage draft did not advance its revision.');

  const staleHomepageResponse = await request('/admin/api/homepage/draft', {
    method: 'PUT',
    json: {
      layout: homepageState.layout,
      expected_revision: firstHomepageRevision
    },
    expectedStatus: 409
  });
  const staleHomepageData = await staleHomepageResponse.json();
  check(staleHomepageData.ok === false, 'Stale homepage save did not return ok:false.');

  homepageState = await jsonRequest('/admin/api/homepage/publish', {
    method: 'POST',
    json: {
      layout: homepageState.layout,
      expected_revision: latestHomepageRevision
    }
  });
  check(homepageState.has_published_layout === true && homepageState.published_layout, 'Publishing did not create a public homepage layout.');
  check(homepageState.is_dirty === false, 'Homepage remained dirty immediately after publishing.');

  const genericSiteContent = await jsonRequest('/admin/api/site-content');
  check(!genericSiteContent.contents.some((item) => item.content_key === 'homepage.layout' || item.content_key === 'homepage.layout.draft'), 'Generic site-content list exposed reserved homepage rows.');

  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.homepage_source === 'published_layout', 'Published homepage did not become the canonical public source.');
  check(publicContent.homepage_layout?.blocks?.some((block) => block.id === homepageStory.id), 'Published homepage layout was missing the story block.');
  check(publicContent.homepage_layout.blocks.map((block) => block.id).join(',') === 'hero,blog,about,story-smoke-homepage,author,custom,products', 'Published homepage block order did not match the draft.');
  check(publicContent.homepage_layout.blocks.find((block) => block.id === homepageStory.id)?.content.body === 'Publikovaná verze vlastního bloku.', 'Published homepage story content was incorrect.');
  check(publicContent.homepage_layout.blocks.find((block) => block.id === 'blog')?.content.body === 'Smoke text Z dílny publikovaný z editoru.', 'Published Z dílny content did not reach the public API.');
  check(publicContent.homepage_layout.blocks.find((block) => block.id === 'hero')?.content.image?.url === '/main.JPG', 'Published legacy homepage media lost its embedded compatibility URL.');
  check(publicContent.homepage_layout.blocks.find((block) => block.id === 'hero')?.content.image?.media_id === 'legacy-production-homepage', 'Published legacy homepage media lost its legacy reference.');
  check(publicContent.homepage_layout.blocks.find((block) => block.id === homepageStory.id)?.content.image?.url === '', 'Missing canonical homepage media used a stale embedded URL.');
  const publishedHomepageLayout = cloneJson(publicContent.homepage_layout);

  const changedDraftLayout = cloneJson(homepageState.layout);
  changedDraftLayout.blocks.find((block) => block.id === homepageStory.id).content.body = 'Tato změna musí zůstat jen v konceptu.';
  await new Promise((resolve) => setTimeout(resolve, 10));
  homepageState = await jsonRequest('/admin/api/homepage/draft', {
    method: 'PUT',
    json: {
      layout: changedDraftLayout,
      expected_revision: homepageState.draft_revision
    }
  });
  check(homepageState.is_dirty === true, 'Changed homepage draft was not marked dirty.');
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  assert.deepEqual(publicContent.homepage_layout, publishedHomepageLayout, 'A subsequent draft edit changed the published homepage layout.');

  const unsafeHomepageLayout = cloneJson(homepageState.layout);
  unsafeHomepageLayout.blocks.find((block) => block.id === homepageStory.id).content.cta_url = '//unsafe.example.test';
  const unsafeHomepageResponse = await request('/admin/api/homepage/draft', {
    method: 'PUT',
    json: {
      layout: unsafeHomepageLayout,
      expected_revision: homepageState.draft_revision
    },
    expectedStatus: 400
  });
  const unsafeHomepageData = await unsafeHomepageResponse.json();
  check(unsafeHomepageData.ok === false, 'Unsafe protocol-relative homepage link did not return ok:false.');

  const productCategory = (await jsonRequest('/admin/api/product-categories', {
    method: 'POST',
    json: {
      title: 'Smoke výrobky',
      slug: 'smoke-vyrobky',
      description: 'Isolated product category test.',
      sort_order: 990,
      is_visible: true
    }
  })).category;

  const childProductCategory = (await jsonRequest('/admin/api/product-categories', {
    method: 'POST',
    json: {
      title: 'Smoke podkategorie',
      slug: 'smoke-podkategorie',
      parent_id: productCategory.id,
      description: 'Isolated child category test.',
      sort_order: 10,
      is_visible: true
    }
  })).category;
  check(childProductCategory.parent_id === productCategory.id, 'Product category parent relationship was not saved.');

  const categorySnapshot = await jsonRequest('/admin/api/product-categories');
  const alternateRoot = categorySnapshot.categories.find((category) => !category.parent_id && category.id !== productCategory.id);
  check(alternateRoot, 'No alternate root category was available for hierarchy tests.');

  const parentWithChildrenReparent = await request(`/admin/api/product-categories/${productCategory.id}`, {
    method: 'PATCH',
    json: {
      title: productCategory.title,
      slug: productCategory.slug,
      parent_id: alternateRoot.id,
      description: productCategory.description,
      sort_order: productCategory.sort_order,
      is_visible: true
    },
    expectedStatus: 400
  });
  check((await parentWithChildrenReparent.json()).ok === false, 'A parent with children was silently reparented.');

  const thirdLevelCreate = await request('/admin/api/product-categories', {
    method: 'POST',
    json: {
      title: 'Nepovolená třetí úroveň',
      slug: 'nepovolena-treti-uroven',
      parent_id: childProductCategory.id,
      sort_order: 10,
      is_visible: true
    },
    expectedStatus: 400
  });
  check((await thirdLevelCreate.json()).ok === false, 'A third category level was accepted.');

  const selfParentResponse = await request(`/admin/api/product-categories/${childProductCategory.id}`, {
    method: 'PATCH',
    json: {
      title: childProductCategory.title,
      slug: childProductCategory.slug,
      parent_id: childProductCategory.id,
      description: childProductCategory.description,
      sort_order: childProductCategory.sort_order,
      is_visible: true
    },
    expectedStatus: 400
  });
  check((await selfParentResponse.json()).ok === false, 'Self-parenting was accepted.');

  const promotedChild = (await jsonRequest(`/admin/api/product-categories/${childProductCategory.id}`, {
    method: 'PATCH',
    json: {
      title: childProductCategory.title,
      slug: childProductCategory.slug,
      parent_id: '',
      description: childProductCategory.description,
      sort_order: childProductCategory.sort_order,
      is_visible: true
    }
  })).category;
  check(promotedChild.parent_id === null, 'Child category could not be promoted to the root level.');

  const reparentedProductCategory = (await jsonRequest(`/admin/api/product-categories/${productCategory.id}`, {
    method: 'PATCH',
    json: {
      title: productCategory.title,
      slug: productCategory.slug,
      parent_id: alternateRoot.id,
      description: productCategory.description,
      sort_order: productCategory.sort_order,
      is_visible: true
    }
  })).category;
  check(reparentedProductCategory.parent_id === alternateRoot.id, 'Root category without children could not become a child.');

  const categoryAdminResponse = await request('/admin/product-categories', { expectedStatus: 200 });
  const categoryAdminHtml = await categoryAdminResponse.text();
  check(categoryAdminHtml.includes('category-tree-children') && categoryAdminHtml.includes('Kategorie vyžadující opravu') && categoryAdminHtml.includes('category-image-upload'), 'Category admin did not render hierarchy, recovery, and image controls.');

  const categoryImageForm = new FormData();
  categoryImageForm.append('image', new Blob([await readFile(path.join(projectRoot, 'drevito-logo-transparent.png'))], { type: 'image/png' }), 'smoke-category.png');
  categoryImageForm.append('targetLabel', 'Smoke výrobky');
  categoryImageForm.append('targetKey', 'smoke-vyrobky');
  categoryImageForm.append('alt', 'Smoke obrázek kategorie');
  const categoryPhotoUpload = await jsonRequest('/admin/api/product-categories/photo-upload', {
    method: 'POST',
    body: categoryImageForm
  });
  check(categoryPhotoUpload.photo?.url?.startsWith('/uploads/'), 'Category image was not stored in isolated uploads.');

  const updatedProductCategory = (await jsonRequest(`/admin/api/product-categories/${productCategory.id}`, {
    method: 'PATCH',
    json: {
      title: 'Smoke výrobky upravené',
      slug: 'smoke-vyrobky',
      parent_id: alternateRoot.id,
      description: 'Upravený veřejný popis kategorie.',
      image_url: categoryPhotoUpload.photo.url,
      image_alt: categoryPhotoUpload.photo.alt,
      image_media_id: categoryPhotoUpload.photo.media_id,
      sort_order: 990,
      is_visible: true
    }
  })).category;
  check(updatedProductCategory.title === 'Smoke výrobky upravené', 'Updated category title was not saved.');
  check(updatedProductCategory.image?.media_id === categoryPhotoUpload.photo.media_id, 'Category image reference was not saved.');

  let reloadedCategories = await jsonRequest('/admin/api/product-categories');
  let reloadedProductCategory = reloadedCategories.categories.find((category) => category.id === productCategory.id);
  check(reloadedProductCategory?.image?.media_id === categoryPhotoUpload.photo.media_id, 'Category image did not survive an admin reload.');
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.product_categories.find((category) => category.id === productCategory.id)?.image?.url === categoryPhotoUpload.photo.url, 'Saved category image did not reach the public API.');

  const replacementCategoryImageForm = new FormData();
  replacementCategoryImageForm.append('image', new Blob([await readFile(path.join(projectRoot, 'favicon.png'))], { type: 'image/png' }), 'smoke-category-replacement.png');
  replacementCategoryImageForm.append('targetLabel', 'Smoke výrobky upravené');
  replacementCategoryImageForm.append('targetKey', 'smoke-vyrobky');
  replacementCategoryImageForm.append('alt', 'Náhradní obrázek kategorie');
  const replacementCategoryUpload = await jsonRequest('/admin/api/product-categories/photo-upload', {
    method: 'POST',
    body: replacementCategoryImageForm
  });
  await jsonRequest(`/admin/api/product-categories/${productCategory.id}`, {
    method: 'PATCH',
    json: {
      title: updatedProductCategory.title,
      slug: updatedProductCategory.slug,
      parent_id: alternateRoot.id,
      description: updatedProductCategory.description,
      image_url: replacementCategoryUpload.photo.url,
      image_alt: replacementCategoryUpload.photo.alt,
      image_media_id: replacementCategoryUpload.photo.media_id,
      sort_order: updatedProductCategory.sort_order,
      is_visible: true
    }
  });
  reloadedCategories = await jsonRequest('/admin/api/product-categories');
  reloadedProductCategory = reloadedCategories.categories.find((category) => category.id === productCategory.id);
  check(reloadedProductCategory?.image?.media_id === replacementCategoryUpload.photo.media_id, 'Replacement category image did not survive reload.');
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.product_categories.find((category) => category.id === productCategory.id)?.image?.url === replacementCategoryUpload.photo.url, 'Replacement category image did not reach the public API.');

  await jsonRequest(`/admin/api/product-categories/${productCategory.id}`, {
    method: 'PATCH',
    json: {
      title: updatedProductCategory.title,
      slug: updatedProductCategory.slug,
      parent_id: alternateRoot.id,
      description: updatedProductCategory.description,
      image_url: '',
      image_alt: '',
      image_media_id: '',
      sort_order: updatedProductCategory.sort_order,
      is_visible: true
    }
  });
  reloadedCategories = await jsonRequest('/admin/api/product-categories');
  reloadedProductCategory = reloadedCategories.categories.find((category) => category.id === productCategory.id);
  check(!reloadedProductCategory?.image, 'Removed category image remained in the admin payload.');
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(!publicContent.product_categories.find((category) => category.id === productCategory.id)?.image, 'Removed category image remained public.');

  async function assertImageUpload(buffer, mimeType, filename, expectedStatus, label) {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: mimeType }), filename);
    const response = await request('/admin/api/product-categories/photo-upload', {
      method: 'POST',
      body: form,
      expectedStatus
    });
    const data = await response.json();
    if (expectedStatus === 201) {
      check(data.ok === true && data.photo?.media_id, `${label} was not accepted as a usable image.`);
    } else {
      check(data.ok === false && /platn|poškozen|dekód/i.test(data.error), `${label} was not rejected with a useful 415 error.`);
    }
  }

  const validJpeg = await readFile(path.join(projectRoot, 'main.JPG'));
  const validPng = await readFile(path.join(projectRoot, 'drevito-logo-transparent.png'));
  const validWebp = await sharp({
    create: { width: 3, height: 2, channels: 3, background: { r: 120, g: 80, b: 40 } }
  }).webp({ quality: 80 }).toBuffer();
  const headerOnlyWebp = Buffer.alloc(30);
  headerOnlyWebp.write('RIFF', 0, 'ascii');
  headerOnlyWebp.writeUInt32LE(22, 4);
  headerOnlyWebp.write('WEBP', 8, 'ascii');
  headerOnlyWebp.write('VP8X', 12, 'ascii');
  headerOnlyWebp.writeUInt32LE(10, 16);

  await assertImageUpload(validJpeg, 'image/jpeg', 'valid.jpg', 201, 'Valid JPEG');
  await assertImageUpload(validPng, 'image/png', 'valid.png', 201, 'Valid PNG');
  await assertImageUpload(validWebp, 'image/webp', 'valid.webp', 201, 'Valid WebP');
  await assertImageUpload(validJpeg.subarray(0, Math.max(32, Math.floor(validJpeg.length / 3))), 'image/jpeg', 'truncated.jpg', 415, 'Truncated JPEG');
  await assertImageUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png', 'header-only.png', 415, 'Header-only PNG');
  await assertImageUpload(headerOnlyWebp, 'image/webp', 'header-only.webp', 415, 'Header-only WebP');
  await assertImageUpload(validJpeg, 'image/png', 'mismatched.png', 415, 'MIME-mismatched JPEG');

  const oversizedImageForm = new FormData();
  oversizedImageForm.append('image', new Blob([Buffer.alloc(3.6 * 1024 * 1024)], { type: 'image/jpeg' }), 'oversized.jpg');
  const oversizedImageResponse = await request('/admin/api/product-categories/photo-upload', {
    method: 'POST',
    body: oversizedImageForm,
    expectedStatus: 413
  });
  const oversizedImageData = await oversizedImageResponse.json();
  check(oversizedImageData.ok === false && /příliš velk/i.test(oversizedImageData.error), 'Oversized upload did not return a controlled useful 413 error.');

  const filter = (await jsonRequest('/admin/api/product-filters', {
    method: 'POST',
    json: {
      title: 'Smoke styl',
      slug: 'smoke-styl',
      description: 'Isolated filter test.',
      sort_order: 990,
      is_visible: true
    }
  })).filter;

  const filterOption = (await jsonRequest(`/admin/api/product-filters/${filter.id}/options`, {
    method: 'POST',
    json: {
      title: 'Smoke možnost',
      slug: 'smoke-moznost',
      sort_order: 10,
      is_visible: true
    }
  })).option;

  const imageForm = new FormData();
  imageForm.append('image', new Blob([await readFile(path.join(projectRoot, 'drevito-logo-transparent.png'))], { type: 'image/png' }), 'smoke-product.png');
  imageForm.append('targetLabel', 'Smoke výrobek');
  imageForm.append('targetKey', 'smoke-vyrobek');
  imageForm.append('alt', 'Smoke výrobek');
  const photoUpload = await jsonRequest('/admin/api/products/photo-upload', {
    method: 'POST',
    body: imageForm
  });
  check(photoUpload.photo?.url?.startsWith('/uploads/'), 'Product photo was not stored in isolated uploads.');

  const productPayload = {
    title: 'Smoke výrobek',
    slug: 'smoke-vyrobek',
    short_description: 'Publikační test výrobku.',
    description: 'Celý popis testovacího výrobku.',
    photos: [photoUpload.photo],
    price: 1234,
    wood_types: ['dub'],
    availability: 'made_to_order',
    use_context: ['interior'],
    category_ids: [productCategory.id],
    filter_option_ids: [filterOption.id],
    sort_order: 990,
    is_visible: true,
    is_published: true,
    published_at: ''
  };
  const product = (await jsonRequest('/admin/api/products', {
    method: 'POST',
    json: productPayload
  })).product;
  check(product.is_published && product.is_visible, 'Product was not published.');
  check(product.category_ids.includes(productCategory.id), 'Product category link was not saved.');
  check(product.filter_option_ids.includes(filterOption.id), 'Product filter link was not saved.');

  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  let publicProduct = publicContent.products.find((item) => item.slug === productPayload.slug);
  check(publicProduct, 'Published product was missing from public content.');
  check(publicProduct.categories.some((item) => item.id === productCategory.id), 'Public product category was missing.');
  check(publicProduct.filter_options.some((item) => item.id === filterOption.id), 'Public product filter was missing.');
  check(!Object.prototype.hasOwnProperty.call(publicProduct, 'url'), 'Public product unexpectedly exposed a shop URL.');
  check(publicContent.product_filters.some((item) => item.id === filter.id), 'Visible product filter was missing from public content.');
  const publicProductCategory = publicContent.product_categories.find((item) => item.id === productCategory.id);
  check(publicProductCategory?.title === 'Smoke výrobky upravené', 'Updated category title did not reach the public API.');
  check(!publicProductCategory?.image, 'Removed category image unexpectedly returned in later public content.');

  const productPage = await request(`/vyrobek/${productPayload.slug}`, {
    authenticated: false,
    expectedStatus: 200
  });
  const productHtml = await productPage.text();
  check(productHtml.includes(productPayload.title), 'Product detail page did not contain the product title.');
  check(productHtml.includes('1&nbsp;234') || productHtml.includes('1 234') || productHtml.includes('1 234'), 'Product detail page did not contain the product price.');
  check(productHtml.includes('mailto:info@drevito.cz') && productHtml.includes('Poptat výrobek'), 'Product detail page did not contain the direct enquiry action.');
  check(!/<a[^>]+href=["']https?:\/\//i.test(productHtml), 'Product detail page unexpectedly linked away from Dřevito.');

  await jsonRequest(`/admin/api/products/${product.id}/archive`, { method: 'POST', json: {} });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(!publicContent.products.some((item) => item.id === product.id), 'Archived product remained public.');
  await request(`/vyrobek/${productPayload.slug}`, { authenticated: false, expectedStatus: 404 });

  await jsonRequest(`/admin/api/products/${product.id}/restore`, { method: 'POST', json: {} });
  await jsonRequest(`/admin/api/products/${product.id}`, {
    method: 'PATCH',
    json: productPayload
  });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.products.some((item) => item.id === product.id), 'Republished product did not return to public content.');

  const blogCategory = (await jsonRequest('/admin/api/blog-categories', {
    method: 'POST',
    json: {
      title: 'Smoke blog',
      slug: 'smoke-blog',
      description: 'Isolated blog category test.',
      sort_order: 990,
      is_visible: true
    }
  })).category;

  const blogPayload = {
    title: 'Smoke článek',
    slug: 'smoke-clanek',
    excerpt: 'Publikační test článku.',
    main_content: 'Celý obsah testovacího článku.',
    content_format: 'html',
    photos: [],
    author_name: 'Dřevito',
    category_ids: [blogCategory.id],
    status: 'published',
    published_at: '',
    sort_order: 990
  };
  const blogImageForm = new FormData();
  blogImageForm.append('image', new Blob([await readFile(path.join(projectRoot, 'main.JPG'))], { type: 'image/jpeg' }), 'smoke-mobile-photo.jpg');
  blogImageForm.append('targetLabel', blogPayload.title);
  blogImageForm.append('targetKey', blogPayload.slug);
  blogImageForm.append('alt', 'Smoke fotografie článku');
  const blogPhotoUpload = await jsonRequest('/admin/api/blog-posts/photo-upload', {
    method: 'POST',
    body: blogImageForm
  });
  check(blogPhotoUpload.photo?.url?.startsWith('/uploads/'), 'Blog image was not stored in isolated uploads.');
  blogPayload.photos = [blogPhotoUpload.photo];
  const blogPost = (await jsonRequest('/admin/api/blog-posts', {
    method: 'POST',
    json: blogPayload
  })).post;
  check(blogPost.status === 'published', 'Blog post was not published.');
  check(blogPost.category_ids.includes(blogCategory.id), 'Blog category link was not saved.');

  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  const publicPost = publicContent.blog_posts.find((item) => item.slug === blogPayload.slug);
  check(publicPost, 'Published blog post was missing from public content.');
  check(publicPost.categories.some((item) => item.id === blogCategory.id), 'Public blog category was missing.');
  check(publicPost.featured_image?.url === blogPhotoUpload.photo.url, 'Uploaded blog image did not reach public content.');

  const blogPage = await request(`/blog/${blogPayload.slug}`, {
    authenticated: false,
    expectedStatus: 200
  });
  const blogHtml = await blogPage.text();
  check(blogHtml.includes(blogPayload.title), 'Blog detail page did not contain the article title.');
  check(blogHtml.includes(blogPhotoUpload.photo.url), 'Blog detail page did not render the uploaded image.');

  await jsonRequest(`/admin/api/blog-posts/${blogPost.id}/archive`, { method: 'POST', json: {} });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(!publicContent.blog_posts.some((item) => item.id === blogPost.id), 'Archived blog post remained public.');
  await request(`/blog/${blogPayload.slug}`, { authenticated: false, expectedStatus: 404 });

  await jsonRequest(`/admin/api/blog-posts/${blogPost.id}/restore`, { method: 'POST', json: {} });
  await jsonRequest(`/admin/api/blog-posts/${blogPost.id}`, {
    method: 'PATCH',
    json: blogPayload
  });
  publicContent = await jsonRequest('/api/public-content?locale=cs', { authenticated: false });
  check(publicContent.blog_posts.some((item) => item.id === blogPost.id), 'Republished blog post did not return to public content.');

  await jsonRequest(`/admin/api/product-filters/${filter.id}`, {
    method: 'PATCH',
    json: {
      title: 'Smoke styl upravený',
      slug: 'smoke-styl',
      description: 'Updated isolated filter test.',
      sort_order: 990,
      is_visible: true
    }
  });
  await jsonRequest(`/admin/api/product-filters/${filter.id}/options/${filterOption.id}`, {
    method: 'PATCH',
    json: {
      title: 'Smoke možnost upravená',
      slug: 'smoke-moznost',
      sort_order: 10,
      is_visible: true
    }
  });
  const updatedFilters = await jsonRequest('/admin/api/product-filters');
  const updatedFilter = updatedFilters.filters.find((item) => item.id === filter.id);
  check(updatedFilter?.title === 'Smoke styl upravený', 'Product filter update was not saved.');
  check(updatedFilter.options.some((item) => item.id === filterOption.id && item.title === 'Smoke možnost upravená'), 'Product filter option update was not saved.');

  await jsonRequest(`/admin/api/product-categories/${productCategory.id}/archive`, { method: 'POST', json: {} });
  await jsonRequest(`/admin/api/product-categories/${productCategory.id}/restore`, { method: 'POST', json: {} });
  await jsonRequest(`/admin/api/blog-categories/${blogCategory.id}/archive`, { method: 'POST', json: {} });
  await jsonRequest(`/admin/api/blog-categories/${blogCategory.id}/restore`, { method: 'POST', json: {} });

  const cmsDbPath = path.join(dataDir, 'cms-db.json');
  const malformedHierarchyDb = JSON.parse(await readFile(cmsDbPath, 'utf8'));
  const malformedTimestamp = new Date().toISOString();
  malformedHierarchyDb.product_categories.push(
    {
      id: '10000000-0000-4000-8000-000000000001',
      title: 'Smoke osiřelá kategorie',
      slug: 'smoke-osirela-kategorie',
      description: null,
      image: null,
      parent_id: '10000000-0000-4000-8000-999999999999',
      sort_order: 996,
      is_visible: true,
      archived_at: null,
      created_at: malformedTimestamp,
      updated_at: malformedTimestamp
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      title: 'Smoke cyklus A',
      slug: 'smoke-cyklus-a',
      description: null,
      image: null,
      parent_id: '10000000-0000-4000-8000-000000000003',
      sort_order: 997,
      is_visible: true,
      archived_at: null,
      created_at: malformedTimestamp,
      updated_at: malformedTimestamp
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      title: 'Smoke cyklus B',
      slug: 'smoke-cyklus-b',
      description: null,
      image: null,
      parent_id: '10000000-0000-4000-8000-000000000002',
      sort_order: 998,
      is_visible: true,
      archived_at: null,
      created_at: malformedTimestamp,
      updated_at: malformedTimestamp
    }
  );
  await writeFile(cmsDbPath, `${JSON.stringify(malformedHierarchyDb, null, 2)}\n`);
  const recoveryCategories = await jsonRequest('/admin/api/product-categories');
  check(recoveryCategories.categories.some((category) => category.title === 'Smoke osiřelá kategorie'), 'Orphaned category disappeared from the admin API.');
  check(recoveryCategories.categories.some((category) => category.title === 'Smoke cyklus A'), 'Cyclic category disappeared from the admin API.');
  const recoveryAdminResponse = await request('/admin/product-categories', { expectedStatus: 200 });
  const recoveryAdminHtml = await recoveryAdminResponse.text();
  check(recoveryAdminHtml.includes('Kategorie vyžadující opravu'), 'Admin did not expose a recovery group for malformed hierarchy records.');

  for (const internalPath of ['/server.js', '/package.json', '/supabase/config.toml', '/scripts/smoke-test.mjs', '/.env.example', '/uploads/%2e%2e/server.js']) {
    await request(internalPath, { authenticated: false, expectedStatus: [403, 404] });
  }
  await request('/main.JPG', { authenticated: false, expectedStatus: 200 });
  await request('/image-upload-tools.js', { authenticated: false, expectedStatus: 200 });

  const emptyDataDir = path.join(tempRoot, 'configured-empty-data');
  const emptyUploadDir = path.join(tempRoot, 'configured-empty-uploads');
  await mkdir(emptyDataDir, { recursive: true });
  await writeFile(path.join(emptyDataDir, 'cms-db.json'), `${JSON.stringify({
    version: 4,
    seeded_defaults_at: '2026-09-10T00:00:00.000Z',
    site_content: [],
    product_categories: [],
    products: [],
    product_category_links: [],
    product_filters: [],
    product_filter_options: [],
    product_filter_value_links: [],
    blog_categories: [],
    blog_posts: [],
    blog_category_links: []
  }, null, 2)}\n`);
  const configuredEmptyBaseUrl = await startAuxiliaryServer({
    DREVITO_DATA_DIR: emptyDataDir,
    DREVITO_UPLOAD_DIR: emptyUploadDir,
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DREVITO_STATIC_FALLBACK: ''
  });
  const configuredEmptyResponse = await auxiliaryRequest(configuredEmptyBaseUrl, '/api/public-content?locale=cs', 200);
  const configuredEmptyPayload = await configuredEmptyResponse.json();
  check(configuredEmptyPayload.configured === true, 'An intentionally empty configured CMS was misclassified as unconfigured.');
  check(configuredEmptyPayload.products.length === 0 && configuredEmptyPayload.blog_posts.length === 0, 'An intentionally empty configured CMS resurrected bundled content.');
  await auxiliaryRequest(configuredEmptyBaseUrl, '/vyrobek/cajne-stolicky', 404);
  await auxiliaryRequest(configuredEmptyBaseUrl, '/blog/o-tvurci', 404);

  const failedDataDir = path.join(tempRoot, 'configured-failed-data');
  const failedUploadDir = path.join(tempRoot, 'configured-failed-uploads');
  const configuredFailedBaseUrl = await startAuxiliaryServer({
    DREVITO_DATA_DIR: failedDataDir,
    DREVITO_UPLOAD_DIR: failedUploadDir,
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: 'smoke-service-role-placeholder',
    DREVITO_STATIC_FALLBACK: ''
  });
  const configuredFailedResponse = await auxiliaryRequest(configuredFailedBaseUrl, '/api/public-content?locale=cs', 503);
  const configuredFailedPayload = await configuredFailedResponse.json();
  check(configuredFailedPayload.ok === false && configuredFailedPayload.configured === true, 'Configured CMS failure was not reported as a configured unavailable state.');
  const failedProductResponse = await auxiliaryRequest(configuredFailedBaseUrl, '/vyrobek/cajne-stolicky', 503);
  const failedProductHtml = await failedProductResponse.text();
  check(failedProductHtml.includes('Obsah je dočasně nedostupný') && !failedProductHtml.includes('Čajový stolek č. 1'), 'Configured product failure returned bundled product content.');
  const failedBlogResponse = await auxiliaryRequest(configuredFailedBaseUrl, '/blog/o-tvurci', 503);
  const failedBlogHtml = await failedBlogResponse.text();
  check(failedBlogHtml.includes('Obsah je dočasně nedostupný') && !failedBlogHtml.includes('Vít Thorio — tvůrce Dřevito'), 'Configured blog failure returned bundled blog content.');

  const staticDataDir = path.join(tempRoot, 'unconfigured-static-data');
  const staticUploadDir = path.join(tempRoot, 'unconfigured-static-uploads');
  const unconfiguredStaticBaseUrl = await startAuxiliaryServer({
    DREVITO_DATA_DIR: staticDataDir,
    DREVITO_UPLOAD_DIR: staticUploadDir,
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DREVITO_STATIC_FALLBACK: '1'
  });
  const unconfiguredStaticResponse = await auxiliaryRequest(unconfiguredStaticBaseUrl, '/api/public-content?locale=cs', 200);
  const unconfiguredStaticPayload = await unconfiguredStaticResponse.json();
  check(unconfiguredStaticPayload.configured === false && unconfiguredStaticPayload.homepage_source === 'static', 'Explicit static development mode was not identified as unconfigured.');
  const unconfiguredIndexResponse = await auxiliaryRequest(unconfiguredStaticBaseUrl, '/', 200);
  check((await unconfiguredIndexResponse.text()).includes('data-cms-mode="unconfigured"'), 'Explicit static development mode did not mark the served homepage.');
  const staticProductResponse = await auxiliaryRequest(unconfiguredStaticBaseUrl, '/vyrobek/cajne-stolicky', 200);
  check((await staticProductResponse.text()).includes('Čajový stolek'), 'Explicit static development mode did not retain the requested local fallback.');

  const logoutResponse = await request('/admin/logout', { method: 'POST', expectedStatus: [302, 303] });
  check((logoutResponse.headers.get('set-cookie') || '').includes('Max-Age=0'), 'Logout did not clear the session cookie.');
  sessionCookie = '';
  await request('/admin', { expectedStatus: [302, 303] });

  console.log('Dřevito smoke test passed.');
  console.log('Verified: login/logout, canonical homepage draft/publish, category hierarchy and image lifecycle, product/blog media, malformed/oversized uploads, fail-closed CMS modes, static security, filters, archive/restore, public API, and detail routes.');
} finally {
  for (const auxiliaryChild of auxiliaryChildren) {
    if (!auxiliaryChild.killed) {
      auxiliaryChild.kill('SIGTERM');
      await new Promise((resolve) => auxiliaryChild.once('exit', resolve));
    }
  }
  if (child && !child.killed) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}
