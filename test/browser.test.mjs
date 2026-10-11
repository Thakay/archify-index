// Drives a built index in a real Chrome. Skipped, and reported as skipped, when no Chrome is
// found: set CHROME_PATH (or ARCHIFY_CHROME) to a Chrome or Chromium executable. With
// REQUIRE_CHROME=1 a missing Chrome is a failure.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildIndex } from '../src/build.mjs';
import { archifyPage, put, scratch } from './helpers.mjs';

const COMMON = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const named = process.env.CHROME_PATH ?? process.env.ARCHIFY_CHROME;
// A Chrome that is named but missing is never swapped for another one.
const chrome = named ? (existsSync(named) ? named : null) : COMMON.find(candidate => existsSync(candidate)) ?? null;
const skip = !chrome && (named ? `CHROME_PATH ${named} does not exist` : 'no Chrome found: set CHROME_PATH to run the browser test');

async function open(t, { embed = false, javaScriptEnabled = true, colorScheme = 'light', files, hash = '' } = {}) {
  const { chromium } = await import('playwright-core');
  const dir = await scratch(t);
  await put(dir, files ?? {
    'a.html': archifyPage({ title: 'Alpha', type: 'architecture' }),
    'b.html': archifyPage({ title: 'Beta', type: 'sequence' }),
    'c.html': archifyPage({ title: 'Gamma', type: 'workflow' }),
  });
  const { output } = await buildIndex({ inputs: [dir], title: 'Set', embed });
  const browser = await chromium.launch({ executablePath: chrome });
  t.after(() => browser.close());
  const page = await browser.newPage({ javaScriptEnabled, colorScheme, viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no script errors'));
  await page.goto(pathToFileURL(output).href + hash);
  return { page, dir };
}

const state = page => page.evaluate(() => ({
  hash: decodeURIComponent(location.hash),
  title: document.title,
  selected: [...document.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute('aria-selected')),
  shown: [...document.querySelectorAll('[role="tabpanel"]')].map(panel => panel.classList.contains('shown')),
  sources: [...document.querySelectorAll('iframe')].map(frame => frame.getAttribute('src')),
  alone: document.getElementById('archify-index-alone').getAttribute('href'),
  focused: document.activeElement.id,
}));
const selected = (page, id) => page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-selected') === 'true', id);
const allLoaded = (page, suffix) => page.waitForFunction(suffix =>
  [...document.querySelectorAll('iframe')].every(frame => (frame.getAttribute('src') ?? '').endsWith(suffix)), suffix);

test('switches by tab, by number, by arrow; keeps the address; Back steps through clicks and numbers', { skip }, async t => {
  const { page } = await open(t);
  let now = await state(page);
  assert.deepEqual(now.selected, ['true', 'false', 'false']);
  assert.equal(now.title, 'Alpha · Set');

  await page.keyboard.press('3');
  now = await state(page);
  assert.deepEqual(now.shown, [false, false, true]);
  assert.equal(now.hash, '#c');

  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).hash, '#a', 'the arrow wraps to the first');

  await page.getByRole('tab', { name: /Beta/ }).click();
  now = await state(page);
  assert.deepEqual(now.selected, ['false', 'true', 'false']);
  assert.equal(now.title, 'Beta · Set');

  await page.goBack();
  await selected(page, 'tab-a');
  assert.equal((await state(page)).hash, '#a', 'the arrow replaced the step the number added');
});

test('tabs follow the tab pattern, and focus follows the selection', { skip }, async t => {
  const { page } = await open(t);
  await page.getByRole('tab', { name: /Alpha/ }).focus();
  await page.keyboard.press('End');
  assert.equal((await state(page)).focused, 'tab-c');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).focused, 'tab-a');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state(page)).focused, 'tab-c');
  await page.keyboard.press('2');
  const now = await state(page);
  assert.deepEqual(now.selected, ['false', 'true', 'false']);
  assert.equal(now.focused, 'tab-b', 'a number key keeps focus on the selected tab');
});

test('Tab walks the page in the order it is drawn and reaches the selected tab', { skip }, async t => {
  const { page } = await open(t, { hash: '#c' });
  const order = [];
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement.id));
  }
  assert.deepEqual(order, ['archify-index-theme', 'archify-index-alone', 'tab-c']);
  assert.match(await page.getAttribute('#archify-index-alone', 'aria-label'), /Gamma/);
});

test('loads the shown diagram first, then the rest, all in one theme', { skip }, async t => {
  const { page } = await open(t, { colorScheme: 'dark', hash: '#b' });
  assert.equal((await state(page)).sources[1], 'b.html?theme=dark', 'the shown diagram starts at once');
  await allLoaded(page, '?theme=dark');
  assert.equal((await state(page)).alone, 'b.html?theme=dark');
  await page.frameLocator('#panel-b iframe').locator('#theme-seen').filter({ hasText: 'dark' }).waitFor();

  await page.selectOption('#archify-index-theme', 'light');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await allLoaded(page, '?theme=light');
  await page.frameLocator('#panel-b iframe').locator('#theme-seen').filter({ hasText: 'light' }).waitFor();
  await page.reload();
  assert.equal(await page.inputValue('#archify-index-theme'), 'light', 'the choice is remembered');
});

test('opens a linked diagram directly, passes embed, and corrects an unknown address', { skip }, async t => {
  const { page } = await open(t, { embed: true, hash: '#b' });
  let now = await state(page);
  assert.deepEqual(now.shown, [false, true, false]);
  assert.match(now.sources[1], /^b\.html\?theme=light&embed=1$/);
  await page.evaluate(() => { location.hash = '#nothing'; });
  await page.waitForFunction(() => location.hash === '#b');
  now = await state(page);
  assert.deepEqual(now.shown, [false, true, false]);
});

test('addresses in any script open the right diagram', { skip }, async t => {
  const { page } = await open(t, {
    files: { '数据 流.html': archifyPage({ title: '数据流', type: 'dataflow' }), 'plan.html': archifyPage({ title: 'Plan' }) },
    hash: `#${encodeURIComponent('数据-流')}`,
  });
  await selected(page, 'tab-数据-流');
  await page.keyboard.press('1');
  assert.equal((await state(page)).hash, '#plan');
  await page.keyboard.press('2');
  await selected(page, 'tab-数据-流');
  assert.equal((await state(page)).hash, '#数据-流');
});

test('an embedded index never scrolls the page around it', { skip }, async t => {
  const { page, dir } = await open(t, { hash: '#c' });
  await put(dir, { 'host.html': '<!doctype html><body style="margin:0"><p>top</p><div style="height:3000px"></div><iframe src="index.html#c" style="width:600px;height:400px"></iframe></body>' });
  await page.goto(pathToFileURL(`${dir}/host.html`).href);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
});

test('without JavaScript the page lists every diagram as a link', { skip }, async t => {
  const { page } = await open(t, { javaScriptEnabled: false });
  const links = await page.locator('.fallback a').allTextContents();
  assert.deepEqual(links, ['Alpha', 'Beta', 'Gamma']);
  assert.equal(await page.locator('.fallback').isVisible(), true);
});

// CI sets REQUIRE_CHROME=1, so a missing Chrome fails there instead of passing as skipped.
test('Chrome is present where it is required', { skip: process.env.REQUIRE_CHROME !== '1' && 'REQUIRE_CHROME is not set' }, () => {
  assert.ok(chrome, skip || 'no Chrome found');
});
