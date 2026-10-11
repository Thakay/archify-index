#!/usr/bin/env node
// Captures the README's screenshots of the demo site (run build-demo first) in light and dark.
//   CHROME_PATH=/path/to/chrome node scripts/screenshots.mjs

import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const executablePath = process.env.CHROME_PATH ?? process.env.ARCHIFY_CHROME;
if (!executablePath) {
  process.stderr.write('Set CHROME_PATH to a Chrome or Chromium executable.\n');
  process.exit(1);
}

await mkdir(`${root}docs`, { recursive: true });
const browser = await chromium.launch({ executablePath });
for (const [scheme, hash] of [['light', '#cache-miss-request-sequence'], ['dark', '#web-app-architecture']]) {
  const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
  await page.goto(pathToFileURL(`${root}site/index.html`).href + hash);
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(frame => frame.getAttribute('src')));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${root}docs/index-${scheme}.png` });
  await page.close();
}
await browser.close();
process.stdout.write('Wrote docs/index-light.png and docs/index-dark.png\n');
