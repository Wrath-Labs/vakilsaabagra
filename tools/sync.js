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
 *   5. writes functions/_ids.js — the list of live advocate ids, so the
 *      /api/track endpoint can reject events for ids that do not exist.
 *      A leading underscore keeps Cloudflare Pages from routing the file.
 *   6. renders templates/microsite.html into sites/<slug>/index.html for every
 *      live advocate with microsite.enabled, with all content substituted into
 *      the HTML itself — never fetched at runtime — plus a per-host robots.txt
 *      and sitemap.xml, and the slug → id map the routing middleware needs.
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

/* --------------------------------------------------- 5. id list for /api/track */
/**
 * The tracking endpoint needs its own copy of the valid ids: it runs at the
 * edge with no access to the dataset, and without this anyone could POST
 * events for advocates who do not exist and pollute the stats.
 */
fs.mkdirSync(path.join(ROOT, 'functions'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'functions', '_ids.js'),
  '/* AUTO-GENERATED by tools/sync.js — do not edit. Source: data/lawyers.json */\n' +
  'export default ' + JSON.stringify(live.map((l) => l.id)) + ';\n');

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

/* ---------------------------------------------------------- 6. microsites */

/**
 * The four accents. Each one overrides the brand tokens that css/styles.css
 * sets on :root, which is enough to make four visibly different sites out of
 * one stylesheet — the ink, the gradients, the rules and the accent text all
 * follow these.
 */
const ACCENTS_CSS = {
  gold:   { ink: '#0f2540', ink2: '#1b3f68', ink3: '#081527',
            gold: '#b0861f', gold2: '#dcb85f', gold3: '#f7e3a1',
            paper2: '#faf8f4', paper3: '#f4f1ea', line: '#e6e1d6', line2: '#efece4',
            shadow: '176, 134, 31', btn: null },
  navy:   { ink: '#10233d', ink2: '#25507f', ink3: '#070f1c',
            gold: '#2f6fb5', gold2: '#7db0e6', gold3: '#dbeafb',
            paper2: '#f6f8fc', paper3: '#e9f0f9', line: '#dbe3ee', line2: '#e9eef6',
            shadow: '47, 111, 181', btn: ['#4a8fd4', '#2f6fb5', '#235891', '#fff'] },
  teal:   { ink: '#0c2f2a', ink2: '#12564d', ink3: '#051916',
            gold: '#0f8a72', gold2: '#4ec7ac', gold3: '#cdefe6',
            paper2: '#f4faf8', paper3: '#e6f4ef', line: '#d5e8e2', line2: '#e6f1ed',
            shadow: '15, 138, 114', btn: ['#1aa88c', '#0f8a72', '#0b6c5a', '#fff'] },
  maroon: { ink: '#331319', ink2: '#66222f', ink3: '#1b090d',
            gold: '#a32742', gold2: '#dc7189', gold3: '#f9dde3',
            paper2: '#fdf7f7', paper3: '#f7e9eb', line: '#ecd9dc', line2: '#f4e7e9',
            shadow: '163, 39, 66', btn: ['#c33a57', '#a32742', '#841f35', '#fff'] },
};

/**
 * The accent as a stylesheet. Overriding the :root tokens carries most of the
 * page, but .btn-gold in css/styles.css hardcodes its gradient — so the primary
 * call button would stay brand-gold on a teal site, which is the one element
 * you would notice. It is overridden here rather than in css/styles.css so the
 * directory's own buttons stay exactly as they are.
 */
function accentCss(name) {
  const a = ACCENTS_CSS[name] || ACCENTS_CSS.gold;
  let css = ':root{' +
    `--ink:${a.ink};--ink-2:${a.ink2};--ink-3:${a.ink3};` +
    `--gold:${a.gold};--gold-2:${a.gold2};--gold-3:${a.gold3};` +
    `--paper-2:${a.paper2};--paper-3:${a.paper3};--line:${a.line};--line-2:${a.line2};` +
    `--shadow-gold:0 14px 32px -10px rgba(${a.shadow}, .38);` +
  '}';
  if (a.btn) {
    css += `.btn-gold{background:linear-gradient(135deg,${a.btn[0]},${a.btn[1]} 60%,${a.btn[2]});` +
           `color:${a.btn[3]};}`;
  }
  return css;
}

const APEX = SITE.replace(/^https?:\/\//, '').replace(/^www\./, '');

function money(n) {
  return n ? '₹' + Number(n).toLocaleString('en-IN') : 'Free first consult';
}
function telHref(num) { return 'tel:' + String(num).replace(/[^\d+]/g, ''); }
function waHref(num, text) {
  return 'https://wa.me/' + String(num).replace(/\D/g, '') +
         (text ? '?text=' + encodeURIComponent(text) : '');
}
function phoneDisplay(num) {
  const dgt = String(num).replace(/\D/g, '');
  return dgt.length === 12 && dgt.slice(0, 2) === '91'
    ? '+91 ' + dgt.slice(2, 7) + ' ' + dgt.slice(7)
    : String(num);
}
function shortName(name) { return name.replace(/^Adv\.?\s*/i, ''); }

const CHEV = '<svg class="acc-chevron shrink-0 text-[var(--gold)]" viewBox="0 0 24 24" width="18" height="18" ' +
             'fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" ' +
             'stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0 text-[var(--gold)]" aria-hidden="true">' +
             '<path d="M20 6L9 17l-5-5"/></svg>';

/** Splits topics up by the practice area they belong to, so each section on
 *  the microsite lists the matters that actually sit under its heading. */
function topicsByCategory(l, byCat) {
  const used = new Set();
  const out = l.categories.map((slug) => {
    const cat = byCat[slug];
    const master = new Set((cat && cat.topics) || []);
    const mine = (l.topics || []).filter((t) => master.has(t));
    mine.forEach((t) => used.add(t));
    return { slug, name: (cat && cat.name) || slug, blurb: (cat && cat.blurb) || '', topics: mine };
  });
  /* anything the advocate lists that is not in a master list still belongs
     somewhere — put it with their primary area rather than dropping it */
  const spare = (l.topics || []).filter((t) => !used.has(t));
  if (spare.length) {
    const primary = out.find((o) => o.slug === l.primaryCategory) || out[0];
    if (primary) primary.topics = primary.topics.concat(spare);
  }
  return out;
}

function micrositeHtml(l, template, byCat, year) {
  const ms = l.microsite;
  const host = `${ms.slug}.${APEX}`;
  const siteUrl = `https://${host}/`;
  const name = shortName(l.name);
  const primaryCategoryName = (byCat[l.primaryCategory] || {}).name || l.primaryCategory;
  const area = (l.location && l.location.area) || 'Agra';
  const accent = ACCENTS_CSS[ms.accent] ? ms.accent : 'gold';

  const title = `${l.name} — ${primaryCategoryName} Advocate in ${area}, Agra`;
  const description = `${ms.tagline || primaryCategoryName + ' advocate in Agra'}. ` +
    `${l.experienceYears} years in practice, chamber in ${area}, Agra. ` +
    `Consultation ${money(l.consultationFee)}. Call ${phoneDisplay(l.phone)}.`;

  const facts = [
    [`${l.experienceYears}`, 'Years in practice'],
    [money(l.consultationFee), 'Consultation'],
    [`${(l.courts || []).length}`, 'Courts appeared before'],
    [`${(l.languages || []).length}`, 'Languages'],
  ].map(([v, k]) =>
    `<div class="bg-white px-4 py-6 text-center">` +
      `<dd class="tabular font-display text-2xl font-bold text-[var(--ink)] sm:text-3xl">${esc(v)}</dd>` +
      `<dt class="mt-1 text-[11px] uppercase tracking-wide text-[var(--muted-2)]">${esc(k)}</dt></div>`).join('\n      ');

  const aboutParas = String(ms.longAbout).split(/\n{2,}/).map((para) =>
    `<p class="pretty">${esc(para.trim())}</p>`).join('\n          ');

  const highlights = (l.highlights || []).length
    ? `<ul class="mt-8 grid gap-3 border-t border-[var(--line-2)] pt-8 sm:grid-cols-2">` +
      l.highlights.map((h) =>
        `<li class="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--ink)]">${TICK}` +
        `<span>${esc(h)}</span></li>`).join('') + `</ul>`
    : '';

  const practiceSections = topicsByCategory(l, byCat).map((sec) =>
    `<section class="card p-6 sm:p-7" data-reveal>` +
      `<h3 class="font-display text-xl font-bold text-[var(--ink)]">${esc(sec.name)}</h3>` +
      `<div class="rule-gold mt-3 mb-4"></div>` +
      (sec.blurb ? `<p class="pretty text-sm leading-relaxed text-[var(--muted)]">${esc(sec.blurb)}</p>` : '') +
      (sec.topics.length
        ? `<ul class="mt-4 grid gap-2">` + sec.topics.map((t) =>
            `<li class="flex items-start gap-2.5 rounded-lg bg-[var(--paper-2)] px-3.5 py-2.5 text-sm text-[var(--ink)]">` +
            `${TICK}<span>${esc(t)}</span></li>`).join('') + `</ul>`
        : '') +
    `</section>`).join('\n        ');

  const courts = (l.courts || []).map((c) =>
    `<li class="flex items-start gap-2.5 text-[15px] leading-relaxed text-[var(--ink)]">${TICK}` +
    `<span>${esc(c)}</span></li>`).join('\n          ');

  const languages = (l.languages || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('');
  const education = (l.education || []).map((x) => `<li>${esc(x)}</li>`).join('\n          ');

  const faqs = (ms.faqs || []).length
    ? `<section id="faq" class="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">` +
      `<div data-reveal><h2 class="font-display text-2xl font-bold text-[var(--ink)] sm:text-3xl">Questions people ask</h2>` +
      `<div class="rule-gold mt-3 mb-8"></div></div>` +
      `<div class="space-y-3" data-accordion-group data-stagger="55">` +
      ms.faqs.map((f) =>
        `<div class="acc-item card overflow-hidden" data-reveal>` +
          `<button type="button" aria-expanded="false" class="flex w-full items-center justify-between gap-4 p-5 text-left">` +
            `<span class="font-semibold text-[var(--ink)]">${esc(f.q)}</span>${CHEV}` +
          `</button>` +
          `<div class="acc-panel"><div><p class="px-5 pb-5 text-[15px] leading-relaxed text-[var(--muted)]">${esc(f.a)}</p></div></div>` +
        `</div>`).join('') +
      `</div></section>`
    : '';

  const feeNote = l.feeNote
    ? `<p class="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">${esc(l.feeNote)}</p>`
    : '';

  /* Attorney + LegalService, with the microsite itself as the canonical url */
  const jsonLd = '<script type="application/ld+json">' + JSON.stringify({
    '@context': 'https://schema.org',
    '@type': ['Attorney', 'LegalService'],
    '@id': siteUrl + '#attorney',
    name: l.name,
    url: siteUrl,
    image: `${SITE}/${l.photo}`,
    description: String(ms.longAbout).split(/\n{2,}/)[0].trim(),
    slogan: ms.tagline || undefined,
    telephone: l.phone,
    priceRange: '₹' + l.consultationFee,
    knowsLanguage: l.languages,
    knowsAbout: l.topics,
    address: {
      '@type': 'PostalAddress',
      streetAddress: l.location.address,
      addressLocality: 'Agra',
      addressRegion: 'Uttar Pradesh',
      addressCountry: 'IN',
    },
    areaServed: { '@type': 'City', name: 'Agra' },
    makesOffer: l.categories.map((c) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: ((byCat[c] || {}).name || c) + ' legal services in Agra' },
    })),
    mainEntityOfPage: { '@type': 'WebPage', '@id': siteUrl },
    sameAs: `${SITE}/lawyer.html?id=${l.id}`,
  }) + '</script>' +
  '<script type="application/ld+json">' + JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (ms.faqs || []).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }) + '</script>';

  const tokens = {
    lang: 'en-IN',
    id: l.id,
    title, description, siteUrl,
    photo: '/' + l.photo,
    photoUrl: `${SITE}/${l.photo}`,
    themeColor: ACCENTS_CSS[accent].ink,
    accentCss: accentCss(accent),
    jsonLd,
    name: l.name,
    nameShort: name,
    tagline: ms.tagline || '',
    primaryCategoryName,
    experienceYears: String(l.experienceYears),
    enrollment: l.enrollment,
    area,
    telHref: telHref(l.phone),
    waHref: waHref(l.whatsapp || l.phone,
      `Hello ${l.name}, I found your website and would like to discuss a legal matter.`),
    phoneDisplay: phoneDisplay(l.phone),
    facts, aboutParas, highlights, practiceSections,
    courts, languages, education,
    address: l.location.address,
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(l.location.address),
    availability: l.availability || '',
    fee: money(l.consultationFee),
    feeNote,
    faqs,
    directoryUrl: `${SITE}/lawyer.html?id=${l.id}`,
    year: String(year),
  };

  /* every token must exist, or a {{placeholder}} ends up on a live page */
  const missing = [];
  const html = template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in tokens)) { missing.push(key); return m; }
    return tokens[key] == null ? '' : String(tokens[key]);
  });
  if (missing.length) {
    console.error(`\x1b[31m✗ templates/microsite.html uses unknown tokens: ${[...new Set(missing)].join(', ')}\x1b[0m`);
    process.exit(1);
  }
  return { html, host, siteUrl };
}

const withSite = live.filter((l) => l.microsite && l.microsite.enabled);
const SITES_DIR = path.join(ROOT, 'sites');
const slugMap = {};

if (withSite.length) {
  const template = fs.readFileSync(path.join(ROOT, 'templates', 'microsite.html'), 'utf8');
  const byCat = {};
  db.categories.forEach((c) => { byCat[c.slug] = c; });
  const year = new Date().getUTCFullYear();

  withSite.forEach((l) => {
    const { html, host, siteUrl } = micrositeHtml(l, template, byCat, year);
    const dir = path.join(SITES_DIR, l.microsite.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);

    /* scoped to this host: the apex sitemap must not claim these URLs */
    fs.writeFileSync(path.join(dir, 'robots.txt'),
      `# ${l.name} — ${host}\nUser-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`);

    fs.writeFileSync(path.join(dir, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `  <url>\n    <loc>${siteUrl}</loc>\n    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n` +
      '</urlset>\n');

    slugMap[l.microsite.slug] = l.id;
  });
}

/* Remove folders for microsites that are no longer live, so an expired
   advocate's site stops being served after a rebuild instead of lingering. */
let removed = 0;
if (fs.existsSync(SITES_DIR)) {
  fs.readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !slugMap[e.name])
    .forEach((e) => { fs.rmSync(path.join(SITES_DIR, e.name), { recursive: true, force: true }); removed++; });
}

fs.mkdirSync(SITES_DIR, { recursive: true });
fs.writeFileSync(path.join(SITES_DIR, '_map.json'), JSON.stringify(slugMap, null, 2) + '\n');

/* The middleware imports this at build time rather than fetching _map.json at
   runtime — one less request on every hit, and no JSON-loader assumption. */
fs.writeFileSync(path.join(ROOT, 'functions', '_slugs.js'),
  '/* AUTO-GENERATED by tools/sync.js — do not edit. Source: data/lawyers.json */\n' +
  'export default ' + JSON.stringify(slugMap, null, 2) + ';\n');

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
console.log(`  functions/_ids.js         ${live.length} ids for /api/track`);
console.log(`  assets/lawyers/           ${made} avatar${made === 1 ? '' : 's'} generated`);
console.log(`  sitemap.xml               ${urls.length} URLs`);
console.log(`  sites/                    ${withSite.length} microsite${withSite.length === 1 ? '' : 's'}` +
            `${removed ? `, ${removed} stale folder${removed === 1 ? '' : 's'} removed` : ''}` +
            `${withSite.length ? ' — ' + withSite.map((l) => l.microsite.slug).join(', ') : ''}`);
if (hidden.length) {
  hidden.forEach((l) => console.log(`  · hidden: ${l.name} — ${l.__expired ? 'expired ' + l.listing.paidUntil : 'listing.active is false'}`));
}
renewalReport();
