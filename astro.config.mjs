import { defineConfig } from 'astro/config';

// GitHub Pages project site — the canonical deploy lives at
// https://wesleymatosdev.github.io/bela-portfolio/ (see .github/workflows/deploy.yml,
// untouched by this pilot). `base` keeps every URL identical to the current site.
export default defineConfig({
  site: 'https://wesleymatosdev.github.io',
  base: '/bela-portfolio',
  // The current site ships one HTML file with the CSS inline in <head>.
  // 'always' preserves that shape (one document, zero extra CSS requests).
  build: {
    inlineStylesheets: 'always',
  },
  // CSS minification disabled (the Vite-level flag is the one Astro v7
  // honors; build.cssMinify is re-derived internally). The default minifier
  // rewrites the scroll-driven animation longhands in global.css
  // (`animation: fade-up linear both` + `animation-timeline: view()`) into
  // the shorthand `animation: linear both fade-up view()` — Chromium rejects
  // that declaration order (a timeline must precede the name in the
  // `animation` shorthand), so every .reveal element stays at opacity: 0.
  // Unminified CSS keeps behavior identical to the current site (~2KB cost).
  vite: {
    build: { cssMinify: false },
  },
});
