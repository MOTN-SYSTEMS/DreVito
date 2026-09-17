import assert from 'node:assert/strict';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveQrTarget, renderQr } = require('../lib/static-qr');
const payload = {
  blog_posts: [{id:'author',slug:'o-tvurci'}, {id:'story',slug:'pribeh-teto-lavice-a-stolu'}],
  products: [{id:'product',slug:'dekorace-zena'}],
  product_categories: [{id:'parent',slug:'rustikalni-nabytek'}, {id:'child',slug:'stoly',parent_id:'parent'}]
};
for (const [type,id,path] of [
  ['blog-posts','author','/blog/o-tvurci'],
  ['blog-posts','story','/blog/pribeh-teto-lavice-a-stolu'],
  ['products','product','/vyrobek/dekorace-zena'],
  ['product-categories','parent','/vyrobky/rustikalni-nabytek'],
  ['product-categories','child','/vyrobky/rustikalni-nabytek/stoly']
]) {
  const target = resolveQrTarget(payload,type,id);
  assert.equal(target.url,'https://www.drevito.cz'+path);
  for (const format of ['svg','png']) {
    const body = await renderQr(target.url,format);
    assert.deepEqual(await renderQr(target.url,format),body,'QR must be deterministic');
    for (const size of [256,1200]) {
      const {data,info} = await sharp(Buffer.from(body)).resize(size,size,{kernel:'nearest'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const decoded = jsQR(new Uint8ClampedArray(data),info.width,info.height);
      assert.equal(decoded?.data,target.url,`${type}/${id} ${format} at ${size}px`);
    }
  }
}
for (const [type,id] of [['blog-posts','draft'],['products','missing'],['unknown','author'],['__proto__','author']]) {
  assert.throws(()=>resolveQrTarget(payload,type,id));
}
assert.throws(()=>resolveQrTarget({...payload,product_categories:[payload.product_categories[1]]},'product-categories','child'));
for (const slug of ['../admin','https://evil.test','Title','abc?x=1','a'.repeat(201)]) {
  assert.throws(()=>resolveQrTarget({products:[{id:'x',slug}]},'products','x'));
}
console.log('QR decode passed: SVG and PNG, 5 canonical targets, 256px and 1200px, deterministic regeneration, invalid/nonpublic target rejection.');
