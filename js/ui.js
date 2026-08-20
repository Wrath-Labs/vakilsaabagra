/* ============================================================================
   Global UI runtime: header behaviour, drawer, scroll reveals, counters,
   accordions, config-driven contact links and the shared lawyer card.
   ========================================================================= */
(function (w, d) {
  'use strict';

  var CFG = w.VS_CONFIG || {};
  var reduced = w.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Translation helpers. The English is always passed in as the fallback, so
     these render real words even if the dictionary never loads. */
  function T(key, english) {
    return w.VS && w.VS.i18n ? w.VS.i18n.t(key, english) : english;
  }
  function P(obj, field) {
    return w.VS && w.VS.i18n ? w.VS.i18n.pick(obj, field) : obj[field];
  }

  /* --------------------------------------------------------------- header */
  function header() {
    var el = d.querySelector('.site-header');
    var bar = d.getElementById('read-progress');
    var top = d.getElementById('to-top');
    if (!el && !bar && !top) return;

    var ticking = false;
    function paint() {
      var y = w.scrollY || d.documentElement.scrollTop;
      if (el) el.classList.toggle('is-stuck', y > 12);
      if (top) top.classList.toggle('is-on', y > 640);
      if (bar) {
        var h = d.documentElement.scrollHeight - w.innerHeight;
        bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(y / h, 1) : 0) + ')';
      }
      ticking = false;
    }
    w.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; w.requestAnimationFrame(paint); }
    }, { passive: true });
    paint();

    if (top) top.addEventListener('click', function () {
      w.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  /* --------------------------------------------------------------- drawer */
  function drawer() {
    var menu = d.getElementById('mobile-menu');
    var open = d.getElementById('menu-open');
    if (!menu || !open) return;
    var closers = menu.querySelectorAll('[data-close-menu]');

    function set(state) {
      menu.classList.toggle('is-open', state);
      d.body.classList.toggle('is-locked', state);
      menu.setAttribute('aria-hidden', String(!state));
      open.setAttribute('aria-expanded', String(state));
      if (state) {
        var first = menu.querySelector('a, button');
        if (first) setTimeout(function () { first.focus(); }, 240);
      } else {
        open.focus();
      }
    }
    open.addEventListener('click', function () { set(true); });
    closers.forEach(function (c) { c.addEventListener('click', function () { set(false); }); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { set(false); });
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false);
    });
  }

  /* -------------------------------------------------------- scroll reveal */
  var revealObserver = null;
  function reveal(scope) {
    var nodes = (scope || d).querySelectorAll('[data-reveal]:not(.is-in)');
    if (!nodes.length) return;

    if (reduced || !('IntersectionObserver' in w)) {
      nodes.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          obs.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    nodes.forEach(function (n) { revealObserver.observe(n); });
  }

  /** Applies a staggered delay to the direct children of a container. */
  function stagger(container, step) {
    if (!container) return;
    Array.prototype.forEach.call(container.children, function (child, i) {
      child.style.setProperty('--d', (i * (step || 70)) + 'ms');
    });
  }

  /* ------------------------------------------------------------- counters */
  function counters() {
    var nodes = d.querySelectorAll('[data-count]');
    if (!nodes.length) return;
    if (reduced || !('IntersectionObserver' in w)) {
      nodes.forEach(function (n) { n.textContent = fmt(+n.dataset.count, n); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        run(e.target);
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (n) { io.observe(n); });

    function fmt(v, node) {
      var out = Math.round(v).toLocaleString('en-IN');
      return (node.dataset.prefix || '') + out + (node.dataset.suffix || '');
    }
    function run(node) {
      var target = +node.dataset.count;
      var dur = +(node.dataset.duration || 1500);
      var t0 = performance.now();
      (function tick(now) {
        var p = Math.min((now - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        node.textContent = fmt(target * eased, node);
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
  }

  /* ------------------------------------------------------------ accordion */
  function accordions(scope) {
    (scope || d).querySelectorAll('.acc-item > button').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var item = btn.closest('.acc-item');
        var group = item.closest('[data-accordion-group]');
        var wasOpen = item.classList.contains('is-open');
        if (group) {
          group.querySelectorAll('.acc-item.is-open').forEach(function (o) {
            o.classList.remove('is-open');
            o.querySelector('button').setAttribute('aria-expanded', 'false');
          });
        }
        item.classList.toggle('is-open', !wasOpen);
        btn.setAttribute('aria-expanded', String(!wasOpen));
      });
    });
  }

  /* ------------------------------------------------ config-driven content */
  function applyConfig(scope) {
    var root = scope || d;
    root.querySelectorAll('[data-cfg]').forEach(function (el) {
      var key = el.dataset.cfg;
      var val = key.split('.').reduce(function (o, k) { return o && o[k]; }, CFG);
      if (val == null) return;
      if (el.dataset.cfgAttr) el.setAttribute(el.dataset.cfgAttr, val);
      else el.textContent = val;
    });
    root.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
    if (CFG.demoNotice === false) {
      root.querySelectorAll('[data-demo-notice]').forEach(function (el) { el.remove(); });
    }
  }

  /* ----------------------------------------------------------- toast msg */
  function toast(message) {
    var t = d.getElementById('vs-toast');
    if (!t) {
      t = d.createElement('div');
      t.id = 'vs-toast';
      t.className = 'fixed left-1/2 bottom-8 z-[120] -translate-x-1/2 rounded-full bg-[var(--ink)] ' +
                    'px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300';
      t.style.opacity = '0';
      t.style.transform = 'translate(-50%, 14px)';
      d.body.appendChild(t);
    }
    t.textContent = message;
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      t.style.transform = 'translate(-50%, 0)';
    });
    clearTimeout(t._timer);
    t._timer = setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translate(-50%, 14px)';
    }, 2400);
  }

  /* ----------------------------------------------------------- star row */
  function stars(rating) {
    var full = Math.floor(rating);
    var half = rating - full >= 0.35;
    var out = '';
    for (var i = 0; i < 5; i++) {
      var fill = i < full ? '#b0861f' : (i === full && half ? 'url(#half' + String(rating).replace('.', '') + ')' : '#dfe4ea');
      out += '<path fill="' + fill + '" d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4 4.2 13.4l.7-4.3-3.1-3 4.3-.6z" transform="translate(' + (i * 17) + ',0)"/>';
    }
    var grad = half
      ? '<defs><linearGradient id="half' + String(rating).replace('.', '') + '"><stop offset="50%" stop-color="#b0861f"/><stop offset="50%" stop-color="#dfe4ea"/></linearGradient></defs>'
      : '';
    return '<svg viewBox="0 0 85 15" width="80" height="14" aria-hidden="true" class="shrink-0">' + grad + out + '</svg>';
  }

  /* --------------------------------------------------------- lawyer card */
  function lawyerCard(l, opts) {
    opts = opts || {};
    var e = w.VS.escape;
    var topicList = P(l, 'topics') || [];
    var catName = P(l, 'primaryCategoryName');
    var topics = topicList.slice(0, 3).map(function (t) {
      return '<span class="chip max-w-full">' + e(t) + '</span>';
    }).join('');
    var more = topicList.length > 3
      ? '<span class="chip border-dashed">+' + (topicList.length - 3) + ' ' +
        T('js.card.more', 'more') + '</span>' : '';

    var verifiedLabel = T('js.card.verified', 'Verified listing');
    var badge = l.verified
      ? '<span class="verified-dot mt-1.5 h-4 w-4 shrink-0" title="' + e(verifiedLabel) + '" aria-label="' + e(verifiedLabel) + '">' +
        '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>'
      : '';

    var isFeatured = l.featured && !opts.hideFeatured;
    var featured = isFeatured
      ? '<span class="rounded-full bg-[#fdf6e3] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gold)] ring-1 ring-[#e8d9ac]">' +
        T('js.card.featured', 'Top rated') + '</span>'
      : '';

    return '' +
    /* data-vs-id lets js/track.js attribute a call or WhatsApp click on this
       card to this advocate rather than to whatever profile the page shows */
    '<article class="card card-hover group relative flex min-w-0 flex-col p-5 sm:p-6" data-reveal ' +
            'data-vs-id="' + e(l.id) + '">' +
      '<div class="flex min-w-0 items-start gap-4">' +
        '<div class="avatar-ring h-[68px] w-[68px] shrink-0 transition-transform duration-500 group-hover:scale-[1.04] sm:h-[76px] sm:w-[76px]">' +
          '<img src="' + e(l.photo) + '" width="76" height="76" loading="lazy" decoding="async" ' +
               'alt="' + e(l.name) + ' — ' + e(catName) + ' ' +
               e(T('js.card.advocateIn', 'advocate in')) + ' ' + e(l.area) + ', Agra">' +
        '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<h3 class="flex items-start gap-1.5 font-display text-[17px] font-bold leading-snug text-[var(--ink)]">' +
            '<a href="lawyer.html?id=' + e(l.id) + '" class="stretch-link min-w-0 transition-colors hover:text-[var(--gold)]">' + e(l.name) + '</a>' +
            badge +
          '</h3>' +
          '<p class="mt-1 text-sm font-medium leading-snug text-[var(--gold)]">' + e(catName) + '</p>' +
          '<div class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs text-[var(--muted)]">' +
            VS.stars(l.rating) +
            '<span class="tabular font-semibold text-[var(--ink)]">' + l.rating.toFixed(1) + '</span>' +
            '<span>(' + l.reviewsCount + ')</span>' +
            featured +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--paper-2)] p-3 text-center">' +
        '<div class="min-w-0"><p class="tabular font-display text-xl font-bold text-[var(--ink)]">' + l.experienceYears + '</p>' +
             '<p class="text-[11px] uppercase tracking-wide text-[var(--muted-2)]">' + T('js.card.yearsExp', 'Years exp.') + '</p></div>' +
        '<div class="min-w-0 border-l border-[var(--line)]"><p class="tabular font-display text-xl font-bold text-[var(--ink)]">' + w.VS.money(l.consultationFee) + '</p>' +
             '<p class="text-[11px] uppercase tracking-wide text-[var(--muted-2)]">' + T('js.card.consultation', 'Consultation') + '</p></div>' +
      '</div>' +

      '<p class="mt-4 line-clamp-3 text-sm leading-relaxed text-[var(--muted)] pretty">' + e(P(l, 'about')) + '</p>' +

      '<div class="mt-4 flex flex-wrap gap-1.5">' + topics + more + '</div>' +

      '<div class="mt-auto pt-5">' +
        '<div class="flex min-w-0 items-center gap-1.5 border-t border-[var(--line-2)] pt-4 text-xs text-[var(--muted)]">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" class="shrink-0 text-[var(--gold)]"><path d="M12 21s-7-5.6-7-11a7 7 0 1114 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>' +
          '<span class="truncate">' + e(P(l, 'area')) + ', ' + T('js.card.agra', 'Agra') + '</span>' +
          '<span class="ml-auto shrink-0 whitespace-nowrap">' + e(l.enrollment.split("/")[0]) + ' ' +
            T('js.card.enrolled', 'enrolled') + '</span>' +
        '</div>' +
        '<div class="mt-3 grid grid-cols-2 gap-2">' +
          '<a href="lawyer.html?id=' + e(l.id) + '" class="btn btn-ghost relative z-10 px-3 py-2.5 text-xs">' +
            T('js.card.viewProfile', 'View profile') + '</a>' +
          '<a href="' + w.VS.telHref(l.phone) + '" class="btn btn-gold relative z-10 px-3 py-2.5 text-xs" ' +
             'aria-label="' + e(T('js.card.call', 'Call')) + ' ' + e(l.name) + '">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/></svg>' +
            T('js.card.call', 'Call') +
          '</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ---------------------------------------------------------------- boot */
  function init() {
    header();
    drawer();
    counters();
    accordions();
    applyConfig();
    d.querySelectorAll('[data-stagger]').forEach(function (c) {
      stagger(c, +c.dataset.stagger || 70);
    });
    reveal();
  }

  w.VS = w.VS || {};
  w.VS.reveal = reveal;
  w.VS.stagger = stagger;
  w.VS.accordions = accordions;
  w.VS.applyConfig = applyConfig;
  w.VS.toast = toast;
  w.VS.stars = stars;
  w.VS.lawyerCard = lawyerCard;
  w.VS.reduced = reduced;

  d.readyState === 'loading' ? d.addEventListener('DOMContentLoaded', init) : init();
})(window, document);
