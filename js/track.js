/* ============================================================================
   Anonymous click and view counting.

   The point of this file is to be able to tell an advocate, at renewal time,
   how many people looked at their profile and how many of them called. It
   counts events; it does not identify anybody. No cookie is set, no IP or
   user agent is stored, and there is no third-party analytics anywhere on
   this site.

   The one rule that must never be broken: a contact link keeps working
   exactly as it did. The listener below never calls preventDefault(), never
   rewrites an href and never waits for the network — it fires a beacon and
   lets the browser navigate. If the beacon fails, it fails silently.
   ========================================================================= */
(function (w, d) {
  'use strict';

  var ENDPOINT = '/api/track';
  var KEY = 'vsSession';
  var nav = w.navigator || {};

  /* Do Not Track is a request, not a suggestion */
  var on = nav.doNotTrack !== '1' && w.doNotTrack !== '1' && nav.msDoNotTrack !== '1';

  var SOURCE = w.__VS_SOURCE__ === 'microsite' ? 'microsite' : 'directory';
  var ctx = { lawyerId: null };
  var sent = {};          /* ids already counted as an impression on this page */
  var sid = null;

  /** A random id for this browser session only. It exists so the endpoint can
   *  ignore the same click arriving twice, and it dies with the tab. */
  function sessionId() {
    if (sid) return sid;
    var made = 'x' + Math.random().toString(36).slice(2, 10) +
                     Math.random().toString(36).slice(2, 10);
    try {
      sid = w.sessionStorage.getItem(KEY);
      if (!sid) { sid = made; w.sessionStorage.setItem(KEY, sid); }
    } catch (e) {
      sid = made;         /* private mode, or storage blocked — in-memory is fine */
    }
    return sid;
  }

  function send(payload) {
    if (!on) return;
    payload.source = SOURCE;
    payload.session = sessionId();
    var body = JSON.stringify(payload);
    try {
      if (nav.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (nav.sendBeacon(ENDPOINT, blob)) return;
      }
      if (w.fetch) {
        w.fetch(ENDPOINT, {
          method: 'POST',
          body: body,
          keepalive: true,
          headers: { 'Content-Type': 'application/json' }
        })['catch'](function () {});
      }
    } catch (e) { /* never let counting break the page */ }
  }

  /**
   * Which advocate does this element belong to?
   *
   * Only an enclosing [data-vs-id] counts — deliberately. The header, the
   * footer and the mobile menu all carry tel: and wa.me links to *our* number,
   * and falling back to "whichever profile this page shows" would book those
   * clicks as leads for that advocate. No container, no event.
   */
  function idFor(el) {
    var scope = el.closest ? el.closest('[data-vs-id]') : null;
    return (scope && scope.getAttribute('data-vs-id')) || null;
  }

  function event(type, lawyerId) {
    if (!lawyerId) return;
    send({ type: type, lawyerId: lawyerId });
  }

  /* ------------------------------------------------------ delegated clicks */
  /* capture phase, so a handler that stops propagation cannot hide a lead */
  d.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;

    var el = target.closest('a[href], button');
    if (!el) return;

    var type = null;
    if (el.tagName === 'A') {
      var href = el.getAttribute('href') || '';
      if (href.slice(0, 4) === 'tel:') type = 'call';
      else if (href.indexOf('wa.me') !== -1 || href.indexOf('api.whatsapp.com') !== -1) type = 'whatsapp';
    } else if (el.id === 'copy-phone') {
      type = 'copy';
    }
    if (!type) return;

    event(type, idFor(el));
  }, true);

  /* ------------------------------------------------------------------- API */
  w.VS = w.VS || {};
  w.VS.track = {
    /** Tells the page which advocate it is about. */
    context: function (o) {
      if (o && o.lawyerId) ctx.lawyerId = o.lawyerId;
    },

    /** A profile (or microsite) was opened. */
    view: function (lawyerId) {
      event('view', lawyerId || ctx.lawyerId);
    },

    /** A directory search was submitted. Carries no advocate id. */
    search: function (query, category, area) {
      if (!query && !category && !area) return;
      send({ type: 'search', query: query || null, category: category || null, area: area || null });
    },

    /**
     * A set of cards was rendered. One beacon per render, not one per card,
     * and an id already counted on this page is not counted again when the
     * visitor pages further down the list.
     */
    impressions: function (ids) {
      if (!ids || !ids.length) return;
      var fresh = [];
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] && !sent[ids[i]]) { sent[ids[i]] = 1; fresh.push(ids[i]); }
      }
      if (fresh.length) send({ type: 'impression', lawyerIds: fresh });
    },

    enabled: on
  };

  /* A microsite is pre-rendered HTML with no page script of its own: it just
     declares who it is about, and the view is counted here. */
  if (w.__VS_LAWYER__) {
    ctx.lawyerId = w.__VS_LAWYER__;
    w.VS.track.view(ctx.lawyerId);
  }
})(window, document);
