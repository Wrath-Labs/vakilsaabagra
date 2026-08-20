/* ============================================================================
   Advocate profile page. Reads ?id= from the URL, renders the full profile
   and writes matching <title>, description, canonical and Attorney JSON-LD.
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
  function catName(cat) {
    if (!cat) return '';
    return w.VS && w.VS.i18n ? w.VS.i18n.pick(cat, 'name') : cat.name;
  }

  function tick(cls) {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
           'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="M20 6L9 17l-5-5"/></svg>';
  }

  function section(title, body, extra) {
    return '<section class="card p-6 sm:p-8" data-reveal>' +
             '<h2 class="font-display text-xl font-bold text-[var(--ink)] sm:text-2xl">' + title + '</h2>' +
             '<div class="rule-gold mt-3 mb-5"></div>' + body +
           '</section>' + (extra || '');
  }

  function notFound() {
    d.getElementById('profile-root').innerHTML =
      '<div class="mx-auto max-w-xl py-20 text-center">' +
        '<p class="font-display text-6xl font-bold text-[var(--line)]">404</p>' +
        '<h1 class="mt-4 font-display text-3xl font-bold text-[var(--ink)]">' +
          T('js.profile.notFound', 'Advocate not found') + '</h1>' +
        '<p class="mt-3 text-[var(--muted)]">' +
          T('js.profile.notFoundBody', 'This profile may have been removed or the link is incorrect.') + '</p>' +
        '<a href="lawyers.html" class="btn btn-primary mt-8 px-6 py-3">' +
          T('js.profile.browseAll', 'Browse all advocates in Agra') + '</a>' +
      '</div>';
    d.title = 'Advocate not found — Vakil Saab Agra';
  }

  function render(l, db) {
    var C = w.VS_CONFIG;
    var phone = VS.phoneDisplay(l.phone);
    var cat = P(l, 'primaryCategoryName');
    var topicList = P(l, 'topics') || [];
    var waText = T('js.profile.waText',
      'Hello {name}, I found your profile on Vakil Saab Agra and would like to discuss a legal matter.')
      .replace('{name}', l.name);

    /* ------------------------------------------------------- head + meta */
    /* head text stays English: the page has one URL and that is what is indexed */
    var title = l.name + ' — ' + l.primaryCategoryName + ' Lawyer in ' + l.area + ', Agra';
    var desc = l.primaryCategoryName + ' advocate in Agra with ' + l.experienceYears + ' years of experience. ' +
               l.topics.slice(0, 4).join(', ') + '. Chamber in ' + l.area + ', Agra. Consultation ' + VS.money(l.consultationFee) + '.';
    d.title = title + ' | Vakil Saab Agra';
    var md = d.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', desc.slice(0, 158));
    var canon = d.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', C.url + '/lawyer.html?id=' + l.id);
    [['og:title', title], ['og:description', desc], ['og:url', C.url + '/lawyer.html?id=' + l.id],
     ['twitter:title', title], ['twitter:description', desc]].forEach(function (p) {
      var m = d.querySelector('meta[property="' + p[0] + '"], meta[name="' + p[0] + '"]');
      if (m) m.setAttribute('content', p[1]);
    });

    /* ------------------------------------------------------------ blocks */
    var topics = topicList.map(function (t) {
      return '<li class="flex items-start gap-2.5 rounded-lg bg-[var(--paper-2)] px-3.5 py-2.5 text-sm text-[var(--ink)] ' +
             'transition-colors hover:bg-[#fdf8ec]">' + tick('mt-0.5 shrink-0 text-[var(--gold)]') +
             '<span>' + e(t) + '</span></li>';
    }).join('');

    var highlights = (P(l, 'highlights') || []).map(function (h) {
      return '<li class="flex items-start gap-3">' + tick('mt-0.5 shrink-0 text-[#0e7a4a]') +
             '<span class="text-sm leading-relaxed text-[var(--muted)]">' + e(h) + '</span></li>';
    }).join('');

    function row(label, value) {
      return '<div class="flex flex-col gap-0.5 border-b border-[var(--line-2)] py-3 last:border-0 sm:flex-row sm:gap-6">' +
               '<dt class="w-48 shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">' + label + '</dt>' +
               '<dd class="text-sm text-[var(--ink)]">' + value + '</dd>' +
             '</div>';
    }

    var pills = function (arr, cls) {
      return (arr || []).map(function (x) { return '<span class="chip ' + (cls || '') + '">' + e(x) + '</span>'; }).join('');
    };

    /* advocates who pay for a microsite get linked out to it from here; each
       page keeps its own canonical, so the two do not compete */
    var ms = l.microsite || {};
    var msHost = ms.enabled && ms.slug ? ms.slug + '.' + (C.micrositeDomain || 'vakilsaabagra.in') : '';
    var micrositeLink = msHost
      ? '<div class="divider-fade my-6"></div>' +
        '<p class="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted-2)]">' +
          T('js.profile.ownWebsite', 'Own website') + '</p>' +
        '<a href="https://' + e(msHost) + '/" target="_blank" rel="noopener" ' +
          'class="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--gold)] underline-offset-2 hover:underline">' +
          e(msHost) +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>'
      : '';

    var related = VS.sort(db.lawyers.filter(function (o) {
      return o.id !== l.id && o.categories.some(function (c) { return l.categories.indexOf(c) !== -1; });
    }), 'relevance').slice(0, 3);

    /* -------------------------------------------------------------- HTML */
    d.getElementById('profile-root').innerHTML = '' +
    '<nav aria-label="Breadcrumb" class="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">' +
      '<a href="index.html" class="transition-colors hover:text-[var(--gold)]">' + T('js.crumb.home', 'Home') + '</a><span aria-hidden="true">/</span>' +
      '<a href="lawyers.html" class="transition-colors hover:text-[var(--gold)]">' + T('js.crumb.lawyersInAgra', 'Lawyers in Agra') + '</a><span aria-hidden="true">/</span>' +
      '<a href="lawyers.html?category=' + e(l.primaryCategory) + '" class="transition-colors hover:text-[var(--gold)]">' + e(cat) + '</a>' +
      '<span aria-hidden="true">/</span><span class="font-medium text-[var(--ink)]">' + e(l.name) + '</span>' +
    '</nav>' +

    '<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">' +
      '<div class="space-y-6">' +

        /* ---- identity card ---- */
        '<header class="card overflow-hidden" data-reveal>' +
          '<div class="relative bg-gradient-to-br from-[var(--ink-2)] via-[var(--ink)] to-[var(--ink-3)] px-6 pb-20 pt-8 sm:px-8">' +
            '<div class="orb h-40 w-40 -right-6 -top-10 bg-[var(--gold-2)]/25 animate-drift" aria-hidden="true"></div>' +
            '<p class="relative text-xs font-semibold uppercase tracking-[.2em] text-[var(--gold-2)]">' + e(cat) + '</p>' +
            '<h1 class="relative mt-2 font-display text-3xl font-bold text-white sm:text-4xl">' + e(l.name) + '</h1>' +
            '<p class="relative mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#a8bdd4]">' +
              '<span>' + e(P(l, 'area')) + ', ' + T('js.card.agra', 'Agra') + '</span>' +
              '<span class="hidden sm:inline" aria-hidden="true">•</span>' +
              '<span>' + T('js.profile.enrolment', 'Enrolment') + ' ' + e(l.enrollment) + '</span>' +
            '</p>' +
          '</div>' +
          '<div class="relative -mt-14 px-6 pb-6 sm:px-8">' +
            '<div class="flex flex-col gap-5 sm:flex-row sm:items-end">' +
              '<div class="avatar-ring h-28 w-28 shrink-0 shadow-lg sm:h-32 sm:w-32">' +
                '<img src="' + e(l.photo) + '" width="128" height="128" alt="' + e(l.name) + ', ' +
                     e(cat) + ' ' + e(T('js.card.advocateIn', 'advocate in')) + ' ' + e(l.area) + ', Agra" decoding="async">' +
              '</div>' +
              '<div class="flex-1 pb-1">' +
                '<div class="flex flex-wrap items-center gap-2">' +
                  (l.verified ? '<span class="inline-flex items-center gap-1.5 rounded-full bg-[#e8f5ee] px-3 py-1 text-xs font-semibold text-[#0e7a4a] ring-1 ring-[#bfe3d0]">' +
                    tick('h-3 w-3') + T('js.card.verified', 'Verified listing') + '</span>' : '') +
                  (l.featured ? '<span class="rounded-full bg-[#fdf6e3] px-3 py-1 text-xs font-semibold text-[var(--gold)] ring-1 ring-[#e8d9ac]">' +
                    T('js.card.featured', 'Featured') + '</span>' : '') +
                '</div>' +
                /* no invented stars: the whole row goes when there is no
                   real feedback, rather than rendering an empty five-star row */
                (VS.hasReviews(l)
                  ? '<div class="mt-3 flex items-center gap-2">' + VS.stars(l.rating) +
                    '<span class="tabular text-sm font-bold text-[var(--ink)]">' + l.rating.toFixed(1) + '</span>' +
                    '<span class="text-sm text-[var(--muted)]">' +
                      T('js.profile.fromReviews', 'from {n} client reviews').replace('{n}', l.reviewsCount) + '</span>' +
                  '</div>'
                  : '') +
              '</div>' +
            '</div>' +

            '<dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-[var(--line)] sm:grid-cols-4">' +
              [[T('js.profile.experience', 'Experience'), l.experienceYears + ' ' + T('js.profile.yrs', 'yrs')],
               [T('js.card.consultation', 'Consultation'), VS.money(l.consultationFee)],
               [T('js.profile.practiceAreas', 'Practice areas'), l.categories.length],
               [T('js.profile.languages', 'Languages'), (l.languages || []).length]
              ].map(function (p) {
                return '<div class="bg-white px-3 py-4 text-center">' +
                  '<dd class="tabular font-display text-xl font-bold text-[var(--ink)]">' + e(p[1]) + '</dd>' +
                  '<dt class="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--muted-2)]">' + p[0] + '</dt></div>';
              }).join('') +
            '</dl>' +
          '</div>' +
        '</header>' +

        section(T('js.profile.aboutName', 'About {name}').replace('{name}', e(l.name)),
          '<p class="text-[15px] leading-[1.75] text-[var(--muted)] pretty">' + e(P(l, 'about')) + '</p>' +
          (highlights ? '<ul class="mt-6 space-y-3 border-t border-[var(--line-2)] pt-6">' + highlights + '</ul>' : '')) +

        section(T('js.profile.casesHandled', 'Cases &amp; matters handled'),
          '<ul class="grid gap-2.5 sm:grid-cols-2">' + topics + '</ul>' +
          '<p class="mt-5 text-sm text-[var(--muted)]">' + T('js.profile.practiceAreasLabel', 'Practice areas:') + ' ' +
            l.categories.map(function (c) {
              return '<a href="lawyers.html?category=' + e(c) + '" class="font-medium text-[var(--gold)] underline-offset-2 hover:underline">' +
                e(db.byCategory[c] ? catName(db.byCategory[c]) : c) + '</a>';
            }).join(', ') + '.</p>') +

        section(T('js.profile.practiceDetails', 'Practice details'),
          '<dl>' +
            row(T('js.profile.courts', 'Courts &amp; forums'), '<div class="flex flex-wrap gap-1.5">' + pills(l.courts) + '</div>') +
            row(T('js.profile.languages', 'Languages'), '<div class="flex flex-wrap gap-1.5">' +
              pills((l.languages || []).map(VS.languageName)) + '</div>') +
            row(T('js.profile.education', 'Education'), '<ul class="space-y-1">' + (l.education || []).map(function (x) {
              return '<li>' + e(x) + '</li>'; }).join('') + '</ul>') +
            row(T('js.profile.barEnrolment', 'Bar enrolment'), e(l.enrollment)) +
            row(T('js.profile.chamberAddress', 'Chamber address'), e(l.location.address)) +
            row(T('js.profile.availability', 'Availability'), e(l.availability)) +
            row(T('js.profile.consultationFee', 'Consultation fee'), VS.money(l.consultationFee) +
              (l.feeNote ? '<span class="mt-1 block text-xs text-[var(--muted)]">' + e(l.feeNote) + '</span>' : '')) +
          '</dl>') +

        (related.length
          ? '<section data-reveal><h2 class="font-display text-xl font-bold text-[var(--ink)] sm:text-2xl">' +
            T('js.profile.similar', 'Similar advocates in Agra') + '</h2>' +
            '<div class="rule-gold mt-3 mb-5"></div>' +
            '<div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-stagger="70">' +
              related.map(function (r) { return VS.lawyerCard(r, { hideFeatured: true }); }).join('') +
            '</div></section>'
          : '') +
      '</div>' +

      /* ---------------------------------------------------------- sidebar */
      /* data-vs-id scopes every contact link in here to this advocate, so
         js/track.js can tell them apart from the site's own number */
      '<aside class="lg:sticky lg:top-28 lg:self-start" data-vs-id="' + e(l.id) + '">' +
        '<div class="card p-6" data-reveal="right">' +
          '<p class="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted-2)]">' +
            T('js.profile.contactCta', 'Contact this advocate') + '</p>' +
          '<p class="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--ink)]">' +
            '<a href="' + VS.telHref(l.phone) + '" class="hover:text-[var(--gold)] transition-colors">' + e(phone) + '</a></p>' +
          '<p class="mt-1 text-sm text-[var(--muted)]">' + e(l.availability) + '</p>' +

          '<div class="mt-5 grid gap-2.5">' +
            '<a href="' + VS.telHref(l.phone) + '" class="btn btn-primary w-full px-5 py-3 text-sm pulse-ring">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/></svg>' +
              T('js.profile.callNow', 'Call now') + '</a>' +
            '<a href="' + VS.waHref(l.whatsapp || l.phone, waText) + '" target="_blank" rel="noopener" ' +
               'class="btn btn-ghost w-full px-5 py-3 text-sm">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="text-[#25D366]"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.6.6 1.9.5 2.3.5a2.6 2.6 0 001.7-1.2 2.1 2.1 0 00.1-1.2z"/></svg>' +
              'WhatsApp</a>' +   /* a brand name — the same in both languages */
            '<button type="button" id="copy-phone" data-phone="' + e(l.phone) + '" class="btn btn-ghost w-full px-5 py-3 text-sm">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/></svg>' +
              T('js.profile.copyNumber', 'Copy number') + '</button>' +
            '<button type="button" id="share-profile" class="btn btn-ghost w-full px-5 py-3 text-sm">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3"/></svg>' +
              T('js.profile.shareProfile', 'Share profile') + '</button>' +
          '</div>' +

          micrositeLink +

          '<div class="divider-fade my-6"></div>' +
          '<p class="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted-2)]">' +
            T('js.profile.chamber', 'Chamber') + '</p>' +
          '<p class="mt-2 text-sm leading-relaxed text-[var(--muted)]">' + e(l.location.address) + '</p>' +
          '<a href="https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(l.location.address) + '" target="_blank" rel="noopener" ' +
            'class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--gold)] hover:underline underline-offset-2">' +
            T('js.profile.openInMaps', 'Open in Maps') +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 17L17 7M9 7h8v8"/></svg></a>' +
        '</div>' +

        '<div class="mt-5 rounded-xl border border-[#e8dcbb] bg-[#fdfaf1] p-5" data-reveal="right">' +
          '<p class="text-sm font-semibold text-[var(--ink)]">' + T('js.profile.notSure', 'Not sure who to call?') + '</p>' +
          '<p class="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">' +
            T('js.profile.notSureBody', 'Tell us your matter and we will point you to the right advocate in Agra — free of cost.') + '</p>' +
          '<a href="contact.html" class="btn btn-gold mt-4 w-full px-5 py-2.5 text-sm">' +
            T('js.profile.getGuidance', 'Get free guidance') + '</a>' +
        '</div>' +
      '</aside>' +
    '</div>';

    /* ------------------------------------------------------------ counting */
    /* the call, WhatsApp and copy buttons are picked up by the delegated
       listener in js/track.js — this only tells it whose profile this is */
    if (VS.track) {
      VS.track.context({ lawyerId: l.id });
      VS.track.view(l.id);
    }

    /* ------------------------------------------------------------ actions */
    var copy = d.getElementById('copy-phone');
    if (copy) copy.addEventListener('click', function () {
      var num = VS.phoneDisplay(copy.dataset.phone);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(num).then(function () { VS.toast(T('js.toast.numberCopied', 'Phone number copied')); },
                                                 function () { VS.toast(num); });
      } else { VS.toast(num); }
    });

    var share = d.getElementById('share-profile');
    if (share) share.addEventListener('click', function () {
      var payload = { title: l.name + ' — Vakil Saab Agra', text: desc, url: location.href };
      if (navigator.share) { navigator.share(payload).catch(function () {}); }
      else if (navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(function () { VS.toast(T('js.toast.linkCopied', 'Profile link copied')); });
      }
    });

    VS.stagger(d.querySelector('#profile-root [data-stagger]'), 70);
    VS.reveal();

    /* ------------------------------------------------------ structured data */
    VS.jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Attorney',
      '@id': C.url + '/lawyer.html?id=' + l.id + '#attorney',
      name: l.name,
      url: C.url + '/lawyer.html?id=' + l.id,
      image: C.url + '/' + l.photo,
      description: l.about,
      telephone: l.phone,
      priceRange: '₹' + l.consultationFee,
      knowsLanguage: l.languages,
      knowsAbout: l.topics,
      address: {
        '@type': 'PostalAddress',
        streetAddress: l.location.address,
        addressLocality: 'Agra',
        addressRegion: 'Uttar Pradesh',
        postalCode: '282001',
        addressCountry: 'IN'
      },
      areaServed: { '@type': 'City', name: 'Agra' },
      parentOrganization: { '@id': C.url + '/#organization' },
      /* No aggregateRating. There is no review pipeline behind it, and
         structured data claiming ratings we do not have is exactly what earns
         a manual action from Google. It goes back only with real reviews. */
      makesOffer: l.categories.map(function (c) {
        return { '@type': 'Offer', itemOffered: { '@type': 'Service', name: (db.byCategory[c] || {}).name + ' legal services in Agra' } };
      })
    });

    VS.jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: C.url + '/' },
        { '@type': 'ListItem', position: 2, name: 'Lawyers in Agra', item: C.url + '/lawyers.html' },
        { '@type': 'ListItem', position: 3, name: l.primaryCategoryName, item: C.url + '/lawyers.html?category=' + l.primaryCategory },
        { '@type': 'ListItem', position: 4, name: l.name, item: C.url + '/lawyer.html?id=' + l.id }
      ]
    });
  }

  VS.load().then(function (db) {
    var id = VS.param('id');
    var l = id && db.byId[id];
    l ? render(l, db) : notFound();

    /* the whole profile is built in JS, so a language switch rebuilds it */
    d.addEventListener('vs:lang', function () {
      if (l) render(l, db);
    });
  }).catch(function (err) {
    console.error('[Vakil Saab Agra] data load failed:', err);
    notFound();
  });
})(window, document);
