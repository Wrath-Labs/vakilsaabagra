/**
 * POST /api/admin/photo   { id, data: <base64>, type: "image/jpeg" | "image/png" | "image/webp" }
 *
 * Commits the file to assets/lawyers/<id>.<ext>, then points the record's
 * `photo` at it. Two commits, so two quick rebuilds — Pages keeps the last one.
 */
import { guard, json, fail, needGithub, mutate, readDb } from '../../_admin.js';
import { getSha, putFile } from '../../_gh.js';
import { updateLawyer } from '../../_lawyers.js';

const MAX_BYTES = 400 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export async function onRequest({ request, env }) {
  const g = await guard(request, env);
  if (g) return g;
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const no = needGithub(env);
  if (no) return no;

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
  const id = String((body && body.id) || '');
  if (!/^[a-z0-9-]+$/.test(id)) return json({ error: 'bad id' }, 400);

  let bytes;
  try {
    const bin = atob(String(body.data || ''));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) { return json({ error: 'photo data is not valid base64' }, 400); }

  if (bytes.length === 0) return json({ error: 'empty file' }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: `photo is ${Math.round(bytes.length / 1024)} KB; the limit is ${MAX_BYTES / 1024} KB` }, 413);

  const type = sniff(bytes);
  if (!type || !TYPES[type]) return json({ error: 'photo must be a JPEG, PNG or WebP image' }, 415);

  const path = `assets/lawyers/${id}.${TYPES[type]}`;
  try {
    /* check first: committing the file and then finding there is no such
       advocate would leave an orphaned image in the repository */
    const { db } = await readDb(env);
    if (!db.lawyers.some((l) => l.id === id)) return json({ error: `No advocate with id "${id}"` }, 404);

    const existing = await getSha(env, path);
    const commit = await putFile(env, path, bytes, existing, `admin: photo for ${id}`);
    const { commit: c2, result } = await mutate(
      env,
      (db) => updateLawyer(db, id, { photo: path }),
      (r) => `admin: point ${r.lawyer.name} at ${path}`
    );
    return json({ ok: true, photo: path, commit: c2 || commit, lawyer: result.lawyer });
  } catch (e) {
    return fail(e);
  }
}
