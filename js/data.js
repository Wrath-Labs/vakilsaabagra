/* ============================================================================
   Data access layer.

   data/lawyers.json is the single source of truth, but the browser never
   reads it: tools/sync.js publishes data/lawyers.public.json from it —
   live listings only, with the billing block stripped out.

   Browsers block fetch() of local files when a page is opened straight from
   disk (file://), so we fall back to data/lawyers.fallback.js, which carries
   the same published dataset and which tools/sync.js keeps in step.
   ========================================================================= */
(function (w) {
  'use strict';

  var cache = null;
  var inflight = null;

  function injectFallback() {
    return new Promise(function (resolve, reject) {
      if (w.__VS_DATA__) return resolve(w.__VS_DATA__);
      var s = document.createElement('script');
      s.src = 'data/lawyers.fallback.js';
      s.onload = function () {
        w.__VS_DATA__ ? resolve(w.__VS_DATA__)
                      : reject(new Error('fallback loaded but contained no data'));
      };
      s.onerror = function () { reject(new Error('could not load data/lawyers.fallback.js')); };
      document.head.appendChild(s);
    });
  }

  function normalise(db) {
    var byCat = {};
    db.categories.forEach(function (c) { byCat[c.slug] = c; c.count = 0; });

    db.lawyers.forEach(function (l) {
      l.categories = l.categories || [];
      l.topics = l.topics || [];
      l.categoryNames = l.categories.map(function (s) {
        return byCat[s] ? byCat[s].name : s;
      });
      l.categoryNamesHi = l.categories.map(function (s) {
        return byCat[s] ? (byCat[s].nameHi || byCat[s].name) : s;
      });
      l.primaryCategoryName = byCat[l.primaryCategory] ? byCat[l.primaryCategory].name : l.primaryCategory;
      l.primaryCategoryNameHi = byCat[l.primaryCategory]
        ? (byCat[l.primaryCategory].nameHi || byCat[l.primaryCategory].name)
        : l.primaryCategory;
      l.area = (l.location && l.location.area) || 'Agra';
      l.areaHi = (l.location && l.location.areaHi) || null;
      /* Pre-built haystack keeps keyword search fast and typo-tolerant. Both
         languages go in the one index, so "ज़मानत" and "bail" find the same
         advocate whichever language the page is being read in. */
      l.search = [
        l.name, l.about, l.area, l.primaryCategoryName,
        l.categoryNames.join(' '), l.topics.join(' '),
        (l.courts || []).join(' '), (l.languages || []).join(' '),
        (l.highlights || []).join(' '),
        l.aboutHi || '', l.primaryCategoryNameHi, l.areaHi || '',
        l.categoryNamesHi.join(' '), (l.topicsHi || []).join(' '),
        (l.highlightsHi || []).join(' ')
      ].join(' ').toLowerCase();
      l.categories.forEach(function (s) { if (byCat[s]) byCat[s].count++; });
    });

    db.byCategory = byCat;
    db.areas = Array.from(new Set(db.lawyers.map(function (l) { return l.area; }))).sort();
    db.languages = Array.from(new Set(db.lawyers.flatMap(function (l) { return l.languages || []; }))).sort();
    db.byId = {};
    db.lawyers.forEach(function (l) { db.byId[l.id] = l; });
    return db;
  }

  var VS = {
    /** Resolves with the normalised database. Safe to call many times. */
    load: function () {
      if (cache) return Promise.resolve(cache);
      if (inflight) return inflight;

      inflight = fetch('data/lawyers.public.json', { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .catch(injectFallback)
        .then(function (db) {
          cache = normalise(db);
          document.dispatchEvent(new CustomEvent('vs:data', { detail: cache }));
          return cache;
        });

      return inflight;
    },

    /* ------------------------------------------------------------ helpers */

    /** Case-insensitive keyword match across every indexed field. */
    matches: function (lawyer, query) {
      if (!query) return true;
      return query.toLowerCase().split(/\s+/).filter(Boolean)
        .every(function (word) { return lawyer.search.indexOf(word) !== -1; });
    },

    /** rating and reviewsCount are null until there is a real review pipeline,
     *  so every comparison has to treat them as absent rather than as zero —
     *  null arithmetic silently sorts everything into one indistinguishable
     *  blob. */
    num: function (v) { return typeof v === 'number' ? v : -1; },

    /** Deterministic ordering so the page never reshuffles between loads. */
    sort: function (list, mode) {
      var out = list.slice();
      var n = VS.num;
      var cmp = {
        relevance: function (a, b) {
          return (b.featured - a.featured)
              || (n(b.rating) - n(a.rating))
              || (b.experienceYears - a.experienceYears)
              || a.name.localeCompare(b.name);
        },
        experience: function (a, b) { return b.experienceYears - a.experienceYears || a.name.localeCompare(b.name); },
        rating:     function (a, b) { return (n(b.rating) - n(a.rating)) || (n(b.reviewsCount) - n(a.reviewsCount)) || a.name.localeCompare(b.name); },
        reviews:    function (a, b) { return (n(b.reviewsCount) - n(a.reviewsCount)) || (n(b.rating) - n(a.rating)) || a.name.localeCompare(b.name); },
        feeLow:     function (a, b) { return a.consultationFee - b.consultationFee || a.name.localeCompare(b.name); },
        name:       function (a, b) { return a.name.localeCompare(b.name); }
      }[mode] || null;
      return cmp ? out.sort(cmp) : out;
    },

    /** True when at least one advocate has real feedback behind them. */
    anyReviews: function (list) {
      return list.some(function (l) { return l.reviewsCount && l.rating; });
    },

    money: function (n) {
      var i18n = w.VS && w.VS.i18n;
      if (!n) return i18n ? i18n.t('js.money.free', 'Free first consult') : 'Free first consult';
      return '₹' + n.toLocaleString(i18n ? i18n.locale() : 'en-IN');
    },

    /**
     * A spoken-language name in the language being read. The value used for
     * filtering stays English — only the label changes — so the filter keeps
     * matching what is in the data.
     */
    languageName: function (name) {
      var i18n = w.VS && w.VS.i18n;
      if (!i18n || !i18n.isHindi()) return name;
      var key = 'js.language.' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return i18n.t(key, name);
    },

    telHref: function (num) { return 'tel:' + String(num).replace(/[^\d+]/g, ''); },

    waHref: function (num, text) {
      return 'https://wa.me/' + String(num).replace(/\D/g, '')
           + (text ? '?text=' + encodeURIComponent(text) : '');
    },

    /** Formats +919999000001 as +91 99990 00001 */
    phoneDisplay: function (num) {
      var d = String(num).replace(/\D/g, '');
      if (d.length === 12 && d.slice(0, 2) === '91') {
        return '+91 ' + d.slice(2, 7) + ' ' + d.slice(7);
      }
      return num;
    },

    escape: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /** Adds a JSON-LD block to <head>. */
    jsonLd: function (obj) {
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(obj);
      document.head.appendChild(s);
    },

    param: function (key) {
      return new URLSearchParams(location.search).get(key);
    }
  };

  w.VS = VS;
})(window);
