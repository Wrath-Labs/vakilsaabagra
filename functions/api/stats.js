/**
 * GET /api/stats?lawyer=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Reads back what /api/track counted, for one advocate over one period. This
 * is what the monthly renewal message is built from.
 *
 * Protected by a shared secret: send it as the X-VS-Admin header. The token
 * lives in the Cloudflare Pages dashboard under
 *   Settings → Environment variables → ADMIN_TOKEN
 * and must never be committed to this repo.
 *
 * `to` is inclusive. Both dates default to the current calendar month.
 */
import IDS from '../_ids.js';

const known = new Set(IDS);
const DAY = 86400000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(body, status) {
  return new Response(JSON.stringify(body, null, 2), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Compares in constant time, so a wrong token leaks nothing by how long it took. */
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function monthStart() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'GET only' }, 405);

  if (!env.ADMIN_TOKEN) return json({ error: 'ADMIN_TOKEN is not configured' }, 500);
  if (!tokenMatches(request.headers.get('X-VS-Admin'), env.ADMIN_TOKEN)) {
    return json({ error: 'not authorised' }, 401);
  }
  if (!env.DB) return json({ error: 'D1 binding "DB" is not configured' }, 500);

  const url = new URL(request.url);
  const lawyer = url.searchParams.get('lawyer') || '';
  const from = url.searchParams.get('from') || monthStart();
  const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);

  if (!known.has(lawyer)) return json({ error: 'unknown lawyer id' }, 400);
  if (!DATE.test(from) || !DATE.test(to)) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);

  const start = new Date(from).getTime();
  const end = new Date(to).getTime() + DAY;   /* `to` is inclusive */
  if (!(start < end)) return json({ error: 'from must not be after to' }, 400);

  try {
    const [totalRows, dailyRows, queryRows] = await Promise.all([
      env.DB.prepare(
        `SELECT type, COUNT(*) AS n FROM events
          WHERE lawyer_id = ? AND ts >= ? AND ts < ? GROUP BY type`)
        .bind(lawyer, start, end).all(),

      env.DB.prepare(
        `SELECT date(ts / 1000, 'unixepoch') AS day, type, COUNT(*) AS n FROM events
          WHERE lawyer_id = ? AND ts >= ? AND ts < ?
          GROUP BY day, type ORDER BY day`)
        .bind(lawyer, start, end).all(),

      /* searches carry no advocate id, so this figure is site-wide */
      env.DB.prepare(
        `SELECT query, COUNT(*) AS n FROM events
          WHERE type = 'search' AND query IS NOT NULL AND query <> ''
            AND ts >= ? AND ts < ?
          GROUP BY query ORDER BY n DESC, query LIMIT 20`)
        .bind(start, end).all(),
    ]);

    const totals = { view: 0, call: 0, whatsapp: 0, copy: 0, impression: 0 };
    (totalRows.results || []).forEach((r) => { totals[r.type] = r.n; });

    const byDay = {};
    (dailyRows.results || []).forEach((r) => {
      byDay[r.day] = byDay[r.day] || { date: r.day, view: 0, call: 0, whatsapp: 0, copy: 0, impression: 0 };
      byDay[r.day][r.type] = r.n;
    });

    const contacts = totals.call + totals.whatsapp + totals.copy;
    const rate = (n, of) => (of ? Math.round((n / of) * 1000) / 10 : null);

    return json({
      lawyer,
      from,
      to,
      totals,
      contacts,
      rates: {
        /* percentages: how many of the people who saw it acted on it */
        viewsPerImpression: rate(totals.view, totals.impression),
        callsPerView: rate(totals.call, totals.view),
        contactsPerView: rate(contacts, totals.view),
      },
      daily: Object.keys(byDay).sort().map((k) => byDay[k]),
      topQueries: (queryRows.results || []).map((r) => ({ query: r.query, count: r.n })),
    });
  } catch (e) {
    return json({ error: 'query failed', detail: String(e && e.message || e) }, 500);
  }
}
