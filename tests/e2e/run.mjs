#!/usr/bin/env node
// E2E regression suite for the bela-portfolio static site.
// Locks down CURRENT site behavior — base-URL-parametric so it can run against
// a local static server, a future framework preview, or production.
//
// Usage:
//   node run.mjs --base <url> [--report <dir>]
//   node run.mjs --serve <dir> [--port N] [--report <dir>]   # serve + run
//
// Exit code 0 only when every check passes. Writes <report>/results.json plus
// failure screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { assert, resolveChromium, startStaticServer, repoRoot, sleep } from './helpers.mjs';
import {
  checkContentParity, checkAssetsResolve, checkCardThumbs, checkSeoHead,
  checkModalImageLed, checkModalThumbSwitch, checkWindowDrag, checkWindowGenie,
  checkWindowMaximize, checkWindowClose, checkScrollReveal, checkWordmarkEgg,
  checkReducedMotion,
} from './checks.mjs';

// --- args ------------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--base' || a === '--report' || a === '--serve' || a === '--port') {
    args[a.slice(2)] = process.argv[++i];
  } else if (a === '--help' || a === '-h') {
    console.log('Usage: node run.mjs --base <url> [--report <dir>]\n       node run.mjs --serve <dir> [--port N] [--report <dir>]');
    process.exit(0);
  }
}

// --- setup -----------------------------------------------------------------
let server = null;
let base = args.base;
if (args.serve) {
  let root = path.resolve(args.serve); // relative to cwd
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    const alt = path.join(repoRoot, args.serve); // fall back: relative to repo root
    if (fs.existsSync(path.join(alt, 'index.html'))) root = alt;
  }
  server = await startStaticServer(root, args.port ? Number(args.port) : 0);
  base = base || `http://127.0.0.1:${server.port}/`;
}
if (!base) {
  console.error('error: --base <url> is required (or use --serve <dir>)');
  process.exit(2);
}
base = base.endsWith('/') ? base : base + '/';

const reportDir = path.resolve(args.report || path.join(repoRoot, 'tests/e2e/report'));
fs.mkdirSync(reportDir, { recursive: true });

// ground truth — fetched from the target site itself, never hardcoded
const projectsUrl = new URL('content/projects.json', base).href;
const projectsRes = await fetch(projectsUrl);
if (!projectsRes.ok) {
  console.error(`error: could not fetch ground truth ${projectsUrl} (HTTP ${projectsRes.status})`);
  process.exit(2);
}
const data = await projectsRes.json();
console.log(`bela-portfolio e2e — base=${base}`);
console.log(`ground truth: ${projectsUrl} (${data.projects.length} projects)`);

const { bin: chromiumBin, source: chromiumSource } = resolveChromium();
console.log(`chromium: ${chromiumBin} (${chromiumSource})`);

const browser = await chromium.launch({ executablePath: chromiumBin, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

await page.goto(base, { waitUntil: 'networkidle' });
await sleep(1800); // entrance animations settle (matches the pilot rig)

// --- check execution ---------------------------------------------------------
const state = {};
const env = {
  browser, page, base, data, state,
  // resolves env.page at call time so checks that swap pages (reduced-motion
  // context) get their screenshots captured on the right page
};
env.shot = async (name) => {
  const file = `${name}.png`;
  try { await env.page.screenshot({ path: path.join(reportDir, file) }); return file; }
  catch { return null; }
};

const CHECKS = [
  ['content-parity', checkContentParity],
  ['assets-resolve', checkAssetsResolve],
  ['card-thumbs', checkCardThumbs],
  ['seo-head', checkSeoHead],
  ['modal-image-led', checkModalImageLed],
  ['modal-thumb-switch', checkModalThumbSwitch],
  ['window-drag', checkWindowDrag],
  ['window-genie', checkWindowGenie],
  ['window-maximize', checkWindowMaximize],
  ['window-close', checkWindowClose],
  ['scroll-reveal-visible', checkScrollReveal],
  ['wordmark-easter-egg', checkWordmarkEgg],
  ['reduced-motion', checkReducedMotion],
];

const results = [];
const startedAt = new Date().toISOString();
for (const [name, fn] of CHECKS) {
  const entry = { name, status: 'pass', evidence: null, error: null, screenshot: null };
  const t0 = Date.now();
  try {
    entry.evidence = (await fn(env)) ?? {};
    console.log(`PASS ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    entry.status = 'fail';
    entry.error = String(e && e.message || e).slice(0, 500);
    entry.screenshot = await env.shot(`fail-${name}`).catch(() => null);
    console.log(`FAIL ${name} (${Date.now() - t0}ms) — ${entry.error}`);
  }
  results.push(entry);
}

await browser.close();
if (server) await server.close();

const passCount = results.filter((r) => r.status === 'pass').length;
const summary = {
  tool: 'bela-portfolio e2e regression suite',
  base,
  chromium: chromiumBin,
  chromiumSource,
  viewport: '1440x900',
  startedAt,
  finishedAt: new Date().toISOString(),
  projectsInGroundTruth: data.projects.length,
  summary: { total: results.length, pass: passCount, fail: results.length - passCount, allPass: passCount === results.length },
  checks: results,
  consoleErrors,
  pageErrors,
};
const resultsPath = path.join(reportDir, 'results.json');
fs.writeFileSync(resultsPath, JSON.stringify(summary, null, 2));
console.log(`\nreport: ${resultsPath}`);
console.log(`${passCount}/${results.length} checks pass`);
process.exit(passCount === results.length ? 0 : 1);
