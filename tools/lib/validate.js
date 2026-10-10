/**
 * Validation for data/lawyers.json — one implementation, two callers.
 *
 *   tools/sync.js         refuses to build when this returns problems
 *   functions/api/admin/* refuses to commit when this returns problems
 *
 * Keeping the rules here means the admin site can never commit a file the build
 * would then reject, which would leave production stuck on the last good deploy.
 *
 * Pure CommonJS with no Node built-ins, so it runs unchanged in the build and
 * in a Cloudflare Pages Function.
 */

const PLANS = ['monthly', 'halfyearly', 'yearly', 'none'];
const ACCENTS = ['gold', 'navy', 'teal', 'maroon'];
const SLUG_RE = /^[a-z0-9-]{3,30}$/;

/* subdomains we must never hand out: infrastructure, mail and our own tooling */
const RESERVED_SLUGS = [
  'www', 'api', 'admin', 'mail', 'app', 'cdn', 'blog', 'go', 'm', 'stats',
  'dashboard', 'static', 'assets', 'mx', 'ftp', 'ns1', 'ns2', 'test', 'dev',
  'staging', 'help', 'support', 'docs',
];

function isDateString(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
         !Number.isNaN(new Date(v).getTime());
}

/** @returns {string[]} human-readable problems; empty when the data is sound */
function validate(db) {
  const problems = [];
  const slugs = new Set((db.categories || []).map((c) => c.slug));
  const seen = new Set();
  const siteSlugs = new Map();
  const featuredPerCategory = {};

  for (const l of db.lawyers || []) {
    if (seen.has(l.id)) problems.push(`duplicate id: ${l.id}`);
    seen.add(l.id);
    if (!/^[a-z0-9-]+$/.test(l.id)) problems.push(`id must be lowercase-kebab-case: ${l.id}`);
    if (!l.name) problems.push(`${l.id}: name is required`);
    if (!slugs.has(l.primaryCategory)) problems.push(`${l.id}: unknown primaryCategory "${l.primaryCategory}"`);
    (l.categories || []).forEach((c) => { if (!slugs.has(c)) problems.push(`${l.id}: unknown category "${c}"`); });
    if (!(l.categories || []).includes(l.primaryCategory)) problems.push(`${l.id}: primaryCategory missing from categories[]`);
    if (typeof l.experienceYears !== 'number') problems.push(`${l.id}: experienceYears must be a number`);
    if (!l.phone) problems.push(`${l.id}: phone is required`);

    /* ---- featured slots: at most two per practice area, or the flag is noise */
    if (l.featured) {
      (featuredPerCategory[l.primaryCategory] = featuredPerCategory[l.primaryCategory] || []).push(l.id);
    }
    if (l.featuredUntil != null && !isDateString(l.featuredUntil)) {
      problems.push(`${l.id}: featuredUntil must be YYYY-MM-DD or null`);
    }

    /* ---- billing ------------------------------------------------------- */
    const listing = l.listing;
    if (!listing || typeof listing !== 'object') {
      problems.push(`${l.id}: listing block is required`);
    } else {
      if (PLANS.indexOf(listing.plan) === -1) {
        problems.push(`${l.id}: listing.plan must be one of ${PLANS.join(', ')} (got "${listing.plan}")`);
      }
      if (listing.plan && listing.plan !== 'none' && !isDateString(listing.paidUntil)) {
        problems.push(`${l.id}: listing.paidUntil is required for plan "${listing.plan}" and must be YYYY-MM-DD`);
      }
      if (listing.paidUntil != null && !isDateString(listing.paidUntil)) {
        problems.push(`${l.id}: listing.paidUntil must be YYYY-MM-DD or null`);
      }
      if (listing.onboardedOn != null && !isDateString(listing.onboardedOn)) {
        problems.push(`${l.id}: listing.onboardedOn must be YYYY-MM-DD or null`);
      }
    }

    /* ---- microsite ----------------------------------------------------- */
    const ms = l.microsite;
    if (!ms || typeof ms !== 'object') {
      problems.push(`${l.id}: microsite block is required`);
    } else {
      if (ms.slug != null) {
        if (!SLUG_RE.test(ms.slug)) {
          problems.push(`${l.id}: microsite.slug "${ms.slug}" must match ${SLUG_RE}`);
        }
        if (RESERVED_SLUGS.indexOf(ms.slug) !== -1) {
          problems.push(`${l.id}: microsite.slug "${ms.slug}" is reserved and cannot be used`);
        }
        if (siteSlugs.has(ms.slug)) {
          problems.push(`${l.id}: microsite.slug "${ms.slug}" is already used by ${siteSlugs.get(ms.slug)}`);
        }
        siteSlugs.set(ms.slug, l.id);
      }
      if (ms.enabled === true) {
        if (!ms.slug) problems.push(`${l.id}: microsite.enabled needs a microsite.slug`);
        if (!ms.longAbout) problems.push(`${l.id}: microsite.enabled needs microsite.longAbout (a longer bio, not a copy of "about")`);
        if (ms.longAbout && l.about && ms.longAbout.trim() === l.about.trim()) {
          problems.push(`${l.id}: microsite.longAbout is identical to "about" — the microsite must not duplicate the directory profile`);
        }
      }
      if (ms.accent != null && ACCENTS.indexOf(ms.accent) === -1) {
        problems.push(`${l.id}: microsite.accent must be one of ${ACCENTS.join(', ')} (got "${ms.accent}")`);
      }
      if (ms.faqs != null) {
        if (!Array.isArray(ms.faqs)) problems.push(`${l.id}: microsite.faqs must be an array`);
        else ms.faqs.forEach((f, i) => {
          if (!f || !f.q || !f.a) problems.push(`${l.id}: microsite.faqs[${i}] needs both "q" and "a"`);
        });
      }
    }
  }

  Object.keys(featuredPerCategory).forEach((cat) => {
    const ids = featuredPerCategory[cat];
    if (ids.length > 2) {
      problems.push(`too many featured advocates in "${cat}": ${ids.length} (max 2) — ${ids.join(', ')}`);
    }
  });

  return problems;
}

module.exports = { validate, isDateString, PLANS, ACCENTS, SLUG_RE, RESERVED_SLUGS };
