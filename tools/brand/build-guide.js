#!/usr/bin/env node
/* ============================================================================
   Vakil Saab Agra — builds the shareable brand guide page.

     node tools/brand/build-guide.js [outfile.html]

   The guide shows the real files rather than a redrawing of them: the logos
   are the actual SVGs inlined, the favicon strip is the actual favicon PNGs at
   actual size, and the contrast numbers are computed here from the same
   tokens the palette is built from. Nothing on the page can drift from the kit
   without the page changing too.

   Banner previews are downscaled JPEGs embedded as data: URIs, because an
   Artifact has to be a single self-contained file.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const { color: C, brand: B } = require('./tokens');

const ROOT = path.resolve(__dirname, '../..');
const BRAND = path.join(ROOT, 'assets/brand');
const OUT = process.argv[2] || path.join(ROOT, 'brand-guide.html');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vsa-guide-'));

/* --------------------------------------------------------------- helpers */

let seq = 0;
function svg(rel, cls = '') {
  const ns = `q${++seq}`;
  let s = fs.readFileSync(path.join(BRAND, rel), 'utf8')
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<title>[^<]*<\/title>\s*/g, '')
    .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '')
      .replace('<svg', `<svg class="${cls}" preserveAspectRatio="xMidYMid meet"`));
  for (const id of s.match(/id="([^"]+)"/g)?.map((m) => m.slice(4, -1)) || []) {
    s = s.split(`id="${id}"`).join(`id="${ns}-${id}"`).split(`url(#${id})`).join(`url(#${ns}-${id})`);
  }
  return s;
}

/* A PNG straight from the kit, at whatever size it already is. */
const png = (rel) => `data:image/png;base64,${fs.readFileSync(path.join(BRAND, rel)).toString('base64')}`;

/* A banner, downscaled and re-encoded so the page stays one loadable file. */
function preview(rel, width = 860) {
  const tmp = path.join(TMP, `p${++seq}.png`);
  fs.copyFileSync(path.join(BRAND, rel), tmp);
  execFileSync('sips', ['--resampleWidth', String(width), tmp], { stdio: 'ignore' });
  const jpg = tmp.replace(/\.png$/, '.jpg');
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', tmp, '--out', jpg], { stdio: 'ignore' });
  return `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`;
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x + 0.05) / (y + 0.05));
};
const r2 = (a, b) => ratio(a, b).toFixed(2);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Counted, not asserted — a hardcoded total is wrong the first time anyone
   adds a size to the manifest. */
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const kit = walk(BRAND);
const nPng = kit.filter((f) => f.endsWith('.png')).length;
const nSvg = kit.filter((f) => f.endsWith('.svg')).length;

/* ------------------------------------------------------------------ page */

const SWATCHES = [
  ['ink',     C.ink,    'Brand navy',        'Headings, navigation, primary surfaces', r2(C.ink, C.paper) + ':1 on white'],
  ['ink-2',   C.ink2,   'Gradient top',      'The navy gradient only — not a flat fill', '—'],
  ['ink-3',   C.ink3,   'Gradient bottom',   'The navy gradient only — not a flat fill', '—'],
  ['gold',    C.gold,   'Accessible gold',   'Large text, eyebrows and rules. Never body copy', r2(C.gold, C.paper) + ':1 on white'],
  ['gold-2',  C.gold2,  'Decorative gold',   'Text and rules on navy. Decoration only on paper', r2(C.gold2, C.ink) + ':1 on navy'],
  ['gold-3',  C.gold3,  'Highlight',         'The shine in the metal gradient', '—'],
  ['gold-4',  C.gold4,  'Shadow',            'The dark edge of the metal gradient', '—'],
  ['paper',   C.paper,  'Paper',             'Page background', '—'],
  ['paper-2', C.paper2, 'Warm band',         'Alternating section bands', '—'],
  ['paper-3', C.paper3, 'Deep band',         'The heavier alternating band', '—'],
  ['line',    C.line,   'Hairline',          'Borders and dividers on paper', '—'],
  ['muted',   C.muted,  'Secondary text',    'Supporting copy on paper', r2(C.muted, C.paper) + ':1 on white'],
  ['muted-2', C.muted2, 'Inactive control',  'Never text — the resting state of a control', r2(C.muted2, C.paper) + ':1 on white'],
  ['slate',   C.slate,  'Body on navy',      'Running copy on the navy ground', r2(C.slate, C.ink) + ':1 on navy'],
];

const CONTRAST = [
  ['Navy on paper', C.ink, C.paper, 4.5, 'Headings and body copy'],
  ['Secondary on paper', C.muted, C.paper, 4.5, 'Supporting copy'],
  ['Gold on paper', C.gold, C.paper, 3, 'Large text and rules only'],
  ['Inactive control on paper', C.muted2, C.paper, 3, 'Not a text colour at any size'],
  ['White on navy', C.paper, C.ink, 4.5, 'Headings on the navy ground'],
  ['Slate on navy', C.slate, C.ink, 4.5, 'Body copy on navy'],
  ['Gold on navy', C.gold2, C.ink, 4.5, 'Gold text and rules on navy'],
  ['Navy in a gold pill', C.ink, C.gold2, 4.5, 'The button label'],
];

const SOCIAL = [
  ['x-header-dark.png', 'X header', '1500 × 500', 'The left third stays clear below the midline — the avatar sits there.'],
  ['linkedin-personal-cover.png', 'LinkedIn profile background', '1584 × 396', 'Everything readable sits right of centre, clear of the profile photo.'],
  ['facebook-cover.png', 'Facebook page cover', '1640 × 856', 'Composed inside a centred 1180 × 560 box — the desktop crop is 820 × 312.'],
  ['youtube-banner.png', 'YouTube channel art', '2560 × 1440', 'Everything lives in the centred 1546 × 423 a phone actually shows.'],
  ['instagram-post.png', 'Instagram post', '1080 × 1080', 'Carries the promise in both scripts, which is the point of the product.'],
  ['instagram-story.png', 'Instagram story', '1080 × 1920', 'Stays 260px clear of the top and bottom, under Instagram’s own chrome.'],
  ['og-image.png', 'Link preview', '1200 × 630', 'Read at about 400px wide in a chat, so the headline is set large.'],
  ['avatar-dark.png', 'Profile picture', '1000 × 1000', 'Inset so a circular crop only eats the corners of the tile.'],
];

const html = `<title>Vakil Saab Brand Kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap">
<style>
/* ---------------------------------------------------------------- tokens
   The page is the brand, so its two themes are the brand's two grounds:
   warm paper, and the navy. Nothing here is a naive inversion — the dark
   theme is the same surface the banners are built on. */
:root {
  --ground: ${C.paper};
  --band: ${C.paper2};
  --panel: ${C.paper};
  --rule: ${C.line};
  --rule-soft: #f0ece2;
  --fg: ${C.ink};
  --fg-2: ${C.muted};
  --fg-3: #8794a6;
  --gold: ${C.gold};
  --gold-ink: ${C.gold};
  --code-bg: ${C.paper3};
  --shadow: 0 1px 2px rgba(15,37,64,.05), 0 12px 32px -18px rgba(15,37,64,.28);
  --stage-line: rgba(15,37,64,.08);

  --measure: 68ch;
  --step--1: clamp(.78rem, .76rem + .1vw, .84rem);
  --step-0: clamp(.98rem, .94rem + .18vw, 1.06rem);
  --step-1: clamp(1.16rem, 1.08rem + .3vw, 1.3rem);
  --step-2: clamp(1.5rem, 1.3rem + .8vw, 2rem);
  --step-3: clamp(2rem, 1.6rem + 1.7vw, 3.1rem);
  --step-4: clamp(2.7rem, 1.9rem + 3.4vw, 5rem);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: ${C.ink3};
    --band: #0b1c33;
    --panel: ${C.ink};
    --rule: rgba(220,184,95,.20);
    --rule-soft: rgba(220,184,95,.10);
    --fg: #ffffff;
    --fg-2: ${C.slate};
    --fg-3: #7d94ad;
    --gold: ${C.gold2};
    --gold-ink: ${C.gold2};
    --code-bg: rgba(255,255,255,.05);
    --shadow: 0 1px 2px rgba(0,0,0,.35), 0 16px 40px -20px rgba(0,0,0,.7);
    --stage-line: rgba(220,184,95,.13);
  }
}
:root[data-theme="dark"] {
  --ground: ${C.ink3};
  --band: #0b1c33;
  --panel: ${C.ink};
  --rule: rgba(220,184,95,.20);
  --rule-soft: rgba(220,184,95,.10);
  --fg: #ffffff;
  --fg-2: ${C.slate};
  --fg-3: #7d94ad;
  --gold: ${C.gold2};
  --gold-ink: ${C.gold2};
  --code-bg: rgba(255,255,255,.05);
  --shadow: 0 1px 2px rgba(0,0,0,.35), 0 16px 40px -20px rgba(0,0,0,.7);
  --stage-line: rgba(220,184,95,.13);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--fg);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: var(--step-0);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.display { font-family: "Playfair Display", Georgia, "Times New Roman", serif; letter-spacing: -.018em; }

/* ---------------------------------------------------------------- shell */
.band { padding: clamp(3.4rem, 7vw, 6.4rem) clamp(1.15rem, 5vw, 3rem); }
.band + .band { border-top: 1px solid var(--rule-soft); }
.band.alt { background: var(--band); }
.wrap { max-width: 1120px; margin-inline: auto; }

.eyebrow {
  font-size: var(--step--1); font-weight: 700; text-transform: uppercase;
  letter-spacing: .26em; color: var(--gold-ink); margin: 0;
}
h2.display { font-size: var(--step-2); line-height: 1.12; margin: .5rem 0 0; text-wrap: balance; }
h3 { font-size: var(--step-1); margin: 0 0 .35rem; font-weight: 600; letter-spacing: -.01em; }
.lede { max-width: var(--measure); color: var(--fg-2); margin: 1rem 0 0; }
.head { margin-bottom: clamp(2rem, 4vw, 3rem); }
.head::after {
  content: ""; display: block; width: 74px; height: 3px; border-radius: 2px;
  margin-top: 1.5rem; background: linear-gradient(90deg, ${C.gold3}, ${C.gold2} 45%, ${C.gold});
}
p { margin: 0 0 1rem; max-width: var(--measure); }
p:last-child { margin-bottom: 0; }
.note { color: var(--fg-2); font-size: var(--step--1); }
strong { font-weight: 600; color: var(--fg); }

/* ----------------------------------------------------------------- hero */
.hero { padding-block: clamp(4rem, 9vw, 8rem); }
.hero-logo { width: min(560px, 82%); height: auto; display: block; }
.hero h1 { font-size: var(--step-4); line-height: 1.02; margin: 2.4rem 0 0; max-width: 16ch; text-wrap: balance; }
.hero .lede { font-size: var(--step-1); margin-top: 1.4rem; }
.facts { display: flex; flex-wrap: wrap; gap: 0 2.6rem; margin-top: 2.8rem; padding-top: 1.6rem; border-top: 1px solid var(--rule); }
.fact { padding-block: .5rem; }
.fact dt { font-size: var(--step--1); text-transform: uppercase; letter-spacing: .16em; color: var(--fg-3); font-weight: 600; }
.fact dd { margin: .25rem 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }

/* --------------------------------------------------------------- stages
   A specimen sits on the ground the asset was drawn for, whatever theme the
   reader is in — the page demonstrates the rule it is teaching. */
.grid { display: grid; gap: clamp(.9rem, 2vw, 1.4rem); }
.g2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.g3 { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }

.stage {
  display: grid; place-items: center;
  padding: clamp(1.4rem, 3vw, 2.4rem);
  border-radius: 4px; border: 1px solid var(--rule);
  min-height: 168px;
}
.stage.paper { background: ${C.paper2}; border-color: ${C.line}; }
.stage.navy  { background: linear-gradient(135deg, ${C.ink2} 0%, ${C.ink} 52%, ${C.ink3} 100%); border-color: rgba(220,184,95,.22); }
.stage.busy {
  background:
    linear-gradient(135deg, rgba(15,37,64,.55), rgba(176,134,31,.5)),
    repeating-linear-gradient(48deg, #7d6a4a 0 22px, #5d6b7a 22px 44px);
  border-color: rgba(255,255,255,.2);
}
.stage svg, .stage img { max-width: 100%; height: auto; display: block; }
.cap { margin-top: .6rem; font-size: var(--step--1); color: var(--fg-2); }
.cap b { color: var(--fg); font-weight: 600; }

/* ------------------------------------------------------------- swatches */
.sw { border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; background: var(--panel); }
.sw .chip { height: 88px; }
.sw .meta { padding: .8rem .9rem 1rem; }
.sw .hex { font-size: var(--step--1); font-variant-numeric: tabular-nums; letter-spacing: .04em; color: var(--fg-2); text-transform: uppercase; }
.sw .nm { font-weight: 600; }
.sw .role { font-size: var(--step--1); color: var(--fg-2); margin-top: .3rem; }
.sw .ratio { font-size: var(--step--1); color: var(--fg-3); margin-top: .45rem; font-variant-numeric: tabular-nums; }

/* ---------------------------------------------------------------- table */
.tablewrap { overflow-x: auto; border: 1px solid var(--rule); border-radius: 4px; }
table { border-collapse: collapse; width: 100%; min-width: 620px; font-size: var(--step--1); }
th, td { text-align: left; padding: .7rem .9rem; border-bottom: 1px solid var(--rule-soft); }
th { font-weight: 600; text-transform: uppercase; letter-spacing: .12em; font-size: .74rem; color: var(--fg-3); }
tr:last-child td { border-bottom: 0; }
td.num { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; white-space: nowrap; }
.pass, .warn { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: .15rem .45rem; border-radius: 3px; white-space: nowrap; }
.pass { color: #1c6b46; background: rgba(28,107,70,.1); }
.warn { color: #8a5a12; background: rgba(176,134,31,.14); }
:root[data-theme="dark"] .pass { color: #7fd6ac; background: rgba(127,214,172,.12); }
:root[data-theme="dark"] .warn { color: ${C.gold3}; background: rgba(220,184,95,.14); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .pass { color: #7fd6ac; background: rgba(127,214,172,.12); }
  :root:not([data-theme="light"]) .warn { color: ${C.gold3}; background: rgba(220,184,95,.14); }
}

/* ------------------------------------------------------------ favicons */
.sizes { display: flex; align-items: flex-end; gap: 1.6rem; flex-wrap: wrap; }
.size { text-align: center; }
.size img { display: block; margin: 0 auto .5rem; image-rendering: auto; }
.size span { font-size: .7rem; color: var(--fg-2); font-variant-numeric: tabular-nums; }

/* ---------------------------------------------------------- misuse grid */
.no { position: relative; }
.no .stage { border-color: rgba(178,58,44,.45); }
.no .cap b { color: #b23a2c; }
:root[data-theme="dark"] .no .cap b { color: #ef8b7c; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .no .cap b { color: #ef8b7c; } }

/* -------------------------------------------------------------- gallery */
.shot { border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; background: var(--panel); }
.shot img { display: block; width: 100%; height: auto; }
.shot .meta { padding: .85rem 1rem 1.05rem; border-top: 1px solid var(--rule-soft); }
.shot .row { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
.shot .dim { font-size: var(--step--1); color: var(--fg-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.shot p { font-size: var(--step--1); color: var(--fg-2); margin: .35rem 0 0; }

/* -------------------------------------------------------------- type */
.spec { border-top: 1px solid var(--rule); padding-top: 1.4rem; margin-top: 1.4rem; }
.spec .big { font-size: var(--step-3); line-height: 1.08; margin: 0; }
.spec .meta { font-size: var(--step--1); color: var(--fg-3); text-transform: uppercase; letter-spacing: .16em; font-weight: 600; }
.hi { font-family: "Noto Sans Devanagari", sans-serif; }

/* --------------------------------------------------------------- code */
pre { background: var(--code-bg); border: 1px solid var(--rule-soft); border-radius: 4px; padding: 1rem 1.1rem; overflow-x: auto; margin: 0; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .84em; }
.files { list-style: none; padding: 0; margin: 0; display: grid; gap: .55rem; }
.files li { display: flex; gap: .9rem; align-items: baseline; padding-bottom: .55rem; border-bottom: 1px solid var(--rule-soft); }
.files code { color: var(--gold-ink); white-space: nowrap; }
.files span { color: var(--fg-2); font-size: var(--step--1); }

footer { padding: 3rem clamp(1.15rem, 5vw, 3rem) 4rem; border-top: 1px solid var(--rule); color: var(--fg-3); font-size: var(--step--1); }
footer .wrap { display: flex; flex-wrap: wrap; gap: 1rem 2rem; justify-content: space-between; }
a { color: var(--gold-ink); }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
/* The hero shows the lockup that can actually be seen on the reader's ground.
   Written as three states, not two: the un-stamped default is the common one. */
.only-dark { display: none; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .only-dark { display: block; }
  :root:not([data-theme="light"]) .only-light { display: none; }
}
:root[data-theme="dark"] .only-dark { display: block; }
:root[data-theme="dark"] .only-light { display: none; }

@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>

<header class="band hero">
  <div class="wrap">
    ${svg('logo/logo-horizontal-light.svg', 'hero-logo only-light')}
    ${svg('logo/logo-horizontal-dark.svg', 'hero-logo only-dark')}
    <h1 class="display">The brand kit</h1>
    <p class="lede">Every logo, icon, banner and print piece for ${B.name} — how each one is drawn, where it is allowed to go, and the one command that regenerates all of it.</p>
    <dl class="facts">
      <div class="fact"><dt>Files</dt><dd>${kit.length}</dd></div>
      <div class="fact"><dt>Vector</dt><dd>${nSvg}</dd></div>
      <div class="fact"><dt>Rendered</dt><dd>${nPng}</dd></div>
      <div class="fact"><dt>Display</dt><dd>Playfair Display</dd></div>
      <div class="fact"><dt>Text</dt><dd>Inter</dd></div>
      <div class="fact"><dt>Hindi</dt><dd>Noto Sans Devanagari</dd></div>
    </dl>
  </div>
</header>

<section class="band alt">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">The mark</p>
      <h2 class="display">Scales, drawn as an object</h2>
      <p class="lede">A balance beam on a standing post, two pans, a domed cap and a stepped base. It reads as law without a gavel — which is an American courtroom prop, not an Indian one.</p>
    </div>
    <div class="grid g3">
      <div><div class="stage paper">${svg('icon/mark-navy.svg', 'mk')}</div><p class="cap"><b>mark-navy</b> — the default. App icons, avatars, anything on a light or busy ground.</p></div>
      <div><div class="stage navy">${svg('icon/mark-gold.svg', 'mk')}</div><p class="cap"><b>mark-gold</b> — the drawing alone, for placing on navy. The tile would be invisible there.</p></div>
      <div><div class="stage busy">${svg('icon/mark-paper.svg', 'mk')}</div><p class="cap"><b>mark-paper</b> — navy on a warm tile, for photography and coloured panels.</p></div>
      <div><div class="stage paper">${svg('icon/mark-mono-navy.svg', 'mk')}</div><p class="cap"><b>mark-mono-navy</b> — one ink. Stamps, embroidery, a fax header.</p></div>
      <div><div class="stage navy">${svg('icon/mark-mono-white.svg', 'mk')}</div><p class="cap"><b>mark-mono-white</b> — one ink, reversed.</p></div>
      <div><div class="stage paper">${svg('icon/mark-mono-black.svg', 'mk')}</div><p class="cap"><b>mark-mono-black</b> — one ink, for a job printed in black only.</p></div>
    </div>
    <style>.mk { width: 118px; }</style>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">The favicon</p>
      <h2 class="display">A different drawing, on purpose</h2>
      <p class="lede">At 16&nbsp;px the hooks, chains and base steps turn into three grey pixels. The favicon keeps only the beam, the post, the two pans and the boss, and thickens every stroke until each one survives. These are the real files, at real size.</p>
    </div>
    <div class="grid g2">
      <div>
        <div class="stage paper">
          <div class="sizes">
            ${[16, 32, 48, 64].map((n) => `<div class="size"><img src="${png(`icon/favicon-${n}.png`)}" width="${n}" height="${n}" alt="Favicon at ${n} pixels"><span>${n}px</span></div>`).join('')}
          </div>
        </div>
        <p class="cap"><b>favicon.svg</b> — used at 64px and below.</p>
      </div>
      <div>
        <div class="stage paper">
          <div class="sizes">
            ${[16, 32, 48, 64].map((n) => `<div class="size"><img src="${png('icon/mark-navy-256.png')}" width="${n}" height="${n}" alt="Full mark at ${n} pixels"><span>${n}px</span></div>`).join('')}
          </div>
        </div>
        <p class="cap"><b>The full mark at the same sizes</b> — the beam and the pans merge. This is what the simplification avoids.</p>
      </div>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Lockups</p>
      <h2 class="display">Three crops of one grid</h2>
      <p class="lede">The mark is the same size relative to the wordmark in all three, so they can sit on facing pages without looking like different logos. Each comes in five finishes.</p>
    </div>
    <div class="grid g2">
      <div><div class="stage paper">${svg('logo/logo-horizontal-light.svg', 'lk')}</div><p class="cap"><b>Horizontal</b> — the default. Site header, letterhead, anything wider than it is tall.</p></div>
      <div><div class="stage navy">${svg('logo/logo-horizontal-dark.svg', 'lk')}</div><p class="cap"><b>Horizontal, dark</b> — the tile is dropped. A navy square on navy is a rectangle of nothing.</p></div>
      <div><div class="stage paper">${svg('logo/logo-stacked-light.svg', 'lks')}</div><p class="cap"><b>Stacked</b> — square and near-square spaces: banners, posters, a profile card.</p></div>
      <div><div class="stage navy">${svg('logo/wordmark-dark.svg', 'lk')}</div><p class="cap"><b>Wordmark</b> — where the mark already appears in the same view, or would be under 40px.</p></div>
      <div><div class="stage paper">${svg('logo/logo-horizontal-mono-navy.svg', 'lk')}</div><p class="cap"><b>Mono</b> — one ink, three finishes. Reach for it whenever the background is busy or out of your control.</p></div>
      <div><div class="stage paper"><img src="${png('logo/logo-horizontal-hi-light.png')}" alt="Devanagari lockup" style="width:100%;max-width:420px"></div><p class="cap"><b>Devanagari</b> — PNG only. Conjuncts and matras do not survive a font fallback the way Latin letterforms do.</p></div>
    </div>
    <style>.lk { width: 100%; max-width: 420px; } .lks { width: 100%; max-width: 250px; }</style>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Clear space and minimum size</p>
      <h2 class="display">Give it room, or use a smaller lockup</h2>
      <p class="lede">Keep clear on all four sides a margin equal to the mark's corner radius — about 23% of the mark's height. Nothing enters it: no text, no rule, no photo edge, no second logo.</p>
    </div>
    <div class="grid g2">
      <div>
        <div class="stage paper" style="padding:2.6rem">
          <svg viewBox="0 0 1240 556" style="width:100%" role="img" aria-label="Clear space diagram">
            <rect x="1" y="1" width="1238" height="554" fill="none" stroke="${C.gold}" stroke-width="2" stroke-dasharray="8 7" opacity=".75"/>
            <rect x="120" y="120" width="1000" height="316" fill="rgba(15,37,64,.05)"/>
            <g transform="translate(120,120)">${svg('logo/logo-horizontal-light.svg').replace('<svg', '<svg width="1000" height="316"')}</g>
            <g stroke="${C.gold}" stroke-width="2" opacity=".75">
              <path d="M60 120 V 436"/><path d="M1180 120 V 436"/>
              <path d="M120 60 H 1120"/><path d="M120 496 H 1120"/>
            </g>
            <g fill="${C.gold}" font-family="Inter, sans-serif" font-size="30" font-weight="700">
              <text x="70" y="290">x</text><text x="1140" y="290">x</text>
              <text x="610" y="52">x</text><text x="610" y="524">x</text>
            </g>
          </svg>
        </div>
        <p class="cap"><b>x</b> = the mark's corner radius.</p>
      </div>
      <div>
        <div class="stage paper" style="justify-items:start;align-content:center;gap:1.6rem">
          <div style="width:100%">
            <div style="border-bottom:1px dashed ${C.line};padding-bottom:1rem;margin-bottom:1rem">
              ${svg('logo/logo-horizontal-light.svg').replace('<svg', '<svg style="width:120px;display:block"')}
              <p class="cap" style="color:${C.muted}"><b style="color:${C.ink}">120 px</b> — the smallest the horizontal lockup goes on screen. 30 mm in print.</p>
            </div>
            ${svg('logo/wordmark-light.svg').replace('<svg', '<svg style="width:120px;display:block"')}
            <p class="cap" style="color:${C.muted}"><b style="color:${C.ink}">Below that</b>, use the wordmark or the mark alone. The tagline stops being letters.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Misuse</p>
      <h2 class="display">Four things that undo the work</h2>
      <p class="lede">Every combination you are likely to need already exists in the kit. If you are about to modify a logo, the file you want is probably already there.</p>
    </div>
    <div class="grid g2">
      <div class="no"><div class="stage paper">${svg('logo/logo-horizontal-light.svg').replace('<svg', '<svg style="width:100%;max-width:420px;transform:scaleX(1.34);transform-origin:center" preserveAspectRatio="none"')}</div><p class="cap"><b>Don't stretch it.</b> Scale both axes together, always.</p></div>
      <div class="no"><div class="stage paper">${svg('logo/logo-horizontal-light.svg').replace('<svg', '<svg style="width:100%;max-width:420px;filter:hue-rotate(115deg) saturate(1.5)"')}</div><p class="cap"><b>Don't recolour it.</b> Five finishes ship; none of them is teal.</p></div>
      <div class="no"><div class="stage busy">${svg('logo/logo-horizontal-dark.svg').replace('<svg', '<svg style="width:100%;max-width:420px"')}</div><p class="cap"><b>Don't put the gradient version on a photograph.</b> That is what the mono finishes are for.</p></div>
      <div class="no"><div class="stage paper"><div style="display:flex;align-items:center;gap:16px">${svg('icon/mark-navy.svg').replace('<svg', '<svg style="width:64px;flex:0 0 64px"')}<div style="font-family:Verdana,sans-serif;font-size:30px;font-weight:700;color:${C.ink};line-height:1.1">Vakil Saab<div style="font-size:10px;letter-spacing:.2em;color:${C.gold};font-weight:600">AGRA · ADVOCATE DIRECTORY</div></div></div></div><p class="cap"><b>Don't rebuild the lockup.</b> Not by eye, and not in a font that is not Playfair Display.</p></div>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Colour</p>
      <h2 class="display">Navy carries it. Gold is an accent.</h2>
      <p class="lede">If a layout looks like it needs more gold, it needs more white space instead. Every ratio below is computed from the tokens themselves, not copied in.</p>
    </div>
    <div class="grid g3" style="margin-bottom:2.6rem">
      ${SWATCHES.map(([n, hex, nm, role, rt]) => `<div class="sw"><div class="chip" style="background:${hex}${hex === C.paper ? `;border-bottom:1px solid ${C.line}` : ''}"></div><div class="meta"><div class="nm">${nm}</div><div class="hex">${hex}</div><div class="role">${role}</div><div class="ratio">${rt}</div></div></div>`).join('')}
    </div>

    <h3>Measured contrast</h3>
    <p class="note" style="margin-bottom:1rem">WCAG 2.1. Body text needs 4.5:1; large text — 24px, or 18.66px at 700 — and non-text UI need 3:1.</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Pairing</th><th>Use</th><th style="text-align:right">Ratio</th><th>Needs</th><th></th></tr></thead>
        <tbody>
        ${CONTRAST.map(([nm, fg, bg, need, use]) => {
          const r = ratio(fg, bg); const ok = r >= need;
          return `<tr><td>${nm}</td><td style="color:var(--fg-2)">${use}</td><td class="num">${r.toFixed(2)}:1</td><td class="num" style="font-weight:400;color:var(--fg-3)">${need}:1</td><td><span class="${ok ? 'pass' : 'warn'}">${ok ? 'Passes' : 'Below'}</span></td></tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>
    <p class="note" style="margin-top:1.2rem"><strong>Two standing caveats.</strong> Gold on paper is ${r2(C.gold, C.paper)}:1 — it clears the bar for large text and rules, and misses it for body copy, so it is never used for running text. And <code>--muted-2</code> is ${r2(C.muted2, C.paper)}:1, which is not a text colour at any size; <code>css/styles.css</code> currently uses it for the inactive language-toggle label, which is below AA and worth moving to <code>--muted</code>.</p>
  </div>
</section>

<section class="band alt">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Type</p>
      <h2 class="display">Two faces, and a third that carries the Hindi</h2>
      <p class="lede">Noto Sans Devanagari sits <em>after</em> the Latin faces in both stacks rather than replacing them, so Latin text keeps Inter and Playfair and only the Devanagari codepoints fall through. Hindi is not a translation layer bolted on here; it is half the product.</p>
    </div>
    <div class="spec"><p class="meta">Playfair Display · 700 · display</p><p class="big display">Find the right advocate in Agra.</p></div>
    <div class="spec"><p class="meta">Inter · 400 / 500 / 600 · text</p><p class="big" style="font-weight:400;font-size:var(--step-1);max-width:var(--measure)">Search by practice area, experience and locality. Twelve practice areas, ninety-six case types, and an enrollment number on every profile.</p></div>
    <div class="spec"><p class="meta">Noto Sans Devanagari · 600 · Hindi</p><p class="big hi" style="font-weight:600">आगरा में सही वकील खोजें।</p></div>
    <div class="spec">
      <p class="meta">The eyebrow — the one fixed detail</p>
      <p style="margin-top:.8rem"><span class="eyebrow" style="font-size:var(--step-0)">Agra · Advocate Directory</span></p>
      <p class="note" style="margin-top:.8rem">Uppercase, 700, <code>letter-spacing: .26em</code>, in gold. It sits above section headings across the site, on every banner and on the business card, and it is most of what makes a new piece look like it belongs.</p>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Social</p>
      <h2 class="display">Sized for the platform, composed for the crop</h2>
      <p class="lede">Every file is already the exact pixel size the platform asks for, so nothing needs resizing before upload. Each one composes inside the platform's safe area, which is not the same thing as the file.</p>
    </div>
    <div class="grid g2">
      ${SOCIAL.map(([f, nm, dim, why]) => `<figure class="shot" style="margin:0"><img src="${preview(`social/${f}`)}" alt="${nm}"><figcaption class="meta"><div class="row"><h3 style="margin:0">${nm}</h3><span class="dim">${dim}</span></div><p>${why}</p></figcaption></figure>`).join('')}
    </div>
  </div>
</section>

<section class="band alt">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Print</p>
      <h2 class="display">300 DPI, and one thing to paste</h2>
      <p class="lede">Give a printer the SVG, not the PNG, and give them a mono finish if the job is one or two inks. Ask for CMYK conversion at their end — the navy shifts if it is converted twice.</p>
    </div>
    <div class="grid g3">
      <figure class="shot" style="margin:0"><img src="${preview('print/letterhead-a4.png', 520)}" alt="A4 letterhead"><figcaption class="meta"><div class="row"><h3 style="margin:0">Letterhead</h3><span class="dim">A4 · 300 DPI</span></div><p>Stationery, not a poster. The watermark sits at 4% so it never fights typed text.</p></figcaption></figure>
      <figure class="shot" style="margin:0"><img src="${preview('print/poster-a4.png', 520)}" alt="A4 poster"><figcaption class="meta"><div class="row"><h3 style="margin:0">Poster</h3><span class="dim">A4 · 300 DPI</span></div><p>Read from two metres: one idea, the domain, and nothing that needs squinting at.</p></figcaption></figure>
      <figure class="shot" style="margin:0"><img src="${preview('print/email-signature-preview.png', 520)}" alt="Email signature"><figcaption class="meta"><div class="row"><h3 style="margin:0">Email signature</h3><span class="dim">HTML</span></div><p>Paste the HTML, never the image. Four lines are marked <code>EDIT</code>.</p></figcaption></figure>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <div class="head">
      <p class="eyebrow">Tokens and rebuilds</p>
      <h2 class="display">One file changes the colour of everything</h2>
      <p class="lede">Colour and copy live in <code>tools/brand/tokens.js</code>. The logos, the token exports, the contrast audit and every banner are generated from it, so a hex cannot be right in one place and wrong in another.</p>
    </div>
    <div class="grid g2" style="align-items:start">
      <div>
        <h3>Rebuild</h3>
        <pre><code>${esc(`npm run brand              # everything, ~2 min
node tools/brand/render.js social    # only what matches "social"
node tools/brand/check-contrast.js   # the palette audit`)}</code></pre>
        <h3 style="margin-top:2rem">Exports</h3>
        <ul class="files">
          <li><code>brand.json</code><span>every colour with its hex and its role</span></li>
          <li><code>brand.css</code><span>custom properties, <code>--vs-</code> prefixed</span></li>
          <li><code>_brand.scss</code><span>the same as SCSS variables</span></li>
          <li><code>tailwind.brand.js</code><span>a <code>theme.extend</code> fragment</span></li>
        </ul>
      </div>
      <div>
        <h3>Where things are</h3>
        <ul class="files">
          <li><code>logo/</code><span>lockups, SVG and PNG, five finishes</span></li>
          <li><code>icon/</code><span>the mark, the favicon, the app-icon set</span></li>
          <li><code>social/</code><span>banners at each platform's exact size</span></li>
          <li><code>print/</code><span>letterhead, poster, email signature</span></li>
          <li><code>tokens/</code><span>the palette in four formats</span></li>
          <li><code>BRAND.md</code><span>the written guide this page summarises</span></li>
        </ul>
        <p class="note" style="margin-top:1.5rem"><strong>On the vector files.</strong> The SVG lockups do not embed a font — each text run carries <code>textLength</code> instead, so a renderer without Playfair falls back to Georgia and lands on exactly the same width. The layout survives; the letterforms do not. For anything a customer sees, use the PNGs — those are shot in a browser with the real webfonts loaded.</p>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <span>${B.name} · ${B.domain}</span>
    <span>Generated from <code>tools/brand/tokens.js</code> · ${B.parent}</span>
  </div>
</footer>
`;

fs.writeFileSync(OUT, html);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
