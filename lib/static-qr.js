const QRCode = require('qrcode');

const ORIGIN = 'https://www.drevito.cz';
const TYPES = { products: 'products', 'blog-posts': 'blog_posts', 'product-categories': 'product_categories' };
const validSlug = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;

function qrError(message, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}

// The input is the same filtered public payload used by the public detail routes.
// Never accept an arbitrary URL or derive a slug from an editable title.
function resolveQrTarget(payload, type, id) {
  if (!Object.hasOwn(TYPES, type) || typeof id !== 'string' || !id || id.length > 200) {
    throw qrError('Neplatný požadavek na QR kód.', 400);
  }
  const records = payload[TYPES[type]] || [];
  const record = records.find((item) => item.id === id);
  if (!record) throw qrError('Obsah není nyní veřejný. Nejprve jej uložte a publikujte nebo zobrazte na webu.');
  if (!validSlug(record.slug)) throw qrError('Obsah nemá platnou trvalou veřejnou adresu.');
  let pathname;
  if (type === 'products') pathname = '/vyrobek/' + record.slug;
  if (type === 'blog-posts') pathname = '/blog/' + record.slug;
  if (type === 'product-categories') {
    const parent = record.parent_id && records.find((item) => item.id === record.parent_id);
    if (record.parent_id && (!parent || parent.parent_id || !validSlug(parent.slug))) {
      throw qrError('Nadřazená kategorie není veřejná nebo nemá platnou adresu.');
    }
    pathname = '/vyrobky/' + (parent ? parent.slug + '/' : '') + record.slug;
  }
  return { url: ORIGIN + pathname, filename: 'drevito-' + record.slug };
}

async function renderQr(url, format) {
  // Four-module white quiet zone; no logo or styling obscures the modules.
  const options = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000ff', light: '#ffffffff' } };
  if (format === 'svg') return QRCode.toString(url, { ...options, type: 'svg' });
  if (format === 'png') return QRCode.toBuffer(url, { ...options, type: 'png', scale: 24 });
  throw qrError('Neplatný formát QR kódu.', 400);
}

module.exports = { resolveQrTarget, renderQr };
