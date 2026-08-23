# Vakil Saab Agra

A static, light-theme directory of advocates practising in **Agra, Uttar Pradesh**,
readable in Hindi or English. Plain HTML + Tailwind CSS + vanilla JavaScript —
no framework, no bundler, no runtime dependency. Advocates are added by editing
one JSON file.

Three things run at the edge on Cloudflare Pages Functions, and only those
three: an anonymous click counter, its admin read-out, and the host routing that
serves each paying advocate's microsite on its own subdomain.

| I want to… | Go to |
|---|---|
| add or renew an advocate | [Adding an advocate](#adding-an-advocate), then [docs/DEPLOY.md](docs/DEPLOY.md#part-2--onboarding-a-new-advocate) |
| understand what it costs an advocate | [Plans and billing](#plans-and-billing) |
| set the whole thing up from scratch | [docs/DEPLOY.md](docs/DEPLOY.md#part-1--one-time-setup) |
| send someone their monthly numbers | [Reading a month back](#reading-a-month-back) |
| edit the Hindi | [Hindi and English](#hindi-and-english) |
| know why it is built this way | [Decisions](#decisions-and-why) |
| see what changed and when | [CHANGELOG.md](CHANGELOG.md) |

---

## Quick start

```bash
npm install            # tailwindcss, the only dependency, and it is dev-only
npm run build          # validate data → publish → generate microsites → CSS
npm run serve          # → http://localhost:5173
```

Any static server works; the site needs one because it fetches a JSON file.
Opening `index.html` straight off disk (`file://`) also works — the data layer
falls back to `data/lawyers.fallback.js` when `fetch()` is blocked by the
browser's file:// security rules, and the Hindi arrives the same way.

Two things do **not** work under a plain static server, because they are
Cloudflare Pages Functions: `/api/track` (you will see a 501 in the console,
which is harmless) and microsite host routing. To exercise those locally:

```bash
npx wrangler pages dev .
```

Otherwise open a generated microsite directly at
`http://localhost:5173/sites/<slug>/index.html`.

---

## Adding an advocate

Everything lives in **`data/lawyers.json`**. Copy an existing entry in the
`lawyers` array, change the values, then run:

```bash
npm run sync
```

That one command validates the file, works out who is currently live,
publishes `data/lawyers.public.json` and `data/lawyers.fallback.js`, generates a
monogram avatar for the new advocate, rewrites `sitemap.xml`, and prints a
renewal reminder for anyone expiring soon.

### The fields

| Field | Required | Notes |
|---|---|---|
| `id` | ✅ | lowercase-kebab-case, unique. Becomes the URL: `lawyer.html?id=<id>` |
| `name` | ✅ | e.g. `"Adv. Neha Sharma"` |
| `photo` | ✅ | `assets/lawyers/<id>.svg` — see *Photos* below |
| `experienceYears` | ✅ | number |
| `primaryCategory` | ✅ | a `slug` from the `categories` array; must also appear in `categories` |
| `categories` | ✅ | array of category slugs |
| `topics` | ✅ | the specific matters they take on — these drive search |
| `about` | ✅ | 2–4 sentences, written plainly |
| `phone` / `whatsapp` | ✅ | E.164 format, e.g. `+919876543210` |
| `enrollment` | ✅ | Bar Council number, e.g. `UP/02847/2002` |
| `location.area` | ✅ | locality in Agra — powers the area filter |
| `location.address` | ✅ | full chamber address |
| `consultationFee` | ✅ | number; `0` renders as "Free first consult" |
| `highlights`, `courts`, `languages`, `education`, `feeNote`, `availability`, `email` | | optional but they make the profile far stronger |
| `rating`, `reviewsCount` | | **`null` on every record on purpose.** There is no review pipeline, so the star row and the count render nothing at all rather than an empty five-star row. Set them only from real, verified feedback |
| `verified`, `featured` | | booleans. `featured: true` puts them on the home page. Maximum **two per practice area** — `sync` refuses a third |
| `featuredUntil` | | `YYYY-MM-DD` or `null`. Once it passes, the featured slot stops showing — the record is not touched |
| `listing` | ✅ | billing block, see *Plans and billing* below |
| `microsite` | ✅ | microsite block, see *Microsites* below |

`sync` will refuse to write if an `id` is duplicated, a category slug is
unknown, or a required field is missing — so a typo can't quietly break the site.

### The loop, every time

```bash
# 1. edit data/lawyers.json
# 2. build — validates, publishes, regenerates microsites, compiles CSS
npm run build
# 3. read the output: who is live, who expires soon, what was generated
# 4. commit and push; Cloudflare Pages redeploys on its own
git add -A && git commit -m "Add Adv. …" && git push
```

`npm run build` is `npm run sync` followed by `npm run build:css`. Run the whole
thing — `sync` alone leaves the stylesheet behind when you have added a class,
and `build:css` alone leaves the data behind.

If validation fails, nothing is written. The error names the field and the
advocate, so fix and run again.

Commit the generated files (`data/lawyers.public.json`,
`data/lawyers.fallback.js`, `data/i18n/hi.js`, `css/tailwind.css`, `sites/`,
`sitemap.xml`, `functions/_ids.js`, `functions/_slugs.js`). Cloudflare does run
the build, but committing them keeps `file://` and `npm run serve` working
without one, and keeps the diff honest about what changed.

### Photos

If `photo` points at a `.svg` that does not exist, `npm run sync` generates a
tasteful navy-and-gold monogram from the advocate's initials. To use a real
photograph instead, drop the file in `assets/lawyers/` and point `photo` at it:

```json
"photo": "assets/lawyers/neha-sharma.jpg"
```

Square images, 400×400 or larger, work best.

### Adding a practice area

Add an entry to the `categories` array in `data/lawyers.json` (`slug`, `name`,
`icon`, `blurb`, `topics`), then run `npm run sync`. Two places reference
categories statically and need a manual touch-up: the `practice-areas.html`
page and the footer's practice-area list.

Available `icon` values: `shield`, `heart`, `home`, `scale`, `receipt`,
`briefcase`, `cart`, `users`, `car`, `lock`, `calculator`, `file`.

---

## Plans and billing

Every advocate record carries a `listing` block. It is the only place the
commercial state of a listing is recorded, and it never reaches the browser —
`tools/sync.js` strips it out when it publishes the dataset.

```json
"listing": {
  "plan": "yearly",          // monthly | halfyearly | yearly | none
  "paidUntil": "2027-03-31", // YYYY-MM-DD, required unless plan is "none"
  "active": true,            // false hides the advocate from the directory entirely
  "onboardedOn": "2026-03-31"
}
```

### Prices

A **fixed technology and listing service fee**, billed in advance. It is not a
per-enquiry charge, not a commission, and not a share of any fee the advocate
charges a client — see the note under *Legal note* below, and keep it that way.

| Plan | Total / month | Listing | Microsite |
|---|---|---|---|
| Monthly | ₹800 | ₹200 | ₹600 |
| 6-month | ₹600 | ₹150 | ₹450 |
| Yearly | ₹500 | ₹100 | ₹400 |

These numbers live here and nowhere else in the codebase. Nothing user-facing
quotes them yet.

### Expiry

`npm run sync` treats an advocate as **live** only while
`listing.active !== false` **and** `listing.paidUntil` has not passed. Anyone
who is not live is left out of `data/lawyers.public.json`,
`data/lawyers.fallback.js`, `sitemap.xml` and microsite generation — but stays
in `data/lawyers.json`, so the record survives a lapse and a renewal is a
one-line edit.

The same command prints who has already expired and who expires within fifteen
days, sorted by date. That printout is the renewal reminder; read it every time
you build.

---

## Microsites

Every advocate record also carries a `microsite` block. `enabled` is only ever
`true` for an advocate who has paid for one.

```json
"microsite": {
  "enabled": true,
  "slug": "ramesh",              // → ramesh.vakilsaabagra.in
  "tagline": "Bail and sessions trials in Agra since 2002",
  "longAbout": "…",              // a longer, richer bio — NOT a copy of "about"
  "faqs": [{ "q": "…", "a": "…" }],
  "accent": "navy"               // gold | navy | teal | maroon
}
```

`slug` must be 3–30 characters of `a–z`, `0–9` and `-`, unique across all
advocates, and not one of the reserved infrastructure labels (`www`, `api`,
`admin`, `mail`, `stats`, …) that `tools/sync.js` refuses.

`longAbout` is required when `enabled` is `true`, and `sync` will reject it if
it is byte-identical to `about`. That is deliberate: Google treats a subdomain
as a separate site, so a microsite that merely repeats the directory profile
gets both pages treated as duplicates and neither ranks.

---

## Business details

Phone number, WhatsApp, email and address appear in one place: **`js/config.js`**.
Change them there and every page updates — header, footer, contact page and the
structured data Google reads.

```js
phone: '+919876543210',          // TODO(subroto): stock example number, not real
phoneDisplay: '+91 98765 43210',
email: 'hello@vakilsaabagra.in', // TODO(subroto): confirm the mailbox exists
micrositeDomain: 'vakilsaabagra.in',
social: { facebook: '', instagram: '', linkedin: '', youtube: '' },
demoNotice: true,                // ← set to false once the listings are real
```

**The phone number is not real.** `+919876543210` is the stock Indian example
number. Worse, it is not only in this file: the header, footer, mobile drawer,
contact page, FAQ answers and WhatsApp prefill links each write it into the HTML
directly. `grep -rn 9876543210` finds every one — about fifty-five across twelve
files. Nothing dials until they are all replaced.

**The social links are intentionally empty.** They are published as schema.org
`sameAs`, which is a claim about who we are; pointing them at `facebook.com`'s
own home page told Google our brand's profile *is* Facebook. `js/home.js` omits
`sameAs` entirely while they are empty. Fill in the profiles that exist and
delete the rest.

**`demoNotice: true`** puts a "sample listings" line in the footer of the
directory *and* of every microsite. The 20 advocates in `data/lawyers.json` are
placeholders — `+9199990000xx` numbers, `chambers@example.com` addresses, and
four demo microsites whose bios were written to exercise the pipeline. Replace
them with real, consented details and set this to `false`.

---

## Tracking and stats

The call and WhatsApp buttons on a profile go straight to the advocate's own
number. Without a record of that, there is nothing to show an advocate at
renewal time — so every view and contact click is counted.

### What is counted

| Event | Fired when |
|---|---|
| `view` | a profile page or a microsite is opened |
| `call` | a `tel:` link inside a `[data-vs-id]` container is clicked |
| `whatsapp` | a `wa.me` link inside a `[data-vs-id]` container is clicked |
| `copy` | the "Copy number" button is used |
| `search` | the directory search form is submitted (no advocate id) |
| `impression` | advocates were rendered in the results — one beacon per render |

`js/track.js` fires these with `navigator.sendBeacon()`, falling back to
`fetch(..., { keepalive: true })`. It never calls `preventDefault()` and never
rewrites an `href`: the contact links behave exactly as they would with
JavaScript switched off, and a failed beacon is swallowed silently.

Attribution comes only from an enclosing `data-vs-id`. That is deliberate — the
header and footer link to *our* number, and a page-wide fallback would book
those clicks as leads for whichever advocate the page happened to show.

### What is not stored

No IP address, no user-agent string, no referrer, no cookie, and no
third-party analytics anywhere on the site. `session` is a random id kept in
`sessionStorage` for one browser session; its only purpose is to let the
endpoint ignore the same click twice inside thirty seconds. Search text has any
run of six or more digits stripped before it is stored, so a phone number
pasted into the search box is not kept. `navigator.doNotTrack === '1'`
suppresses everything.

`privacy.html` says all of this in plain language. Keep the two in step.

### Setting it up on Cloudflare

```bash
npx wrangler d1 create vakilsaabagra
npx wrangler d1 execute vakilsaabagra --remote --file=./schema.sql
```

Then in the Cloudflare Pages project:

- **Settings → Functions → D1 database bindings** — variable name `DB`, bound to
  the `vakilsaabagra` database. The endpoint returns `204` and writes nothing if
  the binding is missing, so a misconfiguration loses stats but never breaks a page.
- **Settings → Environment variables** — `ADMIN_TOKEN`, a long random string.
  It is the only thing protecting `/api/stats`. **Never commit it.**
- Optional, previews only: `ALLOW_LOCAL_ORIGIN = 1` lets `localhost` post
  events while you test with `wrangler pages dev`. Leave it unset in production.

`functions/_ids.js` is generated by `npm run sync` and holds the ids of the
**live** advocates. `/api/track` rejects any event for an id that is not in it,
which is what stops someone curling fake stats into the table.

### Reading a month back

Open `/admin/stats.html` — not linked from anywhere, `noindex`, and
`Disallow`ed in `robots.txt`. Paste the token, pick the advocate and the month,
and it shows views, calls, WhatsApp taps, number copies and impressions, the
conversion rates, a day-by-day table, and the top twenty searches for the
period (site-wide, since searches carry no advocate id).

The **Copy message** button produces the renewal message in Hindi, ready to
paste into WhatsApp. Single asterisks are used because that is what WhatsApp
renders as bold.

---

## Hindi and English

The whole site can be read in either language. The pill in the header and the
footer (`EN / हिं`) switches it; the choice is kept in `localStorage.vsLang`
and survives navigation.

### Where the strings live

| File | Holds |
|---|---|
| `data/i18n/en.json` | every translatable string, in English — generated |
| `data/i18n/hi.json` | the Hindi for each of those keys — **this is the file you edit** |
| `data/i18n/hi.js` | the same Hindi as a script tag — generated by `npm run sync` |

Only Hindi is shipped as a dictionary. English is already in the markup, and
`js/i18n.js` reads it out of the DOM the first time it touches a node and keeps
it, so switching back to English restores exactly what the page shipped with.

### Adding or changing copy

```bash
node tools/i18n-extract.js --report   # what would change, touching nothing
node tools/i18n-extract.js            # mark up the pages, refresh en.json
```

The extractor walks every page, stamps a `data-i18n` key onto each piece of
visible text and writes `en.json` from the current copy — verbatim. It is
idempotent, so run it again after adding a page or a section. A string used on
three or more pages is treated as site chrome and gets a `common.*` key, so the
header and footer are translated once rather than eleven times.

Strings the page scripts build themselves (the cards, the result count, the
profile sections) cannot be marked up in HTML. Those are written as
`T('js.something', 'English')` and the extractor collects them from `js/*.js`
into the same `en.json`. The English literal is the fallback, so a missing
translation renders real words, never a key.

Then fill in the Hindi in `data/i18n/hi.json`. `npm run sync` reports how many
strings are still English and warns about Hindi keys whose English has changed.

**Fallback rule:** a missing or empty Hindi string falls back to English,
everywhere. Nothing ever renders a blank or a raw key. Seven keys are
deliberately left untranslated — the brand name, the logo's alt text, the
already-bilingual language label, three avatar initials and an email address.

### Content out of `lawyers.json`

UI chrome is not enough; the bios and category names are what people read. Any
field can carry a `*Hi` twin, and `VS.i18n.pick()` chooses:

`categories[]`: `nameHi`, `blurbHi`, `topicsHi` ·
`lawyers[]`: `aboutHi`, `highlightsHi`, `topicsHi`, `location.areaHi` ·
`microsite`: `taglineHi`, `longAboutHi`, `faqsHi`

`topicsHi` is **positional** — the nth Hindi topic translates the nth English
one, so keep the arrays the same length and in the same order.

The search index holds both languages at once, so someone typing `ज़मानत` and
someone typing `bail` find the same advocates.

### Microsites are different

A microsite is pre-rendered, so it cannot fetch its Hindi later. The generator
writes **both** languages into the HTML and CSS shows one:

```html
<div class="i18n-en">English…</div><div class="i18n-hi" lang="hi">हिन्दी…</div>
```

English stays visible with JavaScript off and is what a crawler reads first.
Where a field has no Hindi, the English is emitted with no class at all, so it
always shows.

### Typography

Noto Sans Devanagari is loaded from Google Fonts and sits second in both font
stacks — after Inter and Playfair, which have no Devanagari coverage, and
before the Latin serif fallbacks, so a system font with partial coverage cannot
win. Under `html[lang="hi-IN"]`, `css/styles.css` loosens heading line-height
to 1.45 and drops letter-spacing: Devanagari matras sit above the line and
conjuncts hang below it, so `leading-tight` clips, and letter-spacing that
flatters small-caps Latin labels just pulls conjuncts apart.

### The URL parameter

`?hl=hi` and `?hl=en` force a language. `?lang=hi` also works, but note that
`?lang=` is *already* the directory's spoken-language filter, which uses full
names (`?lang=Hindi`). Only the two-letter codes are read as a UI language, so
the two do not collide — `?hl=` is the unambiguous spelling and wins if both
are present.

### SEO: one URL, English indexed

The toggle is client-side on a single URL, so **Hindi content is not separately
indexed**. That is a deliberate v1 trade-off. The consequence is that we do not
rank for Hindi queries, and we accept it — the alternative is duplicating every
page under `/hi/` and maintaining `hreflang` pairs for a directory that has not
proven demand yet.

Because of that decision:

- `<title>` and `<meta name="description">` are **not** translated. What Google
  reads is the English head, and swapping it client-side would gain nothing.
- The same applies to the `<h1>`-adjacent meta the directory and profile pages
  rewrite in JavaScript: the visible heading follows the language, the head
  stays English.
- Do **not** add `hreflang` tags or `/hi/` URLs without also changing how the
  pages are built. Half a hreflang implementation is worse than none.

---

## Changing the design

`css/styles.css` is the authored stylesheet — design tokens, animations and
component styles. **It is not loaded by the pages directly.** It is compiled
into `css/tailwind.css` together with Tailwind:

```bash
npm run build:css
```

Run that after editing `css/styles.css`, or after adding new Tailwind classes to
any `.html` or `.js` file — Tailwind only ships the classes it can see.

The ordering matters and is handled by `tools/build-css.js`: Tailwind's base →
components → `styles.css` → utilities. That is what lets a utility such as
`lg:hidden` win over a component rule such as `.btn { display: inline-flex }`.

Brand colours live as CSS custom properties at the top of `css/styles.css`
(`--ink` navy, `--gold`, `--paper`). The site is **light theme only** by design;
no dark mode is defined.

---

## Logo and brand assets

| File | Use |
|---|---|
| `assets/logo.png` | 1400×380 horizontal lockup, transparent |
| `assets/logo-light.png` | same, white wordmark for dark backgrounds |
| `assets/logo-mark.png` | 512×512 square mark |
| `assets/favicon.png`, `icon-192`, `icon-512`, `apple-touch-icon` | icon set |
| `assets/og-image.png` | 1200×630 social share card |
| `assets/business-card/vakil-saab-agra-card-{front,back}.png` | 2100×1200 business card, 600 DPI at 3.5in × 2in |

The vector sources are in `tools/*.svg`. To regenerate a PNG after editing one:

```bash
qlmanage -t -s 1400 -o assets tools/logo.svg
mv assets/logo.svg.png assets/logo.png
sips -c 380 1400 assets/logo.png      # crop the square render to the band
```

The business card is HTML rather than a vector source, because it reuses the
site's own tokens instead of copying them. Re-render both faces with:

```bash
node tools/business-card/render.js
```

---

## The brand kit

Everything above is what the *site* loads. The full kit — every logo lockup and
finish, the icon set, banners at each platform's exact pixel size, print
pieces, and the palette as JSON / CSS / SCSS / Tailwind — lives in
**[`assets/brand/`](assets/brand)**, with its own guide at
**[`assets/brand/BRAND.md`](assets/brand/BRAND.md)**.

```bash
npm run brand              # SVGs, tokens, contrast audit, then every PNG (~2 min, needs Chrome)
node tools/brand/render.js social    # re-shoot only what matches "social"
node tools/brand/check-contrast.js   # the palette audit on its own
node tools/brand/build-guide.js      # a shareable one-page guide, self-contained HTML
```

`build-guide.js` writes `brand-guide.html` — the whole kit on one page, with the
logos inlined as live vector, the favicon strip at actual size and the contrast
numbers computed from the tokens rather than copied in. It is gitignored
because it embeds every banner preview and runs to about 1.2 MB.

A published copy of that page lives at
<https://claude.ai/code/artifact/77f880b7-885e-405c-af06-5cd5e34a3314>.
It is private until shared from the page's own share menu, and it is a snapshot
— re-run `build-guide.js` and republish to the same URL after changing a
token.

| | |
|---|---|
| `assets/brand/logo/` | horizontal, stacked and wordmark lockups in five finishes — light, dark, and three monos — as SVG and PNG, plus a Devanagari lockup |
| `assets/brand/icon/` | the mark on its own in five finishes, the simplified favicon, and the app-icon set including an Android maskable |
| `assets/brand/social/` | X, LinkedIn, Facebook, Instagram, YouTube, Google Business, link-preview and slide artwork, each at the size the platform asks for |
| `assets/brand/print/` | A4 letterhead and poster at 300 DPI, and a pasteable email signature |
| `assets/brand/tokens/` | `brand.json`, `brand.css`, `_brand.scss`, `tailwind.brand.js` |

Colour and copy change in **one** place, `tools/brand/tokens.js`. The banners
are ordinary HTML in `tools/brand/social/` sharing one stylesheet — open one in
a browser and it looks exactly as it will be shot.

**The kit is additive.** `assets/logo.png`, `assets/og-image.png` and the icons
the pages actually reference are still the older renders from `tools/*.svg`;
nothing in `assets/brand/` overwrites them. Pointing the site at the kit means
swapping those files *and* the `width`/`height` attributes on the two `<img>`
tags that carry them, because the new lockup is a different aspect ratio — a
visible change to every page, and so a deliberate one rather than a side effect
of generating a brand kit.

---

## SEO

Built to rank for “lawyers in Agra” and the practice-area variants.

- **Structured data (JSON-LD)** — `LegalService` + `LocalBusiness` and `WebSite`
  with `SearchAction` on the home page; `Attorney` + `BreadcrumbList` on every
  profile; `ItemList` on the directory; `FAQPage` on the home and FAQ pages;
  `CollectionPage` on practice areas; `Attorney` + `LegalService` + `FAQPage` on
  each microsite. **No `AggregateRating` anywhere** — see the ratings note under
  *Adding an advocate*.
- **Local signals** — `geo.region`, `geo.placename`, `ICBM` meta tags, Agra
  coordinates, `areaServed`, and internal links for 18 Agra localities.
- **Per-page meta** — unique title, description, canonical, Open Graph and
  Twitter cards. The directory and profile pages rewrite their title, `<h1>` and
  description to match the active filter or advocate.
- **`sitemap.xml`** — regenerated by `npm run sync`; one URL per advocate, per
  practice area, and per static page.
- **`robots.txt`** — crawlable, with the sitemap declared.
- **Performance** — one 36 KB minified stylesheet, no CSS framework CDN, no
  render-blocking JavaScript, lazy-loaded images, fonts loaded async.

### Before you launch

The domain is already set to `https://vakilsaabagra.in`. To change it, use
`npm run set-domain -- https://your-domain.in` and then `npm run build` — it
rewrites the canonical, OG, Twitter and JSON-LD URLs, `robots.txt`, the
sitemap, the microsite hosts and the string tables in one pass. Getting this
wrong is the quiet mistake: a canonical pointing at a domain that does not serve
the site tells Google to index that other address instead.

Still outstanding before this is a real, public site:

1. **Replace the placeholder phone number.** `+919876543210` is the stock
   example number. It is in `js/config.js` *and* written directly into the
   header, footer, drawer, contact page, FAQ answers and WhatsApp prefill links
   of every page — `grep -rn 9876543210` finds all of them.
2. **Confirm `hello@vakilsaabagra.in` exists** and forwards somewhere read.
3. **Fill in or delete the social links.** They are empty in `js/config.js`;
   empty means no `sameAs` is published, which is correct until real profiles
   exist.
4. **Replace the twenty sample advocates** with real, consented details, then
   set `demoNotice: false` — that removes the "sample listings" line from the
   footer of the directory and of every microsite. The sample records also carry
   `chambers@example.com` and `+9199990000xx` numbers.
5. Submit `sitemap.xml` in Google Search Console, and set up a Google Business
   Profile for Agra — for local search that matters more than anything on-page.

---

## Project layout

```
index.html                home
lawyers.html              directory — search, filters, sort, paging
lawyer.html               advocate profile (?id=…)
practice-areas.html       all 12 areas and 96 case types
about.html  contact.html  faq.html  list-your-practice.html
privacy.html  terms.html  404.html

admin/stats.html          internal read-out for /api/stats — unlinked, noindex

data/lawyers.json         ← the only file you edit to add advocates
data/lawyers.public.json  generated; live listings only, billing stripped —
                          this is what the pages actually fetch
data/lawyers.fallback.js  generated; the same dataset, makes file:// work
data/i18n/en.json         generated; every translatable string, in English
data/i18n/hi.json         ← the Hindi, edited by hand
data/i18n/hi.js           generated; the Hindi as a script tag

css/styles.css            authored — tokens, motion, components
css/tailwind.css          compiled — the file the pages load

js/config.js              business details
js/i18n.js                language resolution, string swapping, the toggle
js/data.js                loading, search, sort, formatting helpers
js/ui.js                  header, drawer, reveals, counters, lawyer card
js/track.js               anonymous click and view beacons
js/home.js                home page
js/directory.js           directory filtering and URL state
js/profile.js             profile rendering and JSON-LD

templates/microsite.html  the microsite design, with {{…}} tokens
sites/<slug>/             generated microsites, one folder per advocate
sites/_map.json           generated; slug → advocate id

functions/_middleware.js  host routing: subdomain → sites/<slug>/
functions/_slugs.js       generated; the slug map the middleware imports
functions/_ids.js         generated; valid advocate ids for /api/track
functions/api/track.js    POST — counts a view or a contact click
functions/api/stats.js    GET  — reads it back, behind ADMIN_TOKEN
schema.sql                the D1 table and its indexes

tools/sync.js             validate → publish, avatars, sitemap, microsites, i18n
tools/i18n-extract.js     stamp data-i18n keys, refresh en.json
tools/build-css.js        compile styles.css + Tailwind
tools/set-domain.js       point every URL at a different domain
tools/*.svg               logo sources
tools/business-card/     business card: front.html, back.html, card.css, render.js

docs/DEPLOY.md            click-by-click hosting, onboarding, renewals
```

**Generated files, never edited by hand:** `data/lawyers.public.json`,
`data/lawyers.fallback.js`, `data/i18n/en.json`, `data/i18n/hi.js`,
`css/tailwind.css`, `sitemap.xml`, `sites/**`, `functions/_ids.js`,
`functions/_slugs.js`. Each carries a header saying so.

---

## Accessibility and motion

Skip link, keyboard-navigable search suggestions, `aria-expanded` on the menu
and accordions, visible focus rings, labelled form controls, and alt text on
every image. All animation is disabled under `prefers-reduced-motion: reduce`.

---

## Legal note

This is a directory, not a law firm — and the wording across the site is doing
real work, so treat it as load-bearing rather than as filler.

- **Listings stay factual.** Name, enrolment, practice areas, the matters an
  advocate actually takes on, address, contact details. No success rates, no
  claims of being better than anyone else, no ratings. That is the register
  Rule 36 of the Bar Council of India Rules contemplates.
- **The fee is a fixed service fee.** Never per enquiry, never a commission,
  never a referral cut, never a share of what an advocate charges a client — see
  *[A fixed fee, never a share](#a-fixed-fee-never-a-share)*.
- **We do not refer or recommend.** We can narrow a search; we do not send
  clients to a particular advocate.
- **The disclaimer stays.** Every page footer, and every microsite footer, says
  that no advocate–client relationship is created and that the listing is
  published at the advocate's request. Keep it.
- **Consent, and removal.** Publish an advocate's details only with their
  consent, and honour a removal request within one working day — both the site
  and the terms promise that.

None of this is legal advice about your own business. If the offering changes
shape — anything that starts to look like being paid for outcomes — get it
looked at before shipping the copy.

---

## Hosting

**Cloudflare Pages, free plan.** Full click-by-click setup, onboarding,
renewals, the monthly report and troubleshooting live in
**[docs/DEPLOY.md](docs/DEPLOY.md)** — that file is the runbook, written to be
handed to somebody else.

The short version:

| | |
|---|---|
| Registrar | Hostinger — the domain stays there, only the nameservers move to Cloudflare |
| Host | Cloudflare Pages, connected to this GitHub repo |
| Build command | `npm run build` |
| Output directory | `.` (the repository root) |
| Custom domains | `vakilsaabagra.in`, `www.vakilsaabagra.in`, and one per microsite advocate |
| Database | Cloudflare D1, bound as `DB` |
| Secret | `ADMIN_TOKEN`, set in the dashboard, never committed |

`vakilsaabagra.in` is canonical. `www` serves the same site and the middleware
passes both through untouched. `*.pages.dev` preview deployments and `localhost`
are treated as the directory host too, so previews and `wrangler pages dev` work.

### Where the secrets and bindings live

Cloudflare dashboard → your Pages project:

- **Settings → Bindings → D1** — variable name `DB`, database `vakilsaabagra`.
  Without it `/api/track` still returns `204` and no page breaks; you simply
  record nothing.
- **Settings → Environment variables** — `ADMIN_TOKEN`, marked as a Secret. It
  is the only thing protecting `/api/stats`.
- Optional, previews only — `ALLOW_LOCAL_ORIGIN = 1` lets `localhost` post
  events while testing. Leave it unset in production.

Nothing else is configured anywhere. There is no `.env`, and no secret belongs
in this repository.

### Adding an advocate, end to end

The numbered checklist is in
[docs/DEPLOY.md → Onboarding a new advocate](docs/DEPLOY.md#part-2--onboarding-a-new-advocate):
add the record → set plan and `paidUntil` → fill in the microsite block if they
bought one → `npm run build` → commit and push → add
`<slug>.vakilsaabagra.in` as a custom domain → check it renders styled with the
subdomain still in the address bar → send them the link.

### Renewals, expiry and reactivation

`npm run build` prints who has expired and who expires within fifteen days.
That printout **is** the renewal reminder — read it every build, and build at
least monthly even when nothing else changed, because a listing goes offline on
the next build rather than on the date itself.

| To… | Change | Then |
|---|---|---|
| renew | `listing.paidUntil` to the new date | `npm run build && git push` |
| take someone down | `listing.active: false` | `npm run build && git push` |
| bring them back | `listing.active: true`, new `paidUntil` | `npm run build && git push` |

Nothing is ever deleted. An advocate who lapses disappears from the directory,
the sitemap, the tracking id list and — if they had one — their microsite
subdomain starts returning a real 404. Renewing restores all of it at the same
URLs, because the record never left `data/lawyers.json`.

### Sending the monthly numbers

Open `/admin/stats.html`, paste the `ADMIN_TOKEN`, pick the advocate and the
month, and press **Fetch report**. It shows views, calls, WhatsApp taps, number
copies and impressions, the conversion rates, a day-by-day table and the top
searches for the period. **Copy message** produces the Hindi WhatsApp message
ready to paste. Send it a week or two before `paidUntil`.

### Growing past about fifty microsites

Adding a custom domain by hand is the right trade for now: no wildcard DNS to
reason about, no extra Worker, and Cloudflare issues each certificate itself.
Past roughly fifty it becomes tedious, and the migration is a wildcard
`*.vakilsaabagra.in` DNS record, a paid Cloudflare **Advanced Certificate**
covering the wildcard (Universal SSL does not), and a Worker on
`*.vakilsaabagra.in/*` doing what `functions/_middleware.js` does today, reading
the same generated slug map. The routing logic itself does not change. Details
in [docs/DEPLOY.md](docs/DEPLOY.md#scaling-past-about-50-advocates).

---

## Decisions, and why

Short notes on the choices that are expensive to reverse, so nobody has to
re-litigate them from scratch.

### Microsites on subdomains, not paths

`ramesh.vakilsaabagra.in`, not `vakilsaabagra.in/ramesh`. The subdomain is the
product: an advocate paying for their own site can print it on a card, send it on
WhatsApp and see their own name in the address bar. A path under our domain
reads as our page, which is what they already get for free in the directory.

The cost is real and worth knowing. Google treats a subdomain as a separate
site, so a microsite has to *earn* its ranking rather than inherit ours, and it
must not duplicate the directory profile — which is why `sync` refuses a
`longAbout` identical to `about`, and why the microsite carries expanded
practice sections and FAQs the profile does not have. Each page canonicalises to
itself; the apex `robots.txt` disallows `/sites/` so the same HTML is not also
reachable under our own domain.

It must be a **rewrite, never a redirect**. If the subdomain 301s to
`vakilsaabagra.in/lawyer.html?id=…`, the advocate has been sold something they
did not buy.

### D1, not KV

The monthly report asks "how many views did this advocate get last month" — a
query grouped by advocate and by day. KV can only fetch by key, so answering
that means either one key per advocate per day and a lot of reads, or reading
everything and aggregating in the Function. D1 answers it in one `GROUP BY`.

KV also writes eventually-consistently with a per-key rate limit, which is the
wrong shape for many small appends from many visitors. D1's free tier covers our
volume comfortably.

### Client-side Hindi on one URL, no hreflang

The language toggle swaps strings in the browser. There is one URL per page, so
**Hindi is not separately indexed** — we do not rank for Hindi queries.

That is a deliberate v1 trade-off. Doing it properly means duplicating every
page under `/hi/`, maintaining `hreflang` pairs both ways, and doubling the
pages to keep in step — for a directory that has not yet proven demand in either
language. Half a hreflang implementation is worse than none, so there is none.

The consequence to remember: `<title>` and `<meta name="description">` stay
English on purpose, because what Google reads is the English head. If Hindi
search traffic ever justifies it, the migration is real work, not a flag.

### No ratings, no reviews, no testimonials

There is no review pipeline, so there are no numbers. `rating` and
`reviewsCount` are `null`, the star row renders nothing, `AggregateRating` is
absent from the structured data, and the home page carries no testimonials.

This is not squeamishness. Invented review counts and quotes attributed to
people who do not exist are the kind of thing a competitor screenshots, and on
a **legal** directory that is a reputation problem rather than a marketing one.
Structured data claiming ratings we cannot substantiate is also how sites earn
manual actions from Google. If reviews are added later they should be tied to
confirmed consultations, and advocates must not be able to edit or delete them.

### A fixed fee, never a share

Advocates pay a fixed technology and listing service fee, billed in advance.
Nothing in the product or the copy may read as pay-per-lead, commission, a
referral cut or a share of any fee an advocate charges a client — that is what
Bar Council of India Rule 36 and the bar on fee-sharing with non-advocates turn
on. Keep the wording on `list-your-practice.html` and `terms.html` in that
register, and keep the listing to factual particulars.

### Counting clicks without tracking people

We need to prove a listing delivers leads. We do not need to know who anybody
is. So: no IP, no user-agent, no referrer, no cookie, no third-party analytics;
a random `sessionStorage` id used only to ignore a double-click within thirty
seconds; search text stripped of long digit runs before storage; Do Not Track
honoured completely.

The contact links are never rewritten or redirected. `tel:` behaves badly behind
a 302 and the links must keep working with JavaScript off, so the beacon fires
alongside the navigation and its failure is swallowed.

### Print collateral authored in HTML, not a design tool

The business card is `tools/business-card/*.html` styled by a stylesheet that
declares the same tokens as `css/styles.css`, and it inlines the logo mark from
`tools/logo-mark.svg`. A card drawn in Figma or Canva would be a *copy* of the
brand that drifts the moment the site's navy or gold moves; this one is a second
reading of the same values, and the divergence is a one-line diff away from
being fixed.

The geometry follows from print, not from the screen: 3.5in × 2in authored at
1050 × 600 CSS px so `1px` is exactly `1/300in`, shot at `deviceScaleFactor 2`
for 600 DPI at final size. Nothing is positioned in absolute pixels that a
printer would then have to trust — the back's four bands are spaced by
`justify-content: space-between`, so adding or removing a line rebalances the
card instead of breaking it.

`render.js` downloads Inter and Playfair Display once, caches them and inlines
them as `data:` URIs before screenshotting, because a screenshot cannot wait on
a network font — the render has to be the same offline as online. The committed
HTML keeps its ordinary Google Fonts `<link>` so it still previews in a browser.

---

## Updating the site later

```bash
# after editing data/lawyers.json (or data/i18n/hi.json)
npm run build

# after adding a page or new copy, to pick up new translatable strings
node tools/i18n-extract.js

git commit -am "…"
git push          # Cloudflare Pages redeploys automatically
```

### Notes

- `.nojekyll` is a leftover from GitHub Pages and harmless on Cloudflare.
- `404.html` is served by Cloudflare Pages for unknown paths on the apex.
  Unknown *subdomains* get their own 404 from `functions/_middleware.js`.
- `data/lawyers.json` is blocked at the edge on every host, because it carries
  the billing fields. What the browser reads is `data/lawyers.public.json`.
- Local `npm run serve` has no Functions, so `/api/track` will 501 in the
  console and no microsite routing happens — visit `sites/<slug>/index.html`
  directly, or use `npx wrangler pages dev .` for the real thing.
