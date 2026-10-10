/**
 * A very small GitHub Contents API client — just what the admin site needs to
 * read data/lawyers.json and commit a new version of it.
 *
 * Every admin edit becomes a commit on the production branch, which makes
 * Cloudflare Pages rebuild (validate -> sync -> microsites -> CSS). Git is the
 * audit log and the undo button; there is no second copy of the data.
 *
 * Needs a fine-grained token in the GITHUB_TOKEN secret with Contents: read and
 * write on this one repository, and nothing else. See docs/DEPLOY.md 1.9.
 */

const DEFAULT_REPO = 'Wrath-Labs/vakilsaabagra';
const API = 'https://api.github.com';

export function ghConfig(env) {
  return {
    token: env.GITHUB_TOKEN || '',
    repo: env.GITHUB_REPO || DEFAULT_REPO,
    branch: env.GITHUB_BRANCH || 'main',
  };
}

export function ghConfigured(env) {
  return !!ghConfig(env).token;
}

export class GhError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gh(env, path, init) {
  const { token } = ghConfig(env);
  if (!token) throw new GhError(503, 'GITHUB_TOKEN is not set');
  const res = await fetch(API + path, Object.assign({}, init, {
    headers: Object.assign({
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'vakilsaabagra-admin',
    }, (init && init.headers) || {}),
  }));
  if (res.ok) return res.json();
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch (e) { /* not json */ }
  throw new GhError(res.status, detail || ('GitHub answered ' + res.status));
}

function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** @returns {{sha: string, text: string}|null}  null when the file does not exist */
export async function getFile(env, path) {
  const { repo, branch } = ghConfig(env);
  try {
    const j = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
    return { sha: j.sha, text: new TextDecoder().decode(b64ToBytes(j.content)) };
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return null;
    throw e;
  }
}

/** current blob sha of a path, or null — used before overwriting a binary */
export async function getSha(env, path) {
  const { repo, branch } = ghConfig(env);
  try {
    const j = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
    return j.sha;
  } catch (e) {
    if (e instanceof GhError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Commits `content` (string or Uint8Array) to `path`. Pass the sha you read
 * the file at: if somebody changed it since, GitHub answers 409 and nothing is
 * overwritten.
 * @returns {{sha: string, url: string}} the new commit
 */
export async function putFile(env, path, content, sha, message) {
  const { repo, branch } = ghConfig(env);
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const body = {
    message,
    branch,
    content: bytesToB64(bytes),
    committer: { name: 'Vakil Saab admin', email: 'noreply@vakilsaabagra.in' },
  };
  if (sha) body.sha = sha;
  const j = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { sha: j.commit.sha, url: j.commit.html_url };
}

/** Deletes a file (used when an advocate's uploaded photo is replaced by a new extension). */
export async function deleteFile(env, path, sha, message) {
  const { repo, branch } = ghConfig(env);
  const j = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, sha, branch }),
  });
  return { sha: j.commit.sha, url: j.commit.html_url };
}

/** Recent commits touching `path`, newest first. */
export async function recentCommits(env, path, n) {
  const { repo, branch } = ghConfig(env);
  const q = `sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=${n || 30}`;
  const list = await gh(env, `/repos/${repo}/commits?${q}`);
  return list.map((c) => ({
    sha: c.sha,
    short: c.sha.slice(0, 7),
    message: String((c.commit && c.commit.message) || '').split('\n')[0],
    at: c.commit && c.commit.committer && c.commit.committer.date,
    by: (c.commit && c.commit.author && c.commit.author.name) || '',
    url: c.html_url,
  }));
}
