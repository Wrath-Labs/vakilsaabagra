/* ============================================================================
   Vakil Saab Agra — what render.js renders, and at what size.

   Every `w`/`h` below is the size the platform actually asks for, so the file
   on disk can be uploaded without anyone resizing it first. Where a platform
   publishes a range, the largest supported size is used and the platform
   downscales.

     src ending .svg   → a logo, drawn onto a transparent (or `bg`) canvas
     src ending .html  → a template from social/ or print/

   Options: `query` picks the theme (`t=light`, default dark); `pad` insets a
   logo inside its canvas; `dpiScale` renders bigger and keeps it, for print.
   ========================================================================= */

const jobs = [];
const svg = (src, out, o = {}) => jobs.push({ src, out: `assets/brand/${out}`, ...o });
const page = (src, out, w, h, o = {}) => jobs.push({ src, out: `assets/brand/${out}`, w, h, ...o });

/* ------------------------------------------------------------------ logos
   Two raster sizes each: a large one to place, and a 1000px-wide one for the
   web and for slide decks. */

for (const [variant, sizes] of Object.entries({
  light:        [2400, 1000],
  dark:         [2400, 1000],
  'mono-white': [2400],
  'mono-black': [2400],
  'mono-navy':  [2400],
})) {
  for (const w of sizes) {
    const suffix = sizes.length > 1 && w !== sizes[0] ? `-${w}` : '';
    svg(`logo/logo-horizontal-${variant}.svg`, `logo/logo-horizontal-${variant}${suffix}.png`, { w });
  }
}
for (const variant of ['light', 'dark', 'mono-white', 'mono-black', 'mono-navy']) {
  svg(`logo/logo-stacked-${variant}.svg`, `logo/logo-stacked-${variant}.png`, { w: 1400 });
  svg(`logo/wordmark-${variant}.svg`, `logo/wordmark-${variant}.png`, { w: 1600 });
}

/* The Devanagari lockup is raster-only — see the template for why. */
page('social/lockup-hi.html', 'logo/logo-horizontal-hi-light.png', 1000, 316, { query: 't=light', transparent: true });
page('social/lockup-hi.html', 'logo/logo-horizontal-hi-dark.png', 1000, 316, { transparent: true });

/* ------------------------------------------------------------------- icons */

for (const w of [1024, 512, 256]) svg('icon/mark-navy.svg', `icon/mark-navy-${w}.png`, { w });
svg('icon/mark-paper.svg', 'icon/mark-paper-1024.png', { w: 1024 });
svg('icon/mark-gold.svg', 'icon/mark-gold-1024.png', { w: 1024 });
svg('icon/mark-mono-navy.svg', 'icon/mark-mono-navy-1024.png', { w: 1024 });
svg('icon/mark-mono-white.svg', 'icon/mark-mono-white-1024.png', { w: 1024 });
svg('icon/mark-mono-black.svg', 'icon/mark-mono-black-1024.png', { w: 1024 });

/* Below about 64px the full mark turns to mud, so the small end of the icon
   set is drawn from the simplified favicon instead. */
for (const w of [16, 32, 48, 64]) svg('icon/favicon.svg', `icon/favicon-${w}.png`, { w });
svg('icon/favicon.svg', 'icon/apple-touch-icon-180.png', { w: 180, bg: '#0f2540' });
svg('icon/mark-navy.svg', 'icon/icon-192.png', { w: 192 });
svg('icon/mark-navy.svg', 'icon/icon-512.png', { w: 512 });
/* Android crops a maskable icon to whatever shape the launcher likes, and is
   only guaranteed to keep the middle 80%. */
svg('icon/favicon.svg', 'icon/icon-maskable-512.png', { w: 512, bg: '#0f2540', pad: 0.14 });

/* ---------------------------------------------------------------- social */

page('social/x-header.html', 'social/x-header-dark.png', 1500, 500);
page('social/x-header.html', 'social/x-header-light.png', 1500, 500, { query: 't=light' });
page('social/avatar.html', 'social/avatar-dark.png', 1000, 1000);
page('social/avatar.html', 'social/avatar-light.png', 1000, 1000, { query: 't=light' });

page('social/linkedin-company-cover.html', 'social/linkedin-company-cover.png', 1128, 191);
page('social/linkedin-company-cover.html', 'social/linkedin-company-cover-light.png', 1128, 191, { query: 't=light' });
page('social/linkedin-personal-cover.html', 'social/linkedin-personal-cover.png', 1584, 396);
page('social/linkedin-personal-cover.html', 'social/linkedin-personal-cover-light.png', 1584, 396, { query: 't=light' });

page('social/facebook-cover.html', 'social/facebook-cover.png', 1640, 856);
page('social/instagram-post.html', 'social/instagram-post.png', 1080, 1080);
page('social/instagram-post.html', 'social/instagram-post-light.png', 1080, 1080, { query: 't=light' });
page('social/instagram-story.html', 'social/instagram-story.png', 1080, 1920);
page('social/youtube-banner.html', 'social/youtube-banner.png', 2560, 1440);
page('social/gbp-cover.html', 'social/google-business-cover.png', 1024, 576);
page('social/og-image.html', 'social/og-image.png', 1200, 630);
page('social/slide-title.html', 'social/slide-title.png', 1920, 1080);

/* ----------------------------------------------------------------- print */

page('print/letterhead.html', 'print/letterhead-a4.png', 827, 1169, { query: 't=light', dpiScale: 3 });
page('print/poster-a4.html', 'print/poster-a4.png', 827, 1169, { dpiScale: 3 });
page('print/email-signature.html', 'print/email-signature-preview.png', 900, 240, { query: 't=light' });

module.exports = jobs;
