/**
 * Admin app: overview, advocates (add / edit / renew / take down / remove),
 * microsites, activity. Plain JS, no framework, hash-routed.
 *
 * Every change goes through /api/admin/*, which validates with the same rules
 * as the build and commits data/lawyers.json to git. Nothing is stored in the
 * browser; the session cookie is HttpOnly and not readable from here.
 *
 * All text that comes from data is passed through esc() before it reaches
 * innerHTML.
 */
(function (w, d) {
  'use strict';

  var $ = function (id) { return d.getElementById(id); };
  var view = $('view');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var S = { status: null, pricing: null, lawyers: [], categories: [], readOnly: true, overview: null, period: 'month' };

  var APEX = 'vakilsaabagra.in';
  var LABEL = 'block text-xs font-bold uppercase tracking-[.14em] text-[var(--muted-2)] mb-1.5';
  var INPUT = 'select-field w-full px-3 py-2.5 text-sm text-[var(--ink)]';

  /* -------------------------------------------------------------- dates */
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(s) { return Math.round((new Date(s) - new Date(todayStr())) / 86400000); }
  function addMonths(dateStr, n) {
    var t = new Date(dateStr + 'T00:00:00Z');
    var day = t.getUTCDate();
    t.setUTCMonth(t.getUTCMonth() + n);
    if (t.getUTCDate() !== day) t.setUTCDate(0);   /* 31 Jan + 1 month -> 28/29 Feb */
    return t.toISOString().slice(0, 10);
  }
  function fmtDate(s) {
    if (!s) return '—';
    return new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

  /* ---------------------------------------------------------- api access */
  async function api(method, path, body) {
    var res = await fetch(path, {
      method: method, credentials: 'same-origin', cache: 'no-store',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    var j = {};
    try { j = await res.json(); } catch (e) { /* empty body */ }
    if (res.status === 401) {
      showLogin('Session ended — please sign in again.');
      var s = new Error('signed out'); s.silent = true; throw s;
    }
    if (!res.ok) {
      var err = new Error(j.error || ('HTTP ' + res.status));
      err.status = res.status; err.problems = j.problems || []; err.body = j;
      throw err;
    }
    return j;
  }

  /* --------------------------------------------------------- toast/banner */
  var toastTimer;
  function toast(html, kind) {
    var t = $('toast');
    t.className = 'mt-4 rounded-lg border px-4 py-3 text-sm ' + (kind === 'bad'
      ? 'border-[#e8b4b4] bg-[#fdf0f0] text-[#8a1f1f]'
      : 'border-[#b9dfc8] bg-[#eef8f2] text-[#0e5a36]');
    t.innerHTML = html;
    clearTimeout(toastTimer);
    if (kind !== 'bad') toastTimer = setTimeout(function () { t.className = 'hidden'; }, 12000);
    t.scrollIntoView({ block: 'nearest' });
  }
  function saved(commit, what) {
    toast('<strong>' + esc(what) + '</strong> — saved' +
      (commit && commit.url ? ' as <a class="underline" target="_blank" rel="noopener" href="' + esc(commit.url) + '">commit ' + esc(String(commit.sha).slice(0, 7)) + '</a>' : '') +
      '. The site rebuilds and goes live in about two minutes.');
  }
  function problemsHtml(err) {
    var list = (err.problems || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    return '<strong>' + esc(err.message) + '</strong>' + (list ? '<ul class="mt-1 list-disc pl-5">' + list + '</ul>' : '');
  }

  function banner() {
    var b = $('banner'), st = S.status, parts = [];
    if (!st) { b.innerHTML = ''; return; }
    if (!st.github) {
      parts.push('<div class="card border-l-4 border-[var(--gold)] p-4 text-sm">' +
        '<p class="font-semibold text-[var(--ink)]">Read-only: GitHub is not connected yet.</p>' +
        '<p class="mt-1 text-[var(--muted)]">You can look around, but adding or changing advocates needs a ' +
        '<code>GITHUB_TOKEN</code> secret on the Pages project. Steps are in <code>docs/DEPLOY.md</code> 1.9.</p></div>');
    }
    b.innerHTML = parts.join('');
  }

  /* ------------------------------------------------------------- sign in */
  function showLogin(msg) {
    $('login').classList.remove('hidden'); $('login').classList.add('grid');
    $('nav').classList.add('hidden'); $('nav').classList.remove('flex');
    view.innerHTML = '';
    $('login-status').textContent = msg || '';
    $('password').value = '';
    $('password').focus();
  }
  function hideLogin() {
    $('login').classList.add('hidden'); $('login').classList.remove('grid');
    $('nav').classList.remove('hidden'); $('nav').classList.add('flex');
    $('login-status').textContent = '';
  }

  $('login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var pw = $('password').value;
    if (!pw) { $('login-status').textContent = 'Enter the password.'; return; }
    $('login-status').textContent = 'signing in…';
    fetch('/api/login', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw })
    }).then(function (r) {
      return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || ('HTTP ' + r.status)); });
    }).then(function () { $('password').value = ''; start(); })
      .catch(function (e) { $('login-status').textContent = e.message; });
  });

  $('signout').addEventListener('click', function () {
    fetch('/api/login', { method: 'DELETE', credentials: 'same-origin' }).then(function () { showLogin('Signed out.'); });
  });

  /* --------------------------------------------------------- derived data */
  function isSample(l) {
    return /@example\.com$/i.test(l.email || '') || /^\+9199990000\d\d$/.test(l.phone || '');
  }
  function stateOf(l) {
    var li = l.listing;
    if (!li) return { key: 'live', label: 'Live', tone: 'ok' };           /* read-only: public set is live-only */
    if (li.active === false) return { key: 'down', label: 'Taken down', tone: 'mute' };
    if (li.paidUntil && daysUntil(li.paidUntil) < 0) return { key: 'expired', label: 'Expired', tone: 'bad' };
    if (li.paidUntil && daysUntil(li.paidUntil) <= 15) return { key: 'expiring', label: 'Expiring', tone: 'warn' };
    return { key: 'live', label: 'Live', tone: 'ok' };
  }
  var TONES = {
    ok: 'bg-[#e7f6ee] text-[#0e7a4a]', warn: 'bg-[#fdf3dc] text-[#8a5a00]',
    bad: 'bg-[#fdecec] text-[#a02020]', mute: 'bg-[#eceae4] text-[#5b5a55]', info: 'bg-[#e8eef8] text-[#1b3f68]'
  };
  function pill(text, tone) {
    return '<span class="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ' + (TONES[tone] || TONES.mute) + '">' + esc(text) + '</span>';
  }
  function planPrice(l) {
    var li = l.listing; if (!li || li.plan === 'none') return 0;
    var p = (S.pricing.plans || []).filter(function (x) { return x.id === li.plan; })[0];
    if (!p) return 0;
    return p.listing + (l.microsite && l.microsite.enabled ? p.microsite : 0);
  }
  function byId(id) { return S.lawyers.filter(function (l) { return l.id === id; })[0]; }
  function catName(slug) {
    var c = S.categories.filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : slug;
  }

  /* ------------------------------------------------------------- loading */
  async function loadData() {
    var r = await Promise.all([api('GET', '/api/admin/status'), fetch('/data/pricing.json', { cache: 'no-cache' }).then(function (x) { return x.json(); })]);
    S.status = r[0]; S.pricing = r[1];
    if (S.status.github) {
      var j = await api('GET', '/api/admin/lawyers');
      S.lawyers = j.lawyers; S.categories = j.categories; S.readOnly = false;
    } else {
      var pub = await fetch('/data/lawyers.public.json', { cache: 'no-cache' }).then(function (x) { return x.json(); });
      S.lawyers = pub.lawyers; S.categories = pub.categories; S.readOnly = true;
    }
    banner();
  }

  async function loadOverview() {
    var now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth(), pad = function (n) { return String(n).padStart(2, '0'); };
    var from, to = todayStr();
    if (S.period === 'last') {
      from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    } else if (S.period === '30') {
      from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    } else from = y + '-' + pad(m + 1) + '-01';
    S.overview = await api('GET', '/api/admin/overview?from=' + from + '&to=' + to);
  }

  /* ------------------------------------------------------------ overview */
  function tile(label, value, sub) {
    return '<div class="card p-4 text-center">' +
      '<p class="tabular font-display text-3xl font-bold text-[var(--ink)]">' + esc(value) + '</p>' +
      '<p class="mt-1 text-[11px] uppercase tracking-wide text-[var(--muted-2)]">' + esc(label) + '</p>' +
      (sub ? '<p class="mt-0.5 text-[11px] text-[var(--muted)]">' + esc(sub) + '</p>' : '') + '</div>';
  }

  /* one bar per calendar day, empty days included, so a quiet week looks quiet */
  function barChart(daily, from, to) {
    var have = {};
    daily.forEach(function (r) { have[r.date] = r; });
    var days = [], t = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
    for (; t <= end && days.length < 400; t = new Date(t.getTime() + 86400000)) {
      var k = t.toISOString().slice(0, 10);
      days.push(have[k] || { date: k, view: 0, call: 0, whatsapp: 0, copy: 0 });
    }
    var total = daily.reduce(function (n, r) { return n + r.view + r.call + r.whatsapp + r.copy; }, 0);
    if (!total) return '<p class="text-sm text-[var(--muted)]">No profile views or contacts in this period yet.</p>';
    var max = Math.max.apply(null, days.map(function (r) { return Math.max(r.view, r.call + r.whatsapp + r.copy); })) || 1;
    return '<div class="flex h-40 items-end gap-0.5" role="img" aria-label="Daily profile views and contacts">' +
      days.map(function (r) {
        var views = r.view, contacts = r.call + r.whatsapp + r.copy;
        var hv = views ? Math.max(4, Math.round(views / max * 100)) : 0, hc = contacts ? Math.max(4, Math.round(contacts / max * 100)) : 0;
        return '<div class="flex h-full min-w-[4px] max-w-[26px] flex-1 items-end gap-px border-b border-[var(--line)]" title="' +
          esc(r.date) + ' — ' + views + ' views, ' + contacts + ' contacts">' +
          '<div style="height:' + hv + '%" class="w-1/2 bg-[var(--ink)] opacity-80"></div>' +
          '<div style="height:' + hc + '%" class="w-1/2 bg-[var(--gold)]"></div></div>';
      }).join('') + '</div>' +
      '<p class="mt-2 text-xs text-[var(--muted)]"><span class="inline-block h-2 w-2 bg-[var(--ink)] align-middle opacity-80"></span> profile views &nbsp; ' +
      '<span class="inline-block h-2 w-2 bg-[var(--gold)] align-middle"></span> contacts (call, WhatsApp, copy) &nbsp; ' +
      esc(from) + ' → ' + esc(to) + ' · hover a bar for the day</p>';
  }

  function listCard(title, rows, empty) {
    return '<div class="card p-5"><h3 class="font-display text-lg font-bold text-[var(--ink)]">' + esc(title) + '</h3>' +
      '<div class="rule-gold mt-3 mb-3"></div>' +
      (rows.length ? '<ol class="grid gap-1.5 text-sm">' + rows.map(function (r) {
        return '<li class="flex items-baseline justify-between gap-3 border-b border-[var(--line-2)] py-1 last:border-0">' +
          '<span class="truncate">' + esc(r[0]) + '</span><span class="tabular shrink-0 font-semibold">' + esc(r[1]) + '</span></li>';
      }).join('') + '</ol>' : '<p class="text-sm text-[var(--muted)]">' + esc(empty) + '</p>') + '</div>';
  }

  function renderOverview() {
    var o = S.overview, t = o.totals;
    var ls = S.lawyers, st = ls.map(stateOf);
    var live = ls.filter(function (l, i) { return st[i].key === 'live' || st[i].key === 'expiring'; });
    var expiring = ls.filter(function (l, i) { return st[i].key === 'expiring'; });
    var expired = ls.filter(function (l, i) { return st[i].key === 'expired'; });
    var down = ls.filter(function (l, i) { return st[i].key === 'down'; });
    var sites = live.filter(function (l) { return l.microsite && l.microsite.enabled; });
    var samples = ls.filter(isSample);
    var mrr = live.reduce(function (n, l) { return n + planPrice(l); }, 0);
    var contacts = t.call + t.whatsapp + t.copy;

    var attention = [];
    expired.forEach(function (l) { attention.push(['bad', l, 'expired ' + Math.abs(daysUntil(l.listing.paidUntil)) + ' days ago — hidden from the site']); });
    expiring.forEach(function (l) { attention.push(['warn', l, 'expires ' + fmtDate(l.listing.paidUntil) + ' (in ' + daysUntil(l.listing.paidUntil) + ' days)']); });
    if (samples.length) attention.push(['info', null, samples.length + ' sample advocates are still in the data — replace them before promoting the site']);

    var perf = Object.keys(o.byLawyer).map(function (id) {
      var b = o.byLawyer[id]; return { id: id, view: b.view, contacts: b.call + b.whatsapp + b.copy, impression: b.impression };
    }).sort(function (a, b) { return b.contacts - a.contacts || b.view - a.view; }).slice(0, 10);

    var period = [['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days']].map(function (p) {
      return '<button type="button" data-period="' + p[0] + '" class="chip' + (S.period === p[0] ? ' is-active' : '') + '">' + p[1] + '</button>';
    }).join('');

    view.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-display text-2xl font-bold text-[var(--ink)]">Overview</h2>' +
      '<div class="flex gap-2">' + period + '</div></div>' +
      '<p class="mt-1 text-sm text-[var(--muted)]">' + esc(o.from) + ' to ' + esc(o.to) + '. Counts are anonymous — nothing here identifies a visitor.</p>' +

      '<div class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">' +
        tile('Live listings', live.length) +
        tile('Microsites live', sites.length) +
        tile('Expiring ≤ 15 days', expiring.length) +
        tile('Expired', expired.length) +
        tile('Taken down', down.length) +
        tile('Monthly value', S.readOnly ? '—' : money(mrr), S.readOnly ? 'needs GitHub' : 'listing + microsite') +
      '</div>' +

      '<div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">' +
        tile('Profile views', t.view) + tile('Calls', t.call) + tile('WhatsApp', t.whatsapp) +
        tile('Number copied', t.copy) + tile('Shown in results', t.impression) + tile('Searches', t.search) +
      '</div>' +
      '<p class="mt-2 text-sm text-[var(--muted)]"><strong>' + contacts + ' contacts</strong> (calls, WhatsApp taps, number copies) from <strong>' +
        t.view + ' profile views</strong>. A contact can also happen straight from the results list, without a profile view.</p>' +

      '<div class="card mt-6 p-5"><h3 class="font-display text-lg font-bold text-[var(--ink)]">Day by day</h3>' +
        '<div class="rule-gold mt-3 mb-4"></div>' + barChart(o.daily, o.from, o.to) + '</div>' +

      (attention.length ? '<div class="card mt-6 p-5"><h3 class="font-display text-lg font-bold text-[var(--ink)]">Needs attention</h3>' +
        '<div class="rule-gold mt-3 mb-3"></div><ul class="grid gap-2 text-sm">' + attention.map(function (a) {
          return '<li class="flex flex-wrap items-center gap-2">' + pill(a[0] === 'bad' ? 'Expired' : a[0] === 'warn' ? 'Expiring' : 'Note', a[0]) +
            (a[1] ? '<a class="font-semibold underline" href="#/advocates/' + esc(a[1].id) + '">' + esc(a[1].name) + '</a>' : '') +
            '<span class="text-[var(--muted)]">' + esc(a[2]) + '</span></li>';
        }).join('') + '</ul></div>' : '') +

      '<div class="card mt-6 overflow-x-auto p-5"><h3 class="font-display text-lg font-bold text-[var(--ink)]">Top advocates by contacts</h3>' +
        '<div class="rule-gold mt-3 mb-3"></div>' +
        (perf.length ? '<table class="w-full min-w-[460px] text-sm"><thead><tr class="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--muted-2)]">' +
          '<th class="py-2 pr-4">Advocate</th><th class="py-2 pr-4">Views</th><th class="py-2 pr-4">Contacts</th><th class="py-2">Shown</th></tr></thead><tbody>' +
          perf.map(function (p) {
            var l = byId(p.id);
            return '<tr class="border-b border-[var(--line-2)] last:border-0"><td class="py-2 pr-4">' +
              '<a class="underline" href="#/advocates/' + esc(p.id) + '">' + esc(l ? l.name : p.id) + '</a></td>' +
              '<td class="py-2 pr-4 tabular">' + p.view + '</td><td class="py-2 pr-4 tabular">' + p.contacts + '</td>' +
              '<td class="py-2 tabular">' + p.impression + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="text-sm text-[var(--muted)]">No advocate activity in this period yet.</p>') + '</div>' +

      '<div class="mt-6 grid gap-6 md:grid-cols-3">' +
        listCard('Top searches', o.topQueries.slice(0, 10).map(function (q) { return [q.query, q.count]; }), 'No searches recorded.') +
        listCard('Where views came from', o.sources.map(function (s) { return [s.source, s.count]; }), 'No source data yet.') +
        listCard('Most looked-at practice areas', o.topAreas.map(function (a) { return [catName(a.area), a.count]; }), 'No data yet.') +
      '</div>';
  }

  /* ----------------------------------------------------------- advocates */
  var listFilter = { q: '', status: 'all' };

  function renderAdvocates() {
    var ls = S.lawyers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var counts = { all: ls.length, live: 0, expiring: 0, expired: 0, down: 0, sample: 0 };
    ls.forEach(function (l) { counts[stateOf(l).key]++; if (isSample(l)) counts.sample++; });

    var chips = [['all', 'All'], ['live', 'Live'], ['expiring', 'Expiring'], ['expired', 'Expired'], ['down', 'Taken down'], ['sample', 'Sample']].map(function (c) {
      return '<button type="button" data-status="' + c[0] + '" class="chip' + (listFilter.status === c[0] ? ' is-active' : '') + '">' +
        c[1] + ' <span class="tabular opacity-70">' + counts[c[0]] + '</span></button>';
    }).join('');

    view.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-display text-2xl font-bold text-[var(--ink)]">Advocates</h2>' +
      (S.readOnly ? '' : '<a href="#/advocates/new" class="btn btn-primary px-5 py-2.5 text-sm">Add an advocate</a>') + '</div>' +
      '<div class="mt-4 flex flex-wrap items-center gap-2">' + chips +
      '<input id="q" type="search" placeholder="Search name, phone, enrolment…" value="' + esc(listFilter.q) + '" class="' + INPUT + ' ml-auto max-w-xs"></div>' +
      '<div id="rows" class="card mt-4 overflow-x-auto"></div>';
    paintRows();
  }

  function paintRows() {
    var q = listFilter.q.trim().toLowerCase();
    var ls = S.lawyers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).filter(function (l) {
      var s = stateOf(l).key;
      if (listFilter.status === 'sample' ? !isSample(l) : (listFilter.status !== 'all' && s !== listFilter.status)) return false;
      if (!q) return true;
      return [l.name, l.phone, l.email, l.enrollment, l.id].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var o = S.overview && S.overview.byLawyer || {};
    $('rows').innerHTML = ls.length ? '<table class="w-full min-w-[820px] text-sm"><thead><tr class="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--muted-2)]">' +
      '<th class="px-4 py-3">Advocate</th><th class="py-3 pr-4">Status</th><th class="py-3 pr-4">Plan</th><th class="py-3 pr-4">Paid until</th>' +
      '<th class="py-3 pr-4">Microsite</th><th class="py-3 pr-4">Views</th><th class="py-3 pr-4 text-right">Actions</th></tr></thead><tbody>' +
      ls.map(function (l) {
        var st = stateOf(l), li = l.listing || {}, b = o[l.id];
        var left = li.paidUntil ? daysUntil(li.paidUntil) : null;
        return '<tr class="border-b border-[var(--line-2)] last:border-0 align-top">' +
          '<td class="px-4 py-3"><a class="font-semibold underline" href="#/advocates/' + esc(l.id) + '">' + esc(l.name) + '</a>' +
          '<div class="text-xs text-[var(--muted)]">' + esc(catName(l.primaryCategory)) + ' · ' + esc(l.phone) +
          (isSample(l) ? ' ' + pill('sample', 'info') : '') + '</div></td>' +
          '<td class="py-3 pr-4">' + pill(st.label, st.tone) + '</td>' +
          '<td class="py-3 pr-4">' + esc(li.plan || '—') + '</td>' +
          '<td class="py-3 pr-4 tabular">' + esc(fmtDate(li.paidUntil)) +
            (left != null ? '<div class="text-xs text-[var(--muted)]">' + (left < 0 ? Math.abs(left) + ' days ago' : 'in ' + left + ' days') + '</div>' : '') + '</td>' +
          '<td class="py-3 pr-4">' + (l.microsite && l.microsite.enabled ? esc(l.microsite.slug) : '—') + '</td>' +
          '<td class="py-3 pr-4 tabular">' + (b ? b.view : '—') + '</td>' +
          '<td class="py-3 pr-4 text-right whitespace-nowrap">' +
            (S.readOnly ? '' :
              '<button type="button" class="btn btn-ghost px-3 py-1.5 text-xs" data-act="renew" data-id="' + esc(l.id) + '">Renew</button> ' +
              '<button type="button" class="btn btn-ghost px-3 py-1.5 text-xs" data-act="' + (st.key === 'down' ? 'reinstate' : 'takedown') + '" data-id="' + esc(l.id) + '">' +
                (st.key === 'down' ? 'Reinstate' : 'Take down') + '</button> ') +
            '<a class="btn btn-ghost px-3 py-1.5 text-xs" href="#/advocates/' + esc(l.id) + '">' + (S.readOnly ? 'View' : 'Edit') + '</a></td></tr>';
      }).join('') + '</tbody></table>'
      : '<p class="p-6 text-sm text-[var(--muted)]">No advocates match.</p>';
  }

  /* quick actions straight from the list */
  async function quick(act, id) {
    var l = byId(id); if (!l) return;
    try {
      var res;
      if (act === 'takedown') {
        res = await api('PUT', '/api/admin/lawyers/' + encodeURIComponent(id), { listing: { active: false } });
        saved(res.commit, l.name + ' taken down');
      } else if (act === 'reinstate') {
        res = await api('PUT', '/api/admin/lawyers/' + encodeURIComponent(id), { listing: { active: true } });
        saved(res.commit, l.name + ' reinstated');
      } else if (act === 'renew') {
        var months = (S.pricing.plans.filter(function (p) { return p.id === (l.listing && l.listing.plan); })[0] || {}).months || 12;
        var base = l.listing && l.listing.paidUntil && daysUntil(l.listing.paidUntil) > 0 ? l.listing.paidUntil : todayStr();
        var next = addMonths(base, months);
        var entered = w.prompt('Renew ' + l.name + '. New "paid until" date (YYYY-MM-DD):', next);
        if (!entered) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entered)) { toast('That is not a YYYY-MM-DD date.', 'bad'); return; }
        res = await api('PUT', '/api/admin/lawyers/' + encodeURIComponent(id), { listing: { paidUntil: entered, active: true } });
        saved(res.commit, l.name + ' renewed to ' + fmtDate(entered));
      }
      Object.assign(l, res.lawyer);
      route();
    } catch (e) { if (!e.silent) toast(problemsHtml(e), 'bad'); }
  }

  /* -------------------------------------------------------------- editor */
  function lines(v) { return (v || []).join('\n'); }
  function val(id) { var e = $(id); return e ? e.value : ''; }
  function chk(id) { var e = $(id); return !!(e && e.checked); }

  function field(id, label, value, opts) {
    opts = opts || {};
    var type = opts.type || 'text';
    return '<div' + (opts.span ? ' class="' + opts.span + '"' : '') + '><label class="' + LABEL + '" for="' + id + '">' + esc(label) + '</label>' +
      (opts.rows
        ? '<textarea id="' + id + '" rows="' + opts.rows + '" class="' + INPUT + '"' + (opts.dis ? ' disabled' : '') + '>' + esc(value) + '</textarea>'
        : '<input id="' + id + '" type="' + type + '" value="' + esc(value) + '" class="' + INPUT + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.dis ? ' disabled' : '') + '>') +
      (opts.help ? '<p class="mt-1 text-xs text-[var(--muted)]">' + opts.help + '</p>' : '') + '</div>';
  }

  function section(title, body, hint) {
    return '<section class="card p-5 sm:p-6"><h3 class="font-display text-lg font-bold text-[var(--ink)]">' + esc(title) + '</h3>' +
      (hint ? '<p class="mt-1 text-sm text-[var(--muted)]">' + hint + '</p>' : '') +
      '<div class="rule-gold mt-3 mb-4"></div><div class="grid gap-4 sm:grid-cols-2">' + body + '</div></section>';
  }

  function faqRow(f) {
    return '<div class="faq-row grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:col-span-2">' +
      '<input type="text" class="' + INPUT + ' faq-q" placeholder="Question" value="' + esc(f.q || '') + '">' +
      '<textarea rows="2" class="' + INPUT + ' faq-a" placeholder="Answer">' + esc(f.a || '') + '</textarea>' +
      '<button type="button" data-act="faq-del" class="btn btn-ghost justify-self-start px-3 py-1 text-xs">Remove</button></div>';
  }

  function renderEditor(id) {
    var isNew = id === 'new';
    var l = isNew ? null : byId(id);
    if (!isNew && !l) { view.innerHTML = '<p class="text-sm">No advocate with id <code>' + esc(id) + '</code>. <a class="underline" href="#/advocates">Back to the list</a>.</p>'; return; }
    var X = l || { name: '', photo: '', experienceYears: '', primaryCategory: '', categories: [], topics: [], topicsHi: [], about: '', aboutHi: '',
      highlights: [], highlightsHi: [], languages: ['Hindi', 'English'], courts: [], location: {}, consultationFee: '', feeNote: '', availability: '',
      phone: '', whatsapp: '', email: '', enrollment: '', education: [], verified: false, featured: false, featuredUntil: '',
      listing: { plan: 'none', paidUntil: '', active: true, onboardedOn: todayStr() },
      microsite: { enabled: false, slug: '', tagline: '', taglineHi: '', longAbout: '', longAboutHi: '', faqs: [], accent: 'gold' } };
    var li = X.listing || {}, ms = X.microsite || {}, lo = X.location || {};
    var ro = S.readOnly;
    var d_ = { dis: ro };

    var catBoxes = S.categories.map(function (c) {
      return '<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="cat" value="' + esc(c.slug) + '"' +
        ((X.categories || []).indexOf(c.slug) !== -1 ? ' checked' : '') + (ro ? ' disabled' : '') + '> ' + esc(c.name) + '</label>';
    }).join('');
    var primary = '<select id="f-primary" class="' + INPUT + '"' + (ro ? ' disabled' : '') + '><option value="">Choose…</option>' +
      S.categories.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (X.primaryCategory === c.slug ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>';
    var opt = function (arr, cur) { return arr.map(function (a) { return '<option value="' + esc(a[0]) + '"' + (cur === a[0] ? ' selected' : '') + '>' + esc(a[1]) + '</option>'; }).join(''); };

    var photoBlock = isNew
      ? '<p class="text-sm text-[var(--muted)] sm:col-span-2">Save the advocate first, then come back to add a photo.</p>'
      : '<div class="sm:col-span-2 flex flex-wrap items-center gap-4">' +
        '<img src="/' + esc(X.photo) + '" alt="" class="h-20 w-20 rounded-lg border border-[var(--line)] object-cover" onerror="this.style.visibility=\'hidden\'">' +
        '<div><label class="' + LABEL + '" for="f-photo">Upload a photo</label>' +
        '<input id="f-photo" type="file" accept="image/jpeg,image/png,image/webp"' + (ro ? ' disabled' : '') + '>' +
        '<p class="mt-1 text-xs text-[var(--muted)]">JPEG, PNG or WebP, up to 400 KB, ideally square. It is published at once.</p>' +
        '<button type="button" id="photo-go" data-act="photo" class="btn btn-ghost mt-2 px-3 py-1.5 text-xs"' + (ro ? ' disabled' : '') + '>Upload</button></div></div>';

    var host = ms.slug ? ms.slug + '.' + APEX : '';
    var danger = (isNew || ro) ? '' :
      '<section class="card border-l-4 border-[#c0392b] p-5 sm:p-6"><h3 class="font-display text-lg font-bold text-[#8a1f1f]">Remove this advocate</h3>' +
      '<p class="mt-1 text-sm text-[var(--muted)]">To hide them temporarily, use <strong>Take down</strong> on the list instead — it keeps the record. ' +
      'Removing deletes the record from the data (it stays in git history).</p>' +
      '<div class="mt-3 flex flex-wrap items-end gap-3"><div class="grow">' +
      '<label class="' + LABEL + '" for="del-confirm">Type <code>' + esc(X.id) + '</code> to confirm</label>' +
      '<input id="del-confirm" type="text" class="' + INPUT + '" autocomplete="off"></div>' +
      '<button type="button" data-act="delete" class="btn px-5 py-2.5 text-sm" style="background:#c0392b;color:#fff">Remove</button></div></section>';

    view.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-3"><div><a href="#/advocates" class="text-sm underline">← Advocates</a>' +
      '<h2 class="mt-1 font-display text-2xl font-bold text-[var(--ink)]">' + (isNew ? 'Add an advocate' : esc(X.name)) + '</h2></div>' +
      (isNew || !X.id ? '' : '<a class="btn btn-ghost px-4 py-2 text-sm" target="_blank" rel="noopener" href="/lawyer.html?id=' + esc(X.id) + '">Public profile ↗</a>') + '</div>' +
      '<div id="form-error" class="mt-4 hidden rounded-lg border border-[#e8b4b4] bg-[#fdf0f0] px-4 py-3 text-sm text-[#8a1f1f]"></div>' +
      '<form id="ed" class="mt-5 grid gap-6" data-id="' + esc(id) + '">' +

      section('Who', field('f-name', 'Name as enrolled', X.name, Object.assign({ ph: 'Adv. Full Name', span: 'sm:col-span-2', help: isNew ? 'The id and profile URL are made from this.' : '' }, d_)) +
        field('f-enrollment', 'Enrolment number', X.enrollment, Object.assign({ ph: 'UP/01234/2015' }, d_)) +
        field('f-exp', 'Years of experience', X.experienceYears, Object.assign({ type: 'number' }, d_)) +
        field('f-education', 'Education (one per line)', lines(X.education), Object.assign({ rows: 3, span: 'sm:col-span-2' }, d_)) +
        '<div class="sm:col-span-2 flex flex-wrap gap-6">' +
          '<label class="flex items-center gap-2 text-sm"><input id="f-verified" type="checkbox"' + (X.verified ? ' checked' : '') + (ro ? ' disabled' : '') + '> Enrolment verified</label></div>' +
        photoBlock) +

      section('Contact', field('f-phone', 'Phone (clients call this)', X.phone, Object.assign({ ph: '+919876543210', help: 'With country code, no spaces.' }, d_)) +
        field('f-whatsapp', 'WhatsApp', X.whatsapp, Object.assign({ ph: 'same as phone if blank' }, d_)) +
        field('f-email', 'Email', X.email, Object.assign({ type: 'email' }, d_)) +
        field('f-availability', 'Availability', X.availability, Object.assign({ ph: 'Mon-Sat, 10:00 AM - 7:00 PM' }, d_)) +
        field('f-area', 'Area', lo.area, Object.assign({ ph: 'Civil Lines' }, d_)) +
        field('f-areaHi', 'Area (Hindi)', lo.areaHi, d_) +
        field('f-address', 'Chamber address', lo.address, Object.assign({ span: 'sm:col-span-2' }, d_)) +
        field('f-fee', 'Consultation fee (₹)', X.consultationFee, Object.assign({ type: 'number' }, d_)) +
        field('f-feeNote', 'Fee note', X.feeNote, d_)) +

      section('Practice', '<div><label class="' + LABEL + '" for="f-primary">Main practice area</label>' + primary + '</div>' +
        '<div><span class="' + LABEL + '">All practice areas</span><div class="grid gap-1 sm:grid-cols-2">' + catBoxes + '</div></div>' +
        field('f-topics', 'Case types (one per line)', lines(X.topics), Object.assign({ rows: 5, help: 'Match the wording used on the site, e.g. "Bail & Anticipatory Bail".' }, d_)) +
        field('f-topicsHi', 'Case types in Hindi (same order)', lines(X.topicsHi), Object.assign({ rows: 5 }, d_)) +
        field('f-languages', 'Languages (one per line)', lines(X.languages), Object.assign({ rows: 3 }, d_)) +
        field('f-courts', 'Courts (one per line)', lines(X.courts), Object.assign({ rows: 3 }, d_))) +

      section('Profile text', field('f-about', 'About (short — shown in the directory)', X.about, Object.assign({ rows: 4, span: 'sm:col-span-2' }, d_)) +
        field('f-aboutHi', 'About, in Hindi', X.aboutHi, Object.assign({ rows: 4, span: 'sm:col-span-2' }, d_)) +
        field('f-highlights', 'Highlights (one per line)', lines(X.highlights), Object.assign({ rows: 3 }, d_)) +
        field('f-highlightsHi', 'Highlights in Hindi', lines(X.highlightsHi), Object.assign({ rows: 3 }, d_))) +

      section('Listing and billing',
        '<div><label class="' + LABEL + '" for="f-plan">Plan</label><select id="f-plan" class="' + INPUT + '"' + (ro ? ' disabled' : '') + '>' +
          opt([['none', 'None (unpaid)'], ['monthly', 'Monthly'], ['halfyearly', 'Six months'], ['yearly', 'Yearly']], li.plan || 'none') + '</select></div>' +
        field('f-paidUntil', 'Paid until', li.paidUntil || '', Object.assign({ type: 'date', help: 'The listing stops showing after this date.' }, d_)) +
        field('f-onboarded', 'Onboarded on', li.onboardedOn || '', Object.assign({ type: 'date' }, d_)) +
        '<div class="flex flex-col gap-2 pt-6 text-sm">' +
          '<label class="flex items-center gap-2"><input id="f-active" type="checkbox"' + (li.active !== false ? ' checked' : '') + (ro ? ' disabled' : '') + '> Listing is active (untick to take down)</label>' +
          '<label class="flex items-center gap-2"><input id="f-featured" type="checkbox"' + (X.featured ? ' checked' : '') + (ro ? ' disabled' : '') + '> Featured (max two per practice area)</label></div>' +
        field('f-featuredUntil', 'Featured until', X.featuredUntil || '', Object.assign({ type: 'date' }, d_)),
        'What they have paid for. This never appears on the public site.') +

      section('Microsite',
        '<label class="flex items-center gap-2 text-sm sm:col-span-2"><input id="m-enabled" type="checkbox"' + (ms.enabled ? ' checked' : '') + (ro ? ' disabled' : '') + '> Has a microsite</label>' +
        field('m-slug', 'Subdomain', ms.slug || '', Object.assign({ ph: 'neha', help: host ? 'Live address: <strong>' + esc(host) + '</strong>' : '3–30 letters, digits or hyphens. Becomes <em>slug</em>.' + APEX + '.' }, d_)) +
        '<div><label class="' + LABEL + '" for="m-accent">Accent colour</label><select id="m-accent" class="' + INPUT + '"' + (ro ? ' disabled' : '') + '>' +
          opt([['gold', 'Gold'], ['navy', 'Navy'], ['teal', 'Teal'], ['maroon', 'Maroon']], ms.accent || 'gold') + '</select></div>' +
        field('m-tagline', 'Tagline', ms.tagline || '', Object.assign({ span: 'sm:col-span-2' }, d_)) +
        field('m-taglineHi', 'Tagline in Hindi', ms.taglineHi || '', Object.assign({ span: 'sm:col-span-2' }, d_)) +
        field('m-longAbout', 'Long bio (their own words — must differ from the short About)', ms.longAbout || '', Object.assign({ rows: 8, span: 'sm:col-span-2' }, d_)) +
        field('m-longAboutHi', 'Long bio in Hindi', ms.longAboutHi || '', Object.assign({ rows: 8, span: 'sm:col-span-2' }, d_)) +
        '<div class="sm:col-span-2"><span class="' + LABEL + '">Questions and answers</span><div id="faqs" class="grid gap-3">' +
          (ms.faqs || []).map(faqRow).join('') + '</div>' +
          (ro ? '' : '<button type="button" data-act="faq-add" class="btn btn-ghost mt-3 px-3 py-1.5 text-xs">+ Add a question</button>') + '</div>',
        'Needs a subdomain added in Cloudflare once saved — see the <a class="underline" href="#/microsites">Microsites</a> tab.') +

      (ro ? '' : '<div class="flex flex-wrap items-center gap-3"><button type="submit" id="save" class="btn btn-primary px-7 py-3 text-sm">' +
        (isNew ? 'Add advocate' : 'Save changes') + '</button><a href="#/advocates" class="btn btn-ghost px-5 py-3 text-sm">Cancel</a>' +
        '<span class="text-xs text-[var(--muted)]">Saving commits to git; the site rebuilds in about two minutes.</span></div>') +
      '</form>' + danger;
  }

  function readForm() {
    var cats = Array.prototype.map.call(d.querySelectorAll('#ed .cat:checked'), function (c) { return c.value; });
    var split = function (id) { return val(id).split('\n').map(function (s) { return s.trim(); }).filter(Boolean); };
    var faqs = Array.prototype.map.call(d.querySelectorAll('#ed .faq-row'), function (r) {
      return { q: r.querySelector('.faq-q').value.trim(), a: r.querySelector('.faq-a').value.trim() };
    }).filter(function (f) { return f.q || f.a; });
    return {
      name: val('f-name').trim(), enrollment: val('f-enrollment').trim(), experienceYears: val('f-exp') === '' ? 0 : Number(val('f-exp')),
      education: split('f-education'), verified: chk('f-verified'),
      phone: val('f-phone').trim(), whatsapp: val('f-whatsapp').trim(), email: val('f-email').trim(), availability: val('f-availability').trim(),
      location: { area: val('f-area').trim(), areaHi: val('f-areaHi').trim(), address: val('f-address').trim() },
      consultationFee: val('f-fee') === '' ? null : Number(val('f-fee')), feeNote: val('f-feeNote').trim(),
      primaryCategory: val('f-primary'), categories: cats,
      topics: split('f-topics'), topicsHi: split('f-topicsHi'), languages: split('f-languages'), courts: split('f-courts'),
      about: val('f-about').trim(), aboutHi: val('f-aboutHi').trim(), highlights: split('f-highlights'), highlightsHi: split('f-highlightsHi'),
      featured: chk('f-featured'), featuredUntil: val('f-featuredUntil') || null,
      listing: { plan: val('f-plan'), paidUntil: val('f-paidUntil') || null, onboardedOn: val('f-onboarded') || null, active: chk('f-active') },
      microsite: {
        enabled: chk('m-enabled'), slug: val('m-slug').trim().toLowerCase() || null, accent: val('m-accent'),
        tagline: val('m-tagline').trim() || null, taglineHi: val('m-taglineHi').trim() || null,
        longAbout: val('m-longAbout').trim() || null, longAboutHi: val('m-longAboutHi').trim() || null, faqs: faqs
      }
    };
  }

  /* only send what changed, so the commit message says what you did.
     "", null and a missing value all mean "nothing here". */
  function norm(v) { return JSON.stringify(v, function (k, x) { return x === '' || x === undefined ? null : x; }); }
  function changedOnly(before, after) {
    var out = {};
    Object.keys(after).forEach(function (k) {
      var a = after[k], b = before[k];
      if (norm(a) === norm(b)) return;
      if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object') {
        var sub = {};
        Object.keys(a).forEach(function (s) { if (norm(a[s]) !== norm(b[s])) sub[s] = a[s]; });
        if (Object.keys(sub).length) out[k] = sub;
      } else out[k] = a;
    });
    return out;
  }

  async function saveForm(ev) {
    ev.preventDefault();
    var form = $('ed'), id = form.getAttribute('data-id'), vals = readForm();
    var err = $('form-error'); err.classList.add('hidden');
    var btn = $('save'); btn.disabled = true; var label = btn.textContent; btn.textContent = 'Saving…';
    try {
      var res;
      if (id === 'new') {
        res = await api('POST', '/api/admin/lawyers', vals);
        S.lawyers.push(res.lawyer);
        saved(res.commit, res.lawyer.name + ' added');
      } else {
        var before = byId(id), patch = changedOnly(before, vals);
        if (!Object.keys(patch).length) { toast('Nothing has changed.'); btn.disabled = false; btn.textContent = label; return; }
        res = await api('PUT', '/api/admin/lawyers/' + encodeURIComponent(id), patch);
        Object.assign(before, res.lawyer);
        saved(res.commit, res.lawyer.name + ' updated');
      }
      w.location.hash = '#/advocates';
    } catch (e) {
      if (e.silent) return;
      err.innerHTML = problemsHtml(e); err.classList.remove('hidden'); err.scrollIntoView({ block: 'center' });
      btn.disabled = false; btn.textContent = label;
    }
  }

  async function uploadPhoto() {
    var id = $('ed').getAttribute('data-id'), f = $('f-photo').files[0];
    if (!f) { toast('Choose a photo first.', 'bad'); return; }
    if (f.size > 400 * 1024) { toast('That photo is ' + Math.round(f.size / 1024) + ' KB; the limit is 400 KB. Resize it and try again.', 'bad'); return; }
    var data = await new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = no; r.readAsDataURL(f);
    });
    try {
      $('photo-go').disabled = true;
      var res = await api('POST', '/api/admin/photo', { id: id, data: data });
      Object.assign(byId(id), res.lawyer);
      saved(res.commit, 'Photo uploaded');
      renderEditor(id);
    } catch (e) { if (!e.silent) toast(problemsHtml(e), 'bad'); $('photo-go').disabled = false; }
  }

  async function removeAdvocate() {
    var form = $('ed'), id = form.getAttribute('data-id');
    if (val('del-confirm').trim() !== id) { toast('Type the id exactly to confirm.', 'bad'); return; }
    try {
      var res = await api('DELETE', '/api/admin/lawyers/' + encodeURIComponent(id), { confirm: id });
      S.lawyers = S.lawyers.filter(function (l) { return l.id !== id; });
      saved(res.commit, res.removed + ' removed');
      w.location.hash = '#/advocates';
    } catch (e) { if (!e.silent) toast(problemsHtml(e), 'bad'); }
  }

  /* ----------------------------------------------------------- microsites */
  function renderMicrosites() {
    var rows = S.lawyers.filter(function (l) { return l.microsite && (l.microsite.enabled || l.microsite.slug); })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var without = S.lawyers.filter(function (l) { return !(l.microsite && l.microsite.enabled); }).length;
    var cf = S.status && S.status.cloudflare;

    view.innerHTML =
      '<h2 class="font-display text-2xl font-bold text-[var(--ink)]">Microsites</h2>' +
      '<p class="mt-1 text-sm text-[var(--muted)]">Each paying advocate gets <em>name</em>.' + APEX + '. Enable it in the advocate\'s editor, then attach the address here. ' +
      (cf ? 'Cloudflare is connected, so <strong>Attach</strong> does it for you.' :
        'Cloudflare is not connected, so attach each address by hand: Pages project → Custom domains → Set up a custom domain.') + '</p>' +
      '<div class="card mt-5 overflow-x-auto">' + (rows.length ? '<table class="w-full min-w-[760px] text-sm"><thead><tr class="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--muted-2)]">' +
        '<th class="px-4 py-3">Advocate</th><th class="py-3 pr-4">Address</th><th class="py-3 pr-4">State</th><th class="py-3 pr-4">Domain</th><th class="py-3 pr-4 text-right">Actions</th></tr></thead><tbody>' +
        rows.map(function (l) {
          var ms = l.microsite, st = stateOf(l), sample = isSample(l), host = ms.slug ? ms.slug + '.' + APEX : '';
          return '<tr class="border-b border-[var(--line-2)] last:border-0 align-top">' +
            '<td class="px-4 py-3"><a class="font-semibold underline" href="#/advocates/' + esc(l.id) + '">' + esc(l.name) + '</a>' +
              (sample ? '<div class="mt-0.5">' + pill('sample — never attach a domain', 'info') + '</div>' : '') + '</td>' +
            '<td class="py-3 pr-4">' + (host ? esc(host) : '—') + '</td>' +
            '<td class="py-3 pr-4">' + (ms.enabled ? pill(st.label, st.tone) : pill('Not enabled', 'mute')) + '</td>' +
            '<td class="py-3 pr-4" id="dom-' + esc(l.id) + '">' + (sample ? '—' : '<span class="text-[var(--muted)]">not checked</span>') + '</td>' +
            '<td class="py-3 pr-4 text-right whitespace-nowrap">' +
              (ms.slug && ms.enabled ? '<a class="btn btn-ghost px-3 py-1.5 text-xs" target="_blank" rel="noopener" href="/sites/' + esc(ms.slug) + '/">Preview</a> ' : '') +
              (!sample && ms.enabled && ms.slug && cf ? '<button type="button" class="btn btn-ghost px-3 py-1.5 text-xs" data-act="dom-check" data-slug="' + esc(ms.slug) + '" data-id="' + esc(l.id) + '">Check</button> ' +
                '<button type="button" class="btn btn-primary px-3 py-1.5 text-xs" data-act="dom-attach" data-slug="' + esc(ms.slug) + '" data-id="' + esc(l.id) + '">Attach</button>' : '') +
              (!sample && ms.enabled && ms.slug && !cf && st.key !== 'down' && st.key !== 'expired' ? '<a class="btn btn-ghost px-3 py-1.5 text-xs" target="_blank" rel="noopener" href="https://' + esc(host) + '/">Open ↗</a>' : '') +
            '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="p-6 text-sm text-[var(--muted)]">No advocate has a microsite yet.</p>') + '</div>' +
      '<p class="mt-3 text-sm text-[var(--muted)]">' + without + ' advocates have no microsite. Open one and tick <em>Has a microsite</em> in the editor to add it.</p>';
  }

  async function domainAct(act, slug, id) {
    var cell = $('dom-' + id);
    cell.innerHTML = '<span class="text-[var(--muted)]">working…</span>';
    try {
      if (act === 'dom-check') {
        var r = await api('GET', '/api/admin/domains?slug=' + encodeURIComponent(slug));
        cell.innerHTML = r.attached ? pill('Attached — ' + (r.status || 'active'), r.status === 'active' ? 'ok' : 'warn') : pill('Not attached', 'mute');
      } else {
        var a = await api('POST', '/api/admin/domains', { slug: slug });
        cell.innerHTML = pill('Attached', 'ok') + ' <a class="underline text-xs" target="_blank" rel="noopener" href="' + esc(a.url) + '">open</a>';
        toast('<strong>' + esc(a.host) + '</strong> is attached. The certificate is issued automatically and usually works within a couple of minutes.');
      }
    } catch (e) {
      if (e.silent) return;
      cell.innerHTML = pill('Failed', 'bad');
      toast(problemsHtml(e), 'bad');
    }
  }

  /* ------------------------------------------------------------ activity */
  async function renderActivity() {
    view.innerHTML = '<h2 class="font-display text-2xl font-bold text-[var(--ink)]">Activity</h2><p class="mt-2 text-sm text-[var(--muted)]">Loading…</p>';
    try {
      var j = await api('GET', '/api/admin/activity');
      view.innerHTML = '<h2 class="font-display text-2xl font-bold text-[var(--ink)]">Activity</h2>' +
        '<p class="mt-1 text-sm text-[var(--muted)]">Every change to the advocate data is a commit. To undo one, revert that commit in GitHub.</p>' +
        '<div class="card mt-5 p-2">' + (j.commits.length ? '<ul>' + j.commits.map(function (c) {
          return '<li class="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--line-2)] px-3 py-2.5 text-sm last:border-0">' +
            '<span>' + esc(c.message) + '</span><span class="text-xs text-[var(--muted)]">' + esc(c.at ? new Date(c.at).toLocaleString('en-IN') : '') +
            ' · <a class="underline" target="_blank" rel="noopener" href="' + esc(c.url) + '">' + esc(c.short) + '</a></span></li>';
        }).join('') + '</ul>' : '<p class="p-4 text-sm text-[var(--muted)]">No changes yet.</p>') + '</div>';
    } catch (e) {
      if (e.silent) return;
      view.innerHTML = '<h2 class="font-display text-2xl font-bold text-[var(--ink)]">Activity</h2><p class="mt-2 text-sm">' + esc(e.message) + '</p>';
    }
  }

  /* -------------------------------------------------------------- routing */
  async function route() {
    var h = (w.location.hash || '#/').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean), page = parts[0] || 'overview';
    d.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-nav') === (page === 'overview' ? 'overview' : page));
    });
    try {
      if (page === 'overview') { if (!S.overview) await loadOverview(); renderOverview(); }
      else if (page === 'advocates' && parts[1]) renderEditor(decodeURIComponent(parts[1]));
      else if (page === 'advocates') { if (!S.overview) await loadOverview().catch(function () {}); renderAdvocates(); }
      else if (page === 'microsites') renderMicrosites();
      else if (page === 'activity') await renderActivity();
      else { w.location.hash = '#/'; }
    } catch (e) {
      if (!e.silent) view.innerHTML = '<p class="card p-5 text-sm">' + esc(e.message) + '</p>';
    }
  }

  /* ---------------------------------------------------------------- wiring */
  view.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act],[data-period],[data-status]');
    if (!t) return;
    if (t.hasAttribute('data-period')) { S.period = t.getAttribute('data-period'); S.overview = null; route(); return; }
    if (t.hasAttribute('data-status')) { listFilter.status = t.getAttribute('data-status'); renderAdvocates(); return; }
    var act = t.getAttribute('data-act');
    if (act === 'renew' || act === 'takedown' || act === 'reinstate') quick(act, t.getAttribute('data-id'));
    else if (act === 'faq-add') { $('faqs').insertAdjacentHTML('beforeend', faqRow({})); }
    else if (act === 'faq-del') t.closest('.faq-row').remove();
    else if (act === 'photo') uploadPhoto();
    else if (act === 'delete') removeAdvocate();
    else if (act === 'dom-check' || act === 'dom-attach') domainAct(act, t.getAttribute('data-slug'), t.getAttribute('data-id'));
  });
  view.addEventListener('input', function (ev) {
    if (ev.target.id === 'q') { listFilter.q = ev.target.value; paintRows(); }
  });
  view.addEventListener('submit', function (ev) { if (ev.target.id === 'ed') saveForm(ev); });
  w.addEventListener('hashchange', route);

  async function start() {
    try {
      var who = await fetch('/api/login', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); });
      if (!who.authenticated) { showLogin(); return; }
      hideLogin();
      await loadData();
      route();
    } catch (e) { if (!e.silent) { showLogin(); $('login-status').textContent = e.message; } }
  }

  start();
})(window, document);
