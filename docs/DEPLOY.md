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

### 1.1 Point the domain at Cloudflare

1. Sign in to **Cloudflare** → **Add a site** → enter `vakilsaabagra.in` → choose
   the **Free** plan.
2. Cloudflare shows two nameservers, e.g. `xxx.ns.cloudflare.com` and
   `yyy.ns.cloudflare.com`. Copy both.
3. Sign in to **Hostinger** → **Domains** → `vakilsaabagra.in` → **DNS / Nameservers**
   → **Change nameservers** → **Use custom nameservers** → paste the two values →
   **Save**.
4. Wait for Cloudflare to show the domain as **Active**. This usually takes a few
   minutes and can take up to 24 hours. Nothing below works until it does.

> Do not delete anything at Hostinger. The domain stays registered there; only
> DNS moves to Cloudflare.

### 1.2 Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Authorise GitHub and pick the **`Wrath-Labs/vakilsaabagra`** repository.
3. Set up the build:
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

`vakilsaabagra.in` is the canonical host. `www` serves the same site; the
middleware passes both through untouched.

### 1.4 Create and bind the database

In a terminal, from the repository root:

```bash
npx wrangler login
npx wrangler d1 create vakilsaabagra
npx wrangler d1 execute vakilsaabagra --remote --file=./schema.sql
```

The second command prints a database id — you do not need to copy it anywhere,
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

### 1.5 Set the admin token

1. Generate a long random string:
   ```bash
   openssl rand -hex 32
   ```
2. Pages project → **Settings** → **Environment variables** → **Add variable**:
   - **Name:** `ADMIN_TOKEN`
   - **Value:** the string from step 1
   - **Type:** **Secret** (encrypted)
   - **Environment:** Production
3. Save, then **Retry deployment** so the running build picks it up.

Store the token in a password manager. **Never commit it.** It is the only thing
protecting `/api/stats`, and anyone holding it can read every advocate's numbers.

### 1.6 Check it works

```bash
# should be 405 — the endpoint takes POST only
curl -s -o /dev/null -w '%{http_code}\n' https://vakilsaabagra.in/api/track

# should be 403 — foreign origin
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Origin: https://example.com' -H 'Content-Type: application/json' \
  -d '{"type":"view","lawyerId":"x"}' https://vakilsaabagra.in/api/track

# should be 401 without the token, 200 with it
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://vakilsaabagra.in/api/stats?lawyer=<some-id>'
```

---

## Part 2 — Onboarding a new advocate

The whole job, in order. Steps 1–5 are on your machine; step 6 is one dialog in
Cloudflare.

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
2. Paste the `ADMIN_TOKEN`.
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

**`/api/stats` returns 401.** Wrong or missing `X-VS-Admin` token.
**`/api/stats` returns 500.** `ADMIN_TOKEN` or the `DB` binding is not set.

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
