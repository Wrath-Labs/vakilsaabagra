/**
 * Admin sign-in for the stats page. One password, one session cookie.
 *
 * Not a user system: there is exactly one admin. What it does do properly:
 *   - the password is never stored, only a salted PBKDF2-SHA256 hash, in D1
 *   - a session is a random 256-bit value; only its SHA-256 is stored, so a
 *     leaked database cannot be replayed as a login
 *   - the cookie is HttpOnly, Secure, SameSite=Strict and scoped to /api/
 *   - failed sign-ins are counted, and sign-in locks for 15 minutes after 8
 *
 * Underscore-prefixed, so Pages does not turn it into a route.
 */

/* Cloudflare Workers caps PBKDF2 at 100,000 iterations; tools/set-admin-password.js
   must use the same number, which is also stored beside the hash. */
export const ITERATIONS = 100000;

export const COOKIE = 'vs_admin';
export const SESSION_MS = 12 * 60 * 60 * 1000;
export const MAX_FAILS = 8;
export const WINDOW_MS = 15 * 60 * 1000;

const enc = new TextEncoder();

export const toHex = (buf) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (s) =>
  Uint8Array.from((String(s).match(/../g) || []), (h) => parseInt(h, 16));

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function derive(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

/** Constant time, so a wrong password leaks nothing by how long it took. */
export function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export function sessionCookie(value, maxAgeSeconds) {
  return `${COOKIE}=${value}; Path=/api/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

/** True when the request carries a live admin session. Never throws. */
export async function isAdmin(request, env) {
  try {
    if (!env.DB) return false;
    const token = readCookie(request, COOKIE);
    if (!/^[0-9a-f]{64}$/.test(token)) return false;
    const row = await env.DB
      .prepare('SELECT 1 AS ok FROM admin_sessions WHERE token_hash = ? AND expires > ?')
      .bind(await sha256Hex(token), Date.now())
      .first();
    return !!row;
  } catch (e) {
    return false;
  }
}
