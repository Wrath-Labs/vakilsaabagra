/* ============================================================================
   Home page: practice-area grid, featured advocates, live stats and the
   hero search box with suggestions.
   ========================================================================= */
(function (w, d) {
  'use strict';
  var e = VS.escape;

  function T(key, english) {
    return w.VS && w.VS.i18n ? w.VS.i18n.t(key, english) : english;
  }
  function P(obj, field) {
    return w.VS && w.VS.i18n ? w.VS.i18n.pick(obj, field) : obj[field];
  }

  var ICONS = {
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6z"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.1A4 4 0 0112 8a4 4 0 017 2.9C19 15.6 12 20 12 20z"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/>',
    scale: '<path d="M12 4v16M6 20h12M4 9h16M4 9l-2.5 5a3 3 0 005 0zM20 9l-2.5 5a3 3 0 005 0z"/>',
    receipt: '<path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21zM9 8h6M9 12h6"/>',
    briefcase: '<path d="M3 8h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1zM9 8V6a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>',
    cart: '<path d="M3 4h2l2.4 11.3a1 1 0 001 .7h8.5a1 1 0 001-.8L20 8H6"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.2a3.2 3.2 0 010 6M18 20a6 6 0 00-2-4.4"/>',
    car: '<path d="M4 16v3M20 16v3M3 16h18v-3.5L19 8H5l-2 4.5z"/><circle cx="7.5" cy="16" r="1.4"/><circle cx="16.5" cy="16" r="1.4"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
    calculator: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h4"/>',
    file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'
  };

  /* set by searchBox() once it has built its pool */
  var refillSuggestions = null;

  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
           'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           (ICONS[name] || ICONS.scale) + '</svg>';
  }

  function categoryCard(c) {
    return '' +
    '<a href="lawyers.html?category=' + e(c.slug) + '" data-reveal ' +
       'class="card card-hover group flex flex-col p-5 sm:p-6">' +
      '<span class="mb-4 inline-grid h-12 w-12 place-items-center rounded-xl bg-[var(--paper-3)] text-[var(--ink)] ' +
            'transition-all duration-500 group-hover:bg-[var(--ink)] group-hover:text-[var(--gold-2)] group-hover:rotate-[-6deg]">' +
        icon(c.icon) + '</span>' +
      '<h3 class="font-display text-lg font-bold text-[var(--ink)]">' + e(P(c, 'name')) + '</h3>' +
      '<p class="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)] pretty">' + e(P(c, 'blurb')) + '</p>' +
      '<span class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--gold)]">' +
        c.count + ' ' + (c.count === 1
          ? T('js.home.advocate', 'advocate')
          : T('js.home.advocates', 'advocates')) +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" ' +
             'class="transition-transform duration-300 group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
      '</span>' +
    '</a>';
  }

  /* ------------------------------------------------------------- search */
  function searchBox(db) {
    var form = d.getElementById('hero-search');
    if (!form) return;
    var input = form.querySelector('input[name="q"]');
    var list = d.getElementById('search-suggest');

    var pool = [];

    /* Rebuilt on a language switch: the labels people see follow the language,
       while the query behind each suggestion stays English so it still matches
       the search index. */
    function fill() {
    pool.length = 0;
    var kinds = {
      area: T('js.home.kindPracticeArea', 'Practice area'),
      issue: T('js.home.kindLegalIssue', 'Legal issue'),
      locality: T('js.home.kindArea', 'Area'),
      advocate: T('js.home.kindAdvocate', 'Advocate')
    };
    db.categories.forEach(function (c) {
      pool.push({ label: P(c, 'name'), kind: kinds.area, href: 'lawyers.html?category=' + c.slug });
      /* the English topic drives the query so the search still matches, but the
         label follows the language being read */
      c.topics.forEach(function (t, i) {
        var hi = (c.topicsHi || [])[i];
        pool.push({
          label: (w.VS.i18n && w.VS.i18n.isHindi() && hi) ? hi : t,
          kind: kinds.issue,
          href: 'lawyers.html?q=' + encodeURIComponent(t)
        });
      });
    });
    db.areas.forEach(function (a) {
      pool.push({ label: a + ', Agra', kind: kinds.locality, href: 'lawyers.html?area=' + encodeURIComponent(a) });
    });
    db.lawyers.forEach(function (l) {
      pool.push({ label: l.name, kind: kinds.advocate, href: 'lawyer.html?id=' + l.id });
    });
    }
    fill();
    refillSuggestions = fill;

    var active = -1;
    var shown = [];

    function close() { list.classList.add('hidden'); active = -1; input.setAttribute('aria-expanded', 'false'); }

    function render(q) {
      var needle = q.trim().toLowerCase();
      if (needle.length < 2) return close();
      shown = pool.filter(function (p) { return p.label.toLowerCase().indexOf(needle) !== -1; }).slice(0, 7);
      if (!shown.length) return close();

      list.innerHTML = shown.map(function (s, i) {
        return '<li role="option" aria-selected="false" data-i="' + i + '" ' +
               'class="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--paper-2)]">' +
                 '<span class="truncate font-medium text-[var(--ink)]">' + e(s.label) + '</span>' +
                 '<span class="shrink-0 text-[11px] uppercase tracking-wide text-[var(--muted-2)]">' + e(s.kind) + '</span>' +
               '</li>';
      }).join('');
      list.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
    }

    function highlight(i) {
      Array.prototype.forEach.call(list.children, function (li, n) {
        var on = n === i;
        li.classList.toggle('bg-[var(--paper-2)]', on);
        li.setAttribute('aria-selected', String(on));
      });
    }

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('focus', function () { if (input.value.length >= 2) render(input.value); });

    input.addEventListener('keydown', function (ev) {
      if (list.classList.contains('hidden')) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); active = (active + 1) % shown.length; highlight(active); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = (active - 1 + shown.length) % shown.length; highlight(active); }
      else if (ev.key === 'Enter' && active > -1) { ev.preventDefault(); location.href = shown[active].href; }
      else if (ev.key === 'Escape') close();
    });

    list.addEventListener('mousedown', function (ev) {
      var li = ev.target.closest('li[data-i]');
      if (li) location.href = shown[+li.dataset.i].href;
    });

    d.addEventListener('click', function (ev) { if (!form.contains(ev.target)) close(); });
  }

  /* ------------------------------------------------------- structured data */
  function seo(db) {
    var C = w.VS_CONFIG;
    VS.jsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['LegalService', 'LocalBusiness'],
          '@id': C.url + '/#organization',
          name: C.name,
          url: C.url,
          logo: C.url + '/assets/logo.png',
          image: C.url + '/assets/og-image.png',
          description: 'Directory of verified advocates and lawyers in Agra, Uttar Pradesh across criminal, family, property, civil, cheque bounce, consumer and corporate law.',
          telephone: C.phone,
          email: C.email,
          priceRange: '₹₹',
          address: {
            '@type': 'PostalAddress',
            streetAddress: C.address.street,
            addressLocality: C.address.locality,
            addressRegion: C.address.region,
            postalCode: C.address.postalCode,
            addressCountry: C.address.country
          },
          geo: { '@type': 'GeoCoordinates', latitude: C.geo.lat, longitude: C.geo.lng },
          areaServed: { '@type': 'City', name: 'Agra', containedInPlace: { '@type': 'State', name: 'Uttar Pradesh' } },
          openingHours: 'Mo-Sa 10:00-19:00',
          /* only profiles that actually exist — an empty or placeholder sameAs
             is a false claim about who we are, in machine-readable form */
          sameAs: (function () {
            var out = Object.keys(C.social)
              .map(function (k) { return C.social[k]; })
              .filter(function (v) { return v && v.indexOf('http') === 0; });
            return out.length ? out : undefined;
          })()
        },
        {
          '@type': 'WebSite',
          '@id': C.url + '/#website',
          url: C.url,
          name: C.name,
          publisher: { '@id': C.url + '/#organization' },
          inLanguage: 'en-IN',
          potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: C.url + '/lawyers.html?q={search_term_string}' },
            'query-input': 'required name=search_term_string'
          }
        },
        {
          '@type': 'ItemList',
          '@id': C.url + '/#featured-advocates',
          name: 'Featured advocates in Agra',
          numberOfItems: db.lawyers.filter(function (l) { return l.featured; }).length,
          itemListElement: db.lawyers.filter(function (l) { return l.featured; }).map(function (l, i) {
            return {
              '@type': 'ListItem',
              position: i + 1,
              url: C.url + '/lawyer.html?id=' + l.id,
              name: l.name
            };
          })
        }
      ]
    });
  }

  /* --------------------------------------------------------------- render */
  function grids(db) {
    var cats = d.getElementById('category-grid');
    if (cats) {
      cats.innerHTML = db.categories.map(categoryCard).join('');
      VS.stagger(cats, 55);
    }

    var feat = d.getElementById('featured-grid');
    if (feat) {
      var top = VS.sort(db.lawyers.filter(function (l) { return l.featured; }), 'relevance').slice(0, 6);
      feat.innerHTML = top.map(function (l) { return VS.lawyerCard(l); }).join('');
      VS.stagger(feat, 80);
    }
  }

  VS.load().then(function (db) {
    grids(db);

    /* stats read straight from the data so they can never go stale */
    var totalTopics = new Set(db.categories.flatMap(function (c) { return c.topics; })).size;
    var maxExp = Math.max.apply(null, db.lawyers.map(function (l) { return l.experienceYears; }));
    var set = function (id, v) { var n = d.getElementById(id); if (n) n.dataset.count = v; };
    set('stat-lawyers', db.lawyers.length);
    set('stat-areas', db.categories.length);
    set('stat-topics', totalTopics);
    set('stat-exp', maxExp);

    searchBox(db);
    seo(db);
    VS.reveal();

    /* the practice-area cards and the featured advocates are built in JS */
    d.addEventListener('vs:lang', function () {
      grids(db);
      if (refillSuggestions) refillSuggestions();
      VS.reveal();
    });
  }).catch(function (err) {
    console.error('[Vakil Saab Agra] data load failed:', err);
    ['category-grid', 'featured-grid'].forEach(function (id) {
      var n = d.getElementById(id);
      if (n) n.innerHTML = '<p class="col-span-full rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-6 text-center text-sm text-[var(--muted)]">' +
        T('js.loadFailed', 'Listings could not be loaded. Please refresh the page.') + '</p>';
    });
  });
})(window, document);
