/**
 * Admin API: add / update / remove / photo / overview / domains, against a fake GitHub and the real validator and build.
 *
 *   npm test
 *
 * Runs the real Function code from functions/ against an in-memory SQLite
 * (node:sqlite) loaded with the real schema.sql, and a fake GitHub. Nothing
 * touches Cloudflare, GitHub or the network.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
// ---- fake D1 -------------------------------------------------------------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(R+'/schema.sql','utf8'));
const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>sqlite.prepare(sql).get(...args)??null,run:async()=>{sqlite.prepare(sql).run(...args);return{}},all:async()=>({results:sqlite.prepare(sql).all(...args)})});
// ---- fake GitHub (contents API) -----------------------------------------
const store=new Map(); let commits=[]; let n=0;
const sha=(b)=>crypto.createHash('sha1').update(b).digest('hex');
store.set('data/lawyers.json',{bytes:readFileSync(R+'/data/lawyers.json')});
let failNextPutWith409=0;
globalThis.fetch=async(url,init={})=>{
  const u=new URL(url); const m=init.method||'GET';
  if(u.host==='api.cloudflare.com'){ globalThis.__cf.push([m,u.pathname,init.body]); return new Response(JSON.stringify({success:true,result:{name:'x',status:'pending'},errors:[]}),{status:200}); }
  const mm=u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
  if(mm){ const p=decodeURIComponent(mm[1]);
    if(m==='GET'){ const f=store.get(p); if(!f) return new Response(JSON.stringify({message:'Not Found'}),{status:404});
      return new Response(JSON.stringify({sha:sha(f.bytes),content:Buffer.from(f.bytes).toString('base64')}),{status:200}); }
    if(m==='PUT'){ const b=JSON.parse(init.body); const cur=store.get(p);
      if(failNextPutWith409>0){failNextPutWith409--; return new Response(JSON.stringify({message:'conflict'}),{status:409});}
      if(cur && b.sha!==sha(cur.bytes)) return new Response(JSON.stringify({message:'sha mismatch'}),{status:409});
      if(!cur && b.sha) return new Response(JSON.stringify({message:'bad sha'}),{status:422});
      store.set(p,{bytes:Buffer.from(b.content,'base64')}); n++; commits.push({p,msg:b.message});
      return new Response(JSON.stringify({commit:{sha:'c'+n+'0'.repeat(38),html_url:'https://github.com/x/y/commit/c'+n}}),{status:200}); }
  }
  if(/\/commits$/.test(u.pathname)) return new Response(JSON.stringify(commits.slice().reverse().map((c,i)=>({sha:'c'+i+'0'.repeat(38),html_url:'u',commit:{message:c.msg,committer:{date:'2026-10-10T00:00:00Z'},author:{name:'a'}}}))),{status:200});
  return new Response('{}',{status:404});
};
globalThis.__cf=[];
// ---- sign in as admin (real _auth.js) -----------------------------------
const A=await import(R+'/functions/_auth.js');
const env={DB:{prepare:(s)=>stmt(s)},GITHUB_TOKEN:'t',CF_API_TOKEN:'c',CF_ACCOUNT_ID:'a',CF_ZONE_ID:'z'};
const tok='ab'.repeat(32);
sqlite.prepare('INSERT INTO admin_sessions (token_hash,expires) VALUES (?,?)').run(await A.sha256Hex(tok),Date.now()+1e6);
const COOKIE='vs_admin='+tok;
const load=async(f)=>(await import(R+'/functions/api/admin/'+f)).onRequest;
const lawyers=await load('lawyers.js'), one=await load('lawyers/[id].js'), photo=await load('photo.js'),
      overview=await load('overview.js'), activity=await load('activity.js'), domains=await load('domains.js'), status=await load('status.js');
const call=(fn,method,p,{body,cookie=COOKIE,params={},e=env,origin}={})=>fn({env:e,params,request:new Request('https://vakilsaabagra.in'+p,{method,headers:{cookie,'content-type':'application/json',...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)})});
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ok  ',m)}else{fail++;console.log('  FAIL',m)}};
const jb=async(r)=>r.json();
const db0=()=>JSON.parse(Buffer.from(store.get('data/lawyers.json').bytes).toString());

console.log('guards');
ok((await call(lawyers,'GET','/api/admin/lawyers',{cookie:''})).status===401,'no session -> 401 on every endpoint (lawyers)');
ok((await call(overview,'GET','/api/admin/overview',{cookie:''})).status===401,'no session -> 401 (overview)');
ok((await call(lawyers,'POST','/api/admin/lawyers',{body:{name:'x'},origin:'https://evil.example'})).status===403,'foreign Origin on POST -> 403');
ok((await call(lawyers,'GET','/api/admin/lawyers',{e:{...env,GITHUB_TOKEN:''}})).status===503,'no GITHUB_TOKEN -> 503 with setup hint');
let st=await jb(await call(status,'GET','/api/admin/status')); ok(st.github&&st.cloudflare&&st.database,'status reports what is connected');

console.log('read');
let r=await call(lawyers,'GET','/api/admin/lawyers'); let j=await jb(r);
ok(r.status===200 && j.lawyers.length===20 && j.lawyers[0].listing,'lists 20 advocates including the billing block');

console.log('add');
const input={name:'Adv. Ishaan Trivedi',phone:'+919811122233',email:'priya@example.org',primaryCategory:'family',categories:['family','civil'],experienceYears:'9',
  about:'Family law in Agra.',languages:['Hindi','English'],location:{area:'Sanjay Place',address:'12 Sanjay Place, Agra'},
  listing:{plan:'yearly',paidUntil:'2027-10-10',active:true},
  microsite:{enabled:true,slug:'ishaan',tagline:'Family law, Agra',longAbout:'A much longer biography than the short one.',accent:'teal',faqs:[{q:'Fees?',a:'First call free.'},{q:'',a:''}],evil:'x'},evil:'<script>'};
r=await call(lawyers,'POST','/api/admin/lawyers',{body:input}); j=await jb(r); if(r.status!==201) console.log('   DEBUG',r.status,JSON.stringify(j).slice(0,500));
ok(r.status===201 && j.id==='ishaan-trivedi','POST creates id ishaan-trivedi');
let d=db0(); const p=d.lawyers.find(l=>l.id==='ishaan-trivedi');
ok(d.lawyers.length===21 && p.experienceYears===9 && p.whatsapp==='+919811122233','record stored, number coerced, whatsapp defaults to phone');
ok(p.microsite.faqs.length===1 && !('evil' in p) && !('evil' in p.microsite),'blank FAQ dropped, unknown keys ignored');
ok(p.listing.onboardedOn===new Date().toISOString().slice(0,10),'onboardedOn defaults to today');
ok(commits.at(-1).msg==='admin: add Adv. Ishaan Trivedi','commit message names the advocate');
ok(JSON.stringify(d,null,2)+'\n'===Buffer.from(store.get('data/lawyers.json').bytes).toString(),'file keeps the repo\'s exact JSON formatting');

console.log('validation refuses bad edits (nothing committed)');
const before=commits.length;
r=await call(lawyers,'POST','/api/admin/lawyers',{body:{...input}}); ok(r.status===409,'same name again -> 409 duplicate');
r=await call(lawyers,'POST','/api/admin/lawyers',{body:{name:'Adv. Bad One',phone:'+911',primaryCategory:'nope',categories:['nope']}}); j=await jb(r);
ok(r.status===422 && j.problems.some(x=>/unknown primaryCategory/.test(x)),'unknown category -> 422 with the build\'s own message');
r=await call(lawyers,'POST','/api/admin/lawyers',{body:{name:'Adv. Res One',phone:'+911',primaryCategory:'family',categories:['family'],microsite:{enabled:true,slug:'admin',longAbout:'x'}}}); j=await jb(r);
ok(r.status===422 && j.problems.some(x=>/reserved/.test(x)),'reserved slug -> 422');
r=await call(lawyers,'POST','/api/admin/lawyers',{body:{name:'Adv. Dup Slug',phone:'+911',primaryCategory:'family',categories:['family'],microsite:{enabled:true,slug:'ishaan',longAbout:'x'}}}); j=await jb(r);
ok(r.status===422 && j.problems.some(x=>/already used/.test(x)),'duplicate slug -> 422');
r=await call(lawyers,'POST','/api/admin/lawyers',{body:{name:'  '}}); ok(r.status===422,'blank name -> 422');
ok(commits.length===before,'none of the refused edits produced a commit');

console.log('update / renew / take down / reinstate');
r=await call(one,'PUT','/api/admin/lawyers/ishaan-trivedi',{params:{id:'ishaan-trivedi'},body:{listing:{paidUntil:'2028-10-10'}}}); j=await jb(r);
ok(r.status===200 && db0().lawyers.find(l=>l.id==='ishaan-trivedi').listing.paidUntil==='2028-10-10','renew changes paidUntil only');
ok(db0().lawyers.find(l=>l.id==='ishaan-trivedi').listing.plan==='yearly','...and keeps the rest of the listing block');
await call(one,'PUT','/x',{params:{id:'ishaan-trivedi'},body:{listing:{active:false}}});
ok(db0().lawyers.find(l=>l.id==='ishaan-trivedi').listing.active===false,'take down sets active:false, record kept');
await call(one,'PUT','/x',{params:{id:'ishaan-trivedi'},body:{listing:{active:true}}});
ok(db0().lawyers.find(l=>l.id==='ishaan-trivedi').listing.active===true,'reinstate');
r=await call(one,'PUT','/x',{params:{id:'nobody'},body:{about:'x'}}); ok(r.status===404,'unknown id -> 404');
r=await call(one,'PUT','/x',{params:{id:'ishaan-trivedi'},body:{microsite:{longAbout:db0().lawyers.find(l=>l.id==='ishaan-trivedi').about}}}); ok(r.status===422,'longAbout copied from about -> 422');
r=await call(one,'PUT','/x',{params:{id:'ishaan-trivedi'},body:{id:'hacked',name:''}}); ok(r.status===422 && db0().lawyers.some(l=>l.id==='ishaan-trivedi'),'cannot blank the name or change the id');

console.log('conflict retry');
failNextPutWith409=1;
r=await call(one,'PUT','/x',{params:{id:'ishaan-trivedi'},body:{availability:'Mon-Sat'}});
ok(r.status===200 && db0().lawyers.find(l=>l.id==='ishaan-trivedi').availability==='Mon-Sat','one 409 from GitHub is retried and succeeds');
failNextPutWith409=5;
r=await call(one,'PUT','/x',{params:{id:'ishaan-trivedi'},body:{availability:'x'}}); ok(r.status===409,'persistent conflict -> 409, not a silent overwrite');
failNextPutWith409=0;

console.log('delete');
r=await call(one,'DELETE','/x',{params:{id:'ishaan-trivedi'},body:{}}); ok(r.status===400,'DELETE without confirm -> 400');
ok(db0().lawyers.some(l=>l.id==='ishaan-trivedi'),'...and nothing removed');
r=await call(one,'DELETE','/x',{params:{id:'ishaan-trivedi'},body:{confirm:'ishaan-trivedi'}}); ok(r.status===200 && !db0().lawyers.some(l=>l.id==='ishaan-trivedi'),'DELETE with confirm removes the record');
ok(db0().lawyers.length===20,'back to 20 advocates');

console.log('photo');
const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(200)]);
r=await call(photo,'POST','/x',{body:{id:'ramesh-chandra-chauhan',data:png.toString('base64')}}); j=await jb(r);
ok(r.status===200 && j.photo==='assets/lawyers/ramesh-chandra-chauhan.png' && store.has(j.photo),'png stored at assets/lawyers/<id>.png');
ok(db0().lawyers.find(l=>l.id==='ramesh-chandra-chauhan').photo===j.photo,'record points at it');
r=await call(photo,'POST','/x',{body:{id:'ramesh-chandra-chauhan',data:Buffer.from('<svg onload=alert(1)>').toString('base64')}}); ok(r.status===415,'SVG/other types refused (415)');
r=await call(photo,'POST','/x',{body:{id:'ramesh-chandra-chauhan',data:Buffer.concat([png,Buffer.alloc(500*1024)]).toString('base64')}}); ok(r.status===413,'oversize refused (413)');
r=await call(photo,'POST','/x',{body:{id:'../etc/passwd',data:'AA=='}}); ok(r.status===400,'path-traversal id refused');
const nBefore=store.size; r=await call(photo,'POST','/x',{body:{id:'no-such-advocate',data:png.toString('base64')}}); ok(r.status===404 && store.size===nBefore,'photo for an unknown advocate -> 404 and no orphan file committed');

console.log('overview & activity');
sqlite.prepare("INSERT INTO events (ts,type,lawyer_id,source,query,category,area,session) VALUES (?,?,?,?,?,?,?,?)").run(Date.now(),'view','ramesh-chandra-chauhan','search',null,'criminal',null,'s1');
sqlite.prepare("INSERT INTO events (ts,type,lawyer_id,source,query,category,area,session) VALUES (?,?,?,?,?,?,?,?)").run(Date.now(),'call','ramesh-chandra-chauhan','profile',null,null,null,'s2');
sqlite.prepare("INSERT INTO events (ts,type,lawyer_id,source,query,category,area,session) VALUES (?,?,?,?,?,?,?,?)").run(Date.now(),'search',null,null,'bail agra',null,null,'s3');
r=await call(overview,'GET','/api/admin/overview'); j=await jb(r);
ok(r.status===200 && j.totals.view===1 && j.totals.call===1 && j.totals.search===1,'totals by type');
ok(j.byLawyer['ramesh-chandra-chauhan'].call===1 && j.topQueries[0].query==='bail agra','per-advocate and top searches');
r=await call(activity,'GET','/api/admin/activity'); j=await jb(r); ok(r.status===200 && j.commits.length>3 && /^admin:/.test(j.commits[0].message),'activity lists recent admin commits');

console.log('microsite domains');
// add a real (non-sample) advocate with a microsite directly into the store
{const d=db0(); const rec=JSON.parse(JSON.stringify(d.lawyers[0])); rec.id='real-one'; rec.featured=false; rec.name='Adv. Real One'; rec.phone='+919811100000'; rec.email='real@one.in'; rec.microsite={enabled:true,slug:'realone',tagline:'t',longAbout:'long different',faqs:[],accent:'navy'}; d.lawyers.push(rec); store.set('data/lawyers.json',{bytes:Buffer.from(JSON.stringify(d,null,2)+'\n')});}
r=await call(domains,'POST','/x',{body:{slug:'ramesh'}}); j=await jb(r); ok(r.status===409 && /sample/.test(j.error),'sample advocate\'s slug refused (never a real domain)');
globalThis.__cf.length=0;
r=await call(domains,'POST','/x',{body:{slug:'realone'}}); j=await jb(r);
ok(r.status===201 && j.host==='realone.vakilsaabagra.in','real advocate -> domain attached');
ok(globalThis.__cf.some(c=>/pages\/projects\/vakilsaabagra\/domains/.test(c[1])) && globalThis.__cf.some(c=>/dns_records/.test(c[1])),'both the Pages domain and the DNS record were requested');
r=await call(domains,'POST','/x',{body:{slug:'www'}}); ok(r.status===400,'reserved slug refused');
r=await call(domains,'GET','/x',{e:{...env,CF_API_TOKEN:''}}); j=await jb(r); ok(j.configured===false && /Custom domains/.test(j.manual),'unconfigured -> manual instructions, not an error');

console.log('the committed file still builds');
const tmp=mkdtempSync(path.join(os.tmpdir(),'vs-'));
cpSync(R,tmp,{recursive:true,filter:(s)=>!/node_modules|\.git(\/|$)/.test(s)});
writeFileSync(tmp+'/data/lawyers.json',store.get('data/lawyers.json').bytes);
let out; try{ out=execFileSync('node',[tmp+'/tools/sync.js'],{encoding:'utf8',cwd:tmp}); ok(/live advocates/.test(out)&&/5 microsites/.test(out),'tools/sync.js accepts it and builds 5 microsites (4 sample + the new one)'); }catch(e){ ok(false,'sync.js rejected: '+(e.stderr||e.message).slice(0,300)); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
