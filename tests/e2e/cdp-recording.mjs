// Frame-accurate screencast for the PR: CDP Page.startScreencast (every
// compositor frame, timestamped) instead of Playwright's 25fps paint-timed
// recordVideo, assembled into a constant-fps MP4 — no stutter in GitHub's player.
// Usage: node cdp-recording.mjs <baseURL> <outFile> <projectSubstr>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { findChromeBinary, VIEWPORT } from './lib/browser.mjs';

const [, , baseUrl, outFile, which] = process.argv;
const browser = await chromium.launch({ executablePath: findChromeBinary(), headless: true });
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(baseUrl, { waitUntil: 'networkidle' });

await page.locator('#workGrid .scatter-card', { hasText: which }).first().click();
const win = page.locator('.detail-window').first();
await win.waitFor({ state: 'visible', timeout: 5000 });
await win.locator('.detail-cover img.front').evaluate((img) => img.decode().catch(() => {}));
await page.waitForTimeout(1000); // entrance settles

const cdp = await page.context().newCDPSession(page);
const frames = [];
let ackQueue = Promise.resolve();
cdp.on('Page.screencastFrame', (ev) => {
  frames.push({ ts: ev.metadata?.timestamp ?? null, data: ev.data });
  ackQueue = ackQueue.then(() => cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}));
});
await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

await page.locator('.detail-gallery').hover();
await page.waitForTimeout(500);
await page.mouse.wheel(0, 120);  await page.waitForTimeout(1000); // -> image 2
await page.mouse.wheel(0, 120);  await page.waitForTimeout(1000); // -> wraps to image 1
await page.waitForTimeout(300);
await page.mouse.wheel(0, -120); await page.waitForTimeout(1000); // -> image 2 again
await page.mouse.wheel(0, -120); await page.waitForTimeout(1200); // -> back to image 1
await page.locator('.detail-pill').click();
await page.waitForTimeout(400);

await cdp.send('Page.stopScreencast');
await ackQueue;
await browser.close();

if (!frames.length) { console.error('no frames captured'); process.exit(1); }
// drop exact-duplicate timestamps, keep arrival order; timestamps in seconds
let timed = frames.map((f, i) => ({ ...f, ts: f.ts ?? i / 25 }));
timed.sort((a, b) => a.ts - b.ts);
const tmp = path.join(path.dirname(outFile), path.basename(outFile) + '-frames');
fs.mkdirSync(tmp, { recursive: true });
const list = [];
for (let i = 0; i < timed.length; i++) {
  const file = path.join(tmp, `f${String(i).padStart(5, '0')}.png`);
  fs.writeFileSync(file, Buffer.from(timed[i].data, 'base64'));
  const next = timed[i + 1] ? timed[i + 1].ts : timed[i].ts + 0.6;
  const dur = Math.min(0.5, Math.max(1 / 60, next - timed[i].ts));
  list.push(`file '${file}'\nduration ${dur.toFixed(4)}`);
}
const lastFile = path.join(tmp, `f${String(timed.length - 1).padStart(5, '0')}.png`);
list.push(`file '${lastFile}'`);
fs.writeFileSync(outFile + '.txt', list.join('\n') + '\n');
console.log(`frames=${timed.length} span=${(timed[timed.length - 1].ts - timed[0].ts).toFixed(2)}s -> ${outFile}`);
