/**
 * Admin sign-in: password, session cookie, lockout.
 *
 *   npm test
 *
 * Runs the real Function code from functions/ against an in-memory SQLite
 * (node:sqlite) loaded with the real schema.sql, and a fake GitHub. Nothing
 * touches Cloudflare, GitHub or the network.
 */
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
const R = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(R+'/schema.sql','utf8'));
const stmt = (sql, args=[]) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  run: async () => { sqlite.prepare(sql).run(...args); return {}; },
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
});
const env = { DB: { prepare: (sql) => stmt(sql) } };
const login = (await import(R+'/functions/api/login.js')).onRequest;
const stats = (await import(R+'/functions/api/stats.js')).onRequest;
const IDS = (await import(R+'/functions/_ids.js')).default;
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ok  ',m)} else {fail++;console.log('  FAIL',m)} };
const call=(fn,method,{body,cookie,origin}={})=>fn({env,request:new Request('https://vakilsaabagra.in/api/x'+(fn===stats?'?lawyer='+IDS[0]:''),{method,headers:{...(cookie?{cookie}:{}),...(origin?{origin}:{}),'content-type':'application/json'},body:body?JSON.stringify(body):undefined})});
const cookieOf=(r)=>(r.headers.get('set-cookie')||'').split(';')[0];

// the same derivation tools/set-admin-password.js does
const PW='correct horse battery staple';
const salt=crypto.randomBytes(16), hash=crypto.pbkdf2Sync(PW,salt,100000,32,'sha256');

console.log('before a password exists');
ok((await call(login,'POST',{body:{password:PW}})).status===503,'login -> 503 "no password set"');
ok((await call(stats,'GET')).status===401,'stats without session -> 401');

sqlite.prepare('INSERT OR REPLACE INTO admin_auth (id,salt,hash,iterations,updated) VALUES (1,?,?,?,?)').run(salt.toString('hex'),hash.toString('hex'),100000,Date.now());

console.log('sign in');
ok((await call(login,'GET')).status===200 && (await (await call(login,'GET')).json()).authenticated===false,'GET -> authenticated:false');
let r=await call(login,'POST',{body:{password:'nope'}}); ok(r.status===401,'wrong password -> 401');
r=await call(login,'POST',{body:{password:PW},origin:'https://evil.example'}); ok(r.status===403,'foreign Origin -> 403');
r=await call(login,'POST',{body:{password:PW}}); ok(r.status===200,'right password -> 200');
const sc=r.headers.get('set-cookie'); const cookie=cookieOf(r);
ok(/HttpOnly/.test(sc)&&/Secure/.test(sc)&&/SameSite=Strict/.test(sc)&&/Path=\/api\//.test(sc),'cookie is HttpOnly; Secure; SameSite=Strict; Path=/api/');
const tok=cookie.split('=')[1];
ok(/^[0-9a-f]{64}$/.test(tok),'session token is 256-bit hex');
const rows=sqlite.prepare('SELECT token_hash FROM admin_sessions').all();
ok(rows.length===1 && rows[0].token_hash!==tok && rows[0].token_hash===crypto.createHash('sha256').update(tok).digest('hex'),'only the SHA-256 of the token is stored');

console.log('with the session');
ok((await (await call(login,'GET',{cookie})).json()).authenticated===true,'GET -> authenticated:true');
r=await call(stats,'GET',{cookie}); ok(r.status===200,'stats with cookie -> 200 ('+r.status+')');
ok((await call(stats,'GET',{cookie:'vs_admin='+'0'.repeat(64)})).status===401,'forged cookie -> 401');
ok((await call(stats,'GET',{cookie:'vs_admin=abc'})).status===401,'malformed cookie -> 401');

console.log('sign out');
r=await call(login,'DELETE',{cookie}); ok(r.status===200 && /Max-Age=0/.test(r.headers.get('set-cookie')),'DELETE clears the cookie');
ok((await call(stats,'GET',{cookie})).status===401,'old cookie no longer works');

console.log('expiry');
r=await call(login,'POST',{body:{password:PW}}); const c2=cookieOf(r);
sqlite.prepare('UPDATE admin_sessions SET expires=?').run(Date.now()-1000);
ok((await call(stats,'GET',{cookie:c2})).status===401,'expired session -> 401');

console.log('lockout');
for(let i=0;i<8;i++) await call(login,'POST',{body:{password:'bad'+i}});
r=await call(login,'POST',{body:{password:PW}}); ok(r.status===429,'8 failures -> correct password still 429 ('+r.status+')');
sqlite.prepare('UPDATE admin_attempts SET ts=?').run(Date.now()-16*60*1000);
r=await call(login,'POST',{body:{password:PW}}); ok(r.status===200,'after 15 minutes -> 200 again');
ok(sqlite.prepare('SELECT COUNT(*) n FROM admin_attempts').get().n===0,'success clears the failure counter');

console.log('never leaks');
ok(!JSON.stringify(sqlite.prepare('SELECT * FROM admin_auth').all()).includes(PW),'password not in the database');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
