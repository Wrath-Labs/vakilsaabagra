# Changelog

Every change to this project gets an entry here.

**Convention:** entries are in chronological order — **oldest first, newest
appended at the bottom.** Each entry records what changed, what it was verified
against, and any decision or trade-off that would otherwise be lost. Add the
entry in the same commit as the change it describes.

---

## 2026-08-18 — `fb3e361` · Initial site

The static directory as first built: 11 pages, 20 sample advocates, 12 practice
areas and 96 case types, English only, hosted on GitHub Pages at
`www.vakilsaabagra.com`. Plain HTML + Tailwind + vanilla JS, `data/lawyers.json`
as the single source of truth, `tools/sync.js` generating the fallback data
file, monogram avatars and the sitemap.

---

## 2026-08-20 — `d932da2` · Data schema: billing, microsites, expiry

**Added.** Every advocate record gains a `listing` block (`plan`, `paidUntil`,
`active`, `onboardedOn`), a `microsite` block (`enabled`, `slug`, `tagline`,
`longAbout`, `faqs`, `accent`) and a nullable `featuredUntil`. Defaults are
inert — plan `"none"`, microsite disabled — so nothing on the site changed yet.

**Validation in `tools/sync.js`.** Plan against the four allowed values;
`paidUntil` required for any paid plan; `slug` unique, matching
`/^[a-z0-9-]{3,30}$/` and not one of 23 reserved infrastructure labels;
`longAbout` required when a microsite is enabled, and **rejected if it is
byte-identical to `about`**; accent against the four allowed values; FAQ entries
needing both `q` and `a`; featured advocates capped at two per practice area.

**Expiry pass.** An advocate is *live* only while `listing.active !== false` and
`listing.paidUntil` has not passed. Anyone else is left out of the published
dataset and the sitemap but **never deleted** from `lawyers.json`. The build
prints who has already expired and who expires within 15 days, sorted by date —
that printout is the renewal reminder.

**New generated file: `data/lawyers.public.json`.** Billing data must not reach
the browser, and excluding expired advocates from `lawyers.fallback.js` alone
would not have hidden them, because `js/data.js` fetched `lawyers.json`
directly. Sync now publishes a projection — live advocates only, `listing`
stripped, expired `featured` flags flattened — and `js/data.js` fetches that.

**Files:** `data/lawyers.json`, `tools/sync.js`, `js/data.js`, `README.md`,
`data/lawyers.public.json` (new).

**Verified.** Headless pass over home, directory (filters, sort, URL state,
load-more) and profile: unchanged, zero console errors. Validation exercised
against 17 deliberately broken records; expiry, hiding and sitemap exclusion
confirmed by flipping dates.

**Note.** The brief assumed the featured data needed fixing ("12 of 20 are
featured"). It already passed — the cap is per `primaryCategory` and the worst
case was 2. No data change was needed.

---

## 2026-08-20 — `ef6167c` · Anonymous view and click counting (Cloudflare D1)

**Why.** The call and WhatsApp buttons go straight to the advocate's own number,
so there was no record that any lead was ever delivered — which made renewal a
conversation about faith rather than numbers.

**Added.** `schema.sql` (D1 table + indexes), `functions/api/track.js`,
`functions/api/stats.js`, `functions/_ids.js` (generated), `js/track.js`,
`admin/stats.html`.

**Six events:** `view`, `call`, `whatsapp`, `copy`, `search`, `impression`
(batched, one beacon per results render).

**The contact links are untouched.** `js/track.js` listens in the capture phase,
fires `sendBeacon()` (falling back to `fetch(..., {keepalive:true})`) and
returns. It never calls `preventDefault()`, never rewrites an `href`, never
awaits anything on the click path, and swallows its own failures. `tel:` and
`wa.me` keep working with JavaScript off.

**Attribution comes only from an enclosing `[data-vs-id]`.** A page-wide
fallback was tried first and was wrong: it booked clicks on our own footer
number as leads for whichever advocate the page happened to be showing.

**Endpoint.** POST only; `Origin` must be `vakilsaabagra.in` or a subdomain;
event type validated; advocate id validated against the generated id list; bot
and link-preview user agents dropped; a `(session, type, lawyer_id)` triple
inside 30 seconds ignored; `204` on every success **and** every internal
failure.

**Privacy is the design, not a footnote.** No IP, no user-agent, no referrer, no
cookie, no third-party analytics. `session` is a random `sessionStorage` id used
solely for the de-dupe. Search text has runs of six or more digits stripped
before storage, so a pasted phone number is not kept. Do Not Track suppresses
every beacon. `privacy.html` says all of this plainly, replacing a paragraph
that had become untrue.

**Stats.** `GET /api/stats` behind an `X-VS-Admin` header compared in constant
time against `ADMIN_TOKEN`. `admin/stats.html` is unlinked, `noindex` and
`Disallow`ed; its **Copy message** button produces the Hindi renewal message
ready to paste into WhatsApp.

**Verified.** 33 assertions against the real `schema.sql` using `node:sqlite`
(rejections, dedupe, batching, query scrubbing, stats auth and totals), plus a
headless pass confirming all six event types fire, `defaultPrevented` stays
false, per-card attribution is correct, our own number is not counted, and Do
Not Track silences everything.

**Deviation from the brief.** One extra index, `idx_events_session_ts` — the
30-second de-dupe queries by session and would otherwise degrade to a table
scan.

---

## 2026-08-20 — `6719469` · Microsites on their own subdomain

**Added.** `templates/microsite.html` (the design, with `{{…}}` tokens),
generation in `tools/sync.js`, `functions/_middleware.js`, `functions/_slugs.js`
and `sites/**` (generated), `docs/DEPLOY.md`.

**Served, never redirected.** The middleware rewrites internally so the
subdomain stays in the address bar. An advocate who pays for their own site and
finds it bouncing to `vakilsaabagra.in/lawyer.html?id=…` has been sold something
they did not buy.

**The asset rule is the fragile part.** `/css/`, `/js/`, `/assets/`, `/data/`,
`/api/`, `/sites/` and `/.well-known/` are returned *before* any slug handling.
Without that, `/css/tailwind.css` on a subdomain gets rewritten into the
per-site folder and every microsite renders unstyled. `localhost` and
`*.pages.dev` pass through so local dev and preview deployments still serve the
directory. Unknown slugs get a real HTTP 404 page linking back to the directory.

**Not a copy of the directory profile.** The generator refuses a `longAbout`
identical to `about`, and the page carries substantially more: the long bio,
practice areas expanded into sections with their own topics, courts, languages,
education, chamber details and an FAQ accordion reusing `accordions()` from
`js/ui.js`. Everything is substituted into the HTML — nothing about an advocate
is fetched at runtime, so crawlers and WhatsApp previews see the full bio in
view-source. Each page canonicalises to itself.

**Accents.** The four values override the `:root` brand tokens *and*
`.btn-gold`, which hardcodes its gradient in `css/styles.css` — without that
override the main call button stayed brand-gold on a teal site, which is the one
element anyone would notice. Overridden per microsite so the directory's own
buttons are untouched.

**Expiry is wired end to end.** Sync deletes the folder of any microsite no
longer live and regenerates the slug map, so `active: false` or a lapsed
`paidUntil` removes the advocate from the directory *and* makes the subdomain
404 after one rebuild.

**Also:** the apex `robots.txt` now disallows `/sites/`, or the same HTML would
be reachable under our own domain and every microsite would be a duplicate of
itself; `/data/lawyers.json` is blocked at the edge on every host.

Four sample microsites are enabled, one per accent, with hand-written content so
the pipeline is verifiable end to end.

**Verified.** 30 middleware assertions (rewrite targets, asset passthrough, apex
and preview hosts, 404 behaviour, blocked source file); a headless pass
confirming styling, photos, the accordion, and view/call beacons with
`source=microsite`; the deactivation lifecycle removing directory entry,
sitemap URL, tracking id and site folder together.

---

## 2026-08-20 — `31795f4` · Hindi and English throughout

**Added.** `tools/i18n-extract.js`, `js/i18n.js`,
`data/i18n/{en.json,hi.json,hi.js}`. The `EN / हिं` pill sits in the header and
footer of all 11 pages and the microsite template, is keyboard reachable,
reflects state with `aria-pressed`, and persists in `localStorage`.

**Marked up by tool, not by hand.** The extractor walks each page, stamps
`data-i18n` / `data-i18n-attr` keys onto the text a visitor actually reads, and
writes `en.json` verbatim from the current copy. 1,400 string instances collapse
to ~674 keys. A string used on three or more pages is recognised as chrome and
gets a `common.*` key, so the header and footer are translated once instead of
eleven times. It is idempotent and prunes keys whose copy no longer exists.

Two things it deliberately skips: **microsite template tokens** — an early run
keyed `{{name}}`, which would have replaced an advocate's own name on switching
language — and `<title>`/`<meta>`, which stay English because the page has one
URL and that is what Google indexes.

**Strings built in JavaScript** are written as `T('js.key', 'English')` and
collected from `js/*.js` into the same `en.json`. The English literal is the
fallback, so nothing can ever render a raw key. The result count became one
sentence with the number as a placeholder rather than a number glued to a label,
because Hindi puts "आगरा में" where English puts "in Agra" at the end.

**Content, not just chrome.** `categories` carry
`nameHi`/`blurbHi`/`topicsHi`; advocates carry
`aboutHi`/`highlightsHi`/`topicsHi`/`location.areaHi`; microsites carry
`taglineHi`/`longAboutHi`/`faqsHi`. All resolved through `VS.i18n.pick()` with
an English fallback. `home.js`, `directory.js` and `profile.js` rebuild their
DOM on a `vs:lang` event; `VS.money()` switches to the `hi-IN` locale. The
search index holds both languages, so `ज़मानत` and `bail` return the same
advocates.

**Microsites pre-render both languages** into the HTML and CSS shows one.
English stays visible with JavaScript off and is what a crawler reads first; a
field with no Hindi is emitted with no class at all, so it always shows rather
than going blank.

**Typography.** Noto Sans Devanagari sits second in both font stacks — after
Inter and Playfair, which have no Devanagari, and before the Latin serif
fallbacks so a system font with partial coverage cannot win. Under
`html[lang="hi-IN"]` headings get 1.45 line-height and letter-spacing is
dropped: matras sit above the line, conjuncts hang below it, and tracking that
flatters small-caps Latin just pulls conjuncts apart.

**URL parameter.** `?hl=hi` / `?hl=en` force a language. `?lang=` is honoured
for the two-letter codes only, because `?lang=` is **already** the directory's
spoken-language filter and uses full names (`?lang=Hindi`) — verified that the
filter still works and does not switch the UI.

**SEO decision, recorded in the README.** One URL, client-side toggle, Hindi not
separately indexed, no `hreflang` and no `/hi/` URLs. `<title>` and the meta
description stay English on purpose.

**Verified.** Nav, filters, sort, chips, counts, cards, the whole profile and
all four microsites render in Devanagari with no clipping and no console errors;
language persists across navigation; the English site and all six tracking
beacons behave exactly as before.

---

## 2026-08-20 — `cc033d7` · Honest social proof, real domain, paid-listing copy

**Domain.** Everything points at `https://vakilsaabagra.in` — the apex, matching
the microsite subdomains. `tools/set-domain.js` was extended to reach the
microsite template, the admin page, the string tables and the Functions, since a
canonical URL hiding in any of those is just as wrong. Zero occurrences of
`vakilsaabagra.com` remain.

**Invented social proof removed.** `rating` and `reviewsCount` are `null` on all
20 records and stay null until there is a real review pipeline:

- the star row and the `(146)` count render nothing rather than an empty
  five-star row, which reads as a bad review rather than as no review
- "Highest rated" and "Most reviewed" disappear from the sort control while no
  advocate has feedback, and come back on their own when one does
- `VS.sort` treats a null rating as absent instead of as zero — null arithmetic
  silently sorted everything into one indistinguishable blob
- `aggregateRating` is gone from the `Attorney` JSON-LD entirely
- "Top rated" is now **"Featured"**: it is about to become a paid slot, and
  asserting a ranking we cannot measure is the same problem in miniature
- the three home-page testimonials are gone — quotes attributed to named people
  about a directory with no users, strictly worse than the review counts
  *(confirmed with the owner before removing, since it changes a page section)*
- the copy citing "client ratings" on the home, about, FAQ and terms pages now
  says what is actually true, including inside the `FAQPage` JSON-LD

**The real offering, in words.** `list-your-practice.html` no longer says "Free
listing · No commission". It describes a fixed technology and listing service
fee, what the directory listing includes, what the microsite includes, and the
three billing terms. Nothing anywhere reads as pay-per-lead, commission, a share
of case fees or a referral cut — that wording is what Bar Council of India Rule
36 and the bar on fee-sharing turn on. The same correction was needed in
`faq.html`, which had "Listing is free" in both the visible copy and its
hard-coded JSON-LD.

**`terms.html` gains four sections**, in both languages: what we are (a
technology and listing service, not a law firm, no referrals, no share of any
fee), that we guarantee no number of enquiries, refund rules for the monthly and
prepaid plans, and what happens on non-renewal — profile out of the directory,
microsite subdomain stops serving, record kept so renewal restores both.

**Placeholders.** The stock example phone number is still there because
inventing one is worse; `js/config.js` carries a `TODO(subroto)` naming every
place it appears. The social links pointed at `facebook.com`'s own home page
while being published as schema.org `sameAs` — a machine-readable false claim
about who we are — so they are emptied and `home.js` omits `sameAs` when nothing
real is set. The contact email moved to the `.in` domain.

**Judgement call.** §1.1 said not to hardcode prices in user-facing copy; §5.5
said to show "the three plans". The plans and their trade-offs are described and
the figures are quoted on WhatsApp. Printing ₹800/₹600/₹500 is a one-line
change if that is preferred.

**Verified.** No stars, review counts, "client reviews" text or
`aggregateRating` anywhere; the four remaining sort modes all work; the new
listing and terms copy reads correctly in both languages; `featuredUntil` expiry
and the two-per-category cap both behave.

---

## 2026-08-20 — `ec43bf5` · README rewritten, decision log added

The README still described a GitHub Pages site with no Functions, no microsites,
no Hindi and a `.com` domain. It now describes what is here.

Replaced the hosting section with Cloudflare Pages, pointing at
`docs/DEPLOY.md` rather than duplicating it: where the D1 binding and
`ADMIN_TOKEN` live and what happens when they are missing, the onboarding
checklist, the renewal and reactivation table, how to pull a month and send the
Hindi WhatsApp message, and the wildcard-routing migration path past ~50
advocates.

**Added a "Decisions, and why" section** — the choices that are expensive to
reverse and easy to re-litigate: subdomains rather than paths; D1 rather than
KV; client-side Hindi on one URL with no `hreflang`; no ratings, reviews or
testimonials; a fixed fee and never a share; counting clicks without tracking
people.

Also: the daily build loop up front and which generated files to commit; a
truthful launch checklist naming the placeholder phone number, the unconfirmed
mailbox, the empty social links and the sample data; the field table saying
`rating`/`reviewsCount` are null on purpose and `featured` is capped at two per
practice area; the project layout with every new file; a legal note that spells
out the wording constraints instead of gesturing at them.

**Verified.** All 12 internal doc links and anchors resolve; no stale GitHub
Pages, `AggregateRating`, "listing is free" or `.com` references remain.

---

## 2026-08-20 — `dd5aaef` · Spoken-language names translated consistently

The microsite already rendered "हिन्दी / अंग्रेज़ी" for an advocate's languages,
while the directory filter and the profile's Practice details row still said
"Hindi / English" on a Hindi page — an inconsistency introduced in the previous
commits rather than a gap in the brief.

`VS.languageName()` resolves the label through the same wording the microsite
generator uses. The option **value** stays English so the filter keeps matching
what is in the data; only what a reader sees changes.

These keys are built from the data at runtime, so the extractor cannot see them
in a `T()` call and would have pruned them from `en.json`. They are declared
alongside the other generator-side strings, with a note to keep them in step
with `LANG_HI` in `tools/sync.js`.

Fields with no `*Hi` twin at all — courts, education, chamber address, chamber
hours, fee note — still fall back to English, which is the intended behaviour:
verified that no row renders blank and no raw key is ever visible.

---

## 2026-08-23 — Business card, front and back

The first printed piece for the business. Authored as HTML/CSS rather than in a
design tool so it reuses the site's tokens directly — navy `#0f2540` →
`#081527` gradient, gold `#b0861f`/`#dcb85f`, Playfair Display for names,
Inter for everything else, the hero grid wash and the gold hairline the site
draws along a card's top edge. The logo mark is inlined from
`tools/logo-mark.svg`, so it stays vector-sharp at any print size.

**Geometry.** 3.5in × 2in — the standard both Indian and US printers cut to —
authored at 1050 × 600 CSS px so 1px is exactly 1/300in, and shot at
`deviceScaleFactor 2`. The PNGs are therefore 2100 × 1200: 600 DPI at final
size, double the 300 DPI a printer asks for.

**Front** is the brand face only: mark, wordmark, gold rule, `AGRA · ADVOCATE
DIRECTORY`, and `vakilsaabagra.in` along the bottom. **Back** carries the
information in four bands — masthead, founders, contact, footer — spaced by
`justify-content: space-between` rather than fixed margins, so the balance
survives a line of content being added or removed. The right-hand column is
mirrored (right-aligned, icons outboard) so the card reads edge to edge instead
of trailing off into white space.

**Content.** Founders Subroto Banerjee and Dipanshu Sarovar, both *Co-founder*.
Phone `+91 89544 02360`, grouped 5-5 as Indian mobile numbers are written.
`A Wrath Labs venture` in the footer. The Instagram and X rows are deliberate
empty slots — icon plus a dashed rule — because no profiles exist yet; that is
the same position outstanding item 3 takes for the site.

**Rendering.** `node tools/business-card/render.js` shoots both faces with the
local headless Chrome. A screenshot cannot wait on a network font, so the
script downloads Inter and Playfair once, caches them under the system temp
dir, inlines them as `data:` URIs and renders a copy of the page with no
network dependency at all — the same PNG comes out offline as online. The
committed HTML keeps its ordinary Google Fonts `<link>` so it still previews
correctly in a browser.

**Documented** in the README: the card in the brand-assets table, the render
command beside the logo-regeneration one, `tools/business-card/` in the file
map, and a decision-log note on why print collateral is authored in HTML
against the site's tokens rather than redrawn in a design tool.

**Note.** The card carries the real phone number. The site still carries the
stock `+919876543210` in 55 places (outstanding item 1) — the two now disagree,
which makes that item more urgent than it was.

---

## 2026-08-23 — Complete brand kit

**What it is.** `assets/brand/` — 82 generated files, 22 vector and 54 raster:
every logo lockup and finish, the icon set, social banners at each platform's
exact pixel size, A4 print pieces, the palette in four export formats, and a
written guide at `assets/brand/BRAND.md`. Sources in `tools/brand/`, built with
`npm run brand`.

**One geometry source.** `tools/brand/build-logos.js` holds the mark's
strokework once and generates twenty-two SVGs from it — horizontal, stacked
and wordmark lockups in light, dark and three monos, plus six marks and the
favicon. The mark cannot drift between the favicon, the business card and the
LinkedIn banner because there is only one copy of it. Colours and copy come
from `tools/brand/tokens.js`, which is also what generates the four token
exports.

**The favicon is a different drawing on purpose.** At 16px the hooks, chains
and base steps of the real mark turn to mud, so `icon/favicon.svg` keeps only
the beam, post, pans and boss, at heavier stroke weights. It is used at 64px
and below; the real mark takes over at 180px.

**The dark lockups drop the tile.** A navy rounded square on a navy background
is a rectangle of nothing, so `-dark` is the gold drawing alone. Three mono
finishes exist for one-ink print, embroidery and any background out of our
control.

**Rendering.** `tools/brand/render.js` shoots the HTML templates and the SVGs
in headless Chrome at 2x and downsamples to spec with `sips`, so the file on
disk is supersampled *and* exactly the size the platform asks for — no
resizing before upload. Print pieces set `dpiScale` instead and keep the
enlargement: the A4 letterhead and poster come out 2481 × 3507, which is A4 at
300 DPI. Fonts are inlined as `data:` URIs and cached, the same trick the
business-card renderer uses, so the render is identical offline.

**Light and dark from one template.** A banner is one HTML file rendered twice
with `?t=light` and `?t=dark` rather than two files that drift. The theme
script *replaces* the class rather than adding it — adding leaves both `.dark`
and `.light` matching, which silently hid the logo on every light variant until
it was caught by looking at the output.

**Safe areas are designed for, not hoped for.** The X header keeps its left
third clear below the midline where the avatar sits. The Facebook cover holds
everything inside a centred 1180 × 560 box because the desktop crop is 820 ×
312. The YouTube banner composes inside the centred 1546 × 423 that a phone
shows. The Instagram story stays 260px clear top and bottom.

**Contrast is measured, not asserted.** `tools/brand/check-contrast.js` prints
the WCAG ratio for all thirteen pairings the brand uses and exits non-zero if a
body-text pairing drops below 4.5:1. Two findings, both recorded in BRAND.md
rather than papered over:

  - `--gold` (`#b0861f`) is **3.35:1** on white. It clears AA for large text
    and rules but not for body copy, and the token comment claiming otherwise
    was corrected.
  - `--muted-2` (`#7a8ba0`) is **3.48:1** on white — not a text colour at any
    size. `css/styles.css:347` uses it for the inactive language-toggle label
    at `.74rem`, which is below AA. Left alone: repainting the live site is not
    the brand kit's call. Moving that one rule to `--muted` fixes it.

**No listing count anywhere.** The banners say what the directory is for, never
how many advocates are in it. The number changes monthly and the records are
still the twenty samples of outstanding item 4; a count on a banner would be
the same invented social proof `cc033d7` removed.

**Devanagari is raster-only.** The SVG lockups carry `textLength` instead of an
embedded font, so a renderer without Playfair falls back to Georgia and lands
on the same width — the layout survives, the letterforms do not. That trade
does not work for Devanagari, where conjuncts and matras do not survive a
fallback at all, so `logo-horizontal-hi-*.png` is shot with Noto Sans
Devanagari loaded and has no SVG counterpart.

**The kit is additive.** `assets/logo.png`, `assets/og-image.png` and the icons
the pages reference are untouched and still come from `tools/*.svg`. Pointing
the site at the kit also means changing the `width`/`height` on the two `<img>`
tags that carry the lockup, because the new one is a different aspect ratio —
a visible change on every page, so it is left as a decision rather than taken
as a side effect. Recorded in the README.

**A shareable guide.** `tools/brand/build-guide.js` writes `brand-guide.html`,
the whole kit on one self-contained page: the logos inlined as live vector, the
favicon strip at actual pixel size beside the full mark at the same sizes so the
simplification argues for itself, the contrast table computed at build time from
the same tokens, and the banner previews embedded as data URIs. Its two themes
are the brand's own two grounds — warm paper and the navy — rather than an
inversion. Gitignored at about 1.2 MB, and published at
<https://claude.ai/code/artifact/77f880b7-885e-405c-af06-5cd5e34a3314>
— private until shared, and a snapshot rather than a live view, so it needs
republishing to the same URL after a token changes.

**Verified** by rendering all 54 raster files and looking at them, twice: the first
pass caught the SVG inliner stripping `width`/`height` from *every* element
rather than the root `<svg>`, which collapsed the mark's tile and its base and
pan plates to nothing across the whole kit, and the second caught the theme
class bug above.

---

## Outstanding

Carried forward until done. Also in the README launch checklist.

| # | Item | Where |
|---|---|---|
| 1 | **The phone number is not real.** `+919876543210` is the stock example number — 4 references in `js/config.js` and 51 written directly into HTML across 11 pages. `grep -rn 9876543210` | `js/config.js:12` |
| 2 | Confirm `hello@vakilsaabagra.in` exists and forwards somewhere read | `js/config.js:20` |
| 3 | Fill in or delete the social links (empty means no `sameAs` is published, which is correct until real profiles exist) | `js/config.js:40` |
| 4 | Replace the 20 sample advocates — all carry `chambers@example.com` and `+9199990000xx` — then set `demoNotice: false` | `data/lawyers.json`, `js/config.js:51` |
| 5 | The four demo microsites (`ramesh`, `neha`, `deepak`, `rajeev`) have hand-written sample bios; delete or overwrite them when real advocates sign up | `data/lawyers.json` |
| 6 | Manual hosting steps not attempted by design: nameservers, Pages project, custom domains, D1 binding, `ADMIN_TOKEN` | `docs/DEPLOY.md` Part 1 |

**Verified as far as is possible locally, needing Cloudflare to finish:**
subdomain serving (30 middleware assertions pass and microsites render when
served directly, but "subdomain visible in the address bar" needs the custom
domain to exist) and D1 writes (33 assertions pass against the real
`schema.sql` via `node:sqlite`, but the binding is set in the dashboard).
