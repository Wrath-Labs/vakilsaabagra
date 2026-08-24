/* ============================================================================
   Hindi / English.

   Loaded before js/ui.js and every page script, so the language is settled
   before anything renders. Two kinds of text need handling:

     1. Static markup — carries data-i18n / data-i18n-attr keys stamped by
        tools/i18n-extract.js. Swapped in place. The English original is read
        out of the DOM the first time a node is touched and kept in memory, so
        switching back to English restores exactly what the page shipped with
        and no English dictionary has to be downloaded at all.

     2. Content out of data/lawyers.json, and the UI strings built inside the
        page scripts. Those go through pick() and t() below, which the
        renderers call while they build their HTML.

   Nothing here ever writes a key into the page. A missing translation falls
   back to English, always.
   ========================================================================= */
(function (w, d) {
  'use strict';

  var KEY = 'vsLang';
  var HI = w.__VS_I18N_HI__ || {};

  /* node → the English it shipped with, per slot ('text' or an attribute) */
  var original = new WeakMap();

  var lang = 'en';

  /* ------------------------------------------------------------- resolution */
  function fromUrl() {
    var p = new URLSearchParams(location.search);
    /* `lang` is also the directory's spoken-language filter, which uses full
       names ("Hindi", "Braj"), so only the two-letter codes are ours. `hl` is
       the unambiguous spelling and wins when both are present. */
    var v = p.get('hl') || p.get('lang');
    return v === 'hi' || v === 'en' ? v : null;
  }

  function fromStore() {
    try {
      var v = w.localStorage.getItem(KEY);
      return v === 'hi' || v === 'en' ? v : null;
    } catch (e) { return null; }
  }

  function fromBrowser() {
    var langs = [].concat(w.navigator.languages || [], [w.navigator.language || '']);
    for (var i = 0; i < langs.length; i++) {
      if (String(langs[i]).toLowerCase().indexOf('hi') === 0) return 'hi';
    }
    return null;
  }

  function resolve() {
    return fromUrl() || fromStore() || fromBrowser() || 'en';
  }

  function remember(v) {
    try { w.localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
  }

  /* ------------------------------------------------------------- dictionary */
  /** The Hindi string for a key, or null when there isn't one. */
  /**
   * {phone} and {email} in a translated string.
   *
   * The contact details are not baked into the string tables, because they
   * change and a phone number spelled out in twenty Hindi strings is twenty
   * places to miss. They are written as tokens and expanded here, against the
   * same VS_CONFIG the rest of the page reads — so the Hindi and the English
   * can never disagree about what the number is.
   *
   * tools/content.js does the same expansion at build time for the static
   * English, which is why the number is in the HTML source for a crawler.
   */
  var TOKENS = {
    '{phone}': function () { return (w.VS_CONFIG || {}).phoneDisplay || ''; },
    '{email}': function () { return (w.VS_CONFIG || {}).email || ''; },
  };
  function expand(s) {
    if (s.indexOf('{') === -1) return s;
    Object.keys(TOKENS).forEach(function (t) {
      if (s.indexOf(t) !== -1) s = s.split(t).join(TOKENS[t]());
    });
    return s;
  }

  function hi(key) {
    var v = HI[key];
    return typeof v === 'string' && v.length ? expand(v) : null;
  }

  /**
   * A UI string built inside a page script. The English is passed in as the
   * fallback, so a key that is missing from hi.json — or a dictionary that
   * failed to load — still renders real words rather than "js.viewProfile".
   */
  function t(key, english) {
    if (lang !== 'hi') return english;
    return hi(key) || english;
  }

  /**
   * The right-language field off a data record: aboutHi when Hindi is on and
   * it has something in it, otherwise about. Works for strings and arrays,
   * and for arrays of {q,a} objects.
   */
  function pick(obj, field) {
    if (!obj) return '';
    var en = obj[field];
    if (lang !== 'hi') return en;
    var val = obj[field + 'Hi'];
    if (val == null) return en;
    if (Array.isArray(val)) return val.length ? val : en;
    if (typeof val === 'string') return val.trim() ? val : en;
    return val;
  }

  /* ---------------------------------------------------------------- swapping */
  function swapText(el) {
    var key = el.getAttribute('data-i18n');
    if (!key) return;
    if (!original.has(el)) original.set(el, { text: el.textContent });
    var store = original.get(el);
    if (store.text === undefined) store.text = el.textContent;

    var next = lang === 'hi' ? hi(key) : null;
    el.textContent = next === null ? store.text : next;
  }

  function swapAttrs(el) {
    var spec = el.getAttribute('data-i18n-attr');
    if (!spec) return;
    if (!original.has(el)) original.set(el, {});
    var store = original.get(el);

    spec.split(',').forEach(function (pair) {
      var bits = pair.split(':');
      var attr = (bits[0] || '').trim();
      var key = (bits[1] || '').trim();
      if (!attr || !key) return;
      if (store[attr] === undefined) store[attr] = el.getAttribute(attr) || '';
      var next = lang === 'hi' ? hi(key) : null;
      el.setAttribute(attr, next === null ? store[attr] : next);
    });
  }

  /** Applies the current language to a subtree. Safe to call repeatedly. */
  function translate(scope) {
    var root = scope || d;
    if (root.querySelectorAll) {
      root.querySelectorAll('[data-i18n]').forEach(swapText);
      root.querySelectorAll('[data-i18n-attr]').forEach(swapAttrs);
    }
    if (root.hasAttribute) {
      if (root.hasAttribute('data-i18n')) swapText(root);
      if (root.hasAttribute('data-i18n-attr')) swapAttrs(root);
    }
  }

  /* ------------------------------------------------------------------ toggle */
  function paintToggles() {
    d.querySelectorAll('[data-lang]').forEach(function (btn) {
      var on = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function bindToggles() {
    d.addEventListener('click', function (ev) {
      var btn = ev.target.closest && ev.target.closest('[data-lang]');
      if (!btn) return;
      ev.preventDefault();
      set(btn.getAttribute('data-lang'));
    });
  }

  /* ------------------------------------------------------------------- apply */
  function markup() {
    /* hi-IN drives the Devanagari font stack and the looser line-height in
       css/styles.css; the class is there for anything that needs a plain hook */
    d.documentElement.setAttribute('lang', lang === 'hi' ? 'hi-IN' : 'en-IN');
    d.documentElement.classList.toggle('lang-hi', lang === 'hi');
  }

  function set(next, quiet) {
    next = next === 'hi' ? 'hi' : 'en';
    var changed = next !== lang;
    lang = next;
    markup();
    translate(d);
    paintToggles();
    if (!quiet) remember(lang);
    if (changed || quiet) {
      d.dispatchEvent(new CustomEvent('vs:lang', { detail: { lang: lang } }));
    }
  }

  /* ----------------------------------------------------------------- exports */
  w.VS = w.VS || {};
  w.VS.i18n = {
    get: function () { return lang; },
    isHindi: function () { return lang === 'hi'; },
    set: set,
    t: t,
    pick: pick,
    translate: translate,
    /** The locale to format numbers and currency with. */
    locale: function () { return lang === 'hi' ? 'hi-IN' : 'en-IN'; },
    /** True when a Hindi dictionary actually loaded — used by diagnostics. */
    ready: function () { return Object.keys(HI).length > 0; }
  };

  /* Set the language attribute as early as possible so the browser picks the
     right font before text is painted, then swap the strings once the DOM is
     there. */
  lang = resolve();
  markup();

  function boot() {
    translate(d);
    paintToggles();
    bindToggles();
    /* let the page scripts know, in case they loaded first */
    d.dispatchEvent(new CustomEvent('vs:lang', { detail: { lang: lang, initial: true } }));
  }

  d.readyState === 'loading' ? d.addEventListener('DOMContentLoaded', boot) : boot();
})(window, document);
