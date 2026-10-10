/**
 * GET /api/admin/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Site-wide numbers from D1 for one period: totals by event type, a per-advocate
 * breakdown, a daily series, top searches, and where the clicks came from.
 * Defaults to the current calendar month. `to` is inclusive.
 */
import { guard, json } from '../../_admin.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;
const TYPES = ['view', 'call', 'whatsapp', 'copy', 'impression', 'search'];

function zero() { const o = {}; TYPES.forEach((t) => { o[t] = 0; }); return o; }

export async function onRequest({ request, env }) {
  const g = await guard(request, env);
  if (g) return g;
  if (request.method !== 'GET') return json({ error: 'GET only' }, 405);
  if (!env.DB) return json({ error: 'D1 binding "DB" is not configured' }, 500);

  const url = new URL(request.url);
  const now = new Date();
  const from = url.searchParams.get('from') ||
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const to = url.searchParams.get('to') || now.toISOString().slice(0, 10);
  if (!DATE.test(from) || !DATE.test(to)) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);

  const start = new Date(from).getTime();
  const end = new Date(to).getTime() + DAY;
  if (!(start < end)) return json({ error: 'from must not be after to' }, 400);

  try {
    const [perLawyer, daily, queries, sources, areas] = await Promise.all([
      env.DB.prepare(
        `SELECT lawyer_id, type, COUNT(*) AS n FROM events
          WHERE ts >= ? AND ts < ? AND lawyer_id IS NOT NULL GROUP BY lawyer_id, type`)
        .bind(start, end).all(),
      env.DB.prepare(
        `SELECT date(ts / 1000, 'unixepoch') AS day, type, COUNT(*) AS n FROM events
          WHERE ts >= ? AND ts < ? GROUP BY day, type ORDER BY day`)
        .bind(start, end).all(),
      env.DB.prepare(
        `SELECT query, COUNT(*) AS n FROM events
          WHERE type = 'search' AND query IS NOT NULL AND query <> '' AND ts >= ? AND ts < ?
          GROUP BY query ORDER BY n DESC, query LIMIT 25`)
        .bind(start, end).all(),
      env.DB.prepare(
        `SELECT source, COUNT(*) AS n FROM events
          WHERE source IS NOT NULL AND source <> '' AND ts >= ? AND ts < ?
          GROUP BY source ORDER BY n DESC LIMIT 12`)
        .bind(start, end).all(),
      env.DB.prepare(
        `SELECT COALESCE(category, area) AS k, COUNT(*) AS n FROM events
          WHERE COALESCE(category, area) IS NOT NULL AND COALESCE(category, area) <> ''
            AND ts >= ? AND ts < ? GROUP BY k ORDER BY n DESC LIMIT 12`)
        .bind(start, end).all(),
    ]);

    const totals = zero();
    const byLawyer = {};
    (perLawyer.results || []).forEach((r) => {
      byLawyer[r.lawyer_id] = byLawyer[r.lawyer_id] || zero();
      byLawyer[r.lawyer_id][r.type] = r.n;
      totals[r.type] = (totals[r.type] || 0) + r.n;
    });

    const byDay = {};
    (daily.results || []).forEach((r) => {
      byDay[r.day] = byDay[r.day] || Object.assign({ date: r.day }, zero());
      byDay[r.day][r.type] = r.n;
    });
    /* searches have no advocate id, so they are only in the daily series */
    totals.search = Object.keys(byDay).reduce((n, d) => n + byDay[d].search, 0);

    return json({
      from, to,
      totals,
      byLawyer,
      daily: Object.keys(byDay).sort().map((k) => byDay[k]),
      topQueries: (queries.results || []).map((r) => ({ query: r.query, count: r.n })),
      sources: (sources.results || []).map((r) => ({ source: r.source, count: r.n })),
      topAreas: (areas.results || []).map((r) => ({ area: r.k, count: r.n })),
    });
  } catch (e) {
    return json({ error: 'query failed', detail: String((e && e.message) || e) }, 500);
  }
}
