#!/usr/bin/env node
/* ============================================================================
   Vakil Saab Agra — contrast audit for the brand palette.

     node tools/brand/check-contrast.js

   Prints the WCAG 2.1 contrast ratio for every pairing the brand actually
   uses, so the guidance in BRAND.md is measured rather than assumed. Exits
   non-zero if a pairing marked `body` drops below 4.5:1 — that is the one
   rule the kit promises and therefore the one worth failing a build over.

   Large text is 24px, or 18.66px at 700 weight; the display face is only ever
   used above that, which is what lets the gold headline pass at 3:1.
   ========================================================================= */

const { color: C } = require('./tokens');

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* level: 'body' needs 4.5:1, 'large' and 'ui' need 3:1. */
const PAIRS = [
  ['ink on paper',        C.ink,    C.paper,  'body',  'Headings and body copy on white'],
  ['ink on paper-2',      C.ink,    C.paper2, 'body',  'Headings and body copy on the warm band'],
  ['muted on paper',      C.muted,  C.paper,  'body',  'Secondary text on white'],
  /* muted-2 is 3.48:1 and so cannot carry text at any size. It is listed as
     'ui' because that is all it is licensed for — the resting state of a
     control whose active state is --ink. css/styles.css currently uses it for
     the inactive language-toggle label at .74rem, which is below AA; see the
     note in assets/brand/BRAND.md. */
  ['muted-2 on paper',    C.muted2, C.paper,  'ui',    'Inactive control state only — never text'],
  ['gold on paper',       C.gold,   C.paper,  'large', 'Gold headline or eyebrow on white'],
  ['gold on paper-2',     C.gold,   C.paper2, 'large', 'Gold headline or eyebrow on the warm band'],
  ['gold-2 on paper',     C.gold2,  C.paper,  'none',  'Decorative only — never text'],
  ['paper on ink',        C.paper,  C.ink,    'body',  'White text on navy'],
  ['slate on ink',        C.slate,  C.ink,    'body',  'Body copy on navy'],
  ['gold-2 on ink',       C.gold2,  C.ink,    'body',  'Gold text and rules on navy'],
  ['gold-2 on ink-3',     C.gold2,  C.ink3,   'body',  'Gold on the darkest end of the gradient'],
  ['gold-3 on ink',       C.gold3,  C.ink,    'body',  'Highlight gold on navy'],
  ['ink on gold-2',       C.ink,    C.gold2,  'body',  'Navy label inside a gold pill'],
];

const NEED = { body: 4.5, large: 3, ui: 3, none: 0 };
let failed = 0;

console.log('  ratio   need   pairing                 use');
console.log('  ' + '-'.repeat(74));
for (const [name, fg, bg, level, use] of PAIRS) {
  const r = ratio(fg, bg);
  const need = NEED[level];
  const ok = r >= need;
  if (!ok && level === 'body') failed++;
  console.log(`  ${r.toFixed(2).padStart(5)}:1 ${(need ? `${need}` : '—').padStart(4)}   ${name.padEnd(22)} ${use}${ok ? '' : '   ← BELOW'}`);
}

console.log(`\n${failed ? `${failed} body-text pairing(s) below 4.5:1.` : 'Every body-text pairing clears 4.5:1.'}`);
process.exit(failed ? 1 : 0);
