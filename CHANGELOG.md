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

## 2026-08-24 — Real phone number and email

**What changed.** `+919876543210`, the stock Indian example number, is replaced
everywhere by `+918954402360`, and `hello@vakilsaabagra.in` — a mailbox that was
never confirmed to exist — by `subroto.2003@gmail.com`. Outstanding items 1 and
2 are done. Items 3, 4 and 5 are deliberately left as they are: the social links
stay empty, the twenty sample advocates stay, and the four demo microsites stay.

**Four forms, not one.** The number is written four different ways and all four
had to move together, which is why this is 142 occurrences across fourteen
files rather than the one line in `js/config.js` that ought to own it:

| form | where |
|---|---|
| `+918954402360` | `tel:` links, `config.phone` |
| `918954402360` | `wa.me/` links, `config.whatsapp` |
| `+91 89544 02360` | visible text, aria-labels, `config.phoneDisplay` |
| `91-89544-02360` | `data-i18n` key slugs, and their entries in `en.json` and `hi.json` |

**The translation keys carry the digits.** `tools/i18n-extract.js` slugs a key
from the English text it marks up, so five keys had the old number baked into
their names — `faq.call-91-98765-43210` and friends — and the Hindi strings they
point at spell the number out in full. Renaming the key in the HTML without
renaming it in both string tables would have silently dropped the Hindi for
those lines; `tools/sync.js` warns about stray keys but a *missing* one just
falls back to English, which is the failure that does not announce itself. All
three were changed in the same pass. `node tools/i18n-extract.js --report` now
reports 0 strings needing markup and no orphans, and `npm run sync` still counts
711 Hindi strings with 4 English — the same numbers as before the change, which
is the check that nothing was lost.

The four that stay English are correct: the brand name twice, the
`Language / भाषा` toggle label, and the email address itself.

**The brand kit already had it right.** `tools/brand/tokens.js`, the business
card and the three print pieces have carried `+91 89544 02360` since they were
authored — that is the disagreement the business-card entry above flagged as
making item 1 more urgent. The site now matches the card, and none of the 54
rendered PNGs in `assets/brand/` needed re-rendering.

**The email is a personal Gmail, knowingly.** It goes on the contact page and
into the JSON-LD as the LocalBusiness `email` (`js/home.js:166`), so it is a
public address and will be scraped. A dedicated mailbox on the domain would be
better and remains worth doing; the advantage of this one is that it is real and
read today, which the previous address was not. Recorded in `js/config.js` and
the README rather than left as a silent choice.

**Verified** by serving the site and loading it in a headless browser: the
contact page resolves `tel:+918954402360`, `wa.me/918954402360` and
`mailto:subroto.2003@gmail.com`, the `data-cfg` targets fill from the config,
the injected JSON-LD carries the real `telephone` and `email`, and no page
contains the string `98765` or `hello@vakilsaab` any more. `sameAs` is still
absent from the JSON-LD, which is correct while the social links are empty. The
one console error under `npm run serve` is the documented `501` from
`/api/track`, which has no Function behind it under a plain static server.

The `+919999000xx` numbers still on the directory and the microsites are the
sample advocates' own — outstanding item 4, deliberately untouched.

---

## 2026-08-24 — Everything editable from JSON, and the prices published

**The problem.** Changing the phone number touched 142 places across fourteen
files. That is not a phone-number problem, it is a structure problem: the site's
content lived in its markup, so every edit was a find-and-replace with a chance
to miss one. This moves all of it into `data/`, and makes `npm run build` write
the HTML.

**Three new source files.**

| File | Owns |
|---|---|
| `data/site.json` | business details, the header nav, the mobile drawer, the three footer link columns, and the `demoNotice` / `showPricing` flags |
| `data/pricing.json` | the plans, what each costs, the badge, the footnotes |
| `data/theme.json` | every brand colour, the four microsite accents, and which sections a microsite renders in what order |

And one existing file changed job: **`data/i18n/en.json` is now the source for
page copy, not a mirror of it.** It used to be generated from the markup by
`tools/i18n-extract.js`. The new `tools/content.js` runs the other way and puts
all 1271 marked strings back into the pages. The two tools are inverses, share
the same `slug()`, and you want different ones at different times — extract
after writing new markup, `content` after editing the JSON. Both directions are
documented in the README.

**`js/config.js` is now generated** from `data/site.json` and says so at the top.
`phoneDisplay` is derived rather than stored, so there is no longer a display
form that can disagree with the number people dial.

**What the build does now.** `npm run content && npm run sync && npm run build:css`:

```
data/site.json     ─┬─→ js/config.js
                    ├─→ header nav + mobile drawer      (all 11 pages)
                    └─→ footer link columns             (all 11 pages)
data/pricing.json  ──→ the plan table on list-your-practice.html
data/theme.json    ─┬─→ the :root tokens in css/styles.css → css/tailwind.css
                    ├─→ the microsite accent stylesheets
                    └─→ microsite section order, sticky contact bar
data/i18n/en.json  ──→ the text of every data-i18n element
data/lawyers.json  ──→ dataset, sitemap, microsites, id list
```

`npm run check` reports what a build would change without writing anything.

---

### The phone number, properly this time

Four mechanisms, because the digits were hiding in four different kinds of place:

  1. **`tel:`, `wa.me/` and `mailto:` hrefs** are rewritten unconditionally.
     Safe because every one of them on a static page belongs to the business —
     advocate links are rendered by `js/*.js` from the dataset and never appear
     in these files. A `?text=` prefill is preserved.
  2. **`{phone}` and `{email}` tokens** replace the digits inside the string
     tables. Six English strings and five Hindi ones mentioned the number;
     none of them contain a digit now. `tools/content.js` expands them into the
     static HTML — so a crawler and a JavaScript-off browser still see real
     digits — and `js/i18n.js` expands them again at runtime through the single
     `hi()` chokepoint. English and Hindi can no longer disagree about the
     number, which they could before and nothing would have caught it.
  3. **Five translation keys were named after the digits** —
     `faq.call-91-89544-02360` and friends, because the extractor slugs keys
     from the English. Renamed to `faq.call-phone` and the like, in the HTML and
     both string tables.
  4. **The bare numeral inside the call buttons** carries no key at all:
     `tools/i18n-extract.js` skips bare numbers by design, which is how three
     copies per page sat outside both systems. They are all inside a `tel:`
     link, so they go with it.

Anything left over that looks like a phone number and is not the one in
`site.json` is named in the build output. **Verified** by changing the number in
`data/site.json` alone, rebuilding, and finding zero occurrences of the old one
anywhere in `*.html`, `js/`, `data/` or `sites/` — then changing it back. The
stray-number check runs *after* the copy is applied, not before; checking earlier
made it read un-expanded `{phone}` tokens and warn on all eleven pages of a
correct change, which would have trained you to ignore it.

The brand kit is deliberately **not** wired to `site.json`. A print run is an
act, not a build artefact, and `tools/brand/tokens.js` already had the right
number.

---

### Prices, published

`list-your-practice.html` said "message us for the current figures". It now
carries the table, from `data/pricing.json`:

| Plan | Listing | Microsite | Both |
|---|---|---|---|
| Monthly | ₹200 | ₹600 | ₹800 |
| Six months | ₹150 | ₹450 | ₹600 |
| Yearly | ₹100 | ₹400 | ₹500 |

The "both together" figure is **computed**, not stored, so it cannot drift from
its two parts. The plan ids match the `listing.plan` values in
`data/lawyers.json`. The Terms of Use link on the refund footnote survived the
rewrite as a real link rather than becoming plain text — the refund terms have to
stay reachable from the price.

`flags.showPricing: false` hides the figures and restores the "ask us" lede,
keeping the plan names and descriptions. The flag works in **both** directions:
an earlier draft simply left whatever markup was on the page when hiding, which
meant it worked exactly once.

The "To be plain about it" note — not a law firm, not an intermediary, no share
of your fee — is hand-written and was left alone. It is positioning, not price.

Ten new strings, all translated into Hindi in the same pass. `npm run sync`
reports 718 translated and 4 English, up from 711/4; the four that stay English
are the brand name twice, the already-bilingual `Language / भाषा` label, and the
email address.

**One accessibility fix taken while writing it:** the "per month" label uses
`--muted`, not `--muted-2`. At `text-xs`, `--muted-2` is the 3.48:1 pairing the
brand kit's contrast check flagged as failing AA at any size.

---

### Contrast that cannot go stale

`data/theme.json` drives the `:root` brand tokens, written into `css/styles.css`
between two markers. The **WCAG ratio in each comment is measured at build time**
against `--paper`, and each text token is labelled AA / large-text-only / fails.

This is a direct response to the brand-kit entry above, where a token comment
claimed a contrast the colour did not have. Change `--gold` to purple and the
next build tells you the truth about purple. `_brandNotes` in the JSON is for
description only; writing a ratio there is how the last one went stale.

---

### Microsite shape, from JSON

`templates/microsite.html` now marks its removable sections with
`<!-- @section:name -->`. `data/theme.json` → `microsite.sections` lists what to
emit and in what order, and an advocate's own `microsite.sections` array
overrides it for that one site — two advocates can have differently shaped pages
without a second template. `stickyContactBar` is an `@optional` block on the
same mechanism.

Dropping a section also **drops its link from the hero nav**. The nav points at
`#about`, `#practice`, `#chamber` and `#faq`, and a link to a section that is no
longer rendered is the kind of thing nobody notices until an advocate taps it on
their own site.

The four accents moved out of `tools/sync.js` into the JSON. Add a fifth and
`"accent": "forest"` starts working with no code change; an unknown name warns
and falls back to the default rather than silently rendering brand gold.

---

### The FAQ structured data is derived now

`index.html` and `faq.html` each carried a hand-written `FAQPage` JSON-LD block
duplicating the accordion — 5 and 19 questions. It is now rebuilt from the
accordion on the same page at build time, which is what Google requires and what
was quietly not true: the JSON-LD still held the old phone number after the
contact details changed, because nothing connected the two copies.

The extraction reads the **visible text**, not the `data-i18n` values. Keying off
the values dropped a whole Q&A from `index.html` — the "how do I get listed"
answer is three spans around a phone link and has no key of its own. What the
visitor reads is the thing Google has to be told.

---

### Smaller things this turned up

- **The mobile drawer was never translated.** Its seven links carried no
  `data-i18n` at all, so the whole drawer stayed English on the Hindi site. The
  generated markup gives them the same keys the header uses; the Hindi already
  existed.
- **`aria-current="page"`** is now set in the drawer as well as the header.
- **`data-cfg` fallbacks** — the contact page's email and phone spans that
  `js/ui.js` fills at runtime — are filled at build time too. The value in the
  source is what a crawler and a JavaScript-off browser read, and it was the last
  stale email on the site.
- **A footer locality chip that matches no live advocate** now warns at build
  time. The link looks fine and only fails when somebody taps it and gets an
  empty filter.
- **Dead translation keys** are reported, and `--prune` drops them from both
  tables. Reported rather than deleted by default, because an entry in `hi.json`
  is somebody's work.

---

### Verified

`npm run build` twice in a row: the second is a no-op, which is the property
that makes the whole thing safe to run on every commit. Then all thirteen pages —
eleven directory pages and two microsites — loaded in a headless browser and
checked for: no `98765`, no old email, no un-expanded `{phone}` or `{email}`, no
leaked `{{token}}` or `@section:` marker, the right `tel:` per page (the business
number on directory pages, the advocate's own on microsites), no dangling
in-page anchor, exactly one `h1`. The only console error is the documented `501`
from `/api/track`, which has no Function behind it under a plain static server.

End to end, changing a nav label, adding a footer link, changing a price and
changing a brand colour — each in JSON only — all reached the pages; and a
deliberately planted `+91 77777 88888` produced the warning it should.

**Not done, and worth saying:** the page *structure* is still HTML. This makes
every word, link, price, colour and contact detail JSON-driven, and the microsite
sections orderable — it does not turn the layout into a page builder. Adding a
new kind of section to a directory page is still an HTML edit, followed by
`node tools/i18n-extract.js` to pull its strings out.

---

## 2026-08-24 — A pricing page, in the navbar

**What it is.** `pricing.html`, the twelfth page, and a **Pricing** item in the
header nav and the mobile drawer on all of them.

**It has no hand-written body.** Every section between an `<!-- @auto:name -->`
pair is rendered from `data/pricing.json` — the hero, the plan table, the two
"what you get" lists, the billing and leaving terms, a six-question FAQ about
the fee, and the closing WhatsApp call to action. It is the worked example for
the JSON-driven build in the entry above: the file on disk is a shell and six
markers.

**The full table is on this page and only this page.** The block on
`list-your-practice.html` became a one-line summary and a link. Two pages
carrying the same nine figures is two pages Google has to choose between, and
the listing flow is about the process, not the price.

**The "what you get" cards were duplicated and now are not.** They were
hand-written on `list-your-practice.html`; the new page needed the same content.
Rather than a second copy they moved into `pricing.json` → `includes` and both
pages render from it. `includesCards(false)` drops the heading on
`list-your-practice`, which already has one of its own above the lede.

**A note on placing it in the nav.** The prices concern advocates; visitors
looking for a lawyer pay nothing, and `about.html`, `faq.html` and the footer all
say so. A top-level **Pricing** link is therefore read by the wrong audience
first. The page opens by saying so, in a panel above the fold:

> If you are looking for a lawyer, this page is not for you — searching,
> filtering and contacting an advocate is free, there is no account, and we take
> no share of any fee you agree with them.

That is a mitigation, not a fix; if enquiries start arriving asking whether the
site charges, the nav item is the thing to remove.

---

### `{from}` is a token, like `{phone}`

The summary line reads "starts at ₹100 a month". Written literally that would
have put the figure into a translation key's *name* and its value in two string
tables — the exact staleness the phone number cost 142 replacements to undo. So
`{from}` joins `{phone}` and `{email}`: computed as the cheapest listing rate
across the plans, published as `priceFrom` in the generated `js/config.js`, and
expanded by `tools/content.js` at build time and `js/i18n.js` at runtime.
Change the yearly rate and the sentence follows, in both languages.

### Keys are reused when the English already exists

`keyFor()` now looks for an existing key with the same English before minting a
new one — same scope first, then `common.*`, then anywhere, sorted so the choice
is deterministic. Without it the shared "what you get" lists minted 39
`pricing.*` duplicates of `listing.*` strings that were already translated, and
39 lines would have silently reverted to English on the Hindi site.

### The sitemap comes from `data/site.json`

`tools/sync.js` had the static page list hardcoded, so a new page would have
rendered, linked and never been submitted. The list moved to
`site.json` → `sitemap.pages`, and sync now warns about any `.html` in the repo
root that nobody listed:

```
! guides.html is not in data/site.json sitemap.pages — it will not be submitted
```

`404.html` and `lawyer.html` are exempt — one is an error page, the other a
template with no content of its own. 41 URLs → 42.

---

**Verified.** Build is idempotent; `npm run check` clean. All thirteen pages
loaded headless: no `{phone}`/`{email}`/`{from}` leaks, no `{{token}}`, Pricing
present in both the header nav and the drawer on all twelve directory pages,
`aria-current` correct, no dangling anchors, one `h1` each. The Hindi pass on
`pricing.html` renders the nav as `शुल्क`, the h1 as `लिस्टिंग का ख़र्च कितना है`,
no `pricing.*` string left in English, and `{from}` expanding to ₹100 inside a
Hindi sentence on `list-your-practice.html`. Both pages were looked at, which is
how the doubled heading was caught. 33 new strings, all translated; Hindi
coverage 718 → 750, still the same 4 deliberate English ones.

---

## 2026-09-12 — Business card: founders' numbers, real socials, larger type

**Front.** `vakilsaabagra.in` along the bottom goes from 17px to 28px, weight
500 → 600, opacity .82 → .92, and sits 4px lower to keep its gap from the
tagline. At the card's 1px = 1/300in that is 4.1pt → 6.7pt.

**Back, founders.** The two `Co-founder` lines are gone; each founder carries
their own number in that place, with a gold phone icon — Subroto
`+91 89544 02360`, Dipanshu `+91 85338 93530`, both grouped 5-5 like the rest
of the brand. The right-hand number mirrors the left (icon outboard), the same
treatment the column already had. Names 24 → 28px, numbers 23px semibold with
tabular figures.

**Back, contact.** The phone row is removed — the numbers now live under the
names — and so is the empty X slot. What is left is one row of three, pinned
left, centre and right: `vakilsaabagra.in`, `@vakilsaabagra` (Instagram) and
`facebook.com/vakilsaabagra`. The Instagram and Facebook slots were dashed
blanks until now; these are the real handles. Type 17 → 21px, icons 17 →
21px. The Facebook icon is the outline glyph from the same stroke set as the
globe and Instagram icons rather than Meta's filled logo, so the row reads as
one family. The `.row.blank` styles and the even-child mirroring that the old
2×2 grid needed are deleted.

**Back, footer.** A second credit line under the first: `A Wrath Labs venture`
/ `Marketed by Sarovar Marketing Hub`. The footer goes 10 → 12px with tracking
eased from .2em to .16em so the longer line fits. It is now all `--muted`
instead of partly `--muted-2`, which is the 3.48:1 pairing the brand kit
flagged as failing AA at any size.

**Files:** `tools/business-card/back.html`, `card.css` (which carries the
front-face change too — `front.html` itself is untouched), and both PNGs
re-rendered with `node tools/business-card/render.js`.

**Verified** by rendering both faces (2100 × 1200 each, unchanged) and looking
at them: nothing collides or wraps, the three contact entries fit the 906px
measure with about 90px between them, and both founder numbers line up on the
same baseline.

**Not changed, and worth knowing.** The site still has `data/site.json` →
`social` empty (outstanding item 3), so the card now publishes handles the
site does not link or put in `sameAs`. `tools/brand/tokens.js` still has only
`A Wrath Labs venture` as `parent`, so the letterhead and email signature do not
carry the Sarovar Marketing Hub credit.

---

## Outstanding

Carried forward until done. Also in the README launch checklist.

In order: 1 blocks 2, and 2 blocks everything public.

| # | Item | Where |
|---|---|---|
| 1 | **Register `vakilsaabagra.in`.** It is not bought yet — confirmed available at the NIXI registry on 2026-08-24. Every canonical, the sitemap, the microsite hosts and the printed business card already say it | any accredited registrar |
| 2 | Cloudflare setup. 1.2, 1.4 and 1.5 (Pages project, D1, `ADMIN_TOKEN`) need no domain and can be done now; 1.1 and 1.3 (nameservers, custom domains) wait for item 1 | `docs/DEPLOY.md` Part 1 |
| 3 | Fill in the social links. The handles now exist and the business card carries them — Instagram `vakilsaabagra`, `facebook.com/vakilsaabagra` — but the site has them empty, so no `sameAs` is published yet | `data/site.json` → `social` |
| 4 | Replace the 20 sample advocates — all carry `chambers@example.com` and `+9199990000xx` — then set `flags.demoNotice: false` | `data/lawyers.json`, `data/site.json` |
| 5 | The four demo microsites (`ramesh`, `neha`, `deepak`, `rajeev`) have hand-written sample bios. Do **not** add their slugs as Cloudflare custom domains — no subdomain exists and the apex `robots.txt` disallows `/sites/`, so they are unreachable today, and a custom domain is exactly what would make a sample advocate look real | `data/lawyers.json` |
| 6 | A mailbox on the domain, to replace the personal Gmail now published in the JSON-LD | `data/site.json` → `business.email` |

**A note on deploying to `*.pages.dev` before item 1.** Every page carries
`<link rel="canonical" href="https://vakilsaabagra.in/">` and
`robots: index, follow`. Production `pages.dev` URLs are crawlable — only preview
deployments get an automatic noindex — so Google can crawl the preview and be
told the canonical is a domain that does not resolve. Small risk in practice,
nothing links to a fresh `pages.dev` URL, and it vanishes when the domain is
live. It is the reason to buy the domain first rather than last.

**Done.** The phone number and the contact email (both 2026-08-24) were the first
two items on this list; both are now real, and the structure that made them hard
to change is gone.

**Verified as far as is possible locally, needing Cloudflare to finish:**
subdomain serving (30 middleware assertions pass and microsites render when
served directly, but "subdomain visible in the address bar" needs the custom
domain to exist) and D1 writes (33 assertions pass against the real
`schema.sql` via `node:sqlite`, but the binding is set in the dashboard).
