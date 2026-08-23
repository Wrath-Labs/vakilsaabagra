#!/usr/bin/env node
/* ============================================================================
   Vakil Saab Agra — vector logo builder.

     node tools/brand/build-logos.js

   Writes every logo variant to assets/brand/logo/ and assets/brand/icon/ as
   SVG. One geometry source (the scales-of-justice mark and one lockup grid)
   produces all of them, so the mark cannot drift between the favicon, the
   business card and the LinkedIn banner.

   ---------------------------------------------------------------------------
   Why the SVGs do not embed a font
   ---------------------------------------------------------------------------
   The wordmark is set in Playfair Display, the tagline in Inter. Embedding
   either as a data: URI would add ~120 KB to every file, and outlining them
   needs a font toolchain this repo deliberately does not have. Instead each
   text run carries `textLength`, which pins its advance width: a renderer
   without Playfair falls back to Georgia and adjusts the letter-spacing to
   land on exactly the same width, so the layout never breaks — only the
   letterforms differ.

   For anything where the letterforms matter (banners, print, anything a
   customer sees), use the PNGs from tools/brand/render.js. Those are shot in
   a browser with the real webfonts loaded.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { color: C, brand: B, type: T } = require('./tokens');

const ROOT = path.resolve(__dirname, '../..');
const LOGO_DIR = path.join(ROOT, 'assets/brand/logo');
const ICON_DIR = path.join(ROOT, 'assets/brand/icon');

/* ---------------------------------------------------------------- gradients */

/* Gradient coordinates are in userSpaceOnUse, not objectBoundingBox: the mark
   is a dozen separate strokes and shapes, and objectBoundingBox would restart
   the ramp inside each one instead of running a single sweep of light across
   the whole drawing. Inside a scaled <g> the coordinates resolve against the
   group's own space, so mark gradients are written on the 512 grid and the
   type gradient on the lockup's own. */

const gradNavy = (id) => `
    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="512" y2="512">
      <stop offset="0%" stop-color="${C.ink2}"/><stop offset="50%" stop-color="${C.ink}"/><stop offset="100%" stop-color="${C.ink3}"/>
    </linearGradient>`;

const gradGold = (id) => `
    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="90" y1="60" x2="430" y2="440">
      <stop offset="0%" stop-color="${C.gold3}"/><stop offset="35%" stop-color="${C.gold2}"/><stop offset="70%" stop-color="#c39c40"/><stop offset="100%" stop-color="${C.gold4}"/>
    </linearGradient>`;

/* The tagline rule and the tagline itself share one horizontal gold sweep, so
   it has to span whichever lockup is being drawn. */
const gradGoldFlat = (id, x1, x2) => `
    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="0" x2="${x2}" y2="0">
      <stop offset="0%" stop-color="#b3862a"/><stop offset="45%" stop-color="#d4ad50"/><stop offset="100%" stop-color="#a87f27"/>
    </linearGradient>`;

/* -------------------------------------------------------------- the mark art
   Drawn on a 512 x 512 grid: a balance beam on a standing post, two pans
   hanging from hooks, a domed cap, a stepped base. `art` is the strokework and
   the fittings; `boss` is the pinhole at the centre of the beam, which reads as
   a hole and so takes the colour of whatever sits behind the mark. */

function markArt(art, boss) {
  return `  <g fill="none" stroke="${art}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M214 132 Q256 62 298 132" stroke-width="13"/>
    <path d="M256 62 V 40" stroke-width="9"/>
    <path d="M256 132 V 372" stroke-width="16"/>
    <path d="M112 186 H 400" stroke-width="16"/>
    <path d="M112 186 L 76 252 M112 186 L 148 252" stroke-width="8"/>
    <path d="M400 186 L 364 252 M400 186 L 436 252" stroke-width="8"/>
    <path d="M64 252 Q112 320 160 252" stroke-width="15"/>
    <path d="M352 252 Q400 320 448 252" stroke-width="15"/>
    <path d="M190 372 Q256 352 322 372" stroke-width="15"/>
  </g>
  <circle cx="256" cy="40" r="11" fill="${art}"/>
  <circle cx="256" cy="186" r="22" fill="${art}"/>
  <circle cx="256" cy="186" r="8" fill="${boss}"/>
  <rect x="166" y="386" width="180" height="18" rx="9" fill="${art}"/>
  <rect x="60" y="246" width="104" height="12" rx="6" fill="${art}"/>
  <rect x="348" y="246" width="104" height="12" rx="6" fill="${art}"/>`;
}

/* A tile-backed mark: rounded square, hairline inset frame, art on top. */
function markTile({ tile, art, frame, boss }) {
  return `  <rect width="512" height="512" rx="116" fill="${tile}"/>
  <rect x="16" y="16" width="480" height="480" rx="102" fill="none" stroke="${frame}" stroke-width="4" opacity="0.5"/>
${markArt(art, boss)}`;
}

/* ------------------------------------------------------------- the lockups
   One grid, three crops. The mark is 300 units tall and the type block is
   optically centred against it rather than mathematically — a wordmark with no
   descenders sits low if you centre it on its em box. */

const LOCKUP = {
  markSize: 300,
  wordSize: 126,
  wordWidth: 600,   // textLength — pins the layout across font fallbacks
  tagSize: 30,
  tagWidth: 632,
  ruleW: 632,
};

function typeBlock({ x, wordFill, ruleFill, tagFill, anchor = 'start', baseline = 156 }) {
  const L = LOCKUP;
  const ruleX = anchor === 'middle' ? x - L.ruleW / 2 : x;
  return `  <text x="${x}" y="${baseline}" text-anchor="${anchor}" font-family="${T.displaySvg}" font-size="${L.wordSize}" font-weight="700" textLength="${L.wordWidth}" fill="${wordFill}">${B.wordmark}</text>
  <rect x="${ruleX}" y="${baseline + 28}" width="${L.ruleW}" height="4" rx="2" fill="${ruleFill}" opacity="0.85"/>
  <text x="${x}" y="${baseline + 86}" text-anchor="${anchor}" font-family="${T.sansSvg}" font-size="${L.tagSize}" font-weight="600" letter-spacing="7" textLength="${L.tagWidth}" fill="${tagFill}">${B.tagline}</text>`;
}

/* ----------------------------------------------------------------- variants
   Each palette says how the three logo elements are coloured. `open` means the
   mark is drawn without its tile, which is what you want on a dark background
   where a navy tile would simply disappear. */

const PALETTES = {
  light: {
    label: 'full colour, for light backgrounds',
    mark: (ids) => markTile({ tile: `url(#${ids.navy})`, art: `url(#${ids.gold})`, frame: `url(#${ids.gold})`, boss: C.ink }),
    word: C.ink,
    rule: (ids) => `url(#${ids.goldFlat})`,
    tag:  (ids) => `url(#${ids.goldFlat})`,
    defs: (ids, span) => gradNavy(ids.navy) + gradGold(ids.gold) + gradGoldFlat(ids.goldFlat, span[0], span[1]),
  },
  dark: {
    label: 'full colour, for dark backgrounds',
    mark: (ids) => markArt(`url(#${ids.gold})`, 'none'),
    word: C.paper,
    rule: () => C.gold2,
    tag:  () => C.gold2,
    defs: (ids) => gradGold(ids.gold),
  },
  'mono-navy':  { label: 'one colour, navy',  flat: C.ink },
  'mono-white': { label: 'one colour, white', flat: C.paper },
  'mono-black': { label: 'one colour, black', flat: '#000000' },
};

/* Flatten the mono palettes into the same shape as the two-colour ones. */
for (const [k, p] of Object.entries(PALETTES)) {
  if (!p.flat) continue;
  PALETTES[k] = {
    label: p.label,
    mark: () => markArt(p.flat, 'none'),
    word: p.flat,
    rule: () => p.flat,
    tag:  () => p.flat,
    defs: () => '',
    mono: true,
  };
}

/* --------------------------------------------------------------- assembly */

let uid = 0;
const gradIds = () => {
  const n = ++uid;
  return { navy: `n${n}`, gold: `g${n}`, goldFlat: `f${n}` };
};

function svg({ w, h, title, defs, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
  <title>${title}</title>${defs ? `\n  <defs>${defs}\n  </defs>` : ''}
${body}
</svg>
`;
}

function horizontal(key) {
  const p = PALETTES[key];
  const ids = gradIds();
  const L = LOCKUP;
  const body =
`  <g transform="translate(0,8) scale(${(L.markSize / 512).toFixed(6)})">
${p.mark(ids)}
  </g>
${typeBlock({ x: 356, wordFill: p.word, ruleFill: p.rule(ids), tagFill: p.tag(ids) })}`;
  return svg({ w: 1000, h: 316, title: `${B.name} — horizontal logo, ${p.label}`, defs: p.defs(ids, [356, 988]), body });
}

function stacked(key) {
  const p = PALETTES[key];
  const ids = gradIds();
  const L = LOCKUP;
  const body =
`  <g transform="translate(200,0) scale(${(L.markSize / 512).toFixed(6)})">
${p.mark(ids)}
  </g>
${typeBlock({ x: 350, anchor: 'middle', baseline: 428, wordFill: p.word, ruleFill: p.rule(ids), tagFill: p.tag(ids) })}`;
  return svg({ w: 700, h: 540, title: `${B.name} — stacked logo, ${p.label}`, defs: p.defs(ids, [34, 666]), body });
}

function wordmark(key) {
  const p = PALETTES[key];
  const ids = gradIds();
  const body = typeBlock({ x: 0, baseline: 124, wordFill: p.word, ruleFill: p.rule(ids), tagFill: p.tag(ids) });
  return svg({ w: 632, h: 226, title: `${B.name} — wordmark, ${p.label}`, defs: p.defs(ids, [0, 632]), body });
}

function mark(key) {
  const p = PALETTES[key];
  const ids = gradIds();
  return svg({ w: 512, h: 512, title: `${B.name} — mark, ${p.label}`, defs: p.defs(ids, [0, 512]), body: p.mark(ids) });
}

/* The paper tile is its own thing: navy art on a warm off-white square, for
   placement on photography or a coloured panel where a navy tile would fight
   the background. */
function markPaper() {
  const ids = gradIds();
  const body = markTile({ tile: C.paper2, art: C.ink, frame: C.gold, boss: C.paper2 });
  return svg({ w: 512, h: 512, title: `${B.name} — mark, navy on paper`, defs: gradGold(ids.gold), body });
}

/* ------------------------------------------------------------- the favicon
   At 16 px the hooks, chains and base steps turn to mud. This variant keeps
   only what still reads at that size — beam, post, two pans, the boss — and
   thickens every stroke. It is a different drawing on purpose, not a scale of
   the main mark. */
function favicon() {
  const ids = gradIds();
  const body =
`  <rect width="512" height="512" rx="112" fill="url(#${ids.navy})"/>
  <g fill="none" stroke="url(#${ids.gold})" stroke-linecap="round" stroke-linejoin="round">
    <path d="M256 118 V 388" stroke-width="30"/>
    <path d="M96 178 H 416" stroke-width="30"/>
    <path d="M52 250 Q108 330 164 250" stroke-width="26"/>
    <path d="M348 250 Q404 330 460 250" stroke-width="26"/>
  </g>
  <rect x="46" y="240" width="124" height="20" rx="10" fill="url(#${ids.gold})"/>
  <rect x="342" y="240" width="124" height="20" rx="10" fill="url(#${ids.gold})"/>
  <rect x="156" y="392" width="200" height="26" rx="13" fill="url(#${ids.gold})"/>
  <circle cx="256" cy="178" r="34" fill="url(#${ids.gold})"/>
  <circle cx="256" cy="178" r="13" fill="${C.ink}"/>`;
  return svg({ w: 512, h: 512, title: `${B.name} — favicon`, defs: gradNavy(ids.navy) + gradGold(ids.gold), body });
}

/* ------------------------------------------------------------------- write */

const files = [];
const put = (dir, name, content) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
  files.push(path.relative(ROOT, path.join(dir, name)));
};

for (const key of Object.keys(PALETTES)) {
  put(LOGO_DIR, `logo-horizontal-${key}.svg`, horizontal(key));
  put(LOGO_DIR, `logo-stacked-${key}.svg`, stacked(key));
  put(LOGO_DIR, `wordmark-${key}.svg`, wordmark(key));
}

put(ICON_DIR, 'mark-navy.svg', mark('light'));
put(ICON_DIR, 'mark-paper.svg', markPaper());
put(ICON_DIR, 'mark-gold.svg', mark('dark'));
put(ICON_DIR, 'mark-mono-navy.svg', mark('mono-navy'));
put(ICON_DIR, 'mark-mono-white.svg', mark('mono-white'));
put(ICON_DIR, 'mark-mono-black.svg', mark('mono-black'));
put(ICON_DIR, 'favicon.svg', favicon());

console.log(`${files.length} vector files:`);
files.forEach((f) => console.log(`  ${f}`));
