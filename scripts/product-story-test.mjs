import formatProductDimensions from '../product-dimensions.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

// Build the historical phrase in pieces so even this regression fixture does
// not contain it verbatim. Normalize formatting and HTML whitespace variants.
const forbidden = ['Vyrobeno', 's respektem', 'ke dřevu'].join(' ').toLowerCase();
const normalize = text => text.normalize('NFC').replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ').replace(/\s+/g, ' ').toLowerCase();
let checked = 0;
for (const file of execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  assert.ok(!normalize(bytes.toString()).includes(forbidden), `Forbidden product copy in ${file}`);
  checked++;
}
const source = readFileSync('index.html', 'utf8');
const start = source.indexOf('    function renderRequestedFileProduct()');
const end = source.indexOf('    function blogCategorySlugs(', start);
assert.ok(start > 0 && end > start);
const renderSource = source.slice(start, end);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function render(description, dimensions = {}, surface_finish = '') {
  const root = {};
  const product = { ...dimensions, slug: 'test', title: 'Oak board', short_description: 'Short product description', description, surface_finish };
  new Script(renderSource + '\nrenderRequestedFileProduct();').runInNewContext({
    formatProductDimensions,
    requestedFileProductSlug: () => 'test', products: [product],
    document: { getElementById: () => root, body: { classList: { add() {} } } },
    window: { location: { protocol: 'file:' } }, prepareFileProductNavigation() {},
    productName: p => p.title, productImage: () => '', productImageAlt: p => p.title,
    productDescription: p => p.short_description, productCategoryNames: () => [],
    stripHtml: value => value.replace(/<[^>]*>/g, '').trim(),
    textParagraphs: value => value.split(/\n+/).map(x => x.trim()).filter(Boolean), escapeHtml
  });
  return root.innerHTML;
}
for (const empty of ['', null, undefined, '  \n ', '<p> </p>']) {
  assert.doesNotMatch(render(empty), /<section class="file-product__story"|file-product-story-title|Příběh výrobku/);
}
const custom = render('Retained the natural oak edge.\nA board selected for this table.');
assert.match(custom, /<section class="file-product__story"/);
assert.match(custom, /<p>Retained the natural oak edge\.<\/p>/);
assert.match(custom, /<p>A board selected for this table\.<\/p>/);
assert.doesNotMatch(custom.toLowerCase(), new RegExp(forbidden));
console.log(`PASS: ${checked} tracked text sources free of forbidden copy; static renderer custom/empty/null/whitespace stories.`);

assert.match(render('', {height_cm: 45, width_cm: 120, length_cm: 40}), /45 × 120 × 40 cm/);
assert.match(render('', {height_cm: 12.5, length_cm: 40}), /Výška: 12,5 cm · Délka: 40 cm/);
assert.doesNotMatch(render('Dimensions only in existing text'), /<dl class="file-product__dimensions"/);
assert.match(render('', {}, 'Přírodní olej'), /<dl class="file-product__specification"><dt>Povrchová úprava<\/dt><dd>Přírodní olej<\/dd><\/dl>/);
assert.doesNotMatch(render('', {}, ''), /Povrchová úprava|file-product__specification/);
assert.match(render('', {}, '<olej>'), /&lt;olej&gt;/);
