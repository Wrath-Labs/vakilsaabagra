/** GET /api/admin/activity — the last changes to data/lawyers.json, from git. */
import { guard, json, fail, needGithub, LAWYERS_PATH } from '../../_admin.js';
import { recentCommits } from '../../_gh.js';

export async function onRequest({ request, env }) {
  const g = await guard(request, env);
  if (g) return g;
  const no = needGithub(env);
  if (no) return no;
  try {
    return json({ commits: await recentCommits(env, LAWYERS_PATH, 40) });
  } catch (e) {
    return fail(e);
  }
}
