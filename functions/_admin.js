/**
 * Shared plumbing for /api/admin/*: the sign-in check, the same-origin check
 * for anything that changes data, and the read-modify-commit loop.
 */
import { isAdmin } from './_auth.js';
import { getFile, putFile, GhError, ghConfigured } from './_gh.js';
import { OpError } from './_lawyers.js';

export const LAWYERS_PATH = 'data/lawyers.json';

export function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extra || {}),
  });
}

/** @returns {Response|null} a refusal, or null when the caller may proceed */
export async function guard(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'not authorised' }, 401);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'forbidden' }, 403);
  }
  return null;
}

export function fail(e) {
  if (e instanceof OpError) return json({ error: e.message, problems: e.problems }, e.status);
  if (e instanceof GhError) {
    const status = e.status === 409 || e.status === 422 ? 409 : (e.status === 503 ? 503 : 502);
    return json({ error: 'GitHub: ' + e.message }, status);
  }
  return json({ error: 'unexpected error', detail: String((e && e.message) || e) }, 500);
}

export function needGithub(env) {
  if (ghConfigured(env)) return null;
  return json({
    error: 'GitHub is not connected yet',
    hint: 'Set the GITHUB_TOKEN secret on the Pages project (docs/DEPLOY.md 1.9).',
    setup: 'github',
  }, 503);
}

/**
 * Reads data/lawyers.json, applies `op(db)` (which throws OpError to refuse),
 * and commits the result. If the file changed under us GitHub answers 409/422
 * and we re-read and re-apply once — the operations are pure, so that is safe.
 * @returns {{commit, result}}
 */
export async function mutate(env, op, messageFor) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await getFile(env, LAWYERS_PATH);
    if (!file) throw new OpError(500, `${LAWYERS_PATH} was not found in the repository`);
    const db = JSON.parse(file.text);
    const result = op(db);
    const text = JSON.stringify(result.db, null, 2) + '\n';
    try {
      const commit = await putFile(env, LAWYERS_PATH, text, file.sha, messageFor(result));
      return { commit, result };
    } catch (e) {
      lastErr = e;
      if (!(e instanceof GhError) || (e.status !== 409 && e.status !== 422)) throw e;
    }
  }
  throw lastErr;
}

export async function readDb(env) {
  const file = await getFile(env, LAWYERS_PATH);
  if (!file) throw new OpError(500, `${LAWYERS_PATH} was not found in the repository`);
  return { db: JSON.parse(file.text), sha: file.sha };
}
