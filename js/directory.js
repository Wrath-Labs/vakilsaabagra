/* ============================================================================
   Advocate directory: keyword search, faceted filters, sorting and paging.
   Every filter is mirrored into the URL so results can be shared, bookmarked
   and indexed.
   ========================================================================= */
(function (w, d) {
  'use strict';
  var e = VS.escape;
  var PAGE = 9;

  var state = {
    q: '', categories: [], area: '', language: '',
    minExp: 0, maxFee: 0, sort: 'relevance', page: 1
  };

  var db = null;
  var el = {};

  /* --------------------------------------------------------------- URL IO */
  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.categories = (p.get('category') || '').split(',').filter(Boolean);
    state.area = p.get('area') || '';
    state.language = p.get('lang') || '';
    state.minExp = +(p.get('exp') || 0);
    state.maxFee = +(p.get('fee') || 0);
    state.sort = p.get('sort') || 'relevance';
    state.page = Math.max(1, +(p.get('page') || 1));
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.categories.length) p.set('category', state.categories.join(','));
    if (state.area) p.set('area', state.area);
    if (state.language) p.set('lang', state.language);
    if (state.minExp) p.set('exp', state.minExp);
    if (state.maxFee) p.set('fee', state.maxFee);
    if (state.sort !== 'relevance') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', state.page);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  /* -------------------------------------------------------------- filter */
  function apply() {
    return db.lawyers.filter(function (l) {
      if (!VS.matches(l, state.q)) return false;
      if (state.categories.length &&
          !state.categories.some(function (c) { return l.categories.indexOf(c) !== -1; })) return false;
      if (state.area && l.area !== state.area) return false;
      if (state.language && (l.languages || []).indexOf(state.language) === -1) return false;
      if (state.minExp && l.experienceYears < state.minExp) return false;
      if (state.maxFee && l.consultationFee > state.maxFee) return false;
      return true;
    });
  }

  /* ---------------------------------------------------------------- chips */
  function activeChips() {
    var out = [];
    if (state.q) out.push(['q', '“' + state.q + '”']);
    state.categories.forEach(function (c) {
      out.push(['category:' + c, db.byCategory[c] ? db.byCategory[c].name : c]);
    });
    if (state.area) out.push(['area', state.area]);
    if (state.language) out.push(['lang', state.language]);
    if (state.minExp) out.push(['exp', state.minExp + '+ years']);
    if (state.maxFee) out.push(['fee', 'Under ' + VS.money(state.maxFee)]);

    el.active.innerHTML = out.length
      ? out.map(function (pair) {
          return '<button type="button" data-clear="' + e(pair[0]) + '" ' +
                 'class="chip is-active gap-1.5 pr-2 hover:opacity-85">' + e(pair[1]) +
                 '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" ' +
                 'stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
        }).join('') +
        '<button type="button" data-clear="all" class="chip border-transparent text-[var(--gold)] underline underline-offset-2 hover:bg-transparent">Clear all</button>'
      : '';
    el.active.classList.toggle('hidden', !out.length);
  }

  /* --------------------------------------------------------------- render */
  function render(scrollToTop) {
    var results = VS.sort(apply(), state.sort);
    var total = results.length;
    var pages = Math.max(1, Math.ceil(total / PAGE));
    if (state.page > pages) state.page = pages;
    var slice = results.slice(0, state.page * PAGE);

    el.count.innerHTML = total
      ? '<strong class="font-semibold text-[var(--ink)]">' + total + '</strong> advocate' + (total === 1 ? '' : 's') +
        ' in Agra' + (state.categories.length === 1 ? ' for ' + e(db.byCategory[state.categories[0]].name) : '')
      : 'No advocates matched';

    el.grid.innerHTML = slice.map(function (l) { return VS.lawyerCard(l); }).join('');
    VS.stagger(el.grid, 55);
    VS.reveal(el.grid);

    el.empty.classList.toggle('hidden', total !== 0);
    el.more.classList.toggle('hidden', slice.length >= total);
    el.moreCount.textContent = Math.min(PAGE, total - slice.length);

    activeChips();
    syncControls();
    writeUrl();
    updateHeadings(total);

    if (scrollToTop && el.grid.getBoundingClientRect().top < 0) {
      el.grid.scrollIntoView({ behavior: VS.reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* SEO: keep the H1, <title> and meta description honest about the filter */
  function updateHeadings(total) {
    var h1 = d.getElementById('dir-title');
    var lede = d.getElementById('dir-lede');
    var cat = state.categories.length === 1 ? db.byCategory[state.categories[0]] : null;

    var heading = cat ? cat.name + ' Lawyers in Agra' : 'Lawyers &amp; Advocates in Agra';
    if (state.area && !cat) heading = 'Lawyers in ' + e(state.area) + ', Agra';
    if (h1) h1.innerHTML = heading;

    var desc = cat
      ? cat.blurb + ' Compare ' + total + ' verified ' + cat.name.toLowerCase() + ' advocates in Agra by experience, fees and location.'
      : 'Compare ' + total + ' verified advocates across Agra by practice area, experience, consultation fee and locality.';
    if (lede) lede.textContent = desc;

    d.title = (cat ? cat.name + ' Lawyers in Agra' : 'Lawyers in Agra') +
              ' — Verified Advocates | Vakil Saab Agra';
    var m = d.querySelector('meta[name="description"]');
    if (m) m.setAttribute('content', desc.slice(0, 158));
  }

  /* ------------------------------------------------------------- controls */
  function buildControls() {
    el.cats.innerHTML = db.categories.map(function (c) {
      return '<button type="button" role="checkbox" aria-checked="false" data-cat="' + e(c.slug) + '" ' +
             'class="chip w-full justify-between text-left">' +
               '<span class="truncate">' + e(c.name) + '</span>' +
               '<span class="tabular shrink-0 text-[11px] opacity-60">' + c.count + '</span>' +
             '</button>';
    }).join('');

    el.area.innerHTML = '<option value="">All areas of Agra</option>' +
      db.areas.map(function (a) { return '<option value="' + e(a) + '">' + e(a) + '</option>'; }).join('');

    el.lang.innerHTML = '<option value="">Any language</option>' +
      db.languages.map(function (l) { return '<option value="' + e(l) + '">' + e(l) + '</option>'; }).join('');
  }

  function syncControls() {
    el.q.value = state.q;
    el.cats.querySelectorAll('[data-cat]').forEach(function (b) {
      var on = state.categories.indexOf(b.dataset.cat) !== -1;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    el.area.value = state.area;
    el.lang.value = state.language;
    el.exp.value = state.minExp;
    el.expOut.textContent = state.minExp ? state.minExp + '+ years' : 'Any experience';
    el.fee.value = state.maxFee;
    el.sort.value = state.sort;
  }

  function bind() {
    var t;
    el.q.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { state.q = el.q.value.trim(); state.page = 1; render(); }, 220);
    });
    el.form.addEventListener('submit', function (ev) { ev.preventDefault(); state.q = el.q.value.trim(); state.page = 1; render(true); });

    el.cats.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cat]');
      if (!b) return;
      var slug = b.dataset.cat;
      var i = state.categories.indexOf(slug);
      i === -1 ? state.categories.push(slug) : state.categories.splice(i, 1);
      state.page = 1; render();
    });

    el.area.addEventListener('change', function () { state.area = el.area.value; state.page = 1; render(); });
    el.lang.addEventListener('change', function () { state.language = el.lang.value; state.page = 1; render(); });
    el.fee.addEventListener('change', function () { state.maxFee = +el.fee.value; state.page = 1; render(); });
    el.sort.addEventListener('change', function () { state.sort = el.sort.value; state.page = 1; render(); });

    el.exp.addEventListener('input', function () {
      state.minExp = +el.exp.value;
      el.expOut.textContent = state.minExp ? state.minExp + '+ years' : 'Any experience';
    });
    el.exp.addEventListener('change', function () { state.page = 1; render(); });

    el.active.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-clear]');
      if (!b) return;
      var key = b.dataset.clear;
      if (key === 'all') {
        state = { q: '', categories: [], area: '', language: '', minExp: 0, maxFee: 0, sort: state.sort, page: 1 };
      } else if (key.indexOf('category:') === 0) {
        state.categories = state.categories.filter(function (c) { return c !== key.slice(9); });
      } else if (key === 'q') { state.q = ''; }
      else if (key === 'area') { state.area = ''; }
      else if (key === 'lang') { state.language = ''; }
      else if (key === 'exp') { state.minExp = 0; }
      else if (key === 'fee') { state.maxFee = 0; }
      state.page = 1; render();
    });

    el.more.addEventListener('click', function () { state.page++; render(); });

    var reset = d.getElementById('reset-filters');
    if (reset) reset.addEventListener('click', function () {
      state = { q: '', categories: [], area: '', language: '', minExp: 0, maxFee: 0, sort: 'relevance', page: 1 };
      render(true);
    });

    /* mobile filter drawer */
    var panel = d.getElementById('filter-panel');
    var openBtn = d.getElementById('filters-open');
    if (panel && openBtn) {
      var toggle = function (on) {
        panel.classList.toggle('hidden', !on);
        panel.classList.toggle('flex', on);
        d.body.classList.toggle('is-locked', on);
      };
      openBtn.addEventListener('click', function () { toggle(true); });
      panel.querySelectorAll('[data-close-filters]').forEach(function (b) {
        b.addEventListener('click', function () { toggle(false); });
      });
      d.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && !panel.classList.contains('hidden')) toggle(false);
      });
    }
  }

  /* ------------------------------------------------------- structured data */
  function seo() {
    var C = w.VS_CONFIG;
    VS.jsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Lawyers and Advocates in Agra',
      url: C.url + '/lawyers.html',
      isPartOf: { '@id': C.url + '/#website' },
      about: { '@type': 'City', name: 'Agra' },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: C.url + '/' },
          { '@type': 'ListItem', position: 2, name: 'Lawyers in Agra', item: C.url + '/lawyers.html' }
        ]
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: db.lawyers.length,
        itemListElement: db.lawyers.map(function (l, i) {
          return {
            '@type': 'ListItem', position: i + 1,
            item: {
              '@type': 'Attorney',
              name: l.name,
              url: C.url + '/lawyer.html?id=' + l.id,
              image: C.url + '/' + l.photo,
              telephone: l.phone,
              knowsAbout: l.topics,
              areaServed: { '@type': 'City', name: 'Agra' },
              address: { '@type': 'PostalAddress', addressLocality: 'Agra', addressRegion: 'Uttar Pradesh', addressCountry: 'IN' }
            }
          };
        })
      }
    });
  }

  /* ----------------------------------------------------------------- boot */
  VS.load().then(function (data) {
    db = data;
    el = {
      form: d.getElementById('dir-search-form'),
      q: d.getElementById('dir-q'),
      cats: d.getElementById('filter-categories'),
      area: d.getElementById('filter-area'),
      lang: d.getElementById('filter-language'),
      exp: d.getElementById('filter-exp'),
      expOut: d.getElementById('filter-exp-out'),
      fee: d.getElementById('filter-fee'),
      sort: d.getElementById('dir-sort'),
      grid: d.getElementById('results-grid'),
      count: d.getElementById('result-count'),
      active: d.getElementById('active-filters'),
      empty: d.getElementById('empty-state'),
      more: d.getElementById('load-more'),
      moreCount: d.getElementById('load-more-count')
    };
    readUrl();
    buildControls();
    bind();
    render();
    seo();
  }).catch(function (err) {
    console.error('[Vakil Saab Agra] data load failed:', err);
    var g = d.getElementById('results-grid');
    if (g) g.innerHTML = '<p class="col-span-full rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-8 text-center text-[var(--muted)]">' +
      'Listings could not be loaded. Please refresh the page.</p>';
  });
})(window, document);
