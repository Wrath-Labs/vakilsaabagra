/* ============================================================================
   Vakil Saab Agra — brand tokens, the single source of truth.

   These values are mirrored (by hand, deliberately) in css/styles.css and
   tailwind.config.js, which the site itself loads. Everything in the brand
   kit — logos, banners, print pieces, the exported token files — is generated
   from THIS file, so a colour only ever has to change in two places instead
   of fifteen.
   ========================================================================= */

const color = {
  ink:    '#0f2540', // deep navy — the primary brand colour
  ink2:   '#1b3f68', // lighter navy, gradient top
  ink3:   '#081527', // near-black navy, gradient bottom
  gold:   '#b0861f', // 3.35:1 on white — large text and rules only, never body copy
  gold2:  '#dcb85f', // decorative gold — metal midtone
  gold3:  '#f7e3a1', // highlight gold — the shine
  gold4:  '#9d7728', // shadow gold — the metal's dark edge
  paper:  '#ffffff',
  paper2: '#faf8f4', // warm off-white section band
  paper3: '#f4f1ea', // deeper warm band
  line:   '#e6e1d6',
  muted:  '#566a80',
  muted2: '#7a8ba0',
  slate:  '#a8bdd4', // body copy on navy
};

const brand = {
  name:     'Vakil Saab Agra',
  wordmark: 'Vakil Saab',
  wordmarkHi: 'वकील साब',
  tagline:  'AGRA · ADVOCATE DIRECTORY',
  taglineHi: 'आगरा · अधिवक्ता निर्देशिका',
  domain:   'vakilsaabagra.in',
  parent:   'A Wrath Labs venture',
  phone:    '+91 89544 02360',
  areas:    ['Criminal', 'Family', 'Property', 'Cheque Bounce', 'Consumer', 'Corporate'],
};

/* Type. The site loads these two from Google Fonts; Noto Sans Devanagari
   covers the Hindi codepoints neither of them has. */
const type = {
  display: `'Playfair Display', 'Noto Sans Devanagari', Georgia, 'Times New Roman', serif`,
  sans:    `'Inter', 'Noto Sans Devanagari', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`,
  /* Fallback-only stacks, for the SVG files — see build-logos.js on why the
     vector deliverables do not embed a font. */
  displaySvg: `Georgia, 'Times New Roman', serif`,
  sansSvg:    `Helvetica, Arial, sans-serif`,
};

module.exports = { color, brand, type };
