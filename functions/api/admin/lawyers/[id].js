/**
 * PUT    /api/admin/lawyers/<id>   change fields   { ...only what changed }
 * DELETE /api/admin/lawyers/<id>   remove entirely { confirm: "<id>" }
 *
 * "Take down" and "renew" are ordinary PUTs (listing.active, listing.paidUntil):
 * a taken-down advocate keeps their record, so they can come back unchanged.
 * DELETE is for records that should not exist at all.
 */
import { guard, json, fail, needGithub, mutate } from '../../../_admin.js';
import { updateLawyer, removeLawyer } from '../../../_lawyers.js';

export async function onRequest({ request, env, params }) {
  const g = await guard(request, env);
  if (g) return g;
  const no = needGithub(env);
  if (no) return no;

  const id = String(params.id || '');
  let body = {};
  try { body = await request.json(); } catch (e) { /* DELETE may have no body */ }

  try {
    if (request.method === 'PUT') {
      const changed = Object.keys(body || {}).filter((k) => k !== 'id').join(', ') || 'no fields';
      const { commit, result } = await mutate(
        env,
        (db) => updateLawyer(db, id, body),
        (r) => `admin: update ${r.lawyer.name} (${changed})`
      );
      return json({ ok: true, lawyer: result.lawyer, commit });
    }

    if (request.method === 'DELETE') {
      if (!body || body.confirm !== id) {
        return json({ error: 'send { "confirm": "<id>" } to delete', problems: ['confirmation missing'] }, 400);
      }
      const { commit, result } = await mutate(
        env,
        (db) => removeLawyer(db, id),
        (r) => `admin: remove ${r.lawyer.name}`
      );
      return json({ ok: true, id, commit, removed: result.lawyer.name });
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    return fail(e);
  }
}
