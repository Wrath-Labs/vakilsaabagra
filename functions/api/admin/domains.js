/**
 * GET  /api/admin/domains?slug=<slug>   is <slug>.vakilsaabagra.in attached?
 * POST /api/admin/domains  { slug }     attach it (Pages custom domain + DNS)
 *
 * Optional. Needs three secrets on the Pages project:
 *   CF_API_TOKEN   Account: Cloudflare Pages Edit, Zone: DNS Edit (this zone only)
 *   CF_ACCOUNT_ID  the account id
 *   CF_ZONE_ID     the vakilsaabagra.in zone id
 * Without them the admin page tells you to add the domain by hand
 * (docs/DEPLOY.md Part 2 step 6) and nothing else changes.
 *
 * Refuses sample advocates: attaching a real domain to a sample record is
 * exactly what would make a fake bio look real.
 */
import { guard, json, fail, needGithub, readDb } from '../../_admin.js';
import { isSample, SLUG_RE, RESERVED_SLUGS } from '../../_lawyers.js';

const APEX = 'vakilsaabagra.in';
const CF = 'https://api.cloudflare.com/client/v4';

async function cf(env, path, init) {
  const res = await fetch(CF + path, Object.assign({}, init, {
    headers: Object.assign({
      authorization: 'Bearer ' + env.CF_API_TOKEN,
      'content-type': 'application/json',
    }, (init && init.headers) || {}),
  }));
  let body = null;
  try { body = await res.json(); } catch (e) { /* not json */ }
  return { ok: res.ok && body && body.success, status: res.status, body };
}

export async function onRequest({ request, env }) {
  const g = await guard(request, env);
  if (g) return g;

  if (!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_ZONE_ID)) {
    return json({
      configured: false,
      manual: 'Pages project → Custom domains → Set up a custom domain → <slug>.' + APEX,
    });
  }

  const project = env.CF_PAGES_PROJECT || 'vakilsaabagra';
  const url = new URL(request.url);

  try {
    if (request.method === 'GET') {
      const slug = url.searchParams.get('slug') || '';
      if (!SLUG_RE.test(slug)) return json({ error: 'bad slug' }, 400);
      const r = await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${project}/domains/${slug}.${APEX}`);
      if (r.status === 404) return json({ configured: true, attached: false });
      if (!r.ok) return json({ error: 'Cloudflare refused the lookup', detail: r.body && r.body.errors }, 502);
      const d = r.body.result || {};
      return json({ configured: true, attached: true, status: d.status, name: d.name });
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const no = needGithub(env);
    if (no) return no;

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
    const slug = String((body && body.slug) || '');
    if (!SLUG_RE.test(slug) || RESERVED_SLUGS.indexOf(slug) !== -1) return json({ error: 'that slug cannot be used' }, 400);

    const { db } = await readDb(env);
    const owner = db.lawyers.find((l) => l.microsite && l.microsite.slug === slug);
    if (!owner) return json({ error: `no advocate has the slug "${slug}"` }, 404);
    if (!owner.microsite.enabled) return json({ error: 'that microsite is not enabled' }, 409);
    if (owner.listing.active === false) return json({ error: 'that listing is taken down' }, 409);
    if (isSample(owner)) {
      return json({ error: 'sample advocates never get a real domain', problems: ['sample record'] }, 409);
    }

    const host = `${slug}.${APEX}`;
    const add = await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${project}/domains`, {
      method: 'POST', body: JSON.stringify({ name: host }),
    });
    /* already attached is fine — make this safe to press twice */
    const attachedAlready = !add.ok && add.body && (add.body.errors || []).some((e) => /already|exist/i.test(e.message || ''));
    if (!add.ok && !attachedAlready) {
      return json({ error: 'Cloudflare refused the domain', detail: add.body && add.body.errors }, 502);
    }

    const dns = await cf(env, `/zones/${env.CF_ZONE_ID}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({ type: 'CNAME', name: slug, content: `${project}.pages.dev`, proxied: true, ttl: 1 }),
    });
    const dnsExists = !dns.ok && dns.body && (dns.body.errors || []).some((e) => /already|exist/i.test(e.message || ''));
    if (!dns.ok && !dnsExists) {
      return json({ error: 'domain added, but the DNS record failed', detail: dns.body && dns.body.errors, host }, 502);
    }

    return json({ ok: true, host, url: 'https://' + host + '/' }, 201);
  } catch (e) {
    return fail(e);
  }
}
