#!/usr/bin/env node
/**
 * CSS build.
 *
 *   node tools/build-css.js
 *
 * Composes css/styles.css (the brand layer: tokens, motion, components)
 * BETWEEN Tailwind's components and utilities layers, then compiles the
 * result to css/tailwind.css — the single stylesheet the pages load.
 *
 * The order matters: it lets a Tailwind utility such as `lg:hidden` or
 * `sm:inline-flex` override a component rule such as `.btn { display: … }`,
 * which is exactly what you want when you put both on one element.
 *
 * It also rewrites the brand token block inside css/styles.css from
 * data/theme.json first, so the palette has exactly one source.
 *
 * Run this after editing data/theme.json or css/styles.css, or after adding new
 * classes to any .html or .js file, otherwise the change will not appear in the
 * build.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'css', 'styles.css');

/**
 * The brand colours come from data/theme.json, not from this stylesheet.
 *
 * They are written back INTO css/styles.css between the markers rather than
 * emitted as a separate file, so the authored source stays readable and a
 * `git diff` after changing a colour shows the colour, not a build artefact.
 * The `_brandNotes` in the JSON become the comments beside each token, which
 * is where the two failing-contrast warnings live.
 */
const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function luminance(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => srgb(parseInt(n.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/* Tokens that are ever used as text, and therefore have to clear WCAG AA
   against the page background. A hand-written note claiming a ratio goes stale
   the moment somebody changes the hex, which has already happened once here —
   so the ratio in the comment is measured at build time, not typed. */
const TEXT_TOKENS = ['ink', 'ink-2', 'gold', 'muted', 'muted-2'];

function applyTheme() {
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'theme.json'), 'utf8'));
  const notes = theme._brandNotes || {};
  const bg = theme.brand.paper || '#ffffff';
  const width = Math.max(...Object.keys(theme.brand).map((k) => k.length)) + 4;

  const block = Object.entries(theme.brand).map(([name, value]) => {
    const decl = `  --${name}:`.padEnd(width + 4) + value + ';';
    const bits = [];
    if (TEXT_TOKENS.includes(name)) {
      const r = contrast(value, bg);
      bits.push(`${r.toFixed(2)}:1 on ${bg} — ` + (
        r >= 4.5 ? 'AA for body text'
          : r >= 3 ? 'AA for large text and rules only, NOT body copy'
            : 'fails AA at every size'));
    }
    if (notes[name]) bits.push(notes[name]);
    return bits.length ? `${decl}   /* ${bits.join('; ')} */` : decl;
  }).join('\n');

  const src = fs.readFileSync(CSS, 'utf8');
  const START = '/* @@BRAND-TOKENS-START@@ */';
  const END = '/* @@BRAND-TOKENS-END@@ */';
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a === -1 || b === -1) {
    console.error('\x1b[31m✗ css/styles.css has lost its @@BRAND-TOKENS@@ markers — ' +
                  'restore them or data/theme.json stops driving the palette\x1b[0m');
    process.exit(1);
  }
  const out = src.slice(0, a + START.length) + '\n' + block + '\n  ' + src.slice(b);
  if (out !== src) {
    fs.writeFileSync(CSS, out);
    console.log(`css/styles.css    brand tokens updated from data/theme.json`);
  }
  return out;
}

const styles = applyTheme();
const tmp = path.join(__dirname, '.build-input.css');

fs.writeFileSync(tmp,
  '@tailwind base;\n@tailwind components;\n\n' +
  '/* ---- css/styles.css (authored source) ---------------------------- */\n' +
  styles +
  '\n/* ------------------------------------------------------------------ */\n' +
  '@tailwind utilities;\n');

try {
  execFileSync('npx', [
    '-y', 'tailwindcss@3.4.17',
    '-c', path.join(ROOT, 'tailwind.config.js'),
    '-i', tmp,
    '-o', path.join(ROOT, 'css', 'tailwind.css'),
    '--minify',
  ], { stdio: 'inherit', cwd: ROOT });
} finally {
  fs.unlinkSync(tmp);
}

const size = fs.statSync(path.join(ROOT, 'css', 'tailwind.css')).size;
console.log(`css/tailwind.css  ${(size / 1024).toFixed(1)} KB`);
