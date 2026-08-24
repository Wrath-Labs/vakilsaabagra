# Vakil Saab Agra

A static, light-theme directory of advocates practising in **Agra, Uttar Pradesh**,
readable in Hindi or English. Plain HTML + Tailwind CSS + vanilla JavaScript —
no framework, no bundler, no runtime dependency.

**Everything you would want to change is a JSON file.** Advocates, prices, the
navigation, the footer, the colours, every word on every page, and which
sections a microsite renders — all of it lives in `data/`, and `npm run build`
writes it into the HTML. You should never need to open a `.html` file to change
what the site says. See [Editing the site](#editing-the-site).

Three things run at the edge on Cloudflare Pages Functions, and only those
three: an anonymous click counter, its admin read-out, and the host routing that
serves each paying advocate's microsite on its own subdomain.

| I want to… | Go to |
|---|---|
| add or renew an advocate | [Adding an advocate](#adding-an-advocate), then [docs/DEPLOY.md](docs/DEPLOY.md#part-2--onboarding-a-new-advocate) |
| change any text, price, link or colour | [Editing the site](#editing-the-site) |
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
npm run build          # JSON → pages → dataset → microsites → CSS
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

## Editing the site

Nothing on this site is edited in HTML. Six JSON files under `data/` are the
source, and `npm run build` pushes them into the pages. If you find yourself
opening an `.html` file to change wording, a link or a price, stop — the change
belongs in one of these, and the build will overwrite you.

| I want to change… | Edit | Then |
|---|---|---|
| phone, WhatsApp, email, address, hours | `data/site.json` → `business` | `npm run build` |
| the header nav or the mobile drawer | `data/site.json` → `nav` | `npm run build` |
| the footer link columns and locality chips | `data/site.json` → `footer` | `npm run build` |
| whether the demo notice or the prices show | `data/site.json` → `flags` | `npm run build` |
| what a listing costs | `data/pricing.json` → `plans` | `npm run build` |
| any wording on the pricing page | `data/pricing.json` → `page` / `includes` / `terms` / `faqs` / `cta` | `npm run build` |
| which pages go in `sitemap.xml` | `data/site.json` → `sitemap.pages` | `npm run build` |
| any brand colour | `data/theme.json` → `brand` | `npm run build` |
| the four microsite looks, or add a fifth | `data/theme.json` → `accents` | `npm run build` |
| which sections a microsite shows, and in what order | `data/theme.json` → `microsite.sections` | `npm run build` |
| **any visible English wording, anywhere** | `data/i18n/en.json` | `npm run build` |
| the Hindi | `data/i18n/hi.json` | `npm run build` |
| advocates, categories, an individual microsite's content | `data/lawyers.json` | `npm run build` |

`npm run check` reports what a build *would* change without writing anything —
useful before committing.

### What generates what

```
data/site.json     ─┬─→ js/config.js                     (generated; never hand-edit)
                    ├─→ header nav + mobile drawer       (all 11 pages)
                    └─→ footer link columns              (all 11 pages)
data/pricing.json  ─┬─→ the whole of pricing.html — hero, plans, what you get,
                    │    billing terms, FAQ, call to action
                    └─→ the "what you get" cards and the price summary on
                         list-your-practice.html
data/theme.json    ─┬─→ the :root brand tokens in css/styles.css → css/tailwind.css
                    ├─→ the microsite accent stylesheets
                    └─→ microsite section order and the sticky contact bar
data/i18n/en.json  ──→ the text of every data-i18n element on every page
data/lawyers.json  ──→ the dataset, the sitemap, the microsites, the id list
```

`tools/content.js` does the first three; `tools/build-css.js` the fourth;
`tools/sync.js` the rest.

### Adding a page

1. Copy an existing page's shell (head, header, drawer, footer) — the nav and
   footer inside it are regenerated, so the copy does not have to be current.
2. Mark each body section you want driven by JSON with
   `<!-- @auto:name -->` … `<!-- /@auto -->`, and add a renderer in
   `tools/content.js`.
3. Add the file to `PAGES` in `tools/content.js`.
4. Add it to `data/site.json` → `sitemap.pages`, or `npm run build` warns that
   the page exists and will never be submitted.
5. Add a `nav.primary` entry if it belongs in the header.

`pricing.html` is the worked example: it has no hand-written body at all.

### Two directions, and when to use each

`tools/i18n-extract.js` reads the pages and writes `en.json`. `tools/content.js`
reads `en.json` and writes the pages. They are inverses, they agree on the key
format, and you want different ones at different times:

- **Wrote new hand-authored markup?** Run `node tools/i18n-extract.js` to pull
  the new strings out into `en.json` and stamp keys onto the elements.
- **Changing existing wording?** Edit `en.json` and run `npm run build`. Do not
  edit the HTML — the build puts `en.json` back.

Editing HTML text directly is not *dangerous*, it is just pointless: the next
build overwrites it with whatever `en.json` says.

### Adding a nav link, end to end

Add to `data/site.json`:

```json
{ "href": "guides.html", "label": "Guides" }
```

`npm run build` puts it in the header and the drawer on all eleven pages, mints
`common.guides` in `en.json`, and tells you the key needs Hindi. Add that key to
`data/i18n/hi.json` and build again. Reorder the array and the nav reorders;
delete the entry and it disappears everywhere. `aria-current="page"` is set on
whichever page you are on, in both the header and the drawer.

### Turning prices off

`data/site.json` → `flags.showPricing: false`. The plan cards stay — same names,
same descriptions — the figures come out, and the lede changes to the
"message us for the current figures" line from `pricing.json`. The flag works in
both directions, which is the point: hiding prices does not mean losing the
markup that shows them.

### The generated files

Never hand-edit these. Each says so at the top, and each is rewritten on the
next build without a merge conflict to warn you:

`js/config.js` · `data/i18n/hi.js` · `data/lawyers.public.json` ·
`data/lawyers.fallback.js` · `functions/_ids.js` · `functions/_slugs.js` ·
`sites/**` · `sitemap.xml` · `css/tailwind.css` · the marked token block inside
`css/styles.css`

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
| `phone` / `whatsapp` | ✅ | E.164 format, e.g. `+918954402360` |
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

| Plan | Listing | Microsite | Total / month |
|---|---|---|---|
| Monthly | ₹200 | ₹600 | ₹800 |
| 6-month | ₹150 | ₹450 | ₹600 |
| Yearly | ₹100 | ₹400 | ₹500 |

**`data/pricing.json` is the source.** The table above is a copy for readers of
this file; the numbers that reach an advocate come from that JSON, rendered by
`npm run build`. Change a figure there and the pages follow — including the
"both together" total and the "from ₹100" line, both computed, so neither can
drift from the plan rates.

**The full table lives on `pricing.html` and only there.** `list-your-practice.html`
carries a one-line summary and a link. Two pages holding the same nine figures
is two pages Google has to choose between, and the listing flow is about the
process rather than the price. The "what you get" cards *do* appear on both,
rendered from the same `includes` block, so they cannot disagree.

Prices are visible on the site because `data/site.json` → `flags.showPricing` is
`true`. Set it to `false` and the cards keep their names and descriptions but
drop the figures, falling back to "message us for the current figures". See
[Turning prices off](#turning-prices-off).

The plan ids in `pricing.json` — `monthly`, `halfyearly`, `yearly` — are the same
strings `listing.plan` takes in `data/lawyers.json`, so the two stay in step.

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

Phone number, WhatsApp, email and address live in one place: **`data/site.json`**
→ `business`. `npm run build` writes them everywhere — `js/config.js`, the
header, the footer, the mobile drawer, the contact page, the FAQ answers, the
WhatsApp prefill links, the `tel:`/`mailto:` hrefs and the JSON-LD.

```json
"business": {
  "phone": "+918954402360",
  "whatsapp": "918954402360",
  "email": "subroto.2003@gmail.com",
  "micrositeDomain": "vakilsaabagra.in"
}
```

`phoneDisplay` is **derived**, not stored: the build groups the digits 5-5 into
`+91 89544 02360`. There is nowhere to write a display form that disagrees with
the number people actually dial.

### Changing the phone number

Edit that one line and run `npm run build`. It used to be 142 occurrences across
fourteen files; three things now hold it together:

- **`tel:`, `wa.me/` and `mailto:` hrefs** on the static pages are rewritten
  unconditionally, because every one of them belongs to the business — advocate
  links are rendered by `js/*.js` from the dataset and never appear in these
  files. A `?text=` prefill is preserved.
- **`{phone}` and `{email}` tokens** stand in for the details inside the string
  tables, so the six English strings and five Hindi ones that mention the number
  no longer contain digits at all. `tools/content.js` expands them into the
  static HTML — a crawler and a JavaScript-off browser still see real digits —
  and `js/i18n.js` expands them again when the page switches to Hindi. The two
  languages cannot disagree about what the number is.
- **The bare numeral inside the call buttons** carries no translation key at all,
  because `tools/i18n-extract.js` skips bare numbers by design. That is how three
  copies per page ended up outside both systems. They all sit inside a `tel:`
  link, so they are rewritten along with it.

Anything left over that looks like a phone number and is not the one in
`site.json` gets named in the build output:

```
! about.html: phone number(s) not driven by data/site.json: +91 77777 88888
```

The brand kit is a separate copy and was already correct: `tools/brand/tokens.js`,
the business card and the print pieces have carried `+91 89544 02360` since they
were authored, so the rendered PNGs in `assets/brand/` need no re-render. They
are not wired to `site.json` — a print run is a deliberate act, not a build
artefact.

### The email

**It is a personal Gmail.** Published on the contact page and in the JSON-LD as
the LocalBusiness `email` (`js/home.js:166`), so it is a public address and will
be scraped. A dedicated mailbox on the domain would be better and is on the
outstanding list; this one has the advantage of being real and read today.

### The social links

**Intentionally empty.** They are published as schema.org `sameAs`, which is a
claim about who we are; pointing them at `facebook.com`'s own home page told
Google our brand's profile *is* Facebook. `js/home.js` omits `sameAs` entirely
while they are empty. Fill in the profiles that exist, in `data/site.json` →
`social`, and delete the rest.

### `flags.demoNotice`

`true` puts a "sample listings" line in the footer of the directory *and* of
every microsite. The 20 advocates in `data/lawyers.json` are placeholders —
`+9199990000xx` numbers, `chambers@example.com` addresses, and four demo
microsites whose bios were written to exercise the pipeline. Replace them with
real, consented details and set this to `false`.

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
| `data/i18n/en.json` | every visible English string — **the source; edit it** |
| `data/i18n/hi.json` | the Hindi for each of those keys — **edit it** |
| `data/i18n/hi.js` | the same Hindi as a script tag — generated by `npm run sync` |

**`en.json` is a source now, not a mirror.** It used to be generated from the
pages; `tools/content.js` puts it back into them, so changing a word means
changing it there and running `npm run build`.

Only Hindi is shipped as a dictionary. English is already in the markup, and
`js/i18n.js` reads it out of the DOM the first time it touches a node and keeps
it, so switching back to English restores exactly what the page shipped with.

### Adding or changing copy

To **change wording**, edit `data/i18n/en.json` and run `npm run build`. That is
the whole procedure. Do not edit the HTML — the build overwrites it.

To **add new hand-authored markup**, run the extractor afterwards so the new
strings get keys and land in `en.json`:

```bash
node tools/i18n-extract.js --report   # what would change, touching nothing
node tools/i18n-extract.js            # mark up the pages, refresh en.json
```

The extractor walks every page, stamps a `data-i18n` key onto each piece of
visible text and writes `en.json` from the current copy — verbatim, and it keeps
keys it did not see this run, so the tokens below survive. It is idempotent, so
run it again after adding a page or a section. A string used on three or more
pages is treated as site chrome and gets a `common.*` key, so the header and
footer are translated once rather than eleven times.

**`{phone}` and `{email}` are tokens, not text.** Six English strings and five
Hindi ones mention the contact details, and they hold a token rather than the
digits, so changing the number is one edit in `data/site.json` instead of eleven
here. `tools/content.js` expands them into the static HTML and `js/i18n.js`
expands them again at runtime. Write `{phone}` in a new string and it works;
write the digits and you have made a place for them to go stale.

Strings the page scripts build themselves (the cards, the result count, the
profile sections) cannot be marked up in HTML. Those are written as
`T('js.something', 'English')` and the extractor collects them from `js/*.js`
into the same `en.json`. The English literal is the fallback, so a missing
translation renders real words, never a key.

Then fill in the Hindi in `data/i18n/hi.json`. `npm run sync` reports how many
strings are still English and warns about Hindi keys whose English has changed.

**Fallback rule:** a missing or empty Hindi string falls back to English,
everywhere. Nothing ever renders a blank or a raw key. Four keys are deliberately
left untranslated — the brand name twice, the already-bilingual `Language / भाषा`
label, and the email address, which is an address rather than a word.

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

Brand colours are **not** edited in the stylesheet. They live in
`data/theme.json` → `brand`, and `tools/build-css.js` writes them into the
`:root` block of `css/styles.css` between two markers:

```css
  /* @@BRAND-TOKENS-START@@ */
  --ink:       #0f2540;   /* 15.45:1 on #ffffff — AA for body text; deep navy … */
  --gold:      #b0861f;   /* 3.35:1 on #ffffff — AA for large text and rules only, NOT body copy */
  /* @@BRAND-TOKENS-END@@ */
```

The contrast ratio in each comment is **measured at build time**, not typed. A
hand-written ratio goes stale the moment somebody changes the hex — which has
already happened once here — so `build-css.js` computes it against `--paper` and
labels each text token AA / large-text-only / fails. Change `--gold` to purple
and the comment tells you the truth about purple on the next build. Do not write
a ratio into `_brandNotes`; that field is for description only.

Everything below the marked block — elevation, motion, component styles — is
hand-authored and stays that way. The site is **light theme only** by design;
no dark mode is defined.

The four microsite accents are in the same file under `accents`. Add a fifth,
give an advocate `"accent": "forest"` in their microsite block, and it works
with no code change; `tools/sync.js` warns and falls back to the default if the
name is not in the JSON.

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

**`vakilsaabagra.in` is not registered yet.** Every canonical, the sitemap, the
`robots.txt`, the microsite hosts and the business card all say
`https://vakilsaabagra.in`, and the domain is unregistered — confirmed available
at the NIXI registry on 2026-08-24. Buying it is the first item below, and it
blocks half of hosting.

To point the project at a different domain instead:
`npm run set-domain -- https://your-domain.in`, then `npm run build`. It rewrites
the canonical, OG, Twitter and JSON-LD URLs, `robots.txt`, the sitemap, the
microsite hosts and the string tables in one pass. Getting this wrong is the
quiet mistake: a canonical pointing at a domain that does not serve the site
tells Google to index that other address instead.

Still outstanding before this is a real, public site, in order:

1. **Register `vakilsaabagra.in`.** Any accredited registrar; `docs/DEPLOY.md`
   assumes Hostinger and moving the nameservers to Cloudflare. Cloudflare
   Registrar would skip the nameserver step but does not sell `.in` as far as we
   can tell — check when you are there. The name is already printed on the
   business card and the print collateral, so it is not really a choice any more.
2. **Do the Cloudflare setup** — `docs/DEPLOY.md` Part 1. Steps 1.2, 1.4 and 1.5
   (Pages project, D1, `ADMIN_TOKEN`) work with no domain and are worth doing
   first; 1.1 and 1.3 (nameservers, custom domains) need the registration.
3. **Do not add the four demo slugs as custom domains.** `ramesh`, `neha`,
   `deepak` and `rajeev` are sample bios. No subdomain exists and the apex
   `robots.txt` disallows `/sites/`, so they are effectively unreachable today —
   adding a custom domain is exactly what would make a sample advocate look like
   a real one at a real address.
4. **Fill in or delete the social links** in `data/site.json` → `social`. Empty
   means no `sameAs` is published, which is correct until real profiles exist.
5. **Replace the twenty sample advocates** with real, consented details, then set
   `flags.demoNotice: false` — that removes the "sample listings" line from the
   footer of the directory and of every microsite. The sample records also carry
   `chambers@example.com` and `+9199990000xx` numbers.
6. **A mailbox on the domain**, to replace the personal Gmail now published in
   the JSON-LD.
7. Submit `sitemap.xml` in Google Search Console, and set up a Google Business
   Profile for Agra — for local search that matters more than anything on-page.

**If you deploy to `*.pages.dev` before the domain exists**, note that every page
carries `<link rel="canonical" href="https://vakilsaabagra.in/">` and
`robots: index, follow`. Production `pages.dev` URLs are crawlable — only preview
deployments get an automatic noindex — so Google could crawl the preview and be
told the real address is a domain that does not resolve. The risk is small
(nothing links to a fresh `pages.dev` URL) and it disappears the moment the
domain is live, but it is the reason to buy the domain first rather than last.

---

## Project layout

```
index.html                home
lawyers.html              directory — search, filters, sort, paging
lawyer.html               advocate profile (?id=…)
practice-areas.html       all 12 areas and 96 case types
pricing.html              what a listing costs — no hand-written body at all,
                          every section rendered from data/pricing.json
about.html  contact.html  faq.html  list-your-practice.html
privacy.html  terms.html  404.html

admin/stats.html          internal read-out for /api/stats — unlinked, noindex

data/site.json            ← business details, nav, footer, feature flags
data/pricing.json         ← plans and prices
data/theme.json           ← brand colours, microsite accents, section order
data/lawyers.json         ← advocates, categories, per-advocate microsite content
data/i18n/en.json         ← every visible English string on every page
data/i18n/hi.json         ← the Hindi
data/lawyers.public.json  generated; live listings only, billing stripped —
                          this is what the pages actually fetch
data/lawyers.fallback.js  generated; the same dataset, makes file:// work
data/i18n/hi.js           generated; the Hindi as a script tag

css/styles.css            authored — tokens, motion, components
css/tailwind.css          compiled — the file the pages load

js/config.js              generated from data/site.json — never hand-edited
js/i18n.js                language resolution, string swapping, the toggle
js/data.js                loading, search, sort, formatting helpers
js/ui.js                  header, drawer, reveals, counters, lawyer card
js/track.js               anonymous click and view beacons
js/home.js                home page
js/directory.js           directory filtering and URL state
js/profile.js             profile rendering and JSON-LD

templates/microsite.html  the microsite design: {{…}} tokens for values,
                          <!-- @section:name --> blocks for what theme.json orders
sites/<slug>/             generated microsites, one folder per advocate
sites/_map.json           generated; slug → advocate id

functions/_middleware.js  host routing: subdomain → sites/<slug>/
functions/_slugs.js       generated; the slug map the middleware imports
functions/_ids.js         generated; valid advocate ids for /api/track
functions/api/track.js    POST — counts a view or a contact click
functions/api/stats.js    GET  — reads it back, behind ADMIN_TOKEN
schema.sql                the D1 table and its indexes

tools/content.js          JSON → HTML: config, nav, footer, prices, all copy
tools/sync.js             validate → publish, avatars, sitemap, microsites, i18n
tools/i18n-extract.js     HTML → JSON: stamp data-i18n keys, refresh en.json
tools/build-css.js        theme.json → styles.css tokens, then compile Tailwind
tools/set-domain.js       point every URL at a different domain
tools/*.svg               logo sources
tools/business-card/     business card: front.html, back.html, card.css, render.js

docs/DEPLOY.md            click-by-click hosting, onboarding, renewals
```

**Generated files, never edited by hand:** `js/config.js`,
`data/lawyers.public.json`, `data/lawyers.fallback.js`, `data/i18n/hi.js`,
`css/tailwind.css`, the marked token block inside `css/styles.css`,
`sitemap.xml`, `sites/**`, `functions/_ids.js`, `functions/_slugs.js`. Each
carries a header saying so.

`data/i18n/en.json` is the exception that changed: it used to be generated *from*
the pages and is now the source *for* them. Edit it.

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
