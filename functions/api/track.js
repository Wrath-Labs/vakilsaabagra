/**
 * POST /api/track — anonymous click and view counter.
 *
 * Why this exists: the call and WhatsApp buttons on a profile go straight to
 * the advocate's own number. Without this endpoint we have no record that a
 * lead was ever delivered, and at renewal time we cannot show an advocate that
 * the listing worked.
 *
 * What it stores: an event type, which advocate it belongs to, where it
 * happened, and a timestamp. What it does NOT store, ever: IP address, user
 * agent, referrer, or any cookie. Nothing here identifies a person.
 *
 * `session` is a random id the browser keeps in sessionStorage for the length
 * of one session. Its only job is the 30-second de-duplication below.
 *
 * Bindings (Cloudflare Pages → Settings → Functions):
 *   DB                  D1 database binding
 *   ALLOW_LOCAL_ORIGIN  optional, "1" to accept localhost during local dev
 */
import IDS from '../_ids.js';

const TYPES = ['view', 'call', 'whatsapp', 'copy', 'search', 'impression'];
const SOURCES = ['directory', 'microsite'];
const DEDUPE_MS = 30000;
const BOT = /bot|crawl|spider|preview|headless|lighthouse/i;

/* the apex, www, and any advocate microsite — nothing else */
const HOST = /^(?:[a-z0-9-]+\.)?vakilsaabagra\.in$/;
const LOCAL = /^(?:localhost|127\.0\.0\.1)$/;

const known = new Set(IDS);

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  let host;
  try { host = new URL(origin).hostname.toLowerCase(); } catch (e) { return false; }
  if (HOST.test(host)) return true;
  return env.ALLOW_LOCAL_ORIGIN === '1' && LOCAL.test(host);
}

/** Trims a free-text field and takes any long digit run out of it. People
 *  paste phone numbers into search boxes; we have no business keeping them. */
function clean(value, max) {
  if (typeof value !== 'string') return null;
  const out = value.replace(/\d{6,}/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return out || null;
}

function noContent() {
  return new Response(null, { status: 204 });
}
function reject(status, why) {
  return new Response(JSON.stringify({ error: why }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return reject(405, 'POST only');
  if (!originAllowed(request, env)) return reject(403, 'origin not allowed');

  /* crawlers and link-preview fetchers are not leads */
  if (BOT.test(request.headers.get('User-Agent') || '')) return noContent();

  let body;
  try { body = await request.json(); } catch (e) { return reject(400, 'bad json'); }
  if (!body || typeof body !== 'object') return reject(400, 'bad payload');

  const type = body.type;
  if (TYPES.indexOf(type) === -1) return reject(400, 'unknown type');

  const source = SOURCES.indexOf(body.source) === -1 ? null : body.source;
  const session = /^[a-z0-9]{6,40}$/i.test(body.session || '') ? body.session : null;
  const now = Date.now();

  /* ------------------------------------------------------------ which ids */
  let ids = [];
  if (type === 'impression') {
    if (!Array.isArray(body.lawyerIds)) return reject(400, 'impression needs lawyerIds[]');
    /* one beacon per results render, so cap it at a sane page size */
    ids = body.lawyerIds.slice(0, 60).filter((id) => known.has(id));
    if (!ids.length) return reject(400, 'no known lawyerIds');
  } else if (type !== 'search') {
    if (!known.has(body.lawyerId)) return reject(400, 'unknown lawyerId');
    ids = [body.lawyerId];
  }

  /* A failed write must never be visible to the visitor: tracking is our
     problem, not theirs. Everything below returns 204 regardless. */
  try {
    if (!env.DB) return noContent();

    /* ----------------------------------------------------------- dedupe */
    if (session && ids.length) {
      const since = now - DEDUPE_MS;
      const marks = ids.map(() => '?').join(',');
      const recent = await env.DB
        .prepare(`SELECT lawyer_id FROM events
                   WHERE session = ? AND type = ? AND ts > ? AND lawyer_id IN (${marks})`)
        .bind(session, type, since, ...ids)
        .all();
      const seen = new Set((recent.results || []).map((r) => r.lawyer_id));
      ids = ids.filter((id) => !seen.has(id));
      if (!ids.length) return noContent();
    }

    /* ------------------------------------------------------------ write */
    const insert = env.DB.prepare(
      `INSERT INTO events (ts, type, lawyer_id, source, query, category, area, session)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    if (type === 'search') {
      const query = clean(body.query, 80);
      const category = clean(body.category, 60);
      const area = clean(body.area, 60);
      if (session) {
        /* keyed on the query too: two different searches half a minute apart
           are two searches, and only a repeat of the same one is noise */
        const dupe = await env.DB
          .prepare(`SELECT 1 FROM events
                     WHERE session = ? AND type = 'search' AND ts > ?
                       AND IFNULL(query, '') = ? AND IFNULL(category, '') = ?
                       AND IFNULL(area, '') = ? LIMIT 1`)
          .bind(session, now - DEDUPE_MS, query || '', category || '', area || '')
          .first();
        if (dupe) return noContent();
      }
      await insert.bind(now, 'search', null, source, query, category, area, session).run();
    } else {
      await env.DB.batch(ids.map((id) =>
        insert.bind(now, type, id, source, null, null, null, session)));
    }
  } catch (e) {
    /* swallow — a tracking failure must never cost us a lead */
  }

  return noContent();
}
