// PR evidence capture for the filled-backdrop modal cover.
// Usage: node evidence.mjs shots <baseURL> <outDir> <tag>
//        node evidence.mjs video  <baseURL> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { findChromeBinary, VIEWPORT } from './lib/browser.mjs';

const [, , mode, baseUrl, outDir] = process.argv;
const browser = await chromium.launch({ executablePath: findChromeBinary(), headless: true });

const videoCtx = mode === 'video'
  ? await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: outDir, size: VIEWPORT } })
  : await browser.newContext({ viewport: VIEWPORT });
const page = await videoCtx.newPage();
// base branch (before) has no .front/.backdrop split — fall back to any src'd img
const FRONT = process.env.LEGACY ? '.detail-cover img[src]' : '.detail-cover img.front';

async function openProject(substr) {
  await page.locator('#workGrid .scatter-card', { hasText: substr }).first().click();
  const win = page.locator('.detail-window').first();
  await win.waitFor({ state: 'visible', timeout: 5000 });
  await win.locator(FRONT).evaluate((img) => img.decode().catch(() => {}));
  await page.waitForTimeout(900); // entrance animation settles
  return win;
}

await page.goto(baseUrl, { waitUntil: 'networkidle' });

if (mode === 'shots') {
  const tag = process.argv[4 + 1]; // argv: mode baseUrl outDir tag
  // ultra-wide banner (ratio 4.0): LUSH lead image
  const lush = await openProject('LUSH');
  await lush.screenshot({ path: path.join(outDir, `${tag}-wide-lush.png`) });
  await page.locator('.detail-pill').click();
  await page.waitForTimeout(300);
  // tall portrait (ratio 0.43): Café lead image
  const cafe = await openProject('Café');
  await cafe.screenshot({ path: path.join(outDir, `${tag}-tall-cafe.png`) });
  await page.locator('.detail-pill').click();
  console.log('shots done:', tag);
} else {
  // wheel-cycle a gallery, recording video; mid-glide frames prove no white
  // letterbox flash. Project picked by the 5th arg (default LUSH).
  const which = process.argv[5] || 'LUSH';
  const lush = await openProject(which);
  await page.locator('.detail-gallery').hover();
  const shot = (n) => page.screenshot({ path: path.join(outDir, `glide-frame-${n}.png`) });
  await page.mouse.wheel(0, 120); // -> image 2
  await page.waitForTimeout(200); await shot('mid-glide-to-portrait');
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, 120); // -> image 3
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, -120); // -> back to image 2
  await page.waitForTimeout(200); await shot('mid-glide-back');
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, -120); // -> back to image 1
  await page.waitForTimeout(1000);
  await page.locator('.detail-pill').click();
  await page.waitForTimeout(300);
  const vid = page.video();
  await videoCtx.close(); // flush the recording before copying
  fs.copyFileSync(await vid.path(), path.join(outDir, `wheel-cycle-${which.replace(/[^a-z]+/gi, '-').toLowerCase()}.webm`));
  console.log('video done');
}

await videoCtx.close();
await browser.close();
