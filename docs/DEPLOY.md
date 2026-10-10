# Deploying Vakil Saab Agra

Everything here is click-by-click on purpose. It should be possible to hand this
file to somebody else and have them onboard an advocate without asking questions.

- **Host:** Cloudflare Pages (free plan)
- **Registrar:** Hostinger (domain stays there; only the nameservers move)
- **Database:** Cloudflare D1 (free plan), for click and view counts
- **Build:** `npm run build` — validates the data, publishes the dataset,
  generates the microsites, compiles the CSS

---

## Part 1 — One-time setup

You only ever do this once. Skip to [Part 2](#part-2--onboarding-a-new-advocate)
for day-to-day work.

**Order.** 1.1 first, because the nameserver change is the slow part. 1.2, 1.4
and 1.5 do not need the domain and can be done while it propagates. 1.3 waits
until the domain shows **Active** in Cloudflare.

### 1.1 Point the domain at Cloudflare

1. Sign in to **Cloudflare** → **Add a domain** (older dashboards: **Add a
   site**) → enter `vakilsaabagra.in` → choose the **Free** plan, and let it
   scan the existing DNS records.
2. On the DNS review screen, **delete Hostinger's parking records**: the `A`
   record for `vakilsaabagra.in` pointing at `2.57.91.91`, the `www` record
   (`CNAME` or `A`) and any `AAAA`. Left in place they conflict with the Pages
   custom domain in 1.3. If you missed them here, they are under the zone's
   **DNS → Records** afterwards.
3. Cloudflare shows two nameservers, e.g. `xxx.ns.cloudflare.com` and
   `yyy.ns.cloudflare.com`. Copy both.
4. Sign in to **Hostinger** → **Domains** → `vakilsaabagra.in`. **Check DNSSEC
   first** and turn it off if it is on — changing nameservers with DNSSEC still
   on makes the domain stop resolving.
5. **DNS / Nameservers** → **Change nameservers** → **Use custom nameservers** →
   paste the two values → **Save**.
6. Wait for Cloudflare to show the domain as **Active** (it also emails). This
   usually takes a few minutes and can take up to 24 hours. 1.3 does not work
   until it does.

> **A newly registered domain may be locked.** On the day of registration
> Hostinger refused the change with *"Nameserver changes for this domain are
> temporarily unavailable. Please try again in 24 hours or contact support."*
> Wait the 24 hours and save again; if it still refuses, Hostinger's support
> chat. The zone waits in Cloudflare as **Pending** meanwhile — do not add it a
> second time, or you get a different pair of nameservers.

> Do not delete anything else at Hostinger. The domain stays registered there;
> only DNS moves to Cloudflare.

### 1.2 Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create application**. The
   page defaults to building a **Worker**, which is the wrong product here: it
   has a *Deploy command* field, tries to upload the whole repository, and
   ignores `functions/`. Click the small link at the bottom,
   **"Looking to deploy Pages? Get started"** → **Import an existing Git
   repository**. The right form has a *Build output directory* and **no**
   *Deploy command*. If you land on a Worker by mistake, delete it first so the
   name is free.
2. Authorise GitHub. When GitHub asks where to install, choose **Only select
   repositories** → **`Wrath-Labs/vakilsaabagra`**. The repository belongs to an
   organisation, so if you are not an owner of Wrath-Labs, an owner has to
   approve the install before the repository appears.
3. Set up the build:
   - **Project name:** `vakilsaabagra` — this gives `vakilsaabagra.pages.dev`
   - **Production branch:** `main`
   - **Framework preset:** *None*
   - **Build command:** `npm run build`
   - **Build output directory:** `.` *(a single dot — the repository root)*
4. **Save and Deploy.** The first build takes a couple of minutes.
5. When it finishes you get a `*.pages.dev` URL. Open it and check the site
   renders. It will, because the routing middleware treats `pages.dev` as the
   directory host.

### 1.3 Attach the real domain

1. Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `vakilsaabagra.in` → **Continue** → **Activate domain**. Cloudflare adds
   the DNS record itself.
3. Repeat for `www.vakilsaabagra.in`.
4. Wait for both to show **Active** with a valid certificate.

Add **only these two** here. Microsite subdomains are added one at a time as
real advocates pay for them ([Part 2, step 6](#6-add-the-subdomain-microsite-advocates-only)) —
never `ramesh`, `neha`, `deepak` or `rajeev`, which are sample bios.

`vakilsaabagra.in` is the canonical host. `www` serves the same site; the
middleware passes both through untouched.

### 1.4 Create and bind the database

Either in the dashboard, with no tools installed:

1. **Workers & Pages** → **D1 SQL Database** → **Create** → name it
   `vakilsaabagra`.
2. Open the database → **Console** → paste the whole of `schema.sql` (one table,
   three indexes) → **Execute**.

Or in a terminal, from the repository root:

```bash
npx wrangler login
npx wrangler d1 create vakilsaabagra
npx wrangler d1 execute vakilsaabagra --remote --file=./schema.sql
```

Either way prints or shows a database id — you do not need to copy it anywhere,
the binding is done in the dashboard:

1. Pages project → **Settings** → **Bindings** (older dashboards:
   **Functions → D1 database bindings**) → **Add binding**.
2. **Variable name:** `DB` — spelled exactly like that, in capitals.
3. **D1 database:** `vakilsaabagra`.
4. Save, for the **Production** environment. Add the same binding for
   **Preview** if you want counts from preview deployments (usually you do not).

> If this binding is missing, `/api/track` still returns `204` and no page
> breaks — you simply record nothing. That is deliberate; tracking must never
> cost a lead.

### 1.5 Set the admin password

The stats page signs in with one password. It is stored as a salted hash in D1,
so there is no secret to paste into the dashboard and nothing to retry-deploy.

1. In a **real Terminal** (not the Claude `!` prompt — it needs a terminal to
   hide what you type), from the repository root:
   ```bash
   node tools/set-admin-password.js
   ```
   Type a password of at least 12 characters, twice. A few random words is fine.
2. It prints two SQL statements. Cloudflare dashboard → **Workers & Pages** →
   **D1 SQL Database** → `vakilsaabagra` → **Console** → paste both → **Execute**.
3. Open `https://vakilsaabagra.in/admin/stats.html` and sign in.

Store the password in a password manager. **Never commit it.** To change it,
run the tool again; that also signs out every session. If you forget it, there
is no recovery — run the tool and paste the new statement; it replaces the old.

The three admin tables (`admin_auth`, `admin_sessions`, `admin_attempts`) are in
`schema.sql`, so step 1.4's schema run already created them. On a database made
before this change, run `schema.sql` again; every statement is idempotent.

### 1.6 Check it works

```bash
# should be 405 — the endpoint takes POST only
curl -s -o /dev/null -w '%{http_code}\n' https://vakilsaabagra.in/api/track

# should be 403 — foreign origin
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Origin: https://example.com' -H 'Content-Type: application/json' \
  -d '{"type":"view","lawyerId":"x"}' https://vakilsaabagra.in/api/track

# should be 401 — signed-out requests are refused
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://vakilsaabagra.in/api/stats?lawyer=<some-id>'
```

### 1.7 Business email — nothing to set up

The site publishes one address, `vakilsaabagra@gmail.com`, and no address on the
domain. That is deliberate: do not set up Email Routing or a `hello@` alias, and
do not publish any other address. It lives in `data/site.json` →
`business.email` and is the only email on the site.

### 1.8 Turn off the old GitHub Pages copy (after 1.3)

The first version of the site was hosted on GitHub Pages and
`wrath-labs.github.io/vakilsaabagra/` still serves it. Once the Cloudflare site
is live: GitHub → `Wrath-Labs/vakilsaabagra` → **Settings** → **Pages** → set the
source to **None** (or **Unpublish site**), and remove any old
`www.vakilsaabagra.com` custom domain listed there.

### 1.9 Let the admin site save changes (GitHub token)

The admin site edits advocates by committing `data/lawyers.json` to this
repository, which makes Cloudflare Pages rebuild. Without a token it still
opens, but read-only, and says so at the top.

1. GitHub → your profile photo → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Resource owner:** `Wrath-Labs`. **Repository access:** *Only select
   repositories* → `vakilsaabagra`. If the organisation has not allowed
   fine-grained tokens, an owner has to switch that on first
   (Organisation → **Settings** → **Personal access tokens**).
3. **Permissions → Repository permissions → Contents: Read and write.**
   *Metadata: Read* is added automatically. Nothing else — not Actions, not
   Administration.
4. **Expiration:** one year, and put the date in your calendar. When it lapses
   the admin goes read-only until you replace it.
5. Copy the token (it is shown once). Cloudflare → Pages project →
   **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name
   `GITHUB_TOKEN`, **Production** → Save → **Deployments** → **Retry
   deployment**.
6. Reload `/admin/`; the "Read-only" notice is gone.

The token can only write to this one repository, but it *can* write to any file
in it. Treat it like the admin password: password manager, never in the repo.
Every admin change is a commit named `admin: …`, so the **Activity** tab and
`git log` are the audit trail, and reverting a commit is the undo.

### 1.10 Attach microsite addresses from the admin (optional)

Without this, attaching `<slug>.vakilsaabagra.in` is the manual dialog in
Part 2 step 6, and everything else works. To make the **Attach** button on the
Microsites tab do it:

1. Cloudflare → **My Profile** → **API Tokens** → **Create Token** → *Create
   Custom Token*:
   - **Account → Cloudflare Pages → Edit**
   - **Zone → DNS → Edit**, with **Zone Resources** set to *Include → Specific
     zone → `vakilsaabagra.in`* (a token without the zone selected fails with
     "Authentication error" on DNS calls)
2. Add three **Secrets** on the Pages project, as in 1.9:
   `CF_API_TOKEN` (that token), `CF_ACCOUNT_ID` (the long hex id in the
   dashboard URL) and `CF_ZONE_ID` (zone **Overview**, right-hand column, *API*).
3. **Retry deployment.**

The button refuses sample advocates by design. `email` ending `@example.com` or
a `+9199990000xx` number marks a record as sample, and a real domain is never
attached to one.

---

## Part 2 — Onboarding a new advocate

### The short way: the admin site

Needs 1.9 done once. Open `https://vakilsaabagra.in/admin/`, sign in, then:

1. **Advocates → Add an advocate.** Fill in the form — name, enrolment, phone,
   practice areas, bio, plan and *Paid until*. If they paid for a microsite,
   tick **Has a microsite** and fill in the subdomain, tagline and long bio.
2. **Add advocate.** The same validation the build uses runs first; anything
   wrong is listed in red and nothing is saved. Success shows the commit, and
   the site is live in about two minutes.
3. Open the new record → **Upload a photo** (JPEG/PNG/WebP, 400 KB or less).
4. Microsite advocates only: **Microsites → Attach** (needs 1.10), or add
   `<slug>.vakilsaabagra.in` by hand as in step 6 below.
5. Send them the link (step 7 below).

Everything after that is a button: **Renew** (sets a new *Paid until*),
**Take down** / **Reinstate**, **Edit**, and **Remove** (typed confirmation).

### The manual way: edit the JSON

The same job without the admin site. Steps 1–5 are on your machine; step 6 is
one dialog in Cloudflare.

### 1. Add the record

Edit `data/lawyers.json` and copy an existing entry in the `lawyers` array.
Fill in the real details — name as enrolled, enrolment number, chamber address,
the phone number clients may call, practice areas, topics, `about`.

### 2. Set the plan

```json
"listing": {
  "plan": "yearly",
  "paidUntil": "2027-08-31",
  "active": true,
  "onboardedOn": "2026-08-31"
}
```

`paidUntil` is the date the listing stops showing. Set it to the end of the
period they have paid for. Prices are in the README under *Plans and billing*.

### 3. If they paid for a microsite, fill in the microsite block

```json
"microsite": {
  "enabled": true,
  "slug": "ramesh",
  "tagline": "Bail, sessions trials and criminal appeals in Agra",
  "longAbout": "…three or four real paragraphs…",
  "faqs": [{ "q": "…", "a": "…" }],
  "accent": "navy"
}
```

- **`slug`** becomes the subdomain: `ramesh.vakilsaabagra.in`. 3–30 characters,
  lowercase letters, digits and hyphens only, unique, and not a reserved
  infrastructure label. The build refuses anything else.
- **`longAbout`** must be genuinely different from `about`, and the build
  refuses it if it is identical. Get it from the advocate in their own words —
  a microsite that repeats the directory profile ranks worse than either page
  would alone.
- **`accent`** is `gold`, `navy`, `teal` or `maroon`. Vary it, so that two
  advocates' sites do not look like the same template.

Leave `"enabled": false` for a listing-only advocate. Everything else in the
block can stay `null`.

### 4. Build

```bash
npm run build
```

Read the output. It tells you how many advocates are live, which microsites were
generated, and who is expiring soon. If validation fails it says exactly which
field on which advocate — fix it and run again. Nothing is written when
validation fails.

### 5. Commit and push

```bash
git add -A
git commit -m "Add Adv. <name>"
git push
```

Cloudflare Pages redeploys on push. Watch it go green in the dashboard.

### 6. Add the subdomain (microsite advocates only)

1. Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `<slug>.vakilsaabagra.in` — the same slug as in the JSON.
3. **Continue** → **Activate domain**. Cloudflare adds the DNS record and issues
   the certificate automatically; it is usually live within a minute or two.
4. Open `https://<slug>.vakilsaabagra.in` and check:
   - the page renders **styled** (if it is unstyled, see *Troubleshooting*)
   - the subdomain is still in the address bar — it must **not** have jumped to
     `vakilsaabagra.in/lawyer.html?id=…`
   - the photograph loads
   - the call button dials the advocate's own number

### 7. Send them the link

WhatsApp them `https://<slug>.vakilsaabagra.in` and their directory profile
`https://vakilsaabagra.in/lawyer.html?id=<id>`. That is the point at which the
listing has actually been delivered.

---

## Part 3 — Renewals

### Who is expiring

Every `npm run build` prints it:

```
⚠ 1 listing expired — hidden from the site:
   Adv. Deepak Goyal                monthly     2026-06-01   80 days ago
⚠ 2 listings expiring within 15 days:
   Adv. Priya Mathur                yearly      2026-08-27   in 7 days
```

An expired advocate disappears from the directory and their microsite stops
serving **on the next build**, not on the date itself. So build and push around
the start of each month even if nothing else changed.

### Renewing

Change one line and rebuild:

```json
"paidUntil": "2028-08-31"
```

Nothing else needs touching. The record was never deleted, so the profile, the
microsite and the URL all come back exactly as they were.

### Taking someone down

```json
"active": false
```

Then `npm run build && git push`. They vanish from the directory, the sitemap
and the tracking id list, and their microsite folder is deleted so the subdomain
returns a real 404. The record stays in `data/lawyers.json`.

You can leave the custom domain in place in Cloudflare — an unmapped slug serves
a proper 404 page. Remove it only if they are not coming back.

---

## Part 4 — The monthly report

1. Open `https://vakilsaabagra.in/admin/stats.html`. It is not linked from
   anywhere and is `Disallow`ed in `robots.txt`.
2. Sign in with the admin password. The session lasts 12 hours; **Sign out**
   ends it sooner.
3. Pick the advocate, click **This month** (or **Last month**), then
   **Fetch report**.
4. Read the numbers: profile views, calls, WhatsApp taps, number copies, how
   often they were shown in results, and the conversion rates.
5. Click **Copy message** and paste it into WhatsApp. It comes out in Hindi,
   already formatted:

   > नमस्ते Ramesh Chandra Chauhan जी,
   >
   > इस महीने Vakil Saab Agra पर आपकी प्रोफ़ाइल \*84 बार\* देखी गई, \*11 कॉल\* और
   > \*6 WhatsApp\* मैसेज आए।

Send it a week or two before `paidUntil`. That message *is* the renewal
conversation — it is much easier than asking somebody to renew on trust.

---

## Troubleshooting

**A microsite renders as unstyled HTML.**
The asset rule in `functions/_middleware.js` is wrong or was edited. `/css/`,
`/js/`, `/assets/`, `/data/`, `/api/` and `/sites/` must be returned by
`next()` *before* the slug lookup happens. Without that, `/css/tailwind.css` on
a subdomain gets rewritten into the per-site folder, 404s, and every microsite
loses its styling.

**A subdomain shows the "not active" 404 page.**
Either the custom domain was never added in Cloudflare, or the slug is not in
`sites/_map.json`. Check `npm run build` output: an advocate who is expired or
`active: false` is deliberately not generated.

**A subdomain shows a Cloudflare error, not our 404.**
The custom domain is missing. DNS is resolving nowhere near the Pages project.

**The subdomain redirects to `vakilsaabagra.in/lawyer.html?id=…`.**
Something turned the internal rewrite into a redirect. It must stay a rewrite —
an advocate paying for their own site should never see our URL in the bar.

**No stats are recorded.**
Check in order: the `DB` binding exists and is named exactly `DB`; the schema
was applied with `--remote`; the advocate's id is in `functions/_ids.js` (it is
not, if they are expired); `navigator.doNotTrack` is not set in the browser you
are testing with. `/api/track` returning `204` proves nothing — it returns `204`
on failure too, by design.

**The admin says "Read-only: GitHub is not connected yet".** `GITHUB_TOKEN` is
missing, expired, or was added without a **Retry deployment** (1.9).

**Saving says "GitHub: Resource not accessible by personal access token".** The
token lacks *Contents: Read and write* on this repository, or it was created for
a different owner. Make a new one as in 1.9.

**Saving says "That would not pass validation".** The list under it is the
build's own message. Nothing was committed. Fix the field and save again.

**A change saved but the site did not change.** It saved as a commit; the build
that follows can still fail. Cloudflare → Pages → **Deployments**. The previous
good deployment keeps serving until a build succeeds.

**`/api/stats` returns 401.** No session — sign in at `/admin/stats.html`.
**Sign-in says "no admin password has been set yet".** Run
`node tools/set-admin-password.js` and paste what it prints into the D1 console.
**Sign-in says "too many attempts".** Eight wrong passwords lock sign-in for 15
minutes. Wait, or run `DELETE FROM admin_attempts;` in the D1 console.
**Sign-in or `/api/stats` returns 500.** The `DB` binding is missing, or the
admin tables do not exist yet — run `schema.sql` again.

---

## Scaling past about 50 advocates

Adding a custom domain by hand is fine up to roughly fifty microsites, and it is
the right trade now: no wildcard DNS to reason about, no extra Worker, and
Cloudflare issues each certificate for you.

Past that it becomes tedious, and the migration is:

1. Add a wildcard DNS record `*.vakilsaabagra.in` pointing at the Pages project.
2. Order a Cloudflare **Advanced Certificate** covering `*.vakilsaabagra.in`
   (wildcard certificates are not part of Universal SSL). This costs money.
3. Put a Worker on the route `*.vakilsaabagra.in/*` that does what
   `functions/_middleware.js` does today, and keep the slug map generated by
   `tools/sync.js` as its lookup table.

The routing logic does not change — only where it runs and how the certificate
is issued. Until then, one dialog per advocate is cheaper than the certificate.
