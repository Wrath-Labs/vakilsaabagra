/** GET /api/admin/status — what is connected, so the admin page can say what is missing. */
import { guard, json } from '../../_admin.js';
import { ghConfig } from '../../_gh.js';

export async function onRequest({ request, env }) {
  const g = await guard(request, env);
  if (g) return g;
  const gh = ghConfig(env);
  return json({
    github: !!gh.token,
    repo: gh.repo,
    branch: gh.branch,
    cloudflare: !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_ZONE_ID),
    database: !!env.DB,
  });
}
