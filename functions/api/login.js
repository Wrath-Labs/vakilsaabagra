/**
 * /api/login
 *
 *   GET     -> { authenticated: boolean }   (lets the page decide what to show)
 *   POST    { password } -> sets the session cookie
 *   DELETE  -> ends the session
 *
 * The password is set with `node tools/set-admin-password.js`, which prints one
 * SQL statement to run in the D1 console. See functions/_auth.js for what is
 * stored and why.
 */
import {
  ITERATIONS, COOKIE, SESSION_MS, MAX_FAILS, WINDOW_MS,
  toHex, fromHex, sha256Hex, derive, sameBytes, readCookie, sessionCookie, isAdmin,
} from '../_auth.js';

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extra || {}),
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    return json({ authenticated: await isAdmin(request, env) });
  }

  /* state-changing: refuse anything that did not come from this very site */
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);

  if (!env.DB) return json({ error: 'D1 binding "DB" is not configured' }, 500);

  if (request.method === 'DELETE') {
    const token = readCookie(request, COOKIE);
    if (/^[0-9a-f]{64}$/.test(token)) {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    }
    return json({ authenticated: false }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return json({ error: 'password required' }, 400);

  try {
    const now = Date.now();

    /* forget old failures and expired sessions as we go */
    await env.DB.prepare('DELETE FROM admin_attempts WHERE ts < ?').bind(now - WINDOW_MS).run();
    await env.DB.prepare('DELETE FROM admin_sessions WHERE expires < ?').bind(now).run();

    const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_attempts WHERE ts >= ?').bind(now - WINDOW_MS).first();
    if (fails && fails.n >= MAX_FAILS) {
      return json({ error: 'too many attempts — wait 15 minutes' }, 429, { 'retry-after': String(WINDOW_MS / 1000) });
    }

    const row = await env.DB.prepare('SELECT salt, hash, iterations FROM admin_auth WHERE id = 1').first();
    if (!row) return json({ error: 'no admin password has been set yet' }, 503);

    const given = await derive(password, fromHex(row.salt), row.iterations || ITERATIONS);
    if (!sameBytes(given, fromHex(row.hash))) {
      await env.DB.prepare('INSERT INTO admin_attempts (ts) VALUES (?)').bind(now).run();
      return json({ error: 'wrong password' }, 401);
    }

    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires) VALUES (?, ?)')
      .bind(await sha256Hex(token), now + SESSION_MS).run();
    await env.DB.prepare('DELETE FROM admin_attempts').run();

    return json({ authenticated: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_MS / 1000) });
  } catch (e) {
    return json({ error: 'sign-in failed', detail: String((e && e.message) || e) }, 500);
  }
}
