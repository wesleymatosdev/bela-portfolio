// Shared helpers for the bela-portfolio E2E regression suite.
// Zero deps beyond the pinned playwright-core — matches the pilot rig
// (tools/verify_astro_pilot.mjs): headless Chromium found on disk, DOM-fact
// assertions, screenshots as accompaniment not evidence.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Chromium binary resolution
// ---------------------------------------------------------------------------
function scanBrowserCache() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'Library/Caches/ms-playwright'), // macOS default
    path.join(os.homedir(), '.cache/ms-playwright'), // Linux default
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const m = entry.match(/^(chromium(?:_headless_shell)?)-(\d+)$/);
      if (!m) continue;
      const dir = path.join(root, entry);
      const perPlatform = [
        // macOS (full "Chrome for Testing" app + headless shell)
        path.join(dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        path.join(dir, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        path.join(dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
        path.join(dir, 'chrome-headless-shell-mac/chrome-headless-shell'),
        // Linux
        path.join(dir, 'chrome-linux64/chrome'),
        path.join(dir, 'chrome-linux/chrome'),
        path.join(dir, 'chrome-headless-shell-linux64/chrome-headless-shell'),
        path.join(dir, 'chrome-headless-shell-linux/chrome-headless-shell'),
        // Windows
        path.join(dir, 'chrome-win64/chrome.exe'),
        path.join(dir, 'chrome-win/chrome.exe'),
        path.join(dir, 'chrome-headless-shell-win64/chrome-headless-shell.exe'),
      ];
      for (const bin of perPlatform) {
        if (fs.existsSync(bin)) {
          // prefer full chromium over the headless shell at the same revision
          candidates.push({ revision: Number(m[2]), shell: entry.includes('headless'), bin });
        }
      }
    }
  }
  candidates.sort((a, b) => (b.revision - a.revision) || (a.shell ? 1 : 0) - (b.shell ? 1 : 0));
  return candidates[0]?.bin || null;
}

export function resolveChromium() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return { bin: process.env.CHROME_BIN, source: 'CHROME_BIN' };
  }
  const bundled = chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) {
    return { bin: bundled, source: 'pinned playwright-core (installed browser)' };
  }
  const scanned = scanBrowserCache();
  if (scanned) return { bin: scanned, source: 'browser cache scan (may differ from pinned build)' };
  throw new Error(
    'No Chromium found. Run: npx playwright-core install chromium  (inside tests/e2e), ' +
    'or set CHROME_BIN to a Chrome/Chromium binary.'
  );
}

// ---------------------------------------------------------------------------
// Zero-dep static file server (used by --serve; CI + npm test)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function startStaticServer(rootDir, wantedPort = 0) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    return Promise.reject(new Error(`--serve root has no index.html: ${root}`));
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let filePath = path.normalize(path.join(root, urlPath));
        if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    server.on('error', reject);
    server.listen(wantedPort, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Assertion + evidence helpers
// ---------------------------------------------------------------------------
export function assert(cond, message, detail = '') {
  if (!cond) {
    throw new Error(detail ? `${message} (${detail})` : message);
  }
}

export function fail(msg) {
  throw new Error(msg);
}

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
