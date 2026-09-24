const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 8000);
const RUNTIME_STORAGE_ROOT = process.env.VERCEL
  ? path.join(os.tmpdir(), 'drevito')
  : ROOT_DIR;
const DATA_DIR = process.env.DREVITO_DATA_DIR || path.join(RUNTIME_STORAGE_ROOT, '.data');
const UPLOAD_DIR = process.env.DREVITO_UPLOAD_DIR || path.join(RUNTIME_STORAGE_ROOT, 'uploads');
const MEDIA_DB_PATH = path.join(DATA_DIR, 'media-db.json');
const CMS_DB_PATH = path.join(DATA_DIR, 'cms-db.json');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_ALLOWED_EMAILS = [
  'Thorio.vit@gmail.com',
  'andrijhsavcin@gmail.com',
  process.env.GOOGLE_ALLOWED_EMAIL || '',
  process.env.GOOGLE_ALLOWED_EMAILS || ''
]
  .join(',')
  .split(/[,\s;]+/)
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const GOOGLE_ALLOWED_EMAIL = GOOGLE_ALLOWED_EMAILS[0] || '';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE = 'drevito_admin_session';
const OAUTH_STATE_COOKIE = 'drevito_oauth_state';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=utf-8',
  '.arw': 'application/octet-stream'
};

const IMAGE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const DEFAULT_SITE_IMAGE_TARGETS = [
  { key: 'hero', label: 'Úvodní fotka', url: '/main.JPG', alt: 'Dřevito dřevěné výrobky' },
  { key: 'about', label: 'Sekce o řemesle', url: '/prods.jpg', alt: 'Řemeslo s tradicí' },
  { key: 'author', label: 'Příběh autora', url: '/autor.JPG', alt: 'Autor Dřevito' },
  { key: 'custom_primary', label: 'Zakázková výroba 1', url: '/custom-service.jpg', alt: 'Zakázková výroba dřevěných výrobků' },
  { key: 'custom_secondary', label: 'Zakázková výroba 2', url: '/custom.JPG', alt: 'Ukázka zakázkové výroby' },
  { key: 'brand_logo', label: 'Logo', url: '/drevito-logo-transparent.png', alt: 'Dřevito' }
];

const DEFAULT_PRODUCT_IMAGE_TARGETS = [
  { key: 'P00002', label: 'Čajné stolicky', url: '/cajne-stolicky.JPG', alt: 'Čajné stolicky' },
  { key: 'P00016', label: 'Dekorační tabulka', url: '/dekoracni-tabulka.JPG', alt: 'Dekorační tabulka' },
  { key: 'P00004', label: 'Krabička', url: '/krabicka.JPG', alt: 'Krabička' },
  { key: 'P00020', label: 'Kůň', url: '/kun-dekorace.JPG', alt: 'Dřevěná dekorace koně' },
  { key: 'P00023', label: 'Dekorace žena', url: '/dekorace-zena.JPG', alt: 'Dekorace žena' },
  { key: 'P00018', label: 'Stojan na telefon', url: '/stojan-na-telefon.JPG', alt: 'Stojan na telefon' },
  { key: 'P00022', label: 'Hračka autíčko', url: '/hracka-auticko.JPG', alt: 'Hračka autíčko' }
];

const DEFAULT_CMS_PRODUCT_CATEGORIES = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'rustikalni-nabytek', title: 'Rustikální nábytek', description: 'Originální stoly, lavice, stoličky a další solitérní kusy z masivního dřeva.', sort_order: 10 },
  { id: '33333333-3333-4333-8333-333333333333', slug: 'dekorace-svetla-a-stinohry', title: 'Dekorace, světla a stínohry', description: 'Dřevěné dekorace a objekty, které pracují se světlem, stínem a atmosférou prostoru.', sort_order: 20 },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'darky-a-drobne-vyrobky', title: 'Dárky a drobné výrobky', description: 'Menší dřevěné radosti, dárky a praktické výrobky pro každý den.', sort_order: 30 },
  { id: '55555555-5555-4555-8555-555555555555', slug: 'informacni-a-propagacni-materialy', title: 'Informační a propagační materiály', description: 'Loga, vizitky, informační cedule a orientační prvky zpracované osobitě ve dřevě.', sort_order: 40 },
  { id: '66666666-6666-4666-8666-666666666666', slug: 'zakazkova-vyroba-a-gravirovani-na-miru', title: 'Zakázková výroba a gravírování na míru', description: 'Výroba podle vaší představy i gravírování vlastních předmětů, fotografií, motivů a log.', sort_order: 50 },
  { id: '11111111-1111-4111-8111-111111111112', slug: 'stoly', title: 'Stoly', parent_id: '11111111-1111-4111-8111-111111111111', sort_order: 10 },
  { id: '11111111-1111-4111-8111-111111111113', slug: 'lavice', title: 'Lavice', parent_id: '11111111-1111-4111-8111-111111111111', sort_order: 20 },
  { id: '11111111-1111-4111-8111-111111111114', slug: 'cajove-stolky-a-oltarky', title: 'Čajové stolky a oltářky', parent_id: '11111111-1111-4111-8111-111111111111', sort_order: 30 },
  { id: '11111111-1111-4111-8111-111111111115', slug: 'stolicky', title: 'Stoličky', parent_id: '11111111-1111-4111-8111-111111111111', sort_order: 40 },
  { id: '11111111-1111-4111-8111-111111111116', slug: 'ostatni-rustikalni-nabytek', title: 'Ostatní rustikální nábytek', parent_id: '11111111-1111-4111-8111-111111111111', sort_order: 50 },
  { id: '44444444-4444-4444-8444-444444444444', slug: 'ostatni-dekorace', title: 'Ostatní dekorace', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 10 },
  { id: '33333333-3333-4333-8333-333333333334', slug: 'mandaly', title: 'Mandaly', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 20 },
  { id: '33333333-3333-4333-8333-333333333335', slug: 'stromy-zivota', title: 'Stromy života', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 30 },
  { id: '33333333-3333-4333-8333-333333333336', slug: 'zvirata-a-figuralni-motivy', title: 'Zvířata a figurální motivy', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 40 },
  { id: '33333333-3333-4333-8333-333333333337', slug: 'sochy-a-drevene-objekty', title: 'Sochy a dřevěné objekty', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 50 },
  { id: '33333333-3333-4333-8333-333333333338', slug: 'svicelenky-a-stinoherni-objekty', title: 'Svíčelenky a stínoherní objekty', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 60 },
  { id: '33333333-3333-4333-8333-333333333339', slug: 'dekorativni-osvetleni', title: 'Dekorativní osvětlení', parent_id: '33333333-3333-4333-8333-333333333333', sort_order: 70 },
  { id: '22222222-2222-4222-8222-222222222223', slug: 'stojanky-na-telefon', title: 'Stojánky na telefon', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 10 },
  { id: '22222222-2222-4222-8222-222222222224', slug: 'krabicky', title: 'Krabičky', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 20 },
  { id: '22222222-2222-4222-8222-222222222225', slug: 'kuchynska-prkenka', title: 'Kuchyňská prkénka', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 30 },
  { id: '22222222-2222-4222-8222-222222222226', slug: 'dymky', title: 'Dýmky', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 40 },
  { id: '22222222-2222-4222-8222-222222222227', slug: 'hrebeny', title: 'Hřebeny', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 50 },
  { id: '22222222-2222-4222-8222-222222222228', slug: 'drevene-hracky', title: 'Dřevěné hračky', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 60 },
  { id: '22222222-2222-4222-8222-222222222229', slug: 'personalizovane-darky', title: 'Personalizované dárky', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 70 },
  { id: '22222222-2222-4222-8222-222222222230', slug: 'ostatni-drobne-vyrobky', title: 'Ostatní drobné výrobky', parent_id: '22222222-2222-4222-8222-222222222222', sort_order: 80 },
  { id: '55555555-5555-4555-8555-555555555556', slug: 'drevena-loga', title: 'Dřevěná loga', parent_id: '55555555-5555-4555-8555-555555555555', sort_order: 10 },
  { id: '55555555-5555-4555-8555-555555555557', slug: 'vizitky', title: 'Vizitky', parent_id: '55555555-5555-4555-8555-555555555555', sort_order: 20 },
  { id: '55555555-5555-4555-8555-555555555558', slug: 'informacni-cedule', title: 'Informační cedule', parent_id: '55555555-5555-4555-8555-555555555555', sort_order: 30 },
  { id: '55555555-5555-4555-8555-555555555559', slug: 'orientacni-systemy', title: 'Orientační systémy', parent_id: '55555555-5555-4555-8555-555555555555', sort_order: 40 },
  { id: '66666666-6666-4666-8666-666666666667', slug: 'vyroba-podle-vaseho-navrhu', title: 'Výroba podle vašeho návrhu', parent_id: '66666666-6666-4666-8666-666666666666', sort_order: 10 },
  { id: '66666666-6666-4666-8666-666666666668', slug: 'gravirovani-fotografie', title: 'Gravírování fotografie', parent_id: '66666666-6666-4666-8666-666666666666', sort_order: 20 },
  { id: '66666666-6666-4666-8666-666666666669', slug: 'gravirovani-grafiky-nebo-loga', title: 'Gravírování grafiky nebo loga', parent_id: '66666666-6666-4666-8666-666666666666', sort_order: 30 },
  { id: '66666666-6666-4666-8666-666666666670', slug: 'hudebni-nastroje', title: 'Hudební nástroje', parent_id: '66666666-6666-4666-8666-666666666666', sort_order: 40 },
  { id: '77777777-7777-4777-8777-777777777777', slug: 'gravirovani-vasich-predmetu', title: 'Gravírování vašich předmětů', parent_id: '66666666-6666-4666-8666-666666666666', sort_order: 50 },
  { id: '66666666-6666-4666-8666-666666666671', slug: 'individualni-navrh-vyrobku', title: 'Individuální návrh výrobku', parent_id: '66666666-6666-4666-8666-666666666666', sort_order: 60 }
];

const DEFAULT_CMS_BLOG_CATEGORIES = [
  {
    id: '81111111-1111-4111-8111-111111111111',
    slug: 'products',
    title: 'Výrobky',
    description: 'Příběhy konkrétních výrobků, novinky a detaily jejich vzniku.',
    sort_order: 10
  },
  {
    id: '82222222-2222-4222-8222-222222222222',
    slug: 'philosophy',
    title: 'Filozofie značky',
    description: 'Hodnoty Dřevito, vztah ke dřevu a přístup k tvorbě.',
    sort_order: 20
  },
  {
    id: '83333333-3333-4333-8333-333333333333',
    slug: 'author',
    title: 'O autorovi',
    description: 'Osobní příběhy autora, inspirace a cesta k řemeslu.',
    sort_order: 30
  },
  {
    id: '84444444-4444-4444-8444-444444444444',
    slug: 'craft',
    title: 'Z dílny',
    description: 'Řemeslné postupy, materiály a pohled do zákulisí dílny.',
    sort_order: 40
  },
  {
    id: '85555555-5555-4555-8555-555555555555',
    slug: 'pribehy-vyrobku',
    title: 'Příběhy výrobků',
    description: 'Příběhy konkrétních výrobků, jejich dřeva, vzniku a místa, pro které byly vytvořeny.',
    sort_order: 70
  },
  {
    id: '86666666-6666-4666-8666-666666666666',
    slug: 'drevo-a-priroda',
    title: 'Dřevo a příroda',
    description: 'Druhy dřeva, příroda, udržitelnost a vztah materiálu k místu.',
    sort_order: 80
  },
  {
    id: '87777777-7777-4777-8777-777777777777',
    slug: 'pribeh-drevito',
    title: 'Příběh Dřevito',
    description: 'Příběh dílny, značky, autora a důležité události.',
    sort_order: 90
  }
];

const DEFAULT_CMS_PRODUCTS = [
  {
    id: '00000002-0000-4000-8000-000000000002',
    legacy_id: 'P00002',
    slug: 'cajne-stolicky',
    title: 'Čajné stolicky',
    short_description: 'Dřevěný čajový stoleček s vyřezávaným motivem.',
    description: 'Dřevěný čajový stoleček s vyřezávaným motivem.',
    price: 1790,
    category_slug: 'cajove-stolky-a-oltarky',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/cajne-stolicky.JPG'
  },
  {
    id: '00000016-0000-4000-8000-000000000016',
    legacy_id: 'P00016',
    slug: 'dekoracni-tabulka',
    title: 'Dekorační tabulka',
    short_description: 'Dekorační tabulka s vyřezávaným motivem.',
    description: 'Dekorační tabulka s vyřezávaným motivem.',
    price: 1555,
    category_slug: 'svicelenky-a-stinoherni-objekty',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/dekoracni-tabulka.JPG'
  },
  {
    id: '00000004-0000-4000-8000-000000000004',
    legacy_id: 'P00004',
    slug: 'krabicka',
    title: 'Krabička',
    short_description: 'Zasouvací krabička z masivního dřeva.',
    description: 'Zasouvací krabička z masivního dřeva.',
    price: 1111,
    category_slug: 'krabicky',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/krabicka.JPG'
  },
  {
    id: '00000020-0000-4000-8000-000000000020',
    legacy_id: 'P00020',
    slug: 'kun',
    title: 'Kůň',
    short_description: 'Dřevěná dekorace koně.',
    description: 'Dřevěná dekorace koně.',
    price: 0,
    category_slug: 'zvirata-a-figuralni-motivy',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/kun-dekorace.JPG'
  },
  {
    id: '00000023-0000-4000-8000-000000000023',
    legacy_id: 'P00023',
    slug: 'dekorace-zena',
    title: 'Dekorace žena',
    short_description: 'Dřevěná dekorace ženy.',
    description: 'Dřevěná dekorace ženy.',
    price: 0,
    category_slug: 'zvirata-a-figuralni-motivy',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/dekorace-zena.JPG'
  },
  {
    id: '00000018-0000-4000-8000-000000000018',
    legacy_id: 'P00018',
    slug: 'stojan-na-telefon',
    title: 'Stojan na telefon',
    short_description: 'Stojan na telefon z masivního dřeva.',
    description: 'Stojan na telefon z masivního dřeva.',
    price: 2000,
    category_slug: 'stojanky-na-telefon',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/stojan-na-telefon.JPG'
  },
  {
    id: '00000022-0000-4000-8000-000000000022',
    legacy_id: 'P00022',
    slug: 'hracka-auticko',
    title: 'Hračka autíčko',
    short_description: 'Dřevěná hračka autíčko.',
    description: 'Dřevěná hračka autíčko.',
    price: 0,
    category_slug: 'drevene-hracky',
    wood_types: [],
    availability: 'made_to_order',
    use_context: ['interior'],
    image: '/hracka-auticko.JPG'
  }
];

const DEFAULT_BLOG_POSTS = [
  {
    id: 'placeholder-o-tvurci',
    title: 'O tvůrci',
    slug: 'o-tvurci',
    excerpt: 'Příběh tvůrce Dřevito připravujeme.',
    main_content: 'Příběh tvůrce Dřevito připravujeme. Brzy tu najdete osobnější pohled na řemeslo, dřevo a cestu k výrobkům, které vznikají v dílně.',
    content_format: 'html',
    photos: [],
    featured_image: null,
    author_name: 'Dřevito',
    categories: [{ title: 'O autorovi', slug: 'author' }],
    published_at: null,
    updated_at: null
  },
  {
    id: 'placeholder-pribeh-teto-lavice-a-stolu',
    title: 'Příběh této lavice a stolu',
    slug: 'pribeh-teto-lavice-a-stolu',
    excerpt: 'Příběh lavice a stolu připravujeme.',
    main_content: 'Příběh této lavice a stolu připravujeme. Tady bude místo pro původ dřeva, návrh, ruční práci a detaily konkrétního kusu.',
    content_format: 'html',
    photos: [],
    featured_image: null,
    author_name: 'Dřevito',
    categories: [{ title: 'Z dílny', slug: 'craft' }, { title: 'Výrobky', slug: 'products' }],
    published_at: null,
    updated_at: null
  }
];

const BLOG_ROUTE_ALIASES = {
  'o-tvurci': 'o-tvurci',
  tvurce: 'o-tvurci',
  autor: 'o-tvurci',
  'pribeh-teto-lavice-a-stolu': 'pribeh-teto-lavice-a-stolu',
  'pribeh-lavice-a-stolu': 'pribeh-teto-lavice-a-stolu',
  'lavice-a-stul': 'pribeh-teto-lavice-a-stolu',
  'lavice-a-stolu': 'pribeh-teto-lavice-a-stolu'
};

const TARGET_TYPES = {
  site_sections: 'Sekce webu',
  products: 'Výrobky',
  blog_posts: 'Blog'
};

const MEDIA_BUCKETS = {
  site_sections: 'site-media',
  products: 'product-images',
  blog_posts: 'blog-images'
};

const HOMEPAGE_LAYOUT_CONTENT_KEY = 'homepage.layout';
const HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY = 'homepage.layout.draft';
const HOMEPAGE_RESERVED_CONTENT_KEYS = new Set([
  HOMEPAGE_LAYOUT_CONTENT_KEY,
  HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY
]);
const HOMEPAGE_LAYOUT_VERSION = 1;
const HOMEPAGE_MAX_BLOCKS = 36;
const HOMEPAGE_FIXED_BLOCKS = [
  {
    id: 'hero',
    kind: 'hero',
    label: 'Úvodní obrazovka',
    visible: true,
    content: {
      eyebrow: 'Rodinná dílna · Dolní Ředice',
      title: 'Dřevito — dřevěné výrobky zhotovené srdcem',
      body: 'Ruční výroba z masivního dřeva. Každý kus je originál.',
      image: { url: '/main.JPG', alt: 'Dřevito dřevěné výrobky', media_id: '' },
      primary_label: 'Prohlédnout výrobky',
      primary_url: '#products',
      secondary_label: 'Výroba na míru',
      secondary_url: '#custom'
    }
  },
  {
    id: 'about',
    kind: 'about',
    label: 'Řemeslo s tradicí',
    visible: true,
    content: {
      title: 'Řemeslo s tradicí',
      lead: 'Každý výrobek Dřevito vzniká z touhy zachovat a předat dál staré řemeslo. Pracujeme s masivním dřevem — dubem, bukem, modřínem — protože jen přírodní materiál nese tu správnou energii a příběh.',
      body: 'V naší dílně každý kus vzniká ruční prací. Řezbářské umění, které se předává z generace na generaci, spojuje moderní design s úctou k tradici. Věříme, že dřevo má duši — a naším úkolem je ji probudit.',
      image: { url: '/prods.jpg', alt: 'Řemeslo s tradicí', media_id: '' }
    }
  },
  {
    id: 'products',
    kind: 'products',
    label: 'Výrobky',
    visible: true,
    content: {
      title: 'Naše výrobky',
      body: 'Tvořím širokou škálu výrobků ze dřeva a rád hledám nové cesty. Mnoho věcí vzniká až v osobní domluvě — podle vašeho přání, konkrétního místa a příběhu, který má výsledný výrobek nést.'
    }
  },
  {
    id: 'blog',
    kind: 'blog',
    label: 'Blog',
    visible: true,
    content: {
      title: 'Z dílny',
      body: 'Poznámky o dřevě, řemesle a novinkách z dílny Dřevito.'
    }
  },
  {
    id: 'author',
    kind: 'author',
    label: 'Příběh za značkou',
    visible: true,
    content: {
      title: 'Příběh za značkou',
      lead: 'Stromy jsou mým životem. Sázím je, kácám je, osobně je znám.',
      body: 'Přinášet krásu dřeva do lidských domovů — udržitelně a s respektem k přírodě — to je to, co mě definuje. Dílna na rodinném statku je splněný téměř dvacetiletý sen.\n\nDnes mám funkční pilu a truhlářskou dílnu, díky které zvládnu celý proces — od pokácení stromu až po dokončení nábytku vlastníma rukama. Netvořím ze dřeva, které kupuji kdovíkde. Tvořím ze stromů, které jsem znal a kterým jsem osobně poděkoval za jejich život.\n\nPráce se dřevem je pro mě meditace a vnitřní naplnění. Jsem milovníkem organických tvarů — příroda je mou učitelkou. Zřídka používám rovné hrany, pokud to zákazník přímo nepožaduje.',
      signature: '— tvůrce Dřevito',
      image: { url: '/autor.JPG', alt: 'Autor Dřevito', media_id: '' }
    }
  },
  {
    id: 'custom',
    kind: 'custom',
    label: 'Zakázková výroba a kontakt',
    visible: true,
    content: {
      title: 'Zakázková výroba',
      body: 'Každý výrobek umíme přizpůsobit vašim představám. Ať už jde o rozměr, motiv, materiál nebo úplně nový návrh — probereme to společně a najdeme řešení.',
      secondary_body: 'Ozývejte se nám s popisem vaší představy. Těšíme se na nové výzvy.',
      images: [
        { url: '/custom-service.jpg', alt: 'Zakázková výroba dřevěných výrobků', media_id: '' },
        { url: '/custom.JPG', alt: 'Ukázka zakázkové výroby', media_id: '' }
      ]
    }
  }
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function signValue(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(value)).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createSignedPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signValue(body)}`;
}

function readSignedPayload(token) {
  if (!token || !token.includes('.')) return null;

  const dotIndex = token.lastIndexOf('.');
  const body = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!safeEqual(signature, signValue(body))) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function createSession(email) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return createSignedPayload({
    type: 'admin_session',
    email,
    expiresAt
  });
}

function getSession(req) {
  const cookie = parseCookies(req)[SESSION_COOKIE];
  const session = readSignedPayload(cookie);
  if (!session || session.type !== 'admin_session') return null;
  if (!session.email || session.expiresAt <= Date.now()) return null;
  return {
    id: cookie,
    email: String(session.email).toLowerCase(),
    expiresAt: session.expiresAt
  };
}

function createOauthState(next) {
  const safeNext = getSafeAdminNext(next);
  const state = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + OAUTH_STATE_MAX_AGE_SECONDS * 1000;
  return {
    state,
    next: safeNext,
    expiresAt,
    token: createSignedPayload({
      type: 'oauth_state',
      state,
      next: safeNext,
      expiresAt
    })
  };
}

function getOauthState(req, callbackState) {
  const payload = readSignedPayload(parseCookies(req)[OAUTH_STATE_COOKIE]);
  if (!payload || payload.type !== 'oauth_state') return null;
  if (!payload.state || !safeEqual(payload.state, callbackState)) return null;
  if (!payload.expiresAt || payload.expiresAt <= Date.now()) return null;
  return {
    state: payload.state,
    next: getSafeAdminNext(payload.next),
    expiresAt: payload.expiresAt
  };
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https';
}

function getBaseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/+$/, '');
  const protocol = isHttps(req) ? 'https' : 'http';
  return `${protocol}://${req.headers.host || `localhost:${PORT}`}`;
}

function isAuthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_ALLOWED_EMAIL);
}

function isLocalDevRequest(req) {
  if (process.env.NODE_ENV === 'production') return false;
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  const remote = String(req.socket && req.socket.remoteAddress || '').toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(host)
    || remote === '127.0.0.1'
    || remote === '::1'
    || remote === '::ffff:127.0.0.1';
}

function isDevLoginAvailable(req) {
  return !isAuthConfigured() && isLocalDevRequest(req);
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function sessionCookie(value, req) {
  const secure = isHttps(req) || process.env.NODE_ENV === 'production';
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/admin',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function oauthStateCookie(value, req) {
  const secure = isHttps(req) || process.env.NODE_ENV === 'production';
  return [
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/admin',
    `Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0`;
}

function expiredOauthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0`;
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, {
    Location: location,
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end();
}

function slugify(value, fallback = 'image') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function legacyMediaId(url) {
  return `legacy-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createLegacyMedia(targetType, targetKey, targetLabel, image) {
  const id = legacyMediaId(`${targetType}:${targetKey}:${image.url}`);
  return {
    id,
    bucket: 'static',
    storage_path: image.url.replace(/^\/+/, ''),
    public_url: image.url,
    alt_text: image.alt || targetLabel,
    caption: '',
    mime_type: MIME_TYPES[path.extname(image.url).toLowerCase()] || 'image/jpeg',
    size_bytes: null,
    width: null,
    height: null,
    is_public: true,
    metadata: {
      source: 'static',
      target_type: targetType,
      target_key: targetKey
    },
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

function createPhotoRef(media, index) {
  return {
    media_id: media.id,
    url: media.public_url,
    alt: media.alt_text || '',
    caption: media.caption || '',
    sort_order: index,
    is_featured: index === 0
  };
}

function mediaBucketForTargetType(targetType) {
  const bucket = MEDIA_BUCKETS[targetType];
  if (!bucket) throw new Error('Unsupported media target.');
  return bucket;
}

function storagePathForPublicUrl(pathname) {
  return String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function publicSupabaseStorageUrl(bucket, storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${storagePathForPublicUrl(storagePath)}`;
}

function ensureTargetWithKey(db, targetType, targetKey, targetLabel = '') {
  if (!TARGET_TYPES[targetType]) throw new Error('Unsupported media target.');
  const key = String(targetKey || '').trim();
  if (!key) return null;
  if (!db.targets[targetType]) db.targets[targetType] = {};
  if (!db.targets[targetType][key]) {
    db.targets[targetType][key] = {
      key,
      label: targetLabel || key,
      images: []
    };
  } else if (targetLabel) {
    db.targets[targetType][key].label = targetLabel;
  }
  return db.targets[targetType][key];
}

function createEmptyMediaDb() {
  return {
    version: 1,
    media: [],
    targets: {
      site_sections: {},
      products: {},
      blog_posts: {}
    }
  };
}

function ensureSeedTarget(db, targetType, target) {
  if (!db.targets[targetType]) db.targets[targetType] = {};
  if (db.targets[targetType][target.key]) return;

  const media = createLegacyMedia(targetType, target.key, target.label, target);
  db.media.push(media);
  db.targets[targetType][target.key] = {
    key: target.key,
    label: target.label,
    images: [createPhotoRef(media, 0)]
  };
}

function normalizeMediaDb(db) {
  const normalized = db && typeof db === 'object' ? db : createEmptyMediaDb();
  normalized.version = 1;
  normalized.media = Array.isArray(normalized.media) ? normalized.media : [];
  normalized.targets = normalized.targets && typeof normalized.targets === 'object'
    ? normalized.targets
    : {};
  normalized.targets.site_sections = normalized.targets.site_sections || {};
  normalized.targets.products = normalized.targets.products || {};
  normalized.targets.blog_posts = normalized.targets.blog_posts || {};

  DEFAULT_SITE_IMAGE_TARGETS.forEach((target) => ensureSeedTarget(normalized, 'site_sections', target));
  DEFAULT_PRODUCT_IMAGE_TARGETS.forEach((target) => ensureSeedTarget(normalized, 'products', target));
  return normalized;
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function readMediaDb() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(MEDIA_DB_PATH, 'utf8');
    return normalizeMediaDb(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to read media database:', error);
    const db = normalizeMediaDb(createEmptyMediaDb());
    writeMediaDb(db);
    return db;
  }
}

function writeMediaDb(db) {
  ensureStorage();
  fs.writeFileSync(MEDIA_DB_PATH, `${JSON.stringify(normalizeMediaDb(db), null, 2)}\n`);
}

function createEmptyCmsDb() {
  return {
    version: 1,
    seeded_defaults_at: null,
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
  };
}

function shouldSeedDefaultCmsContent(db) {
  return !db.seeded_defaults_at
    && db.site_content.length === 0
    && db.product_categories.length === 0
    && db.products.length === 0
    && db.product_category_links.length === 0
    && db.product_filters.length === 0
    && db.product_filter_options.length === 0
    && db.product_filter_value_links.length === 0
    && db.blog_categories.length === 0
    && db.blog_posts.length === 0
    && db.blog_category_links.length === 0;
}

function seedDefaultCmsContent(db) {
  if (!shouldSeedDefaultCmsContent(db)) return db;
  const timestamp = nowIso();
  const categoryBySlug = new Map(DEFAULT_CMS_PRODUCT_CATEGORIES.map((category) => [category.slug, category]));

  db.seeded_defaults_at = timestamp;
  db.product_categories = DEFAULT_CMS_PRODUCT_CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    slug: category.slug,
    description: category.description || null,
    image: null,
    parent_id: category.parent_id || null,
    sort_order: category.sort_order,
    is_visible: true,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp
  }));
  db.products = DEFAULT_CMS_PRODUCTS.map((product, index) => ({
    id: product.id,
    legacy_id: product.legacy_id,
    title: product.title,
    slug: product.slug,
    short_description: product.short_description,
    description: product.description,
    photos: [{
      media_id: '',
      url: product.image,
      alt: product.title,
      caption: '',
      sort_order: 0,
      is_featured: true
    }],
    price: product.price,
    wood_types: product.wood_types || [],
    availability: product.availability || null,
    use_context: product.use_context || [],
    sort_order: (index + 1) * 10,
    is_visible: true,
    is_published: true,
    published_at: timestamp,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp
  }));
  db.product_category_links = DEFAULT_CMS_PRODUCTS
    .map((product) => {
      const category = categoryBySlug.get(product.category_slug);
      if (!category) return null;
      return {
        product_id: product.id,
        category_id: category.id,
        sort_order: 0,
        created_at: timestamp
      };
    })
    .filter(Boolean);

  db.blog_categories = createDefaultBlogCategories(timestamp);

  return db;
}

function createDefaultBlogCategories(timestamp = nowIso()) {
  return DEFAULT_CMS_BLOG_CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    slug: category.slug,
    description: category.description,
    image: null,
    sort_order: category.sort_order,
    is_visible: true,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp
  }));
}

function normalizeCmsDb(db) {
  const normalized = db && typeof db === 'object' ? db : createEmptyCmsDb();
  const previousVersion = Number(normalized.version || 1);
  normalized.version = 4;
  normalized.seeded_defaults_at = normalized.seeded_defaults_at || null;
  normalized.site_content = Array.isArray(normalized.site_content) ? normalized.site_content : [];
  normalized.product_categories = Array.isArray(normalized.product_categories) ? normalized.product_categories : [];
  normalized.products = Array.isArray(normalized.products) ? normalized.products : [];
  normalized.product_category_links = Array.isArray(normalized.product_category_links) ? normalized.product_category_links : [];
  normalized.product_filters = Array.isArray(normalized.product_filters) ? normalized.product_filters : [];
  normalized.product_filter_options = Array.isArray(normalized.product_filter_options) ? normalized.product_filter_options : [];
  normalized.product_filter_value_links = Array.isArray(normalized.product_filter_value_links) ? normalized.product_filter_value_links : [];
  normalized.blog_categories = Array.isArray(normalized.blog_categories) ? normalized.blog_categories : [];
  normalized.blog_posts = Array.isArray(normalized.blog_posts) ? normalized.blog_posts : [];
  normalized.blog_category_links = Array.isArray(normalized.blog_category_links) ? normalized.blog_category_links : [];
  const seeded = seedDefaultCmsContent(normalized);
  if (seeded.blog_categories.length === 0) {
    seeded.blog_categories = createDefaultBlogCategories();
  }
  if (previousVersion < 3) upgradeLocalCmsTaxonomy(seeded);
  return seeded;
}

function upgradeLocalCmsTaxonomy(db) {
  const productSlugReplacements = {
    'engraved-furniture': 'rustikalni-nabytek',
    'small-wood': 'darky-a-drobne-vyrobky',
    'shadow-light': 'dekorace-svetla-a-stinohry',
    promotion: 'informacni-a-propagacni-materialy',
    'custom-graphics': 'zakazkova-vyroba-a-gravirovani-na-miru',
    'engraving-items': 'gravirovani-vasich-predmetu',
    decorations: 'ostatni-dekorace',
    dekorace: 'ostatni-dekorace'
  };
  const defaultById = new Map(DEFAULT_CMS_PRODUCT_CATEGORIES.map((category) => [category.id, category]));
  db.product_categories.forEach((category) => {
    const replacementSlug = productSlugReplacements[category.slug];
    const definition = defaultById.get(category.id) || DEFAULT_CMS_PRODUCT_CATEGORIES.find((item) => item.slug === replacementSlug);
    if (!definition) return;
    category.title = definition.title;
    category.slug = definition.slug;
    category.description = definition.description || category.description || null;
    category.parent_id = definition.parent_id || null;
    category.sort_order = definition.sort_order;
    category.is_visible = true;
    category.archived_at = null;
    category.updated_at = nowIso();
  });
  const existingProductCategoryIds = new Set(db.product_categories.map((category) => category.id));
  DEFAULT_CMS_PRODUCT_CATEGORIES.forEach((category) => {
    if (existingProductCategoryIds.has(category.id) || db.product_categories.some((item) => item.slug === category.slug)) return;
    db.product_categories.push(createLocalRow({
      title: category.title,
      slug: category.slug,
      description: category.description || null,
      image: null,
      parent_id: category.parent_id || null,
      sort_order: category.sort_order,
      is_visible: true,
      archived_at: null
    }, category.id));
  });
  const categoryBySlug = new Map(db.product_categories.map((category) => [category.slug, category]));
  const specificProductCategories = {
    'cajne-stolicky': 'cajove-stolky-a-oltarky',
    'dekoracni-tabulka': 'svicelenky-a-stinoherni-objekty',
    krabicka: 'krabicky',
    kun: 'zvirata-a-figuralni-motivy',
    'dekorace-zena': 'zvirata-a-figuralni-motivy',
    'stojan-na-telefon': 'stojanky-na-telefon',
    'hracka-auticko': 'drevene-hracky'
  };
  db.products.forEach((product) => {
    product.wood_types = Array.isArray(product.wood_types) ? product.wood_types : [];
    product.availability = product.availability || 'made_to_order';
    product.use_context = Array.isArray(product.use_context) && product.use_context.length ? product.use_context : ['interior'];
    const category = categoryBySlug.get(specificProductCategories[product.slug]);
    if (!category) return;
    db.product_category_links = db.product_category_links.filter((link) => link.product_id !== product.id);
    db.product_category_links.push({ product_id: product.id, category_id: category.id, sort_order: 0, created_at: nowIso() });
  });
  const existingBlogSlugs = new Set(db.blog_categories.map((category) => category.slug));
  DEFAULT_CMS_BLOG_CATEGORIES.forEach((category) => {
    if (existingBlogSlugs.has(category.slug)) return;
    db.blog_categories.push(createLocalRow({
      title: category.title,
      slug: category.slug,
      description: category.description,
      image: null,
      sort_order: category.sort_order,
      is_visible: true,
      archived_at: null
    }, category.id));
  });
}

function readCmsDb() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(CMS_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const previousVersion = Number(parsed.version || 1);
    const hadSeededDefaults = Boolean(parsed.seeded_defaults_at);
    const hadBlogCategories = Array.isArray(parsed.blog_categories) && parsed.blog_categories.length > 0;
    const normalized = normalizeCmsDb(parsed);
    if (previousVersion < normalized.version || (!hadSeededDefaults && normalized.seeded_defaults_at) || (!hadBlogCategories && normalized.blog_categories.length)) {
      writeCmsDb(normalized);
    }
    return normalized;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to read CMS database:', error);
    const db = normalizeCmsDb(createEmptyCmsDb());
    writeCmsDb(db);
    return db;
  }
}

function writeCmsDb(db) {
  ensureStorage();
  fs.writeFileSync(CMS_DB_PATH, `${JSON.stringify(normalizeCmsDb(db), null, 2)}\n`);
}

function createLocalRow(input, id = '') {
  const timestamp = nowIso();
  return {
    ...input,
    id: id || crypto.randomUUID(),
    created_at: timestamp,
    updated_at: timestamp
  };
}

function updateLocalRow(row, input) {
  const previousTimestamp = new Date(row.updated_at || 0).getTime();
  const nextTimestamp = new Date(Math.max(Date.now(), Number.isFinite(previousTimestamp) ? previousTimestamp + 1 : 0)).toISOString();
  Object.assign(row, input, { updated_at: nextTimestamp });
  return row;
}

async function readSupabaseMediaDb() {
  const db = normalizeMediaDb(createEmptyMediaDb());
  const rows = await supabaseRequest('media', {
    query: {
      select: 'id,bucket,storage_path,public_url,alt_text,caption,mime_type,size_bytes,width,height,is_public,metadata,created_at,updated_at',
      order: 'created_at.asc'
    }
  });

  (Array.isArray(rows) ? rows : []).forEach((media) => {
    const metadata = media && media.metadata && typeof media.metadata === 'object' ? media.metadata : {};
    const targetType = String(metadata.target_type || metadata.targetType || '').trim();
    if (!TARGET_TYPES[targetType]) return;

    const targetKey = String(metadata.target_key || metadata.targetKey || '').trim();
    const targetLabel = String(metadata.target_label || metadata.targetLabel || targetKey).trim();
    const target = ensureTargetWithKey(db, targetType, targetKey, targetLabel);
    if (!target || media.is_public === false || !media.public_url) return;
    target.images = target.images.filter((image) => !String(image.media_id || '').startsWith('legacy-'));

    const sortOrder = Number(metadata.sort_order ?? metadata.sortOrder);
    const photo = createPhotoRef(media, Number.isFinite(sortOrder) ? sortOrder : target.images.length);
    photo.alt = String(photo.alt || metadata.alt || '').trim();
    photo.caption = String(photo.caption || metadata.caption || '').trim();
    photo.is_featured = metadata.is_featured === true || metadata.isFeatured === true;
    target.images.push(photo);
    db.media.push(media);
  });

  Object.values(db.targets).forEach((group) => {
    Object.values(group).forEach((target) => {
      if (!Array.isArray(target.images)) return;
      target.images.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      updateImageOrdering(target.images);
    });
  });

  return db;
}

async function getMediaDb() {
  return isSupabaseConfigured() ? readSupabaseMediaDb() : readMediaDb();
}

async function getPublicMediaTargets() {
  const db = await getMediaDb();
  return {
    site_sections: db.targets.site_sections,
    products: db.targets.products,
    blog_posts: db.targets.blog_posts
  };
}

function getTarget(db, targetType, targetKey, targetLabel = '') {
  if (!TARGET_TYPES[targetType]) throw new Error('Unsupported media target.');
  const rawKey = String(targetKey || targetLabel || '').trim();
  if (!rawKey) throw new Error('Vyberte položku nebo napište název nové položky.');
  const key = db.targets[targetType][rawKey] ? rawKey : slugify(rawKey, targetType);
  if (!db.targets[targetType][key]) {
    db.targets[targetType][key] = {
      key,
      label: targetLabel || key,
      images: []
    };
  } else if (targetLabel) {
    db.targets[targetType][key].label = targetLabel;
  }
  return db.targets[targetType][key];
}

function countMediaReferences(db, mediaId) {
  let count = 0;
  Object.values(db.targets).forEach((group) => {
    Object.values(group).forEach((target) => {
      if (!Array.isArray(target.images)) return;
      count += target.images.filter((image) => image.media_id === mediaId).length;
    });
  });
  return count;
}

function valueReferencesMediaId(value, mediaId) {
  if (!value || !mediaId) return false;
  if (Array.isArray(value)) return value.some((item) => valueReferencesMediaId(item, mediaId));
  if (typeof value !== 'object') return false;
  if (String(value.media_id || value.mediaId || '') === String(mediaId)) return true;
  return Object.values(value).some((item) => valueReferencesMediaId(item, mediaId));
}

async function hasPersistedMediaReference(mediaId) {
  if (!isSupabaseConfigured()) {
    const cms = readCmsDb();
    return cms.site_content.some((item) => valueReferencesMediaId(item.value, mediaId))
      || cms.products.some((item) => valueReferencesMediaId(item.photos, mediaId))
      || cms.product_categories.some((item) => valueReferencesMediaId(item.image, mediaId))
      || cms.blog_posts.some((item) => valueReferencesMediaId(item.photos, mediaId))
      || cms.blog_categories.some((item) => valueReferencesMediaId(item.image, mediaId));
  }

  const [siteContent, products, productCategories, blogPosts, blogCategories] = await Promise.all([
    supabaseRequest('site_content', { query: { select: 'value' } }),
    supabaseRequest('products', { query: { select: 'photos' } }),
    supabaseRequest('product_categories', { query: { select: 'image' } }),
    supabaseRequest('blog_posts', { query: { select: 'photos' } }),
    supabaseRequest('blog_categories', { query: { select: 'image' } })
  ]);
  return [siteContent, products, productCategories, blogPosts, blogCategories]
    .some((rows) => (Array.isArray(rows) ? rows : []).some((row) => valueReferencesMediaId(row, mediaId)));
}

function deleteLocalMediaFile(media) {
  if (!media || media.bucket !== 'local' || !media.storage_path) return;
  const relativePath = String(media.storage_path).replace(/^uploads[\\/]/, '');
  const filePath = path.resolve(UPLOAD_DIR, relativePath);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep)) return;
  fs.unlink(filePath, (error) => {
    if (error && error.code !== 'ENOENT') console.error('Failed to delete upload:', error);
  });
}

async function deleteSupabaseMedia(media) {
  if (!media || !media.id || media.bucket === 'local' || media.bucket === 'static') return;
  await deleteSupabaseStorageObject(media);
  await supabaseRequest('media', {
    method: 'DELETE',
    query: {
      id: `eq.${media.id}`
    }
  });
}

async function deleteUnreferencedMedia(db, mediaId) {
  const media = db.media.find((entry) => entry.id === mediaId);
  if (!media || countMediaReferences(db, mediaId) !== 0 || await hasPersistedMediaReference(mediaId)) return;

  db.media = db.media.filter((entry) => entry.id !== mediaId);
  if (isSupabaseConfigured()) {
    await deleteSupabaseMedia(media);
  } else {
    deleteLocalMediaFile(media);
  }
}

function updateImageOrdering(images) {
  images.forEach((image, index) => {
    image.sort_order = index;
    image.is_featured = index === 0;
  });
}

function getRawBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Soubor je příliš velký.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseContentDisposition(value) {
  const result = {};
  String(value || '').split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rest.length) return;
    const key = rawKey.toLowerCase();
    result[key] = rest.join('=').replace(/^"|"$/g, '');
  });
  return result;
}

async function parseMultipart(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error('Chybí multipart boundary.');

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await getRawBody(req);
  const fields = {};
  const files = {};
  let cursor = body.indexOf(boundary);

  while (cursor !== -1) {
    cursor += boundary.length;
    if (body[cursor] === 45 && body[cursor + 1] === 45) break;
    if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2;

    let next = body.indexOf(boundary, cursor);
    if (next === -1) break;
    let part = body.slice(cursor, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString('latin1');
      const content = part.slice(headerEnd + 4);
      const headers = {};
      headerText.split('\r\n').forEach((line) => {
        const separator = line.indexOf(':');
        if (separator === -1) return;
        headers[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
      });
      const disposition = parseContentDisposition(headers['content-disposition']);
      if (disposition.name) {
        if (disposition.filename) {
          files[disposition.name] = {
            filename: disposition.filename,
            mime_type: headers['content-type'] || 'application/octet-stream',
            buffer: content
          };
        } else {
          fields[disposition.name] = content.toString('utf8');
        }
      }
    }
    cursor = next;
  }

  return { fields, files };
}

function adminLayout(title, content) {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Dřevito</title>
  <link rel="icon" href="/favicon.ico?v=20260622-3" sizes="any">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f5f0e8;
      --panel: #fdfcfa;
      --ink: #3d2b1f;
      --muted: #6b5a4a;
      --accent: #c9a96e;
      --accent-dark: #ad8845;
      --line: rgba(61, 43, 31, 0.14);
      --shadow: 0 18px 45px rgba(61, 43, 31, 0.12);
      --font-display: 'Cormorant Garamond', Georgia, serif;
      --font-body: 'DM Sans', system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      line-height: 1.5;
    }
    a { color: inherit; }
    .shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 16px;
    }
    .panel {
      width: min(100%, 980px);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .masthead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 22px 28px;
      background: #2a1f16;
      color: var(--panel);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      border-radius: 4px;
      text-decoration: none;
    }
    a.brand:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 5px;
    }
    .brand img {
      width: 52px;
      height: 52px;
      object-fit: contain;
      border-radius: 2px;
      background: var(--panel);
      flex: 0 0 auto;
    }
    .brand strong {
      display: block;
      font-family: var(--font-display);
      font-size: 1.55rem;
      font-weight: 600;
      line-height: 1;
    }
    .brand span {
      display: block;
      color: rgba(253, 252, 250, 0.7);
      font-size: 0.85rem;
      margin-top: 5px;
    }
    .content { padding: 32px 28px; }
    h1 {
      margin: 0 0 10px;
      font-family: var(--font-display);
      font-size: clamp(2rem, 5vw, 3rem);
      font-weight: 600;
      line-height: 1.05;
    }
    p { margin: 0; color: var(--muted); }
    form { display: grid; gap: 18px; margin-top: 26px; }
    label { display: grid; gap: 8px; color: var(--ink); font-weight: 600; font-size: 0.9rem; }
    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 13px 14px;
      font: inherit;
      color: var(--ink);
      background: #fff;
    }
    textarea {
      min-height: 86px;
      resize: vertical;
    }
    input[type="file"] {
      padding: 10px;
    }
    input:focus,
    select:focus,
    textarea:focus {
      outline: 2px solid rgba(201, 169, 110, 0.35);
      border-color: var(--accent);
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 22px;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      transition: background 0.2s ease, transform 0.2s ease;
    }
    .button:hover { background: var(--accent-dark); transform: translateY(-1px); }
    .button--ghost {
      background: transparent;
      color: var(--panel);
      border: 1px solid rgba(253, 252, 250, 0.24);
      min-height: 40px;
      padding: 0 16px;
    }
    .button--ghost:hover { background: rgba(253, 252, 250, 0.08); }
    .button--secondary {
      background: #2a1f16;
    }
    .button--secondary:hover { background: #3d2b1f; }
    .button--danger {
      background: #9d3a25;
    }
    .button--danger:hover { background: #7f2d1b; }
    .button--small {
      min-height: 36px;
      padding: 0 14px;
      font-size: 0.86rem;
    }
    .alert {
      margin-top: 22px;
      border: 1px solid rgba(150, 54, 34, 0.28);
      background: #fff3ee;
      color: #8a321f;
      border-radius: 8px;
      padding: 12px 14px;
      font-weight: 600;
    }
    .success {
      margin-top: 22px;
      border: 1px solid rgba(70, 126, 77, 0.28);
      background: #f0f8ef;
      color: #2f6b38;
      border-radius: 8px;
      padding: 12px 14px;
      font-weight: 600;
    }
    .admin-guide {
      max-width: 980px;
      margin: 24px 0 30px;
      padding: 18px 20px;
      border: 1px solid rgba(182, 120, 66, 0.24);
      border-left: 4px solid var(--accent);
      border-radius: 14px;
      background: #fbf7ee;
    }
    .admin-guide > strong {
      display: block;
      margin-bottom: 5px;
      color: var(--ink);
    }
    .admin-guide p {
      color: var(--muted);
    }
    .admin-guide p + p {
      margin-top: 9px;
    }
    .admin-guide a {
      color: var(--accent-dark);
      font-weight: 700;
    }
    [hidden] { display: none !important; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-top: 28px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      background: #fff;
    }
    .card span {
      display: block;
      color: var(--accent-dark);
      font-weight: 700;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }
    .card strong {
      display: block;
      font-family: var(--font-display);
      font-size: 1.45rem;
      line-height: 1.1;
      margin-bottom: 8px;
    }
    .admin-list {
      display: grid;
      gap: 10px;
      margin-top: 24px;
      padding: 0;
      list-style: none;
    }
    .admin-list li {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 0;
      border-top: 1px solid var(--line);
      color: var(--muted);
    }
    .admin-list b { color: var(--ink); }
    .admin-hero {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 22px;
      margin-top: 24px;
    }
    .admin-hero h2 {
      margin: 0 0 8px;
      font-family: var(--font-display);
      font-size: 1.7rem;
      line-height: 1.1;
    }
    .admin-tools {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 22px;
    }
    .admin-tool {
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 18px;
      text-decoration: none;
    }
    .admin-tool:hover {
      border-color: rgba(201, 169, 110, 0.7);
      box-shadow: 0 10px 24px rgba(61, 43, 31, 0.08);
    }
    .admin-tool span {
      color: var(--accent-dark);
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .admin-tool strong {
      font-family: var(--font-display);
      font-size: 1.45rem;
      line-height: 1.1;
    }
    .admin-tool p { font-size: 0.94rem; }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 24px;
    }
    .media-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 24px;
    }
    .media-tab {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
      min-height: 40px;
      padding: 0 16px;
      font: inherit;
      font-weight: 700;
    }
    .media-tab.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .media-layout {
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
      margin-top: 24px;
    }
    .media-form {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      background: #fff;
    }
    .media-status {
      min-height: 24px;
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 700;
    }
    .media-targets {
      display: grid;
      gap: 18px;
    }
    .media-target {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }
    .media-target__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--line);
    }
    .media-target__head h2 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.5rem;
    }
    .media-target__head span {
      display: block;
      color: var(--muted);
      font-size: 0.82rem;
      margin-top: 3px;
    }
    .media-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 14px;
      padding: 16px;
    }
    .media-image {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #f8f5ef;
    }
    .media-image img,
    .preview-box img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: #ede5d9;
    }
    .media-image__body {
      display: grid;
      gap: 8px;
      padding: 10px;
    }
    .media-image__meta {
      color: var(--muted);
      font-size: 0.78rem;
      overflow-wrap: anywhere;
    }
    .media-image__actions {
      display: grid;
      gap: 8px;
    }
    .replace-form {
      display: grid;
      gap: 8px;
      margin: 0;
    }
    .empty-state {
      padding: 18px;
      color: var(--muted);
    }
      .site-content-layout,
      .category-layout,
      .product-layout,
      .blog-layout {
      display: grid;
      grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
      margin-top: 24px;
    }
    .site-content-panel,
    .site-content-list,
    .category-panel,
    .category-list,
    .product-panel,
    .product-list,
    .blog-panel,
    .blog-list {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 18px;
    }
    .site-content-panel h2,
    .site-content-list h2,
    .category-panel h2,
    .category-list h2,
    .product-panel h2,
    .product-list h2,
    .blog-panel h2,
    .blog-list h2 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.55rem;
      line-height: 1.1;
    }
    .site-content-panel form,
    .category-panel form,
    .product-panel form,
    .blog-panel form { margin-top: 18px; }
    .site-content-row,
    .category-row,
    .product-row,
    .blog-row {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 14px;
      padding: 16px 0;
      border-top: 1px solid var(--line);
    }
    .site-content-row:first-child,
    .category-row:first-child,
    .product-row:first-child,
    .blog-row:first-child { border-top: 0; }
    .site-content-thumb,
    .category-thumb,
    .product-thumb,
    .blog-thumb {
      width: 92px;
      aspect-ratio: 1;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8f5ef;
      object-fit: cover;
    }
    .site-content-thumb--empty,
    .category-thumb--empty,
    .product-thumb--empty,
    .blog-thumb--empty {
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 0.78rem;
      text-align: center;
      padding: 8px;
    }
    .site-content-main,
    .category-main,
    .product-main,
    .blog-main {
      min-width: 0;
      display: grid;
      gap: 8px;
    }
    .site-content-titleline,
    .category-titleline,
    .product-titleline,
    .blog-titleline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .site-content-titleline strong,
    .category-titleline strong,
    .product-titleline strong,
    .blog-titleline strong {
      font-family: var(--font-display);
      font-size: 1.35rem;
      line-height: 1.1;
    }
    .site-content-meta,
    .category-meta,
    .product-meta,
    .blog-meta {
      color: var(--muted);
      font-size: 0.88rem;
      overflow-wrap: anywhere;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .badge {
      border-radius: 999px;
      background: #efe7d9;
      color: var(--ink);
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 10px;
      font-size: 0.76rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .badge--ok {
      background: #e6f3e3;
      color: #2f6b38;
    }
    .badge--muted {
      background: #eee8df;
      color: var(--muted);
    }
    .badge--archived {
      background: #f6ded6;
      color: #8a321f;
    }
    .site-content-actions,
    .category-actions,
    .product-actions,
    .blog-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .check-label {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 47px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 14px;
      background: #fff;
    }
    .check-label input {
      width: auto;
      margin: 0;
    }
    .category-type-options {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .category-type-options legend {
      margin-bottom: 8px;
      color: var(--ink);
      font-size: 0.9rem;
      font-weight: 600;
    }
    .category-type-option {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      padding: 13px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
    }
    .category-type-option:has(input:checked) {
      border-color: var(--accent);
      background: #fbf7ee;
      box-shadow: 0 0 0 2px rgba(201, 169, 110, 0.16);
    }
    .category-type-option input {
      width: auto;
      margin: 4px 0 0;
    }
    .category-type-option strong,
    .category-type-option span {
      display: block;
    }
    .category-type-option span {
      margin-top: 2px;
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 400;
      line-height: 1.4;
    }
    .preview-box {
      display: none;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }
    .preview-box.visible { display: block; }
    .photo-list {
      display: grid;
      gap: 10px;
      margin-top: 10px;
    }
    .photo-row {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fdfcfa;
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 10px;
      padding: 10px;
    }
    .photo-row img,
    .photo-row__empty {
      width: 72px;
      aspect-ratio: 1;
      border-radius: 6px;
      border: 1px solid var(--line);
      object-fit: cover;
      background: #f8f5ef;
    }
    .photo-row__empty {
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 0.74rem;
      text-align: center;
    }
    .photo-row__fields {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .photo-row__buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .category-checks {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      max-height: 180px;
      overflow: auto;
      background: #fff;
    }
    .filter-settings {
      display: grid;
      gap: 14px;
      margin: 8px 0;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #f8f5ef;
    }
    .filter-settings h3 { margin: 0; font-size: 1.15rem; }
    .filter-settings > p { margin: -6px 0 2px; color: var(--muted); font-size: 0.86rem; }
    @media (max-width: 760px) {
      .masthead { align-items: flex-start; flex-direction: column; padding: 20px; }
      .content { padding: 24px 20px; }
      .grid { grid-template-columns: 1fr; }
      .admin-tools { grid-template-columns: 1fr; }
      .admin-list li { display: block; }
      .media-layout { grid-template-columns: 1fr; }
      .media-target__head { align-items: flex-start; flex-direction: column; }
      .site-content-layout,
      .category-layout,
      .product-layout,
      .blog-layout { grid-template-columns: 1fr; }
      .site-content-row,
      .category-row,
      .product-row,
      .blog-row,
      .photo-row { grid-template-columns: 1fr; }
      .site-content-thumb,
      .category-thumb,
      .product-thumb,
      .blog-thumb { width: 100%; max-width: 180px; }
      .photo-row img,
      .photo-row__empty { width: 100%; max-width: 180px; }
      .form-row { grid-template-columns: 1fr; }
    }

    /* Dřevito admin design system */
    :root {
      --bg: #f1eadf;
      --panel: #fffcf6;
      --ink: #2b2118;
      --muted: #706255;
      --accent: #b67842;
      --accent-dark: #7b4726;
      --forest: #314139;
      --forest-light: #40544a;
      --sand: #ded2c1;
      --line: rgba(43, 33, 24, 0.12);
      --shadow: 0 28px 90px rgba(43, 33, 24, 0.13);
      --font-display: 'Fraunces', Georgia, serif;
      --font-body: 'Manrope', system-ui, sans-serif;
    }
    html { scroll-behavior: smooth; }
    body {
      background:
        radial-gradient(circle at 92% 4%, rgba(182, 120, 66, 0.18), transparent 31rem),
        radial-gradient(circle at 3% 82%, rgba(49, 65, 57, 0.10), transparent 34rem),
        var(--bg);
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: -1;
      opacity: 0.24;
      pointer-events: none;
      background-image: linear-gradient(rgba(43, 33, 24, 0.025) 1px, transparent 1px);
      background-size: 100% 48px;
    }
    a { text-underline-offset: 3px; }
    :focus-visible {
      outline: 3px solid rgba(182, 120, 66, 0.62) !important;
      outline-offset: 3px;
    }
    .shell {
      display: block;
      padding: clamp(14px, 2.4vw, 34px);
    }
    .panel {
      width: min(100%, 1500px);
      min-height: calc(100vh - clamp(28px, 4.8vw, 68px));
      margin: 0 auto;
      overflow: hidden;
      border-color: rgba(43, 33, 24, 0.10);
      border-radius: 30px;
      background: rgba(255, 252, 246, 0.94);
      box-shadow: var(--shadow);
    }
    .masthead {
      position: relative;
      align-items: center;
      padding: 18px clamp(20px, 3vw, 42px);
      border-bottom: 1px solid rgba(255, 252, 246, 0.11);
      background:
        radial-gradient(circle at 12% 10%, rgba(231, 198, 150, 0.13), transparent 20rem),
        var(--forest);
    }
    .masthead::after {
      content: '';
      position: absolute;
      right: clamp(24px, 5vw, 76px);
      bottom: -1px;
      width: 86px;
      height: 3px;
      border-radius: 999px 999px 0 0;
      background: #e7c696;
    }
    .brand { gap: 14px; flex: 0 0 auto; }
    .brand img {
      width: 62px;
      height: 62px;
      padding: 4px;
      border: 1px solid rgba(255, 252, 246, 0.16);
      border-radius: 50%;
      background: #e7c696;
    }
    .brand strong {
      font-size: 1.42rem;
      letter-spacing: -0.025em;
    }
    .brand span {
      color: rgba(255, 252, 246, 0.62);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .admin-nav {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 7px;
      flex-wrap: wrap;
    }
    .admin-nav form { margin: 0; }
    .admin-nav .button--ghost {
      min-height: 36px;
      padding: 0 13px;
      border-color: rgba(255, 252, 246, 0.16);
      color: rgba(255, 252, 246, 0.76);
      font-size: 0.72rem;
    }
    .admin-nav .button--ghost:hover,
    .admin-nav .button--ghost[aria-current="page"] {
      border-color: rgba(231, 198, 150, 0.6);
      background: rgba(255, 252, 246, 0.10);
      color: #fffdf8;
    }
    .admin-nav .button--web {
      border-color: #e7c696;
      background: #e7c696;
      color: var(--forest);
    }
    .admin-nav .button--web:hover {
      background: #f0d8b3;
      color: var(--forest);
    }
    .content {
      padding: clamp(30px, 4.5vw, 68px);
      animation: admin-rise 0.45s ease both;
    }
    .content > h1 {
      max-width: 980px;
      margin-bottom: 14px;
      font-size: clamp(2.8rem, 5.5vw, 5.35rem);
      line-height: 0.95;
      letter-spacing: -0.055em;
      text-wrap: balance;
    }
    .content > p {
      max-width: 780px;
      color: var(--muted);
      font-size: clamp(0.96rem, 1.4vw, 1.08rem);
    }
    h2, h3 { font-family: var(--font-display); }
    form { gap: 20px; }
    label {
      gap: 9px;
      font-size: 0.82rem;
      letter-spacing: 0.012em;
    }
    input,
    select,
    textarea {
      min-height: 50px;
      border-color: rgba(43, 33, 24, 0.15);
      border-radius: 13px;
      padding: 13px 15px;
      background: #fffdf9;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }
    textarea { min-height: 112px; line-height: 1.6; }
    input:hover,
    select:hover,
    textarea:hover { border-color: rgba(123, 71, 38, 0.32); }
    input:focus,
    select:focus,
    textarea:focus {
      outline: 0;
      border-color: var(--accent);
      background: #fff;
      box-shadow: 0 0 0 4px rgba(182, 120, 66, 0.12);
    }
    .button {
      min-height: 48px;
      padding: 0 21px;
      background: var(--accent-dark);
      box-shadow: 0 8px 20px rgba(123, 71, 38, 0.14);
      font-size: 0.8rem;
      letter-spacing: 0.01em;
      transition: transform 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease;
    }
    .button:hover {
      background: var(--accent);
      box-shadow: 0 12px 28px rgba(123, 71, 38, 0.2);
      transform: translateY(-2px);
    }
    .button--secondary { background: var(--forest); }
    .button--secondary:hover { background: var(--forest-light); }
    .button--danger { background: #93432e; }
    .button--small {
      min-height: 38px;
      padding: 0 14px;
      font-size: 0.73rem;
    }
    .alert,
    .success {
      border-radius: 14px;
      padding: 14px 17px;
      box-shadow: 0 8px 24px rgba(43, 33, 24, 0.06);
    }
    .grid { gap: 18px; }
    .card,
    .admin-hero,
    .admin-tool,
    .media-form,
    .media-target,
    .site-content-panel,
    .site-content-list,
    .category-panel,
    .category-list,
    .product-panel,
    .product-list,
    .blog-panel,
    .blog-list {
      border-color: rgba(43, 33, 24, 0.11);
      border-radius: 22px;
      background: rgba(255, 253, 249, 0.9);
      box-shadow: 0 16px 44px rgba(43, 33, 24, 0.065);
    }
    .admin-hero {
      position: relative;
      margin-top: 34px;
      padding: clamp(24px, 4vw, 46px);
      overflow: hidden;
      background:
        radial-gradient(circle at 95% 0%, rgba(182, 120, 66, 0.18), transparent 26rem),
        #fffdf9;
    }
    .admin-hero::before {
      content: '';
      position: absolute;
      top: 0;
      left: clamp(24px, 4vw, 46px);
      width: 72px;
      height: 4px;
      border-radius: 0 0 999px 999px;
      background: var(--accent);
    }
    .admin-hero h2 {
      font-size: clamp(2rem, 4vw, 3.4rem);
      letter-spacing: -0.04em;
    }
    .admin-tools {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 30px;
    }
    .admin-tool {
      min-height: 184px;
      align-content: start;
      gap: 11px;
      padding: 23px;
      overflow: hidden;
      position: relative;
      transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
    }
    .admin-tool::after {
      content: '↗';
      position: absolute;
      top: 18px;
      right: 19px;
      color: rgba(43, 33, 24, 0.28);
      font-size: 1.05rem;
      transition: color 0.25s ease, transform 0.25s ease;
    }
    .admin-tool:hover {
      border-color: rgba(182, 120, 66, 0.46);
      box-shadow: 0 22px 50px rgba(43, 33, 24, 0.11);
      transform: translateY(-4px);
    }
    .admin-tool:hover::after {
      color: var(--accent-dark);
      transform: translate(2px, -2px);
    }
    .admin-tool span {
      color: var(--accent-dark);
      font-size: 0.68rem;
      letter-spacing: 0.14em;
    }
    .admin-tool strong {
      padding-right: 26px;
      font-size: 1.55rem;
      letter-spacing: -0.025em;
    }
    .admin-tool p { line-height: 1.55; }
    .media-layout,
    .site-content-layout,
    .category-layout,
    .product-layout,
    .blog-layout {
      grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
      gap: 24px;
      margin-top: 34px;
    }
    .site-content-panel,
    .site-content-list,
    .category-panel,
    .category-list,
    .product-panel,
    .product-list,
    .blog-panel,
    .blog-list { padding: clamp(20px, 2.3vw, 30px); }
    .site-content-panel,
    .category-panel,
    .product-panel,
    .blog-panel {
      position: sticky;
      top: 20px;
    }
    .site-content-panel h2,
    .site-content-list h2,
    .category-panel h2,
    .category-list h2,
    .product-panel h2,
    .product-list h2,
    .blog-panel h2,
    .blog-list h2 {
      font-size: 1.8rem;
      letter-spacing: -0.035em;
    }
    .site-content-row,
    .category-row,
    .product-row,
    .blog-row {
      grid-template-columns: 108px minmax(0, 1fr);
      gap: 17px;
      margin-top: 13px;
      padding: 14px;
      border: 1px solid rgba(43, 33, 24, 0.09);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.62);
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }
    .site-content-row:first-child,
    .category-row:first-child,
    .product-row:first-child,
    .blog-row:first-child { border-top: 1px solid rgba(43, 33, 24, 0.09); }
    .site-content-row:hover,
    .category-row:hover,
    .product-row:hover,
    .blog-row:hover {
      border-color: rgba(182, 120, 66, 0.34);
      box-shadow: 0 12px 30px rgba(43, 33, 24, 0.07);
      transform: translateY(-1px);
    }
    .site-content-thumb,
    .category-thumb,
    .product-thumb,
    .blog-thumb {
      width: 108px;
      border-radius: 13px;
      background: var(--sand);
    }
    .site-content-titleline strong,
    .category-titleline strong,
    .product-titleline strong,
    .blog-titleline strong {
      font-size: 1.45rem;
      letter-spacing: -0.025em;
    }
    .badge {
      min-height: 27px;
      padding: 0 10px;
      background: rgba(222, 210, 193, 0.62);
      font-size: 0.65rem;
      letter-spacing: 0.08em;
    }
    .badge--ok { background: #dfece2; color: #2d6543; }
    .badge--muted { background: #ece6dc; color: var(--muted); }
    .badge--archived { background: #f2ded7; color: #86412f; }
    .check-label,
    .category-checks,
    .category-type-option,
    .filter-settings,
    .photo-row,
    .preview-box {
      border-color: rgba(43, 33, 24, 0.11);
      border-radius: 14px;
    }
    .check-label { background: #fffdf9; }
    .category-type-option:has(input:checked) {
      border-color: var(--accent);
      background: #fbf2e6;
      box-shadow: 0 0 0 3px rgba(182, 120, 66, 0.12);
    }
    .filter-settings {
      padding: 19px;
      background: rgba(222, 210, 193, 0.25);
    }
    .media-tabs { gap: 9px; margin-top: 30px; }
    .media-tab {
      min-height: 43px;
      border-radius: 999px;
      background: #fffdf9;
      font-size: 0.78rem;
    }
    .media-tab.active {
      border-color: var(--forest);
      background: var(--forest);
    }
    .media-target { overflow: hidden; }
    .media-target__head { padding: 20px; }
    .media-grid { gap: 16px; padding: 20px; }
    .media-image {
      border-color: rgba(43, 33, 24, 0.1);
      border-radius: 15px;
      background: #f7f1e7;
      box-shadow: 0 9px 25px rgba(43, 33, 24, 0.06);
    }
    .empty-state {
      border: 1px dashed rgba(43, 33, 24, 0.18);
      border-radius: 14px;
      background: rgba(222, 210, 193, 0.16);
      text-align: center;
    }
    @keyframes admin-rise {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 1180px) {
      .masthead { align-items: flex-start; flex-direction: column; }
      .admin-nav { justify-content: flex-start; }
      .admin-tools { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 840px) {
      .shell { padding: 0; }
      .panel { min-height: 100vh; border: 0; border-radius: 0; }
      .masthead { padding: 17px 18px; }
      .brand img { width: 54px; height: 54px; }
      .admin-nav {
        width: 100%;
        flex-wrap: nowrap;
        justify-content: flex-start;
        padding-bottom: 5px;
        overflow-x: auto;
        scrollbar-width: thin;
      }
      .admin-nav .button--ghost { flex: 0 0 auto; }
      .content { padding: 30px 18px 50px; }
      .content > h1 { font-size: clamp(2.55rem, 14vw, 4.4rem); }
      .admin-tools { grid-template-columns: 1fr; }
      .admin-tool { min-height: 0; }
      .media-layout,
      .site-content-layout,
      .category-layout,
      .product-layout,
      .blog-layout { grid-template-columns: 1fr; }
      .site-content-panel,
      .category-panel,
      .product-panel,
      .blog-panel { position: static; }
    }
    @media (max-width: 560px) {
      .content > h1 { letter-spacing: -0.045em; }
      .admin-hero { padding: 26px 18px; }
      .site-content-panel,
      .site-content-list,
      .category-panel,
      .category-list,
      .product-panel,
      .product-list,
      .blog-panel,
      .blog-list { padding: 17px; border-radius: 18px; }
      .site-content-row,
      .category-row,
      .product-row,
      .blog-row,
      .photo-row { grid-template-columns: 1fr; }
      .site-content-thumb,
      .category-thumb,
      .product-thumb,
      .blog-thumb { width: 100%; max-width: none; aspect-ratio: 16 / 9; }
      .actions .button { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      ${content}
    </section>
  </main>
  <script>
  (function() {
    var currentPath = window.location.pathname.replace(/\\/+$/, '') || '/admin';
    document.querySelectorAll('.admin-nav a[href^="/admin"]').forEach(function(link) {
      var linkPath = new URL(link.href, window.location.origin).pathname.replace(/\\/+$/, '') || '/admin';
      if (linkPath === currentPath) link.setAttribute('aria-current', 'page');
    });
  })();
  </script>
</body>
</html>`.replace('<strong>Dřevito</strong>', '<strong>Dřevito admin panel</strong>');
}

function loginPage({ error = '', next = '/admin', devLogin = false } = {}) {
  const configError = isAuthConfigured()
    ? ''
    : '<div class="alert">Google přihlášení není nastavené. Přidejte GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ALLOWED_EMAIL a SESSION_SECRET.</div>';
  const errorHtml = error ? `<div class="alert">${escapeHtml(error)}</div>` : '';
  const googleHref = `/admin/auth/google?next=${encodeURIComponent(next)}`;
  const devLoginHtml = devLogin
    ? `<form method="post" action="/admin/dev-login?next=${encodeURIComponent(next)}">
        <button class="button button--secondary" type="submit">Pokračovat v lokálním testu</button>
      </form>`
    : '';
  return adminLayout('Přihlášení', `
    <div class="masthead">
      <div class="brand">
        <img src="/drevito-logo-transparent.png" alt="Dřevito">
        <div>
          <strong>Dřevito</strong>
          <span>Administrace webu</span>
        </div>
      </div>
      <a class="button button--ghost" href="/">Zpět na web</a>
    </div>
    <div class="content">
      <h1>Přihlášení</h1>
      <p>Přístup je povolen jen přes schválený Google účet.</p>
      ${configError}
      ${errorHtml}
      <div class="actions">
        <a class="button" href="${escapeHtml(googleHref)}">Přihlásit přes Google</a>
        ${devLoginHtml}
      </div>
    </div>
  `);
}

function adminMasthead(session) {
  return `
    <div class="masthead">
      <a class="brand" href="/admin" aria-label="Zpět na hlavní stránku administrace">
        <img src="/drevito-logo-transparent.png" alt="Dřevito">
        <div>
          <strong>Dřevito</strong>
          <span>Správa webu</span>
        </div>
      </a>
      <nav class="admin-nav" aria-label="Administrace">
        <a class="button button--ghost" href="/admin/homepage">Domovská stránka</a>
        <a class="button button--ghost" href="/admin/products">Výrobky</a>
        <a class="button button--ghost" href="/admin/product-categories">Kategorie výrobků</a>
        <a class="button button--ghost" href="/admin/product-filters">Filtry výrobků</a>
        <a class="button button--ghost" href="/admin/blog-posts">Články blogu</a>
        <a class="button button--ghost" href="/admin/blog-categories">Kategorie blogu</a>
        <a class="button button--ghost" href="/admin/archive">Archiv</a>
        <a class="button button--ghost button--web" href="/" target="_blank" rel="noopener">Otevřít web</a>
        <form method="post" action="/admin/logout" style="margin:0;">
          <button class="button button--ghost" type="submit">Odhlásit se</button>
        </form>
      </nav>
    </div>`;
}

function dashboardPage(session) {
  return adminLayout('Administrace', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Administrace obsahu</h1>
      <p>Správa domovské stránky, výrobků, kategorií a blogu.</p>
      <div class="admin-hero">
        <h2>Hlavní práce klienta</h2>
        <p>Tady může klient přidávat výrobky, publikovat je, psát články a udržovat kategorie.</p>
        <div class="admin-tools">
          <a class="admin-tool" href="/admin/homepage">
            <span>Web</span>
            <strong>Domovská stránka</strong>
            <p>Upravit texty a fotografie, změnit pořadí částí stránky nebo přidat vlastní blok.</p>
          </a>
          <a class="admin-tool" href="/admin/products">
            <span>Katalog</span>
            <strong>Výrobky</strong>
            <p>Přidat nový výrobek, upravit jeho detail, více fotek, kategorie a publikaci.</p>
          </a>
          <a class="admin-tool" href="/admin/product-categories">
            <span>Produkty</span>
            <strong>Kategorie výrobků</strong>
            <p>Spravovat hlavní kategorie, podkategorie a viditelnost v katalogu.</p>
          </a>
          <a class="admin-tool" href="/admin/product-filters">
            <span>Produkty</span>
            <strong>Filtry výrobků</strong>
            <p>Vytvořit vlastní skupiny filtrů a jejich možnosti pro katalog.</p>
          </a>
          <a class="admin-tool" href="/admin/blog-posts">
            <span>Blog</span>
            <strong>Články blogu</strong>
            <p>Napsat článek, přidat perex, celý text, fotky, témata a nastavit publikaci.</p>
          </a>
          <a class="admin-tool" href="/admin/blog-categories">
            <span>Blog</span>
            <strong>Kategorie blogu</strong>
            <p>Spravovat témata článků, jejich obrázky a viditelnost.</p>
          </a>
        </div>
      </div>
    </div>
  `);
}

function archiveAdminPage(session) {
  return adminLayout('Archiv', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Archiv</h1>
      <p>Rozpracované výrobky najdete v Uložených. Skrytý obsah zůstává bezpečně v archivu a můžete ho znovu obnovit.</p>
      <div id="archive-message" hidden></div>
      <div class="admin-tools" style="margin-top:24px;">
        <section class="category-panel"><h2>Výrobky</h2><div id="archive-products" class="empty-state">Načítám…</div></section>
        <section class="category-panel"><h2>Kategorie výrobků</h2><div id="archive-product-categories" class="empty-state">Načítám…</div></section>
        <section class="category-panel"><h2>Články blogu</h2><div id="archive-blog-posts" class="empty-state">Načítám…</div></section>
        <section class="category-panel"><h2>Kategorie blogu</h2><div id="archive-blog-categories" class="empty-state">Načítám…</div></section>
        <section class="category-panel" style="grid-column:1/-1;">
          <h2>Uložené</h2>
          <div class="form-row" style="margin-top:16px; align-items:start;">
            <div>
              <h3>Výrobky</h3>
              <div id="archive-saved-products" class="empty-state">Načítám…</div>
            </div>
            <div>
              <h3>Články blogu</h3>
              <div id="archive-saved-blog-posts" class="empty-state">Načítám…</div>
            </div>
          </div>
        </section>
      </div>
    </div>
    <script>
    (function() {
      var message = document.getElementById('archive-message');
      var groups = [
        { root: 'archive-saved-products', source: '/admin/api/products', key: 'products', matches: function(item) { return !item.archived_at && !item.is_published; }, edit: '/admin/products?edit=', label: 'Uložené' },
        { root: 'archive-saved-blog-posts', source: '/admin/api/blog-posts', key: 'posts', matches: function(item) { return item.status === 'draft'; }, edit: '/admin/blog-posts?edit=', label: 'Uložené' },
        { root: 'archive-products', source: '/admin/api/products', key: 'products', matches: function(item) { return Boolean(item.archived_at); }, restore: '/admin/api/products/', label: 'Archiv' },
        { root: 'archive-product-categories', source: '/admin/api/product-categories', key: 'categories', matches: function(item) { return Boolean(item.archived_at); }, restore: '/admin/api/product-categories/', label: 'Archiv' },
        { root: 'archive-blog-posts', source: '/admin/api/blog-posts', key: 'posts', matches: function(item) { return item.status === 'archived'; }, restore: '/admin/api/blog-posts/', label: 'Archiv' },
        { root: 'archive-blog-categories', source: '/admin/api/blog-categories', key: 'categories', matches: function(item) { return Boolean(item.archived_at); }, restore: '/admin/api/blog-categories/', label: 'Archiv' }
      ];

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      async function requestJson(url, options) {
        var response = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }, options || {}));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.');
        return data;
      }

      function renderGroup(group, items) {
        var root = document.getElementById(group.root);
        if (!items.length) {
          root.className = 'empty-state';
          root.textContent = 'Archiv je prázdný.';
          return;
        }
        root.className = '';
        root.innerHTML = items.map(function(item) {
          var action = group.edit
            ? '<a class="button button--secondary button--small" href="' + escapeHtml(group.edit + encodeURIComponent(item.id)) + '">Upravit</a>'
            : '<button class="button button--secondary button--small" type="button" data-restore="' + escapeHtml(group.restore + item.id + '/restore') + '">Obnovit</button>';
          return '<article class="category-row" style="grid-template-columns:1fr;">' +
            '<div class="category-main"><div class="category-titleline"><strong>' + escapeHtml(item.title) + '</strong><span class="badge badge--archived">' + escapeHtml(group.label) + '</span></div>' +
            '<div class="category-actions">' + action + '</div></div>' +
          '</article>';
        }).join('');
      }

      async function loadArchive() {
        message.hidden = true;
        await Promise.all(groups.map(async function(group) {
          var data = await requestJson(group.source);
          renderGroup(group, (data[group.key] || []).filter(group.matches));
        }));
      }

      document.addEventListener('click', function(event) {
        var button = event.target.closest('[data-restore]');
        if (!button) return;
        button.disabled = true;
        requestJson(button.dataset.restore, { method: 'POST', body: '{}' }).then(loadArchive).catch(function(error) {
          button.disabled = false;
          message.hidden = false;
          message.className = 'alert';
          message.textContent = error.message;
        });
      });

      loadArchive().catch(function(error) {
        message.hidden = false;
        message.className = 'alert';
        message.textContent = error.message;
      });
    })();
    </script>
  `);
}

function mediaAdminPage(session) {
  return adminLayout('Správa fotek', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Správa fotek</h1>
      <p>${isSupabaseConfigured() ? 'Nahrané obrázky se ukládají do Supabase Storage a jejich metadata do tabulky media.' : 'Nahrané obrázky se ukládají do lokálního úložiště a jejich URL do databáze médií.'}</p>

      <div class="media-tabs" role="tablist" aria-label="Typy obrázků">
        <button class="media-tab active" type="button" data-tab="site_sections">Sekce webu</button>
        <button class="media-tab" type="button" data-tab="products">Výrobky</button>
        <button class="media-tab" type="button" data-tab="blog_posts">Blog</button>
      </div>

      <div class="media-layout" id="media-app">
        <form class="media-form" id="upload-form" enctype="multipart/form-data">
          <label>
            Typ
            <select name="targetType" id="target-type">
              <option value="site_sections">Sekce webu</option>
              <option value="products">Výrobky</option>
              <option value="blog_posts">Blog</option>
            </select>
          </label>
          <label>
            Položka
            <select name="targetKey" id="target-key"></select>
          </label>
          <label>
            Nová položka
            <input name="targetLabel" id="target-label" placeholder="Název výrobku nebo článku">
          </label>
          <label>
            Fotka
            <input type="file" name="image" id="image-input" accept="image/jpeg,image/png,image/webp,image/gif" required>
          </label>
          <div class="preview-box" id="upload-preview"></div>
          <label>
            Popis fotky
            <input name="alt" placeholder="Popis obrázku pro přístupnost">
          </label>
          <label>
            Popisek
            <textarea name="caption" placeholder="Volitelný popisek"></textarea>
          </label>
          <input type="hidden" name="replaceMediaId" id="replace-media-id">
          <button class="button" type="submit">Nahrát fotku</button>
          <div class="media-status" id="media-status" role="status"></div>
        </form>

        <div class="media-targets" id="media-targets">
          <div class="empty-state">Načítám fotky...</div>
        </div>
      </div>
    </div>

    <script>
    (function() {
      var state = null;
      var activeType = 'site_sections';
      var labels = {
        site_sections: 'Sekce webu',
        products: 'Výrobky',
        blog_posts: 'Blog'
      };
      var uploadForm = document.getElementById('upload-form');
      var targetType = document.getElementById('target-type');
      var targetKey = document.getElementById('target-key');
      var targetLabel = document.getElementById('target-label');
      var status = document.getElementById('media-status');
      var targetsRoot = document.getElementById('media-targets');
      var imageInput = document.getElementById('image-input');
      var preview = document.getElementById('upload-preview');

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function setStatus(message) {
        status.textContent = message || '';
      }

      function getTargets(type) {
        if (!state || !state.targets || !state.targets[type]) return {};
        return state.targets[type];
      }

      function sortedTargetEntries(type) {
        return Object.keys(getTargets(type)).sort(function(a, b) {
          return String(getTargets(type)[a].label || a).localeCompare(String(getTargets(type)[b].label || b), 'cs');
        }).map(function(key) {
          return [key, getTargets(type)[key]];
        });
      }

      function syncTargetSelect() {
        var entries = sortedTargetEntries(targetType.value);
        var html = targetType.value === 'site_sections' ? '' : '<option value="">Vytvořit novou položku</option>';
        entries.forEach(function(entry) {
          html += '<option value="' + escapeHtml(entry[0]) + '">' + escapeHtml(entry[1].label || entry[0]) + '</option>';
        });
        targetKey.innerHTML = html;
        targetLabel.placeholder = targetType.value === 'blog_posts' ? 'Název článku' : 'Název výrobku nebo sekce';
      }

      function renderTabs() {
        document.querySelectorAll('.media-tab').forEach(function(tab) {
          tab.classList.toggle('active', tab.dataset.tab === activeType);
        });
        targetType.value = activeType;
        syncTargetSelect();
      }

      function renderTargets() {
        var entries = sortedTargetEntries(activeType);
        renderTabs();
        if (!entries.length) {
          targetsRoot.innerHTML = '<div class="empty-state">Zatím tu nejsou žádné položky pro ' + escapeHtml(labels[activeType]) + '.</div>';
          return;
        }

        targetsRoot.innerHTML = entries.map(function(entry) {
          var key = entry[0];
          var target = entry[1];
          var images = Array.isArray(target.images) ? target.images : [];
          var imagesHtml = images.length ? images.map(function(image) {
            return '<article class="media-image">' +
              '<img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || target.label || key) + '">' +
              '<div class="media-image__body">' +
                '<strong>' + (image.is_featured ? 'Hlavní fotka' : 'Fotka') + '</strong>' +
                '<div class="media-image__meta">' + escapeHtml(image.alt || image.caption || image.url) + '</div>' +
                '<form class="replace-form" data-replace-form>' +
                  '<input type="hidden" name="targetType" value="' + escapeHtml(activeType) + '">' +
                  '<input type="hidden" name="targetKey" value="' + escapeHtml(key) + '">' +
                  '<input type="hidden" name="targetLabel" value="' + escapeHtml(target.label || key) + '">' +
                  '<input type="hidden" name="replaceMediaId" value="' + escapeHtml(image.media_id) + '">' +
                  '<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required>' +
                  '<input name="alt" value="' + escapeHtml(image.alt || '') + '" placeholder="Popis fotky">' +
                  '<button class="button button--secondary button--small" type="submit">Nahradit</button>' +
                '</form>' +
                '<button class="button button--danger button--small" type="button" data-delete="' + escapeHtml(image.media_id) + '" data-target-type="' + escapeHtml(activeType) + '" data-target-key="' + escapeHtml(key) + '">Smazat</button>' +
              '</div>' +
            '</article>';
          }).join('') : '<div class="empty-state">Bez fotek.</div>';

          return '<section class="media-target">' +
            '<div class="media-target__head">' +
              '<div><h2>' + escapeHtml(target.label || key) + '</h2><span>' + escapeHtml(key) + ' · ' + images.length + ' fotek</span></div>' +
              '<button class="button button--small" type="button" data-add-to="' + escapeHtml(key) + '" data-label="' + escapeHtml(target.label || key) + '">Přidat sem</button>' +
            '</div>' +
            '<div class="media-grid">' + imagesHtml + '</div>' +
          '</section>';
        }).join('');
      }

      async function loadMedia() {
        var response = await fetch('/admin/api/media', { headers: { Accept: 'application/json' } });
        state = await response.json();
        if (!response.ok) throw new Error(state.error || 'Fotky se nepodařilo načíst.');
        renderTargets();
      }

      async function upload(form) {
        setStatus('Ukládám...');
        var response = await fetch('/admin/api/media/upload', {
          method: 'POST',
          body: new FormData(form)
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nahrání se nepodařilo.');
        form.reset();
        preview.classList.remove('visible');
        preview.innerHTML = '';
        setStatus('Uloženo.');
        await loadMedia();
      }

      async function deleteImage(targetTypeValue, targetKeyValue, mediaId) {
        setStatus('Mažu...');
        var response = await fetch('/admin/api/media/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ targetType: targetTypeValue, targetKey: targetKeyValue, mediaId: mediaId })
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Smazání se nepodařilo.');
        setStatus('Smazáno.');
        await loadMedia();
      }

      uploadForm.addEventListener('submit', function(event) {
        event.preventDefault();
        upload(uploadForm).catch(function(error) { setStatus(error.message); });
      });

      imageInput.addEventListener('change', function() {
        var file = imageInput.files && imageInput.files[0];
        if (!file) {
          preview.classList.remove('visible');
          preview.innerHTML = '';
          return;
        }
        var url = URL.createObjectURL(file);
        preview.innerHTML = '<img src="' + escapeHtml(url) + '" alt="">';
        preview.classList.add('visible');
      });

      targetType.addEventListener('change', function() {
        activeType = targetType.value;
        renderTargets();
      });

      document.querySelectorAll('.media-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          activeType = tab.dataset.tab;
          renderTargets();
        });
      });

      targetsRoot.addEventListener('click', function(event) {
        var addButton = event.target.closest('[data-add-to]');
        if (addButton) {
          targetType.value = activeType;
          syncTargetSelect();
          targetKey.value = addButton.dataset.addTo;
          targetLabel.value = addButton.dataset.label || '';
          imageInput.focus();
          return;
        }

        var deleteButton = event.target.closest('[data-delete]');
        if (deleteButton) {
          deleteImage(deleteButton.dataset.targetType, deleteButton.dataset.targetKey, deleteButton.dataset.delete)
            .catch(function(error) { setStatus(error.message); });
        }
      });

      targetsRoot.addEventListener('submit', function(event) {
        var form = event.target.closest('[data-replace-form]');
        if (!form) return;
        event.preventDefault();
        upload(form).catch(function(error) { setStatus(error.message); });
      });

      loadMedia().catch(function(error) {
        targetsRoot.innerHTML = '<div class="alert">' + escapeHtml(error.message) + '</div>';
      });
    })();
    </script>
  `);
}

function siteContentAdminPage(session) {
  return adminLayout('Texty a fotky webu', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Texty a fotky webu</h1>
      <p>Editor obecných sekcí webu ukládá obsah do tabulky site_content.</p>
      <div id="site-content-message" hidden></div>

      <div class="site-content-layout" id="site-content-app">
        <section class="site-content-panel">
          <h2 id="site-content-form-title">Nový obsah</h2>
          <form id="site-content-form">
            <input type="hidden" id="site-content-id">
            <label>
              Rychlá šablona
              <select id="site-content-preset">
                <option value="">Vybrat šablonu...</option>
                <option value="hero">Homepage hero</option>
                <option value="hero_image">Homepage hero obrázek</option>
                <option value="nav_about">Menu: O nás</option>
                <option value="nav_products">Menu: Výrobky</option>
                <option value="nav_author">Menu: Autor</option>
                <option value="nav_blog">Menu: Blog</option>
                <option value="nav_custom">Menu: Zakázková výroba</option>
                <option value="nav_contact">Menu: Kontakt</option>
                <option value="about">O nás</option>
                <option value="craft">Řemeslo / filozofie</option>
                <option value="contact">Kontakt</option>
                <option value="gallery">Galerie</option>
                <option value="products_title">Nadpis výrobků</option>
                <option value="products_intro">Úvod výrobků</option>
                <option value="products_empty">Prázdná kategorie výrobků</option>
                <option value="product_detail">Texty detailu výrobku</option>
                <option value="blog_title">Nadpis blogu</option>
                <option value="blog_intro">Úvod blogu</option>
                <option value="blog_empty">Prázdný blog</option>
                <option value="blog_detail">Texty detailu článku</option>
                <option value="footer">Patička</option>
              </select>
            </label>
            <div class="form-row">
              <label>
                Jazyk
                <input id="site-content-locale" value="cs" required pattern="[a-z]{2}(-[a-z]{2})?">
              </label>
              <label>
                Sekce
                <select id="site-content-section">
                  <option value="homepage">Homepage</option>
                  <option value="about">O nás</option>
                  <option value="craft">Řemeslo</option>
                  <option value="contact">Kontakt</option>
                  <option value="gallery">Galerie</option>
                  <option value="products">Výrobky</option>
                  <option value="blog">Blog</option>
                  <option value="global">Globální</option>
                </select>
              </label>
            </div>
            <label>
              Popisek pro klienta
              <input id="site-content-label" required autocomplete="off">
            </label>
            <label>
              Klíč obsahu
              <input id="site-content-key" required autocomplete="off" pattern="[a-z0-9][a-z0-9_.-]*" placeholder="homepage.hero.title">
            </label>
            <div class="form-row">
              <label>
                Typ obsahu
                <select id="site-content-type">
                  <option value="text">Text</option>
                  <option value="rich_text">Delší text / HTML</option>
                  <option value="image">Obrázek</option>
                  <option value="gallery">Galerie</option>
                  <option value="link">Odkaz</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <label>
                Stav
                <select id="site-content-status">
                  <option value="draft">Koncept</option>
                  <option value="published">Publikováno</option>
                  <option value="archived">Archiv</option>
                </select>
              </label>
            </div>
            <div class="form-row">
              <label>
                Pořadí
                <input id="site-content-sort-order" type="number" step="1" value="0">
              </label>
              <label>
                Datum publikace
                <input id="site-content-published-at" type="datetime-local">
              </label>
            </div>

            <div data-value-panel="text">
              <label>
                Text
                <textarea id="site-content-text" rows="5"></textarea>
              </label>
            </div>

            <div data-value-panel="rich_text" hidden>
              <label>
                Delší text / HTML
                <textarea id="site-content-rich-text" rows="7"></textarea>
              </label>
            </div>

            <div data-value-panel="image" hidden>
              <label>
                Obrázek URL
                <input id="site-content-image-url" placeholder="/uploads/site_sections/fotka.jpg">
              </label>
              <div class="form-row">
                <label>
                  Popis fotky
                  <input id="site-content-image-alt">
                </label>
                <label>
                  Media ID
                  <input id="site-content-image-media-id">
                </label>
              </div>
              <label>
                Popisek
                <input id="site-content-image-caption">
              </label>
              <label>
                Nahrát obrázek
                <input id="site-content-image-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
              </label>
              <button class="button button--secondary button--small" id="site-content-image-upload-button" type="button">Nahrát do obsahu</button>
            </div>

            <div data-value-panel="gallery" hidden>
              <label>
                Přidat fotku URL
                <input id="site-content-gallery-url" placeholder="/uploads/site_sections/fotka.jpg">
              </label>
              <div class="form-row">
                <label>
                  Popis fotky
                  <input id="site-content-gallery-alt">
                </label>
                <label>
                  Media ID
                  <input id="site-content-gallery-media-id">
                </label>
              </div>
              <button class="button button--secondary button--small" id="site-content-gallery-add" type="button">Přidat URL fotku</button>
              <label>
                Nahrát fotku do galerie
                <input id="site-content-gallery-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
              </label>
              <button class="button button--secondary button--small" id="site-content-gallery-upload-button" type="button">Nahrát a přidat</button>
              <div class="photo-list" id="site-content-gallery-photos"></div>
            </div>

            <div data-value-panel="link" hidden>
              <label>
                Text odkazu
                <input id="site-content-link-label">
              </label>
              <label>
                URL odkazu
                <input id="site-content-link-url" placeholder="/kontakt nebo https://...">
              </label>
            </div>

            <div data-value-panel="json" hidden>
              <label>
                JSON hodnota
                <textarea id="site-content-json" rows="7" spellcheck="false">{}</textarea>
              </label>
            </div>

            <div class="actions">
              <button class="button" type="submit">Uložit</button>
              <button class="button button--secondary" id="site-content-reset" type="button">Nový</button>
            </div>
          </form>
        </section>

        <section class="site-content-list">
          <div class="toolbar" style="margin-top:0;">
            <h2>Obsah webu</h2>
            <button class="button button--secondary button--small" id="site-content-reload" type="button">Obnovit</button>
          </div>
          <div id="site-content-root" class="empty-state">Načítám obsah...</div>
        </section>
      </div>
    </div>

    <script>
    (function() {
      var items = [];
      var galleryImages = [];
      var editedId = '';
      var keyTouched = false;
      var presets = {
        hero: { section: 'homepage', key: 'homepage.hero', label: 'Homepage hero text', type: 'rich_text', sort: 10, text: 'Hlavní nadpis a úvodní text homepage.' },
        hero_image: { section: 'homepage', key: 'homepage.hero.image', label: 'Homepage hero obrázek', type: 'image', sort: 11 },
        nav_about: { section: 'global', key: 'nav.about', label: 'Menu: O nás', type: 'text', sort: 12, text: 'O nás' },
        nav_products: { section: 'global', key: 'nav.products', label: 'Menu: Výrobky', type: 'text', sort: 13, text: 'Výrobky' },
        nav_author: { section: 'global', key: 'nav.author', label: 'Menu: Autor', type: 'text', sort: 14, text: 'Autor' },
        nav_blog: { section: 'global', key: 'nav.blog', label: 'Menu: Blog', type: 'text', sort: 15, text: 'Blog' },
        nav_custom: { section: 'global', key: 'nav.custom', label: 'Menu: Zakázková výroba', type: 'text', sort: 16, text: 'Zakázková výroba' },
        nav_contact: { section: 'global', key: 'nav.contact', label: 'Menu: Kontakt', type: 'text', sort: 17, text: 'Kontakt' },
        about: { section: 'about', key: 'about.text', label: 'O nás text', type: 'rich_text', sort: 20, text: 'Text o značce a autorovi.' },
        craft: { section: 'craft', key: 'craft.philosophy', label: 'Řemeslo a filozofie', type: 'rich_text', sort: 30, text: 'Text o práci se dřevem a hodnotách.' },
        contact: { section: 'contact', key: 'contact.text', label: 'Kontakt text', type: 'rich_text', sort: 40, text: 'Text v kontaktní sekci.' },
        gallery: { section: 'gallery', key: 'gallery.images', label: 'Galerie obrázků', type: 'gallery', sort: 50 },
        products_title: { section: 'products', key: 'products.title', label: 'Nadpis sekce výrobků', type: 'text', sort: 58, text: 'Naše výrobky' },
        products_intro: { section: 'products', key: 'products.intro', label: 'Úvod k výrobkům', type: 'rich_text', sort: 60, text: 'Krátký text nad výpisem výrobků.' },
        products_empty: { section: 'products', key: 'products.empty', label: 'Text prázdné kategorie výrobků', type: 'text', sort: 62, text: 'V této kategorii teď připravujeme ukázky. Rádi vám ale podobný výrobek navrhneme na míru.' },
        product_detail: { section: 'products', key: 'products.detail.empty', label: 'Výrobek bez detailního textu', type: 'text', sort: 64, text: 'K tomuto výrobku brzy doplníme podrobnosti.' },
        blog_title: { section: 'blog', key: 'blog.title', label: 'Nadpis blogu', type: 'text', sort: 68, text: 'Z dílny' },
        blog_intro: { section: 'blog', key: 'blog.intro', label: 'Úvod blogu', type: 'rich_text', sort: 70, text: 'Krátký text nad blogem.' },
        blog_empty: { section: 'blog', key: 'blog.empty', label: 'Text prázdného blogu', type: 'text', sort: 72, text: 'Články z dílny teprve připravujeme.' },
        blog_detail: { section: 'blog', key: 'blog.detail.empty', label: 'Článek bez textu', type: 'text', sort: 74, text: 'K tomuto článku brzy doplníme text.' },
        footer: { section: 'global', key: 'footer.tagline', label: 'Text v patičce', type: 'text', sort: 90, text: 'Dřevěné výrobky zhotovené srdcem' }
      };

      var form = document.getElementById('site-content-form');
      var formTitle = document.getElementById('site-content-form-title');
      var message = document.getElementById('site-content-message');
      var root = document.getElementById('site-content-root');
      var idInput = document.getElementById('site-content-id');
      var presetInput = document.getElementById('site-content-preset');
      var localeInput = document.getElementById('site-content-locale');
      var sectionInput = document.getElementById('site-content-section');
      var labelInput = document.getElementById('site-content-label');
      var keyInput = document.getElementById('site-content-key');
      var typeInput = document.getElementById('site-content-type');
      var statusInput = document.getElementById('site-content-status');
      var sortOrderInput = document.getElementById('site-content-sort-order');
      var publishedAtInput = document.getElementById('site-content-published-at');
      var textInput = document.getElementById('site-content-text');
      var richTextInput = document.getElementById('site-content-rich-text');
      var imageUrlInput = document.getElementById('site-content-image-url');
      var imageAltInput = document.getElementById('site-content-image-alt');
      var imageMediaIdInput = document.getElementById('site-content-image-media-id');
      var imageCaptionInput = document.getElementById('site-content-image-caption');
      var imageUploadInput = document.getElementById('site-content-image-upload');
      var galleryUrlInput = document.getElementById('site-content-gallery-url');
      var galleryAltInput = document.getElementById('site-content-gallery-alt');
      var galleryMediaIdInput = document.getElementById('site-content-gallery-media-id');
      var galleryUploadInput = document.getElementById('site-content-gallery-upload');
      var galleryRoot = document.getElementById('site-content-gallery-photos');
      var linkLabelInput = document.getElementById('site-content-link-label');
      var linkUrlInput = document.getElementById('site-content-link-url');
      var jsonInput = document.getElementById('site-content-json');

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function keyify(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\\.+|\\.+$/g, '');
      }

      function setMessage(text, type) {
        message.hidden = !text;
        message.className = type === 'success' ? 'success' : 'alert';
        message.textContent = text || '';
      }

      function formatDateForInput(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      function normalizePhotoOrder() {
        galleryImages = galleryImages.map(function(photo, index) {
          return Object.assign({}, photo, {
            sort_order: index,
            is_featured: index === 0
          });
        });
      }

      function renderGallery() {
        normalizePhotoOrder();
        if (!galleryImages.length) {
          galleryRoot.innerHTML = '<div class="empty-state">Galerie je prázdná.</div>';
          return;
        }
        galleryRoot.innerHTML = galleryImages.map(function(photo, index) {
          var thumb = photo.url
            ? '<img src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.alt || '') + '">'
            : '<div class="photo-row__empty">Bez náhledu</div>';
          return '<article class="photo-row" data-index="' + index + '">' +
            thumb +
            '<div class="photo-row__fields">' +
              '<input data-photo-field="url" type="hidden" value="' + escapeHtml(photo.url || '') + '">' +
              '<input data-photo-field="alt" type="hidden" value="' + escapeHtml(photo.alt || '') + '">' +
              '<label>Popisek fotky<input data-photo-field="caption" value="' + escapeHtml(photo.caption || '') + '" placeholder="Volitelné"></label>' +
              '<input data-photo-field="media_id" type="hidden" value="' + escapeHtml(photo.media_id || '') + '">' +
              '<div class="photo-row__buttons">' +
                '<button class="button button--secondary button--small" type="button" data-photo-action="up">Nahoru</button>' +
                '<button class="button button--secondary button--small" type="button" data-photo-action="down">Dolů</button>' +
                '<button class="button button--danger button--small" type="button" data-photo-action="remove">Odebrat</button>' +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      function showValuePanel() {
        var type = typeInput.value;
        Array.prototype.slice.call(document.querySelectorAll('[data-value-panel]')).forEach(function(panel) {
          panel.hidden = panel.getAttribute('data-value-panel') !== type;
        });
        renderGallery();
      }

      function valueForItem(item) {
        return item && item.value && typeof item.value === 'object' ? item.value : {};
      }

      function currentValue() {
        if (typeInput.value === 'text') return { text: textInput.value.trim() };
        if (typeInput.value === 'rich_text') return { html: richTextInput.value.trim() };
        if (typeInput.value === 'image') {
          return {
            url: imageUrlInput.value.trim(),
            alt: imageAltInput.value.trim(),
            caption: imageCaptionInput.value.trim(),
            media_id: imageMediaIdInput.value.trim()
          };
        }
        if (typeInput.value === 'gallery') return { images: galleryImages };
        if (typeInput.value === 'link') {
          return {
            label: linkLabelInput.value.trim(),
            url: linkUrlInput.value.trim()
          };
        }
        try {
          return JSON.parse(jsonInput.value || '{}');
        } catch (error) {
          throw new Error('JSON hodnota není platná.');
        }
      }

      function currentPayload() {
        return {
          locale: localeInput.value.trim() || 'cs',
          section: sectionInput.value.trim(),
          label: labelInput.value.trim(),
          content_key: keyInput.value.trim().toLowerCase(),
          content_type: typeInput.value,
          value: currentValue(),
          status: statusInput.value,
          sort_order: sortOrderInput.value,
          published_at: publishedAtInput.value
        };
      }

      function resetForm() {
        editedId = '';
        keyTouched = false;
        galleryImages = [];
        formTitle.textContent = 'Nový obsah';
        idInput.value = '';
        form.reset();
        localeInput.value = 'cs';
        sectionInput.value = 'homepage';
        typeInput.value = 'text';
        statusInput.value = 'draft';
        sortOrderInput.value = '0';
        jsonInput.value = '{}';
        showValuePanel();
        labelInput.focus();
      }

      function fillValueInputs(item) {
        var value = valueForItem(item);
        textInput.value = item.content_type === 'text' ? (value.text || '') : '';
        richTextInput.value = item.content_type === 'rich_text' ? (value.html || value.text || '') : '';
        imageUrlInput.value = item.content_type === 'image' ? (value.url || '') : '';
        imageAltInput.value = item.content_type === 'image' ? (value.alt || '') : '';
        imageMediaIdInput.value = item.content_type === 'image' ? (value.media_id || '') : '';
        imageCaptionInput.value = item.content_type === 'image' ? (value.caption || '') : '';
        galleryImages = item.content_type === 'gallery' && Array.isArray(value.images)
          ? value.images.map(function(photo) { return Object.assign({}, photo); })
          : [];
        linkLabelInput.value = item.content_type === 'link' ? (value.label || '') : '';
        linkUrlInput.value = item.content_type === 'link' ? (value.url || '') : '';
        jsonInput.value = item.content_type === 'json' ? JSON.stringify(value, null, 2) : '{}';
      }

      function editItem(item) {
        editedId = item.id;
        keyTouched = true;
        formTitle.textContent = 'Upravit obsah';
        idInput.value = item.id;
        localeInput.value = item.locale || 'cs';
        sectionInput.value = item.section || 'homepage';
        labelInput.value = item.label || '';
        keyInput.value = item.content_key || '';
        typeInput.value = item.content_type || 'text';
        statusInput.value = item.status || 'draft';
        sortOrderInput.value = item.sort_order || 0;
        publishedAtInput.value = formatDateForInput(item.published_at);
        fillValueInputs(item);
        showValuePanel();
        labelInput.focus();
      }

      function statusBadges(item) {
        var badges = [];
        if (item.status === 'archived') {
          badges.push('<span class="badge badge--archived">Archiv</span>');
        } else if (item.status === 'published') {
          badges.push('<span class="badge badge--ok">Publikováno</span>');
        } else {
          badges.push('<span class="badge badge--muted">Koncept</span>');
        }
        badges.push('<span class="badge">' + escapeHtml(item.content_type || 'text') + '</span>');
        badges.push('<span class="badge">Pořadí ' + escapeHtml(item.sort_order || 0) + '</span>');
        return '<div class="badges">' + badges.join('') + '</div>';
      }

      function itemSummary(item) {
        var value = valueForItem(item);
        if (item.content_type === 'text') return value.text || '';
        if (item.content_type === 'rich_text') return value.html || value.text || '';
        if (item.content_type === 'image') return value.caption || value.alt || value.url || '';
        if (item.content_type === 'gallery') return Array.isArray(value.images) ? value.images.length + ' fotek' : 'Galerie';
        if (item.content_type === 'link') return [value.label, value.url].filter(Boolean).join(' - ');
        return JSON.stringify(value);
      }

      function itemThumb(item) {
        var value = valueForItem(item);
        var url = '';
        var alt = item.label || '';
        if (item.content_type === 'image') {
          url = value.url || '';
          alt = value.alt || alt;
        } else if (item.content_type === 'gallery' && Array.isArray(value.images) && value.images[0]) {
          url = value.images[0].url || '';
          alt = value.images[0].alt || alt;
        }
        return url
          ? '<img class="site-content-thumb" src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '">'
          : '<div class="site-content-thumb site-content-thumb--empty">Bez náhledu</div>';
      }

      function renderItems() {
        if (!items.length) {
          root.className = 'empty-state';
          root.innerHTML = 'Zatím tu není žádný editovatelný obsah.';
          return;
        }
        root.className = '';
        root.innerHTML = items.map(function(item) {
          var archived = item.status === 'archived';
          var actionHtml = archived
            ? '<button class="button button--secondary button--small" type="button" data-action="restore" data-id="' + escapeHtml(item.id) + '">Obnovit</button>'
            : '<button class="button button--secondary button--small" type="button" data-action="toggle-published" data-id="' + escapeHtml(item.id) + '">' + (item.status === 'published' ? 'Stáhnout' : 'Publikovat') + '</button>' +
              '<button class="button button--danger button--small" type="button" data-action="archive" data-id="' + escapeHtml(item.id) + '">Archivovat</button>';
          return '<article class="site-content-row">' +
            itemThumb(item) +
            '<div class="site-content-main">' +
              '<div class="site-content-titleline"><strong>' + escapeHtml(item.label) + '</strong>' + statusBadges(item) + '</div>' +
              '<div class="site-content-meta">' + escapeHtml(item.locale || 'cs') + ' / ' + escapeHtml(item.section) + ' / ' + escapeHtml(item.content_key) + '</div>' +
              (itemSummary(item) ? '<p>' + escapeHtml(itemSummary(item)).slice(0, 180) + '</p>' : '') +
              '<div class="site-content-actions">' +
                '<button class="button button--small" type="button" data-action="edit" data-id="' + escapeHtml(item.id) + '">Upravit</button>' +
                actionHtml +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      async function requestJson(url, options) {
        var response = await fetch(url, Object.assign({
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        }, options || {}));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.');
        return data;
      }

      async function loadItems() {
        root.className = 'empty-state';
        root.textContent = 'Načítám obsah...';
        var data = await requestJson('/admin/api/site-content');
        items = data.contents || [];
        renderItems();
      }

      async function saveItem(payload, id) {
        var data = await requestJson(id ? '/admin/api/site-content/' + encodeURIComponent(id) : '/admin/api/site-content', {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        });
        setMessage('Obsah byl uložen.', 'success');
        await loadItems();
        editItem(data.content);
      }

      async function uploadPhoto(targetMode) {
        var fileInput = targetMode === 'gallery' ? galleryUploadInput : imageUploadInput;
        var file = fileInput.files && fileInput.files[0];
        if (!file) throw new Error('Vyberte fotku k nahrání.');
        var body = new FormData();
        body.append('image', file);
        body.append('targetLabel', labelInput.value.trim() || keyInput.value.trim() || 'Sekce webu');
        body.append('targetKey', keyInput.value.trim() || keyify(labelInput.value) || 'sekce-webu');
        body.append('alt', targetMode === 'gallery' ? galleryAltInput.value.trim() : imageAltInput.value.trim());
        var response = await fetch('/admin/api/site-content/photo-upload', {
          method: 'POST',
          body: body,
          headers: { Accept: 'application/json' }
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nahrání se nepodařilo.');
        fileInput.value = '';
        return data.photo;
      }

      function payloadFromItem(item, overrides) {
        return Object.assign({
          locale: item.locale || 'cs',
          section: item.section || 'homepage',
          label: item.label || '',
          content_key: item.content_key || '',
          content_type: item.content_type || 'text',
          value: valueForItem(item),
          status: item.status || 'draft',
          sort_order: item.sort_order || 0,
          published_at: item.published_at || ''
        }, overrides || {});
      }

      presetInput.addEventListener('change', function() {
        var preset = presets[presetInput.value];
        if (!preset) return;
        sectionInput.value = preset.section;
        labelInput.value = preset.label;
        keyInput.value = preset.key;
        typeInput.value = preset.type;
        sortOrderInput.value = preset.sort;
        if (preset.type === 'rich_text') richTextInput.value = preset.text || '';
        if (preset.type === 'text') textInput.value = preset.text || '';
        keyTouched = true;
        showValuePanel();
      });

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        setMessage('', 'success');
        try {
          saveItem(currentPayload(), editedId).catch(function(error) {
            setMessage(error.message, 'error');
          });
        } catch (error) {
          setMessage(error.message, 'error');
        }
      });

      labelInput.addEventListener('input', function() {
        if (!keyTouched) keyInput.value = keyify(sectionInput.value + '.' + labelInput.value);
      });

      keyInput.addEventListener('input', function() {
        keyTouched = true;
        keyInput.value = keyify(keyInput.value);
      });

      typeInput.addEventListener('change', showValuePanel);

      document.getElementById('site-content-reset').addEventListener('click', function() {
        setMessage('', 'success');
        resetForm();
      });

      document.getElementById('site-content-reload').addEventListener('click', function() {
        loadItems().catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      document.getElementById('site-content-image-upload-button').addEventListener('click', function() {
        setMessage('Nahrávám obrázek...', 'success');
        uploadPhoto('image').then(function(photo) {
          imageUrlInput.value = photo.url || '';
          imageAltInput.value = photo.alt || imageAltInput.value;
          imageCaptionInput.value = photo.caption || imageCaptionInput.value;
          imageMediaIdInput.value = photo.media_id || '';
          setMessage('Obrázek byl nahrán. Nezapomeňte obsah uložit.', 'success');
        }).catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      document.getElementById('site-content-gallery-add').addEventListener('click', function() {
        var url = galleryUrlInput.value.trim();
        var mediaId = galleryMediaIdInput.value.trim();
        if (!url && !mediaId) {
          setMessage('Vyberte fotku k nahrání.', 'error');
          return;
        }
        galleryImages.push({
          media_id: mediaId,
          url: url,
          alt: galleryAltInput.value.trim(),
          caption: '',
          sort_order: galleryImages.length,
          is_featured: galleryImages.length === 0
        });
        galleryUrlInput.value = '';
        galleryAltInput.value = '';
        galleryMediaIdInput.value = '';
        renderGallery();
      });

      document.getElementById('site-content-gallery-upload-button').addEventListener('click', function() {
        setMessage('Nahrávám fotku...', 'success');
        uploadPhoto('gallery').then(function(photo) {
          galleryImages.push(photo);
          renderGallery();
          setMessage('Fotka byla přidána. Nezapomeňte obsah uložit.', 'success');
        }).catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      galleryRoot.addEventListener('input', function(event) {
        var field = event.target.getAttribute('data-photo-field');
        if (!field) return;
        var row = event.target.closest('[data-index]');
        var index = Number(row && row.dataset.index);
        if (!Number.isFinite(index) || !galleryImages[index]) return;
        galleryImages[index][field] = event.target.value;
      });

      galleryRoot.addEventListener('click', function(event) {
        var action = event.target.getAttribute('data-photo-action');
        if (!action) return;
        var row = event.target.closest('[data-index]');
        var index = Number(row && row.dataset.index);
        if (!Number.isFinite(index) || !galleryImages[index]) return;
        if (action === 'remove') {
          galleryImages.splice(index, 1);
        } else if (action === 'up' && index > 0) {
          var up = galleryImages[index - 1];
          galleryImages[index - 1] = galleryImages[index];
          galleryImages[index] = up;
        } else if (action === 'down' && index < galleryImages.length - 1) {
          var down = galleryImages[index + 1];
          galleryImages[index + 1] = galleryImages[index];
          galleryImages[index] = down;
        }
        renderGallery();
      });

      root.addEventListener('click', function(event) {
        var button = event.target.closest('[data-action]');
        if (!button) return;
        var id = button.dataset.id;
        var item = items.find(function(entry) { return entry.id === id; });
        if (!item && button.dataset.action !== 'restore') return;
        if (button.dataset.action === 'edit') {
          editItem(item);
        } else if (button.dataset.action === 'toggle-published') {
          saveItem(payloadFromItem(item, {
            status: item.status === 'published' ? 'draft' : 'published',
            published_at: item.status === 'published' ? '' : item.published_at
          }), id).catch(function(error) { setMessage(error.message, 'error'); });
        } else if (button.dataset.action === 'archive') {
          if (!window.confirm('Archivovat tento obsah? Zůstane v databázi, ale nebude veřejně dostupný.')) return;
          requestJson('/admin/api/site-content/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' })
            .then(function() {
              setMessage('Obsah byl archivován.', 'success');
              if (editedId === id) resetForm();
              return loadItems();
            })
            .catch(function(error) { setMessage(error.message, 'error'); });
        } else if (button.dataset.action === 'restore') {
          requestJson('/admin/api/site-content/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: '{}' })
            .then(function() {
              setMessage('Obsah byl obnoven jako koncept.', 'success');
              return loadItems();
            })
            .catch(function(error) { setMessage(error.message, 'error'); });
        }
      });

      resetForm();
      loadItems().catch(function(error) {
        setMessage(error.message, 'error');
        root.className = 'empty-state';
        root.textContent = 'Obsah se nepodařilo načíst.';
      });
    })();
    </script>
  `);
}

function homepageEditorPage(session) {
  return adminLayout('Domovská stránka', `
    ${adminMasthead(session)}
    <div class="content homepage-editor" id="homepage-editor">
      <style>
        .homepage-editor { max-width: 1460px; }
        .homepage-editor__toolbar { position: sticky; top: 12px; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px 20px; margin-bottom: 22px; border: 1px solid rgba(69,89,48,.18); border-radius: 22px; background: rgba(255,253,247,.94); box-shadow: 0 14px 38px rgba(45,55,34,.12); backdrop-filter: blur(18px); }
        .homepage-editor__heading h1 { margin: 0 0 4px; font-size: clamp(1.65rem,3vw,2.35rem); }
        .homepage-editor__heading p { margin: 0; color: #66705c; }
        .homepage-editor__toolbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 9px; flex-wrap: wrap; }
        .homepage-save-status { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 12px; border-radius: 999px; background: #edf2e7; color: #435134; font-size: .84rem; font-weight: 800; }
        .homepage-save-status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #729052; }
        .homepage-save-status.is-dirty { background: #fff0d8; color: #744d1c; }
        .homepage-save-status.is-dirty::before { background: #d89535; }
        .homepage-save-status.is-error { background: #fbe5e1; color: #8d3128; }
        .homepage-save-status.is-error::before { background: #bf4b40; }
        .homepage-editor__message { margin: -8px 0 18px; }
        .homepage-editor__retry { margin: -8px 0 18px; }
        .homepage-editor__workspace { display: grid; grid-template-columns: minmax(0,1fr) minmax(330px,430px); align-items: start; gap: 24px; }
        .homepage-editor.is-busy .homepage-editor__workspace { pointer-events: none; opacity: .7; }
        .homepage-canvas { min-width: 0; padding: 22px; border: 1px solid rgba(69,89,48,.14); border-radius: 26px; background: #f4efe4; box-shadow: inset 0 0 0 1px rgba(255,255,255,.6); }
        .homepage-canvas__intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .homepage-canvas__intro h2 { margin: 0 0 5px; }
        .homepage-canvas__intro p { margin: 0; color: #68705d; }
        .homepage-block-list { display: grid; gap: 13px; padding: 0; margin: 0; list-style: none; }
        .homepage-block-card { position: relative; display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: stretch; min-height: 154px; overflow: hidden; border: 2px solid transparent; border-radius: 20px; background: #fffdf8; box-shadow: 0 10px 28px rgba(45,55,34,.08); transition: border-color .18s ease, transform .18s ease, opacity .18s ease; }
        .homepage-block-card:hover { transform: translateY(-1px); }
        .homepage-block-card.is-selected { border-color: #6e8251; box-shadow: 0 13px 34px rgba(65,83,43,.17); }
        .homepage-block-card.is-hidden { opacity: .58; }
        .homepage-block-card.is-dragging { opacity: .42; }
        .homepage-block-card__handle { display: grid; place-items: center; border: 0; border-right: 1px solid rgba(69,89,48,.12); background: #edf0e7; color: #647052; font-size: 1.25rem; cursor: grab; }
        .homepage-block-card__handle[disabled] { cursor: default; color: #a7ad9c; }
        .homepage-block-card__preview { display: grid; grid-template-columns: minmax(0,1fr) 132px; min-width: 0; cursor: pointer; }
        .homepage-block-card__copy { align-self: center; min-width: 0; padding: 18px 20px; }
        .homepage-block-card__meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 8px; }
        .homepage-block-card__meta span { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #edf0e7; color: #536045; font-size: .68rem; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
        .homepage-block-card__meta span.is-auto { background: #e9eef7; color: #435b7a; }
        .homepage-block-card__meta span.is-off { background: #f4e2df; color: #8b3d33; }
        .homepage-block-card__copy strong { display: block; overflow: hidden; margin-bottom: 6px; color: #2f3927; font-family: Fraunces, Georgia, serif; font-size: 1.32rem; line-height: 1.14; text-overflow: ellipsis; white-space: nowrap; }
        .homepage-block-card__copy p { display: -webkit-box; overflow: hidden; margin: 0; color: #6d7464; font-size: .88rem; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .homepage-block-card__image { min-height: 152px; background: linear-gradient(145deg,#d9ddcf,#b8c0a6); }
        .homepage-block-card__image img { width: 100%; height: 100%; min-height: 152px; object-fit: cover; }
        .homepage-block-card__image.is-empty { display: grid; place-items: center; padding: 12px; color: #68735b; font-weight: 800; text-align: center; }
        .homepage-block-card__actions { display: grid; align-content: center; gap: 6px; padding: 10px; border-left: 1px solid rgba(69,89,48,.1); }
        .homepage-block-card__actions button { min-width: 42px; min-height: 38px; padding: 7px 9px; border: 1px solid rgba(69,89,48,.16); border-radius: 10px; background: #fff; color: #46543b; cursor: pointer; font-weight: 800; }
        .homepage-block-card__actions button:hover:not(:disabled) { background: #edf0e7; }
        .homepage-block-card__actions button:disabled { opacity: .35; cursor: not-allowed; }
        .homepage-add { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; min-height: 54px; margin-top: 14px; border: 2px dashed rgba(69,89,48,.35); border-radius: 16px; background: rgba(255,255,255,.52); color: #46593a; cursor: pointer; font-weight: 850; }
        .homepage-add:hover { border-color: #6e8251; background: #fffdf8; }
        .homepage-footer-lock { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 15px 18px; border-radius: 16px; background: #303a2a; color: #f7f1e5; }
        .homepage-footer-lock span { color: rgba(247,241,229,.7); font-size: .82rem; }
        .homepage-inspector { position: sticky; top: 118px; max-height: calc(100vh - 136px); overflow: auto; border: 1px solid rgba(69,89,48,.15); border-radius: 24px; background: #fffdf8; box-shadow: 0 14px 38px rgba(45,55,34,.1); }
        .homepage-inspector__header { position: sticky; top: 0; z-index: 2; padding: 20px 22px 16px; border-bottom: 1px solid rgba(69,89,48,.12); background: rgba(255,253,248,.96); backdrop-filter: blur(12px); }
        .homepage-inspector__header span { display: block; margin-bottom: 5px; color: #78816e; font-size: .72rem; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
        .homepage-inspector__header h2 { margin: 0; font-size: 1.55rem; }
        .homepage-inspector__body { display: grid; gap: 16px; padding: 20px 22px 26px; }
        .homepage-inspector__body label { display: grid; gap: 7px; color: #3f4937; font-weight: 800; }
        .homepage-inspector__body small { color: #747b6c; font-weight: 500; line-height: 1.45; }
        .homepage-inspector__body textarea { min-height: 112px; resize: vertical; }
        .homepage-inspector__hint { padding: 13px 14px; border-radius: 14px; background: #edf2e7; color: #536047; font-size: .86rem; line-height: 1.5; }
        .homepage-image-field { display: grid; gap: 10px; padding: 14px; border: 1px solid rgba(69,89,48,.14); border-radius: 16px; background: #f7f4ec; }
        .homepage-image-field__preview { display: grid; place-items: center; min-height: 145px; overflow: hidden; border-radius: 12px; background: #dde2d4; color: #647058; font-weight: 750; }
        .homepage-image-field__preview img { width: 100%; height: 190px; object-fit: cover; }
        .homepage-image-field__actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .homepage-image-field__actions label, .homepage-image-field__actions button { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 9px 12px; border: 1px solid rgba(69,89,48,.18); border-radius: 11px; background: #fff; color: #435239; cursor: pointer; font-size: .82rem; font-weight: 850; }
        .homepage-image-field__actions input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .homepage-inspector__empty { padding: 46px 24px; color: #69715f; text-align: center; }
        .homepage-block-library { width: min(720px,calc(100vw - 28px)); padding: 0; border: 0; border-radius: 24px; background: #fffdf8; box-shadow: 0 26px 80px rgba(30,36,25,.3); }
        .homepage-block-library::backdrop { background: rgba(27,34,23,.56); backdrop-filter: blur(4px); }
        .homepage-block-library__inner { padding: 24px; }
        .homepage-block-library__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; }
        .homepage-block-library__head h2 { margin: 0 0 5px; }
        .homepage-block-library__head p { margin: 0; color: #6d7564; }
        .homepage-block-library__close { min-width: 42px; min-height: 42px; border: 0; border-radius: 50%; background: #edf0e7; cursor: pointer; font-size: 1.2rem; }
        .homepage-block-library__grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin-top: 22px; }
        .homepage-template { min-height: 170px; padding: 18px; border: 1px solid rgba(69,89,48,.16); border-radius: 17px; background: #f7f3e9; color: #3b4832; cursor: pointer; text-align: left; }
        .homepage-template:hover { border-color: #718556; background: #edf2e7; }
        .homepage-template strong { display: block; margin: 10px 0 6px; font-family: Fraunces,Georgia,serif; font-size: 1.12rem; }
        .homepage-template span { color: #697260; font-size: .82rem; line-height: 1.45; }
        @media (max-width: 1000px) {
          .homepage-editor__toolbar { position: static; align-items: flex-start; flex-direction: column; }
          .homepage-editor__toolbar-actions { justify-content: flex-start; }
          .homepage-editor__workspace { grid-template-columns: 1fr; }
          .homepage-inspector { position: static; max-height: none; }
        }
        @media (max-width: 640px) {
          .homepage-editor { padding-inline: 12px; }
          .homepage-editor__toolbar { padding: 16px; border-radius: 18px; }
          .homepage-editor__toolbar-actions { width: 100%; }
          .homepage-editor__toolbar-actions .button { flex: 1 1 135px; min-height: 46px; }
          .homepage-save-status { width: 100%; justify-content: center; }
          .homepage-canvas { padding: 12px; border-radius: 19px; }
          .homepage-canvas__intro { display: block; padding: 7px 4px; }
          .homepage-canvas__intro .button { margin-top: 12px; }
          .homepage-block-card { grid-template-columns: 1fr; }
          .homepage-block-card__handle { display: none; }
          .homepage-block-card__preview { grid-template-columns: minmax(0,1fr) 92px; min-height: 132px; }
          .homepage-block-card__copy { padding: 15px; }
          .homepage-block-card__image, .homepage-block-card__image img { min-height: 132px; }
          .homepage-block-card__actions { grid-template-columns: repeat(4,1fr); border-top: 1px solid rgba(69,89,48,.1); border-left: 0; }
          .homepage-block-card__actions button { min-height: 46px; }
          .homepage-block-library__grid { grid-template-columns: 1fr; }
          .homepage-template { min-height: 108px; }
        }
      </style>

      <div class="homepage-editor__toolbar">
        <div class="homepage-editor__heading">
          <h1>Domovská stránka</h1>
          <p>Stránku skládáte stejně, jak ji návštěvník postupně vidí shora dolů.</p>
        </div>
        <div class="homepage-editor__toolbar-actions">
          <span class="homepage-save-status" id="homepage-save-status" aria-live="polite">Načítám…</span>
          <a class="button button--ghost" href="/" target="_blank" rel="noopener">Živý web</a>
          <button class="button button--secondary" id="homepage-reset" type="button" disabled>Vrátit živou verzi</button>
          <button class="button button--secondary" id="homepage-save" type="button" disabled>Uložit koncept</button>
          <button class="button" id="homepage-publish" type="button" disabled>Publikovat na web</button>
        </div>
      </div>

      <div class="homepage-editor__message" id="homepage-message" hidden aria-live="assertive"></div>
      <button class="button button--secondary homepage-editor__retry" id="homepage-retry" type="button" hidden>Načíst editor znovu</button>
      <div class="homepage-editor__workspace" aria-busy="true">
        <section class="homepage-canvas" aria-labelledby="homepage-canvas-title">
          <div class="homepage-canvas__intro">
            <div><h2 id="homepage-canvas-title">Pořadí stránky</h2><p>Kliknutím otevřete úpravy. Šipkami nebo tažením změníte pořadí.</p></div>
            <button class="button button--secondary" type="button" data-open-library disabled>Přidat blok</button>
          </div>
          <ol class="homepage-block-list" id="homepage-block-list" aria-label="Bloky domovské stránky"></ol>
          <button class="homepage-add" type="button" data-open-library disabled><span aria-hidden="true">＋</span> Přidat další blok</button>
          <div class="homepage-footer-lock"><strong>Patička webu</strong><span>Pevně na posledním místě</span></div>
        </section>
        <aside class="homepage-inspector" id="homepage-inspector" aria-live="polite">
          <div class="homepage-inspector__empty">Vyberte blok vlevo a tady upravíte jeho texty a fotografie.</div>
        </aside>
      </div>

      <dialog class="homepage-block-library" id="homepage-block-library" aria-labelledby="homepage-library-title">
        <div class="homepage-block-library__inner">
          <div class="homepage-block-library__head">
            <div><h2 id="homepage-library-title">Přidat blok</h2><p>Vyberte bezpečnou šablonu, která zapadne do vzhledu webu.</p></div>
            <button class="homepage-block-library__close" type="button" data-close-library aria-label="Zavřít">×</button>
          </div>
          <div class="homepage-block-library__grid">
            <button class="homepage-template" type="button" data-template="image-right" disabled><span aria-hidden="true">▤ ◼</span><strong>Text a fotografie</strong><span>Univerzální blok s obrázkem vpravo. Stranu lze později změnit.</span></button>
            <button class="homepage-template" type="button" data-template="text-only" disabled><span aria-hidden="true">☰</span><strong>Samostatný text</strong><span>Klidný obsahový blok bez fotografie.</span></button>
            <button class="homepage-template" type="button" data-template="image-wide" disabled><span aria-hidden="true">▰</span><strong>Široká fotografie</strong><span>Výrazná fotografie s krátkým textem.</span></button>
          </div>
        </div>
      </dialog>
    </div>
    <script>
    (function() {
      var app = document.getElementById('homepage-editor');
      if (!app) return;
      var list = document.getElementById('homepage-block-list');
      var inspector = document.getElementById('homepage-inspector');
      var status = document.getElementById('homepage-save-status');
      var message = document.getElementById('homepage-message');
      var library = document.getElementById('homepage-block-library');
      var workspace = app.querySelector('.homepage-editor__workspace');
      var retryButton = document.getElementById('homepage-retry');
      var saveButton = document.getElementById('homepage-save');
      var publishButton = document.getElementById('homepage-publish');
      var resetButton = document.getElementById('homepage-reset');
      var state = { layout: { version: 1, blocks: [] }, selectedId: '', revision: null, dirty: false, draftDiffers: false, busy: false, loaded: false, draggedId: '' };
      var fixedLabels = { hero: 'Úvodní obrazovka', about: 'Řemeslo s tradicí', products: 'Výrobky', blog: 'Blog', author: 'Příběh za značkou', custom: 'Zakázková výroba a kontakt' };

      workspace.inert = true;

      function setMutationControlsDisabled(disabled) {
        saveButton.disabled = disabled;
        publishButton.disabled = disabled;
        resetButton.disabled = disabled;
        document.querySelectorAll('[data-open-library], [data-template]').forEach(function(button) {
          button.disabled = disabled;
        });
      }

      function setBusy(busy) {
        state.busy = busy;
        app.classList.toggle('is-busy', busy);
        workspace.inert = busy || !state.loaded;
        workspace.setAttribute('aria-busy', busy || !state.loaded ? 'true' : 'false');
        setMutationControlsDisabled(busy || !state.loaded);
      }

      function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function requestJson(url, options) {
        return fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }, options || {})).then(function(response) {
          return response.json().catch(function() { return {}; }).then(function(data) {
            if (!response.ok) {
              var error = new Error(data.error || 'Požadavek se nepodařil.');
              error.status = response.status;
              throw error;
            }
            return data;
          });
        });
      }

      function setMessage(text, type) {
        if (!text) { message.hidden = true; message.textContent = ''; return; }
        message.hidden = false;
        message.className = 'homepage-editor__message ' + (type === 'error' ? 'alert' : 'success');
        message.textContent = text;
      }

      function setStatus(text, className) {
        status.textContent = text;
        status.className = 'homepage-save-status' + (className ? ' ' + className : '');
      }

      function updateStatus() {
        if (state.busy) return setStatus('Ukládám…', 'is-dirty');
        if (state.dirty) return setStatus('Neuložené změny', 'is-dirty');
        if (state.draftDiffers) return setStatus('Koncept čeká na publikaci', 'is-dirty');
        setStatus('Vše uloženo');
      }

      function blockById(id) {
        return state.layout.blocks.find(function(block) { return block.id === id; });
      }

      function blockTitle(block) {
        return (block.content && block.content.title) || fixedLabels[block.id] || block.label || 'Vlastní blok';
      }

      function blockSummary(block) {
        var content = block.content || {};
        return content.body || content.lead || content.secondary_body || 'Kliknutím doplňte obsah tohoto bloku.';
      }

      function blockImage(block) {
        var content = block.content || {};
        if (content.image && content.image.url) return content.image;
        if (Array.isArray(content.images)) return content.images.find(function(image) { return image && image.url; }) || null;
        return null;
      }

      function renderCards() {
        list.innerHTML = state.layout.blocks.map(function(block, index) {
          var image = blockImage(block);
          var selected = block.id === state.selectedId;
          var isAuto = block.id === 'products' || block.id === 'blog';
          var imageHtml = image
            ? '<span class="homepage-block-card__image"><img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || '') + '"></span>'
            : '<span class="homepage-block-card__image is-empty">' + (block.kind === 'story' ? 'Přidat fotografii' : 'Textový blok') + '</span>';
          var meta = '<span>' + escapeHtml(block.kind === 'story' ? 'Vlastní blok' : fixedLabels[block.id]) + '</span>';
          if (isAuto) meta += '<span class="is-auto">Automatický obsah</span>';
          if (block.visible === false) meta += '<span class="is-off">Skryto</span>';
          return '<li class="homepage-block-card' + (selected ? ' is-selected' : '') + (block.visible === false ? ' is-hidden' : '') + '" data-block-id="' + escapeHtml(block.id) + '" draggable="' + (block.id === 'hero' ? 'false' : 'true') + '"' + (selected ? ' aria-current="true"' : '') + '>' +
            '<button class="homepage-block-card__handle" type="button" tabindex="-1" aria-label="Přetáhnout blok"' + (block.id === 'hero' ? ' disabled' : '') + '>⋮⋮</button>' +
            '<button class="homepage-block-card__preview" type="button" data-action="edit" style="padding:0;border:0;background:transparent;text-align:left;">' +
              '<span class="homepage-block-card__copy"><span class="homepage-block-card__meta">' + meta + '</span><strong>' + escapeHtml(blockTitle(block)) + '</strong><p>' + escapeHtml(blockSummary(block)) + '</p></span>' + imageHtml +
            '</button>' +
            '<span class="homepage-block-card__actions">' +
              '<button type="button" data-action="up" aria-label="Posunout nahoru" title="Posunout nahoru"' + (index <= 1 ? ' disabled' : '') + '>↑</button>' +
              '<button type="button" data-action="down" aria-label="Posunout dolů" title="Posunout dolů"' + (index === state.layout.blocks.length - 1 || block.id === 'hero' ? ' disabled' : '') + '>↓</button>' +
              '<button type="button" data-action="visibility" aria-label="' + (block.visible === false ? 'Zobrazit blok' : 'Skrýt blok') + '" title="' + (block.visible === false ? 'Zobrazit' : 'Skrýt') + '"' + (block.id === 'hero' ? ' disabled' : '') + '>' + (block.visible === false ? '◉' : '◌') + '</button>' +
              (block.kind === 'story' ? '<button type="button" data-action="remove" aria-label="Přesunout blok do archivu" title="Odebrat blok">×</button>' : '<button type="button" data-action="edit" aria-label="Upravit blok" title="Upravit">✎</button>') +
            '</span></li>';
        }).join('');
      }

      function inputField(label, key, value, type, help) {
        var control = type === 'textarea'
          ? '<textarea data-content-key="' + key + '">' + escapeHtml(value) + '</textarea>'
          : '<input data-content-key="' + key + '" value="' + escapeHtml(value) + '"' + (type === 'url' ? ' inputmode="url" placeholder="#část-stránky nebo https://…"' : '') + '>';
        return '<label>' + escapeHtml(label) + control + (help ? '<small>' + escapeHtml(help) + '</small>' : '') + '</label>';
      }

      function selectField(label, key, value, options) {
        return '<label>' + escapeHtml(label) + '<select data-content-key="' + key + '">' + options.map(function(option) {
          return '<option value="' + escapeHtml(option[0]) + '"' + (option[0] === value ? ' selected' : '') + '>' + escapeHtml(option[1]) + '</option>';
        }).join('') + '</select></label>';
      }

      function imageField(block, slot, label) {
        var content = block.content || {};
        var image = slot.indexOf('images.') === 0 ? (content.images || [])[Number(slot.split('.')[1])] : content.image;
        image = image || { url: '', alt: '', media_id: '' };
        var preview = image.url
          ? '<img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || '') + '">'
          : '<span>Zatím bez fotografie</span>';
        return '<div class="homepage-image-field" data-image-slot="' + escapeHtml(slot) + '"><strong>' + escapeHtml(label) + '</strong><div class="homepage-image-field__preview">' + preview + '</div>' +
          '<div class="homepage-image-field__actions"><label>Nahradit fotografii<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-image-upload="' + escapeHtml(slot) + '"></label>' +
          (image.url ? '<button type="button" data-image-remove="' + escapeHtml(slot) + '">Odebrat z bloku</button>' : '') + '</div>' +
          '<label>Popis fotografie<input value="' + escapeHtml(image.alt || '') + '" data-image-alt="' + escapeHtml(slot) + '"><small>Krátký popis pomáhá lidem, kteří obrázek nevidí.</small></label></div>';
      }

      function renderInspector() {
        var block = blockById(state.selectedId);
        if (!block) {
          inspector.innerHTML = '<div class="homepage-inspector__empty">Vyberte blok vlevo a tady upravíte jeho texty a fotografie.</div>';
          return;
        }
        var content = block.content || {};
        var fields = '';
        if (block.id === 'hero') {
          fields += inputField('Malý nadpis', 'eyebrow', content.eyebrow, 'text');
          fields += inputField('Hlavní nadpis', 'title', content.title, 'text');
          fields += inputField('Úvodní text', 'body', content.body, 'textarea');
          fields += imageField(block, 'image', 'Úvodní fotografie');
          fields += inputField('Text hlavního tlačítka', 'primary_label', content.primary_label, 'text');
          fields += inputField('Cíl hlavního tlačítka', 'primary_url', content.primary_url, 'url');
          fields += inputField('Text druhého tlačítka', 'secondary_label', content.secondary_label, 'text');
          fields += inputField('Cíl druhého tlačítka', 'secondary_url', content.secondary_url, 'url');
        } else if (block.id === 'about') {
          fields += inputField('Nadpis', 'title', content.title, 'text');
          fields += inputField('Úvodní odstavec', 'lead', content.lead, 'textarea');
          fields += inputField('Další text', 'body', content.body, 'textarea');
          fields += imageField(block, 'image', 'Fotografie řemesla');
        } else if (block.id === 'products' || block.id === 'blog') {
          fields += '<div class="homepage-inspector__hint">Karty v této části se doplňují automaticky ze samostatné správy ' + (block.id === 'products' ? '<a href="/admin/products">výrobků</a>' : '<a href="/admin/blog-posts">článků</a>') + '. Zde měníte jen nadpis, úvod a umístění celého bloku.</div>';
          fields += inputField('Nadpis sekce', 'title', content.title, 'text');
          fields += inputField('Úvodní text', 'body', content.body, 'textarea');
        } else if (block.id === 'author') {
          fields += inputField('Nadpis', 'title', content.title, 'text');
          fields += inputField('Výrazný úvod', 'lead', content.lead, 'textarea');
          fields += inputField('Příběh', 'body', content.body, 'textarea', 'Prázdný řádek vytvoří nový odstavec.');
          fields += inputField('Podpis', 'signature', content.signature, 'text');
          fields += imageField(block, 'image', 'Fotografie autora');
        } else if (block.id === 'custom') {
          fields += inputField('Nadpis', 'title', content.title, 'text');
          fields += inputField('Hlavní text', 'body', content.body, 'textarea');
          fields += inputField('Doplňující text', 'secondary_body', content.secondary_body, 'textarea');
          fields += imageField(block, 'images.0', 'První fotografie');
          fields += imageField(block, 'images.1', 'Druhá fotografie');
          fields += '<div class="homepage-inspector__hint">Telefon, e-mail, sociální sítě a mapa zůstávají bezpečně nastavené ve webu.</div>';
        } else {
          fields += inputField('Malý nadpis', 'eyebrow', content.eyebrow, 'text');
          fields += inputField('Nadpis', 'title', content.title, 'text');
          fields += inputField('Text', 'body', content.body, 'textarea', 'Prázdný řádek vytvoří nový odstavec.');
          fields += imageField(block, 'image', 'Fotografie');
          fields += selectField('Rozložení', 'layout', content.layout, [['image-right','Fotografie vpravo'],['image-left','Fotografie vlevo'],['text-only','Jen text'],['image-wide','Široká fotografie']]);
          fields += selectField('Barevná nálada', 'theme', content.theme, [['paper','Světlý papír'],['cream','Teplá krémová'],['wood','Tmavé dřevo']]);
          fields += inputField('Text tlačítka (volitelné)', 'cta_label', content.cta_label, 'text');
          fields += inputField('Cíl tlačítka', 'cta_url', content.cta_url, 'url');
        }
        inspector.innerHTML = '<div class="homepage-inspector__header"><span>Upravujete blok</span><h2>' + escapeHtml(fixedLabels[block.id] || blockTitle(block)) + '</h2></div><div class="homepage-inspector__body">' + fields + '</div>';
      }

      function markDirty() {
        if (!state.loaded || state.busy) return;
        state.dirty = true;
        updateStatus();
      }

      function selectBlock(id, scroll) {
        state.selectedId = id;
        renderCards();
        renderInspector();
        if (scroll && window.innerWidth <= 1000) inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function moveBlock(id, direction) {
        if (!state.loaded || state.busy) return;
        var index = state.layout.blocks.findIndex(function(block) { return block.id === id; });
        var target = index + direction;
        if (index < 1 || target < 1 || target >= state.layout.blocks.length) return;
        var moved = state.layout.blocks.splice(index, 1)[0];
        state.layout.blocks.splice(target, 0, moved);
        markDirty();
        renderCards();
      }

      function toggleVisibility(block) {
        if (!state.loaded || state.busy) return;
        if (!block || block.id === 'hero') return;
        if (block.visible !== false && (block.id === 'products' || block.id === 'custom')) {
          var consequence = block.id === 'products' ? 'Skryjete celý katalog výrobků i jeho odkaz v menu.' : 'Skryjete zakázkovou výrobu, kontakt i mapu z hlavní stránky.';
          if (!window.confirm(consequence + '\\n\\nChcete pokračovat?')) return;
        }
        block.visible = block.visible === false;
        markDirty();
        renderCards();
        renderInspector();
      }

      function newStory(layout) {
        var uuid = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
        return { id: 'story-' + uuid.toLowerCase(), kind: 'story', label: 'Vlastní blok', visible: true, content: { eyebrow: 'Z naší dílny', title: 'Nový blok', body: 'Sem napište vlastní text. Můžete použít více odstavců.', image: { url: '', alt: '', media_id: '' }, layout: layout, theme: 'paper', cta_label: '', cta_url: '' } };
      }

      function addStory(layout) {
        if (!state.loaded || state.busy) return;
        if (state.layout.blocks.length >= 36) return setMessage('Dosáhli jste maximálního počtu bloků.', 'error');
        var block = newStory(layout);
        var selectedIndex = state.layout.blocks.findIndex(function(item) { return item.id === state.selectedId; });
        var insertAt = selectedIndex >= 0 ? selectedIndex + 1 : state.layout.blocks.length;
        state.layout.blocks.splice(insertAt, 0, block);
        state.selectedId = block.id;
        markDirty();
        renderCards();
        renderInspector();
        library.close();
        if (window.innerWidth <= 1000) inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function applyServerState(data) {
        state.layout = data.layout;
        state.revision = data.draft_revision;
        state.dirty = false;
        state.draftDiffers = Boolean(data.is_dirty);
        if (!blockById(state.selectedId)) state.selectedId = state.layout.blocks[0] && state.layout.blocks[0].id;
        renderCards();
        renderInspector();
        updateStatus();
      }

      function persist(url, successMessage) {
        if (!state.loaded || state.busy) return Promise.resolve();
        var dirtyBeforeRequest = state.dirty;
        setBusy(true);
        setMessage('', '');
        updateStatus();
        return requestJson(url, { method: url.indexOf('/draft') !== -1 ? 'PUT' : 'POST', body: JSON.stringify({ layout: state.layout, expected_revision: state.revision }) })
          .then(function(data) { applyServerState(data); setMessage(successMessage, 'success'); })
          .catch(function(error) {
            state.dirty = dirtyBeforeRequest;
            setStatus(error.status === 409 ? 'Novější verze v jiném okně' : 'Uložení se nepodařilo', 'is-error');
            setMessage(error.message, 'error');
          })
          .finally(function() {
            setBusy(false);
            if (!message.classList.contains('alert')) updateStatus();
          });
      }

      list.addEventListener('click', function(event) {
        if (!state.loaded || state.busy) return;
        var card = event.target.closest('[data-block-id]');
        var actionButton = event.target.closest('[data-action]');
        if (!card || !actionButton) return;
        var id = card.getAttribute('data-block-id');
        var block = blockById(id);
        var action = actionButton.getAttribute('data-action');
        if (action === 'edit') selectBlock(id, true);
        if (action === 'up') moveBlock(id, -1);
        if (action === 'down') moveBlock(id, 1);
        if (action === 'visibility') toggleVisibility(block);
        if (action === 'remove' && block && window.confirm('Odebrat tento vlastní blok z konceptu? Nahraná fotografie zůstane bezpečně v médiích.')) {
          var index = state.layout.blocks.indexOf(block);
          state.layout.blocks.splice(index, 1);
          state.selectedId = (state.layout.blocks[Math.max(0, index - 1)] || {}).id || '';
          markDirty();
          renderCards();
          renderInspector();
        }
      });

      list.addEventListener('dragstart', function(event) {
        if (!state.loaded || state.busy) return event.preventDefault();
        var card = event.target.closest('[data-block-id]');
        if (!card || card.getAttribute('data-block-id') === 'hero') return event.preventDefault();
        state.draggedId = card.getAttribute('data-block-id');
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
      });
      list.addEventListener('dragover', function(event) { if (state.draggedId) event.preventDefault(); });
      list.addEventListener('drop', function(event) {
        event.preventDefault();
        if (!state.loaded || state.busy) return;
        var targetCard = event.target.closest('[data-block-id]');
        if (!targetCard || !state.draggedId) return;
        var targetId = targetCard.getAttribute('data-block-id');
        if (targetId === 'hero' || targetId === state.draggedId) return;
        var from = state.layout.blocks.findIndex(function(block) { return block.id === state.draggedId; });
        var to = state.layout.blocks.findIndex(function(block) { return block.id === targetId; });
        var moved = state.layout.blocks.splice(from, 1)[0];
        state.layout.blocks.splice(to, 0, moved);
        markDirty();
        renderCards();
      });
      list.addEventListener('dragend', function() { state.draggedId = ''; renderCards(); });

      inspector.addEventListener('input', function(event) {
        if (!state.loaded || state.busy) return;
        var block = blockById(state.selectedId);
        if (!block) return;
        var key = event.target.getAttribute('data-content-key');
        var altSlot = event.target.getAttribute('data-image-alt');
        if (key) block.content[key] = event.target.value;
        if (altSlot) {
          var image = altSlot.indexOf('images.') === 0 ? block.content.images[Number(altSlot.split('.')[1])] : block.content.image;
          if (image) image.alt = event.target.value;
        }
        markDirty();
        renderCards();
      });

      inspector.addEventListener('change', function(event) {
        if (!state.loaded || state.busy) return;
        var uploadSlot = event.target.getAttribute('data-image-upload');
        if (!uploadSlot || !event.target.files || !event.target.files[0]) return;
        var block = blockById(state.selectedId);
        if (!block) return;
        var uploadInput = event.target;
        var blockId = block.id;
        var form = new FormData();
        form.append('image', uploadInput.files[0]);
        form.append('targetKey', 'homepage-' + block.id + '-' + uploadSlot.replace('.', '-'));
        form.append('targetLabel', fixedLabels[block.id] || blockTitle(block));
        var currentImage = uploadSlot.indexOf('images.') === 0 ? block.content.images[Number(uploadSlot.split('.')[1])] : block.content.image;
        form.append('alt', (currentImage && currentImage.alt) || blockTitle(block));
        setBusy(true);
        setStatus('Nahrávám fotografii…', 'is-dirty');
        fetch('/admin/api/site-content/photo-upload', { method: 'POST', body: form, headers: { Accept: 'application/json' } }).then(function(response) {
          return response.json().then(function(data) { if (!response.ok) throw new Error(data.error || 'Fotografii se nepodařilo nahrát.'); return data; });
        }).then(function(data) {
          var currentBlock = blockById(blockId);
          if (!currentBlock) throw new Error('Upravovaný blok už v konceptu není. Fotografii najdete v médiích.');
          var photo = data.photo || { media_id: data.media.id, url: data.media.public_url, alt: data.media.alt_text || '', caption: '' };
          if (uploadSlot.indexOf('images.') === 0) currentBlock.content.images[Number(uploadSlot.split('.')[1])] = photo;
          else currentBlock.content.image = photo;
          state.dirty = true;
          renderCards();
          renderInspector();
          setMessage('Fotografie je v konceptu. Uložte koncept nebo vše rovnou publikujte.', 'success');
        }).catch(function(error) {
          setStatus('Nahrání se nepodařilo', 'is-error');
          setMessage(error.message, 'error');
        }).finally(function() {
          uploadInput.value = '';
          setBusy(false);
          if (!message.classList.contains('alert')) updateStatus();
        });
      });

      inspector.addEventListener('click', function(event) {
        if (!state.loaded || state.busy) return;
        var slot = event.target.getAttribute('data-image-remove');
        if (!slot) return;
        var block = blockById(state.selectedId);
        if (!block) return;
        var empty = { url: '', alt: '', media_id: '' };
        if (slot.indexOf('images.') === 0) block.content.images[Number(slot.split('.')[1])] = empty;
        else block.content.image = empty;
        markDirty();
        renderCards();
        renderInspector();
      });

      document.querySelectorAll('[data-open-library]').forEach(function(button) { button.addEventListener('click', function() { if (state.loaded && !state.busy) library.showModal(); }); });
      document.querySelector('[data-close-library]').addEventListener('click', function() { library.close(); });
      library.addEventListener('click', function(event) { if (event.target === library) library.close(); });
      library.querySelectorAll('[data-template]').forEach(function(button) { button.addEventListener('click', function() { addStory(button.getAttribute('data-template')); }); });
      saveButton.addEventListener('click', function() { persist('/admin/api/homepage/draft', 'Koncept je bezpečně uložený. Živý web se nezměnil.'); });
      publishButton.addEventListener('click', function() {
        if (!state.loaded || state.busy) return;
        if (!window.confirm('Publikovat tento koncept na živý web? Návštěvníci změny uvidí ihned.')) return;
        persist('/admin/api/homepage/publish', 'Domovská stránka byla publikována.');
      });
      resetButton.addEventListener('click', function() {
        if (!state.loaded || state.busy) return;
        if (!window.confirm('Zahodit rozpracovaný koncept a vrátit se k právě publikované verzi?')) return;
        var dirtyBeforeRequest = state.dirty;
        setBusy(true);
        updateStatus();
        requestJson('/admin/api/homepage/reset-draft', { method: 'POST', body: JSON.stringify({ expected_revision: state.revision }) })
          .then(function(data) { applyServerState(data); setMessage('Koncept byl vrácen k živé verzi.', 'success'); })
          .catch(function(error) { state.dirty = dirtyBeforeRequest; setStatus('Obnovení se nepodařilo', 'is-error'); setMessage(error.message, 'error'); })
          .finally(function() { setBusy(false); if (!message.classList.contains('alert')) updateStatus(); });
      });
      window.addEventListener('beforeunload', function(event) { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

      function loadHomepage() {
        if (state.busy) return;
        state.loaded = false;
        retryButton.hidden = true;
        setBusy(true);
        setMessage('', '');
        setStatus('Načítám…');
        requestJson('/admin/api/homepage').then(function(data) {
          state.loaded = true;
          setBusy(false);
          applyServerState(data);
          if (!data.has_draft && !data.has_published_layout) setStatus('Připraveno – zatím neuloženo', 'is-dirty');
        }).catch(function(error) {
          state.loaded = false;
          setBusy(false);
          retryButton.hidden = false;
          setStatus('Načtení se nepodařilo', 'is-error');
          setMessage(error.message, 'error');
        });
      }

      retryButton.addEventListener('click', loadHomepage);
      loadHomepage();
    })();
    </script>
  `);
}

function productCategoriesAdminPage(session) {
  return adminLayout('Kategorie výrobků', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Kategorie výrobků</h1>
      <p>Kategorie rozdělují výrobky podle toho, co zákazník hledá.</p>
      <aside class="admin-guide" aria-label="Vysvětlení kategorií">
        <strong>Kategorie odpovídá na otázku „Co hledám?“</strong>
        <p>Například <strong>Stoly</strong>, <strong>Židle</strong> nebo <strong>Dekorace</strong>. Výrobek „Dubový jídelní stůl“ proto patří do kategorie <strong>Stoly</strong>.</p>
        <p>Vlastnosti výrobku, například dubový, rustikální nebo hnědý, patří do <a href="/admin/product-filters">filtrů výrobků</a>.</p>
      </aside>
      <div id="category-message" hidden></div>

      <div class="category-layout" id="category-app">
        <section class="category-panel">
          <h2 id="category-form-title">Nová kategorie</h2>
          <form id="category-form">
            <input type="hidden" id="category-id">
            <label>
              Název
              <input id="category-title" name="title" required autocomplete="off">
            </label>
            <input id="category-slug" name="slug" type="hidden" required autocomplete="off" pattern="[a-z0-9][a-z0-9-]*">
            <fieldset class="category-type-options">
              <legend>Typ kategorie</legend>
              <label class="category-type-option">
                <input type="radio" name="category_type" value="main" checked>
                <span><strong>Hlavní kategorie</strong><span>Nová samostatná skupina v hlavní nabídce výrobků.</span></span>
              </label>
              <label class="category-type-option">
                <input type="radio" name="category_type" value="subcategory">
                <span><strong>Podkategorie</strong><span>Nová podskupina uvnitř jedné existující hlavní kategorie.</span></span>
              </label>
            </fieldset>
            <label id="category-parent-field" hidden>
              Nadřazená hlavní kategorie
              <select id="category-parent-id" name="parent_id" disabled>
                <option value="">Vyberte hlavní kategorii</option>
              </select>
              <span class="product-meta" id="category-parent-help">Vyberte, do které hlavní kategorie má nová podkategorie patřit.</span>
            </label>
            <input id="category-sort-order" name="sort_order" type="hidden" value="0">
            <label>
              Zobrazení
              <span class="check-label">
                <input id="category-visible" name="is_visible" type="checkbox" checked>
                Zobrazit
              </span>
            </label>
            <input id="category-image-url" name="image_url" type="hidden">
            <input id="category-image-alt" name="image_alt" type="hidden">
            <input id="category-image-media-id" name="image_media_id" type="hidden">
            <div class="actions">
              <button class="button" type="submit">Uložit</button>
              <button class="button button--secondary" id="category-reset" type="button">Nová</button>
            </div>
          </form>
        </section>

        <section class="category-list">
          <div class="toolbar" style="margin-top:0;">
            <h2>Seznam kategorií</h2>
            <button class="button button--secondary button--small" id="category-reload" type="button">Načíst znovu</button>
          </div>
          <div id="categories-root" class="empty-state">Načítám kategorie...</div>
        </section>
      </div>
    </div>

    <script>
    (function() {
      var categories = [];
      var products = [];
      var editedId = '';
      var slugTouched = false;
      var form = document.getElementById('category-form');
      var formTitle = document.getElementById('category-form-title');
      var message = document.getElementById('category-message');
      var root = document.getElementById('categories-root');
      var idInput = document.getElementById('category-id');
      var titleInput = document.getElementById('category-title');
      var slugInput = document.getElementById('category-slug');
      var typeInputs = Array.from(document.querySelectorAll('input[name="category_type"]'));
      var parentField = document.getElementById('category-parent-field');
      var parentInput = document.getElementById('category-parent-id');
      var parentHelp = document.getElementById('category-parent-help');
      var sortOrderInput = document.getElementById('category-sort-order');
      var visibleInput = document.getElementById('category-visible');
      var imageUrlInput = document.getElementById('category-image-url');
      var imageAltInput = document.getElementById('category-image-alt');
      var imageMediaIdInput = document.getElementById('category-image-media-id');

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function slugify(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function setMessage(text, type) {
        message.hidden = !text;
        message.className = type === 'success' ? 'success' : 'alert';
        message.textContent = text || '';
      }

      function imageFromCategory(category) {
        return category && category.image && typeof category.image === 'object' ? category.image : {};
      }

      function payloadFromCategory(category, overrides) {
        var image = imageFromCategory(category);
        return Object.assign({
          title: category.title || '',
          slug: category.slug || '',
          parent_id: category.parent_id || '',
          description: category.description || '',
          sort_order: category.sort_order || 0,
          is_visible: category.is_visible === true,
          image_url: image.url || '',
          image_alt: image.alt || '',
          image_media_id: image.media_id || ''
        }, overrides || {});
      }

      function currentPayload() {
        var existing = categories.find(function(category) { return category.id === editedId; });
        var isSubcategory = typeInputs.some(function(input) { return input.checked && input.value === 'subcategory'; });
        return {
          title: titleInput.value.trim(),
          slug: slugInput.value.trim().toLowerCase(),
          parent_id: isSubcategory ? parentInput.value : '',
          description: existing && existing.description ? existing.description : '',
          sort_order: sortOrderInput.value,
          is_visible: visibleInput.checked,
          image_url: imageUrlInput.value.trim(),
          image_alt: imageAltInput.value.trim(),
          image_media_id: imageMediaIdInput.value.trim()
        };
      }

      function resetForm() {
        editedId = '';
        slugTouched = false;
        formTitle.textContent = 'Nová kategorie';
        idInput.value = '';
        form.reset();
        sortOrderInput.value = '0';
        visibleInput.checked = true;
        renderParentOptions('');
        setCategoryType('main');
        titleInput.focus();
      }

      function renderParentOptions(selectedId) {
        var options = '<option value="">Vyberte hlavní kategorii</option>';
        categories.forEach(function(category) {
          if (category.id === editedId || category.parent_id) return;
          options += '<option value="' + escapeHtml(category.id) + '"' + (category.id === selectedId ? ' selected' : '') + '>' + escapeHtml(category.title) + '</option>';
        });
        parentInput.innerHTML = options;
        parentInput.value = selectedId || '';
        updateParentHelp();
      }

      function setCategoryType(type) {
        var isSubcategory = type === 'subcategory';
        typeInputs.forEach(function(input) {
          input.checked = input.value === (isSubcategory ? 'subcategory' : 'main');
        });
        parentField.hidden = !isSubcategory;
        parentInput.disabled = !isSubcategory;
        parentInput.required = isSubcategory;
        if (!isSubcategory) parentInput.value = '';
        updateParentHelp();
      }

      function updateParentHelp() {
        var parent = categories.find(function(category) { return category.id === parentInput.value; });
        parentHelp.textContent = parent
          ? 'Tato kategorie bude uvnitř „' + parent.title + '“. Výrobky z ní se automaticky zobrazí také v hlavní kategorii „' + parent.title + '“.'
          : 'Vyberte, do které hlavní kategorie má nová podkategorie patřit.';
      }

      function categoryTitle(categoryId) {
        var category = categories.find(function(item) { return item.id === categoryId; });
        return category ? category.title : '';
      }

      function editCategory(category) {
        var image = imageFromCategory(category);
        editedId = category.id;
        slugTouched = true;
        formTitle.textContent = 'Upravit kategorii';
        idInput.value = category.id;
        titleInput.value = category.title || '';
        slugInput.value = category.slug || '';
        renderParentOptions(category.parent_id || '');
        setCategoryType(category.parent_id ? 'subcategory' : 'main');
        if (category.parent_id) parentInput.value = category.parent_id;
        updateParentHelp();
        sortOrderInput.value = category.sort_order || 0;
        visibleInput.checked = category.is_visible === true;
        imageUrlInput.value = image.url || '';
        imageAltInput.value = image.alt || '';
        imageMediaIdInput.value = image.media_id || '';
        titleInput.focus();
      }

      function statusBadges(category) {
        var badges = [];
        if (category.archived_at) {
          badges.push('<span class="badge badge--archived">Archiv</span>');
        } else if (category.is_visible) {
          badges.push('<span class="badge badge--ok">Viditelná</span>');
        } else {
          badges.push('<span class="badge badge--muted">Skrytá</span>');
        }
        return '<div class="badges">' + badges.join('') + '</div>';
      }

      function productsInCategory(category) {
        var categoryIds = [category.id];
        if (!category.parent_id) categories.forEach(function(child) { if (child.parent_id === category.id) categoryIds.push(child.id); });
        return products.filter(function(product) {
          return (product.category_ids || []).some(function(categoryId) { return categoryIds.indexOf(categoryId) !== -1; });
        });
      }

      function render() {
        if (!categories.length) {
          root.className = 'empty-state';
          root.innerHTML = 'Zatím tu nejsou žádné kategorie.';
          return;
        }

        root.className = '';
        root.innerHTML = categories.map(function(category) {
          var image = imageFromCategory(category);
          var thumb = image.url
            ? '<img class="category-thumb" src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || category.title) + '">'
            : '<div class="category-thumb category-thumb--empty">Bez obrázku</div>';
          var toggleLabel = category.is_visible ? 'Skrýt' : 'Zobrazit';
          var parentTitle = category.parent_id ? categoryTitle(category.parent_id) : '';
          var assignedProducts = productsInCategory(category);
          var productNames = assignedProducts.slice(0, 5).map(function(product) { return product.title; }).join(', ');
          var actionHtml = '<button class="button button--secondary button--small" type="button" data-action="toggle" data-id="' + escapeHtml(category.id) + '">' + toggleLabel + '</button>';

          return '<article class="category-row"' + (parentTitle ? ' style="margin-left:24px;border-left:4px solid #c9a96e;"' : '') + '>' +
            thumb +
            '<div class="category-main">' +
              '<div class="category-titleline"><strong>' + escapeHtml(category.title) + '</strong>' + statusBadges(category) + '</div>' +
              '<div class="category-meta">' + (parentTitle ? 'Podkategorie v: ' + escapeHtml(parentTitle) : 'Hlavní kategorie') + '</div>' +
              '<div class="category-meta"><strong>' + assignedProducts.length + '</strong> výrobků' + (productNames ? ': ' + escapeHtml(productNames) + (assignedProducts.length > 5 ? '…' : '') : '') + '</div>' +
              '<div class="category-actions">' +
                '<button class="button button--small" type="button" data-action="edit" data-id="' + escapeHtml(category.id) + '">Upravit</button>' +
                actionHtml +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      async function requestJson(url, options) {
        var response = await fetch(url, Object.assign({
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        }, options || {}));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.');
        return data;
      }

      async function loadCategories() {
        root.className = 'empty-state';
        root.textContent = 'Načítám kategorie...';
        var categoryData = await requestJson('/admin/api/product-categories');
        var productData = await requestJson('/admin/api/products').catch(function() { return { products: [] }; });
        categories = (categoryData.categories || []).filter(function(category) { return !category.archived_at; });
        products = (productData.products || []).filter(function(product) { return !product.archived_at; });
        renderParentOptions(parentInput.value);
        render();
      }

      function showCategoryLoadFailure() {
        setMessage('', 'success');
        root.className = 'empty-state';
        root.textContent = 'Kategorie se nepodařilo načíst. Zkuste to prosím znovu.';
      }

      async function saveCategory(payload, id) {
        var data = await requestJson(id ? '/admin/api/product-categories/' + encodeURIComponent(id) : '/admin/api/product-categories', {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        });
        setMessage('Kategorie byla uložena.', 'success');
        await loadCategories();
        editCategory(data.category);
      }

      async function archiveCategory(id) {
        if (!window.confirm('Skrýt tuto kategorii a přesunout ji do archivu? U produktů zůstane zachovaná.')) return;
        await requestJson('/admin/api/product-categories/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' });
        setMessage('Kategorie byla skryta a přesunuta do archivu.', 'success');
        await loadCategories();
        if (editedId === id) resetForm();
      }

      async function restoreCategory(id) {
        await requestJson('/admin/api/product-categories/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: '{}' });
        setMessage('Kategorie byla obnovena.', 'success');
        await loadCategories();
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        setMessage('', 'success');
        saveCategory(currentPayload(), editedId).catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      titleInput.addEventListener('input', function() {
        if (!slugTouched) slugInput.value = slugify(titleInput.value);
      });
      parentInput.addEventListener('change', updateParentHelp);
      typeInputs.forEach(function(input) {
        input.addEventListener('change', function() {
          if (input.checked) setCategoryType(input.value);
        });
      });

      slugInput.addEventListener('input', function() {
        slugTouched = true;
        slugInput.value = slugify(slugInput.value);
      });

      document.getElementById('category-reset').addEventListener('click', function() {
        setMessage('', 'success');
        resetForm();
      });

      document.getElementById('category-reload').addEventListener('click', function() {
        loadCategories().catch(showCategoryLoadFailure);
      });

      root.addEventListener('click', function(event) {
        var button = event.target.closest('[data-action]');
        if (!button) return;
        var id = button.dataset.id;
        var category = categories.find(function(item) { return item.id === id; });
        if (!category && button.dataset.action !== 'restore') return;

        if (button.dataset.action === 'edit') {
          editCategory(category);
        } else if (button.dataset.action === 'toggle') {
          if (category.is_visible) {
            archiveCategory(id).catch(function(error) { setMessage(error.message, 'error'); });
          } else {
            saveCategory(payloadFromCategory(category, { is_visible: true }), id)
              .catch(function(error) { setMessage(error.message, 'error'); });
          }
        }
      });

      loadCategories().catch(showCategoryLoadFailure);
    })();
    </script>
  `);
}

function blogCategoriesAdminPage(session) {
  return adminLayout('Kategorie blogu', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Kategorie blogu</h1>
      <p>Správa témat blogu pro pozdější filtrování a přiřazení článků.</p>
      <div id="category-message" hidden></div>

      <div class="category-layout" id="category-app">
        <section class="category-panel">
          <h2 id="category-form-title">Nová kategorie</h2>
          <form id="category-form">
            <input type="hidden" id="category-id">
            <label>
              Název
              <input id="category-title" name="title" required autocomplete="off">
            </label>
            <input id="category-slug" name="slug" type="hidden" required autocomplete="off" pattern="[a-z0-9][a-z0-9-]*">
            <label>
              Popis
              <textarea id="category-description" name="description"></textarea>
            </label>
            <input id="category-sort-order" name="sort_order" type="hidden" value="0">
            <label>
              Zobrazení
              <span class="check-label">
                <input id="category-visible" name="is_visible" type="checkbox" checked>
                Zobrazit
              </span>
            </label>
            <input id="category-image-url" name="image_url" type="hidden">
            <input id="category-image-alt" name="image_alt" type="hidden">
            <input id="category-image-media-id" name="image_media_id" type="hidden">
            <div class="actions">
              <button class="button" type="submit">Uložit</button>
              <button class="button button--secondary" id="category-reset" type="button">Nová</button>
            </div>
          </form>
        </section>

        <section class="category-list">
          <div class="toolbar" style="margin-top:0;">
            <h2>Seznam kategorií</h2>
            <button class="button button--secondary button--small" id="category-reload" type="button">Načíst znovu</button>
          </div>
          <div id="categories-root" class="empty-state">Načítám kategorie...</div>
        </section>
      </div>
    </div>

    <script>
    (function() {
      var categories = [];
      var editedId = '';
      var slugTouched = false;
      var form = document.getElementById('category-form');
      var formTitle = document.getElementById('category-form-title');
      var message = document.getElementById('category-message');
      var root = document.getElementById('categories-root');
      var idInput = document.getElementById('category-id');
      var titleInput = document.getElementById('category-title');
      var slugInput = document.getElementById('category-slug');
      var descriptionInput = document.getElementById('category-description');
      var sortOrderInput = document.getElementById('category-sort-order');
      var visibleInput = document.getElementById('category-visible');
      var imageUrlInput = document.getElementById('category-image-url');
      var imageAltInput = document.getElementById('category-image-alt');
      var imageMediaIdInput = document.getElementById('category-image-media-id');

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function slugify(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function setMessage(text, type) {
        message.hidden = !text;
        message.className = type === 'success' ? 'success' : 'alert';
        message.textContent = text || '';
      }

      function imageFromCategory(category) {
        return category && category.image && typeof category.image === 'object' ? category.image : {};
      }

      function payloadFromCategory(category, overrides) {
        var image = imageFromCategory(category);
        return Object.assign({
          title: category.title || '',
          slug: category.slug || '',
          description: category.description || '',
          sort_order: category.sort_order || 0,
          is_visible: category.is_visible === true,
          image_url: image.url || '',
          image_alt: image.alt || '',
          image_media_id: image.media_id || ''
        }, overrides || {});
      }

      function currentPayload() {
        return {
          title: titleInput.value.trim(),
          slug: slugInput.value.trim().toLowerCase(),
          description: descriptionInput.value.trim(),
          sort_order: sortOrderInput.value,
          is_visible: visibleInput.checked,
          image_url: imageUrlInput.value.trim(),
          image_alt: imageAltInput.value.trim(),
          image_media_id: imageMediaIdInput.value.trim()
        };
      }

      function resetForm() {
        editedId = '';
        slugTouched = false;
        formTitle.textContent = 'Nová kategorie';
        idInput.value = '';
        form.reset();
        sortOrderInput.value = '0';
        visibleInput.checked = true;
        titleInput.focus();
      }

      function editCategory(category) {
        var image = imageFromCategory(category);
        editedId = category.id;
        slugTouched = true;
        formTitle.textContent = 'Upravit kategorii';
        idInput.value = category.id;
        titleInput.value = category.title || '';
        slugInput.value = category.slug || '';
        descriptionInput.value = category.description || '';
        sortOrderInput.value = category.sort_order || 0;
        visibleInput.checked = category.is_visible === true;
        imageUrlInput.value = image.url || '';
        imageAltInput.value = image.alt || '';
        imageMediaIdInput.value = image.media_id || '';
        titleInput.focus();
      }

      function statusBadges(category) {
        var badges = [];
        if (category.archived_at) {
          badges.push('<span class="badge badge--archived">Archiv</span>');
        } else if (category.is_visible) {
          badges.push('<span class="badge badge--ok">Viditelná</span>');
        } else {
          badges.push('<span class="badge badge--muted">Skrytá</span>');
        }
        return '<div class="badges">' + badges.join('') + '</div>';
      }

      function render() {
        if (!categories.length) {
          root.className = 'empty-state';
          root.innerHTML = 'Zatím tu nejsou žádné kategorie blogu.';
          return;
        }

        root.className = '';
        root.innerHTML = categories.map(function(category) {
          var image = imageFromCategory(category);
          var thumb = image.url
            ? '<img class="category-thumb" src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt || category.title) + '">'
            : '<div class="category-thumb category-thumb--empty">Bez obrázku</div>';
          var toggleLabel = category.is_visible ? 'Skrýt' : 'Zobrazit';
          var actionHtml = '<button class="button button--secondary button--small" type="button" data-action="toggle" data-id="' + escapeHtml(category.id) + '">' + toggleLabel + '</button>';

          return '<article class="category-row">' +
            thumb +
            '<div class="category-main">' +
              '<div class="category-titleline"><strong>' + escapeHtml(category.title) + '</strong>' + statusBadges(category) + '</div>' +
              '<div class="category-meta">Téma blogu</div>' +
              (category.description ? '<p>' + escapeHtml(category.description) + '</p>' : '') +
              '<div class="category-actions">' +
                '<button class="button button--small" type="button" data-action="edit" data-id="' + escapeHtml(category.id) + '">Upravit</button>' +
                actionHtml +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      async function requestJson(url, options) {
        var response = await fetch(url, Object.assign({
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        }, options || {}));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.');
        return data;
      }

      async function loadCategories() {
        root.className = 'empty-state';
        root.textContent = 'Načítám kategorie...';
        var data = await requestJson('/admin/api/blog-categories');
        categories = (data.categories || []).filter(function(category) { return !category.archived_at; });
        render();
      }

      async function saveCategory(payload, id) {
        var data = await requestJson(id ? '/admin/api/blog-categories/' + encodeURIComponent(id) : '/admin/api/blog-categories', {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        });
        setMessage('Kategorie blogu byla uložena.', 'success');
        await loadCategories();
        editCategory(data.category);
      }

      async function archiveCategory(id) {
        if (!window.confirm('Skrýt tuto kategorii blogu a přesunout ji do archivu? U článků zůstane zachovaná.')) return;
        await requestJson('/admin/api/blog-categories/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' });
        setMessage('Kategorie blogu byla skryta a přesunuta do archivu.', 'success');
        await loadCategories();
        if (editedId === id) resetForm();
      }

      async function restoreCategory(id) {
        await requestJson('/admin/api/blog-categories/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: '{}' });
        setMessage('Kategorie blogu byla obnovena.', 'success');
        await loadCategories();
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        setMessage('', 'success');
        saveCategory(currentPayload(), editedId).catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      titleInput.addEventListener('input', function() {
        if (!slugTouched) slugInput.value = slugify(titleInput.value);
      });

      slugInput.addEventListener('input', function() {
        slugTouched = true;
        slugInput.value = slugify(slugInput.value);
      });

      document.getElementById('category-reset').addEventListener('click', function() {
        setMessage('', 'success');
        resetForm();
      });

      document.getElementById('category-reload').addEventListener('click', function() {
        loadCategories().catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      root.addEventListener('click', function(event) {
        var button = event.target.closest('[data-action]');
        if (!button) return;
        var id = button.dataset.id;
        var category = categories.find(function(item) { return item.id === id; });
        if (!category && button.dataset.action !== 'restore') return;

        if (button.dataset.action === 'edit') {
          editCategory(category);
        } else if (button.dataset.action === 'toggle') {
          if (category.is_visible) {
            archiveCategory(id).catch(function(error) { setMessage(error.message, 'error'); });
          } else {
            saveCategory(payloadFromCategory(category, { is_visible: true }), id)
              .catch(function(error) { setMessage(error.message, 'error'); });
          }
        }
      });

      loadCategories().catch(function(error) {
        setMessage(error.message, 'error');
        root.className = 'empty-state';
        root.textContent = 'Kategorie blogu se nepodařilo načíst.';
      });
    })();
    </script>
  `);
}

function productFiltersAdminPage(session) {
  return adminLayout('Filtry výrobků', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Vlastní filtry výrobků</h1>
      <p>Filtry pomáhají zákazníkovi zúžit nabídku podle vlastností výrobků.</p>
      <aside class="admin-guide" aria-label="Vysvětlení filtrů">
        <strong>Filtr odpovídá na otázku „Jaké to má být?“</strong>
        <p>Nejdřív vytvořte skupinu, například <strong>Materiál</strong>, a do ní možnosti <strong>Dub</strong>, <strong>Buk</strong> nebo <strong>Ořech</strong>. Další skupinou může být <strong>Styl</strong> s možnostmi <strong>Rustikální</strong> a <strong>Moderní</strong>.</p>
        <p>Příklad: „Dubový jídelní stůl“ patří do <a href="/admin/product-categories">kategorie Stoly</a>, ale může mít filtr <strong>Materiál → Dub</strong> a <strong>Styl → Rustikální</strong>.</p>
      </aside>
      <div id="filter-message" hidden></div>
      <div class="category-layout">
        <section class="category-panel">
          <h2 id="filter-form-title">Nová skupina filtru</h2>
          <form id="filter-form">
            <input id="filter-id" type="hidden">
            <label>Název skupiny<input id="filter-title" required placeholder="Např. Styl"></label>
            <input id="filter-slug" type="hidden">
            <label>Vysvětlení<textarea id="filter-description" placeholder="Co tímto filtrem zákazník vybírá"></textarea></label>
            <label><span class="check-label"><input id="filter-visible" type="checkbox" checked> Zobrazit filtr na webu</span></label>
            <div class="actions"><button class="button" type="submit">Uložit skupinu</button><button class="button button--secondary" id="filter-reset" type="button">Nová</button></div>
          </form>
          <hr style="margin:24px 0;border:0;border-top:1px solid var(--line)">
          <h2 id="option-form-title">Nová možnost filtru</h2>
          <form id="option-form">
            <input id="option-id" type="hidden">
            <label>Skupina filtru<select id="option-filter-id" required><option value="">Nejdřív vytvořte skupinu</option></select></label>
            <label>Název možnosti<input id="option-title" required placeholder="Např. Rustikální"></label>
            <input id="option-slug" type="hidden">
            <label><span class="check-label"><input id="option-visible" type="checkbox" checked> Zobrazit tuto možnost ve filtru na webu</span></label>
            <div class="actions"><button class="button" type="submit">Uložit možnost</button><button class="button button--secondary" id="option-reset" type="button">Nová</button></div>
          </form>
        </section>
        <section class="category-list"><h2>Vytvořené filtry</h2><div id="filters-root" class="empty-state">Načítám filtry…</div></section>
      </div>
    </div>
    <script>
    (function() {
      var filters = [], editedFilterId = '', editedOptionId = '';
      var message = document.getElementById('filter-message'), root = document.getElementById('filters-root');
      function esc(v) { return String(v || '').replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
      function slug(v) { return String(v || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
      function show(text, ok) { message.hidden = !text; message.className = ok ? 'success' : 'alert'; message.textContent = text || ''; }
      async function request(url, options) { var response = await fetch(url, Object.assign({headers:{'Content-Type':'application/json',Accept:'application/json'}}, options || {})); var data = await response.json(); if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.'); return data; }
      function resetFilter() { editedFilterId = ''; document.getElementById('filter-form').reset(); document.getElementById('filter-visible').checked = true; document.getElementById('filter-form-title').textContent = 'Nová skupina filtru'; }
      function resetOption() { editedOptionId = ''; document.getElementById('option-form').reset(); document.getElementById('option-visible').checked = true; document.getElementById('option-form-title').textContent = 'Nová možnost filtru'; renderSelect(); }
      function renderSelect(selected) { document.getElementById('option-filter-id').innerHTML = '<option value="">Vyberte skupinu</option>' + filters.map(function(filter) { return '<option value="' + esc(filter.id) + '"' + (filter.id === selected ? ' selected' : '') + '>' + esc(filter.title) + '</option>'; }).join(''); }
      function render() {
        if (!filters.length) { root.className = 'empty-state'; root.textContent = 'Zatím nejsou vytvořené žádné vlastní filtry.'; return; }
        root.className = ''; root.innerHTML = filters.map(function(filter) {
          return '<article class="category-row"><div class="category-main"><div class="category-titleline"><strong>' + esc(filter.title) + '</strong><span class="badge ' + (filter.is_visible ? 'badge--ok' : 'badge--muted') + '">' + (filter.is_visible ? 'Na webu' : 'Skrytý') + '</span></div>' + (filter.description ? '<p>' + esc(filter.description) + '</p>' : '') + '<div class="category-actions"><button class="button button--small" data-edit-filter="' + esc(filter.id) + '">Upravit skupinu</button></div><div style="margin-top:14px"><strong>Možnosti:</strong> ' + ((filter.options || []).length ? filter.options.map(function(option) { return '<button class="button button--secondary button--small" style="margin:4px" data-edit-option="' + esc(option.id) + '" data-filter-id="' + esc(filter.id) + '">' + esc(option.title) + (option.is_visible ? '' : ' (skrytá)') + '</button>'; }).join('') : '<span class="product-meta">zatím žádné</span>') + '</div></div></article>';
        }).join('');
      }
      async function load() { var data = await request('/admin/api/product-filters'); filters = data.filters || []; renderSelect(); render(); }
      document.getElementById('filter-form').addEventListener('submit', function(e) { e.preventDefault(); var body = {title:document.getElementById('filter-title').value.trim(),slug:slug(document.getElementById('filter-title').value),description:document.getElementById('filter-description').value.trim(),is_visible:document.getElementById('filter-visible').checked,sort_order:0}; request(editedFilterId ? '/admin/api/product-filters/' + editedFilterId : '/admin/api/product-filters', {method:editedFilterId?'PATCH':'POST',body:JSON.stringify(body)}).then(function(){show('Skupina filtru byla uložena.',true);resetFilter();return load();}).catch(function(error){show(error.message,false);}); });
      document.getElementById('option-form').addEventListener('submit', function(e) { e.preventDefault(); var filterId=document.getElementById('option-filter-id').value; var body={title:document.getElementById('option-title').value.trim(),slug:slug(document.getElementById('option-title').value),is_visible:document.getElementById('option-visible').checked,sort_order:0}; request('/admin/api/product-filters/' + filterId + '/options' + (editedOptionId ? '/' + editedOptionId : ''), {method:editedOptionId?'PATCH':'POST',body:JSON.stringify(body)}).then(function(){show('Možnost filtru byla uložena.',true);resetOption();return load();}).catch(function(error){show(error.message,false);}); });
      root.addEventListener('click', function(e) { var filterButton=e.target.closest('[data-edit-filter]'), optionButton=e.target.closest('[data-edit-option]'); if(filterButton){var filter=filters.find(function(item){return item.id===filterButton.dataset.editFilter;});if(!filter)return;editedFilterId=filter.id;document.getElementById('filter-form-title').textContent='Upravit skupinu filtru';document.getElementById('filter-title').value=filter.title;document.getElementById('filter-description').value=filter.description||'';document.getElementById('filter-visible').checked=filter.is_visible;} if(optionButton){var filter=filters.find(function(item){return item.id===optionButton.dataset.filterId;}), option=filter&&(filter.options||[]).find(function(item){return item.id===optionButton.dataset.editOption;});if(!option)return;editedOptionId=option.id;document.getElementById('option-form-title').textContent='Upravit možnost filtru';renderSelect(filter.id);document.getElementById('option-title').value=option.title;document.getElementById('option-visible').checked=option.is_visible;} });
      document.getElementById('filter-reset').onclick=resetFilter; document.getElementById('option-reset').onclick=resetOption; load().catch(function(error){show(error.message,false);});
    })();
    </script>
  `);
}

function productsAdminPage(session) {
  return adminLayout('Výrobky', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Výrobky</h1>
      <p>Správa výrobků, kategorií, více fotek a publikace pro veřejný web.</p>
      <div id="product-message" hidden></div>

      <div class="product-layout" id="product-app">
        <section class="product-panel">
          <h2 id="product-form-title">Nový výrobek</h2>
          <form id="product-form">
            <input type="hidden" id="product-id">
            <label>
              Název
              <input id="product-title" name="title" required autocomplete="off">
            </label>
            <input id="product-slug" name="slug" type="hidden" required autocomplete="off" pattern="[a-z0-9][a-z0-9-]*">
            <label>
              Krátký popis
              <textarea id="product-short-description" name="short_description"></textarea>
            </label>
            <label>
              Celý popis
              <textarea id="product-description" name="description"></textarea>
            </label>
            <input id="product-sort-order" name="sort_order" type="hidden" value="0">
            <input id="product-published-at" name="published_at" type="hidden">
            <label>
              Kategorie
              <div class="category-checks" id="product-category-checks">
                <span class="product-meta">Načítám kategorie...</span>
              </div>
            </label>
            <section class="filter-settings" aria-labelledby="product-filter-heading">
              <h3 id="product-filter-heading">Filtry pro hledání na webu</h3>
              <p>Vybrané možnosti se návštěvníkům automaticky nabídnou ve filtrování výrobků.</p>
              <div class="form-grid">
                <label>
                  Cena v Kč
                  <input id="product-price" name="price" type="number" min="0" step="1" placeholder="Nechte prázdné pro cenu na dotaz">
                </label>
                <label>
                  Dostupnost
                  <select id="product-availability" name="availability">
                    <option value="">Neuvedeno</option>
                    <option value="in_stock">Skladem</option>
                    <option value="made_to_order">Na objednávku</option>
                  </select>
                </label>
              </div>
              <label>
                Materiál / druh dřeva
                <input id="product-wood-types" name="wood_types" placeholder="Např. dub, buk, jasan">
                <span class="product-meta">Toto je filtr materiálu. Více hodnot oddělte čárkou.</span>
              </label>
              <label>
                Umístění
                <span class="category-checks">
                  <span class="check-label"><input id="product-use-interior" type="checkbox" value="interior"> Interiér</span>
                  <span class="check-label"><input id="product-use-exterior" type="checkbox" value="exterior"> Exteriér</span>
                </span>
              </label>
              <label>
                Další vlastní filtry
                <div class="category-checks" id="product-filter-checks">
                  <span class="product-meta">Načítám filtry...</span>
                </div>
                <span class="product-meta">Například Styl nebo Příležitost vytvoříte ve <a href="/admin/product-filters">Správě filtrů</a> a tady vyberete jejich možnosti.</span>
              </label>
            </section>

            <input id="product-photo-url" type="hidden">
            <input id="product-photo-alt" type="hidden">
            <input id="product-photo-media-id" type="hidden">
            <button class="button button--secondary button--small" id="product-add-photo" type="button" hidden>Přidat fotku</button>

            <label>Fotky</label>
            <input id="product-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
            <button class="button button--secondary button--small" id="product-upload-button" type="button">Nahrát fotku</button>

            <div class="photo-list" id="product-photos"></div>

            <div class="actions">
              <button class="button" type="submit" value="save">Uložit</button>
              <button class="button button--secondary" type="submit" value="publish">Publikovat</button>
            </div>
          </form>
        </section>

        <section class="product-list">
          <div class="toolbar" style="margin-top:0;">
            <h2>Seznam výrobků</h2>
            <button class="button button--secondary button--small" id="product-reload" type="button">Načíst znovu</button>
          </div>
          <div id="products-root" class="empty-state">Načítám výrobky...</div>
        </section>
      </div>
    </div>

    <script>
    (function() {
      var products = [];
      var categories = [];
      var customFilters = [];
      var photos = [];
      var editedId = '';
      var slugTouched = false;
      var requestedEditId = new URLSearchParams(window.location.search).get('edit') || '';
      var form = document.getElementById('product-form');
      var formTitle = document.getElementById('product-form-title');
      var message = document.getElementById('product-message');
      var root = document.getElementById('products-root');
      var idInput = document.getElementById('product-id');
      var titleInput = document.getElementById('product-title');
      var slugInput = document.getElementById('product-slug');
      var shortDescriptionInput = document.getElementById('product-short-description');
      var descriptionInput = document.getElementById('product-description');
      var priceInput = document.getElementById('product-price');
      var availabilityInput = document.getElementById('product-availability');
      var woodTypesInput = document.getElementById('product-wood-types');
      var useInteriorInput = document.getElementById('product-use-interior');
      var useExteriorInput = document.getElementById('product-use-exterior');
      var sortOrderInput = document.getElementById('product-sort-order');
      var publishedAtInput = document.getElementById('product-published-at');
      var categoryChecks = document.getElementById('product-category-checks');
      var filterChecks = document.getElementById('product-filter-checks');
      var photoUrlInput = document.getElementById('product-photo-url');
      var photoAltInput = document.getElementById('product-photo-alt');
      var photoMediaIdInput = document.getElementById('product-photo-media-id');
      var uploadInput = document.getElementById('product-upload');
      var photosRoot = document.getElementById('product-photos');

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function slugify(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function setMessage(text, type) {
        message.hidden = !text;
        message.className = type === 'success' ? 'success' : 'alert';
        message.textContent = text || '';
      }

      function firstPhoto(product) {
        var items = Array.isArray(product && product.photos) ? product.photos : [];
        return items.length ? items[0] : null;
      }

      function formatDateForInput(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      function selectedCategoryIds() {
        return Array.prototype.slice.call(categoryChecks.querySelectorAll('input[type="checkbox"]:checked'))
          .map(function(input) { return input.value; });
      }

      function selectedFilterOptionIds() {
        return Array.prototype.slice.call(filterChecks.querySelectorAll('input[type="checkbox"]:checked')).map(function(input) { return input.value; });
      }

      function currentPayload(publish) {
        return {
          title: titleInput.value.trim(),
          slug: slugInput.value.trim().toLowerCase(),
          short_description: shortDescriptionInput.value.trim(),
          description: descriptionInput.value.trim(),
          price: priceInput.value,
          availability: availabilityInput.value,
          wood_types: woodTypesInput.value.split(',').map(function(value) { return value.trim(); }).filter(Boolean),
          use_context: [useInteriorInput.checked ? 'interior' : '', useExteriorInput.checked ? 'exterior' : ''].filter(Boolean),
          photos: photos,
          category_ids: selectedCategoryIds(),
          filter_option_ids: selectedFilterOptionIds(),
          sort_order: sortOrderInput.value,
          is_visible: publish === true,
          is_published: publish === true,
          published_at: publishedAtInput.value
        };
      }

      function resetForm() {
        editedId = '';
        slugTouched = false;
        photos = [];
        formTitle.textContent = 'Nový výrobek';
        idInput.value = '';
        form.reset();
        sortOrderInput.value = '0';
        renderCategoryChecks([]);
        renderFilterChecks([]);
        renderPhotos();
        titleInput.focus();
      }

      function editProduct(product) {
        editedId = product.id;
        slugTouched = true;
        photos = Array.isArray(product.photos) ? product.photos.map(function(photo) { return Object.assign({}, photo); }) : [];
        formTitle.textContent = 'Upravit výrobek';
        idInput.value = product.id;
        titleInput.value = product.title || '';
        slugInput.value = product.slug || '';
        shortDescriptionInput.value = product.short_description || '';
        descriptionInput.value = product.description || '';
        priceInput.value = product.price == null ? '' : product.price;
        availabilityInput.value = product.availability || '';
        woodTypesInput.value = Array.isArray(product.wood_types) ? product.wood_types.join(', ') : '';
        useInteriorInput.checked = Array.isArray(product.use_context) && product.use_context.indexOf('interior') !== -1;
        useExteriorInput.checked = Array.isArray(product.use_context) && product.use_context.indexOf('exterior') !== -1;
        sortOrderInput.value = product.sort_order || 0;
        publishedAtInput.value = formatDateForInput(product.published_at);
        renderCategoryChecks(product.category_ids || []);
        renderFilterChecks(product.filter_option_ids || []);
        renderPhotos();
        titleInput.focus();
      }

      function renderCategoryChecks(selectedIds) {
        if (!categories.length) {
          categoryChecks.innerHTML = '<span class="product-meta">Nejdřív vytvořte kategorii výrobků.</span>';
          return;
        }
        var categoryById = {};
        categories.forEach(function(category) { categoryById[category.id] = category; });
        categoryChecks.innerHTML = categories.map(function(category) {
          var checked = selectedIds.indexOf(category.id) !== -1 ? ' checked' : '';
          var muted = category.archived_at ? ' (archiv)' : category.is_visible ? '' : ' (skrytá)';
          var parent = category.parent_id && categoryById[category.parent_id] ? categoryById[category.parent_id].title + ' / ' : '';
          return '<label class="check-label">' +
            '<input type="checkbox" value="' + escapeHtml(category.id) + '"' + checked + '>' +
            escapeHtml(parent + category.title + muted) +
          '</label>';
        }).join('');
      }

      function renderFilterChecks(selectedIds) {
        if (!customFilters.length) {
          filterChecks.innerHTML = '<span class="product-meta">Zatím nejsou vytvořené žádné vlastní filtry. <a href="/admin/product-filters">Vytvořit filtr</a></span>';
          return;
        }
        filterChecks.innerHTML = customFilters.filter(function(filter) { return !filter.archived_at; }).map(function(filter) {
          var options = (filter.options || []).filter(function(option) { return !option.archived_at; });
          return '<div><strong>' + escapeHtml(filter.title) + '</strong>' + (options.length ? options.map(function(option) {
            return '<label class="check-label"><input type="checkbox" value="' + escapeHtml(option.id) + '"' + (selectedIds.indexOf(option.id) !== -1 ? ' checked' : '') + '> ' + escapeHtml(option.title) + (option.is_visible ? '' : ' (skrytá)') + '</label>';
          }).join('') : '<div class="product-meta">Bez možností.</div>') + '</div>';
        }).join('');
      }

      function normalizePhotoOrder() {
        photos = photos.map(function(photo, index) {
          return Object.assign({}, photo, {
            sort_order: index,
            is_featured: index === 0
          });
        });
      }

      function renderPhotos() {
        normalizePhotoOrder();
        if (!photos.length) {
          photosRoot.innerHTML = '<div class="empty-state">Bez fotek.</div>';
          return;
        }
        photosRoot.innerHTML = photos.map(function(photo, index) {
          var thumb = photo.url
            ? '<img src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.alt || '') + '">'
            : '<div class="photo-row__empty">Bez náhledu</div>';
          return '<article class="photo-row" data-index="' + index + '">' +
            thumb +
            '<div class="photo-row__fields">' +
              '<input data-photo-field="url" type="hidden" value="' + escapeHtml(photo.url || '') + '">' +
              '<input data-photo-field="alt" type="hidden" value="' + escapeHtml(photo.alt || '') + '">' +
              '<label>Popisek fotky<input data-photo-field="caption" value="' + escapeHtml(photo.caption || '') + '" placeholder="Volitelné"></label>' +
              '<input data-photo-field="media_id" type="hidden" value="' + escapeHtml(photo.media_id || '') + '">' +
              '<div class="photo-row__buttons">' +
                '<button class="button button--secondary button--small" type="button" data-photo-action="up">Nahoru</button>' +
                '<button class="button button--secondary button--small" type="button" data-photo-action="down">Dolů</button>' +
                '<button class="button button--danger button--small" type="button" data-photo-action="remove">Odebrat</button>' +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      function statusBadges(product) {
        var badges = [];
        if (product.archived_at) {
          badges.push('<span class="badge badge--archived">Archiv</span>');
        }
        return '<div class="badges">' + badges.join('') + '</div>';
      }

      function renderProducts() {
        if (!products.length) {
          root.className = 'empty-state';
          root.innerHTML = 'Zatím tu nejsou žádné výrobky.';
          return;
        }

        root.className = '';
        root.innerHTML = products.map(function(product) {
          var photo = firstPhoto(product);
          var thumb = photo && photo.url
            ? '<img class="product-thumb" src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.alt || product.title) + '">'
            : '<div class="product-thumb product-thumb--empty">Bez fotky</div>';
          var categoryText = product.categories && product.categories.length
            ? product.categories.map(function(category) { return category.title; }).join(', ')
            : 'Bez kategorie';
          var filterText = product.filter_options && product.filter_options.length
            ? product.filter_options.map(function(option) { return (option.filter ? option.filter.title + ': ' : '') + option.title; }).join(', ')
            : '';
          var actionHtml = '<button class="button button--secondary button--small" type="button" data-action="hide" data-id="' + escapeHtml(product.id) + '">Skrýt</button>';

          return '<article class="product-row">' +
            thumb +
            '<div class="product-main">' +
              '<div class="product-titleline"><strong>' + escapeHtml(product.title) + '</strong>' + statusBadges(product) + '</div>' +
              '<div class="product-meta">Kategorie: ' + escapeHtml(categoryText) + '</div>' +
              (filterText ? '<div class="product-meta">Vlastní filtry: ' + escapeHtml(filterText) + '</div>' : '') +
              '<div class="product-meta">' + escapeHtml(product.availability === 'in_stock' ? 'Skladem' : product.availability === 'made_to_order' ? 'Na objednávku' : 'Dostupnost neuvedena') + (product.price != null ? ' · ' + Number(product.price).toLocaleString('cs-CZ') + ' Kč' : ' · Cena na dotaz') + '</div>' +
              (product.short_description ? '<p>' + escapeHtml(product.short_description) + '</p>' : '') +
              '<div class="product-actions">' +
                '<button class="button button--small" type="button" data-action="edit" data-id="' + escapeHtml(product.id) + '">Upravit</button>' +
                actionHtml +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      async function requestJson(url, options) {
        var response = await fetch(url, Object.assign({
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        }, options || {}));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.');
        return data;
      }

      async function loadData() {
        root.className = 'empty-state';
        root.textContent = 'Načítám výrobky...';
        var data = await requestJson('/admin/api/products');
        var allProducts = data.products || [];
        products = allProducts.filter(function(product) { return !product.archived_at && product.is_published; });
        categories = (data.categories || []).filter(function(category) { return !category.archived_at; });
        customFilters = data.filters || [];
        renderCategoryChecks(selectedCategoryIds());
        renderFilterChecks(selectedFilterOptionIds());
        renderProducts();
        if (requestedEditId) {
          var requestedProduct = allProducts.find(function(product) { return product.id === requestedEditId && !product.archived_at; });
          requestedEditId = '';
          window.history.replaceState({}, '', '/admin/products');
          if (requestedProduct) editProduct(requestedProduct);
        }
      }

      async function saveProduct(payload, id, publish) {
        var data = await requestJson(id ? '/admin/api/products/' + encodeURIComponent(id) : '/admin/api/products', {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        });
        setMessage(publish ? 'Výrobek byl publikován na webu.' : 'Výrobek byl uložen do sekce Uložené v archivu.', 'success');
        await loadData();
        if (publish) {
          editProduct(data.product);
        } else {
          resetForm();
        }
      }

      async function archiveProduct(id) {
        if (!window.confirm('Skrýt tento výrobek a přesunout ho do archivu? Zůstane bezpečně uložený.')) return;
        await requestJson('/admin/api/products/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' });
        setMessage('Výrobek byl skryt a přesunut do archivu.', 'success');
        await loadData();
        if (editedId === id) resetForm();
      }

      async function restoreProduct(id) {
        await requestJson('/admin/api/products/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: '{}' });
        setMessage('Výrobek byl obnoven.', 'success');
        await loadData();
      }

      async function uploadPhoto(selectedFile) {
        var file = selectedFile || (uploadInput.files && uploadInput.files[0]);
        if (!file) throw new Error('Vyberte fotku k nahrání.');
        var body = new FormData();
        body.append('image', file);
        body.append('targetLabel', titleInput.value.trim() || slugInput.value.trim() || 'Výrobek');
        body.append('targetKey', slugInput.value.trim() || slugify(titleInput.value) || 'vyrobek');
        body.append('alt', photoAltInput.value.trim() || titleInput.value.trim());
        var response = await fetch('/admin/api/products/photo-upload', {
          method: 'POST',
          body: body,
          headers: { Accept: 'application/json' }
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nahrání se nepodařilo.');
        photos.push(data.photo);
        uploadInput.value = '';
        renderPhotos();
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        setMessage('', 'success');
        var publish = Boolean(event.submitter && event.submitter.value === 'publish');
        saveProduct(currentPayload(publish), editedId, publish).catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      titleInput.addEventListener('input', function() {
        if (!slugTouched) slugInput.value = slugify(titleInput.value);
      });

      slugInput.addEventListener('input', function() {
        slugTouched = true;
        slugInput.value = slugify(slugInput.value);
      });

      document.getElementById('product-reload').addEventListener('click', function() {
        loadData().catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      document.getElementById('product-add-photo').addEventListener('click', function() {
        var url = photoUrlInput.value.trim();
        var mediaId = photoMediaIdInput.value.trim();
        if (!url && !mediaId) {
          setMessage('Vyberte fotku k nahrání.', 'error');
          return;
        }
        photos.push({
          media_id: mediaId,
          url: url,
          alt: photoAltInput.value.trim(),
          caption: '',
          sort_order: photos.length,
          is_featured: photos.length === 0
        });
        photoUrlInput.value = '';
        photoAltInput.value = '';
        photoMediaIdInput.value = '';
        renderPhotos();
      });

      var uploadButton = document.getElementById('product-upload-button');
      uploadButton.addEventListener('click', function() {
        uploadInput.click();
      });

      uploadInput.addEventListener('change', function() {
        if (!uploadInput.files || !uploadInput.files[0]) return;
        var selectedFiles = Array.prototype.slice.call(uploadInput.files);
        uploadButton.disabled = true;
        uploadButton.textContent = 'Nahrávám…';
        setMessage(selectedFiles.length > 1 ? 'Nahrávám fotky...' : 'Nahrávám fotku...', 'success');
        selectedFiles.reduce(function(promise, file) {
          return promise.then(function() { return uploadPhoto(file); });
        }, Promise.resolve()).then(function() {
          setMessage(selectedFiles.length > 1 ? 'Fotky byly přidány. Nezapomeňte výrobek uložit.' : 'Fotka byla přidána. Nezapomeňte výrobek uložit.', 'success');
        }).catch(function(error) {
          setMessage(error.message, 'error');
        }).finally(function() {
          uploadButton.disabled = false;
          uploadButton.textContent = 'Nahrát fotku';
        });
      });

      photosRoot.addEventListener('input', function(event) {
        var field = event.target.getAttribute('data-photo-field');
        if (!field) return;
        var row = event.target.closest('[data-index]');
        var index = Number(row && row.dataset.index);
        if (!Number.isFinite(index) || !photos[index]) return;
        photos[index][field] = event.target.value;
      });

      photosRoot.addEventListener('click', function(event) {
        var action = event.target.getAttribute('data-photo-action');
        if (!action) return;
        var row = event.target.closest('[data-index]');
        var index = Number(row && row.dataset.index);
        if (!Number.isFinite(index) || !photos[index]) return;
        if (action === 'remove') {
          photos.splice(index, 1);
        } else if (action === 'up' && index > 0) {
          var up = photos[index - 1];
          photos[index - 1] = photos[index];
          photos[index] = up;
        } else if (action === 'down' && index < photos.length - 1) {
          var down = photos[index + 1];
          photos[index + 1] = photos[index];
          photos[index] = down;
        }
        renderPhotos();
      });

      root.addEventListener('click', function(event) {
        var button = event.target.closest('[data-action]');
        if (!button) return;
        var id = button.dataset.id;
        var product = products.find(function(item) { return item.id === id; });
        if (!product && button.dataset.action !== 'restore') return;

        if (button.dataset.action === 'edit') {
          editProduct(product);
        } else if (button.dataset.action === 'hide') {
          archiveProduct(id).catch(function(error) { setMessage(error.message, 'error'); });
        }
      });

      loadData().catch(function(error) {
        setMessage(error.message, 'error');
        root.className = 'empty-state';
        root.textContent = 'Výrobky se nepodařilo načíst.';
      });
    })();
    </script>
  `);
}

function blogPostsAdminPage(session) {
  return adminLayout('Články blogu', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Články blogu</h1>
      <p>Správa článků, více fotek, kategorií a publikace pro blog.</p>
      <div id="blog-message" hidden></div>

      <div class="blog-layout" id="blog-app">
        <section class="blog-panel">
          <h2 id="blog-form-title">Nový článek</h2>
          <form id="blog-form">
            <input type="hidden" id="blog-id">
            <label>
              Název
              <input id="blog-title" name="title" required autocomplete="off">
            </label>
            <input id="blog-slug" name="slug" type="hidden" required autocomplete="off" pattern="[a-z0-9][a-z0-9-]*">
            <label>
              Krátký úvod
              <textarea id="blog-excerpt" name="excerpt"></textarea>
            </label>
            <label>
              Obsah článku
              <textarea id="blog-main-content" name="main_content" style="min-height:180px;"></textarea>
            </label>
            <select id="blog-content-format" name="content_format" hidden>
              <option value="html">Běžný text</option>
            </select>
            <input id="blog-sort-order" name="sort_order" type="hidden" value="0">
            <input id="blog-published-at" name="published_at" type="hidden">
            <input id="blog-status" name="status" type="hidden" value="draft">

            <input id="blog-photo-url" type="hidden">
            <input id="blog-photo-alt" type="hidden">
            <input id="blog-photo-media-id" type="hidden">
            <button class="button button--secondary button--small" id="blog-add-photo" type="button" hidden>Přidat fotku</button>

            <fieldset style="margin:0; border:1px solid var(--line); border-radius:8px; padding:16px;">
              <legend style="padding:0 8px; font-weight:700;">Fotky článku</legend>
              <p style="margin-bottom:12px; font-size:0.88rem;">Můžete vybrat jednu nebo více fotografií ve formátu JPG, PNG, WebP nebo GIF.</p>
              <input id="blog-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
              <button class="button button--secondary" id="blog-upload-button" type="button" style="width:100%;">Vybrat a nahrát fotky</button>
              <div class="photo-list" id="blog-photos"></div>
            </fieldset>

            <label>
              Kategorie
              <div class="category-checks" id="blog-category-checks">
                <span class="blog-meta">Načítám kategorie...</span>
              </div>
            </label>

            <div class="actions">
              <button class="button" type="submit" value="save">Uložit</button>
              <button class="button button--secondary" type="submit" value="publish">Publikovat</button>
            </div>
          </form>
        </section>

        <section class="blog-list">
          <div class="toolbar" style="margin-top:0;">
            <h2>Seznam článků</h2>
            <button class="button button--secondary button--small" id="blog-reload" type="button">Načíst znovu</button>
          </div>
          <div id="blog-posts-root" class="empty-state">Načítám články...</div>
        </section>
      </div>
    </div>

    <script>
    (function() {
      var posts = [];
      var categories = [];
      var photos = [];
      var editedId = '';
      var slugTouched = false;
      var requestedEditId = new URLSearchParams(window.location.search).get('edit') || '';
      var form = document.getElementById('blog-form');
      var formTitle = document.getElementById('blog-form-title');
      var message = document.getElementById('blog-message');
      var root = document.getElementById('blog-posts-root');
      var idInput = document.getElementById('blog-id');
      var titleInput = document.getElementById('blog-title');
      var slugInput = document.getElementById('blog-slug');
      var excerptInput = document.getElementById('blog-excerpt');
      var mainContentInput = document.getElementById('blog-main-content');
      var contentFormatInput = document.getElementById('blog-content-format');
      var sortOrderInput = document.getElementById('blog-sort-order');
      var publishedAtInput = document.getElementById('blog-published-at');
      var statusInput = document.getElementById('blog-status');
      var categoryChecks = document.getElementById('blog-category-checks');
      var photoUrlInput = document.getElementById('blog-photo-url');
      var photoAltInput = document.getElementById('blog-photo-alt');
      var photoMediaIdInput = document.getElementById('blog-photo-media-id');
      var uploadInput = document.getElementById('blog-upload');
      var photosRoot = document.getElementById('blog-photos');

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
      }

      function slugify(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      function setMessage(text, type) {
        message.hidden = !text;
        message.className = type === 'success' ? 'success' : 'alert';
        message.textContent = text || '';
      }

      function firstPhoto(post) {
        var items = Array.isArray(post && post.photos) ? post.photos : [];
        return items.length ? items[0] : null;
      }

      function formatDateForInput(value) {
        if (!value) return '';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      function selectedCategoryIds() {
        return Array.prototype.slice.call(categoryChecks.querySelectorAll('input[type="checkbox"]:checked'))
          .map(function(input) { return input.value; });
      }

      function currentPayload(publish) {
        return {
          title: titleInput.value.trim(),
          slug: slugInput.value.trim().toLowerCase(),
          excerpt: excerptInput.value.trim(),
          main_content: mainContentInput.value.trim(),
          content_format: contentFormatInput.value,
          author_name: '',
          photos: photos,
          category_ids: selectedCategoryIds(),
          status: publish === true ? 'published' : 'draft',
          published_at: publishedAtInput.value,
          sort_order: sortOrderInput.value
        };
      }

      function resetForm() {
        editedId = '';
        slugTouched = false;
        photos = [];
        formTitle.textContent = 'Nový článek';
        idInput.value = '';
        form.reset();
        sortOrderInput.value = '0';
        contentFormatInput.value = 'html';
        statusInput.value = 'draft';
        renderCategoryChecks([]);
        renderPhotos();
        titleInput.focus();
      }

      function editPost(post) {
        editedId = post.id;
        slugTouched = true;
        photos = Array.isArray(post.photos) ? post.photos.map(function(photo) { return Object.assign({}, photo); }) : [];
        formTitle.textContent = 'Upravit článek';
        idInput.value = post.id;
        titleInput.value = post.title || '';
        slugInput.value = post.slug || '';
        excerptInput.value = post.excerpt || '';
        mainContentInput.value = post.main_content || '';
        contentFormatInput.value = post.content_format || 'html';
        sortOrderInput.value = post.sort_order || 0;
        publishedAtInput.value = formatDateForInput(post.published_at);
        statusInput.value = post.status || 'draft';
        renderCategoryChecks(post.category_ids || []);
        renderPhotos();
        titleInput.focus();
      }

      function renderCategoryChecks(selectedIds) {
        if (!categories.length) {
          categoryChecks.innerHTML = '<span class="blog-meta">Nejdřív vytvořte kategorii blogu.</span>';
          return;
        }
        categoryChecks.innerHTML = categories.map(function(category) {
          var checked = selectedIds.indexOf(category.id) !== -1 ? ' checked' : '';
          var muted = category.archived_at ? ' (archiv)' : category.is_visible ? '' : ' (skrytá)';
          return '<label class="check-label">' +
            '<input type="checkbox" value="' + escapeHtml(category.id) + '"' + checked + '>' +
            escapeHtml(category.title + muted) +
          '</label>';
        }).join('');
      }

      function normalizePhotoOrder() {
        photos = photos.map(function(photo, index) {
          return Object.assign({}, photo, {
            sort_order: index,
            is_featured: index === 0
          });
        });
      }

      function renderPhotos() {
        normalizePhotoOrder();
        if (!photos.length) {
          photosRoot.innerHTML = '<div class="empty-state">Bez fotek.</div>';
          return;
        }
        photosRoot.innerHTML = photos.map(function(photo, index) {
          var thumb = photo.url
            ? '<img src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.alt || '') + '">'
            : '<div class="photo-row__empty">Bez náhledu</div>';
          return '<article class="photo-row" data-index="' + index + '">' +
            thumb +
            '<div class="photo-row__fields">' +
              '<input data-photo-field="url" type="hidden" value="' + escapeHtml(photo.url || '') + '">' +
              '<input data-photo-field="alt" type="hidden" value="' + escapeHtml(photo.alt || '') + '">' +
              '<label>Popisek fotky<input data-photo-field="caption" value="' + escapeHtml(photo.caption || '') + '" placeholder="Volitelné"></label>' +
              '<input data-photo-field="media_id" type="hidden" value="' + escapeHtml(photo.media_id || '') + '">' +
              '<div class="photo-row__buttons">' +
                '<button class="button button--secondary button--small" type="button" data-photo-action="up">Nahoru</button>' +
                '<button class="button button--secondary button--small" type="button" data-photo-action="down">Dolů</button>' +
                '<button class="button button--danger button--small" type="button" data-photo-action="remove">Odebrat</button>' +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      function statusBadges(post) {
        var badges = [];
        if (post.status === 'archived') {
          badges.push('<span class="badge badge--archived">Archiv</span>');
        } else if (post.status === 'published') {
          badges.push('<span class="badge badge--ok">Publikovaný</span>');
        } else {
          badges.push('<span class="badge badge--muted">Koncept</span>');
        }
        return '<div class="badges">' + badges.join('') + '</div>';
      }

      function renderPosts() {
        if (!posts.length) {
          root.className = 'empty-state';
          root.innerHTML = 'Zatím tu nejsou žádné články.';
          return;
        }

        root.className = '';
        root.innerHTML = posts.map(function(post) {
          var photo = firstPhoto(post);
          var thumb = photo && photo.url
            ? '<img class="blog-thumb" src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.alt || post.title) + '">'
            : '<div class="blog-thumb blog-thumb--empty">Bez fotky</div>';
          var categoryText = post.categories && post.categories.length
            ? post.categories.map(function(category) { return category.title; }).join(', ')
            : 'Bez kategorie';
          var actionHtml = '<button class="button button--secondary button--small" type="button" data-action="hide" data-id="' + escapeHtml(post.id) + '">Skrýt</button>';

          return '<article class="blog-row">' +
            thumb +
            '<div class="blog-main">' +
              '<div class="blog-titleline"><strong>' + escapeHtml(post.title) + '</strong>' + statusBadges(post) + '</div>' +
              '<div class="blog-meta">Kategorie: ' + escapeHtml(categoryText) + '</div>' +
              (post.excerpt ? '<p>' + escapeHtml(post.excerpt) + '</p>' : '') +
              '<div class="blog-actions">' +
                '<button class="button button--small" type="button" data-action="edit" data-id="' + escapeHtml(post.id) + '">Upravit</button>' +
                actionHtml +
              '</div>' +
            '</div>' +
          '</article>';
        }).join('');
      }

      async function requestJson(url, options) {
        var response = await fetch(url, Object.assign({
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        }, options || {}));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Požadavek se nepodařil.');
        return data;
      }

      async function loadData() {
        root.className = 'empty-state';
        root.textContent = 'Načítám články...';
        var data = await requestJson('/admin/api/blog-posts');
        var allPosts = data.posts || [];
        posts = allPosts.filter(function(post) { return post.status === 'published'; });
        categories = (data.categories || []).filter(function(category) { return !category.archived_at; });
        renderCategoryChecks(selectedCategoryIds());
        renderPosts();
        if (requestedEditId) {
          var requestedPost = allPosts.find(function(post) { return post.id === requestedEditId && post.status !== 'archived'; });
          requestedEditId = '';
          window.history.replaceState({}, '', '/admin/blog-posts');
          if (requestedPost) editPost(requestedPost);
        }
      }

      async function savePost(payload, id, publish) {
        var data = await requestJson(id ? '/admin/api/blog-posts/' + encodeURIComponent(id) : '/admin/api/blog-posts', {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        });
        setMessage(publish ? 'Článek byl publikován na webu.' : 'Článek byl uložen do sekce Uložené v archivu.', 'success');
        await loadData();
        if (publish) {
          editPost(data.post);
        } else {
          resetForm();
        }
      }

      async function archivePost(id) {
        if (!window.confirm('Skrýt tento článek a přesunout ho do archivu? Zůstane bezpečně uložený.')) return;
        await requestJson('/admin/api/blog-posts/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' });
        setMessage('Článek byl skryt a přesunut do archivu.', 'success');
        await loadData();
        if (editedId === id) resetForm();
      }

      async function restorePost(id) {
        await requestJson('/admin/api/blog-posts/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: '{}' });
        setMessage('Článek byl obnoven jako koncept.', 'success');
        await loadData();
      }

      async function uploadPhoto(selectedFile) {
        var file = selectedFile || (uploadInput.files && uploadInput.files[0]);
        if (!file) throw new Error('Vyberte fotku k nahrání.');
        var body = new FormData();
        body.append('image', file);
        body.append('targetLabel', titleInput.value.trim() || slugInput.value.trim() || 'Článek');
        body.append('targetKey', slugInput.value.trim() || slugify(titleInput.value) || 'clanek');
        body.append('alt', photoAltInput.value.trim() || titleInput.value.trim());
        var response = await fetch('/admin/api/blog-posts/photo-upload', {
          method: 'POST',
          body: body,
          headers: { Accept: 'application/json' }
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nahrání se nepodařilo.');
        photos.push(data.photo);
        uploadInput.value = '';
        renderPhotos();
      }

      form.addEventListener('submit', function(event) {
        event.preventDefault();
        setMessage('', 'success');
        var publish = Boolean(event.submitter && event.submitter.value === 'publish');
        savePost(currentPayload(publish), editedId, publish).catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      titleInput.addEventListener('input', function() {
        if (!slugTouched) slugInput.value = slugify(titleInput.value);
      });

      slugInput.addEventListener('input', function() {
        slugTouched = true;
        slugInput.value = slugify(slugInput.value);
      });

      document.getElementById('blog-reload').addEventListener('click', function() {
        loadData().catch(function(error) {
          setMessage(error.message, 'error');
        });
      });

      document.getElementById('blog-add-photo').addEventListener('click', function() {
        var url = photoUrlInput.value.trim();
        var mediaId = photoMediaIdInput.value.trim();
        if (!url && !mediaId) {
          setMessage('Vyberte fotku k nahrání.', 'error');
          return;
        }
        photos.push({
          media_id: mediaId,
          url: url,
          alt: photoAltInput.value.trim(),
          caption: '',
          sort_order: photos.length,
          is_featured: photos.length === 0
        });
        photoUrlInput.value = '';
        photoAltInput.value = '';
        photoMediaIdInput.value = '';
        renderPhotos();
      });

      var uploadButton = document.getElementById('blog-upload-button');
      uploadButton.addEventListener('click', function() {
        uploadInput.click();
      });

      uploadInput.addEventListener('change', function() {
        if (!uploadInput.files || !uploadInput.files[0]) return;
        var selectedFiles = Array.prototype.slice.call(uploadInput.files);
        uploadButton.disabled = true;
        uploadButton.textContent = 'Nahrávám…';
        setMessage(selectedFiles.length > 1 ? 'Nahrávám fotky...' : 'Nahrávám fotku...', 'success');
        selectedFiles.reduce(function(promise, file) {
          return promise.then(function() { return uploadPhoto(file); });
        }, Promise.resolve()).then(function() {
          setMessage(selectedFiles.length > 1 ? 'Fotky byly přidány. Nezapomeňte článek uložit.' : 'Fotka byla přidána. Nezapomeňte článek uložit.', 'success');
        }).catch(function(error) {
          setMessage(error.message, 'error');
        }).finally(function() {
          uploadButton.disabled = false;
          uploadButton.textContent = 'Vybrat a nahrát fotky';
        });
      });

      photosRoot.addEventListener('input', function(event) {
        var field = event.target.getAttribute('data-photo-field');
        if (!field) return;
        var row = event.target.closest('[data-index]');
        var index = Number(row && row.dataset.index);
        if (!Number.isFinite(index) || !photos[index]) return;
        photos[index][field] = event.target.value;
      });

      photosRoot.addEventListener('click', function(event) {
        var action = event.target.getAttribute('data-photo-action');
        if (!action) return;
        var row = event.target.closest('[data-index]');
        var index = Number(row && row.dataset.index);
        if (!Number.isFinite(index) || !photos[index]) return;
        if (action === 'remove') {
          photos.splice(index, 1);
        } else if (action === 'up' && index > 0) {
          var up = photos[index - 1];
          photos[index - 1] = photos[index];
          photos[index] = up;
        } else if (action === 'down' && index < photos.length - 1) {
          var down = photos[index + 1];
          photos[index + 1] = photos[index];
          photos[index] = down;
        }
        renderPhotos();
      });

      root.addEventListener('click', function(event) {
        var button = event.target.closest('[data-action]');
        if (!button) return;
        var id = button.dataset.id;
        var post = posts.find(function(item) { return item.id === id; });
        if (!post && button.dataset.action !== 'restore') return;

        if (button.dataset.action === 'edit') {
          editPost(post);
        } else if (button.dataset.action === 'hide') {
          archivePost(id).catch(function(error) { setMessage(error.message, 'error'); });
        }
      });

      loadData().catch(function(error) {
        setMessage(error.message, 'error');
        root.className = 'empty-state';
        root.textContent = 'Články se nepodařilo načíst.';
      });
    })();
    </script>
  `);
}

function getSafeAdminNext(next) {
  return next && next.startsWith('/admin') && next !== '/admin/login'
    ? next
    : '/admin';
}

function buildGoogleAuthUrl(req, next) {
  const oauthState = createOauthState(next);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', `${getBaseUrl(req)}/admin/oauth/google/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', oauthState.state);
  authUrl.searchParams.set('prompt', 'select_account');
  if (GOOGLE_ALLOWED_EMAIL) authUrl.searchParams.set('login_hint', GOOGLE_ALLOWED_EMAIL);

  return { ...oauthState, url: authUrl.toString() };
}

async function requestGoogleToken(req, code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: `${getBaseUrl(req)}/admin/oauth/google/callback`,
    grant_type: 'authorization_code'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed');
  }
  return data;
}

async function requestGoogleUser(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Google user lookup failed');
  }
  return data;
}

async function parseJsonBody(req) {
  const body = await getRawBody(req, 1024 * 1024);
  if (!body.length) return {};
  return JSON.parse(body.toString('utf8'));
}

function normalizeSupabaseError(error) {
  if (error && error.code === '23505') return 'Tento název už používá jiná položka.';
  if (error && error.message) return error.message;
  return 'Požadavek na Supabase se nepodařil.';
}

async function supabaseRequest(table, { method = 'GET', query = {}, body, prefer = '' } = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase není nastavený. Doplňte SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.');
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(normalizeSupabaseError(data));
    error.statusCode = response.status;
    error.code = data && data.code;
    error.details = data;
    throw error;
  }

  return data;
}

async function supabaseStorageRequest(pathname, { method = 'GET', headers = {}, body } = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase není nastavený. Doplňte SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await fetch(`${SUPABASE_URL}/storage/v1/${pathname}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers
    },
    body
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(normalizeSupabaseError(data));
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function uploadSupabaseStorageObject(bucket, storagePath, file) {
  await supabaseStorageRequest(`object/${encodeURIComponent(bucket)}/${storagePathForPublicUrl(storagePath)}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.mime_type,
      'Cache-Control': '31536000',
      'x-upsert': 'false'
    },
    body: file.buffer
  });
}

async function deleteSupabaseStorageObject(media) {
  if (!media || !media.bucket || !media.storage_path || media.bucket === 'local' || media.bucket === 'static') return;
  await supabaseStorageRequest(`object/${encodeURIComponent(media.bucket)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [media.storage_path] })
  });
}

function normalizeOptionalImageUrl(value) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) return '';
  if (imageUrl.startsWith('/')) return imageUrl;

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch (error) {
    throw new Error('URL obrázku musí začínat /, http:// nebo https://.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL obrázku musí začínat /, http:// nebo https://.');
  }
  return imageUrl;
}

function normalizeOptionalCategoryParentId(input) {
  const raw = input.parent_id === undefined ? input.parentId : input.parent_id;
  const parentId = String(raw || '').trim();
  if (!parentId) return null;
  assertUuid(parentId);
  return parentId;
}

function normalizeProductCategoryInput(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const description = String(input.description || '').trim();
  const sortOrderRaw = input.sort_order === undefined ? input.sortOrder : input.sort_order;
  const sortOrder = Number.parseInt(sortOrderRaw === undefined || sortOrderRaw === '' ? '0' : String(sortOrderRaw), 10);
  const isVisible = input.is_visible === true || input.is_visible === 'true' || input.is_visible === 'on';
  const existingImage = input.image && typeof input.image === 'object' ? input.image : {};
  const imageUrl = normalizeOptionalImageUrl(input.image_url || existingImage.url || '');
  const imageAlt = String(input.image_alt || existingImage.alt || '').trim();
  const imageMediaId = String(input.image_media_id || existingImage.media_id || '').trim();

  if (!title) throw new Error('Název kategorie je povinný.');
  if (!slug) throw new Error('Název je povinný.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('Název vytvořil neplatnou adresu. Upravte prosím název.');
  }
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');

  // TODO: Replace this temporary URL/media-id shape with Supabase media-table selection
  // after the local upload flow is converted to Supabase Storage.
  const image = imageUrl || imageAlt || imageMediaId
    ? {
        url: imageUrl,
        alt: imageAlt,
        media_id: imageMediaId,
        source: imageMediaId ? 'media-reference' : 'manual-url'
      }
    : null;

  return {
    title,
    slug,
    description: description || null,
    image,
    parent_id: normalizeOptionalCategoryParentId(input),
    sort_order: sortOrder,
    is_visible: isVisible
  };
}

function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))) {
    throw new Error('Neplatné ID.');
  }
}

function sortProductCategories(categories) {
  return [...categories].sort((a, b) => {
    const aArchived = a.archived_at ? 1 : 0;
    const bArchived = b.archived_at ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    const aChild = a.parent_id ? 1 : 0;
    const bChild = b.parent_id ? 1 : 0;
    if (aChild !== bChild) return aChild - bChild;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
  });
}

function ensureProductCategoryParentIsValid(categories, parentId, ownId = '') {
  if (!parentId) return;
  if (ownId && parentId === ownId) throw new Error('Kategorie nemůže být sama sobě nadřazená.');
  const parent = categories.find((category) => category.id === parentId);
  if (!parent) throw new Error('Nadřazená kategorie nebyla nalezena.');
  if (parent.parent_id && (!ownId || parent.parent_id !== ownId)) {
    throw new Error('Podkategorie může mít jen hlavní kategorii jako rodiče.');
  }
}

function normalizeCustomFilterInput(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const description = String(input.description || '').trim();
  const sortOrder = Number.parseInt(String(input.sort_order === undefined || input.sort_order === '' ? 0 : input.sort_order), 10);
  const isVisible = input.is_visible === true || input.is_visible === 'true' || input.is_visible === 'on';
  if (!title) throw new Error('Název filtru je povinný.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Název vytvořil neplatnou adresu filtru.');
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');
  return { title, slug, description: description || null, sort_order: sortOrder, is_visible: isVisible };
}

function normalizeCustomFilterOptionInput(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const sortOrder = Number.parseInt(String(input.sort_order === undefined || input.sort_order === '' ? 0 : input.sort_order), 10);
  const isVisible = input.is_visible === true || input.is_visible === 'true' || input.is_visible === 'on';
  if (!title) throw new Error('Název možnosti je povinný.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Název vytvořil neplatnou adresu možnosti.');
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');
  return { title, slug, sort_order: sortOrder, is_visible: isVisible };
}

function sortCustomFilters(filters) {
  return [...filters].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.title).localeCompare(String(b.title), 'cs'));
}

function attachFilterOptions(filters, options) {
  return sortCustomFilters(filters).map((filter) => ({
    ...filter,
    options: sortCustomFilters(options.filter((option) => option.filter_id === filter.id))
  }));
}

async function listProductFilters() {
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    return attachFilterOptions(db.product_filters, db.product_filter_options);
  }
  const [filters, options] = await Promise.all([
    supabaseRequest('product_filters', { query: { select: 'id,title,slug,description,sort_order,is_visible,archived_at,created_at,updated_at', order: 'sort_order.asc,title.asc' } }),
    supabaseRequest('product_filter_options', { query: { select: 'id,filter_id,title,slug,sort_order,is_visible,archived_at,created_at,updated_at', order: 'sort_order.asc,title.asc' } })
  ]);
  return attachFilterOptions(Array.isArray(filters) ? filters : [], Array.isArray(options) ? options : []);
}

async function createProductFilter(input) {
  const filter = normalizeCustomFilterInput(input);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    if (db.product_filters.some((item) => item.slug === filter.slug)) throw new Error('Filtr s tímto názvem už existuje.');
    const created = createLocalRow({ ...filter, archived_at: null });
    db.product_filters.push(created);
    writeCmsDb(db);
    return created;
  }
  const rows = await supabaseRequest('product_filters', { method: 'POST', body: filter, prefer: 'return=representation', query: { select: '*' } });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateProductFilter(id, input) {
  assertUuid(id);
  const filter = normalizeCustomFilterInput(input);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    if (db.product_filters.some((item) => item.slug === filter.slug && item.id !== id)) throw new Error('Filtr s tímto názvem už existuje.');
    const row = db.product_filters.find((item) => item.id === id);
    if (!row) throw new Error('Filtr nebyl nalezen.');
    updateLocalRow(row, filter);
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('product_filters', { method: 'PATCH', body: filter, prefer: 'return=representation', query: { id: `eq.${id}`, select: '*' } });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Filtr nebyl nalezen.');
  return rows[0];
}

async function createProductFilterOption(filterId, input) {
  assertUuid(filterId);
  const option = { ...normalizeCustomFilterOptionInput(input), filter_id: filterId };
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    if (!db.product_filters.some((item) => item.id === filterId)) throw new Error('Filtr nebyl nalezen.');
    if (db.product_filter_options.some((item) => item.filter_id === filterId && item.slug === option.slug)) throw new Error('Tato možnost už ve filtru existuje.');
    const created = createLocalRow({ ...option, archived_at: null });
    db.product_filter_options.push(created);
    writeCmsDb(db);
    return created;
  }
  const rows = await supabaseRequest('product_filter_options', { method: 'POST', body: option, prefer: 'return=representation', query: { select: '*' } });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateProductFilterOption(filterId, optionId, input) {
  assertUuid(filterId);
  assertUuid(optionId);
  const option = normalizeCustomFilterOptionInput(input);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    if (db.product_filter_options.some((item) => item.filter_id === filterId && item.slug === option.slug && item.id !== optionId)) throw new Error('Tato možnost už ve filtru existuje.');
    const row = db.product_filter_options.find((item) => item.id === optionId && item.filter_id === filterId);
    if (!row) throw new Error('Možnost filtru nebyla nalezena.');
    updateLocalRow(row, option);
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('product_filter_options', { method: 'PATCH', body: option, prefer: 'return=representation', query: { id: `eq.${optionId}`, filter_id: `eq.${filterId}`, select: '*' } });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Možnost filtru nebyla nalezena.');
  return rows[0];
}

async function listProductCategories() {
  if (!isSupabaseConfigured()) return sortProductCategories(readCmsDb().product_categories);
  const rows = await supabaseRequest('product_categories', {
    query: {
      select: 'id,title,slug,description,image,parent_id,sort_order,is_visible,archived_at,created_at,updated_at',
      order: 'sort_order.asc,title.asc'
    }
  });
  return sortProductCategories(Array.isArray(rows) ? rows : []);
}

async function assertProductCategorySlugUnique(slug, excludeId = '') {
  if (!isSupabaseConfigured()) {
    const exists = readCmsDb().product_categories.some((category) => category.slug === slug && category.id !== excludeId);
    if (exists) throw new Error('Tento název už používá jiná kategorie.');
    return;
  }
  const query = {
    select: 'id',
    slug: `eq.${slug}`,
    limit: '1'
  };
  if (excludeId) query.id = `neq.${excludeId}`;
  const rows = await supabaseRequest('product_categories', { query });
  if (Array.isArray(rows) && rows.length) throw new Error('Tento název už používá jiná kategorie.');
}

async function createProductCategory(input) {
  const category = normalizeProductCategoryInput(input);
  await assertProductCategorySlugUnique(category.slug);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    ensureProductCategoryParentIsValid(db.product_categories, category.parent_id);
    const created = createLocalRow(category);
    db.product_categories.push(created);
    writeCmsDb(db);
    return created;
  }
  ensureProductCategoryParentIsValid(await listProductCategories(), category.parent_id);
  const rows = await supabaseRequest('product_categories', {
    method: 'POST',
    body: category,
    prefer: 'return=representation',
    query: { select: 'id,title,slug,description,image,parent_id,sort_order,is_visible,archived_at,created_at,updated_at' }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateProductCategory(id, input) {
  assertUuid(id);
  const category = normalizeProductCategoryInput(input);
  await assertProductCategorySlugUnique(category.slug, id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    ensureProductCategoryParentIsValid(db.product_categories, category.parent_id, id);
    const row = db.product_categories.find((item) => item.id === id);
    if (!row) throw new Error('Kategorie nebyla nalezena.');
    updateLocalRow(row, category);
    db.product_categories.forEach((item) => {
      if (item.parent_id === id && category.parent_id) item.parent_id = null;
    });
    writeCmsDb(db);
    return row;
  }
  ensureProductCategoryParentIsValid(await listProductCategories(), category.parent_id, id);
  const rows = await supabaseRequest('product_categories', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,description,image,parent_id,sort_order,is_visible,archived_at,created_at,updated_at'
    },
    body: category,
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kategorie nebyla nalezena.');
  return rows[0];
}

async function archiveProductCategory(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.product_categories.find((item) => item.id === id);
    if (!row) throw new Error('Kategorie nebyla nalezena.');
    updateLocalRow(row, { is_visible: false, archived_at: nowIso() });
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('product_categories', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,description,image,parent_id,sort_order,is_visible,archived_at,created_at,updated_at'
    },
    body: {
      is_visible: false,
      archived_at: nowIso()
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kategorie nebyla nalezena.');
  return rows[0];
}

async function restoreProductCategory(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.product_categories.find((item) => item.id === id);
    if (!row) throw new Error('Kategorie nebyla nalezena.');
    updateLocalRow(row, { archived_at: null });
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('product_categories', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,description,image,parent_id,sort_order,is_visible,archived_at,created_at,updated_at'
    },
    body: {
      archived_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kategorie nebyla nalezena.');
  return rows[0];
}

function normalizeBlogCategoryInput(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const description = String(input.description || '').trim();
  const sortOrderRaw = input.sort_order === undefined ? input.sortOrder : input.sort_order;
  const sortOrder = Number.parseInt(sortOrderRaw === undefined || sortOrderRaw === '' ? '0' : String(sortOrderRaw), 10);
  const isVisible = input.is_visible === true || input.is_visible === 'true' || input.is_visible === 'on';
  const existingImage = input.image && typeof input.image === 'object' ? input.image : {};
  const imageUrl = normalizeOptionalImageUrl(input.image_url || existingImage.url || '');
  const imageAlt = String(input.image_alt || existingImage.alt || '').trim();
  const imageMediaId = String(input.image_media_id || existingImage.media_id || '').trim();

  if (!title) throw new Error('Název kategorie je povinný.');
  if (!slug) throw new Error('Název je povinný.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('Název vytvořil neplatnou adresu. Upravte prosím název.');
  }
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');

  // TODO: Replace this temporary URL/media-id shape with Supabase media-table selection
  // after the local upload flow is converted to Supabase Storage.
  const image = imageUrl || imageAlt || imageMediaId
    ? {
        url: imageUrl,
        alt: imageAlt,
        media_id: imageMediaId,
        source: imageMediaId ? 'media-reference' : 'manual-url'
      }
    : null;

  return {
    title,
    slug,
    description: description || null,
    image,
    sort_order: sortOrder,
    is_visible: isVisible
  };
}

const LEGACY_BLOG_CATEGORY_TITLES = {
  craft: { legacy: 'Craft', localized: 'Z dílny' },
  author: { legacy: 'Author', localized: 'O autorovi' },
  philosophy: { legacy: 'Philosophy', localized: 'Filozofie značky' },
  products: { legacy: 'Products', localized: 'Výrobky' }
};

function localizeLegacyBlogCategory(category) {
  const translation = category && LEGACY_BLOG_CATEGORY_TITLES[category.slug];
  if (!translation || category.title !== translation.legacy) return category;
  return { ...category, title: translation.localized };
}

function sortBlogCategories(categories) {
  return categories.map(localizeLegacyBlogCategory).sort((a, b) => {
    const aArchived = a.archived_at ? 1 : 0;
    const bArchived = b.archived_at ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
  });
}

async function listBlogCategories() {
  if (!isSupabaseConfigured()) return sortBlogCategories(readCmsDb().blog_categories);
  const rows = await supabaseRequest('blog_categories', {
    query: {
      select: 'id,title,slug,description,image,sort_order,is_visible,archived_at,created_at,updated_at',
      order: 'sort_order.asc,title.asc'
    }
  });
  return sortBlogCategories(Array.isArray(rows) ? rows : []);
}

async function assertBlogCategorySlugUnique(slug, excludeId = '') {
  if (!isSupabaseConfigured()) {
    const exists = readCmsDb().blog_categories.some((category) => category.slug === slug && category.id !== excludeId);
    if (exists) throw new Error('Tento název už používá jiná kategorie blogu.');
    return;
  }
  const query = {
    select: 'id',
    slug: `eq.${slug}`,
    limit: '1'
  };
  if (excludeId) query.id = `neq.${excludeId}`;
  const rows = await supabaseRequest('blog_categories', { query });
  if (Array.isArray(rows) && rows.length) throw new Error('Tento název už používá jiná kategorie blogu.');
}

async function createBlogCategory(input) {
  const category = normalizeBlogCategoryInput(input);
  await assertBlogCategorySlugUnique(category.slug);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const created = createLocalRow(category);
    db.blog_categories.push(created);
    writeCmsDb(db);
    return created;
  }
  const rows = await supabaseRequest('blog_categories', {
    method: 'POST',
    body: category,
    prefer: 'return=representation',
    query: { select: 'id,title,slug,description,image,sort_order,is_visible,archived_at,created_at,updated_at' }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateBlogCategory(id, input) {
  assertUuid(id);
  const category = normalizeBlogCategoryInput(input);
  await assertBlogCategorySlugUnique(category.slug, id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.blog_categories.find((item) => item.id === id);
    if (!row) throw new Error('Kategorie blogu nebyla nalezena.');
    updateLocalRow(row, category);
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('blog_categories', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,description,image,sort_order,is_visible,archived_at,created_at,updated_at'
    },
    body: category,
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kategorie blogu nebyla nalezena.');
  return rows[0];
}

async function archiveBlogCategory(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.blog_categories.find((item) => item.id === id);
    if (!row) throw new Error('Kategorie blogu nebyla nalezena.');
    updateLocalRow(row, { is_visible: false, archived_at: nowIso() });
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('blog_categories', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,description,image,sort_order,is_visible,archived_at,created_at,updated_at'
    },
    body: {
      is_visible: false,
      archived_at: nowIso()
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kategorie blogu nebyla nalezena.');
  return rows[0];
}

async function restoreBlogCategory(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.blog_categories.find((item) => item.id === id);
    if (!row) throw new Error('Kategorie blogu nebyla nalezena.');
    updateLocalRow(row, { archived_at: null });
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('blog_categories', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,description,image,sort_order,is_visible,archived_at,created_at,updated_at'
    },
    body: {
      archived_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Kategorie blogu nebyla nalezena.');
  return rows[0];
}

function normalizeProductPhotoInput(input, index) {
  const photo = input && typeof input === 'object' ? input : {};
  const url = normalizeOptionalImageUrl(photo.url || '');
  const mediaId = String(photo.media_id || photo.mediaId || '').trim();
  const alt = String(photo.alt || '').trim();
  const caption = String(photo.caption || '').trim();
  if (!url && !mediaId) return null;

  return {
    media_id: mediaId,
    url,
    alt,
    caption,
    sort_order: index,
    is_featured: index === 0
  };
}

function normalizeProductPhotos(input) {
  const photos = Array.isArray(input) ? input : [];
  return photos
    .map((photo, index) => normalizeProductPhotoInput(photo, index))
    .filter(Boolean)
    .map((photo, index) => ({
      ...photo,
      sort_order: index,
      is_featured: index === 0
    }));
}

function normalizePublishedAt(value, isPublished) {
  if (!isPublished) return null;
  const raw = String(value || '').trim();
  if (!raw) return nowIso();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Datum publikace není platné.');
  return date.toISOString();
}

function normalizeCategoryIds(input) {
  const ids = Array.isArray(input) ? input : [];
  const uniqueIds = [];
  ids.forEach((id) => {
    const value = String(id || '').trim();
    if (!value || uniqueIds.includes(value)) return;
    assertUuid(value);
    uniqueIds.push(value);
  });
  return uniqueIds;
}

function normalizeProductTextList(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  return values.reduce((result, item) => {
    const value = String(item || '').trim();
    if (value && !result.some((existing) => existing.toLocaleLowerCase('cs') === value.toLocaleLowerCase('cs'))) result.push(value);
    return result;
  }, []);
}

function normalizeProductInput(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const shortDescription = String(input.short_description || input.shortDescription || '').trim();
  const description = String(input.description || '').trim();
  const sortOrderRaw = input.sort_order === undefined ? input.sortOrder : input.sort_order;
  const sortOrder = Number.parseInt(sortOrderRaw === undefined || sortOrderRaw === '' ? '0' : String(sortOrderRaw), 10);
  const isVisible = input.is_visible === true || input.is_visible === 'true' || input.is_visible === 'on';
  const isPublished = input.is_published === true || input.is_published === 'true' || input.is_published === 'on';
  const priceRaw = input.price === undefined || input.price === null ? '' : String(input.price).trim();
  const price = priceRaw === '' ? null : Number(priceRaw.replace(',', '.'));
  const availability = String(input.availability || '').trim();
  const woodTypes = normalizeProductTextList(input.wood_types || input.woodTypes);
  const useContext = normalizeProductTextList(input.use_context || input.useContext).map((value) => value.toLowerCase());

  if (!title) throw new Error('Název výrobku je povinný.');
  if (!slug) throw new Error('Název je povinný.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('Název vytvořil neplatnou adresu. Upravte prosím název.');
  }
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Cena musí být nezáporné číslo.');
  if (availability && !['in_stock', 'made_to_order'].includes(availability)) throw new Error('Vyberte platnou dostupnost.');
  if (useContext.some((value) => !['interior', 'exterior'].includes(value))) throw new Error('Použití může být pouze interiér nebo exteriér.');

  return {
    product: {
      title,
      slug,
      short_description: shortDescription || null,
      description: description || null,
      photos: normalizeProductPhotos(input.photos),
      price,
      wood_types: woodTypes,
      availability: availability || null,
      use_context: useContext,
      sort_order: sortOrder,
      is_visible: isVisible,
      is_published: isPublished,
      published_at: normalizePublishedAt(input.published_at || input.publishedAt, isPublished)
    },
    categoryIds: normalizeCategoryIds(input.category_ids || input.categoryIds),
    filterOptionIds: normalizeCategoryIds(input.filter_option_ids || input.filterOptionIds)
  };
}

function sortProducts(products) {
  return [...products].sort((a, b) => {
    const aArchived = a.archived_at ? 1 : 0;
    const bArchived = b.archived_at ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
  });
}

function attachProductCategories(products, categories, links) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const linksByProduct = new Map();
  links.forEach((link) => {
    if (!linksByProduct.has(link.product_id)) linksByProduct.set(link.product_id, []);
    linksByProduct.get(link.product_id).push(link);
  });

  return products.map((product) => {
    const productLinks = linksByProduct.get(product.id) || [];
    const productCategories = productLinks
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((link) => categoryMap.get(link.category_id))
      .filter(Boolean);
    return {
      ...product,
      category_ids: productCategories.map((category) => category.id),
      categories: productCategories
    };
  });
}

function attachProductFilterOptions(products, filters, options, links) {
  const filterMap = new Map(filters.map((filter) => [filter.id, filter]));
  const optionMap = new Map(options.map((option) => [option.id, option]));
  const linksByProduct = new Map();
  links.forEach((link) => {
    if (!linksByProduct.has(link.product_id)) linksByProduct.set(link.product_id, []);
    linksByProduct.get(link.product_id).push(link);
  });
  return products.map((product) => {
    const productOptions = (linksByProduct.get(product.id) || []).map((link) => optionMap.get(link.option_id)).filter(Boolean).map((option) => ({
      ...option,
      filter: filterMap.get(option.filter_id) || null
    }));
    return { ...product, filter_option_ids: productOptions.map((option) => option.id), filter_options: productOptions };
  });
}

async function listProducts() {
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const products = attachProductCategories(db.products, db.product_categories, db.product_category_links);
    return {
      products: sortProducts(attachProductFilterOptions(products, db.product_filters, db.product_filter_options, db.product_filter_value_links)),
      categories: sortProductCategories(db.product_categories),
      filters: attachFilterOptions(db.product_filters, db.product_filter_options)
    };
  }
  const [products, categories, links, filters, filterOptions, filterLinks] = await Promise.all([
    supabaseRequest('products', {
      query: {
        select: 'id,title,slug,short_description,description,photos,price,wood_types,availability,use_context,sort_order,is_visible,is_published,published_at,archived_at,created_at,updated_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('product_categories', {
      query: {
        select: 'id,title,slug,parent_id,sort_order,is_visible,archived_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('product_category_links', {
      query: {
        select: 'product_id,category_id,sort_order',
        order: 'sort_order.asc'
      }
    }),
    supabaseRequest('product_filters', { query: { select: 'id,title,slug,description,sort_order,is_visible,archived_at', order: 'sort_order.asc,title.asc' } }),
    supabaseRequest('product_filter_options', { query: { select: 'id,filter_id,title,slug,sort_order,is_visible,archived_at', order: 'sort_order.asc,title.asc' } }),
    supabaseRequest('product_filter_value_links', { query: { select: 'product_id,option_id' } })
  ]);
  const categorizedProducts = attachProductCategories(
    Array.isArray(products) ? products : [],
    Array.isArray(categories) ? categories : [],
    Array.isArray(links) ? links : []
  );
  return {
    products: sortProducts(attachProductFilterOptions(categorizedProducts, Array.isArray(filters) ? filters : [], Array.isArray(filterOptions) ? filterOptions : [], Array.isArray(filterLinks) ? filterLinks : [])),
    categories: sortProductCategories(Array.isArray(categories) ? categories : []),
    filters: attachFilterOptions(Array.isArray(filters) ? filters : [], Array.isArray(filterOptions) ? filterOptions : [])
  };
}

async function assertProductSlugUnique(slug, excludeId = '') {
  if (!isSupabaseConfigured()) {
    const exists = readCmsDb().products.some((product) => product.slug === slug && product.id !== excludeId);
    if (exists) throw new Error('Tento název už používá jiný výrobek.');
    return;
  }
  const query = {
    select: 'id',
    slug: `eq.${slug}`,
    limit: '1'
  };
  if (excludeId) query.id = `neq.${excludeId}`;
  const rows = await supabaseRequest('products', { query });
  if (Array.isArray(rows) && rows.length) throw new Error('Tento název už používá jiný výrobek.');
}

async function replaceProductCategoryLinks(productId, categoryIds) {
  assertUuid(productId);
  if (!isSupabaseConfigured()) return;
  await supabaseRequest('product_category_links', {
    method: 'DELETE',
    query: { product_id: `eq.${productId}` }
  });
  if (!categoryIds.length) return;
  await supabaseRequest('product_category_links', {
    method: 'POST',
    body: categoryIds.map((categoryId, index) => ({
      product_id: productId,
      category_id: categoryId,
      sort_order: index
    })),
    prefer: 'return=minimal'
  });
}

async function replaceProductFilterLinks(productId, optionIds) {
  assertUuid(productId);
  if (!isSupabaseConfigured()) return;
  await supabaseRequest('product_filter_value_links', { method: 'DELETE', query: { product_id: `eq.${productId}` } });
  if (!optionIds.length) return;
  await supabaseRequest('product_filter_value_links', {
    method: 'POST',
    body: optionIds.map((optionId) => ({ product_id: productId, option_id: optionId })),
    prefer: 'return=minimal'
  });
}

async function getProductById(id) {
  assertUuid(id);
  const { products } = await listProducts();
  const product = products.find((item) => item.id === id);
  if (!product) throw new Error('Výrobek nebyl nalezen.');
  return product;
}

async function createProduct(input) {
  const { product, categoryIds, filterOptionIds } = normalizeProductInput(input);
  await assertProductSlugUnique(product.slug);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    categoryIds.forEach((categoryId) => {
      if (!db.product_categories.some((category) => category.id === categoryId)) {
        throw new Error('Vybraná kategorie nebyla nalezena.');
      }
    });
    filterOptionIds.forEach((optionId) => {
      if (!db.product_filter_options.some((option) => option.id === optionId)) throw new Error('Vybraná možnost filtru nebyla nalezena.');
    });
    const created = createLocalRow(product);
    db.products.push(created);
    db.product_category_links = db.product_category_links
      .filter((link) => link.product_id !== created.id)
      .concat(categoryIds.map((categoryId, index) => ({
        product_id: created.id,
        category_id: categoryId,
        sort_order: index,
        created_at: nowIso()
      })));
    db.product_filter_value_links = db.product_filter_value_links.filter((link) => link.product_id !== created.id).concat(filterOptionIds.map((optionId) => ({ product_id: created.id, option_id: optionId, created_at: nowIso() })));
    writeCmsDb(db);
    return getProductById(created.id);
  }
  const rows = await supabaseRequest('products', {
    method: 'POST',
    body: product,
    prefer: 'return=representation',
    query: { select: 'id,title,slug,short_description,description,photos,price,wood_types,availability,use_context,sort_order,is_visible,is_published,published_at,archived_at,created_at,updated_at' }
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  if (!created || !created.id) throw new Error('Výrobek se nepodařilo vytvořit.');
  await replaceProductCategoryLinks(created.id, categoryIds);
  await replaceProductFilterLinks(created.id, filterOptionIds);
  return getProductById(created.id);
}

async function updateProduct(id, input) {
  assertUuid(id);
  const { product, categoryIds, filterOptionIds } = normalizeProductInput(input);
  await assertProductSlugUnique(product.slug, id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.products.find((item) => item.id === id);
    if (!row) throw new Error('Výrobek nebyl nalezen.');
    categoryIds.forEach((categoryId) => {
      if (!db.product_categories.some((category) => category.id === categoryId)) {
        throw new Error('Vybraná kategorie nebyla nalezena.');
      }
    });
    filterOptionIds.forEach((optionId) => {
      if (!db.product_filter_options.some((option) => option.id === optionId)) throw new Error('Vybraná možnost filtru nebyla nalezena.');
    });
    updateLocalRow(row, product);
    db.product_category_links = db.product_category_links
      .filter((link) => link.product_id !== id)
      .concat(categoryIds.map((categoryId, index) => ({
        product_id: id,
        category_id: categoryId,
        sort_order: index,
        created_at: nowIso()
      })));
    db.product_filter_value_links = db.product_filter_value_links.filter((link) => link.product_id !== id).concat(filterOptionIds.map((optionId) => ({ product_id: id, option_id: optionId, created_at: nowIso() })));
    writeCmsDb(db);
    return getProductById(id);
  }
  const rows = await supabaseRequest('products', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,short_description,description,photos,price,wood_types,availability,use_context,sort_order,is_visible,is_published,published_at,archived_at,created_at,updated_at'
    },
    body: product,
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Výrobek nebyl nalezen.');
  await replaceProductCategoryLinks(id, categoryIds);
  await replaceProductFilterLinks(id, filterOptionIds);
  return getProductById(id);
}

async function archiveProduct(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.products.find((item) => item.id === id);
    if (!row) throw new Error('Výrobek nebyl nalezen.');
    updateLocalRow(row, { is_visible: false, is_published: false, published_at: null, archived_at: nowIso() });
    writeCmsDb(db);
    return getProductById(id);
  }
  const rows = await supabaseRequest('products', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,short_description,description,photos,price,wood_types,availability,use_context,sort_order,is_visible,is_published,published_at,archived_at,created_at,updated_at'
    },
    body: {
      is_visible: false,
      is_published: false,
      published_at: null,
      archived_at: nowIso()
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Výrobek nebyl nalezen.');
  return getProductById(id);
}

async function restoreProduct(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.products.find((item) => item.id === id);
    if (!row) throw new Error('Výrobek nebyl nalezen.');
    updateLocalRow(row, { archived_at: null });
    writeCmsDb(db);
    return getProductById(id);
  }
  const rows = await supabaseRequest('products', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,short_description,description,photos,price,wood_types,availability,use_context,sort_order,is_visible,is_published,published_at,archived_at,created_at,updated_at'
    },
    body: {
      archived_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Výrobek nebyl nalezen.');
  return getProductById(id);
}

function normalizeBlogPostPublishedAt(value, status) {
  if (status !== 'published') return null;
  const raw = String(value || '').trim();
  if (!raw) return nowIso();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Datum publikace není platné.');
  return date.toISOString();
}

function normalizeBlogPostInput(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const excerpt = String(input.excerpt || '').trim();
  const mainContent = String(input.main_content || input.mainContent || '').trim();
  const authorName = String(input.author_name || input.authorName || '').trim();
  const contentFormat = String(input.content_format || input.contentFormat || 'html').trim();
  const status = String(input.status || 'draft').trim();
  const sortOrderRaw = input.sort_order === undefined ? input.sortOrder : input.sort_order;
  const sortOrder = Number.parseInt(sortOrderRaw === undefined || sortOrderRaw === '' ? '0' : String(sortOrderRaw), 10);

  if (!title) throw new Error('Název článku je povinný.');
  if (!slug) throw new Error('Název je povinný.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('Název vytvořil neplatnou adresu. Upravte prosím název.');
  }
  if (!['html', 'markdown', 'portable_text'].includes(contentFormat)) {
    throw new Error('Text článku není v platném formátu.');
  }
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error('Stav článku není platný.');
  }
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');

  return {
    post: {
      title,
      slug,
      excerpt: excerpt || null,
      main_content: mainContent || null,
      content_format: contentFormat,
      photos: normalizeProductPhotos(input.photos),
      author_name: authorName || null,
      status,
      published_at: normalizeBlogPostPublishedAt(input.published_at || input.publishedAt, status),
      sort_order: sortOrder
    },
    categoryIds: normalizeCategoryIds(input.category_ids || input.categoryIds)
  };
}

function sortBlogPosts(posts) {
  return [...posts].sort((a, b) => {
    const aArchived = a.status === 'archived' ? 1 : 0;
    const bArchived = b.status === 'archived' ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    const aPublished = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bPublished = b.published_at ? new Date(b.published_at).getTime() : 0;
    if (aPublished !== bPublished) return bPublished - aPublished;
    return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
  });
}

function attachBlogCategories(posts, categories, links) {
  const categoryMap = new Map(categories.map(localizeLegacyBlogCategory).map((category) => [category.id, category]));
  const linksByPost = new Map();
  links.forEach((link) => {
    if (!linksByPost.has(link.blog_post_id)) linksByPost.set(link.blog_post_id, []);
    linksByPost.get(link.blog_post_id).push(link);
  });

  return posts.map((post) => {
    const postLinks = linksByPost.get(post.id) || [];
    const postCategories = postLinks
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((link) => categoryMap.get(link.category_id))
      .filter(Boolean);
    return {
      ...post,
      category_ids: postCategories.map((category) => category.id),
      categories: postCategories
    };
  });
}

async function listBlogPosts() {
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    return {
      posts: sortBlogPosts(attachBlogCategories(db.blog_posts, db.blog_categories, db.blog_category_links)),
      categories: sortBlogCategories(db.blog_categories)
    };
  }
  const [posts, categories, links] = await Promise.all([
    supabaseRequest('blog_posts', {
      query: {
        select: 'id,title,slug,excerpt,main_content,content_format,photos,author_name,status,published_at,sort_order,created_at,updated_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('blog_categories', {
      query: {
        select: 'id,title,slug,sort_order,is_visible,archived_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('blog_category_links', {
      query: {
        select: 'blog_post_id,category_id,sort_order',
        order: 'sort_order.asc'
      }
    })
  ]);
  return {
    posts: sortBlogPosts(attachBlogCategories(
      Array.isArray(posts) ? posts : [],
      Array.isArray(categories) ? categories : [],
      Array.isArray(links) ? links : []
    )),
    categories: sortBlogCategories(Array.isArray(categories) ? categories : [])
  };
}

async function assertBlogPostSlugUnique(slug, excludeId = '') {
  if (!isSupabaseConfigured()) {
    const exists = readCmsDb().blog_posts.some((post) => post.slug === slug && post.id !== excludeId);
    if (exists) throw new Error('Tento název už používá jiný článek.');
    return;
  }
  const query = {
    select: 'id',
    slug: `eq.${slug}`,
    limit: '1'
  };
  if (excludeId) query.id = `neq.${excludeId}`;
  const rows = await supabaseRequest('blog_posts', { query });
  if (Array.isArray(rows) && rows.length) throw new Error('Tento název už používá jiný článek.');
}

async function replaceBlogCategoryLinks(blogPostId, categoryIds) {
  assertUuid(blogPostId);
  if (!isSupabaseConfigured()) return;
  await supabaseRequest('blog_category_links', {
    method: 'DELETE',
    query: { blog_post_id: `eq.${blogPostId}` }
  });
  if (!categoryIds.length) return;
  await supabaseRequest('blog_category_links', {
    method: 'POST',
    body: categoryIds.map((categoryId, index) => ({
      blog_post_id: blogPostId,
      category_id: categoryId,
      sort_order: index
    })),
    prefer: 'return=minimal'
  });
}

async function getBlogPostById(id) {
  assertUuid(id);
  const { posts } = await listBlogPosts();
  const post = posts.find((item) => item.id === id);
  if (!post) throw new Error('Článek nebyl nalezen.');
  return post;
}

async function createBlogPost(input) {
  const { post, categoryIds } = normalizeBlogPostInput(input);
  await assertBlogPostSlugUnique(post.slug);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    categoryIds.forEach((categoryId) => {
      if (!db.blog_categories.some((category) => category.id === categoryId)) {
        throw new Error('Vybraná kategorie blogu nebyla nalezena.');
      }
    });
    const created = createLocalRow(post);
    db.blog_posts.push(created);
    db.blog_category_links = db.blog_category_links
      .filter((link) => link.blog_post_id !== created.id)
      .concat(categoryIds.map((categoryId, index) => ({
        blog_post_id: created.id,
        category_id: categoryId,
        sort_order: index,
        created_at: nowIso()
      })));
    writeCmsDb(db);
    return getBlogPostById(created.id);
  }
  const rows = await supabaseRequest('blog_posts', {
    method: 'POST',
    body: post,
    prefer: 'return=representation',
    query: { select: 'id,title,slug,excerpt,main_content,content_format,photos,author_name,status,published_at,sort_order,created_at,updated_at' }
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  if (!created || !created.id) throw new Error('Článek se nepodařilo vytvořit.');
  await replaceBlogCategoryLinks(created.id, categoryIds);
  return getBlogPostById(created.id);
}

async function updateBlogPost(id, input) {
  assertUuid(id);
  const { post, categoryIds } = normalizeBlogPostInput(input);
  await assertBlogPostSlugUnique(post.slug, id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.blog_posts.find((item) => item.id === id);
    if (!row) throw new Error('Článek nebyl nalezen.');
    categoryIds.forEach((categoryId) => {
      if (!db.blog_categories.some((category) => category.id === categoryId)) {
        throw new Error('Vybraná kategorie blogu nebyla nalezena.');
      }
    });
    updateLocalRow(row, post);
    db.blog_category_links = db.blog_category_links
      .filter((link) => link.blog_post_id !== id)
      .concat(categoryIds.map((categoryId, index) => ({
        blog_post_id: id,
        category_id: categoryId,
        sort_order: index,
        created_at: nowIso()
      })));
    writeCmsDb(db);
    return getBlogPostById(id);
  }
  const rows = await supabaseRequest('blog_posts', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,excerpt,main_content,content_format,photos,author_name,status,published_at,sort_order,created_at,updated_at'
    },
    body: post,
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Článek nebyl nalezen.');
  await replaceBlogCategoryLinks(id, categoryIds);
  return getBlogPostById(id);
}

async function archiveBlogPost(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.blog_posts.find((item) => item.id === id);
    if (!row) throw new Error('Článek nebyl nalezen.');
    updateLocalRow(row, { status: 'archived', published_at: null });
    writeCmsDb(db);
    return getBlogPostById(id);
  }
  const rows = await supabaseRequest('blog_posts', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,excerpt,main_content,content_format,photos,author_name,status,published_at,sort_order,created_at,updated_at'
    },
    body: {
      status: 'archived',
      published_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Článek nebyl nalezen.');
  return getBlogPostById(id);
}

async function restoreBlogPost(id) {
  assertUuid(id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.blog_posts.find((item) => item.id === id);
    if (!row) throw new Error('Článek nebyl nalezen.');
    updateLocalRow(row, { status: 'draft', published_at: null });
    writeCmsDb(db);
    return getBlogPostById(id);
  }
  const rows = await supabaseRequest('blog_posts', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      select: 'id,title,slug,excerpt,main_content,content_format,photos,author_name,status,published_at,sort_order,created_at,updated_at'
    },
    body: {
      status: 'draft',
      published_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Článek nebyl nalezen.');
  return getBlogPostById(id);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultHomepageLayout() {
  return {
    version: HOMEPAGE_LAYOUT_VERSION,
    blocks: cloneJson(HOMEPAGE_FIXED_BLOCKS)
  };
}

function legacySiteContentText(item) {
  const value = item && item.value && typeof item.value === 'object' ? item.value : {};
  return stripHtmlToText(value.text || value.html || '').trim();
}

function splitLegacyParagraphs(value) {
  return String(value || '').split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
}

function homepageLayoutFromLegacyRows(rows) {
  const layout = defaultHomepageLayout();
  const byKey = new Map((Array.isArray(rows) ? rows : []).filter((item) => item && item.status === 'published').map((item) => [item.content_key, item]));
  const blockMap = new Map(layout.blocks.map((block) => [block.id, block]));
  const heroText = splitLegacyParagraphs(legacySiteContentText(byKey.get('homepage.hero')));
  if (heroText[0]) blockMap.get('hero').content.title = heroText[0];
  if (heroText[1]) blockMap.get('hero').content.body = heroText.slice(1).join(' ');
  const heroImage = byKey.get('homepage.hero.image');
  if (heroImage && heroImage.value) blockMap.get('hero').content.image = normalizeHomepageImage(heroImage.value, blockMap.get('hero').content.image);

  const aboutText = splitLegacyParagraphs(legacySiteContentText(byKey.get('about.text')));
  if (aboutText[0]) blockMap.get('about').content.lead = aboutText[0];
  if (aboutText[1]) blockMap.get('about').content.body = aboutText.slice(1).join('\n\n');
  const aboutImage = byKey.get('about.image');
  if (aboutImage && aboutImage.value) blockMap.get('about').content.image = normalizeHomepageImage(aboutImage.value, blockMap.get('about').content.image);

  const craftText = splitLegacyParagraphs(legacySiteContentText(byKey.get('craft.philosophy')));
  if (craftText[0]) blockMap.get('author').content.lead = craftText[0];
  if (craftText[1]) blockMap.get('author').content.body = craftText.slice(1).join('\n\n');
  const authorImage = byKey.get('author.image');
  if (authorImage && authorImage.value) blockMap.get('author').content.image = normalizeHomepageImage(authorImage.value, blockMap.get('author').content.image);

  const contactText = splitLegacyParagraphs(legacySiteContentText(byKey.get('contact.text')));
  if (contactText[0]) blockMap.get('custom').content.body = contactText[0];
  if (contactText[1]) blockMap.get('custom').content.secondary_body = contactText.slice(1).join(' ');
  const productsTitle = legacySiteContentText(byKey.get('products.title'));
  const productsIntro = legacySiteContentText(byKey.get('products.intro'));
  const blogTitle = legacySiteContentText(byKey.get('blog.title'));
  const blogIntro = legacySiteContentText(byKey.get('blog.intro'));
  if (productsTitle) blockMap.get('products').content.title = productsTitle;
  if (productsIntro) blockMap.get('products').content.body = productsIntro;
  if (blogTitle) blockMap.get('blog').content.title = blogTitle;
  if (blogIntro) blockMap.get('blog').content.body = blogIntro;
  return normalizeHomepageLayout(layout);
}

function applyManagedImagesToHomepageLayout(layout, mediaDb) {
  const normalized = normalizeHomepageLayout(layout);
  const blockMap = new Map(normalized.blocks.map((block) => [block.id, block]));
  const targets = mediaDb && mediaDb.targets && mediaDb.targets.site_sections
    ? mediaDb.targets.site_sections
    : {};
  const firstImage = (key) => {
    const images = targets[key] && Array.isArray(targets[key].images) ? targets[key].images : [];
    return images[0] || null;
  };
  const heroImage = firstImage('hero');
  const aboutImage = firstImage('about');
  const authorImage = firstImage('author');
  const customPrimary = firstImage('custom_primary');
  const customSecondary = firstImage('custom_secondary');
  if (heroImage) blockMap.get('hero').content.image = normalizeHomepageImage(heroImage, blockMap.get('hero').content.image);
  if (aboutImage) blockMap.get('about').content.image = normalizeHomepageImage(aboutImage, blockMap.get('about').content.image);
  if (authorImage) blockMap.get('author').content.image = normalizeHomepageImage(authorImage, blockMap.get('author').content.image);
  if (customPrimary) blockMap.get('custom').content.images[0] = normalizeHomepageImage(customPrimary, blockMap.get('custom').content.images[0]);
  if (customSecondary) blockMap.get('custom').content.images[1] = normalizeHomepageImage(customSecondary, blockMap.get('custom').content.images[1]);
  return normalized;
}

function homepageString(value, fallback = '', maxLength = 6000) {
  const source = value === undefined || value === null ? fallback : value;
  return String(source || '').trim().slice(0, maxLength);
}

function homepageContentField(content, key, fallback, maxLength) {
  const source = content && Object.prototype.hasOwnProperty.call(content, key)
    ? content[key]
    : fallback;
  return homepageString(source, fallback, maxLength);
}

function normalizeHomepageLink(value, fieldName = 'Odkaz') {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('#')) {
    if (!/^#[a-zA-Z][a-zA-Z0-9_-]*$/.test(url)) throw new Error(`${fieldName} nemá platný odkaz na část stránky.`);
    return url;
  }
  if (url.startsWith('/') && !url.startsWith('//')) return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`${fieldName} musí začínat #, /, http://, https://, mailto: nebo tel:.`);
  }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
    throw new Error(`${fieldName} musí začínat #, /, http://, https://, mailto: nebo tel:.`);
  }
  return url;
}

function normalizeHomepageImage(value, fallback) {
  if (value === undefined || value === null) return cloneJson(fallback || { url: '', alt: '', media_id: '' });
  const image = normalizeSiteContentImageValue(value);
  image.alt = homepageString(image.alt, '', 400);
  image.caption = homepageString(image.caption, '', 800);
  image.media_id = homepageString(image.media_id, '', 80);
  return image;
}

function normalizeHomepageFixedBlock(definition, rawBlock = {}) {
  const rawContent = rawBlock.content && typeof rawBlock.content === 'object' ? rawBlock.content : {};
  const defaults = definition.content;
  const content = {};

  if (definition.id === 'hero') {
    content.eyebrow = homepageContentField(rawContent, 'eyebrow', defaults.eyebrow, 120);
    content.title = homepageContentField(rawContent, 'title', defaults.title, 180);
    content.body = homepageContentField(rawContent, 'body', defaults.body, 800);
    content.image = normalizeHomepageImage(rawContent.image, defaults.image);
    content.primary_label = homepageContentField(rawContent, 'primary_label', defaults.primary_label, 80);
    content.primary_url = normalizeHomepageLink(
      Object.prototype.hasOwnProperty.call(rawContent, 'primary_url') ? rawContent.primary_url : defaults.primary_url,
      'Odkaz hlavního tlačítka'
    );
    content.secondary_label = homepageContentField(rawContent, 'secondary_label', defaults.secondary_label, 80);
    content.secondary_url = normalizeHomepageLink(
      Object.prototype.hasOwnProperty.call(rawContent, 'secondary_url') ? rawContent.secondary_url : defaults.secondary_url,
      'Odkaz druhého tlačítka'
    );
  } else if (definition.id === 'about') {
    content.title = homepageContentField(rawContent, 'title', defaults.title, 180);
    content.lead = homepageContentField(rawContent, 'lead', defaults.lead, 1400);
    content.body = homepageContentField(rawContent, 'body', defaults.body, 4000);
    content.image = normalizeHomepageImage(rawContent.image, defaults.image);
  } else if (definition.id === 'products' || definition.id === 'blog') {
    content.title = homepageContentField(rawContent, 'title', defaults.title, 180);
    content.body = homepageContentField(rawContent, 'body', defaults.body, 1600);
  } else if (definition.id === 'author') {
    content.title = homepageContentField(rawContent, 'title', defaults.title, 180);
    content.lead = homepageContentField(rawContent, 'lead', defaults.lead, 1400);
    content.body = homepageContentField(rawContent, 'body', defaults.body, 6000);
    content.signature = homepageContentField(rawContent, 'signature', defaults.signature, 120);
    content.image = normalizeHomepageImage(rawContent.image, defaults.image);
  } else if (definition.id === 'custom') {
    content.title = homepageContentField(rawContent, 'title', defaults.title, 180);
    content.body = homepageContentField(rawContent, 'body', defaults.body, 2600);
    content.secondary_body = homepageContentField(rawContent, 'secondary_body', defaults.secondary_body, 1600);
    const rawImages = Array.isArray(rawContent.images) ? rawContent.images : defaults.images;
    content.images = [0, 1].map((index) => normalizeHomepageImage(rawImages[index], defaults.images[index]));
  }

  return {
    id: definition.id,
    kind: definition.kind,
    label: definition.label,
    visible: definition.id === 'hero' ? true : rawBlock.visible !== false,
    content
  };
}

function normalizeHomepageStoryBlock(rawBlock = {}) {
  const rawContent = rawBlock.content && typeof rawBlock.content === 'object' ? rawBlock.content : {};
  const rawId = homepageString(rawBlock.id, '', 100);
  const id = rawId && /^story-[a-z0-9][a-z0-9-]*$/.test(rawId)
    ? rawId
    : `story-${slugify(rawId || crypto.randomUUID(), 'block')}`;
  const title = homepageContentField(rawContent, 'title', 'Nový blok', 180);
  const layout = ['image-right', 'image-left', 'text-only', 'image-wide'].includes(rawContent.layout)
    ? rawContent.layout
    : 'image-right';
  const theme = ['paper', 'cream', 'wood'].includes(rawContent.theme) ? rawContent.theme : 'paper';

  return {
    id,
    kind: 'story',
    label: title || 'Vlastní blok',
    visible: rawBlock.visible !== false,
    content: {
      eyebrow: homepageContentField(rawContent, 'eyebrow', '', 120),
      title,
      body: homepageContentField(rawContent, 'body', '', 6000),
      image: normalizeHomepageImage(rawContent.image, { url: '', alt: '', media_id: '' }),
      layout,
      theme,
      cta_label: homepageContentField(rawContent, 'cta_label', '', 80),
      cta_url: normalizeHomepageLink(rawContent.cta_url || '', 'Odkaz tlačítka')
    }
  };
}

function normalizeHomepageLayout(input) {
  const source = input && input.layout && typeof input.layout === 'object' ? input.layout : input;
  const rawBlocks = source && Array.isArray(source.blocks) ? source.blocks : [];
  if (!rawBlocks.length) return defaultHomepageLayout();

  const definitions = new Map(HOMEPAGE_FIXED_BLOCKS.map((block) => [block.id, block]));
  const seenIds = new Set();
  const blocks = [];

  rawBlocks.slice(0, HOMEPAGE_MAX_BLOCKS).forEach((rawBlock) => {
    if (!rawBlock || typeof rawBlock !== 'object') return;
    const rawId = String(rawBlock.id || '').trim();
    const definition = definitions.get(rawId);
    const block = definition
      ? normalizeHomepageFixedBlock(definition, rawBlock)
      : rawBlock.kind === 'story'
        ? normalizeHomepageStoryBlock(rawBlock)
        : null;
    if (!block || seenIds.has(block.id)) return;
    seenIds.add(block.id);
    if (block.kind === 'story' && blocks.filter((item) => item.kind === 'story').length >= HOMEPAGE_MAX_BLOCKS - HOMEPAGE_FIXED_BLOCKS.length) return;
    blocks.push(block);
  });

  HOMEPAGE_FIXED_BLOCKS.forEach((definition) => {
    if (seenIds.has(definition.id)) return;
    seenIds.add(definition.id);
    blocks.push(normalizeHomepageFixedBlock(definition));
  });

  const heroIndex = blocks.findIndex((block) => block.id === 'hero');
  if (heroIndex > 0) blocks.unshift(blocks.splice(heroIndex, 1)[0]);

  return {
    version: HOMEPAGE_LAYOUT_VERSION,
    blocks: blocks.slice(0, HOMEPAGE_MAX_BLOCKS)
  };
}

function validateHomepageLayoutInput(input) {
  const source = input && input.layout && typeof input.layout === 'object' ? input.layout : input;
  if (!source || typeof source !== 'object' || !Array.isArray(source.blocks)) {
    throw new Error('Rozložení stránky nemá platný seznam bloků.');
  }
  if (source.blocks.length > HOMEPAGE_MAX_BLOCKS) {
    throw new Error(`Stránka může obsahovat nejvýše ${HOMEPAGE_MAX_BLOCKS} bloků.`);
  }
  if (JSON.stringify(source).length > 120000) {
    throw new Error('Rozložení stránky je příliš velké.');
  }

  const definitions = new Map(HOMEPAGE_FIXED_BLOCKS.map((block) => [block.id, block]));
  const seenIds = new Set();
  source.blocks.forEach((rawBlock) => {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) {
      throw new Error('Každý blok musí mít platná data.');
    }
    const rawId = String(rawBlock.id || '').trim();
    if (rawBlock.visible !== undefined && typeof rawBlock.visible !== 'boolean') {
      throw new Error('Viditelnost bloku musí být zapnutá nebo vypnutá.');
    }
    Object.values(rawBlock.content || {}).forEach((value) => {
      if (typeof value === 'string' && value.length > 6000) throw new Error('Text v bloku je příliš dlouhý.');
    });
    const definition = definitions.get(rawId);
    if (definition) {
      if (rawBlock.kind && rawBlock.kind !== definition.kind) {
        throw new Error(`Blok ${definition.label} má neplatný typ.`);
      }
    } else if (rawBlock.kind !== 'story') {
      throw new Error('Rozložení obsahuje nepodporovaný typ bloku.');
    } else if (rawId && !/^story-[a-z0-9][a-z0-9-]*$/.test(rawId)) {
      throw new Error('Vlastní blok má neplatný identifikátor.');
    }
    if (rawId) {
      if (seenIds.has(rawId)) throw new Error('Rozložení obsahuje blok dvakrát.');
      seenIds.add(rawId);
    }
    if (rawBlock.content !== undefined && (!rawBlock.content || typeof rawBlock.content !== 'object' || Array.isArray(rawBlock.content))) {
      throw new Error('Obsah bloku nemá platný formát.');
    }
  });
  return normalizeHomepageLayout(source);
}

function collectMediaIdsFromHomepageLayout(mediaIds, layout) {
  const normalized = normalizeHomepageLayout(layout);
  normalized.blocks.forEach((block) => {
    const content = block.content || {};
    collectMediaId(mediaIds, content.image);
    if (Array.isArray(content.images)) content.images.forEach((image) => collectMediaId(mediaIds, image));
  });
}

function hydrateHomepageLayout(layout, mediaMap) {
  const normalized = normalizeHomepageLayout(layout);
  normalized.blocks = normalized.blocks.map((block) => {
    const content = { ...(block.content || {}) };
    if (content.image) content.image = hydratePublicImageRef(content.image, mediaMap) || normalizeHomepageImage(content.image);
    if (Array.isArray(content.images)) {
      content.images = content.images.map((image) => hydratePublicImageRef(image, mediaMap) || normalizeHomepageImage(image));
    }
    return { ...block, content };
  });
  return normalized;
}

function normalizeSiteContentUrl(value, fieldName = 'URL') {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`${fieldName} musí začínat /, http:// nebo https://.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${fieldName} musí začínat /, http:// nebo https://.`);
  }
  return url;
}

function normalizeSiteContentImageValue(value) {
  const image = value && typeof value === 'object' ? value : {};
  return {
    url: normalizeSiteContentUrl(image.url || '', 'URL obrázku'),
    alt: String(image.alt || '').trim(),
    caption: String(image.caption || '').trim(),
    media_id: String(image.media_id || image.mediaId || '').trim()
  };
}

function normalizeSiteContentGalleryValue(value) {
  const rawImages = value && typeof value === 'object' && Array.isArray(value.images) ? value.images : [];
  const images = rawImages
    .map((image, index) => {
      const normalized = normalizeSiteContentImageValue(image);
      if (!normalized.url && !normalized.media_id) return null;
      return {
        ...normalized,
        sort_order: index,
        is_featured: index === 0
      };
    })
    .filter(Boolean)
    .map((image, index) => ({
      ...image,
      sort_order: index,
      is_featured: index === 0
    }));
  return { images };
}

function normalizeSiteContentValue(contentType, value) {
  if (contentType === 'json') {
    return value === undefined ? {} : value;
  }
  const rawValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (contentType === 'text') {
    return { text: String(rawValue.text || '').trim() };
  }
  if (contentType === 'rich_text') {
    return { html: String(rawValue.html || rawValue.text || '').trim() };
  }
  if (contentType === 'image') {
    return normalizeSiteContentImageValue(rawValue);
  }
  if (contentType === 'gallery') {
    return normalizeSiteContentGalleryValue(rawValue);
  }
  if (contentType === 'link') {
    return {
      label: String(rawValue.label || '').trim(),
      url: normalizeSiteContentUrl(rawValue.url || '', 'URL odkazu')
    };
  }
  return {};
}

function normalizeSiteContentPublishedAt(value, status) {
  if (status !== 'published') return null;
  const raw = String(value || '').trim();
  if (!raw) return nowIso();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Datum publikace není platné.');
  return date.toISOString();
}

function normalizeSiteContentInput(input) {
  const locale = String(input.locale || 'cs').trim().toLowerCase();
  const contentKey = String(input.content_key || input.contentKey || '').trim().toLowerCase();
  const section = String(input.section || '').trim().toLowerCase();
  const label = String(input.label || '').trim();
  const contentType = String(input.content_type || input.contentType || 'text').trim();
  const status = String(input.status || 'draft').trim();
  const sortOrderRaw = input.sort_order === undefined ? input.sortOrder : input.sort_order;
  const sortOrder = Number.parseInt(sortOrderRaw === undefined || sortOrderRaw === '' ? '0' : String(sortOrderRaw), 10);

  if (!locale) throw new Error('Jazyk je povinný.');
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(locale)) throw new Error('Jazyk musí mít tvar cs nebo cs-cz.');
  if (!contentKey) throw new Error('Klíč obsahu je povinný.');
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(contentKey)) {
    throw new Error('Klíč obsahu může obsahovat jen malá písmena bez diakritiky, čísla, tečky, podtržítka a pomlčky.');
  }
  if (!section) throw new Error('Sekce je povinná.');
  if (!label) throw new Error('Popisek je povinný.');
  if (!['text', 'rich_text', 'image', 'gallery', 'link', 'json'].includes(contentType)) {
    throw new Error('Typ obsahu není platný.');
  }
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error('Stav obsahu není platný.');
  }
  if (!Number.isFinite(sortOrder)) throw new Error('Pořadí musí být číslo.');

  return {
    content_key: contentKey,
    locale,
    section,
    label,
    content_type: contentType,
    value: normalizeSiteContentValue(contentType, input.value),
    status,
    sort_order: sortOrder,
    published_at: normalizeSiteContentPublishedAt(input.published_at || input.publishedAt, status)
  };
}

function sortSiteContent(contents) {
  return [...contents].sort((a, b) => {
    const aArchived = a.status === 'archived' ? 1 : 0;
    const bArchived = b.status === 'archived' ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;
    if (String(a.section || '') !== String(b.section || '')) {
      return String(a.section || '').localeCompare(String(b.section || ''), 'cs');
    }
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.label || '').localeCompare(String(b.label || ''), 'cs');
  });
}

async function listSiteContent() {
  if (!isSupabaseConfigured()) return sortSiteContent(readCmsDb().site_content);
  const rows = await supabaseRequest('site_content', {
    query: {
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at',
      order: 'section.asc,sort_order.asc,label.asc'
    }
  });
  return sortSiteContent(Array.isArray(rows) ? rows : []);
}

async function findSiteContentByKey(contentKey, locale = 'cs') {
  if (!isSupabaseConfigured()) {
    return readCmsDb().site_content.find((item) => item.content_key === contentKey && item.locale === locale) || null;
  }
  const rows = await supabaseRequest('site_content', {
    query: {
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at',
      content_key: `eq.${contentKey}`,
      locale: `eq.${locale}`,
      limit: '1'
    }
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findHomepageContentRows(locale = 'cs') {
  if (!isSupabaseConfigured()) {
    const rows = readCmsDb().site_content.filter((item) => (
      item.locale === locale && isHomepageReservedContentKey(item.content_key)
    ));
    return {
      publishedRow: rows.find((item) => item.content_key === HOMEPAGE_LAYOUT_CONTENT_KEY) || null,
      draftRow: rows.find((item) => item.content_key === HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY) || null
    };
  }
  const rows = await supabaseRequest('site_content', {
    query: {
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at',
      locale: `eq.${locale}`,
      content_key: 'in.(homepage.layout,homepage.layout.draft)'
    }
  });
  const contents = Array.isArray(rows) ? rows : [];
  return {
    publishedRow: contents.find((item) => item.content_key === HOMEPAGE_LAYOUT_CONTENT_KEY) || null,
    draftRow: contents.find((item) => item.content_key === HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY) || null
  };
}

function isHomepageReservedContentKey(contentKey) {
  return HOMEPAGE_RESERVED_CONTENT_KEYS.has(String(contentKey || '').trim().toLowerCase());
}

function assertGenericSiteContentKeyAllowed(contentKey) {
  if (isHomepageReservedContentKey(contentKey)) {
    throw new Error('Tento obsah spravuje vizuální editor domovské stránky. Ve starém editoru jej nelze měnit.');
  }
}

async function findSiteContentById(id) {
  if (!isSupabaseConfigured()) {
    return readCmsDb().site_content.find((item) => item.id === id) || null;
  }
  const rows = await supabaseRequest('site_content', {
    query: {
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at',
      id: `eq.${id}`,
      limit: '1'
    }
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function listGenericSiteContent() {
  const contents = await listSiteContent();
  return contents.filter((item) => !isHomepageReservedContentKey(item.content_key));
}

function homepageWriteUnavailableError() {
  const error = new Error('Ukládání domovské stránky vyžaduje připojení k Supabase.');
  error.statusCode = 503;
  return error;
}

function homepageConflictError() {
  const error = new Error('Koncept mezitím změnil někdo v jiném okně. Obnovte editor a zkontrolujte novější verzi.');
  error.statusCode = 409;
  return error;
}

function assertHomepageWritesAvailable() {
  if (process.env.NODE_ENV === 'production' && !isSupabaseConfigured()) {
    throw homepageWriteUnavailableError();
  }
}

function homepageLayoutContent(layout, publish) {
  return {
    content_key: publish ? HOMEPAGE_LAYOUT_CONTENT_KEY : HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY,
    section: 'homepage',
    label: publish ? 'Publikovaná domovská stránka' : 'Koncept domovské stránky',
    content_type: 'json',
    value: layout,
    status: publish ? 'published' : 'draft',
    sort_order: publish ? 0 : 1,
    published_at: publish ? nowIso() : null
  };
}

function homepageRevisionMatches(existing, expectedRevision) {
  return (expectedRevision === null && !existing)
    || (expectedRevision !== null
      && existing
      && String(existing.updated_at || '') === String(expectedRevision));
}

async function writeHomepageLayout(layout, { operation = 'draft', locale = 'cs', expectedRevision } = {}) {
  assertHomepageWritesAvailable();
  if (!['draft', 'publish', 'reset'].includes(operation)) throw new Error('Operace domovské stránky není platná.');
  if (expectedRevision === undefined) throw new Error('Chybí verze upravovaného konceptu.');
  const normalized = validateHomepageLayoutInput(layout);

  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const draftRow = db.site_content.find((item) => item.content_key === HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY && item.locale === locale);
    if (!homepageRevisionMatches(draftRow, expectedRevision)) throw homepageConflictError();

    const publishedRow = db.site_content.find((item) => item.content_key === HOMEPAGE_LAYOUT_CONTENT_KEY && item.locale === locale);
    const layoutToWrite = operation === 'reset' && publishedRow && publishedRow.status === 'published'
      ? normalizeHomepageLayout(publishedRow.value)
      : normalized;
    const draftContent = { ...homepageLayoutContent(layoutToWrite, false), locale };
    if (draftRow) updateLocalRow(draftRow, draftContent);
    else db.site_content.push(createLocalRow(draftContent));

    if (operation === 'publish') {
      const publishedContent = { ...homepageLayoutContent(layoutToWrite, true), locale };
      if (publishedRow) updateLocalRow(publishedRow, publishedContent);
      else db.site_content.push(createLocalRow(publishedContent));
    }

    writeCmsDb(db);
    return getHomepageEditorState(locale);
  }

  try {
    const result = await supabaseRequest('rpc/write_homepage_layout', {
      method: 'POST',
      body: {
        p_locale: locale,
        p_layout: normalized,
        p_expected_draft_updated_at: expectedRevision,
        p_operation: operation
      }
    });
    const state = Array.isArray(result) ? result[0] : result;
    if (!state || !state.layout) throw new Error('Supabase nevrátil uloženou domovskou stránku.');
    return {
      ...state,
      layout: normalizeHomepageLayout(state.layout),
      published_layout: state.published_layout ? normalizeHomepageLayout(state.published_layout) : null
    };
  } catch (error) {
    if (error && (error.code === '40001' || String(error.message || '').includes('homepage_revision_conflict'))) {
      throw homepageConflictError();
    }
    throw error;
  }
}

async function getHomepageEditorState(locale = 'cs') {
  const { publishedRow, draftRow } = await findHomepageContentRows(locale);
  const [legacyRows, mediaDb] = !draftRow && !publishedRow
    ? await Promise.all([listSiteContent(), getMediaDb()])
    : [[], null];
  const layout = draftRow
    ? normalizeHomepageLayout(draftRow.value)
    : publishedRow
      ? normalizeHomepageLayout(publishedRow.value)
      : applyManagedImagesToHomepageLayout(
          homepageLayoutFromLegacyRows(legacyRows.filter((item) => item.locale === locale)),
          mediaDb
        );
  return {
    ok: true,
    locale,
    has_draft: Boolean(draftRow),
    has_published_layout: Boolean(publishedRow),
    draft_revision: draftRow ? draftRow.updated_at : null,
    draft_updated_at: draftRow ? draftRow.updated_at : null,
    published_at: publishedRow ? publishedRow.published_at : null,
    published_revision: publishedRow ? publishedRow.updated_at : null,
    is_dirty: Boolean(draftRow && (!publishedRow || JSON.stringify(normalizeHomepageLayout(draftRow.value)) !== JSON.stringify(normalizeHomepageLayout(publishedRow.value)))),
    layout,
    published_layout: publishedRow ? normalizeHomepageLayout(publishedRow.value) : null
  };
}

async function saveHomepageDraft(layout, { locale = 'cs', expectedRevision } = {}) {
  return writeHomepageLayout(layout, { locale, expectedRevision, operation: 'draft' });
}

async function publishHomepageLayout(layout, { locale = 'cs', expectedRevision } = {}) {
  return writeHomepageLayout(layout, { locale, expectedRevision, operation: 'publish' });
}

async function resetHomepageDraft({ locale = 'cs', expectedRevision } = {}) {
  const publishedRow = await findSiteContentByKey(HOMEPAGE_LAYOUT_CONTENT_KEY, locale);
  const layout = publishedRow && publishedRow.status === 'published'
    ? normalizeHomepageLayout(publishedRow.value)
    : defaultHomepageLayout();
  return writeHomepageLayout(layout, { locale, expectedRevision, operation: 'reset' });
}

function isPublishedAtPublic(value) {
  if (!value) return true;
  const publishedAt = new Date(value).getTime();
  return Number.isFinite(publishedAt) && publishedAt <= Date.now();
}

function isPublicProduct(product) {
  return Boolean(
    product
    && product.is_visible
    && product.is_published
    && !product.archived_at
    && isPublishedAtPublic(product.published_at)
  );
}

function isPublicProductCategory(category) {
  return Boolean(category && category.is_visible && !category.archived_at);
}

function isPublicBlogPost(post) {
  return Boolean(
    post
    && post.status === 'published'
    && isPublishedAtPublic(post.published_at)
  );
}

function isPublicBlogCategory(category) {
  return Boolean(category && category.is_visible && !category.archived_at);
}

function isPublicSiteContentItem(item, locale) {
  return Boolean(
    item
    && item.locale === locale
    && item.content_key !== HOMEPAGE_LAYOUT_DRAFT_CONTENT_KEY
    && item.status === 'published'
    && isPublishedAtPublic(item.published_at)
  );
}

function collectMediaId(mediaIds, value) {
  if (!value || typeof value !== 'object') return;
  const mediaId = String(value.media_id || value.mediaId || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId)) {
    mediaIds.add(mediaId);
  }
}

function collectMediaIdsFromPhotos(mediaIds, photos) {
  if (!Array.isArray(photos)) return;
  photos.forEach((photo) => collectMediaId(mediaIds, photo));
}

function collectMediaIdsFromSiteValue(mediaIds, contentType, value, contentKey = '') {
  if (!value || typeof value !== 'object') return;
  if (contentKey === HOMEPAGE_LAYOUT_CONTENT_KEY) {
    collectMediaIdsFromHomepageLayout(mediaIds, value);
    return;
  }
  if (contentType === 'image') collectMediaId(mediaIds, value);
  if (contentType === 'gallery' && Array.isArray(value.images)) {
    value.images.forEach((image) => collectMediaId(mediaIds, image));
  }
}

async function fetchPublicMediaMap(mediaIds) {
  const ids = [...mediaIds];
  if (!ids.length) return new Map();

  const rows = await supabaseRequest('media', {
    query: {
      select: 'id,public_url,alt_text,caption,is_public',
      id: `in.(${ids.join(',')})`
    }
  });

  const mediaMap = new Map();
  (Array.isArray(rows) ? rows : []).forEach((media) => {
    if (media && media.is_public !== false && media.public_url) mediaMap.set(media.id, media);
  });
  return mediaMap;
}

function hydratePublicImageRef(image, mediaMap) {
  const source = image && typeof image === 'object' ? image : {};
  const mediaId = String(source.media_id || source.mediaId || '').trim();
  const media = mediaId ? mediaMap.get(mediaId) : null;
  const url = String((media && media.public_url) || source.url || '').trim();
  if (!url) return null;

  return {
    media_id: mediaId || '',
    url,
    alt: String(source.alt || (media && media.alt_text) || '').trim(),
    caption: String(source.caption || (media && media.caption) || '').trim(),
    sort_order: Number.isFinite(Number(source.sort_order)) ? Number(source.sort_order) : 0,
    is_featured: source.is_featured === true
  };
}

function hydratePublicPhotos(photos, mediaMap) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((photo, index) => hydratePublicImageRef({ ...photo, sort_order: photo.sort_order ?? index }, mediaMap))
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((photo, index) => ({
      ...photo,
      sort_order: index,
      is_featured: index === 0 || photo.is_featured === true
    }));
}

function hydratePublicSiteValue(item, mediaMap) {
  const value = item.value && typeof item.value === 'object' ? item.value : {};
  if (item.content_key === HOMEPAGE_LAYOUT_CONTENT_KEY) return hydrateHomepageLayout(value, mediaMap);
  if (item.content_type === 'image') return hydratePublicImageRef(value, mediaMap);
  if (item.content_type === 'gallery') {
    const images = Array.isArray(value.images) ? value.images : [];
    return { images: hydratePublicPhotos(images, mediaMap) };
  }
  return value;
}

async function getPublicCmsPayload(locale = 'cs') {
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const publicRows = {
      siteContentRows: db.site_content,
      productRows: db.products,
      productCategoryRows: db.product_categories,
      productLinkRows: db.product_category_links,
      productFilterRows: db.product_filters,
      productFilterOptionRows: db.product_filter_options,
      productFilterLinkRows: db.product_filter_value_links,
      blogPostRows: db.blog_posts,
      blogCategoryRows: db.blog_categories,
      blogLinkRows: db.blog_category_links
    };
    const hasAnyContent = publicRows.siteContentRows.length
      || publicRows.productRows.length
      || publicRows.productCategoryRows.length
      || publicRows.blogPostRows.length
      || publicRows.blogCategoryRows.length;
    if (!hasAnyContent) {
      return { ok: true, configured: false, locale, homepage_layout: null, site_content: {}, products: [], product_categories: [], product_filters: [], blog_posts: [], blog_categories: [] };
    }
    return buildPublicCmsPayload(locale, publicRows, new Map());
  }

  const [
    siteContentRows,
    productRows,
    productCategoryRows,
    productLinkRows,
    blogPostRows,
    blogCategoryRows,
    blogLinkRows,
    productFilterRows,
    productFilterOptionRows,
    productFilterLinkRows
  ] = await Promise.all([
    supabaseRequest('site_content', {
      query: {
        select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,updated_at',
        order: 'section.asc,sort_order.asc,label.asc'
      }
    }),
    supabaseRequest('products', {
      query: {
        select: 'id,title,slug,short_description,description,photos,price,wood_types,availability,use_context,sort_order,is_visible,is_published,published_at,archived_at,updated_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('product_categories', {
      query: {
        select: 'id,title,slug,description,image,parent_id,sort_order,is_visible,archived_at,updated_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('product_category_links', {
      query: {
        select: 'product_id,category_id,sort_order',
        order: 'sort_order.asc'
      }
    }),
    supabaseRequest('blog_posts', {
      query: {
        select: 'id,title,slug,excerpt,main_content,content_format,photos,author_name,status,published_at,sort_order,updated_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('blog_categories', {
      query: {
        select: 'id,title,slug,description,image,sort_order,is_visible,archived_at,updated_at',
        order: 'sort_order.asc,title.asc'
      }
    }),
    supabaseRequest('blog_category_links', {
      query: {
        select: 'blog_post_id,category_id,sort_order',
        order: 'sort_order.asc'
      }
    }),
    supabaseRequest('product_filters', { query: { select: 'id,title,slug,description,sort_order,is_visible,archived_at', order: 'sort_order.asc,title.asc' } }),
    supabaseRequest('product_filter_options', { query: { select: 'id,filter_id,title,slug,sort_order,is_visible,archived_at', order: 'sort_order.asc,title.asc' } }),
    supabaseRequest('product_filter_value_links', { query: { select: 'product_id,option_id' } })
  ]);

  return buildPublicCmsPayload(locale, {
    siteContentRows,
    productRows,
    productCategoryRows,
    productLinkRows,
    blogPostRows,
    blogCategoryRows,
    blogLinkRows,
    productFilterRows,
    productFilterOptionRows,
    productFilterLinkRows
  });
}

async function buildPublicCmsPayload(locale, rows, givenMediaMap) {
  const {
    siteContentRows,
    productRows,
    productCategoryRows,
    productLinkRows,
    blogPostRows,
    blogCategoryRows,
    blogLinkRows,
    productFilterRows,
    productFilterOptionRows,
    productFilterLinkRows
  } = rows;
  const siteContent = sortSiteContent((Array.isArray(siteContentRows) ? siteContentRows : []).filter((item) => isPublicSiteContentItem(item, locale)));
  const products = sortProducts((Array.isArray(productRows) ? productRows : []).filter(isPublicProduct));
  const productCategories = sortProductCategories((Array.isArray(productCategoryRows) ? productCategoryRows : []).filter(isPublicProductCategory));
  const blogPosts = sortBlogPosts((Array.isArray(blogPostRows) ? blogPostRows : []).filter(isPublicBlogPost));
  const blogCategories = sortBlogCategories((Array.isArray(blogCategoryRows) ? blogCategoryRows : []).filter(isPublicBlogCategory));
  const productFilters = sortCustomFilters((Array.isArray(productFilterRows) ? productFilterRows : []).filter(isPublicProductCategory));
  const publicFilterIds = new Set(productFilters.map((filter) => filter.id));
  const productFilterOptions = sortCustomFilters((Array.isArray(productFilterOptionRows) ? productFilterOptionRows : []).filter((option) => isPublicProductCategory(option) && publicFilterIds.has(option.filter_id)));
  const publicOptionIds = new Set(productFilterOptions.map((option) => option.id));
  const publicProductIds = new Set(products.map((product) => product.id));
  const publicProductCategoryIds = new Set(productCategories.map((category) => category.id));
  const publicBlogPostIds = new Set(blogPosts.map((post) => post.id));
  const publicBlogCategoryIds = new Set(blogCategories.map((category) => category.id));
  const productLinks = (Array.isArray(productLinkRows) ? productLinkRows : []).filter((link) => (
    publicProductIds.has(link.product_id) && publicProductCategoryIds.has(link.category_id)
  ));
  const blogLinks = (Array.isArray(blogLinkRows) ? blogLinkRows : []).filter((link) => (
    publicBlogPostIds.has(link.blog_post_id) && publicBlogCategoryIds.has(link.category_id)
  ));
  const productFilterLinks = (Array.isArray(productFilterLinkRows) ? productFilterLinkRows : []).filter((link) => publicProductIds.has(link.product_id) && publicOptionIds.has(link.option_id));

  const mediaIds = new Set();
  siteContent.forEach((item) => collectMediaIdsFromSiteValue(mediaIds, item.content_type, item.value, item.content_key));
  productCategories.forEach((category) => collectMediaId(mediaIds, category.image));
  products.forEach((product) => collectMediaIdsFromPhotos(mediaIds, product.photos));
  blogCategories.forEach((category) => collectMediaId(mediaIds, category.image));
  blogPosts.forEach((post) => collectMediaIdsFromPhotos(mediaIds, post.photos));
  const mediaMap = givenMediaMap || await fetchPublicMediaMap(mediaIds);

  const productCategoryMap = new Map(productCategories.map((category) => [category.id, {
    id: category.id,
    title: category.title,
    slug: category.slug,
    description: category.description || '',
    parent_id: category.parent_id || null,
    image: hydratePublicImageRef(category.image, mediaMap),
    sort_order: category.sort_order || 0
  }]));
  const blogCategoryMap = new Map(blogCategories.map((category) => [category.id, {
    id: category.id,
    title: category.title,
    slug: category.slug,
    description: category.description || '',
    image: hydratePublicImageRef(category.image, mediaMap),
    sort_order: category.sort_order || 0
  }]));

  const productLinksByProduct = new Map();
  productLinks.forEach((link) => {
    if (!productLinksByProduct.has(link.product_id)) productLinksByProduct.set(link.product_id, []);
    productLinksByProduct.get(link.product_id).push(link);
  });
  const blogLinksByPost = new Map();
  blogLinks.forEach((link) => {
    if (!blogLinksByPost.has(link.blog_post_id)) blogLinksByPost.set(link.blog_post_id, []);
    blogLinksByPost.get(link.blog_post_id).push(link);
  });
  const filterOptionMap = new Map(productFilterOptions.map((option) => [option.id, option]));
  const productFilterLinksByProduct = new Map();
  productFilterLinks.forEach((link) => {
    if (!productFilterLinksByProduct.has(link.product_id)) productFilterLinksByProduct.set(link.product_id, []);
    productFilterLinksByProduct.get(link.product_id).push(link);
  });

  const publicProducts = products.map((product) => {
    const photos = hydratePublicPhotos(product.photos, mediaMap);
    const categories = (productLinksByProduct.get(product.id) || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((link) => productCategoryMap.get(link.category_id))
      .filter(Boolean);
    const filterOptions = (productFilterLinksByProduct.get(product.id) || []).map((link) => filterOptionMap.get(link.option_id)).filter(Boolean).map((option) => ({ id: option.id, filter_id: option.filter_id, title: option.title, slug: option.slug }));
    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      short_description: product.short_description || '',
      description: product.description || '',
      price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
      wood_types: Array.isArray(product.wood_types) ? product.wood_types : [],
      availability: product.availability || '',
      use_context: Array.isArray(product.use_context) ? product.use_context : [],
      photos,
      featured_image: photos[0] || null,
      categories,
      filter_options: filterOptions,
      published_at: product.published_at || null,
      updated_at: product.updated_at || null
    };
  });

  const publicBlogPosts = blogPosts.map((post) => {
    const photos = hydratePublicPhotos(post.photos, mediaMap);
    const categories = (blogLinksByPost.get(post.id) || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((link) => blogCategoryMap.get(link.category_id))
      .filter(Boolean);
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      main_content: post.main_content || '',
      content_format: post.content_format || 'html',
      photos,
      featured_image: photos[0] || null,
      author_name: post.author_name || '',
      categories,
      published_at: post.published_at || null,
      updated_at: post.updated_at || null
    };
  });

  const publicSiteContent = {};
  siteContent.forEach((item) => {
    publicSiteContent[item.content_key] = {
      id: item.id,
      content_key: item.content_key,
      section: item.section,
      label: item.label,
      content_type: item.content_type,
      value: hydratePublicSiteValue(item, mediaMap),
      sort_order: item.sort_order || 0,
      published_at: item.published_at || null,
      updated_at: item.updated_at || null
    };
  });

  return {
    ok: true,
    configured: true,
    locale,
    homepage_layout: publicSiteContent[HOMEPAGE_LAYOUT_CONTENT_KEY]
      ? publicSiteContent[HOMEPAGE_LAYOUT_CONTENT_KEY].value
      : null,
    site_content: publicSiteContent,
    products: publicProducts,
    product_categories: [...productCategoryMap.values()],
    product_filters: attachFilterOptions(productFilters, productFilterOptions).map((filter) => ({ id: filter.id, title: filter.title, slug: filter.slug, description: filter.description || '', sort_order: filter.sort_order || 0, options: filter.options.map((option) => ({ id: option.id, title: option.title, slug: option.slug, sort_order: option.sort_order || 0 })) })),
    blog_posts: publicBlogPosts,
    blog_categories: [...blogCategoryMap.values()]
  };
}

async function assertSiteContentKeyUnique(locale, contentKey, excludeId = '') {
  if (!isSupabaseConfigured()) {
    const exists = readCmsDb().site_content.some((item) => (
      item.locale === locale
      && item.content_key === contentKey
      && item.id !== excludeId
    ));
    if (exists) throw new Error('Tento klíč obsahu už pro daný jazyk existuje.');
    return;
  }
  const query = {
    select: 'id',
    locale: `eq.${locale}`,
    content_key: `eq.${contentKey}`,
    limit: '1'
  };
  if (excludeId) query.id = `neq.${excludeId}`;
  const rows = await supabaseRequest('site_content', { query });
  if (Array.isArray(rows) && rows.length) throw new Error('Tento klíč obsahu už pro daný jazyk existuje.');
}

async function createSiteContent(input) {
  const content = normalizeSiteContentInput(input);
  assertGenericSiteContentKeyAllowed(content.content_key);
  await assertSiteContentKeyUnique(content.locale, content.content_key);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const created = createLocalRow(content);
    db.site_content.push(created);
    writeCmsDb(db);
    return created;
  }
  const rows = await supabaseRequest('site_content', {
    method: 'POST',
    body: content,
    prefer: 'return=representation',
    query: { select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at' }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateSiteContent(id, input) {
  assertUuid(id);
  const existing = await findSiteContentById(id);
  if (!existing) throw new Error('Obsah nebyl nalezen.');
  assertGenericSiteContentKeyAllowed(existing.content_key);
  const content = normalizeSiteContentInput(input);
  assertGenericSiteContentKeyAllowed(content.content_key);
  await assertSiteContentKeyUnique(content.locale, content.content_key, id);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.site_content.find((item) => item.id === id);
    if (!row) throw new Error('Obsah nebyl nalezen.');
    updateLocalRow(row, content);
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('site_content', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      content_key: 'not.in.(homepage.layout,homepage.layout.draft)',
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at'
    },
    body: content,
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Obsah nebyl nalezen.');
  return rows[0];
}

async function archiveSiteContent(id) {
  assertUuid(id);
  const existing = await findSiteContentById(id);
  if (!existing) throw new Error('Obsah nebyl nalezen.');
  assertGenericSiteContentKeyAllowed(existing.content_key);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.site_content.find((item) => item.id === id);
    if (!row) throw new Error('Obsah nebyl nalezen.');
    updateLocalRow(row, { status: 'archived', published_at: null });
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('site_content', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      content_key: 'not.in.(homepage.layout,homepage.layout.draft)',
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at'
    },
    body: {
      status: 'archived',
      published_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Obsah nebyl nalezen.');
  return rows[0];
}

async function restoreSiteContent(id) {
  assertUuid(id);
  const existing = await findSiteContentById(id);
  if (!existing) throw new Error('Obsah nebyl nalezen.');
  assertGenericSiteContentKeyAllowed(existing.content_key);
  if (!isSupabaseConfigured()) {
    const db = readCmsDb();
    const row = db.site_content.find((item) => item.id === id);
    if (!row) throw new Error('Obsah nebyl nalezen.');
    updateLocalRow(row, { status: 'draft', published_at: null });
    writeCmsDb(db);
    return row;
  }
  const rows = await supabaseRequest('site_content', {
    method: 'PATCH',
    query: {
      id: `eq.${id}`,
      content_key: 'not.in.(homepage.layout,homepage.layout.draft)',
      select: 'id,content_key,locale,section,label,content_type,value,status,sort_order,published_at,created_at,updated_at'
    },
    body: {
      status: 'draft',
      published_at: null
    },
    prefer: 'return=representation'
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Obsah nebyl nalezen.');
  return rows[0];
}

function validateUploadedImage(file) {
  const mimeType = String(file.mime_type || '').toLowerCase();
  const extension = IMAGE_EXTENSIONS[mimeType] || IMAGE_EXTENSIONS[mimeType.split(';')[0]];
  if (!extension) throw new Error('Podporované jsou jen JPG, PNG, WebP nebo GIF obrázky.');
  if (!file.buffer.length) throw new Error('Vyberte obrázek k nahrání.');
  const bytes = file.buffer;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const gifHeader = bytes.length >= 6 ? bytes.subarray(0, 6).toString('ascii') : '';
  const isGif = gifHeader === 'GIF87a' || gifHeader === 'GIF89a';
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const signatureMatches = extension === '.jpg' ? isJpeg : extension === '.png' ? isPng : extension === '.gif' ? isGif : isWebp;
  if (!signatureMatches) throw new Error('Soubor není platný obrázek nebo neodpovídá vybranému formátu.');
  return { mimeType, extension };
}

function persistLocalUploadedImage(file, fields, session) {
  const { mimeType, extension } = validateUploadedImage(file);
  const targetType = fields.targetType || 'site_sections';
  const targetKeySource = fields.targetKey || fields.targetLabel || targetType;
  const targetSlug = slugify(targetKeySource, 'target');
  const originalName = path.basename(file.filename || `image${extension}`);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${slugify(path.basename(originalName, path.extname(originalName)), 'image')}${extension}`;
  const relativeDir = path.join(targetType, targetSlug);
  const absoluteDir = path.join(UPLOAD_DIR, relativeDir);
  const storagePath = path.join('uploads', relativeDir, filename);
  const absolutePath = path.join(absoluteDir, filename);

  fs.mkdirSync(absoluteDir, { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);

  const createdAt = nowIso();
  return {
    id: crypto.randomUUID(),
    bucket: 'local',
    storage_path: storagePath.split(path.sep).join('/'),
    public_url: `/${storagePath.split(path.sep).join('/')}`,
    alt_text: fields.alt || '',
    caption: fields.caption || '',
    mime_type: mimeType,
    size_bytes: file.buffer.length,
    width: null,
    height: null,
    is_public: true,
    metadata: {
      original_name: originalName,
      uploaded_by_email: session.email,
      target_type: targetType,
      target_key: fields.targetKey || '',
      target_label: fields.targetLabel || '',
      sort_order: Number.isFinite(Number(fields.sortOrder)) ? Number(fields.sortOrder) : 0,
      is_featured: fields.isFeatured === true || fields.isFeatured === 'true',
      storage: 'local'
    },
    created_at: createdAt,
    updated_at: createdAt
  };
}

async function persistSupabaseUploadedImage(file, fields, session) {
  const { mimeType, extension } = validateUploadedImage(file);
  const targetType = fields.targetType || 'site_sections';
  const bucket = mediaBucketForTargetType(targetType);
  const targetSlug = slugify(fields.targetKey || fields.targetLabel || targetType, 'target');
  const originalName = path.basename(file.filename || `image${extension}`);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${slugify(path.basename(originalName, path.extname(originalName)), 'image')}${extension}`;
  const storagePath = `${targetSlug}/${filename}`;
  const createdAt = nowIso();
  const media = {
    id: crypto.randomUUID(),
    bucket,
    storage_path: storagePath,
    public_url: publicSupabaseStorageUrl(bucket, storagePath),
    alt_text: fields.alt || '',
    caption: fields.caption || '',
    mime_type: mimeType,
    size_bytes: file.buffer.length,
    width: null,
    height: null,
    is_public: true,
    metadata: {
      original_name: originalName,
      uploaded_by_email: session.email,
      target_type: targetType,
      target_key: fields.targetKey || '',
      target_label: fields.targetLabel || '',
      sort_order: Number.isFinite(Number(fields.sortOrder)) ? Number(fields.sortOrder) : 0,
      is_featured: fields.isFeatured === true || fields.isFeatured === 'true',
      storage: 'supabase'
    },
    created_at: createdAt,
    updated_at: createdAt
  };

  await uploadSupabaseStorageObject(bucket, storagePath, file);
  let rows;
  try {
    rows = await supabaseRequest('media', {
      method: 'POST',
      body: media,
      prefer: 'return=representation',
      query: {
        select: 'id,bucket,storage_path,public_url,alt_text,caption,mime_type,size_bytes,width,height,is_public,metadata,created_at,updated_at'
      }
    });
  } catch (error) {
    deleteSupabaseStorageObject(media).catch((deleteError) => {
      console.error('Failed to clean up Supabase upload after media insert error:', deleteError);
    });
    throw error;
  }

  return Array.isArray(rows) && rows[0] ? rows[0] : media;
}

async function persistUploadedImage(file, fields, session) {
  return isSupabaseConfigured()
    ? persistSupabaseUploadedImage(file, fields, session)
    : persistLocalUploadedImage(file, fields, session);
}

async function handleMediaUpload(req, res, session) {
  try {
    const { fields, files } = await parseMultipart(req);
    const image = files.image;
    if (!image) throw new Error('Vyberte obrázek k nahrání.');

    const db = await getMediaDb();
    const targetType = fields.targetType || 'site_sections';
    const target = getTarget(db, targetType, fields.targetKey, fields.targetLabel);
    const replaceMediaId = fields.replaceMediaId || '';
    const replaceIndex = replaceMediaId
      ? target.images.findIndex((entry) => entry.media_id === replaceMediaId)
      : -1;
    const mediaIndex = replaceIndex !== -1 ? replaceIndex : (targetType === 'site_sections' ? 0 : target.images.length);
    const mediaFields = {
      ...fields,
      targetType,
      targetKey: target.key,
      targetLabel: target.label || fields.targetLabel || target.key,
      sortOrder: mediaIndex,
      isFeatured: mediaIndex === 0
    };
    const media = await persistUploadedImage(image, mediaFields, session);
    const photo = createPhotoRef(media, mediaIndex);
    photo.alt = fields.alt || target.label || '';
    photo.caption = fields.caption || '';

    db.media.push(media);
    if (replaceIndex !== -1) {
      const [oldPhoto] = target.images.splice(replaceIndex, 1, photo);
      await deleteUnreferencedMedia(db, oldPhoto.media_id);
    } else if (targetType === 'site_sections') {
      const oldImages = target.images.splice(0, target.images.length, photo);
      for (const oldPhoto of oldImages) {
        await deleteUnreferencedMedia(db, oldPhoto.media_id);
      }
    } else {
      target.images.push(photo);
    }

    updateImageOrdering(target.images);
    if (!isSupabaseConfigured()) writeMediaDb(db);
    sendJson(res, 201, { ok: true, media, target });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Nahrání se nepodařilo.' });
  }
}

async function handleMediaDelete(req, res) {
  try {
    const body = await parseJsonBody(req);
    const db = await getMediaDb();
    const targetType = body.targetType;
    const targetKey = body.targetKey;
    const mediaId = body.mediaId;
    if (!TARGET_TYPES[targetType] || !targetKey || !mediaId) {
      throw new Error('Chybí údaje pro smazání fotky.');
    }
    if (await hasPersistedMediaReference(mediaId)) {
      const error = new Error('Fotku stále používá uložený obsah. Nejprve ji odeberte ze všech bloků, výrobků nebo článků.');
      error.statusCode = 409;
      throw error;
    }

    const target = db.targets[targetType] && db.targets[targetType][targetKey];
    if (!target || !Array.isArray(target.images)) throw new Error('Položka nebyla nalezena.');

    const before = target.images.length;
    target.images = target.images.filter((image) => image.media_id !== mediaId);
    if (target.images.length === before) throw new Error('Fotka nebyla nalezena.');
    updateImageOrdering(target.images);

    await deleteUnreferencedMedia(db, mediaId);

    if (!isSupabaseConfigured()) writeMediaDb(db);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Smazání se nepodařilo.' });
  }
}

async function handleProductPhotoUpload(req, res, session) {
  try {
    const { fields, files } = await parseMultipart(req);
    const image = files.image;
    if (!image) throw new Error('Vyberte obrázek k nahrání.');

    const db = await getMediaDb();
    const targetFields = {
      ...fields,
      targetType: 'products',
      targetKey: slugify(fields.targetKey || fields.targetLabel || 'vyrobek', 'vyrobek'),
      targetLabel: fields.targetLabel || fields.targetKey || 'Výrobek'
    };
    const target = getTarget(db, 'products', targetFields.targetKey, targetFields.targetLabel);
    const mediaFields = {
      ...targetFields,
      targetKey: target.key,
      targetLabel: target.label || targetFields.targetLabel,
      sortOrder: target.images.length,
      isFeatured: target.images.length === 0
    };
    const media = await persistUploadedImage(image, mediaFields, session);
    const photo = createPhotoRef(media, target.images.length);
    photo.alt = fields.alt || target.label || '';
    photo.caption = fields.caption || '';
    target.images.push(photo);
    db.media.push(media);
    updateImageOrdering(target.images);
    if (!isSupabaseConfigured()) writeMediaDb(db);
    sendJson(res, 201, { ok: true, media, photo, target });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || 'Nahrání se nepodařilo.' });
  }
}

async function handleBlogPostPhotoUpload(req, res, session) {
  try {
    const { fields, files } = await parseMultipart(req);
    const image = files.image;
    if (!image) throw new Error('Vyberte obrázek k nahrání.');

    const db = await getMediaDb();
    const targetFields = {
      ...fields,
      targetType: 'blog_posts',
      targetKey: slugify(fields.targetKey || fields.targetLabel || 'clanek', 'clanek'),
      targetLabel: fields.targetLabel || fields.targetKey || 'Článek'
    };
    const target = getTarget(db, 'blog_posts', targetFields.targetKey, targetFields.targetLabel);
    const mediaFields = {
      ...targetFields,
      targetKey: target.key,
      targetLabel: target.label || targetFields.targetLabel,
      sortOrder: target.images.length,
      isFeatured: target.images.length === 0
    };
    const media = await persistUploadedImage(image, mediaFields, session);
    const photo = createPhotoRef(media, target.images.length);
    photo.alt = fields.alt || target.label || '';
    photo.caption = fields.caption || '';
    target.images.push(photo);
    db.media.push(media);
    updateImageOrdering(target.images);
    if (!isSupabaseConfigured()) writeMediaDb(db);
    sendJson(res, 201, { ok: true, media, photo, target });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || 'Nahrání se nepodařilo.' });
  }
}

async function handleSiteContentPhotoUpload(req, res, session) {
  try {
    assertHomepageWritesAvailable();
    const { fields, files } = await parseMultipart(req);
    const image = files.image;
    if (!image) throw new Error('Vyberte obrázek k nahrání.');

    const db = await getMediaDb();
    const targetFields = {
      ...fields,
      targetType: 'site_sections',
      targetKey: slugify(fields.targetKey || fields.targetLabel || 'sekce-webu', 'sekce-webu'),
      targetLabel: fields.targetLabel || fields.targetKey || 'Sekce webu'
    };
    const target = getTarget(db, 'site_sections', targetFields.targetKey, targetFields.targetLabel);
    const mediaFields = {
      ...targetFields,
      targetKey: target.key,
      targetLabel: target.label || targetFields.targetLabel,
      sortOrder: target.images.length,
      isFeatured: target.images.length === 0
    };
    const media = await persistUploadedImage(image, mediaFields, session);
    const photo = createPhotoRef(media, target.images.length);
    photo.alt = fields.alt || target.label || '';
    photo.caption = fields.caption || '';

    target.images.push(photo);
    db.media.push(media);
    updateImageOrdering(target.images);
    if (!isSupabaseConfigured()) writeMediaDb(db);
    sendJson(res, 201, { ok: true, media, photo, target });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Nahrání se nepodařilo.' });
  }
}

function normalizeProductRouteSlug(pathname) {
  const decodedPath = decodeURIComponent(pathname || '').replace(/\/+$/, '');
  const segments = decodedPath.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'vyrobek') return '';
  return slugify(segments[1], '');
}

function fallbackProduct(slug) {
  const product = DEFAULT_CMS_PRODUCTS.find((item) => item.slug === slug);
  if (!product) return null;
  return {
    ...product,
    photos: product.image ? [{ url: product.image, alt: product.title, is_featured: true, sort_order: 0 }] : [],
    featured_image: product.image ? { url: product.image, alt: product.title } : null,
    categories: [],
    filter_options: []
  };
}

async function getPublicProduct(slug, locale = 'cs') {
  const payload = await getPublicCmsPayload(locale);
  const product = (payload.products || []).find((item) => item.slug === slug);
  return product || fallbackProduct(slug);
}

function publicProductPhotos(product) {
  const candidates = [];
  if (product.featured_image && product.featured_image.url) candidates.push(product.featured_image);
  if (Array.isArray(product.photos)) candidates.push(...product.photos);
  if (product.image) candidates.push({ url: product.image, alt: product.title || '' });

  const seen = new Set();
  return candidates.filter((photo) => {
    if (!photo || !photo.url || seen.has(photo.url)) return false;
    seen.add(photo.url);
    return true;
  });
}

function publicProductAvailability(product) {
  if (product.availability === 'in_stock') return { label: 'Skladem', schema: 'https://schema.org/InStock' };
  if (product.availability === 'made_to_order') return { label: 'Na objednávku', schema: 'https://schema.org/PreOrder' };
  return { label: 'Dostupnost na dotaz', schema: 'https://schema.org/LimitedAvailability' };
}

function renderPublicProductPage(product, statusCode = 200) {
  const photos = publicProductPhotos(product);
  const primaryPhoto = photos[0] || null;
  const title = product.title || 'Výrobek Dřevito';
  const summary = product.short_description || stripHtmlToText(product.description || '') || 'Originální výrobek z dílny Dřevito.';
  const descriptionBlocks = textBlocks(stripHtmlToText(product.description || product.short_description || ''));
  const availability = publicProductAvailability(product);
  const price = Number(product.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const formattedPrice = hasPrice
    ? new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(price)
    : 'Cena na dotaz';
  const categoryNames = Array.isArray(product.categories)
    ? product.categories.map((category) => category && category.title).filter(Boolean)
    : [];
  const useLabels = { interior: 'Do interiéru', exterior: 'Do exteriéru' };
  const detailTags = [
    ...(Array.isArray(product.wood_types) ? product.wood_types : []),
    ...(Array.isArray(product.use_context) ? product.use_context.map((item) => useLabels[item] || item) : []),
    ...(Array.isArray(product.filter_options) ? product.filter_options.map((option) => option && option.title).filter(Boolean) : [])
  ];
  const categoryLine = categoryNames.join(' · ') || 'Originál z dílny Dřevito';
  const descriptionHtml = descriptionBlocks.length
    ? descriptionBlocks.map((block) => `<p>${escapeHtml(block)}</p>`).join('')
    : '<p>Podrobnější informace k tomuto výrobku pro vás právě připravujeme. Rádi vše doplníme při osobní domluvě.</p>';
  const primaryImageHtml = primaryPhoto
    ? `<img src="${escapeHtml(primaryPhoto.url)}" alt="${escapeHtml(primaryPhoto.alt || title)}">`
    : `<div class="product-visual-placeholder">${escapeHtml(title)}</div>`;
  const secondaryImagesHtml = photos.slice(1, 4).length
    ? `<div class="gallery-grid">${photos.slice(1, 4).map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt || title)}" loading="lazy"></figure>`).join('')}</div>`
    : '';
  const tagsHtml = detailTags.length
    ? `<div class="tags">${detailTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';
  const primaryAction = '<a class="button button--primary" href="mailto:info@drevito.cz">Poptat výrobek</a>';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: summary,
    image: photos.map((photo) => photo.url),
    sku: product.legacy_id || product.id || undefined,
    brand: { '@type': 'Brand', name: 'Dřevito' },
    offers: {
      '@type': 'Offer',
      url: `/vyrobek/${product.slug}`,
      priceCurrency: 'CZK',
      ...(hasPrice ? { price } : {}),
      availability: availability.schema
    }
  };
  const schemaJson = JSON.stringify(schema).replace(/</g, '\\u003c');

  return {
    statusCode,
    html: `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Dřevito</title>
  <meta name="description" content="${escapeHtml(summary.slice(0, 160))}">
  <link rel="canonical" href="/vyrobek/${escapeHtml(product.slug)}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(title)} | Dřevito">
  <meta property="og:description" content="${escapeHtml(summary.slice(0, 200))}">
  ${primaryPhoto ? `<meta property="og:image" content="${escapeHtml(primaryPhoto.url)}">` : ''}
  <link rel="icon" href="/favicon.ico?v=20260622-3" sizes="any">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script type="application/ld+json">${schemaJson}</script>
  <style>
    :root {
      --bg: #f1eadf;
      --panel: #fffcf6;
      --ink: #2b2118;
      --muted: #706255;
      --accent: #b67842;
      --accent-dark: #7b4726;
      --forest: #314139;
      --sand: #ded2c1;
      --display: 'Fraunces', Georgia, serif;
      --body: 'Manrope', system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 90% 5%, rgba(182, 120, 66, 0.13), transparent 30rem),
        var(--bg);
      color: var(--ink);
      font-family: var(--body);
      line-height: 1.65;
    }
    a { color: inherit; }
    :focus-visible { outline: 3px solid rgba(182, 120, 66, 0.6); outline-offset: 4px; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid rgba(43, 33, 24, 0.1);
      background: rgba(241, 234, 223, 0.94);
      backdrop-filter: blur(14px);
    }
    .topbar-inner {
      width: min(1240px, calc(100% - 40px));
      min-height: 82px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 28px;
    }
    .brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; }
    .brand img { width: 66px; height: 66px; object-fit: contain; }
    .brand span { font: 600 1.15rem/1 var(--display); letter-spacing: 0.04em; }
    .topnav { display: flex; align-items: center; gap: clamp(16px, 2.5vw, 34px); }
    .topnav a { color: rgba(43, 33, 24, 0.76); font-size: 0.82rem; font-weight: 700; text-decoration: none; }
    .topnav a:hover { color: var(--accent-dark); }
    .breadcrumbs {
      width: min(1240px, calc(100% - 40px));
      margin: 0 auto;
      padding: 25px 0 0;
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .breadcrumbs a { text-decoration: none; }
    .breadcrumbs span { margin: 0 8px; color: rgba(112, 98, 85, 0.5); }
    main { width: min(1240px, calc(100% - 40px)); margin: 0 auto; padding: clamp(38px, 6vw, 76px) 0 90px; }
    .product-hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr); gap: clamp(42px, 7vw, 92px); align-items: center; }
    .product-visual { position: relative; }
    .product-visual::before {
      content: '';
      position: absolute;
      inset: -14px 18px 18px -14px;
      z-index: -1;
      border: 1px solid rgba(123, 71, 38, 0.42);
      border-radius: 32px 12px 32px 32px;
      transform: rotate(-1deg);
    }
    .product-visual > img,
    .product-visual-placeholder {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 4.6;
      border-radius: 32px 12px 32px 32px;
      object-fit: cover;
      background: var(--sand);
      box-shadow: 0 30px 75px rgba(43, 33, 24, 0.16);
    }
    .product-visual-placeholder { display: grid; place-items: center; padding: 28px; color: var(--muted); text-align: center; }
    .eyebrow { margin: 0 0 16px; color: var(--accent-dark); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
    h1 { margin: 0 0 22px; font: 600 clamp(3.25rem, 7vw, 6.6rem)/0.92 var(--display); letter-spacing: -0.052em; text-wrap: balance; }
    .summary { max-width: 620px; margin: 0 0 28px; color: var(--muted); font-size: clamp(1rem, 1.7vw, 1.2rem); }
    .purchase-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 0; border-top: 1px solid rgba(43, 33, 24, 0.13); border-bottom: 1px solid rgba(43, 33, 24, 0.13); }
    .price { display: block; font: 600 clamp(1.65rem, 3vw, 2.35rem)/1 var(--display); }
    .availability { display: block; margin-top: 6px; color: var(--muted); font-size: 0.76rem; font-weight: 700; }
    .button {
      display: inline-flex;
      min-height: 52px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 22px;
      border: 1px solid rgba(43, 33, 24, 0.22);
      border-radius: 999px;
      font-size: 0.83rem;
      font-weight: 700;
      text-decoration: none;
      transition: transform 0.25s ease, background-color 0.25s ease, color 0.25s ease;
    }
    .button:hover { transform: translateY(-2px); }
    .button--primary { border-color: var(--ink); background: var(--ink); color: var(--panel); }
    .button--primary:hover { background: var(--forest); }
    .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
    .tags span { padding: 7px 11px; border: 1px solid rgba(43, 33, 24, 0.13); border-radius: 999px; background: rgba(255, 252, 246, 0.55); font-size: 0.72rem; font-weight: 700; }
    .story {
      display: grid;
      grid-template-columns: minmax(220px, 0.6fr) minmax(0, 1.4fr);
      gap: clamp(34px, 7vw, 90px);
      margin-top: clamp(72px, 11vw, 140px);
      padding: clamp(38px, 6vw, 72px);
      border-radius: 32px;
      background: var(--forest);
      color: var(--panel);
    }
    .story-label { color: #e7c696; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.19em; text-transform: uppercase; }
    .story h2 { margin: 14px 0 0; font: 600 clamp(2.4rem, 5vw, 4.6rem)/0.98 var(--display); letter-spacing: -0.045em; }
    .story-copy { max-width: 700px; }
    .story-copy p { margin: 0 0 18px; color: rgba(255, 252, 246, 0.76); }
    .story-copy p:last-child { margin-bottom: 0; }
    .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 18px; }
    .gallery-grid figure { margin: 0; overflow: hidden; border-radius: 16px; background: var(--sand); }
    .gallery-grid img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; transition: transform 0.55s ease; }
    .gallery-grid figure:hover img { transform: scale(1.035); }
    .craft-values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin-top: clamp(52px, 8vw, 92px); border: 1px solid rgba(43, 33, 24, 0.12); border-radius: 24px; overflow: hidden; background: rgba(43, 33, 24, 0.12); }
    .craft-value { padding: clamp(22px, 4vw, 38px); background: rgba(255, 252, 246, 0.76); }
    .craft-value strong { display: block; margin-bottom: 7px; font: 600 1.3rem/1.15 var(--display); }
    .craft-value span { color: var(--muted); font-size: 0.83rem; }
    .final-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 46px; }
    footer { padding: 34px 20px; background: #221a14; color: rgba(255, 252, 246, 0.58); text-align: center; font-size: 0.75rem; }
    @media (max-width: 820px) {
      .topbar-inner { min-height: 72px; }
      .brand img { width: 56px; height: 56px; }
      .brand span { display: none; }
      .topnav a:not(:last-child) { display: none; }
      .product-hero { grid-template-columns: 1fr; }
      .product-info { order: -1; }
      .product-visual { width: min(100%, 620px); margin: 0 auto; }
      .product-visual > img, .product-visual-placeholder { aspect-ratio: 4 / 4.25; }
      .story { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .topbar-inner, .breadcrumbs, main { width: min(100% - 28px, 1240px); }
      .topnav { gap: 12px; }
      .topnav a { font-size: 0.75rem; }
      .breadcrumbs { padding-top: 18px; }
      main { padding-top: 30px; }
      h1 { font-size: clamp(3rem, 16vw, 4.8rem); }
      .purchase-row { align-items: stretch; flex-direction: column; }
      .button { width: 100%; }
      .story { margin-right: -14px; margin-left: -14px; padding: 34px 22px; border-radius: 24px; }
      .gallery-grid { grid-template-columns: 1fr; }
      .craft-values { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/" aria-label="Dřevito – úvodní stránka">
        <img src="/drevito-logo-transparent.png" alt="">
        <span>Dřevito</span>
      </a>
      <nav class="topnav" aria-label="Hlavní navigace">
        <a href="/#about">O nás</a>
        <a href="/#products">Výrobky</a>
        <a href="/#custom">Výroba na míru</a>
        <a href="/#contact">Kontakt</a>
      </nav>
    </div>
  </header>

  <nav class="breadcrumbs" aria-label="Drobečková navigace">
    <a href="/">Domů</a><span>/</span><a href="/#products">Výrobky</a><span>/</span>${escapeHtml(title)}
  </nav>

  <main>
    <section class="product-hero">
      <div class="product-visual">${primaryImageHtml}</div>
      <div class="product-info">
        <p class="eyebrow">${escapeHtml(categoryLine)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="summary">${escapeHtml(summary)}</p>
        <div class="purchase-row">
          <div><strong class="price">${escapeHtml(formattedPrice)}</strong><span class="availability">${escapeHtml(availability.label)}</span></div>
          ${primaryAction}
        </div>
        ${tagsHtml}
      </div>
    </section>

    ${secondaryImagesHtml}

    <section class="story">
      <div><span class="story-label">Příběh výrobku</span><h2>Vyrobeno s&nbsp;respektem ke dřevu</h2></div>
      <div class="story-copy">${descriptionHtml}</div>
    </section>

    <section class="craft-values" aria-label="Hodnoty výrobku">
      <div class="craft-value"><strong>Ruční práce</strong><span>Každý kus vzniká v dílně Dřevito.</span></div>
      <div class="craft-value"><strong>Přírodní materiál</strong><span>Dřevo vybíráme podle charakteru výrobku.</span></div>
      <div class="craft-value"><strong>Každý kus je originál</strong><span>Kresba a odstín dřeva se přirozeně liší.</span></div>
    </section>

    <div class="final-actions">
      ${primaryAction}
      <a class="button" href="/#products">Zpět na všechny výrobky</a>
    </div>
  </main>

  <footer>© 2026 Dřevito · Dřevěné výrobky zhotovené srdcem</footer>
</body>
</html>`
  };
}

async function handlePublicProductRoute(req, res, url) {
  const slug = normalizeProductRouteSlug(url.pathname);
  if (!slug) return false;

  try {
    const product = await getPublicProduct(slug, (url.searchParams.get('locale') || 'cs').trim().toLowerCase());
    if (!product) return false;
    const rendered = renderPublicProductPage(product);
    send(res, rendered.statusCode, rendered.html, { 'Cache-Control': 'no-cache' });
  } catch (error) {
    const fallback = fallbackProduct(slug);
    if (!fallback) throw error;
    console.error(error);
    const rendered = renderPublicProductPage(fallback);
    send(res, rendered.statusCode, rendered.html, { 'Cache-Control': 'no-store' });
  }
  return true;
}

function normalizeBlogRouteSlug(pathname) {
  const decodedPath = decodeURIComponent(pathname || '').replace(/\/+$/, '');
  const segments = decodedPath.split('/').filter(Boolean);
  if (!segments.length) return '';

  if (segments[0] === 'blog' && segments[1]) {
    const routeSlug = slugify(segments[1], '');
    return BLOG_ROUTE_ALIASES[routeSlug] || routeSlug;
  }

  if (segments.length === 1) {
    const routeSlug = slugify(segments[0], '');
    return BLOG_ROUTE_ALIASES[routeSlug] || '';
  }

  return '';
}

function fallbackBlogPost(slug) {
  return DEFAULT_BLOG_POSTS.find((post) => post.slug === slug) || null;
}

function stripHtmlToText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function textBlocks(value) {
  return String(value || '')
    .split(/\n{2,}|\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatDateCs(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('cs-CZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

async function getPublicBlogPost(slug, locale = 'cs') {
  const fallback = fallbackBlogPost(slug);
  const payload = await getPublicCmsPayload(locale);
  const post = (payload.blog_posts || []).find((item) => item.slug === slug);
  return post || fallback;
}

function blogPostMeta(post) {
  const parts = [];
  if (Array.isArray(post.categories)) {
    post.categories
      .map((category) => category && category.title)
      .filter(Boolean)
      .forEach((title) => parts.push(title));
  }
  if (post.author_name) parts.push(post.author_name);
  const date = formatDateCs(post.published_at);
  if (date) parts.push(date);
  return parts.join(' / ') || 'Blog Dřevito';
}

function renderPublicBlogPostPage(post, statusCode = 200) {
  const image = (post.featured_image && post.featured_image.url) || '';
  const imageAlt = (post.featured_image && post.featured_image.alt) || post.title;
  const bodyText = stripHtmlToText(post.main_content || post.excerpt || '');
  const bodyBlocks = textBlocks(bodyText);
  const body = bodyBlocks.length
    ? bodyBlocks.map((block) => `<p>${escapeHtml(block)}</p>`).join('')
    : '<p>Článek připravujeme.</p>';
  const imageHtml = image
    ? `<figure class="article-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(imageAlt)}"></figure>`
    : '';

  return {
    statusCode,
    html: `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)} - Dřevito</title>
  <meta name="description" content="${escapeHtml(post.excerpt || stripHtmlToText(post.main_content).slice(0, 155) || 'Blog Dřevito')}">
  <link rel="canonical" href="/blog/${escapeHtml(post.slug)}">
  <link rel="icon" href="/favicon.ico?v=20260622-3" sizes="any">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f5f0e8;
      --panel: #fdfcfa;
      --ink: #3d2b1f;
      --muted: #6b5a4a;
      --accent: #c9a96e;
      --line: rgba(61, 43, 31, 0.14);
      --font-display: 'Cormorant Garamond', Georgia, serif;
      --font-body: 'DM Sans', system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      line-height: 1.7;
    }
    a { color: inherit; }
    .topbar {
      background: #2a1f16;
      color: var(--panel);
      border-bottom: 1px solid rgba(201, 169, 110, 0.2);
    }
    .topbar-inner {
      width: min(1120px, calc(100% - 32px));
      min-height: 78px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      font-family: var(--font-display);
      font-size: 1.3rem;
      font-weight: 600;
    }
    .brand img {
      width: 56px;
      height: 56px;
      object-fit: contain;
      background: var(--panel);
      border-radius: 2px;
    }
    .nav-link {
      color: rgba(253, 252, 250, 0.78);
      font-size: 0.92rem;
      font-weight: 600;
      text-decoration: none;
    }
    .nav-link:hover { color: var(--accent); }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 0 auto;
      padding: clamp(42px, 8vw, 86px) 0;
    }
    .kicker {
      color: var(--accent);
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin-bottom: 14px;
      text-transform: uppercase;
    }
    h1 {
      font-family: var(--font-display);
      font-size: clamp(2.4rem, 9vw, 5rem);
      font-weight: 500;
      line-height: 0.98;
      margin: 0 0 20px;
    }
    .excerpt {
      max-width: 720px;
      color: var(--muted);
      font-family: var(--font-display);
      font-size: clamp(1.25rem, 3vw, 1.75rem);
      line-height: 1.35;
      margin: 0 0 34px;
    }
    .article-image {
      margin: 0 0 36px;
      border-radius: 8px;
      overflow: hidden;
      background: #e8dfd0;
    }
    .article-image img {
      display: block;
      width: 100%;
      max-height: 560px;
      object-fit: cover;
    }
    .article-body {
      max-width: 760px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: clamp(24px, 5vw, 44px);
      box-shadow: 0 14px 40px rgba(61, 43, 31, 0.09);
    }
    .article-body p {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 1.03rem;
    }
    .article-body p:last-child { margin-bottom: 0; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 34px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 18px;
      border-radius: 999px;
      border: 1.5px solid var(--accent);
      color: var(--ink);
      font-weight: 700;
      text-decoration: none;
    }
    .button--primary {
      background: var(--accent);
      color: #fff;
    }
    @media (max-width: 640px) {
      .topbar-inner { align-items: flex-start; flex-direction: column; padding: 12px 0; gap: 10px; }
      .brand img { width: 48px; height: 48px; }
      .actions { flex-direction: column; }
      .button { width: 100%; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">
        <img src="/drevito-logo-transparent.png" alt="Dřevito">
        <span>Dřevito</span>
      </a>
      <a class="nav-link" href="/#blog">Zpět na blog</a>
    </div>
  </header>
  <main>
    <div class="kicker">${escapeHtml(blogPostMeta(post))}</div>
    <h1>${escapeHtml(post.title)}</h1>
    ${post.excerpt ? `<p class="excerpt">${escapeHtml(post.excerpt)}</p>` : ''}
    ${imageHtml}
    <article class="article-body">
      ${body}
    </article>
    <div class="actions">
      <a class="button button--primary" href="/#contact">Kontakt</a>
      <a class="button" href="/#blog">Další články</a>
    </div>
  </main>
</body>
</html>`
  };
}

async function handlePublicBlogRoute(req, res, url) {
  const slug = normalizeBlogRouteSlug(url.pathname);
  if (!slug) return false;

  try {
    const post = await getPublicBlogPost(slug, (url.searchParams.get('locale') || 'cs').trim().toLowerCase());
    if (!post) return false;
    const rendered = renderPublicBlogPostPage(post);
    send(res, rendered.statusCode, rendered.html, {
      'Cache-Control': 'no-cache'
    });
  } catch (error) {
    const fallback = fallbackBlogPost(slug);
    if (!fallback) throw error;
    console.error(error);
    const rendered = renderPublicBlogPostPage(fallback);
    send(res, rendered.statusCode, rendered.html, {
      'Cache-Control': 'no-store'
    });
  }
  return true;
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const isRuntimeUpload = decodedPath.startsWith('/uploads/');
  const fileRoot = isRuntimeUpload ? UPLOAD_DIR : ROOT_DIR;
  const relativePath = isRuntimeUpload
    ? decodedPath.slice('/uploads/'.length)
    : `.${decodedPath}`;
  const filePath = path.resolve(fileRoot, relativePath);
  if (!filePath.startsWith(fileRoot + path.sep)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(res, 404, 'Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function isPublicProductsRoute(pathname) {
  return /^\/vyrobky(?:\/[a-z0-9-]+){0,2}\/?$/.test(pathname);
}

async function handleAdmin(req, res, url) {
  const session = getSession(req);

  if (url.pathname === '/admin/login' && req.method === 'GET') {
    if (session) {
      redirect(res, '/admin');
      return;
    }
    send(res, 200, loginPage({
      next: url.searchParams.get('next') || '/admin',
      devLogin: isDevLoginAvailable(req)
    }), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/dev-login' && req.method === 'POST') {
    if (!isDevLoginAvailable(req)) {
      send(res, 403, loginPage({
        error: 'Lokální testovací vstup je dostupný jen na localhostu, když Google přihlášení není nastavené.',
        next: url.searchParams.get('next') || '/admin',
        devLogin: false
      }), {
        'Cache-Control': 'no-store'
      });
      return;
    }
    const next = getSafeAdminNext(url.searchParams.get('next') || '/admin');
    redirect(res, next, {
      'Set-Cookie': sessionCookie(createSession('local-test@drevito.local'), req)
    });
    return;
  }

  if (url.pathname === '/admin/auth/google' && req.method === 'GET') {
    if (session) {
      redirect(res, '/admin');
      return;
    }

    const next = getSafeAdminNext(url.searchParams.get('next') || '/admin');
    if (!isAuthConfigured()) {
      send(res, 500, loginPage({
        error: 'Google přihlášení není nakonfigurované.',
        next,
        devLogin: isDevLoginAvailable(req)
      }), {
        'Cache-Control': 'no-store'
      });
      return;
    }

    const auth = buildGoogleAuthUrl(req, next);
    redirect(res, auth.url, {
      'Set-Cookie': oauthStateCookie(auth.token, req)
    });
    return;
  }

  if (url.pathname === '/admin/oauth/google/callback' && req.method === 'GET') {
    const callbackState = url.searchParams.get('state') || '';
    const storedState = getOauthState(req, callbackState);

    if (!callbackState || !storedState) {
      send(res, 400, loginPage({ error: 'Přihlášení vypršelo. Zkuste to znovu.' }), {
        'Cache-Control': 'no-store',
        'Set-Cookie': expiredOauthStateCookie()
      });
      return;
    }

    if (url.searchParams.get('error')) {
      send(res, 401, loginPage({ error: 'Google přihlášení bylo zrušeno.', next: storedState.next }), {
        'Cache-Control': 'no-store',
        'Set-Cookie': expiredOauthStateCookie()
      });
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      send(res, 400, loginPage({ error: 'Google neposlal přihlašovací kód.', next: storedState.next }), {
        'Cache-Control': 'no-store',
        'Set-Cookie': expiredOauthStateCookie()
      });
      return;
    }

    try {
      const token = await requestGoogleToken(req, code);
      const user = await requestGoogleUser(token.access_token);
      const email = String(user.email || '').toLowerCase();
      const emailVerified = user.email_verified === true || user.email_verified === 'true';

      if (!emailVerified || !GOOGLE_ALLOWED_EMAILS.some((allowedEmail) => safeEqual(email, allowedEmail))) {
        send(res, 403, loginPage({ error: 'Tento Google účet nemá přístup do administrace.', next: storedState.next }), {
          'Cache-Control': 'no-store',
          'Set-Cookie': expiredOauthStateCookie()
        });
        return;
      }

      const cookieValue = createSession(email);
      redirect(res, storedState.next, {
        'Set-Cookie': [
          sessionCookie(cookieValue, req),
          expiredOauthStateCookie()
        ]
      });
    } catch (error) {
      console.error(error);
      send(res, 502, loginPage({ error: 'Google přihlášení se nepodařilo dokončit.', next: storedState.next }), {
        'Cache-Control': 'no-store',
        'Set-Cookie': expiredOauthStateCookie()
      });
    }
    return;
  }

  if (url.pathname === '/admin/logout' && req.method === 'POST') {
    redirect(res, '/admin/login', {
      'Set-Cookie': expiredSessionCookie()
    });
    return;
  }

  if (url.pathname === '/admin/logout') {
    send(res, 405, 'Method not allowed', { Allow: 'POST' });
    return;
  }

  if (!session) {
    if (url.pathname.startsWith('/admin/api/')) {
      sendJson(res, 401, { ok: false, error: 'Přihlášení vypršelo. Přihlaste se znovu.' }, {
        'Cache-Control': 'no-store'
      });
      return;
    }
    redirect(res, `/admin/login?next=${encodeURIComponent(url.pathname)}`);
    return;
  }

  if (url.pathname.startsWith('/admin/api/') && !['GET', 'HEAD'].includes(req.method)) {
    const requestOrigin = String(req.headers.origin || '').trim();
    if (requestOrigin) {
      let originMatches = false;
      try {
        originMatches = new URL(requestOrigin).host === String(req.headers.host || '');
      } catch (error) {}
      if (!originMatches) {
        sendJson(res, 403, { ok: false, error: 'Požadavek nepřišel z administrace Dřevito.' }, {
          'Cache-Control': 'no-store'
        });
        return;
      }
    }
  }

  if (url.pathname === '/admin/api/media' && req.method === 'GET') {
    try {
      sendJson(res, 200, await getMediaDb(), {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/media/upload' && req.method === 'POST') {
    await handleMediaUpload(req, res, session);
    return;
  }

  if (url.pathname === '/admin/api/media/delete' && req.method === 'POST') {
    await handleMediaDelete(req, res);
    return;
  }

  if (url.pathname === '/admin/api/homepage' && req.method === 'GET') {
    try {
      sendJson(res, 200, await getHomepageEditorState(), { 'Cache-Control': 'no-store' });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' });
    }
    return;
  }

  if (url.pathname === '/admin/api/homepage/draft' && req.method === 'PUT') {
    try {
      const input = await parseJsonBody(req);
      if (!Object.prototype.hasOwnProperty.call(input, 'expected_revision')) throw new Error('Chybí verze upravovaného konceptu.');
      sendJson(res, 200, await saveHomepageDraft(input.layout, {
        expectedRevision: input.expected_revision
      }), { 'Cache-Control': 'no-store' });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' });
    }
    return;
  }

  if (url.pathname === '/admin/api/homepage/publish' && req.method === 'POST') {
    try {
      const input = await parseJsonBody(req);
      if (!Object.prototype.hasOwnProperty.call(input, 'expected_revision')) throw new Error('Chybí verze upravovaného konceptu.');
      sendJson(res, 200, await publishHomepageLayout(input.layout, {
        expectedRevision: input.expected_revision
      }), { 'Cache-Control': 'no-store' });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' });
    }
    return;
  }

  if (url.pathname === '/admin/api/homepage/reset-draft' && req.method === 'POST') {
    try {
      const input = await parseJsonBody(req);
      if (!Object.prototype.hasOwnProperty.call(input, 'expected_revision')) throw new Error('Chybí verze upravovaného konceptu.');
      sendJson(res, 200, await resetHomepageDraft({
        expectedRevision: input.expected_revision
      }), { 'Cache-Control': 'no-store' });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' });
    }
    return;
  }

  if (url.pathname === '/admin/api/site-content' && req.method === 'GET') {
    try {
      sendJson(res, 200, { ok: true, contents: await listGenericSiteContent() }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/site-content' && req.method === 'POST') {
    try {
      const content = await createSiteContent(await parseJsonBody(req));
      sendJson(res, 201, { ok: true, content }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/site-content/photo-upload' && req.method === 'POST') {
    await handleSiteContentPhotoUpload(req, res, session);
    return;
  }

  const siteContentMatch = url.pathname.match(/^\/admin\/api\/site-content\/([^/]+)$/);
  if (siteContentMatch && req.method === 'PATCH') {
    try {
      const content = await updateSiteContent(decodeURIComponent(siteContentMatch[1]), await parseJsonBody(req));
      sendJson(res, 200, { ok: true, content }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const siteContentActionMatch = url.pathname.match(/^\/admin\/api\/site-content\/([^/]+)\/(archive|restore)$/);
  if (siteContentActionMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(siteContentActionMatch[1]);
      const content = siteContentActionMatch[2] === 'restore'
        ? await restoreSiteContent(id)
        : await archiveSiteContent(id);
      sendJson(res, 200, { ok: true, content }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/products' && req.method === 'GET') {
    try {
      const data = await listProducts();
      sendJson(res, 200, { ok: true, ...data }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/product-filters' && req.method === 'GET') {
    try { sendJson(res, 200, { ok: true, filters: await listProductFilters() }, { 'Cache-Control': 'no-store' }); }
    catch (error) { sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' }); }
    return;
  }

  if (url.pathname === '/admin/api/product-filters' && req.method === 'POST') {
    try { sendJson(res, 201, { ok: true, filter: await createProductFilter(await parseJsonBody(req)) }, { 'Cache-Control': 'no-store' }); }
    catch (error) { sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' }); }
    return;
  }

  const productFilterMatch = url.pathname.match(/^\/admin\/api\/product-filters\/([^/]+)$/);
  if (productFilterMatch && req.method === 'PATCH') {
    try { sendJson(res, 200, { ok: true, filter: await updateProductFilter(decodeURIComponent(productFilterMatch[1]), await parseJsonBody(req)) }, { 'Cache-Control': 'no-store' }); }
    catch (error) { sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' }); }
    return;
  }

  const productFilterOptionMatch = url.pathname.match(/^\/admin\/api\/product-filters\/([^/]+)\/options(?:\/([^/]+))?$/);
  if (productFilterOptionMatch && (req.method === 'POST' || req.method === 'PATCH')) {
    try {
      const filterId = decodeURIComponent(productFilterOptionMatch[1]);
      const input = await parseJsonBody(req);
      const option = req.method === 'POST'
        ? await createProductFilterOption(filterId, input)
        : await updateProductFilterOption(filterId, decodeURIComponent(productFilterOptionMatch[2]), input);
      sendJson(res, req.method === 'POST' ? 201 : 200, { ok: true, option }, { 'Cache-Control': 'no-store' });
    } catch (error) { sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, { 'Cache-Control': 'no-store' }); }
    return;
  }

  if (url.pathname === '/admin/api/products' && req.method === 'POST') {
    try {
      const product = await createProduct(await parseJsonBody(req));
      sendJson(res, 201, { ok: true, product }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/products/photo-upload' && req.method === 'POST') {
    await handleProductPhotoUpload(req, res, session);
    return;
  }

  if (url.pathname === '/admin/api/blog-posts' && req.method === 'GET') {
    try {
      const data = await listBlogPosts();
      sendJson(res, 200, { ok: true, ...data }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/blog-posts' && req.method === 'POST') {
    try {
      const post = await createBlogPost(await parseJsonBody(req));
      sendJson(res, 201, { ok: true, post }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/blog-posts/photo-upload' && req.method === 'POST') {
    await handleBlogPostPhotoUpload(req, res, session);
    return;
  }

  const blogPostMatch = url.pathname.match(/^\/admin\/api\/blog-posts\/([^/]+)$/);
  if (blogPostMatch && req.method === 'PATCH') {
    try {
      const post = await updateBlogPost(decodeURIComponent(blogPostMatch[1]), await parseJsonBody(req));
      sendJson(res, 200, { ok: true, post }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const blogPostActionMatch = url.pathname.match(/^\/admin\/api\/blog-posts\/([^/]+)\/(archive|restore)$/);
  if (blogPostActionMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(blogPostActionMatch[1]);
      const post = blogPostActionMatch[2] === 'restore'
        ? await restoreBlogPost(id)
        : await archiveBlogPost(id);
      sendJson(res, 200, { ok: true, post }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const productMatch = url.pathname.match(/^\/admin\/api\/products\/([^/]+)$/);
  if (productMatch && req.method === 'PATCH') {
    try {
      const product = await updateProduct(decodeURIComponent(productMatch[1]), await parseJsonBody(req));
      sendJson(res, 200, { ok: true, product }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const productActionMatch = url.pathname.match(/^\/admin\/api\/products\/([^/]+)\/(archive|restore)$/);
  if (productActionMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(productActionMatch[1]);
      const product = productActionMatch[2] === 'restore'
        ? await restoreProduct(id)
        : await archiveProduct(id);
      sendJson(res, 200, { ok: true, product }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/product-categories' && req.method === 'GET') {
    try {
      sendJson(res, 200, { ok: true, categories: await listProductCategories() }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/product-categories' && req.method === 'POST') {
    try {
      const category = await createProductCategory(await parseJsonBody(req));
      sendJson(res, 201, { ok: true, category }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const productCategoryMatch = url.pathname.match(/^\/admin\/api\/product-categories\/([^/]+)$/);
  if (productCategoryMatch && req.method === 'PATCH') {
    try {
      const category = await updateProductCategory(decodeURIComponent(productCategoryMatch[1]), await parseJsonBody(req));
      sendJson(res, 200, { ok: true, category }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const productCategoryActionMatch = url.pathname.match(/^\/admin\/api\/product-categories\/([^/]+)\/(archive|restore)$/);
  if (productCategoryActionMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(productCategoryActionMatch[1]);
      const category = productCategoryActionMatch[2] === 'restore'
        ? await restoreProductCategory(id)
        : await archiveProductCategory(id);
      sendJson(res, 200, { ok: true, category }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/blog-categories' && req.method === 'GET') {
    try {
      sendJson(res, 200, { ok: true, categories: await listBlogCategories() }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if (url.pathname === '/admin/api/blog-categories' && req.method === 'POST') {
    try {
      const category = await createBlogCategory(await parseJsonBody(req));
      sendJson(res, 201, { ok: true, category }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const blogCategoryMatch = url.pathname.match(/^\/admin\/api\/blog-categories\/([^/]+)$/);
  if (blogCategoryMatch && req.method === 'PATCH') {
    try {
      const category = await updateBlogCategory(decodeURIComponent(blogCategoryMatch[1]), await parseJsonBody(req));
      sendJson(res, 200, { ok: true, category }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  const blogCategoryActionMatch = url.pathname.match(/^\/admin\/api\/blog-categories\/([^/]+)\/(archive|restore)$/);
  if (blogCategoryActionMatch && req.method === 'POST') {
    try {
      const id = decodeURIComponent(blogCategoryActionMatch[1]);
      const category = blogCategoryActionMatch[2] === 'restore'
        ? await restoreBlogCategory(id)
        : await archiveBlogCategory(id);
      sendJson(res, 200, { ok: true, category }, {
        'Cache-Control': 'no-store'
      });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { ok: false, error: normalizeSupabaseError(error) }, {
        'Cache-Control': 'no-store'
      });
    }
    return;
  }

  if ((url.pathname === '/admin' || url.pathname === '/admin/') && req.method === 'GET') {
    send(res, 200, dashboardPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/archive' && req.method === 'GET') {
    send(res, 200, archiveAdminPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/media' && req.method === 'GET') {
    send(res, 200, mediaAdminPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if ((url.pathname === '/admin/homepage' || url.pathname === '/admin/site-content') && req.method === 'GET') {
    send(res, 200, homepageEditorPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/product-categories' && req.method === 'GET') {
    send(res, 200, productCategoriesAdminPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/product-filters' && req.method === 'GET') {
    send(res, 200, productFiltersAdminPage(session), { 'Cache-Control': 'no-store' });
    return;
  }

  if (url.pathname === '/admin/products' && req.method === 'GET') {
    send(res, 200, productsAdminPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/blog-categories' && req.method === 'GET') {
    send(res, 200, blogCategoriesAdminPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  if (url.pathname === '/admin/blog-posts' && req.method === 'GET') {
    send(res, 200, blogPostsAdminPage(session), {
      'Cache-Control': 'no-store'
    });
    return;
  }

  send(res, 404, adminLayout('Nenalezeno', `
    ${adminMasthead(session)}
    <div class="content">
      <h1>Stránka nenalezena</h1>
      <p>Tato admin stránka zatím neexistuje.</p>
    </div>
  `), {
    'Cache-Control': 'no-store'
  });
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/media-targets' && req.method === 'GET') {
    getPublicMediaTargets()
      .then((targets) => {
        sendJson(res, 200, targets, {
          'Cache-Control': 'no-cache'
        });
      })
      .catch((error) => {
        console.error(error);
        sendJson(res, 500, { ok: false, error: 'Media targets could not be loaded.' }, {
          'Cache-Control': 'no-store'
        });
      });
    return;
  }

  if (url.pathname === '/api/public-content' && req.method === 'GET') {
    getPublicCmsPayload((url.searchParams.get('locale') || 'cs').trim().toLowerCase())
      .then((payload) => {
        sendJson(res, 200, payload, {
          'Cache-Control': 'no-cache'
        });
      })
      .catch((error) => {
        console.error(error);
        sendJson(res, 500, {
          ok: false,
          configured: isSupabaseConfigured(),
          error: 'Public CMS content could not be loaded.'
        }, {
          'Cache-Control': 'no-store'
        });
      });
    return;
  }

  if (url.pathname.startsWith('/admin')) {
    handleAdmin(req, res, url).catch((error) => {
      console.error(error);
      send(res, 500, 'Internal server error');
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  if (isPublicProductsRoute(url.pathname)) {
    serveStatic(req, res, '/index.html');
    return;
  }

  handlePublicProductRoute(req, res, url)
    .then((handled) => handled || handlePublicBlogRoute(req, res, url))
    .then((handled) => {
      if (!handled) serveStatic(req, res, isPublicProductsRoute(url.pathname) ? '/index.html' : url.pathname);
    })
    .catch((error) => {
      console.error(error);
      send(res, 500, 'Internal server error');
    });
}

if (require.main === module) {
  const server = http.createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`Drevito site running at http://localhost:${PORT}`);
    console.log(`Přihlášení: http://localhost:${PORT}/admin/login`);
    if (!isAuthConfigured()) {
      console.warn('Google admin login is disabled until GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ALLOWED_EMAIL are set.');
    }
    if (!process.env.SESSION_SECRET) {
      console.warn('SESSION_SECRET is not set. A temporary secret was generated for this process.');
    }
  });
}

module.exports = handleRequest;
