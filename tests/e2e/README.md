# bela-portfolio E2E regression suite

Locks down the CURRENT site's behavior (single-page `www/index.html`, vanilla
JS/CSS). The suite is **base-URL-parametric**: it runs against whatever URL you
give it — a local static server today, a framework preview or production
later. There is no framework/migration logic here by design.

## Run

```sh
cd tests/e2e
npm ci                # installs the pinned playwright-core
npx playwright-core install chromium   # one-time: browser into the default cache
npm test              # serves ../../www and runs the suite (report in report/)
npm run test:live     # runs against https://wesleymatosdev.github.io/bela-portfolio/
```

Direct invocation:

```sh
node run.mjs --base <url> [--report <dir>]
node run.mjs --serve <dir> [--port N] [--report <dir>]
```

Exit code 0 only if every check passes. Output: `<report>/results.json`
(per-check status + evidence values) and failure screenshots in the report dir.

Environment overrides: `CHROME_BIN` picks a specific Chromium binary; otherwise
the pinned playwright-core's own browser is used, falling back to a scan of the
Playwright browser cache (`~/Library/Caches/ms-playwright` /
`~/.cache/ms-playwright`).

## Check catalog

Ground truth is derived at runtime from `content/projects.json` fetched **from
the target site itself** — no counts, titles, or image names are hardcoded.

| Check | Locks down |
| --- | --- |
| `content-parity` | Rendered cards match projects.json 1:1: count, order, title, year, category label |
| `assets-resolve` | Every image referenced by any card (data-images + thumbs) returns HTTP 200 and decodes (`naturalWidth > 0`) |
| `card-thumbs` | Each card thumb carries its CMS palette color (inline `--thumb-color` equals computed background) |
| `modal-image-led` | Image-led modal: cover is the lead (decodes, visible height ≥ 200px @1440×900) and the initials tile is hidden (`display:none` **and** zero box height — regression-guard for commit 1dfba69, where `display:flex` beat the `[hidden]` attribute) |
| `modal-thumb-switch` | Clicking a gallery thumbnail swaps the cover src and moves the `.sel` marker |
| `window-drag` | Dragging the titlebar moves the detail window (position delta) |
| `window-genie` | Minimize hides the window, spawns the per-project dock icon; clicking it restores the window and removes the icon |
| `window-maximize` | Maximize fills the viewport; second click restores the size |
| `window-close` | Close removes the window and leaves no orphaned genie icon |
| `scroll-reveal-visible` | After scrolling through the page, every `.reveal` element reaches computed `opacity > 0` (regression-guard for the broken animation-shorthand bug class) |
| `wordmark-easter-egg` | Clicking a hero wordmark letter triggers its animation (running WAAPI animation + mid-flight transform state) |
| `reduced-motion` | With `prefers-reduced-motion: reduce`, primary content stays fully visible and the modal + genie still work (instant-snap path) |
| `seo-head` | `title`, `meta[name=description]`, `og:title`, `og:image` present and non-empty |

## CI

`.github/workflows/e2e.yml` runs the suite on every PR touching the site, on
pushes to main, and via workflow_dispatch. Browser install command used there:

```sh
npx playwright-core install chromium
```

(inside `tests/e2e`, so the pinned playwright-core installs its exact matching
Chromium build into the default cache).
