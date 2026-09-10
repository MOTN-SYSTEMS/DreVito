import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await readFile(path.join(projectRoot, 'supabase/migrations/20260910120547_repair_cms_public_data_flow.sql'), 'utf8');
const writerMigration = await readFile(path.join(projectRoot, 'supabase/migrations/20260812230000_add_homepage_layout_writer.sql'), 'utf8');
const serverSource = await readFile(path.join(projectRoot, 'server.js'), 'utf8');
const homepageSource = await readFile(path.join(projectRoot, 'index.html'), 'utf8');

assert.match(writerMigration, /homepage_layout_requires_writer_rpc/, 'Writer trigger fixture is missing.');
assert.match(migration, /do \$homepage_copy_repair\$[\s\S]*set_config\('drevito\.homepage_layout_write', 'on', true\)[\s\S]*update public\.site_content[\s\S]*\$homepage_copy_repair\$;/, 'Homepage repair is not transaction-scoped with its protected update.');
assert.match(migration, /pg_advisory_xact_lock[\s\S]*homepage-layout:cs/, 'Homepage repair does not share the writer lock.');
assert.doesNotMatch(migration, /insert into public\.products/i, 'Migration manufactures product content.');
assert.doesNotMatch(migration, /update public\.products/i, 'Migration changes client-managed products.');
assert.doesNotMatch(migration, /(insert into|update) public\.product_category_links/i, 'Migration changes client category assignments.');
assert.doesNotMatch(migration, /on conflict \(id\) do update/i, 'Migration rewrites existing Storage bucket settings.');
assert.match(migration, /drevito_storage_bucket_requires_operator_review/, 'Unexpected Storage configuration does not fail safely.');
assert.match(migration, /enforce_product_category_two_levels/, 'Database hierarchy guard is missing.');
assert.match(migration, /pg_advisory_xact_lock[\s\S]*drevito:product-category-hierarchy/, 'Hierarchy mutations lack a transaction-scoped serialization lock.');

assert.match(serverSource, /PUBLIC_STATIC_FILES/, 'Static allowlist is missing.');
assert.match(serverSource, /if \(isCmsExpected\(\)\)[\s\S]{0,180}renderCmsUnavailablePage\('product'\)/, 'Configured product failure is not fail-closed.');
assert.match(serverSource, /isLegacyHomepageContentKey[\s\S]{0,240}statusCode = 409/, 'Legacy homepage keys are not blocked from generic writes.');
assert.doesNotMatch(homepageSource, /loadManagedImages/, 'Public homepage still has a competing media loader.');
assert.match(homepageSource, /Příběh za značkou – Vít Thorio, tvůrce Dřevito/, 'Author identification is incomplete.');
assert.doesNotMatch(homepageSource, /Rodinná dílna(?: ·)? Dolní Ředice/, 'Removed workshop phrase returned.');
assert.match(homepageSource, /\.about__image\s*\{[\s\S]{0,160}--about-frame-shape:\s*50%/, 'Řemeslo s tradicí no longer uses the clean oval frame.');
assert.doesNotMatch(serverSource, /children\.map\(renderCategoryRow\)/, 'Category renderer still passes the child index as a hierarchy warning.');
assert.match(serverSource, /children\.map\(function\(child\) \{ return renderCategoryRow\(child\); \}\)/, 'Valid child rows are not rendered with an explicit warning-free call.');
assert.match(serverSource, /if \(mediaId && !media\) return null;/, 'Missing or private canonical media can fall back to a stale embedded URL.');
assert.match(serverSource, /const mediaMap = givenMediaMap \|\| await fetchPublicMediaMap\(mediaIds\);/, 'Canonical media IDs are still gated by the legacy target inventory.');
assert.match(serverSource, /sharp\(file\.buffer,[\s\S]*failOn: 'error'[\s\S]*\.raw\(\)\.toBuffer\(\{ resolveWithObject: true \}\)/, 'Server upload validation does not force a complete image decode.');

const require = createRequire(import.meta.url);
const imageTools = require(path.join(projectRoot, 'image-upload-tools.js'));
assert.equal(imageTools.needsNormalization(500000, 6000, 4000), true, 'Huge dimensions bypass normalization.');
assert.equal(imageTools.needsNormalization(500000, 1600, 1200), false, 'Normal image is unnecessarily normalized.');
assert.equal(imageTools.needsNormalization(imageTools.TARGET_BYTES + 1, 1600, 1200), true, 'Oversized bytes bypass normalization.');
assert.equal(imageTools.isHeic({ type: '', name: 'mobile-photo.HEIC' }), true, 'HEIC filename is not recognized.');

console.log('Dřevito correction contract test passed.');
console.log('Verified deterministic source contracts for migration safety, CMS authority, fail-closed fallback, static serving, author copy, and image normalization decisions.');
