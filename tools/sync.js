#!/usr/bin/env node
/**
 * Vakil Saab Agra — data sync tool.
 *
 *   node tools/sync.js
 *
 * Reads data/lawyers.json (the single source of truth) and:
 *   0. validates it, and works out who is currently *live* — a listing is
 *      live only while listing.active !== false and listing.paidUntil has
 *      not passed. Expired advocates stay in lawyers.json (so the record and
 *      their history survive a lapse) but are left out of everything below.
 *   1. writes data/lawyers.public.json — the published dataset the pages
 *      actually read: live advocates only, with the billing block stripped.
 *      data/lawyers.json itself is never read by the browser.
 *   2. writes data/lawyers.fallback.js — the same published dataset, as a
 *      script, so the site works when opened straight from disk (file://)
 *      where fetch() of a .json is blocked.
 *   3. generates a monogram avatar SVG in assets/lawyers/ for any lawyer
 *      whose photo file does not exist yet. Drop in a real photo with the
 *      same path (e.g. assets/lawyers/neha-sharma.jpg) and update the
 *      "photo" field to override it.
 *   4. writes sitemap.xml with one URL per live lawyer and per practice area.
 *
 * It also prints a renewal reminder: who has already expired, and who
 * expires within the next fifteen days.
 *
 * Run it after every edit to data/lawyers.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'lawyers.json');
const SITE = 'https://www.vakilsaabagra.com';

/* midnight UTC today — every date comparison below uses this */
const TODAY = new Date(new Date().toISOString().slice(0, 10));
const DAY = 86400000;

const PLANS = ['monthly', 'halfyearly', 'yearly', 'none'];
const ACCENTS = ['gold', 'navy', 'teal', 'maroon'];
const SLUG_RE = /^[a-z0-9-]{3,30}$/;

/* subdomains we must never hand out: infrastructure, mail and our own tooling */
const RESERVED_SLUGS = [
  'www', 'api', 'admin', 'mail', 'app', 'cdn', 'blog', 'go', 'm', 'stats',
  'dashboard', 'static', 'assets', 'mx', 'ftp', 'ns1', 'ns2', 'test', 'dev',
  'staging', 'help', 'support', 'docs',
];

const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));

/* ------------------------------------------------------------------ dates */
function isDateString(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
         !Number.isNaN(new Date(v).getTime());
}
/** true once the date is in the past; a null/absent date never expires */
function expired(v) {
  return isDateString(v) && new Date(v) < TODAY;
}
function daysUntil(v) {
  return Math.round((new Date(v) - TODAY) / DAY);
}

/* ---------------------------------------------------------------- validate */
const slugs = new Set(db.categories.map((c) => c.slug));
const problems = [];
const seen = new Set();
const siteSlugs = new Map();
const featuredPerCategory = {};

for (const l of db.lawyers) {
  if (seen.has(l.id)) problems.push(`duplicate id: ${l.id}`);
  seen.add(l.id);
  if (!/^[a-z0-9-]+$/.test(l.id)) problems.push(`id must be lowercase-kebab-case: ${l.id}`);
  if (!slugs.has(l.primaryCategory)) problems.push(`${l.id}: unknown primaryCategory "${l.primaryCategory}"`);
  (l.categories || []).forEach((c) => { if (!slugs.has(c)) problems.push(`${l.id}: unknown category "${c}"`); });
  if (!(l.categories || []).includes(l.primaryCategory)) problems.push(`${l.id}: primaryCategory missing from categories[]`);
  if (typeof l.experienceYears !== 'number') problems.push(`${l.id}: experienceYears must be a number`);
  if (!l.phone) problems.push(`${l.id}: phone is required`);

  /* ---- featured slots: at most two per practice area, or the flag is noise */
  if (l.featured) {
    (featuredPerCategory[l.primaryCategory] = featuredPerCategory[l.primaryCategory] || []).push(l.id);
  }
  if (l.featuredUntil != null && !isDateString(l.featuredUntil)) {
    problems.push(`${l.id}: featuredUntil must be YYYY-MM-DD or null`);
  }

  /* ---- billing ------------------------------------------------------- */
  const listing = l.listing;
  if (!listing || typeof listing !== 'object') {
    problems.push(`${l.id}: listing block is required`);
  } else {
    if (PLANS.indexOf(listing.plan) === -1) {
      problems.push(`${l.id}: listing.plan must be one of ${PLANS.join(', ')} (got "${listing.plan}")`);
    }
    if (listing.plan && listing.plan !== 'none' && !isDateString(listing.paidUntil)) {
      problems.push(`${l.id}: listing.paidUntil is required for plan "${listing.plan}" and must be YYYY-MM-DD`);
    }
    if (listing.paidUntil != null && !isDateString(listing.paidUntil)) {
      problems.push(`${l.id}: listing.paidUntil must be YYYY-MM-DD or null`);
    }
    if (listing.onboardedOn != null && !isDateString(listing.onboardedOn)) {
      problems.push(`${l.id}: listing.onboardedOn must be YYYY-MM-DD or null`);
    }
  }

  /* ---- microsite ----------------------------------------------------- */
  const ms = l.microsite;
  if (!ms || typeof ms !== 'object') {
    problems.push(`${l.id}: microsite block is required`);
  } else {
    if (ms.slug != null) {
      if (!SLUG_RE.test(ms.slug)) {
        problems.push(`${l.id}: microsite.slug "${ms.slug}" must match ${SLUG_RE}`);
      }
      if (RESERVED_SLUGS.indexOf(ms.slug) !== -1) {
        problems.push(`${l.id}: microsite.slug "${ms.slug}" is reserved and cannot be used`);
      }
      if (siteSlugs.has(ms.slug)) {
        problems.push(`${l.id}: microsite.slug "${ms.slug}" is already used by ${siteSlugs.get(ms.slug)}`);
      }
      siteSlugs.set(ms.slug, l.id);
    }
    if (ms.enabled === true) {
      if (!ms.slug) problems.push(`${l.id}: microsite.enabled needs a microsite.slug`);
      if (!ms.longAbout) problems.push(`${l.id}: microsite.enabled needs microsite.longAbout (a longer bio, not a copy of "about")`);
      if (ms.longAbout && l.about && ms.longAbout.trim() === l.about.trim()) {
        problems.push(`${l.id}: microsite.longAbout is identical to "about" — the microsite must not duplicate the directory profile`);
      }
    }
    if (ms.accent != null && ACCENTS.indexOf(ms.accent) === -1) {
      problems.push(`${l.id}: microsite.accent must be one of ${ACCENTS.join(', ')} (got "${ms.accent}")`);
    }
    if (ms.faqs != null) {
      if (!Array.isArray(ms.faqs)) problems.push(`${l.id}: microsite.faqs must be an array`);
      else ms.faqs.forEach((f, i) => {
        if (!f || !f.q || !f.a) problems.push(`${l.id}: microsite.faqs[${i}] needs both "q" and "a"`);
      });
    }
  }
}

Object.keys(featuredPerCategory).forEach((cat) => {
  const ids = featuredPerCategory[cat];
  if (ids.length > 2) {
    problems.push(`too many featured advocates in "${cat}": ${ids.length} (max 2) — ${ids.join(', ')}`);
  }
});

if (problems.length) {
  console.error('\x1b[31m✗ data/lawyers.json has problems:\x1b[0m');
  problems.forEach((p) => console.error('   - ' + p));
  process.exit(1);
}

/* ------------------------------------------------------------ 0. who is live */
db.lawyers.forEach((l) => {
  l.__expired = expired(l.listing.paidUntil);
  l.__live = l.listing.active !== false && !l.__expired;
});
const live = db.lawyers.filter((l) => l.__live);
const hidden = db.lawyers.filter((l) => !l.__live);

/* ------------------------------------------------- 1 + 2. published dataset */
/**
 * What the browser is allowed to see. The billing block never leaves the
 * repo: what an advocate pays and when they expire is nobody else's business.
 * Expired "featured" flags are flattened here too, so a lapsed slot stops
 * showing without anyone having to edit the record.
 */
function publish(l) {
  const out = {};
  Object.keys(l).forEach((k) => {
    if (k === 'listing' || k === 'featuredUntil' || k.slice(0, 2) === '__') return;
    if (k === 'featured') { out.featured = !!l.featured && !expired(l.featuredUntil); return; }
    if (k === 'microsite') {
      out.microsite = { enabled: !!l.microsite.enabled, slug: l.microsite.slug || null };
      return;
    }
    out[k] = l[k];
  });
  return out;
}

const publicDb = {
  meta: db.meta,
  categories: db.categories,
  lawyers: live.map(publish),
};

fs.writeFileSync(path.join(ROOT, 'data', 'lawyers.public.json'),
  JSON.stringify(publicDb, null, 2) + '\n');

const fallback =
  '/* AUTO-GENERATED by tools/sync.js — do not edit. Source: data/lawyers.json */\n' +
  'window.__VS_DATA__ = ' + JSON.stringify(publicDb) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data', 'lawyers.fallback.js'), fallback);

/* ------------------------------------------------------------- 3. avatars */
const PALETTES = [
  ['#12345c', '#0b2039'], ['#123f47', '#08262c'], ['#3a2140', '#1d1024'],
  ['#14413a', '#08241f'], ['#2c3450', '#151a2c'], ['#4a2b28', '#261311'],
  ['#1a3a5c', '#0d1f33'], ['#2f3a24', '#171d10'],
];

function initials(name) {
  return name
    .replace(/^Adv\.?\s*/i, '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function avatarSvg(lawyer, idx) {
  const [c1, c2] = PALETTES[idx % PALETTES.length];
  const ini = initials(lawyer.name);
  const size = ini.length > 1 ? 152 : 190;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img" aria-label="${esc(lawyer.name)}">
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="400">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="110" y1="130" x2="290" y2="270">
      <stop offset="0%" stop-color="#f4e2ac"/><stop offset="55%" stop-color="#dcb85f"/><stop offset="100%" stop-color="#b98f34"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <g opacity="0.11" fill="none" stroke="#e8d29a" stroke-width="9" stroke-linecap="round" transform="translate(200,208) scale(0.86) translate(-256,-256)">
    <path d="M256 132 V 372"/><path d="M112 186 H 400"/>
    <path d="M64 252 Q112 320 160 252"/><path d="M352 252 Q400 320 448 252"/>
    <path d="M190 372 Q256 352 322 372"/>
  </g>
  <circle cx="200" cy="200" r="150" fill="none" stroke="#e8d29a" stroke-width="2" opacity="0.22"/>
  <text x="200" y="200" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700" fill="url(#ink)">${ini}</text>
</svg>
`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let made = 0;
db.lawyers.forEach((l, i) => {
  const file = path.join(ROOT, l.photo);
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (path.extname(file) !== '.svg') {
    console.warn(`  ! ${l.id}: photo "${l.photo}" is missing — add the image file.`);
    return;
  }
  fs.writeFileSync(file, avatarSvg(l, i));
  made++;
});

/* ------------------------------------------------------------- 4. sitemap */
const today = db.meta.lastUpdated || new Date().toISOString().slice(0, 10);
const urls = [
  ['/', '1.0', 'weekly'],
  ['/lawyers.html', '0.9', 'weekly'],
  ['/practice-areas.html', '0.8', 'monthly'],
  ['/list-your-practice.html', '0.7', 'monthly'],
  ['/about.html', '0.5', 'yearly'],
  ['/contact.html', '0.5', 'yearly'],
  ['/faq.html', '0.6', 'monthly'],
  ['/privacy.html', '0.2', 'yearly'],
  ['/terms.html', '0.2', 'yearly'],
];
db.categories.forEach((c) => urls.push([`/lawyers.html?category=${c.slug}`, '0.8', 'weekly']));
live.forEach((l) => urls.push([`/lawyer.html?id=${l.id}`, '0.7', 'monthly']));

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map(([loc, pri, freq]) =>
      `  <url>\n    <loc>${SITE}${loc.replace(/&/g, '&amp;')}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`)
    .join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

/* --------------------------------------------------------- renewal reminder */
function renewalReport() {
  const paying = db.lawyers.filter((l) => l.listing.plan !== 'none' && isDateString(l.listing.paidUntil));
  const lapsed = paying.filter((l) => l.__expired)
    .sort((a, b) => a.listing.paidUntil.localeCompare(b.listing.paidUntil));
  const soon = paying.filter((l) => !l.__expired && daysUntil(l.listing.paidUntil) <= 15)
    .sort((a, b) => a.listing.paidUntil.localeCompare(b.listing.paidUntil));
  if (!lapsed.length && !soon.length) return;

  const pad = (s, n) => String(s).padEnd(n);
  const line = (l, note) =>
    `   ${pad(l.name, 32)} ${pad(l.listing.plan, 11)} ${l.listing.paidUntil}   ${note}`;

  console.log('');
  if (lapsed.length) {
    console.log(`\x1b[31m⚠ ${lapsed.length} listing${lapsed.length === 1 ? '' : 's'} expired — hidden from the site:\x1b[0m`);
    lapsed.forEach((l) => console.log(line(l, `${-daysUntil(l.listing.paidUntil)} days ago`)));
  }
  if (soon.length) {
    console.log(`\x1b[33m⚠ ${soon.length} listing${soon.length === 1 ? '' : 's'} expiring within 15 days:\x1b[0m`);
    soon.forEach((l) => {
      const d = daysUntil(l.listing.paidUntil);
      console.log(line(l, d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`));
    });
  }
}

/* ----------------------------------------------------------------- summary */
console.log(`\x1b[32m✓\x1b[0m ${live.length} live advocate${live.length === 1 ? '' : 's'}` +
            `${hidden.length ? ` (${hidden.length} hidden — expired or inactive)` : ''}` +
            `, ${db.categories.length} practice areas`);
console.log(`  data/lawyers.public.json  published dataset (no billing fields)`);
console.log(`  data/lawyers.fallback.js  written`);
console.log(`  assets/lawyers/           ${made} avatar${made === 1 ? '' : 's'} generated`);
console.log(`  sitemap.xml               ${urls.length} URLs`);
if (hidden.length) {
  hidden.forEach((l) => console.log(`  · hidden: ${l.name} — ${l.__expired ? 'expired ' + l.listing.paidUntil : 'listing.active is false'}`));
}
renewalReport();
