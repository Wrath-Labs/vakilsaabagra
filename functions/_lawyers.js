/**
 * Everything the admin API does to a lawyer record, as pure functions over the
 * parsed data/lawyers.json — no network, no storage — so it is easy to test.
 *
 * The record shape is whatever tools/sync.js and the templates already read.
 * Nothing here invents fields; unknown keys in a request are dropped.
 */
import validateLib from '../tools/lib/validate.js';

export const { validate, PLANS, ACCENTS, SLUG_RE, RESERVED_SLUGS } = validateLib;

/* top-level fields an admin request may set; everything else is ignored */
const FIELDS = [
  'name', 'photo', 'experienceYears', 'primaryCategory', 'categories',
  'topics', 'topicsHi', 'about', 'aboutHi', 'highlights', 'highlightsHi',
  'languages', 'courts', 'location', 'consultationFee', 'feeNote',
  'availability', 'phone', 'whatsapp', 'email', 'enrollment', 'education',
  'verified', 'featured', 'featuredUntil', 'listing', 'microsite',
];

const LISTING_FIELDS = ['plan', 'paidUntil', 'active', 'onboardedOn'];
const LOCATION_FIELDS = ['area', 'areaHi', 'address'];
const MICROSITE_FIELDS = [
  'enabled', 'slug', 'tagline', 'taglineHi', 'longAbout', 'longAboutHi',
  'faqs', 'faqsHi', 'accent',
];

const STRING_LISTS = ['categories', 'topics', 'topicsHi', 'highlights', 'highlightsHi', 'languages', 'courts', 'education'];

/** "Adv. Neha Sharma" -> "neha-sharma" */
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^adv(ocate)?\.?\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function list(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** keeps only whitelisted keys of `src`, with light type clean-up */
function pick(src, fields) {
  const out = {};
  fields.forEach((k) => { if (src && Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]; });
  return out;
}

function clean(patch) {
  const p = pick(patch, FIELDS);
  const out = {};

  Object.keys(p).forEach((k) => {
    const v = p[k];
    if (STRING_LISTS.indexOf(k) !== -1) out[k] = list(v);
    else if (k === 'experienceYears' || k === 'consultationFee') out[k] = num(v);
    else if (k === 'verified' || k === 'featured') out[k] = !!v;
    else if (k === 'location') {
      const l = pick(v, LOCATION_FIELDS);
      out.location = {};
      Object.keys(l).forEach((x) => { out.location[x] = str(l[x]); });
    } else if (k === 'listing') {
      const l = pick(v, LISTING_FIELDS);
      out.listing = {};
      Object.keys(l).forEach((x) => {
        out.listing[x] = x === 'active' ? l[x] !== false : (str(l[x]));
      });
    } else if (k === 'microsite') {
      const m = pick(v, MICROSITE_FIELDS);
      out.microsite = {};
      Object.keys(m).forEach((x) => {
        if (x === 'enabled') out.microsite.enabled = !!m[x];
        else if (x === 'faqs' || x === 'faqsHi') {
          out.microsite[x] = (Array.isArray(m[x]) ? m[x] : [])
            .map((f) => ({ q: str(f && f.q), a: str(f && f.a) }))
            .filter((f) => f.q || f.a);
        } else out.microsite[x] = str(m[x]);
      });
    } else out[k] = str(v);
  });

  return out;
}

/** a complete record with the same shape as every existing one */
export function blank(id) {
  return {
    id,
    name: '',
    photo: `assets/lawyers/${id}.svg`,
    experienceYears: 0,
    primaryCategory: '',
    categories: [],
    topics: [],
    topicsHi: [],
    about: '',
    aboutHi: '',
    highlights: [],
    highlightsHi: [],
    languages: ['Hindi', 'English'],
    courts: [],
    location: { area: '', areaHi: '', address: '' },
    consultationFee: null,
    feeNote: '',
    availability: '',
    phone: '',
    whatsapp: '',
    email: '',
    enrollment: '',
    education: [],
    rating: null,
    reviewsCount: null,
    verified: false,
    featured: false,
    featuredUntil: null,
    listing: { plan: 'none', paidUntil: null, active: true, onboardedOn: null },
    microsite: { enabled: false, slug: null, tagline: null, longAbout: null, faqs: [], accent: 'gold' },
  };
}

export class OpError extends Error {
  constructor(status, message, problems) { super(message); this.status = status; this.problems = problems || []; }
}

function mergeInto(target, patch) {
  Object.keys(patch).forEach((k) => {
    if (k === 'location' || k === 'listing' || k === 'microsite') {
      target[k] = Object.assign({}, target[k], patch[k]);
    } else target[k] = patch[k];
  });
  return target;
}

function finish(db) {
  const problems = validate(db);
  if (problems.length) throw new OpError(422, 'That would not pass validation', problems);
  db.meta = Object.assign({}, db.meta, { lastUpdated: new Date().toISOString().slice(0, 10) });
  return db;
}

/** @returns {{db, id}} */
export function addLawyer(db, input) {
  const name = str(input && input.name);
  if (!name) throw new OpError(422, 'A name is required', ['name is required']);

  let id = slugify((input && input.id) || name);
  if (!id) throw new OpError(422, 'Could not make an id from that name', ['id']);
  if (db.lawyers.some((l) => l.id === id)) {
    throw new OpError(409, `There is already an advocate with the id "${id}"`, [`duplicate id: ${id}`]);
  }

  const rec = mergeInto(blank(id), clean(input));
  rec.id = id;
  if (!rec.photo || rec.photo === `assets/lawyers/.svg`) rec.photo = `assets/lawyers/${id}.svg`;
  if (!rec.whatsapp) rec.whatsapp = rec.phone;
  if (!rec.listing.onboardedOn) rec.listing.onboardedOn = new Date().toISOString().slice(0, 10);

  db.lawyers.push(rec);
  finish(db);
  return { db, id, lawyer: rec };
}

export function updateLawyer(db, id, patch) {
  const rec = db.lawyers.find((l) => l.id === id);
  if (!rec) throw new OpError(404, `No advocate with id "${id}"`);
  mergeInto(rec, clean(patch));
  finish(db);
  return { db, id, lawyer: rec };
}

export function removeLawyer(db, id) {
  const i = db.lawyers.findIndex((l) => l.id === id);
  if (i === -1) throw new OpError(404, `No advocate with id "${id}"`);
  const [gone] = db.lawyers.splice(i, 1);
  finish(db);
  return { db, id, lawyer: gone };
}

/* sample records carry these markers; real advocates never do */
export function isSample(l) {
  return /@example\.com$/i.test(l.email || '') || /^\+9199990000\d\d$/.test(l.phone || '');
}
