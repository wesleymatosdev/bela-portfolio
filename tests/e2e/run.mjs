#!/usr/bin/env node
// E2E regression gate for the bela-portfolio Astro migration.
//
//   node tests/e2e/run.mjs --legacy <url> [--candidate <url>] [--report <dir>]
//
//   --legacy alone        self-check mode: run the suite against the legacy site only.
//   --candidate <url>     parity mode: run the SAME checks against both stacks and
//                         fail on any check that fails on either (the migration gate).
//
// Exit code 0 only when every check passes on every tested stack. Writes
// <report>/results.json (per-check status + evidence) and a failure screenshot
// per failing check.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, VIEWPORT } from './lib/browser.mjs';
import { loadGroundTruth } from './lib/ground-truth.mjs';
import * as checks from './lib/checks.mjs';
import { DOM_AUDIT_INIT } from './lib/checks.mjs';

function parseArgs(argv) {
  const args = { report: path.join(path.dirname(fileURLToPath(import.meta.url)), 'report') };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--legacy') args.legacy = argv[++i];
    else if (argv[i] === '--candidate') args.candidate = argv[++i];
    else if (argv[i] === '--report') args.report = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else { console.error(`Unknown argument: ${argv[i]}`); args.help = true; }
  }
  return args;
}

const USAGE = `
Usage: node tests/e2e/run.mjs --legacy <url> [--candidate <url>] [--report <dir>]

  --legacy <url>      legacy site (www/) base URL, e.g. http://127.0.0.1:8009/
  --candidate <url>   Astro build base URL, e.g. http://127.0.0.1:4321/bela-portfolio/
                      (omit for legacy self-check mode)
  --report <dir>      report output dir (default: tests/e2e/report)

Serve the stacks first:
  python3 -m http.server 8009 --directory www          # legacy
  npm run build && npm run preview                      # Astro -> :4321/bela-portfolio/

Browser: uses the machine's cached ms-playwright Chromium (or $CHROME_BIN).
Install it for the pinned playwright-core with:  npx playwright-core install chromium
`;

// Catalog order matters: modal checks 4-8 share one open detail window
// (ctx.state.win), and window-close must run last of those.
const CATALOG = [
  { name: 'content-parity', run: checks.contentParity },
  { name: 'assets-resolve', run: checks.assetsResolve },
  { name: 'card-thumbs', run: checks.cardThumbs },
  { name: 'modal-image-led', run: checks.modalImageLed },
  { name: 'modal-thumb-switch', run: checks.modalThumbSwitch },
  { name: 'window-drag', run: checks.windowDrag },
  { name: 'window-genie', run: checks.windowGenie },
  { name: 'window-maximize', run: checks.windowMaximize },
  { name: 'window-close', run: checks.windowClose },
  { name: 'scroll-reveal-visible', run: checks.scrollRevealVisible },
  { name: 'wordmark-easter-egg', run: checks.wordmarkEasterEgg },
];

async function runChecks(page, browser, stack, url, gt, reportDir) {
  const ctx = { gt, state: {}, stack, url, reportDir };
  const out = {};
  for (const { name, run } of CATALOG) {
    const t0 = Date.now();
    let result;
    try {
      result = await run(page, ctx);
    } catch (e) {
      result = { pass: false, detail: `check threw: ${e.message.split('\n')[0]}`, evidence: { error: String(e).slice(0, 500) } };
    }
    if (!result.pass) {
      try {
        await page.screenshot({ path: path.join(reportDir, `${stack}-${name}.png`) });
        result.screenshot = `${stack}-${name}.png`;
      } catch { /* screenshot is best-effort evidence */ }
    }
    result.ms = Date.now() - t0;
    out[name] = { pass: !!result.pass, detail: String(result.detail ?? ''), evidence: result.evidence ?? null, ...(result.screenshot ? { screenshot: result.screenshot } : {}), ms: result.ms };
    console.log(`  [${stack}] ${result.pass ? 'PASS' : 'FAIL'} ${name} — ${out[name].detail}`);
  }
  // 10. reduced-motion runs in its own context (needs the emulation).
  const t0 = Date.now();
  let rm;
  try {
    rm = await checks.reducedMotion(browser, ctx);
  } catch (e) {
    rm = { pass: false, detail: `check threw: ${e.message.split('\n')[0]}`, evidence: { error: String(e).slice(0, 500) } };
  }
  out['reduced-motion'] = { pass: !!rm.pass, detail: String(rm.detail ?? ''), evidence: rm.evidence ?? null, ms: Date.now() - t0 };
  console.log(`  [${stack}] ${rm.pass ? 'PASS' : 'FAIL'} reduced-motion — ${out['reduced-motion'].detail}`);
  return out;
}

async function runStack(browser, stack, url, gt, reportDir) {
  console.log(`\n=== ${stack}: ${url} ===`);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(DOM_AUDIT_INIT);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 300)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800); // entrance animations settle
  const checkResults = await runChecks(page, browser, stack, url, gt, reportDir);
  const result = { url, checks: checkResults };
  if (consoleErrors.length) {
    result.consoleErrors = consoleErrors;
    console.log(`  [${stack}] note: ${consoleErrors.length} console error(s) recorded (informational, in results.json)`);
  }
  await context.close();
  return result;
}

const args = parseArgs(process.argv);
if (args.help || !args.legacy) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 2);
}

const gt = loadGroundTruth();
const stacks = [{ key: 'legacy', url: args.legacy }];
if (args.candidate) stacks.push({ key: 'astro', url: args.candidate });

fs.mkdirSync(args.report, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  mode: args.candidate ? 'parity' : 'self-check',
  viewport: VIEWPORT,
  groundTruth: { source: 'www/content/projects.json', projects: gt.length, imageRefs: gt.reduce((s, p) => s + p.images.length, 0) },
  stacks: {},
};

let ok = true;
const browser = await launchBrowser().catch((e) => { console.error(`Browser launch failed: ${e.message}`); process.exit(2); });
try {
  for (const { key, url } of stacks) {
    const res = await runStack(browser, key, url, gt, args.report);
    report.stacks[key] = res;
    const passed = Object.values(res.checks).filter((c) => c.pass).length;
    const total = Object.keys(res.checks).length;
    res.summary = { pass: passed, fail: total - passed, total };
    if (passed !== total) ok = false;
  }
} finally {
  await browser.close();
}

// Parity verdict: a migration regression is a check that passes on legacy but
// fails on the candidate.
if (args.candidate) {
  report.parity = Object.keys(report.stacks.legacy.checks).map((name) => {
    const l = report.stacks.legacy.checks[name].pass;
    const a = report.stacks.astro.checks[name]?.pass ?? false;
    return { check: name, legacy: l, astro: a, regression: l && !a };
  });
  const regressions = report.parity.filter((p) => p.regression);
  if (regressions.length) {
    console.error(`\nPARITY BREAK: ${regressions.map((r) => r.check).join(', ')} pass on legacy but fail on the Astro candidate`);
    ok = false;
  }
}

fs.writeFileSync(path.join(args.report, 'results.json'), JSON.stringify(report, null, 2));
for (const [key, res] of Object.entries(report.stacks)) {
  console.log(`\n${key}: ${res.summary.pass}/${res.summary.total} checks pass (${res.url})`);
}
console.log(`\nReport: ${path.join(args.report, 'results.json')}`);
console.log(ok ? 'E2E GATE: GREEN' : 'E2E GATE: RED');
process.exit(ok ? 0 : 1);
