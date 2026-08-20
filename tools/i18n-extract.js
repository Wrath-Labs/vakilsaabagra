#!/usr/bin/env node
/**
 * Vakil Saab Agra — translation key extractor.
 *
 *   node tools/i18n-extract.js --report    list what would change, touch nothing
 *   node tools/i18n-extract.js             mark up the pages and write en.json
 *
 * Marking up every visible string across eleven pages and the microsite
 * template by hand is thousands of lines of edits and guarantees misses. This
 * walks each page, finds the text a visitor actually reads, stamps a
 * data-i18n key onto the element that holds it, and writes data/i18n/en.json
 * from the current copy — verbatim, never reworded.
 *
 * It is idempotent: text that already carries a key is left alone, so it can
 * be re-run after adding a page or a section.
 *
 * How keys are chosen
 * -------------------
 * A string that appears on three or more pages is site chrome — the header,
 * the footer, the drawer, the disclaimer — and gets a `common.*` key so it is
 * translated once. Everything else gets a key namespaced to its page. The
 * slug comes from the English text, which makes the JSON readable and keeps
 * keys stable when sections move around. Change the English wording and the
 * key changes with it; --report lists any Hindi string left orphaned.
 *
 * What is deliberately skipped
 * ----------------------------
 *   - <script>, <style>, <noscript>, <svg> and comments
 *   - <title> and <meta>: the page keeps one URL, so what Google indexes is
 *     the English head. Swapping it client-side would gain nothing and risks
 *     confusing the crawler. See the SEO note in the README.
 *   - anything aria-hidden, decorative punctuation, and bare numbers
 *   - elements whose text is written by JavaScript (data-cfg, data-year,
 *     data-count, and the render targets listed in JS_OWNED)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT = process.argv.includes('--report');

/* page → namespace */
const PAGES = {
  'index.html': 'home',
  'lawyers.html': 'directory',
  'lawyer.html': 'profile',
  'practice-areas.html': 'areas',
  'about.html': 'about',
  'contact.html': 'contact',
  'faq.html': 'faq',
  'list-your-practice.html': 'listing',
  'privacy.html': 'privacy',
  'terms.html': 'terms',
  '404.html': 'notfound',
  'templates/microsite.html': 'microsite',
};

/* text inside these is never touched */
const RAW = new Set(['script', 'style', 'noscript', 'svg', 'template']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* head elements: indexed in English on purpose, see the note above */
const SKIP_TEXT_IN = new Set(['title']);

/* containers whose contents a page script renders and re-renders */
const JS_OWNED = new Set([
  'dir-title', 'dir-lede', 'result-count', 'load-more-count', 'filter-exp-out',
  'profile-root', 'results-grid', 'category-grid', 'featured-grid',
  'filter-categories', 'filter-area', 'filter-language', 'search-suggest',
  'active-filters', 'stat-lawyers', 'stat-areas', 'stat-topics', 'stat-exp',
]);

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

/* ------------------------------------------------------------------ helpers */
const ENTITY = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&middot;': '·', '&copy;': '©', '&rsquo;': '’', '&lsquo;': '‘',
  '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
  '&times;': '×', '&deg;': '°', '&eacute;': 'é',
};
function decode(s) {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => (ENTITY[m] !== undefined ? ENTITY[m] : m));
}

/**
 * The stored value, as the browser would render it: indentation and line
 * breaks in the markup collapse to single spaces, so keeping them in the JSON
 * only makes it harder to translate. The English wording itself is untouched.
 */
function normalise(s) {
  return decode(s).replace(/\s+/g, ' ').trim();
}

/** Is this worth translating? Needs letters, and not just a number or a bullet. */
function translatable(text) {
  const plain = decode(text).trim();
  if (plain.length < 2) return false;
  if (!/[A-Za-z]/.test(plain)) return false;
  if (/^[\d\s.,:;/|·•—–-]+$/.test(plain)) return false;
  /* A microsite-template token is one advocate's own data. Keying it would
     replace their name with a fixed string the moment somebody switched
     language. Anything holding a token is left to the generator, which emits
     both languages into the HTML itself. */
  if (plain.indexOf('{{') !== -1) return false;
  return true;
}

function slug(text) {
  const words = decode(text).toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) {
    if (out && (out.length + w.length + 1) > 44) break;
    out += (out ? '-' : '') + w;
  }
  return out || 'text';
}

/** Attributes of a start tag, as a plain object. */
function parseAttrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m;
  const body = tag.replace(/^<\/?[a-zA-Z][^\s/>]*/, '').replace(/\/?>$/, '');
  while ((m = re.exec(body))) {
    let v = m[2] || '';
    if (v.length > 1 && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    out[m[1].toLowerCase()] = v;
  }
  return out;
}

/* ------------------------------------------------------------------- parser */
/**
 * Walks the HTML and returns every candidate string with enough context to
 * decide where its key goes. Nothing is rewritten here.
 */
function scan(html) {
  const TAG = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  const texts = [];      /* { start, end, raw, parent } */
  const tags = [];       /* every start tag, for attribute keys */
  const stack = [];
  let rawDepth = 0;
  let last = 0;
  let m;

  const pushText = (start, end) => {
    if (rawDepth) return;
    const raw = html.slice(start, end);
    if (!raw.trim()) return;
    const parent = stack[stack.length - 1];
    if (!parent) return;
    if (SKIP_TEXT_IN.has(parent.name)) return;
    parent.textRuns = (parent.textRuns || 0) + 1;
    texts.push({ start, end, raw, parent });
  };

  while ((m = TAG.exec(html))) {
    pushText(last, m.index);
    last = m.index + m[0].length;
    const tag = m[0];

    if (tag.slice(0, 4) === '<!--') continue;

    const closing = tag[1] === '/';
    const name = (tag.match(/^<\/?\s*([a-zA-Z][^\s/>]*)/) || [, ''])[1].toLowerCase();

    if (closing) {
      if (RAW.has(name) && rawDepth) rawDepth--;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) { stack.length = i; break; }
      }
      continue;
    }

    const selfClosing = /\/>$/.test(tag) || VOID.has(name);
    const attrs = parseAttrs(tag);
    const el = {
      name, attrs, textRuns: 0, childTags: 0,
      tagStart: m.index, tagEnd: m.index + tag.length, selfClosing,
      /* an element inside a raw block, or hidden from assistive tech, is not
         content — remember it so attribute keys can skip it too */
      inRaw: rawDepth > 0,
      hidden: attrs['aria-hidden'] === 'true',
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.childTags++;
    el.ancestors = stack.slice();
    tags.push(el);

    if (RAW.has(name)) { rawDepth++; continue; }
    if (!selfClosing) stack.push(el);
  }
  pushText(last, html.length);
  return { texts, tags };
}

/** Does this element, or anything above it, mean "leave the text alone"? */
function jsOwnedOrHidden(el) {
  const chain = (el.ancestors || []).concat([el]);
  return chain.some((a) =>
    a.hidden || a.inRaw ||
    JS_OWNED.has(a.attrs.id) ||
    /* the EN / हिं pill is the same in both languages by definition */
    'data-lang' in a.attrs ||
    'data-cfg' in a.attrs || 'data-year' in a.attrs || 'data-count' in a.attrs);
}

/* ---------------------------------------------------------------- pass one */
/* Collect candidates for every page, so a string used across the site can be
   recognised as chrome and share one key. */
const pageData = {};
const seenOn = new Map();   /* english text → Set(page) */

/**
 * Every key the site actually uses right now — the ones this run assigns plus
 * the ones already stamped into the markup. Anything in en.json that is not in
 * here belongs to copy that has since been rewritten or deleted, and is pruned
 * so the file stays an honest list of what needs translating.
 */
const liveKeys = new Set();

for (const file of Object.keys(PAGES)) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) { console.warn(`  ! missing ${file}`); continue; }
  const html = fs.readFileSync(abs, 'utf8');
  const { texts, tags } = scan(html);

  const strings = [];

  texts.forEach((t) => {
    const el = t.parent;
    if ('data-i18n' in el.attrs) {                /* already marked up */
      if (el.attrs['data-i18n']) liveKeys.add(el.attrs['data-i18n']);
      return;
    }
    if (jsOwnedOrHidden(el)) return;
    if (!translatable(t.raw)) return;
    strings.push({ kind: 'text', node: t, en: normalise(t.raw) });
  });

  tags.forEach((el) => {
    if (el.inRaw || el.hidden) return;
    if ('data-i18n-attr' in el.attrs) {
      el.attrs['data-i18n-attr'].split(',').forEach((pair) => {
        const key = (pair.split(':')[1] || '').trim();
        if (key) liveKeys.add(key);
      });
      return;
    }
    if ('data-lang' in el.attrs) return;
    ATTRS.forEach((a) => {
      const v = el.attrs[a];
      if (!v || !translatable(v)) return;
      /* an aria-label that only repeats visible text still needs translating,
         but a decorative alt="" does not — those are empty and already gone */
      strings.push({ kind: 'attr', el, attr: a, en: normalise(v) });
    });
  });

  pageData[file] = { html, strings };
  strings.forEach((s) => {
    if (!seenOn.has(s.en)) seenOn.set(s.en, new Set());
    seenOn.get(s.en).add(file);
  });
}

/* --------------------------------------------------------------- pass two */
/* Assign keys. Shared strings become common.*, so the footer is translated
   once rather than eleven times. */
const CHROME_THRESHOLD = 3;
const keyOf = new Map();        /* english → key */
const used = new Set();
const en = {};

function assign(text, scope, attrName) {
  if (keyOf.has(text)) return keyOf.get(text);
  const base = scope + '.' + (attrName ? attrName.replace('aria-', '') + '.' : '') + slug(text);
  let key = base;
  let n = 2;
  while (used.has(key)) key = base + '-' + n++;
  used.add(key);
  keyOf.set(text, key);
  en[key] = text;
  return key;
}

/* chrome first, so it wins the un-suffixed key */
const ordered = [];
for (const file of Object.keys(PAGES)) {
  (pageData[file] ? pageData[file].strings : []).forEach((s) => ordered.push({ file, s }));
}
ordered.sort((a, b) => {
  const ca = seenOn.get(a.s.en).size >= CHROME_THRESHOLD ? 0 : 1;
  const cb = seenOn.get(b.s.en).size >= CHROME_THRESHOLD ? 0 : 1;
  return ca - cb;
});
ordered.forEach(({ file, s }) => {
  const shared = seenOn.get(s.en).size >= CHROME_THRESHOLD;
  s.key = assign(s.en, shared ? 'common' : PAGES[file], s.kind === 'attr' ? s.attr : null);
  liveKeys.add(s.key);
});

/* ------------------------------------------------------------- pass three */
/* Rewrite each page. Edits are applied back to front so earlier offsets stay
   valid, and the document is never re-serialised — only these insertions. */
let totalMarked = 0;
const perPage = {};

for (const file of Object.keys(PAGES)) {
  const data = pageData[file];
  if (!data) continue;
  const edits = [];

  data.strings.forEach((s) => {
    if (s.kind === 'attr') {
      /* one element can carry several attribute keys */
      edits.push({ at: s.el.tagEnd, insertAttr: true, el: s.el, pair: s.attr + ':' + s.key });
      return;
    }
    const el = s.node.parent;
    const canAttach = el.childTags === 0 && el.textRuns === 1;
    if (canAttach) {
      edits.push({ at: el.tagEnd, insert: ` data-i18n="${s.key}"`, tag: true, el });
    } else {
      /* mixed content: the key belongs to this run, not to the whole element,
         so the run gets its own inline span */
      const raw = s.node.raw;
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      const core = raw.slice(lead.length, raw.length - trail.length);
      edits.push({
        start: s.node.start, end: s.node.end,
        replace: lead + `<span data-i18n="${s.key}">` + core + '</span>' + trail,
      });
    }
  });

  /* merge the attribute pairs of one element into a single attribute */
  const attrByEl = new Map();
  edits.filter((e) => e.insertAttr).forEach((e) => {
    if (!attrByEl.has(e.el)) attrByEl.set(e.el, []);
    attrByEl.get(e.el).push(e.pair);
  });

  const applied = edits.filter((e) => !e.insertAttr);
  attrByEl.forEach((pairs, el) => {
    applied.push({ at: el.tagEnd, insert: ` data-i18n-attr="${pairs.join(',')}"`, tag: true, el });
  });

  /* insert before the closing bracket of the start tag */
  applied.forEach((e) => {
    if (!e.tag) return;
    const tag = data.html.slice(e.el.tagStart, e.el.tagEnd);
    e.at = e.el.tagEnd - (/\/>$/.test(tag) ? 2 : 1);
  });

  applied.sort((a, b) => (b.start !== undefined ? b.start : b.at) - (a.start !== undefined ? a.start : a.at));

  let out = data.html;
  applied.forEach((e) => {
    if (e.replace !== undefined) out = out.slice(0, e.start) + e.replace + out.slice(e.end);
    else out = out.slice(0, e.at) + e.insert + out.slice(e.at);
  });

  perPage[file] = data.strings.length;
  totalMarked += data.strings.length;
  if (!REPORT && data.strings.length) fs.writeFileSync(path.join(ROOT, file), out);
}

/* --------------------------------------------------- strings built in JS */
/**
 * The page scripts build a lot of the interface themselves — the cards, the
 * result count, the profile sections — so those strings cannot be marked up in
 * HTML. They are written as T('js.something', 'English') and collected here, so
 * en.json stays the single list of everything that needs translating.
 */
const JS_FILES = [
  'js/ui.js', 'js/data.js', 'js/directory.js', 'js/profile.js', 'js/home.js',
  /* the microsite generator builds a few strings of its own */
  'tools/sync.js',
];
const T_CALL = /(?:\bT|i18n\.t)\(\s*'((?:js|microsite)\.[A-Za-z0-9_.-]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;

/**
 * Three microsite headings put the advocate's name on the other side of the
 * phrase in Hindi ("About Ramesh" vs "रमेश के बारे में"), so the generator
 * composes them from a fragment rather than a whole sentence. The fragments
 * have no English original to extract, so they are declared here.
 */
const GENERATOR_FRAGMENTS = {
  'microsite.about-name': '(Hindi only) follows the name: "<name> के बारे में"',
  'microsite.speak-to-name': '(Hindi only) follows the name: "<name> से बात कीजिए"',
  'microsite.what-name-takes-on': '(Hindi only) follows the name: "<name> किस तरह के केस लेते हैं"',

  /* VS.languageName() builds these keys from the language in the data, so the
     scan above cannot see them. Declared here so they are neither missing from
     en.json nor pruned out of it. Keep in step with LANG_HI in tools/sync.js,
     which the microsites use. */
  'js.language.hindi': 'Hindi',
  'js.language.english': 'English',
  'js.language.braj': 'Braj',
  'js.language.urdu': 'Urdu',
  'js.language.punjabi': 'Punjabi',
  'js.language.bengali': 'Bengali',
  'js.language.marathi': 'Marathi',
  'js.language.sanskrit': 'Sanskrit',
};
let jsKeys = 0;
const codeKeys = new Set();
JS_FILES.forEach((rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const src = fs.readFileSync(abs, 'utf8');
  let m;
  while ((m = T_CALL.exec(src))) {
    const key = m[1];
    const value = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (en[key] && en[key] !== value) {
      console.warn(`  ! ${key} has two different English strings:\n      ${en[key]}\n      ${value}`);
    }
    if (!en[key]) jsKeys++;
    en[key] = value;
    codeKeys.add(key);
  }
});

Object.keys(GENERATOR_FRAGMENTS).forEach((k) => {
  if (!en[k]) { en[k] = GENERATOR_FRAGMENTS[k]; jsKeys++; }
  codeKeys.add(k);
});

/* ------------------------------------------------------------------ output */
const I18N_DIR = path.join(ROOT, 'data', 'i18n');
const EN = path.join(I18N_DIR, 'en.json');
const HI = path.join(I18N_DIR, 'hi.json');

/* keep any keys already in en.json that this run did not see — they belong to
   markup that is already stamped, and dropping them would lose the Hindi */
let merged = en;
let pruned = 0;
if (fs.existsSync(EN)) {
  const before = JSON.parse(fs.readFileSync(EN, 'utf8'));
  /* js.* keys come only from the code scan, so one that is no longer called
     anywhere is dead and is dropped. Keys from markup are kept either way —
     this run skips elements that are already stamped, so it cannot see them
     all and must not judge them. */
  Object.keys(before).forEach((k) => {
    const dead = k.indexOf('js.') === 0
      ? !codeKeys.has(k)
      : !(liveKeys.has(k) || codeKeys.has(k));
    if (dead) { delete before[k]; pruned++; }
  });
  merged = Object.assign({}, before, en);
}
const sorted = {};
Object.keys(merged).sort().forEach((k) => { sorted[k] = merged[k]; });

if (!REPORT) {
  fs.mkdirSync(I18N_DIR, { recursive: true });
  fs.writeFileSync(EN, JSON.stringify(sorted, null, 2) + '\n');
  if (!fs.existsSync(HI)) fs.writeFileSync(HI, '{}\n');
}

console.log(`${REPORT ? '(report only) ' : ''}${totalMarked} strings marked up this run`);
Object.keys(perPage).forEach((f) => {
  if (perPage[f]) console.log(`  ${f.padEnd(28)} ${perPage[f]}`);
});
if (jsKeys) console.log(`  js/*.js                      ${jsKeys} strings built in JavaScript`);
if (pruned) console.log(`  pruned                       ${pruned} key(s) whose copy no longer exists`);
console.log(`  data/i18n/en.json            ${Object.keys(sorted).length} keys total`);

/* translation status */
if (fs.existsSync(HI)) {
  const hi = JSON.parse(fs.readFileSync(HI, 'utf8'));
  const missing = Object.keys(sorted).filter((k) => !hi[k]);
  const orphan = Object.keys(hi).filter((k) => !(k in sorted));
  console.log(`  data/i18n/hi.json            ${Object.keys(hi).length} translated, ${missing.length} missing`);
  if (orphan.length) {
    console.log(`\n\x1b[33m  ${orphan.length} Hindi key(s) no longer used (English copy changed?):\x1b[0m`);
    orphan.slice(0, 20).forEach((k) => console.log('   - ' + k));
  }
  if (REPORT && missing.length) {
    console.log(`\n  first 30 untranslated keys:`);
    missing.slice(0, 30).forEach((k) => console.log(`   ${k}\n     ${sorted[k].slice(0, 90)}`));
  }
}
