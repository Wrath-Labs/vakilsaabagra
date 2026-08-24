#!/usr/bin/env node
/**
 * Vakil Saab Agra — JSON → HTML.
 *
 *   node tools/content.js            apply the JSON to the pages
 *   node tools/content.js --check    report what would change, write nothing
 *
 * The point of this file is that nobody should have to open an .html file to
 * change what the site says. Everything a non-programmer would want to edit
 * lives in a JSON file, and this walks the pages and makes them match:
 *
 *   data/site.json     business details, nav, footer columns, feature flags
 *                        → js/config.js  (generated, do not hand-edit)
 *                        → the header nav, mobile drawer and the three footer
 *                          link columns on every page
 *   data/pricing.json  plans and prices
 *                        → the priced plan table on list-your-practice.html,
 *                          shown only while flags.showPricing is true
 *   data/i18n/en.json  every visible string on every page
 *                        → the text of all 1271 data-i18n elements
 *
 * Order matters and is not negotiable. The nav and pricing regions are
 * regenerated FIRST, minting translation keys as they go, and the English copy
 * is applied LAST — so a label typed into site.json ends up in en.json, and
 * en.json is what actually reaches the page. One direction, no cycles.
 *
 * Why not fetch the JSON in the browser
 * -------------------------------------
 * Because the pages must work as static HTML: Googlebot reads the nav, the
 * footer and the prices in the source, the site survives with JavaScript off,
 * and opening index.html off disk still renders. Building it in is the only
 * way to get all three.
 *
 * Relationship to tools/i18n-extract.js
 * -------------------------------------
 * The extractor goes the other way — it reads the pages and writes en.json.
 * Run it after adding new hand-written markup, to pull the new strings out.
 * Run this after editing the JSON, to push the strings back in. They agree on
 * the key format, which is why the same slug() function appears in both.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

const PAGES = ['index.html', 'lawyers.html', 'lawyer.html', 'practice-areas.html',
  'about.html', 'contact.html', 'faq.html', 'list-your-practice.html',
  'privacy.html', 'terms.html', '404.html'];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const site = readJson('data/site.json');
const pricing = readJson('data/pricing.json');
const db = readJson('data/lawyers.json');
const en = readJson('data/i18n/en.json');

let changed = [];
let minted = [];
let warnings = [];

/* ------------------------------------------------------------------ text */

/** Escape for HTML text content. Mirrors the entities tools/i18n-extract.js decodes. */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Escape for a double-quoted attribute value. */
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

/**
 * {phone} and {email} inside a string-table entry.
 *
 * The contact details are tokens in en.json and hi.json rather than digits,
 * because they used to be spelled out in six English strings and five Hindi
 * ones and every change meant finding all eleven. Expanded here for the static
 * HTML — so a crawler and a JavaScript-off browser see real digits — and
 * expanded again at runtime by js/i18n.js when the page switches to Hindi.
 */
let TOKENS = {};
function expandTokens(s) {
  let out = String(s);
  for (const [t, v] of Object.entries(TOKENS)) if (out.includes(t)) out = out.split(t).join(v);
  return out;
}

/** Key slug from English text. Must stay identical to tools/i18n-extract.js. */
function slug(text) {
  const words = String(text).toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) {
    if (out && (out.length + w.length + 1) > 44) break;
    out += (out ? '-' : '') + w;
  }
  return out || 'text';
}

/**
 * The translation key for a generated label.
 *
 * Reusing the key that is already on the element is what keeps the Hindi
 * working: hi.json is keyed by these, so minting a fresh key for an unchanged
 * label would silently drop that line back to English on the Hindi site.
 * A key is only minted when the label itself is new.
 */
function keyFor(label, existingKey, scope) {
  if (existingKey && en[existingKey] === label) return existingKey;

  const base = (scope || 'common') + '.' + slug(label);
  if (en[base] === label) return base;
  if (!(base in en)) {
    en[base] = label; minted.push(base);
    return base;
  }
  for (let n = 2; n < 50; n++) {
    const k = `${base}-${n}`;
    if (en[k] === label) return k;
    if (!(k in en)) { en[k] = label; minted.push(k); return k; }
  }
  return base;
}

/* --------------------------------------------------------------- regions */

/**
 * Replace the inner HTML of the first element matching `openRe`.
 *
 * Deliberately not a DOM parser: these are known, hand-authored regions with
 * no nested element of the same tag inside them, and every call is asserted
 * below. A regex that silently matches nothing is the failure mode to fear, so
 * a miss throws rather than returning the page unchanged.
 */
function replaceInner(html, openRe, build, what) {
  const m = openRe.exec(html);
  if (!m) throw new Error(`region not found: ${what}`);
  const start = m.index + m[0].length;
  const tag = m[1];

  /* depth-aware: the pricing card is a <div> full of <div>s, and taking the
     first </div> would cut the region off in the middle */
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0, close = -1, t;
  while ((t = re.exec(html))) {
    if (t[0][1] === '/') { if (depth === 0) { close = t.index; break; } depth--; }
    else if (!t[0].endsWith('/>')) depth++;
  }
  if (close === -1) throw new Error(`unterminated region: ${what}`);

  return html.slice(0, start) + build(html.slice(start, close)) + html.slice(close);
}

/** Existing href → data-i18n key, so a regenerated link keeps its translation. */
function keyMap(regionHtml) {
  const out = {};
  const re = /<a\b[^>]*\bhref="([^"]*)"[^>]*?(?:\bdata-i18n="([^"]+)")?[^>]*>/g;
  let m;
  while ((m = re.exec(regionHtml))) if (m[2]) out[m[1]] = m[2];
  return out;
}

/* ------------------------------------------------- 1. js/config.js */

function buildConfig() {
  const b = site.business;
  const digits = String(b.phone).replace(/\D/g, '');
  const display = digits.length === 12 && digits.slice(0, 2) === '91'
    ? '+91 ' + digits.slice(2, 7) + ' ' + digits.slice(7)
    : b.phone;

  const cfg = {
    name: b.name, tagline: b.tagline, url: b.url,
    phone: b.phone, phoneDisplay: display, whatsapp: b.whatsapp, email: b.email,
    micrositeDomain: b.micrositeDomain,
    address: b.address, geo: b.geo, hours: b.hours,
    social: Object.fromEntries(
      Object.entries(site.social).filter(([k]) => !k.startsWith('_'))),
    demoNotice: site.flags.demoNotice === true,
  };

  const out =
    '/* ============================================================================\n' +
    '   AUTO-GENERATED by tools/content.js — do not edit.\n' +
    '   Source: data/site.json. Change it there and run `npm run build`.\n' +
    '\n' +
    '   Anything edited here is overwritten on the next build, without warning\n' +
    '   and without a merge conflict to notice.\n' +
    '   ========================================================================= */\n' +
    'window.VS_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n';

  const target = path.join(ROOT, 'js', 'config.js');
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== out) {
    if (!CHECK) fs.writeFileSync(target, out);
    changed.push('js/config.js');
  }
  return display;
}

/* ------------------------------------------------- 2. header, drawer, footer */

function primaryNav(page, existing) {
  const km = keyMap(existing);
  return '\n' + site.nav.primary.map((it) => {
    const k = keyFor(it.label, km[it.href], 'common');
    const cur = it.href === page ? ' aria-current="page"' : '';
    return `        <a href="${escAttr(it.href)}" class="nav-link transition-colors hover:text-[var(--ink)]"${cur} data-i18n="${k}">${esc(it.label)}</a>`;
  }).join('\n') + '\n    ';
}

function drawerNav(page, existing) {
  const km = keyMap(existing);
  const items = site.nav.primary.concat(site.nav.drawerExtra);
  return '\n' + items.map((it, i) => {
    const k = keyFor(it.label, km[it.href], 'common');
    const cur = it.href === page ? ' aria-current="page"' : '';
    return `      <a href="${escAttr(it.href)}" style="--i:${i}" class="drawer-item border-b border-[var(--line-2)] py-3.5 text-lg font-medium text-[var(--ink)]"${cur} data-i18n="${k}">${esc(it.label)}</a>`;
  }).join('\n') + '\n    ';
}

function footerPracticeAreas(existing) {
  const km = keyMap(existing);
  const cfg = site.footer.practiceAreas;
  const items = db.categories.map((c) => ({
    href: `lawyers.html?category=${c.slug}`,
    label: c.name + (cfg.suffix || ''),
  }));
  const hk = keyFor(cfg.heading, /data-i18n="([^"]+)"/.exec(existing)?.[1], 'common');
  return '\n' +
    `        <h2 class="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold-2)]" data-i18n="${hk}">${esc(cfg.heading)}</h2>\n` +
    '        <ul class="mt-5 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 lg:grid-cols-1">\n' +
    items.map((it) => {
      const k = keyFor(it.label, km[it.href], 'common');
      return `          <li><a href="${escAttr(it.href)}" class="transition-colors hover:text-[var(--gold-2)]" data-i18n="${k}">${esc(it.label)}</a></li>`;
    }).join('\n') +
    '\n        </ul>\n      ';
}

function footerQuickLinks(existing) {
  const km = keyMap(existing);
  const cfg = site.footer.quickLinks;
  const hk = keyFor(cfg.heading, /data-i18n="([^"]+)"/.exec(existing)?.[1], 'common');
  return '\n' +
    `        <h2 class="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold-2)]" data-i18n="${hk}">${esc(cfg.heading)}</h2>\n` +
    '        <ul class="mt-5 space-y-2.5 text-sm">\n' +
    cfg.links.map((it) => {
      const k = keyFor(it.label, km[it.href], 'common');
      return `          <li><a href="${escAttr(it.href)}" class="transition-colors hover:text-[var(--gold-2)]" data-i18n="${k}">${esc(it.label)}</a></li>`;
    }).join('\n') +
    '\n        </ul>\n      ';
}

/* Areas with no live advocate render a filter that finds nobody — worth a
   warning, because the link looks fine and only fails when someone taps it. */
const LIVE_AREAS = new Set(db.lawyers
  .filter((l) => !l.listing || l.listing.active !== false)
  .map((l) => l.location && l.location.area).filter(Boolean));

function footerAreas(existing) {
  const km = keyMap(existing);
  const cfg = site.footer.areas;
  const hk = keyFor(cfg.heading, /data-i18n="([^"]+)"/.exec(existing)?.[1], 'common');
  cfg.list.forEach((a) => {
    if (!LIVE_AREAS.has(a)) warnings.push(`footer area "${a}" matches no live advocate — the filter will come back empty`);
  });
  return '\n' +
    `        <h2 class="text-xs font-bold uppercase tracking-[.2em] text-[var(--gold-2)]" data-i18n="${hk}">${esc(cfg.heading)}</h2>\n` +
    '        <ul class="mt-5 flex flex-wrap gap-1.5 text-[13px]">\n' +
    cfg.list.map((area) => {
      const href = 'lawyers.html?area=' + encodeURIComponent(area);
      const k = keyFor(area, km[href], 'common');
      return `          <li><a href="${escAttr(href)}" class="inline-block rounded-full border border-white/12 px-2.5 py-1 transition-colors hover:border-[var(--gold-2)] hover:text-[var(--gold-2)]" data-i18n="${k}">${esc(area)}</a></li>`;
    }).join('\n') +
    '\n        </ul>\n      ';
}

/* ------------------------------------------------- 3. the priced plan table */

function money(n) {
  const c = pricing.currency;
  return c.symbol + Number(n).toLocaleString(c.locale || 'en-IN');
}

/**
 * The plan table. Rendered into the page rather than fetched, so the prices
 * are in the HTML source an advocate's phone loads on a bad connection, and in
 * what Google indexes.
 */
function pricingCard() {
  const show = site.flags.showPricing === true;
  const k = (label) => keyFor(label, null, 'listing');

  const head = 'What it costs';
  const cols = pricing.columns;

  /* With prices hidden the card still renders — same plans, same blurbs, no
     figures, and the "ask us" line instead. The flag has to work in both
     directions, which it would not if hiding meant leaving whatever markup
     happened to be on the page last time. */
  const row = (dt, amount, strong) => !show ? '' : `
              <div class="flex items-baseline justify-between gap-3${strong ? ' border-t border-[var(--line)] pt-2' : ''}">
                <dt class="${strong ? 'font-semibold text-[var(--ink)]' : 'text-[var(--muted)]'}" data-i18n="${k(dt)}">${esc(dt)}</dt>
                <dd class="font-display text-${strong ? 'xl' : 'lg'} font-bold text-[${strong ? 'var(--gold)' : 'var(--ink)'}]">${esc(money(amount))}</dd>
              </div>`;

  const cards = pricing.plans.map((p) => {
    const total = p.listing + p.microsite;
    const ring = p.highlight
      ? ' ring-2 ring-[var(--gold)]'
      : ' ring-1 ring-inset ring-[var(--line)]';
    /* Every card reserves the badge row, whether or not it has one — otherwise
       the highlighted plan's figures sit lower than its neighbours' and the
       three columns stop being comparable at a glance, which is the only job
       this table has. */
    const badge = p.highlight && p.badge
      ? `\n            <p class="mb-3 inline-block rounded-full bg-[var(--gold-3)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink)]" data-i18n="${k(p.badge)}">${esc(p.badge)}</p>`
      : `\n            <p class="mb-3 inline-block px-3 py-1 text-[11px] font-bold uppercase tracking-wide" aria-hidden="true">&nbsp;</p>`;
    const figures = !show ? '' : `
            <dl class="mt-4 space-y-2 text-sm">${row(cols.listing, p.listing, false)}${row(cols.microsite, p.microsite, false)}${row(cols.total, total, true)}
            </dl>
            <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]" data-i18n="${k(pricing.unit)}">${esc(pricing.unit)}</p>`;
    return `
          <div class="rounded-xl bg-[var(--paper-2)] p-5${ring}">${badge}
            <p class="font-display text-lg font-bold text-[var(--ink)]" data-i18n="${k(p.name)}">${esc(p.name)}</p>${figures}
            <p class="mt-3 text-sm leading-relaxed text-[var(--muted)]" data-i18n="${k(p.blurb)}">${esc(p.blurb)}</p>
          </div>`;
  }).join('');

  const notes = pricing.footnotes.map((f) => {
    const text = typeof f === 'string' ? f : f.text;
    let body = `<span data-i18n="${k(text)}">${esc(text)}</span>`;
    if (typeof f === 'object' && f.link) {
      body += ` <a href="${escAttr(f.link.href)}" class="font-semibold text-[var(--gold)] underline-offset-2 hover:underline" data-i18n="${k(f.link.label)}">${esc(f.link.label)}</a>`;
    }
    return `          <li class="flex items-start gap-2.5"><span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]"></span><span>${body}</span></li>`;
  }).join('\n');

  const lede = show ? pricing.billingNote : pricing.hiddenPricesNote;

  return `
        <h3 class="font-display text-xl font-bold text-[var(--ink)]" data-i18n="${k(head)}">${esc(head)}</h3>
        <div class="rule-gold mt-3 mb-5"></div>
        <p class="pretty text-[15px] leading-relaxed text-[var(--muted)]" data-i18n="${k(lede)}">${esc(lede)}</p>
        <div class="mt-5 grid gap-4 sm:grid-cols-3">${cards}
        </div>
        <ul class="mt-6 space-y-3 text-[15px] leading-relaxed text-[var(--ink)]">
${notes}
        </ul>
        `;
}

/* ------------------------------------------------- 4. contact links */

/**
 * Every `tel:`, `wa.me/` and `mailto:` on the static pages points at the
 * business, never at an advocate — advocate links are rendered by js/*.js from
 * the dataset, and never appear in these files. So they can all be rewritten
 * from data/site.json unconditionally, which is what stops a phone-number
 * change from being a 142-occurrence find-and-replace ever again.
 *
 * The `?text=` prefill on a WhatsApp link is somebody's wording and is kept.
 */
const PHONE_TEXT = /\+91[\s\u00a0]?\d{5}[\s\u00a0]?\d{5}|\+91\d{10}/g;

function contactLinks(html, file) {
  const b = site.business;
  const waDigits = String(b.whatsapp).replace(/\D/g, '');

  let out = html
    .replace(/href="tel:[^"]*"/g, `href="tel:${escAttr(b.phone)}"`)
    .replace(/href="https:\/\/wa\.me\/\d+([^"]*)"/g, (m, rest) => `href="https://wa.me/${waDigits}${rest}"`)
    .replace(/href="mailto:[^"]*"/g, `href="mailto:${escAttr(b.email)}"`);

  /* The number printed inside the call buttons is a bare numeral, so
     tools/i18n-extract.js skips it by design and it carries no data-i18n key —
     which is how three copies per page ended up outside both systems. They are
     all inside a tel: link, so they are rewritten with it. */
  out = out.replace(/(<a\b[^>]*href="tel:[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/g,
    (m, open, inner, close) => open + inner.replace(PHONE_TEXT, TOKENS['{phone}']) + close);

  return out;
}

/**
 * Any number left on the page that data/site.json does not account for.
 *
 * Runs LAST, after the copy has been applied — check it any earlier and it
 * reads the {phone} tokens in their un-expanded, still-stale state and cries
 * wolf on every single page of a phone-number change, which is precisely the
 * build where the warning needs to be trustworthy.
 */
function checkStrayPhones(html, file) {
  const b = site.business;
  const stray = [...new Set((html.match(PHONE_TEXT) || [])
    .filter((n) => n.trim() !== TOKENS['{phone}'] && n !== b.phone))];
  if (stray.length) {
    warnings.push(`${file}: phone number(s) not driven by data/site.json: ${stray.join(', ')}`);
  }
}

/**
 * The `data-cfg` spans hold a contact detail that js/ui.js fills in at runtime.
 * The value in the source is the no-JavaScript fallback and what a crawler
 * reads, so it has to be right too — it was the last stale email on the site.
 */
function cfgTargets(html) {
  const b = site.business;
  const values = { email: b.email, phoneDisplay: TOKENS['{phone}'], phone: b.phone,
    name: b.name, tagline: b.tagline, hours: b.hours };
  return html.replace(/(<([a-zA-Z][\w-]*)\b[^>]*\bdata-cfg="([\w.]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, key, inner, close) =>
      (key in values ? open + esc(values[key]) + close : m));
}

/* ------------------------------------------------- 5. FAQ structured data */

/**
 * Rebuild the FAQPage JSON-LD from the accordion on the same page.
 *
 * Google requires the structured data to match what a visitor actually sees,
 * and this was two hand-maintained copies of the same nineteen answers — so
 * editing an answer in en.json would have quietly left the markup claiming the
 * old one, and left the phone number stale inside it, which is exactly what
 * happened. Now the accordion is the source and the JSON-LD is derived, so they
 * cannot disagree.
 *
 * English only, deliberately: the page keeps one URL and Google indexes the
 * English head. Same reasoning as the <title> note in tools/i18n-extract.js.
 */
function faqJsonLd(html, file) {
  if (!html.includes('"@type":"FAQPage"')) return html;

  /* The visible text, tags stripped — NOT the data-i18n values. One answer on
     index.html is three spans around a phone link and carries no key of its
     own, and keying off data-i18n silently dropped that whole Q&A from the
     structured data. What the visitor reads is the thing Google must be told. */
  const clean = (t) => t.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();

  const items = [];
  const re = /<div class="acc-item[^"]*"[^>]*>([\s\S]*?)<div class="acc-panel">([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const q = /<button[^>]*>([\s\S]*?)<\/button>/.exec(m[1]);
    if (!q) continue;
    const name = clean(q[1]);
    const text = clean(m[2]);
    if (!name || !text) continue;
    items.push({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } });
  }
  if (!items.length) {
    warnings.push(`${file}: has FAQPage markup but no accordion to build it from — left alone`);
    return html;
  }

  const block = '<script type="application/ld+json">' + JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items,
  }) + '<\/script>';

  return html.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>/,
    block.replace(/<\\\//g, '</'));
}

/* ------------------------------------------------- 6. English copy → pages */

/**
 * Push en.json into every data-i18n element and data-i18n-attr attribute.
 *
 * This is what makes en.json the source of truth for wording rather than a
 * mirror of it. Every marked element holds a single run of text and no child
 * elements — asserted across all 1271 of them — which is what makes a
 * substitution this blunt safe.
 */
function applyCopy(html, file) {
  let missing = 0;

  html = html.replace(
    /(<([a-zA-Z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (m, open, tag, key, inner, close) => {
      if (!(key in en)) { missing++; warnings.push(`${file}: no en.json entry for "${key}"`); return m; }
      if (/<[a-zA-Z]/.test(inner)) {
        warnings.push(`${file}: "${key}" wraps markup — left alone`);
        return m;
      }
      /* preserve the surrounding whitespace, which carries layout meaning
         between inline elements */
      const lead = (inner.match(/^\s*/) || [''])[0];
      const tail = (inner.match(/\s*$/) || [''])[0];
      return open + lead + esc(expandTokens(en[key])) + tail + close;
    });

  html = html.replace(/\bdata-i18n-attr="([^"]+)"/g, (m, spec) => {
    spec.split(',').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (!attr || !key) return;
      if (!(key in en)) { missing++; warnings.push(`${file}: no en.json entry for "${key}"`); }
    });
    return m;
  });

  /* the attribute values themselves, one attribute at a time */
  html = html.replace(
    /<([a-zA-Z][\w-]*)\b([^>]*\bdata-i18n-attr="([^"]+)"[^>]*)>/g,
    (m, tag, attrs, spec) => {
      let out = attrs;
      spec.split(',').forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (!attr || !key || !(key in en)) return;
        const re = new RegExp(`\\b${attr}="[^"]*"`);
        if (re.test(out)) out = out.replace(re, `${attr}="${escAttr(expandTokens(en[key]))}"`);
      });
      return `<${tag}${out}>`;
    });

  return html;
}

/* ------------------------------------------------------------------- run */

const phoneDisplay = buildConfig();
TOKENS = { '{phone}': phoneDisplay, '{email}': site.business.email };

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  const original = fs.readFileSync(file, 'utf8');
  let html = original;

  try {
    html = replaceInner(html, /<(nav)\b[^>]*aria-label="Primary"[^>]*>/, (ex) => primaryNav(page, ex), `${page} primary nav`);
    html = replaceInner(html, /<(nav)\b[^>]*aria-label="Mobile"[^>]*>/, (ex) => drawerNav(page, ex), `${page} drawer`);
    html = replaceInner(html, /<(nav)\b[^>]*aria-label="Practice areas"[^>]*>/, footerPracticeAreas, `${page} footer practice areas`);
    html = replaceInner(html, /<(nav)\b[^>]*aria-label="Quick links"[^>]*>/, footerQuickLinks, `${page} footer quick links`);
    html = replaceInner(html, /<(nav)\b[^>]*aria-label="Areas served in Agra"[^>]*>/, footerAreas, `${page} footer areas`);
  } catch (e) {
    console.error(`\x1b[31m✗ ${e.message}\x1b[0m`);
    process.exit(1);
  }

  if (page === 'list-your-practice.html') {
    try {
      html = replaceInner(html, /<(div)\s+class="card mt-6 p-6 sm:p-7"\s+data-reveal>/, (ex) => {
        /* the closing "To be plain about it" note is positioning, not price —
           it is hand-written, says what we are not, and stays exactly as it is */
        const keep = ex.indexOf('<p class="pretty mt-4 rounded-xl');
        if (keep === -1) throw new Error('list-your-practice.html: the "to be plain about it" note moved');
        return pricingCard() + ex.slice(keep);
      }, 'pricing card');
    } catch (e) {
      console.error(`\x1b[31m✗ ${e.message}\x1b[0m`);
      process.exit(1);
    }
  }

  html = cfgTargets(html);
  html = contactLinks(html, page);
  html = applyCopy(html, page);
  html = faqJsonLd(html, page);
  checkStrayPhones(html, page);

  if (html !== original) {
    if (!CHECK) fs.writeFileSync(file, html);
    changed.push(page);
  }
}

/* the microsite template carries copy too, but no nav or pricing */
{
  const file = path.join(ROOT, 'templates', 'microsite.html');
  const original = fs.readFileSync(file, 'utf8');
  const html = applyCopy(original, 'templates/microsite.html');
  if (html !== original) {
    if (!CHECK) fs.writeFileSync(file, html);
    changed.push('templates/microsite.html');
  }
}

if (minted.length && !CHECK) {
  const sorted = Object.fromEntries(Object.keys(en).sort().map((k) => [k, en[k]]));
  fs.writeFileSync(path.join(ROOT, 'data', 'i18n', 'en.json'),
    JSON.stringify(sorted, null, 2) + '\n');
}

/* ---------------------------------------------------------------- report */

const label = CHECK ? '(check only)' : '';
console.log(`\x1b[32m✓\x1b[0m content applied ${label}`);
console.log(`  data/site.json            ${site.nav.primary.length} nav links, ` +
            `${site.footer.quickLinks.links.length} quick links, ${site.footer.areas.list.length} areas`);
console.log(`  data/pricing.json         ${pricing.plans.length} plans, ` +
            (site.flags.showPricing ? 'prices published' : 'prices hidden (flags.showPricing false)'));
console.log(`  data/i18n/en.json         ${Object.keys(en).length} strings` +
            (minted.length ? `, ${minted.length} new key(s) minted` : ''));
console.log(`  pages rewritten           ${changed.length ? changed.join(', ') : 'none — already current'}`);

if (minted.length) {
  console.log(`\n  new keys need Hindi in data/i18n/hi.json:`);
  minted.slice(0, 20).forEach((k) => console.log(`    ${k}\n      ${en[k]}`));
  if (minted.length > 20) console.log(`    … and ${minted.length - 20} more`);
}

/**
 * Keys nothing references any more, usually because a JSON edit reworded a
 * generated label. Reported rather than deleted: the entry in hi.json is
 * somebody's translation work, and it comes straight back if the wording is
 * reverted. `--prune` removes them from both tables when you are sure.
 */
{
  const used = new Set();
  for (const f of PAGES.concat(['templates/microsite.html'])) {
    const h = read(f);
    let m;
    const a = /\bdata-i18n="([^"]+)"/g;
    while ((m = a.exec(h))) used.add(m[1]);
    const b = /\bdata-i18n-attr="([^"]+)"/g;
    while ((m = b.exec(h))) m[1].split(',').forEach((p) => { const k = p.split(':')[1]; if (k) used.add(k.trim()); });
  }
  /* Three more ways a key is used without appearing in any HTML:
       - js/*.js builds the string itself — T('js.card.call', 'Call')
       - tools/sync.js does the same when it pre-renders a microsite
       - js/data.js:149 CONCATENATES a key — 'js.language.' + name — so only the
         namespace is ever written down, and matching whole keys would report
         all eight language names as dead. */
  const code = ['js', 'tools'].flatMap((dir) =>
    fs.readdirSync(path.join(ROOT, dir))
      .filter((f) => f.endsWith('.js'))
      .map((f) => read(`${dir}/${f}`))).join('\n');
  const quoted = (s) => code.includes(`'${s}'`) || code.includes(`"${s}"`);
  const orphans = Object.keys(en).filter((k) =>
    !used.has(k) && !quoted(k) && !quoted(k.slice(0, k.lastIndexOf('.') + 1)));

  if (orphans.length) {
    if (process.argv.includes('--prune') && !CHECK) {
      const hiPath = path.join(ROOT, 'data', 'i18n', 'hi.json');
      const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));
      orphans.forEach((k) => { delete en[k]; delete hi[k]; });
      const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
      fs.writeFileSync(path.join(ROOT, 'data', 'i18n', 'en.json'), JSON.stringify(sortObj(en), null, 2) + '\n');
      fs.writeFileSync(hiPath, JSON.stringify(sortObj(hi), null, 2) + '\n');
      console.log(`  pruned                    ${orphans.length} unused key(s) from en.json and hi.json`);
    } else {
      warnings.push(`${orphans.length} key(s) in en.json are on no page any more — run \`node tools/content.js --prune\` to drop them: ${orphans.slice(0, 4).join(', ')}${orphans.length > 4 ? ', …' : ''}`);
    }
  }
}

const uniqueWarnings = [...new Set(warnings)];
if (uniqueWarnings.length) {
  console.log(`\n\x1b[33m  ${uniqueWarnings.length} warning(s):\x1b[0m`);
  uniqueWarnings.slice(0, 15).forEach((w) => console.log(`    ! ${w}`));
  if (uniqueWarnings.length > 15) console.log(`    … and ${uniqueWarnings.length - 15} more`);
}

if (CHECK && changed.length) process.exit(1);
