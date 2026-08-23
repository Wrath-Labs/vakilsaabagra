#!/usr/bin/env node
/* ============================================================================
   Renders tools/business-card/{front,back}.html to PNGs in
   assets/business-card/ using the local Chrome in headless mode.

     node tools/business-card/render.js

   The card HTML links Google Fonts the same way the site does. A screenshot
   cannot wait on a network font, so before rendering we download Inter and
   Playfair Display once, inline them as data: URIs, and render a copy of the
   page that has no network dependency at all. Cards are authored at
   1050x600 CSS px (1px = 1/300in) and shot at deviceScaleFactor 2, so the
   PNGs are 2100x1200 = 600 DPI at 3.5in x 2in.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

const SRC = __dirname;
const ROOT = path.resolve(SRC, '../..');
const OUT = path.join(ROOT, 'assets/business-card');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'vsa-card-'));

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error('No Chrome/Chromium found — install one or render the HTML by hand.');
  process.exit(1);
}

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' +
  '&family=Playfair+Display:wght@600;700;800&display=swap';

/* A cache under the system temp dir keeps repeat renders offline-ish. */
const CACHE = path.join(os.tmpdir(), 'vsa-card-fonts');
fs.mkdirSync(CACHE, { recursive: true });

function inlinedFontCss() {
  const cached = path.join(CACHE, 'fonts-inline.css');
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');

  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  let css = execFileSync('curl', ['-sfL', '-A', UA, FONT_CSS], { encoding: 'utf8' });

  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)]*woff2/g) || [])];
  urls.forEach((url, i) => {
    const file = path.join(CACHE, `f${i}.woff2`);
    if (!fs.existsSync(file)) execFileSync('curl', ['-sfL', '-o', file, url]);
    const b64 = fs.readFileSync(file).toString('base64');
    css = css.split(url).join(`data:font/woff2;base64,${b64}`);
  });

  fs.writeFileSync(cached, css);
  return css;
}

const fontCss = inlinedFontCss();
fs.writeFileSync(path.join(WORK, 'fonts.css'), fontCss);
fs.copyFileSync(path.join(SRC, 'card.css'), path.join(WORK, 'card.css'));

fs.mkdirSync(OUT, { recursive: true });

for (const face of ['front', 'back']) {
  const html = fs
    .readFileSync(path.join(SRC, `${face}.html`), 'utf8')
    /* drop the three network font tags, add the local one */
    .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
    .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/,
             '<link rel="stylesheet" href="fonts.css">');

  const page = path.join(WORK, `${face}.html`);
  fs.writeFileSync(page, html);

  const out = path.join(OUT, `vakil-saab-agra-card-${face}.png`);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    '--force-device-scale-factor=2',
    '--window-size=1050,600',
    `--screenshot=${out}`,
    `file://${page}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const px = execSync(`file -b "${out}"`).toString().trim();
  console.log(`${path.relative(ROOT, out)} — ${px}`);
}

fs.rmSync(WORK, { recursive: true, force: true });
