#!/usr/bin/env node
/* ============================================================================
   Vakil Saab Agra — brand kit renderer.

     node tools/brand/render.js            # everything
     node tools/brand/render.js social     # only jobs whose name matches

   Turns the vector logos and the HTML templates into the PNGs a person
   actually uploads: profile pictures, banners, app icons, print pieces.

   Two kinds of job:

     svg   — a logo file from assets/brand/, drawn onto a transparent (or
             tinted) canvas at a given pixel width.
     page  — an HTML template from tools/brand/social/ or /print/, laid out at
             the platform's exact spec size.

   Both are shot in headless Chrome at 2x and then downsampled to the target
   size with sips, so edges and type are supersampled rather than merely
   anti-aliased, and the file that lands on disk is exactly the size the
   platform asks for.

   Templates load webfonts the way the site does. A screenshot cannot wait on
   a network font, so the three families are fetched once, inlined as data:
   URIs and cached under the system temp dir — the same trick
   tools/business-card/render.js uses.
   ========================================================================= */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const BRAND = path.join(ROOT, 'assets/brand');
const SRC = __dirname;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'vsa-brand-'));

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error('No Chrome/Chromium found. Install one, or open the templates in a browser and screenshot by hand.');
  process.exit(1);
}

/* ------------------------------------------------------------------- fonts */

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800' +
  '&family=Playfair+Display:wght@600;700;800;900' +
  '&family=Noto+Sans+Devanagari:wght@400;600;700' +
  '&display=swap';

const CACHE = path.join(os.tmpdir(), 'vsa-brand-fonts');

function inlinedFontCss() {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, 'fonts-inline.css');
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');

  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  let css = execFileSync('curl', ['-sfL', '-A', UA, FONT_CSS], { encoding: 'utf8', maxBuffer: 1 << 26 });

  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)]*woff2/g) || [])];
  urls.forEach((url, i) => {
    const file = path.join(CACHE, `f${i}.woff2`);
    if (!fs.existsSync(file)) execFileSync('curl', ['-sfL', '-o', file, url]);
    css = css.split(url).join(`data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`);
  });

  fs.writeFileSync(cached, css);
  return css;
}

/* ------------------------------------------------------- SVG inlining */

let inlineSeq = 0;

/* Drops the width/height off the root <svg> so CSS sizes it, and rewrites
   every id so two logos on one page cannot collide over a gradient called
   "g1". The strip is anchored to the opening tag on purpose: the mark is built
   out of <rect width=... height=...> plates, and a document-wide strip
   silently collapses every one of them to nothing. */
function inlineSvg(rel) {
  const file = path.join(BRAND, rel);
  if (!fs.existsSync(file)) throw new Error(`{{svg:${rel}}} — no such file: ${path.relative(ROOT, file)}`);
  const ns = `s${++inlineSeq}`;
  let svg = fs.readFileSync(file, 'utf8')
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ''));
  for (const id of svg.match(/id="([^"]+)"/g)?.map((m) => m.slice(4, -1)) || []) {
    svg = svg.split(`id="${id}"`).join(`id="${ns}-${id}"`).split(`url(#${id})`).join(`url(#${ns}-${id})`);
  }
  return svg;
}

const expand = (html) => html.replace(/\{\{svg:([^}]+)\}\}/g, (_, rel) => inlineSvg(rel.trim()));

/* --------------------------------------------------------------- shooting */

function shoot({ html, w, h, out, transparent, query, dpiScale }) {
  /* Two modes. Normally the shot is taken at 2x and downsampled back to the
     spec size, which supersamples the edges. When a job sets `dpiScale` it is
     asking for real resolution rather than smoother pixels — a 300 DPI print
     piece — so the enlarged shot is kept as-is. Chrome caps a headless
     screenshot well below a 2x YouTube banner, so oversized canvases fall
     back to 1:1. */
  const scale = dpiScale || (w * 2 <= 4200 && h * 2 <= 4200 ? 2 : 1);
  const keep = !!dpiScale;
  const page = path.join(WORK, `p${++inlineSeq}.html`);
  fs.writeFileSync(page, html);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--default-background-color=${transparent ? '00000000' : 'ffffffff'}`,
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    `--screenshot=${out}`,
    `file://${page}${query ? `?${query}` : ''}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  if (scale !== 1 && !keep) execFileSync('sips', ['--resampleHeightWidth', String(h), String(w), out], { stdio: 'ignore' });
  return keep ? `${w * scale}x${h * scale}` : `${w}x${h}`;
}

const fontCss = inlinedFontCss();

/* A logo file, centred on a canvas of its own aspect ratio. `pad` is the share
   of the canvas left empty around it — an Android maskable icon needs 20% so
   the launcher can crop it to whatever shape it likes. */
function renderSvgJob(job) {
  const src = path.join(BRAND, job.src);
  const svg = fs.readFileSync(src, 'utf8');
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const ratio = vb ? Number(vb[2]) / Number(vb[1]) : 1;
  const w = job.w;
  const h = job.h || Math.round(w * ratio);
  const pad = job.pad || 0;

  const html = `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${w}px;height:${h}px;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center;background:${job.bg || 'transparent'};padding:${pad * 100}%}
    svg{width:100%;height:100%;display:block}
  </style>${expand(`{{svg:${job.src}}}`)}`;

  return shoot({ html, w, h, out: path.join(ROOT, job.out), transparent: !job.bg });
}

/* An HTML template, at the platform's exact spec size. */
function renderPageJob(job) {
  const file = path.join(SRC, job.src);
  const html = expand(fs.readFileSync(file, 'utf8'))
    /* Every template gets the shared surface, the inlined fonts, and a two
       line theme switch — so a light and a dark banner are one file rendered
       twice with ?t=light and ?t=dark, not two files that drift apart. */
    .replace('</head>', `<style>${fs.readFileSync(path.join(SRC, 'social/brand.css'), 'utf8')}</style><style>${fontCss}</style>` +
      `<script>addEventListener('DOMContentLoaded',function(){` +
      `var t=new URLSearchParams(location.search).get('t')||'dark';` +
      `document.documentElement.setAttribute('data-theme',t);` +
      /* Replace, never add. A template carries its default theme as a class in
         the markup so it looks right when opened straight in a browser; adding
         the other one on top leaves both matching, and every ".dark x" and
         ".light x" rule fires at once. */
      `document.querySelectorAll('.canvas').forEach(function(c){` +
      `c.classList.remove('dark','light');c.classList.add(t);});});</script></head>`)
    .replace('{{W}}', job.w).replace('{{H}}', job.h);
  return shoot({
    html, w: job.w, h: job.h, out: path.join(ROOT, job.out),
    transparent: !!job.transparent, query: job.query, dpiScale: job.dpiScale,
  });
}

/* ------------------------------------------------------------------- run */

const jobs = require('./manifest');
const filter = process.argv[2];
const selected = jobs.filter((j) => !filter || j.out.includes(filter) || (j.src || '').includes(filter));

if (!selected.length) {
  console.error(`Nothing matches "${filter}". Names come from the out path or the source template.`);
  process.exit(1);
}

let failed = 0;
for (const job of selected) {
  try {
    const size = job.src.endsWith('.svg') ? renderSvgJob(job) : renderPageJob(job);
    console.log(`  ${job.out.padEnd(58)} ${size}`);
  } catch (err) {
    failed++;
    console.error(`  ${job.out.padEnd(58)} FAILED — ${err.message.split('\n')[0]}`);
  }
}

fs.rmSync(WORK, { recursive: true, force: true });
console.log(`\n${selected.length - failed}/${selected.length} rendered.`);
process.exit(failed ? 1 : 0);
