# Vakil Saab Agra — brand kit

Everything in this folder is generated. Nothing here is hand-edited, and
editing a file here will be overwritten the next time somebody runs the build.
The sources live in [`tools/brand/`](../../tools/brand); see
**[Regenerating](#regenerating)**.

**The same guide as a page:**
<https://claude.ai/code/artifact/77f880b7-885e-405c-af06-5cd5e34a3314> — the
logos as live vector, the favicon strip at actual pixel size, and the contrast
table computed from the tokens. It is a private link until it is shared from
the page's own share menu.

```
assets/brand/
├── logo/      the lockups, SVG and PNG
├── icon/      the mark on its own, plus the favicon and app-icon set
├── social/    banners and profile pictures at each platform's exact size
├── print/     letterhead, poster, email signature
└── tokens/    the palette as JSON, CSS, SCSS and a Tailwind fragment
```

---

## The short version

|  |  |
|---|---|
| Navy | `#0f2540` |
| Gold | `#b0861f` on paper, `#dcb85f` on navy |
| Display face | Playfair Display, 700 |
| Text face | Inter, 400–700 |
| Hindi | Noto Sans Devanagari, same weights |
| Default logo | `logo/logo-horizontal-light.svg` |
| Clear space | the height of the mark's corner radius, on all four sides |
| Smallest the logo goes | 120 px wide on screen, 30 mm in print |

---

## The mark

A balance beam on a standing post, two pans, a domed cap and a stepped base —
scales, drawn as an object rather than as an icon. It reads as a legal
directory in Agra without a gavel, which is an American courtroom prop and not
an Indian one.

| File | Use |
|---|---|
| `icon/mark-navy.svg` | the default. Navy tile, gold drawing. App icons, avatars, anywhere it sits on a light or busy background |
| `icon/mark-gold.svg` | the drawing alone, no tile, for placing on navy |
| `icon/mark-paper.svg` | navy drawing on a warm off-white tile, for placing on a photograph or a coloured panel |
| `icon/mark-mono-navy.svg` · `-white` · `-black` | one colour, no tile. Embroidery, stamps, a fax header, anything with one ink |
| `icon/favicon.svg` | **a different drawing.** See below |

### The favicon is deliberately not the mark

At 16 px the hooks, the chains and the base steps turn into three grey pixels.
`icon/favicon.svg` keeps only the beam, the post, the two pans and the boss,
and thickens every stroke until each one survives. Use it at 64 px and below;
use the real mark at 180 px and above. `icon/icon-maskable-512.png` is the
favicon again with 14% padding, because Android crops a maskable icon to
whatever shape the launcher feels like and only guarantees the middle 80%.

---

## The lockups

Three crops of one grid, so the mark is the same size relative to the wordmark
in all of them.

| | When |
|---|---|
| **Horizontal** — `logo/logo-horizontal-*.svg` | the default. Site header, letterhead, anything wider than it is tall |
| **Stacked** — `logo/logo-stacked-*.svg` | square and near-square spaces: social banners, posters, a profile card |
| **Wordmark** — `logo/wordmark-*.svg` | where the mark already appears elsewhere in the same view, or where it would be smaller than 40 px |

Each comes in five finishes:

- **`-light`** — full colour for light backgrounds. Navy tile, ink wordmark.
- **`-dark`** — full colour for dark backgrounds. The drawing alone in gold, white wordmark. The tile is dropped on purpose: a navy tile on a navy background is a rectangle of nothing.
- **`-mono-navy`**, **`-mono-white`**, **`-mono-black`** — one ink, for print, engraving, and any surface that cannot hold a gradient.

Reach for a mono version whenever the background is busy, coloured, or out of
your control. A gradient logo over a photograph is the single fastest way to
make a brand look improvised.

### Clear space and minimum size

Keep clear on all four sides a margin equal to the mark's corner radius —
about 23% of the mark's height. Nothing enters that margin: no text, no rule,
no photo edge, no other logo.

Do not set the horizontal lockup below **120 px wide** on screen or **30 mm**
in print. Below that the tagline stops being letters. If the space is smaller
than that, use the wordmark or the mark alone.

### What not to do

Do not recolour it, stretch it, rotate it, add a shadow or an outline, put the
gradient version on a photograph, rebuild the lockup by placing the mark next
to type yourself, or set the wordmark in a font that is not Playfair Display.
Every combination you are likely to need already exists in this folder.

---

## Colour

Run `node tools/brand/check-contrast.js` for the measured table. In short:

| Token | Hex | What it is for |
|---|---|---|
| `--vs-ink` | `#0f2540` | the brand navy. Headings, navigation, primary surfaces |
| `--vs-ink-2` `--vs-ink-3` | `#1b3f68` `#081527` | the two ends of the navy gradient, and nothing else |
| `--vs-gold` | `#b0861f` | **3.35:1 on white.** Large text, eyebrows and rules only — never body copy |
| `--vs-gold-2` | `#dcb85f` | 8.14:1 on navy, so it is a text colour there. On paper it is decoration only, at 1.9:1 |
| `--vs-gold-3` `--vs-gold-4` | `#f7e3a1` `#9d7728` | the shine and the shadow in the metal gradient |
| `--vs-paper` `-2` `-3` | `#ffffff` `#faf8f4` `#f4f1ea` | page and alternating section bands |
| `--vs-muted` | `#566a80` | secondary text on paper, 5.57:1 |
| `--vs-muted-2` | `#7a8ba0` | **3.48:1 — not a text colour at any size.** The resting state of a control whose active state is `--ink` |
| `--vs-slate` | `#a8bdd4` | body copy on navy, 8.02:1 |

> **Known issue, inherited from the site.** `css/styles.css` uses `--muted-2`
> for the inactive language-toggle label at `.74rem`. At 3.48:1 that is below
> WCAG AA for text. Moving that one rule to `--muted` fixes it and changes
> nothing else. It is left alone here because repainting the live site is not
> the brand kit's call to make.

The two gradients, and the only two:

```css
--vs-gradient-navy: linear-gradient(135deg, #1b3f68 0%, #0f2540 52%, #081527 100%);
--vs-gradient-gold: linear-gradient(160deg, #f7e3a1 0%, #dcb85f 35%, #c39c40 70%, #9d7728 100%);
```

Gold is an accent. If a layout looks like it needs more gold, it needs more
white space instead.

---

## Type

**Playfair Display 700** for display — the wordmark, headlines, an advocate's
name. **Inter** for everything else. Both are SIL Open Font License, so they
can be embedded in a PDF or shipped with a deck without a licence.

**Noto Sans Devanagari** sits *after* the Latin faces in both stacks rather
than replacing them, so Latin text keeps Inter and Playfair and only the
Devanagari codepoints — which neither of those covers — fall through to Noto.
Hindi and English are equal here; Hindi is not a translation layer bolted on.

The eyebrow is the one fixed detail: uppercase, 700, `letter-spacing: .26em`,
in gold. It appears above section headings across the site, on the banners and
on the business card, and it is most of what makes a new piece look like it
belongs.

---

## Social

Every file is already the exact pixel size the platform asks for, so nothing
needs resizing before upload.

| File | Size | Where |
|---|---|---|
| `social/x-header-dark.png` · `-light` | 1500×500 | X header |
| `social/avatar-dark.png` · `-light` | 1000×1000 | any circular profile picture — X, Instagram, WhatsApp, Facebook |
| `social/linkedin-company-cover.png` · `-light` | 1128×191 | LinkedIn company page |
| `social/linkedin-personal-cover.png` · `-light` | 1584×396 | LinkedIn profile background |
| `social/facebook-cover.png` | 1640×856 | Facebook page cover |
| `social/instagram-post.png` · `-light` | 1080×1080 | Instagram feed |
| `social/instagram-story.png` | 1080×1920 | Instagram / WhatsApp status |
| `social/youtube-banner.png` | 2560×1440 | YouTube channel art |
| `social/google-business-cover.png` | 1024×576 | Google Business Profile |
| `social/og-image.png` | 1200×630 | the card under a shared link |
| `social/slide-title.png` | 1920×1080 | opening slide of a deck |

Each of these composes inside the platform's safe area, which is not the same
as the file. The X header keeps its left third clear below the midline because
the avatar sits there. The Facebook cover holds everything inside a centred
1180×560 box because the desktop crop is 820×312 and the mobile crop is
narrower still. The YouTube banner puts everything inside the centred
1546×423 box, which is all a phone ever shows. The Instagram story stays
260 px clear of the top and bottom, under Instagram's own chrome.

Use the dark faces by default. The light faces exist for a feed that is
already dark, or a post that needs to feel like a document rather than an ad.

---

## Print

| File | |
|---|---|
| `print/letterhead-a4.png` | 2481×3507 — A4 at 300 DPI |
| `print/poster-a4.png` | 2481×3507 — A4 at 300 DPI, for a chamber wall or a court corridor |
| `print/email-signature.html` | **paste this one, do not send the PNG.** Open it in a browser, select all, copy, paste into Gmail or Outlook. Four lines are marked `EDIT` |
| `print/email-signature-preview.png` | what the snippet should look like once a mail client has had its way with it |

The business card lives at
[`assets/business-card/`](../business-card) and has its own renderer at
`tools/business-card/render.js` — 2100×1200, which is 600 DPI at 3.5in × 2in.

Give a printer the **SVG**, not the PNG, and give them the mono version if the
job is one or two inks. Ask for CMYK conversion at their end rather than
converting yourself; the navy in particular shifts if it is converted twice.

---

## Tokens

`tokens/` carries the palette and the type stack in four shapes so nobody has
to retype a hex:

- `brand.json` — every colour with its hex *and* the role it plays. For Figma, or any tooling that ingests tokens.
- `brand.css` — CSS custom properties, `--vs-*` prefixed.
- `_brand.scss` — the same as SCSS variables.
- `tailwind.brand.js` — a `theme.extend` fragment to spread into a Tailwind config.

These are exports **for other people**. The site's own tokens live in
`css/styles.css` and `tailwind.config.js` and are not read from here — a build
step that could repaint the live site from the brand kit is a sharper tool than
this project needs.

---

## A note on the vector files

The SVG lockups do not embed a font. Each text run instead carries
`textLength`, which pins its advance width: a renderer without Playfair
Display falls back to Georgia and adjusts the letter-spacing to land on exactly
the same width, so the layout never breaks — only the letterforms differ.

That is the right trade for a file that has to open anywhere. But it means the
SVG is not the master for anything a customer sees. **For that, use the PNGs.**
They are shot in a browser with the real webfonts loaded, which is why the
wordmark on the banners is genuinely Playfair Display and the wordmark in
`logo-horizontal-light.svg` might not be.

The Hindi lockup is PNG-only for the same reason, and more so: Devanagari
conjuncts do not survive a fallback.

---

## Regenerating

```bash
node tools/brand/build-logos.js      # the SVGs in logo/ and icon/
node tools/brand/build-tokens.js     # the four files in tokens/
node tools/brand/render.js           # every PNG — needs Chrome, takes ~2 min
node tools/brand/render.js social    # just the ones whose path matches "social"
node tools/brand/check-contrast.js   # the palette audit
node tools/brand/build-guide.js      # the shareable guide page (not committed — 1.2 MB of embedded previews)
```

Or all four at once:

```bash
npm run brand
```

Colours and copy change in one place: **`tools/brand/tokens.js`**. Sizes and
the job list live in `tools/brand/manifest.js`. The banners themselves are
ordinary HTML in `tools/brand/social/` and `tools/brand/print/`, sharing
`tools/brand/social/brand.css` — open one in a browser and it renders exactly
as it will be shot.
