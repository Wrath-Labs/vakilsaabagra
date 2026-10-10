/**
 * GET  /api/admin/lawyers        every record, billing block included
 * POST /api/admin/lawyers        add an advocate  { ...fields }
 *
 * Writes are a commit to data/lawyers.json; Cloudflare Pages then rebuilds.
 * The same validator the build uses runs first, so a bad edit is refused here
 * with a list of what is wrong instead of breaking the deploy.
 */
import { guard, json, fail, needGithub, mutate, readDb } from '../../_admin.js';
import { addLawyer } from '../../_lawyers.js';

export async function onRequest({ request, env }) {
  const g = await guard(request, env);
  if (g) return g;
  const no = needGithub(env);
  if (no) return no;

  try {
    if (request.method === 'GET') {
      const { db, sha } = await readDb(env);
      return json({ lawyers: db.lawyers, categories: db.categories, meta: db.meta, sha });
    }

    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
      const { commit, result } = await mutate(
        env,
        (db) => addLawyer(db, body),
        (r) => `admin: add ${r.lawyer.name}`
      );
      return json({ ok: true, id: result.id, lawyer: result.lawyer, commit }, 201);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    return fail(e);
  }
}
