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
 * Run this after editing css/styles.css or after adding new classes to any
 * .html or .js file, otherwise the change will not appear in the build.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const styles = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
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
