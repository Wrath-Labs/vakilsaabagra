/**
 * Host routing for advocate microsites.
 *
 * <slug>.vakilsaabagra.in must *serve* the microsite, not redirect to it. An
 * advocate who pays for their own site and finds it bouncing to
 * vakilsaabagra.in/lawyer.html?id=… has been sold something they did not buy,
 * so everything below is an internal rewrite: the subdomain stays in the
 * address bar.
 *
 * The asset check in step 3 is the part that breaks if you touch it carelessly.
 * The microsites share one Pages project with the directory and load /css/,
 * /js/ and /assets/ from its root. Rewrite those into the per-site folder and
 * every microsite renders as unstyled HTML.
 */
import SLUGS from './_slugs.js';

/* the directory itself */
const APEX = new Set(['vakilsaabagra.in', 'www.vakilsaabagra.in']);

/* local dev (wrangler pages dev) and Cloudflare preview deployments — these
   serve the directory, not a microsite */
const PASSTHROUGH_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|.*\.pages\.dev)$/;

/* shared across every host, so they must never be rewritten */
const SHARED_PREFIX = ['/css/', '/js/', '/assets/', '/data/', '/api/', '/sites/', '/.well-known/'];
const SHARED_FILE = new Set(['/favicon.ico', '/favicon.png', '/site.webmanifest']);

/* the working source of truth carries billing fields — it is not for serving */
const BLOCKED = new Set(['/data/lawyers.json']);

function notFoundPage(slug) {
  const html = `<!doctype html>
<html lang="en-IN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>This advocate page is not active — Vakil Saab Agra</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:2rem;
         background:#faf8f4; color:#0f2540;
         font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif; }
  main { max-width:34rem; text-align:center }
  h1 { font-family:Georgia,'Times New Roman',serif; font-size:1.75rem; margin:0 0 .75rem; line-height:1.25 }
  p { color:#566a80; line-height:1.7; margin:0 0 1rem }
  code { background:#f4f1ea; border-radius:4px; padding:.1rem .35rem; font-size:.9em }
  a.cta { display:inline-block; margin-top:1rem; background:#0f2540; color:#fff; text-decoration:none;
          font-weight:600; padding:.8rem 1.5rem; border-radius:10px }
  a.cta:hover { background:#1b3f68 }
</style>
</head><body><main>
  <h1>This advocate page is not active</h1>
  <p>There is no live listing at <code>${slug}</code>. The page may have been closed, or the
     address may be mistyped.</p>
  <p>You can find every advocate practising in Agra in the directory.</p>
  <a class="cta" href="https://vakilsaabagra.in">Go to Vakil Saab Agra</a>
</main></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const host = (request.headers.get('Host') || url.hostname).toLowerCase().split(':')[0];

  if (BLOCKED.has(path)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  /* 2. the directory, untouched */
  if (APEX.has(host) || PASSTHROUGH_HOST.test(host)) return next();

  /* 3. shared assets — before any slug handling, or nothing renders */
  if (SHARED_FILE.has(path) || SHARED_PREFIX.some((p) => path.startsWith(p))) return next();

  /* 4. first label of the host is the slug */
  const slug = host.split('.')[0];
  if (!Object.prototype.hasOwnProperty.call(SLUGS, slug)) return notFoundPage(slug);

  /* 6. serve the pre-rendered site from inside the same project */
  const rewrite = (to) => next(new Request(new URL(to, url).toString(), request));

  if (path === '/' || path === '/index.html') return rewrite(`/sites/${slug}/index.html`);
  if (path === '/robots.txt') return rewrite(`/sites/${slug}/robots.txt`);
  if (path === '/sitemap.xml') return rewrite(`/sites/${slug}/sitemap.xml`);

  return notFoundPage(slug);
}
