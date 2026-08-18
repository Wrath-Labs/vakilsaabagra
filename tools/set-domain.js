#!/usr/bin/env node
/**
 * Point the whole site at a different domain.
 *
 *   node tools/set-domain.js https://www.vakilsaabagra.com
 *   node tools/set-domain.js https://teewrath.github.io/vakilsaabagra
 *
 * Rewrites the canonical, Open Graph, Twitter and JSON-LD URLs in every page,
 * plus js/config.js, tools/sync.js, robots.txt and sitemap.xml.
 *
 * This matters more than it looks: a <link rel="canonical"> pointing at a
 * domain that does not actually serve the site tells Google to index that
 * other address instead — which means your real pages never rank.
 *
 * Re-run `npm run sync` afterwards to regenerate the sitemap.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const next = (process.argv[2] || '').replace(/\/+$/, '');

if (!/^https?:\/\/[^/]+/.test(next)) {
  console.error('Usage: node tools/set-domain.js https://your-domain.com');
  console.error('       (no trailing slash; a sub-path such as /repo is fine)');
  process.exit(1);
}

/* the current value is whatever js/config.js says */
const cfgPath = path.join(ROOT, 'js', 'config.js');
const cfg = fs.readFileSync(cfgPath, 'utf8');
const found = cfg.match(/url:\s*'([^']+)'/);
if (!found) { console.error('Could not read the current url from js/config.js'); process.exit(1); }
const current = found[1].replace(/\/+$/, '');

if (current === next) { console.log(`Already set to ${next} — nothing to do.`); process.exit(0); }

const TARGETS = [
  ...fs.readdirSync(ROOT).filter(f => f.endsWith('.html')),
  'js/config.js', 'tools/sync.js', 'robots.txt', 'sitemap.xml',
];

let files = 0, hits = 0;
for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.split(current).join(next);
  if (after === before) continue;
  hits += before.split(current).length - 1;
  fs.writeFileSync(file, after);
  files++;
}

console.log(`  ${current}\n→ ${next}\n`);
console.log(`Updated ${hits} references across ${files} files.`);
console.log('Next: npm run sync   (regenerates sitemap.xml)');
