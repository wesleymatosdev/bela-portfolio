# Astro SSG pilot — evaluation only

This branch ports the hand-built single-file site (`www/index.html`, ~1,800
lines of markup + CSS + vanilla JS) to Astro 7.4.2 (SSG, zero UI framework)
**for A/B review only**. The deployed site and its pipelines are untouched.

## How to run

```sh
npm install
npm run build && npm run preview   # http://localhost:4321/bela-portfolio/
```

Headless proof (requires the current site served at `:8009`, e.g.
`python3 -m http.server 8009 --directory www`):

```sh
node tools/verify_astro_pilot.mjs <evidence-dir>
```

## Structure

| Current | Astro |
| --- | --- |
| one 1,799-line `www/index.html` | `src/pages/index.astro` (66 lines) + 8 components |
| CSS inline in `<head>` | `src/styles/global.css` (inlined back into the page at build) |
| four inline `<script>` blocks | `src/scripts/*.js` (6 modules, ported **verbatim**) |
| `tools/build_projects.py` regenerates card HTML between markers | `src/components/ProjectsGrid.astro` renders cards from `src/data/projects.json` at build time |

Components: `DoodleField`, `Hero`, `Wordmark` (one component serves the hero
and footer copies — the only true deduplication), `ScrollZone`,
`ProjectsGrid`, `ContactSection`, `DetailWindowTemplate`, `Footer`.

## Decisions (and why)

- **CSS is global, not scoped.** The interaction JS creates/queries plain
  classes at runtime (`detail-window`, `doodle`, `scatter-card`…); Astro
  scoped-class rewriting buys nothing and risks breaking those selectors.
  `inlineStylesheets: 'always'` keeps the current single-document shape.
- **Media stays at `public/assets/media/*.webp`** — URL-identical to the
  current site, so the gallery JS (`MEDIA_URL = 'assets/media/'`) and the
  sync pipeline's file names work unchanged. Post-adoption,
  `src/assets/` + `astro:assets` could add width/height inference, srcset
  and AVIF — deliberately NOT done in the pilot (no re-encoding of the 27
  derivatives the pipeline already produces at max 1600px q85).
- **TypeScript strict** template; the ported interaction files stay plain
  `.js` (verbatim ports, zero behavior edits). `astro check` = 0 errors,
  0 warnings.
- **Astro version pinned exact** (`astro: 7.4.2`), lockfile committed.
  `npm audit`: **0 vulnerabilities** (185 packages).
- One **deviation**: filter buttons use `data-filter` + listeners instead of
  inline `onclick="filterWork(...)"` (ES-module scope can't serve inline
  handlers). Behavior identical.

## Build-time data contract (post-adoption pipeline)

Today: `sync-cms.yml` → `www/content/projects.json` + `www/assets/media/` →
`tools/build_projects.py` regenerates card HTML → commit → Pages deploy.

Adopted: `sync-cms.yml` writes the **same** JSON to
`src/data/projects.json` and media to `public/assets/media/`, and the
deploy workflow runs `npm run build` instead of committing regenerated
HTML. `build_projects.py`'s **validation/healing** (id fill, color-token
healing, image-existence checks) still needs a home — either keep running
it as a lint step against the JSON (render markers gone) or port
`validate_and_heal()` into a build script. Its **render** role is fully
replaced by `ProjectsGrid.astro`, including the `c1..c6` token→hex palette
map (outputs byte-identical cards; only escaping of `'` differs,
`&#39;` vs `'` — same rendered text).

## Findings during the pilot

1. **Astro/Vite CSS minification breaks the scroll-driven reveal.** The
   default minifier merges `animation: fade-up linear both` +
   `animation-timeline: view()` into the shorthand
   `animation: linear both fade-up view()`; Chromium rejects that order
   (a timeline must precede the name), every `.reveal` element stays at
   `opacity: 0`, and the project grid never appears. Worked around with
   `vite.build.cssMinify: false` (~2 KB cost). Worth an upstream issue.
2. **Pre-existing quirk, faithfully carried over:** in the detail window the
   initials tile stays visible as an empty white box above the gallery —
   the `hidden` attribute loses to the author rule
   `.detail-thumb { display: flex }`. Identical on the current site
   (check the live site's LUSH window). One-line fix candidate, left
   untouched here to keep the A/B honest.

## Verification

- `npm run build`: zero errors. `astro check`: 0 errors / 0 warnings.
- Generated card HTML diffed against the current page: 9/9 cards,
  8 byte-identical after whitespace-normalize, 1 differs only in `'` escaping.
- Scripted interaction checklist (headless Chromium 1440×900, both sites):
  all 8 items PASS on both — see the PR description.
- Lighthouse (local head-to-head + live reference) — see the PR table.
