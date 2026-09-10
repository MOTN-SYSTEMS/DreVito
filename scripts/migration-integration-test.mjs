import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supabaseEnvironment = {
  ...process.env,
  DO_NOT_TRACK: '1',
  SUPABASE_TELEMETRY_DISABLED: '1'
};

function runSupabase(args, { expectFailure = false } = {}) {
  const result = spawnSync('supabase', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: supabaseEnvironment
  });
  if (result.error) throw result.error;
  if (expectFailure) {
    assert.notEqual(result.status, 0, `supabase ${args.join(' ')} unexpectedly succeeded`);
  } else {
    assert.equal(result.status, 0, `supabase ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function localStatus() {
  const result = spawnSync('supabase', ['status', '--output', 'json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: supabaseEnvironment
  });
  assert.equal(result.status, 0, `supabase status failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

runSupabase(['db', 'reset', '--local', '--no-seed', '--version', '20260812230000', '--yes']);
const status = localStatus();
const apiUrl = status.API_URL;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
assert.ok(apiUrl && serviceRoleKey, 'Local Supabase status did not expose the API URL and service-role key.');

async function api(pathname, { method = 'GET', body, expected = 200, prefer = '' } = {}) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: 'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(expectedStatuses.includes(response.status), `${method} ${pathname} returned ${response.status}; expected ${expectedStatuses.join(' or ')}: ${text}`);
  return { response, data };
}

const fixtureLayout = {
  version: 1,
  blocks: [
    {
      id: 'hero',
      kind: 'hero',
      visible: true,
      content: {
        eyebrow: 'Rodinná dílna Dolní Ředice',
        title: 'Obsolete hero',
        body: 'Keep hero body',
        custom: 'keep hero custom'
      }
    },
    {
      id: 'author',
      kind: 'author',
      visible: true,
      content: { title: 'Old author', body: 'Keep author body' }
    },
    {
      id: 'story-migration-fixture',
      kind: 'story',
      visible: true,
      content: { title: 'Keep story', body: 'Keep custom story' }
    }
  ],
  custom_root_value: 'keep root'
};

const draftWrite = await api('/rest/v1/rpc/write_homepage_layout', {
  method: 'POST',
  body: {
    p_locale: 'cs',
    p_layout: fixtureLayout,
    p_expected_draft_updated_at: null,
    p_operation: 'draft'
  }
});
const publishWrite = await api('/rest/v1/rpc/write_homepage_layout', {
  method: 'POST',
  body: {
    p_locale: 'cs',
    p_layout: fixtureLayout,
    p_expected_draft_updated_at: draftWrite.data.draft_revision,
    p_operation: 'publish'
  }
});
assert.equal(publishWrite.data.has_published_layout, true, 'Protected homepage fixture was not published through the writer RPC.');

const legacyProduct = (await api('/rest/v1/products?select=*', {
  method: 'POST',
  expected: 201,
  prefer: 'return=representation',
  body: {
    id: 'b1000000-0000-4000-8000-000000000001',
    title: 'Client renamed product',
    slug: 'client-renamed-product',
    short_description: 'Must stay untouched.',
    description: 'Client-managed record.',
    photos: [],
    is_visible: true,
    is_published: true,
    sort_order: 91
  }
})).data[0];
const legacyCategory = (await api('/rest/v1/product_categories?select=*', {
  method: 'POST',
  expected: 201,
  prefer: 'return=representation',
  body: {
    id: 'b2000000-0000-4000-8000-000000000001',
    title: 'Client category',
    slug: 'client-category',
    sort_order: 91,
    is_visible: true
  }
})).data[0];
await api('/rest/v1/product_category_links', {
  method: 'POST',
  expected: 201,
  body: {
    product_id: legacyProduct.id,
    category_id: legacyCategory.id,
    sort_order: 7
  }
});

await api('/storage/v1/bucket', {
  method: 'POST',
  body: {
    id: 'site-media',
    name: 'site-media',
    public: false,
    file_size_limit: 3500000,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  }
});

const failedMigrationOutput = runSupabase(['migration', 'up', '--local', '--include-all'], { expectFailure: true });
assert.match(failedMigrationOutput, /drevito_storage_bucket_requires_operator_review/, 'Unexpected private bucket did not fail with the explicit review precondition.');
const privateBucket = (await api('/storage/v1/bucket/site-media')).data;
assert.equal(privateBucket.public, false, 'Failed migration changed the pre-existing private bucket.');

await api('/storage/v1/bucket/site-media', { method: 'DELETE', expected: 200 });
await api('/storage/v1/bucket', {
  method: 'POST',
  body: {
    id: 'site-media',
    name: 'site-media',
    public: true,
    file_size_limit: 3500000,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
  }
});

runSupabase(['migration', 'up', '--local', '--include-all']);

const repairedRows = (await api('/rest/v1/site_content?locale=eq.cs&content_key=in.(homepage.layout,homepage.layout.draft)&select=content_key,value&order=content_key.asc')).data;
assert.equal(repairedRows.length, 2, 'Migration lost the published/draft homepage pair.');
for (const row of repairedRows) {
  const hero = row.value.blocks.find((block) => block.id === 'hero');
  const author = row.value.blocks.find((block) => block.id === 'author');
  const story = row.value.blocks.find((block) => block.id === 'story-migration-fixture');
  assert.equal(hero.content.title, 'Dřevito – když se umění snoubí s citem k přirozenosti', `${row.content_key} hero title was not repaired.`);
  assert.equal(hero.content.eyebrow, '', `${row.content_key} obsolete eyebrow was not removed.`);
  assert.equal(hero.content.body, 'Keep hero body', `${row.content_key} hero body changed.`);
  assert.equal(hero.content.custom, 'keep hero custom', `${row.content_key} custom hero field changed.`);
  assert.equal(author.content.title, 'Příběh za značkou – Vít Thorio, tvůrce Dřevito', `${row.content_key} author title was not repaired.`);
  assert.equal(author.content.body, 'Keep author body', `${row.content_key} author body changed.`);
  assert.equal(story.content.body, 'Keep custom story', `${row.content_key} custom story changed.`);
  assert.equal(row.value.custom_root_value, 'keep root', `${row.content_key} custom root value changed.`);
}

const guardedDirectWrite = await api('/rest/v1/site_content?locale=eq.cs&content_key=eq.homepage.layout', {
  method: 'PATCH',
  body: { value: fixtureLayout },
  expected: [400, 401, 403]
});
assert.match(JSON.stringify(guardedDirectWrite.data), /homepage_layout_requires_writer_rpc/, 'Writer trigger no longer protects direct homepage writes.');

const latestDraft = repairedRows.find((row) => row.content_key === 'homepage.layout.draft');
const draftState = (await api('/rest/v1/site_content?locale=eq.cs&content_key=eq.homepage.layout.draft&select=updated_at,value')).data[0];
const changedDraft = structuredClone(latestDraft.value);
changedDraft.blocks.find((block) => block.id === 'story-migration-fixture').content.body = 'Draft-only change';
await api('/rest/v1/rpc/write_homepage_layout', {
  method: 'POST',
  body: {
    p_locale: 'cs',
    p_layout: changedDraft,
    p_expected_draft_updated_at: draftState.updated_at,
    p_operation: 'draft'
  }
});
const separationRows = (await api('/rest/v1/site_content?locale=eq.cs&content_key=in.(homepage.layout,homepage.layout.draft)&select=content_key,value')).data;
assert.equal(separationRows.find((row) => row.content_key === 'homepage.layout').value.blocks.find((block) => block.id === 'story-migration-fixture').content.body, 'Keep custom story', 'Draft edit leaked into published homepage content.');
assert.equal(separationRows.find((row) => row.content_key === 'homepage.layout.draft').value.blocks.find((block) => block.id === 'story-migration-fixture').content.body, 'Draft-only change', 'Writer RPC did not retain the draft-only edit.');

const productsAfter = (await api('/rest/v1/products?select=*')).data;
const linksAfter = (await api('/rest/v1/product_category_links?select=*')).data;
assert.deepEqual(productsAfter.find((product) => product.id === legacyProduct.id), legacyProduct, 'Migration changed the renamed client product.');
assert.deepEqual(linksAfter, [{ product_id: legacyProduct.id, category_id: legacyCategory.id, sort_order: 7, created_at: linksAfter[0].created_at }], 'Migration changed or speculatively added category relations.');
assert.equal(productsAfter.some((product) => product.slug === 'cajne-stolicky'), false, 'Migration recreated an intentionally absent legacy product.');

const preservedBucket = (await api('/storage/v1/bucket/site-media')).data;
assert.equal(preservedBucket.public, true, 'Compatible existing bucket changed visibility.');
assert.equal(Number(preservedBucket.file_size_limit), 3500000, 'Compatible existing bucket limit was overwritten.');
assert.ok(preservedBucket.allowed_mime_types.includes('image/avif'), 'Compatible existing bucket MIME configuration was overwritten.');
for (const bucketId of ['product-images', 'blog-images']) {
  const bucket = (await api(`/storage/v1/bucket/${bucketId}`)).data;
  assert.equal(bucket.public, true, `Missing ${bucketId} bucket was not created for public media reads.`);
}

const rootB = (await api('/rest/v1/product_categories?select=*', {
  method: 'POST',
  expected: 201,
  prefer: 'return=representation',
  body: { id: 'b2000000-0000-4000-8000-000000000002', title: 'Second root', slug: 'second-root', is_visible: true }
})).data[0];
const child = (await api('/rest/v1/product_categories?select=*', {
  method: 'POST',
  expected: 201,
  prefer: 'return=representation',
  body: { id: 'b2000000-0000-4000-8000-000000000003', title: 'Child', slug: 'child', parent_id: legacyCategory.id, is_visible: true }
})).data[0];
await api('/rest/v1/product_categories', {
  method: 'POST',
  body: { id: 'b2000000-0000-4000-8000-000000000004', title: 'Grandchild', slug: 'grandchild', parent_id: child.id, is_visible: true },
  expected: 400
});
await api(`/rest/v1/product_categories?id=eq.${legacyCategory.id}`, {
  method: 'PATCH',
  body: { parent_id: rootB.id },
  expected: 400
});
await api(`/rest/v1/product_categories?id=eq.${child.id}`, {
  method: 'PATCH',
  body: { parent_id: child.id },
  expected: 400
});

console.log('Dřevito migration integration test passed.');
console.log('Verified the exact migration against local PostgreSQL/Supabase with protected homepage rows, unexpected and customized buckets, untouched client product relations, and database hierarchy constraints.');
