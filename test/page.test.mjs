import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPage } from '../src/page.mjs';

const diagram = (n, extra = {}) => ({ title: `Diagram ${n}`, href: `d${n}.html`, slug: `d${n}`, type: 'workflow', ...extra });

const dataOf = html => JSON.parse(/<script type="application\/json" id="archify-index-data">([\s\S]*?)<\/script>/.exec(html)[1]);

test('a title can never close an element or inject markup', () => {
  const hostile = '</script><script>alert(1)</script><img src=x onerror=alert(2)>';
  const html = renderPage({ diagrams: [diagram(1, { title: hostile })], title: hostile });
  assert.equal(html.match(/<script/g).length, 3, 'only the page\'s own scripts');
  assert.ok(!html.includes('<img'));
  assert.equal(dataOf(html).diagrams[0].title, hostile);
  assert.equal(dataOf(html).title, hostile);
});

test('the first diagram starts selected and only the first nine carry a key', () => {
  const html = renderPage({ diagrams: Array.from({ length: 11 }, (_, i) => diagram(i + 1)) });
  assert.match(html, /id="tab-d1"[^>]*aria-selected="true" tabindex="0"/);
  assert.match(html, /id="tab-d2"[^>]*aria-selected="false" tabindex="-1"/);
  assert.equal(html.match(/class="key"/g).length, 9);
  assert.match(html, /id="panel-d1" aria-labelledby="tab-d1" class="shown"/);
  assert.match(html, /id="panel-d2" aria-labelledby="tab-d2" inert aria-hidden="true"/);
});

test('speaks English or Simplified Chinese, and nothing else', () => {
  const zh = renderPage({ diagrams: [diagram(1)], lang: 'zh-CN' });
  assert.match(zh, /<html lang="zh-CN">/);
  assert.match(zh, /<title>图表<\/title>/);
  assert.match(zh, /<span class="type">工作流<\/span>/);
  assert.throws(() => renderPage({ diagrams: [diagram(1)], lang: 'fr' }), /Unknown language fr/);
  assert.throws(() => renderPage({ diagrams: [] }), /at least one diagram/);
});

test('carries the embed choice and makes no network request', () => {
  const html = renderPage({ diagrams: [diagram(1)], embed: true });
  assert.equal(dataOf(html).embed, true);
  assert.ok(!/\bhttps?:\/\//.test(html), 'no absolute addresses');
  assert.ok(!/<link\b/.test(html));
});

test('labels a type it has no words for with Archify\'s own name for it', () => {
  const html = renderPage({ diagrams: [diagram(1, { type: 'mindmap' })] });
  assert.match(html, /<span class="type">mindmap<\/span>/);
});

test('works without JavaScript through a list of links', () => {
  const html = renderPage({ diagrams: [diagram(1), diagram(2, { type: null })] });
  assert.match(html, /<noscript>[\s\S]*<a href="d1.html">Diagram 1<\/a> · Workflow[\s\S]*<a href="d2.html">Diagram 2<\/a><\/li>[\s\S]*<\/noscript>/);
});
