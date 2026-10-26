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
});
