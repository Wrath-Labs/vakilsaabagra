# Vakil Saab Agra

A static, light-theme directory of advocates practising in **Agra, Uttar Pradesh**.
Plain HTML + Tailwind CSS + vanilla JavaScript. No backend, no authentication,
no build step required to *run* it — advocates are added by editing one JSON file.

---

## Quick start

```bash
# any static server works; the site needs one because it fetches a JSON file
npm run serve          # → http://localhost:5173
# or: python3 -m http.server 5173
```

Opening `index.html` straight off disk (`file://`) also works — the data layer
falls back to `data/lawyers.fallback.js` when `fetch()` is blocked by the
browser's file:// security rules.

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
| `rating`, `reviewsCount` | | shown as stars; feed real feedback only |
| `verified`, `featured` | | booleans. `featured: true` puts them on the home page |
| `featuredUntil` | | `YYYY-MM-DD` or `null`. Once it passes, the featured slot stops showing — the record is not touched |
| `listing` | ✅ | billing block, see *Plans and billing* below |
| `microsite` | ✅ | microsite block, see *Microsites* below |

`sync` will refuse to write if an `id` is duplicated, a category slug is
unknown, or a required field is missing — so a typo can't quietly break the site.

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
phone: '+919876543210',
phoneDisplay: '+91 98765 43210',
demoNotice: true,   // ← set to false once the listings are real
```

> **`demoNotice`** puts a line in the footer saying the listings are samples.
> The 20 advocates currently in `data/lawyers.json` are **placeholder entries**
> with placeholder phone numbers (`+9199990000xx`). Replace them with real,
> consented advocate details and set `demoNotice: false` before going live.

Some copy is written directly into the HTML (the FAQ answers, the WhatsApp
prefill links). Search the repo for `9876543210` to catch them all when you
change the number.

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

The vector sources are in `tools/*.svg`. To regenerate a PNG after editing one:

```bash
qlmanage -t -s 1400 -o assets tools/logo.svg
mv assets/logo.svg.png assets/logo.png
sips -c 380 1400 assets/logo.png      # crop the square render to the band
```

---

## SEO

Built to rank for “lawyers in Agra” and the practice-area variants.

- **Structured data (JSON-LD)** — `LegalService` + `LocalBusiness` and `WebSite`
  with `SearchAction` on the home page; `Attorney` with `AggregateRating` and
  `BreadcrumbList` on every profile; `ItemList` on the directory; `FAQPage` on
  the home and FAQ pages; `CollectionPage` on practice areas.
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

1. Replace the placeholder advocate data and set `demoNotice: false`.
2. Update the domain — it is `https://www.vakilsaabagra.com` in `js/config.js`,
   `tools/sync.js` (the `SITE` constant), `robots.txt` and every page's
   canonical/OG tags. Re-run `npm run sync` afterwards.
3. Serve over HTTPS and point `404.html` at your host's not-found handler.
4. Submit `sitemap.xml` in Google Search Console and set up a Google Business
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

data/lawyers.json         ← the only file you edit to add advocates
data/lawyers.public.json  generated; live listings only, no billing fields —
                          this is what the pages actually fetch
data/lawyers.fallback.js  generated; the same dataset, makes file:// work

css/styles.css            authored — tokens, motion, components
css/tailwind.css          compiled — the file the pages load

js/config.js              business details
js/data.js                loading, search, sort, formatting helpers
js/ui.js                  header, drawer, reveals, counters, lawyer card
js/home.js                home page
js/directory.js           directory filtering and URL state
js/profile.js             profile rendering and JSON-LD

tools/sync.js             validate data → avatars, fallback, sitemap
tools/build-css.js        compile styles.css + Tailwind
tools/*.svg               logo sources
```

---

## Accessibility and motion

Skip link, keyboard-navigable search suggestions, `aria-expanded` on the menu
and accordions, visible focus rings, labelled form controls, and alt text on
every image. All animation is disabled under `prefers-reduced-motion: reduce`.

---

## Legal note

This is a directory, not a law firm. The footer carries a disclaimer stating
that no advocate–client relationship is created and that listings are factual
entries published at the advocate's request — worded to sit within Rule 36 of
the Bar Council of India Rules on advertising. Keep it. Publish an advocate's
details only with their consent, and honour removal requests promptly.

---

## Hosting on GitHub Pages

The site is pure static files with the CSS already compiled, so GitHub Pages can
serve it straight from a branch — no Actions workflow, no build step.

### 1. Set the domain first

This is the step people skip, and it quietly costs you the ranking. Every page
carries a `<link rel="canonical">`. If it points at a domain that is not the one
actually serving the site, Google indexes that other address instead — so your
live pages never rank.

```bash
# a project site, served from https://<user>.github.io/<repo>/
npm run set-domain https://<your-username>.github.io/vakilsaabagra

# …or your own domain, once DNS is pointed at GitHub (see step 4)
npm run set-domain https://www.vakilsaabagra.com

npm run sync          # regenerate sitemap.xml with the new URLs
```

All internal links are relative, so the site works at a `/repo/` sub-path
without any other change.

### 2. Push it

```bash
git init -b main
git add -A
git commit -m "Vakil Saab Agra — advocate directory for Agra"
git remote add origin https://github.com/<your-username>/vakilsaabagra.git
git push -u origin main
```

### 3. Turn Pages on

Repository → **Settings** → **Pages** → *Build and deployment*
→ Source: **Deploy from a branch** → Branch: **main**, folder: **/ (root)** → Save.

First deploy takes a minute or two. Your site appears at
`https://<your-username>.github.io/vakilsaabagra/`.

Tick **Enforce HTTPS** on the same page once it is available.

> Naming the repo `<your-username>.github.io` instead publishes it at the domain
> root (`https://<your-username>.github.io/`) — then use that as your
> `set-domain` value.

### 4. Custom domain (recommended)

A real domain ranks better than a `github.io` sub-path and is what people expect
from a professional directory.

At your DNS provider:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `185.199.108.153` |
| `A` | `@` | `185.199.109.153` |
| `A` | `@` | `185.199.110.153` |
| `A` | `@` | `185.199.111.153` |
| `CNAME` | `www` | `<your-username>.github.io` |

*(Confirm the current apex IPs against GitHub's Pages documentation — they have
changed before.)*

Then in **Settings → Pages → Custom domain**, enter `www.vakilsaabagra.com` and
save. GitHub commits a `CNAME` file to the repo for you. Wait for the TLS
certificate to be issued, then tick **Enforce HTTPS**.

Finally, re-run step 1 with the custom domain and push again:

```bash
npm run set-domain https://www.vakilsaabagra.com
npm run sync
git commit -am "Point canonical URLs at the custom domain"
git push
```

### Updating the site later

```bash
# after editing data/lawyers.json
npm run sync
# after editing css/styles.css or adding Tailwind classes
npm run build:css

git commit -am "Add Adv. …"
git push          # Pages redeploys automatically
```

Commit `css/tailwind.css` and `data/lawyers.fallback.js` — both are generated,
but GitHub Pages does not run your build, so they must be in the repo.

### Notes

- `.nojekyll` is included so Pages serves the files verbatim rather than running
  them through Jekyll.
- `404.html` is picked up automatically as the custom not-found page.
- `data/lawyers.json` is fetched over HTTPS at runtime, which works fine on
  Pages. The `file://` fallback is only for opening the files locally.
- GitHub Pages cannot do server-side redirects, so there is no apex → `www`
  redirect. Pick one hostname, set it as the custom domain, and keep the
  canonical URLs pointing at it.
