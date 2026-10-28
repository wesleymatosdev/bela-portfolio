// Browser rig — same approach as tools/verify_astro_pilot.mjs: playwright-core
// with executablePath pointed at the machine's cached ms-playwright Chromium.
// No bundled-browser download, no second browser in CI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PLATFORM_BINARIES = [
  // macOS cache layout
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  // Linux cache layout (x64 and arm64)
  'chrome-linux/chrome',
  'chrome-linux-arm64/chrome',
];

// CHROME_BIN wins; otherwise scan the default ms-playwright caches (macOS and
// Linux) newest-build-first and return the first binary that exists.
export function findChromeBinary() {
  if (process.env.CHROME_BIN) {
    if (!fs.existsSync(process.env.CHROME_BIN)) {
      throw new Error(`CHROME_BIN is set but does not exist: ${process.env.CHROME_BIN}`);
    }
    return process.env.CHROME_BIN;
  }
  const roots = [
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const builds = fs.readdirSync(root)
      .filter((d) => /^chromium-(\d+)$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      for (const rel of PLATFORM_BINARIES) {
        const candidate = path.join(root, build, rel);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error(
    'No cached Chromium found. Install one for the pinned playwright-core with:\n' +
    '  npx playwright-core install chromium\n' +
    'or point CHROME_BIN at an existing Chrome/Chromium binary.'
  );
}

export const VIEWPORT = { width: 1440, height: 900 };

export async function launchBrowser() {
  const executablePath = findChromeBinary();
  return chromium.launch({ executablePath, headless: true });
}
