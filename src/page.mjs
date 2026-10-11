// Writes the index page: one self-contained HTML file with no network requests, that shows a set
// of Archify pages one at a time in the same window. Each diagram keeps its own page; the index
// only frames it, passing Archify's own `theme` and `embed` address parameters.

import { STRINGS, typeLabel } from './strings.mjs';

const escapeHtml = text => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON inside <script type="application/json">: nothing in it can close the element.
const scriptJson = value => JSON.stringify(value)
  .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const DARK = `--bg: #0b0f17; --bar: #121826; --line: #263042; --text: #e6e9ef; --muted: #9aa4b5;
      --hover: #1b2334; --accent: #2dd4bf; --accent-text: #04130f; --pill: #1f2a3c; --pill-on: rgba(4, 19, 15, .16); --focus: #60a5fa;`;

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #f4f5f7; --bar: #ffffff; --line: #d9dde3; --text: #17202b; --muted: #5b6573;
    --hover: #eef1f5; --accent: #0f766e; --accent-text: #ffffff; --pill: #e7ebf0; --pill-on: rgba(255, 255, 255, .2); --focus: #2563eb;
  }
  :root[data-theme="dark"] { ${DARK} }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${DARK} } }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text);
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
  body { display: flex; flex-direction: column; }
  header { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 12px; padding: 6px 12px 2px;
    background: var(--bar); border-bottom: 1px solid var(--line); }
  h1 { font-size: 15px; margin: 0 0 0 4px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side { margin-left: auto; display: flex; gap: 14px; align-items: center; color: var(--muted); font-size: 12px; }
  .side a { color: inherit; }
  .side select { font: inherit; color: var(--text); background: var(--bar); border: 1px solid var(--line);
    border-radius: 6px; padding: 2px 4px; }
  [role="tablist"] { flex: 1 0 100%; display: flex; gap: 4px; padding: 4px; overflow-x: auto; scrollbar-width: thin; }
  [role="tablist"][data-more~="end"] { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent);
    mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent); }
  [role="tablist"][data-more~="start"] { -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 48px), transparent);
    mask-image: linear-gradient(to left, #000 calc(100% - 48px), transparent); }
  [role="tablist"][data-more="start end"] { -webkit-mask-image: linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent); }
  [role="tab"] { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 3px 8px; font-size: 13px;
    border: 0; border-radius: 6px; background: transparent; color: var(--text); font-family: inherit;
    white-space: nowrap; cursor: pointer; }
  [role="tab"]:hover { background: var(--hover); }
  [role="tab"][aria-selected="true"] { background: var(--accent); color: var(--accent-text); }
  [role="tab"]:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .key { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .75; }
  .type { font-size: 11px; padding: 1px 6px; border-radius: 999px; background: var(--pill); color: var(--muted); }
  [aria-selected="true"] .type { background: var(--pill-on); color: inherit; }
  .hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  main { position: relative; flex: 1; min-height: 0; }
  [role="tabpanel"] { position: absolute; inset: 0; visibility: hidden; }
  .js [role="tabpanel"].shown { visibility: visible; }
  iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--bg); }
  .fallback { padding: 24px 16px; max-width: 720px; }
  .fallback li { margin: 6px 0; }
  .fallback a { color: var(--text); }
  @media (max-width: 720px) { .side .hint { display: none; } }
`;

const SCRIPT = `
(() => {
  const data = JSON.parse(document.getElementById('archify-index-data').textContent);
  const root = document.documentElement;
  const tablist = document.querySelector('[role="tablist"]');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  const frames = panels.map(panel => panel.querySelector('iframe'));
  const alone = document.getElementById('archify-index-alone');
  const themeControl = document.getElementById('archify-index-theme');
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const STORE = 'archify-index-theme';
  let active = -1;
  let theme = 'auto';
  try { theme = localStorage.getItem(STORE) || 'auto'; } catch (_) {}
  if (!['auto', 'light', 'dark'].includes(theme)) theme = 'auto';

  const hashSlug = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch (_) { return ''; } };
  const fromHash = () => data.diagrams.findIndex(d => d.slug === hashSlug());

  // The theme every diagram is opened with, so the index and its diagrams always agree.
  const resolved = () => theme === 'auto' ? (dark.matches ? 'dark' : 'light') : theme;
  const address = index => {
    const params = new URLSearchParams({theme: resolved()});
    if (data.embed) params.set('embed', '1');
    return data.diagrams[index].href + '?' + params;
  };

  // The shown diagram loads first; the others load one after another once it has, so the first
  // view is quick, later switches are instant, and memory grows one page at a time.
  const started = new Set();
  const start = index => {
    if (started.has(index)) return;
    started.add(index);
    frames[index].src = address(index);
  };
  const queue = () => {
    const next = frames.findIndex((_, index) => !started.has(index));
    if (next === -1) return;
    frames[next].addEventListener('load', queue, {once: true});
    start(next);
  };
  const begin = index => {
    if (started.has(index)) return;
    frames[index].addEventListener('load', queue, {once: true});
    start(index);
  };

  // Scrolls the tab row alone: scrollIntoView would also scroll a page that embeds the index and
  // move the browser's Tab starting point past the tabs.
  const reveal = index => {
    const tab = tabs[index].getBoundingClientRect();
    const row = tablist.getBoundingClientRect();
    if (tab.left < row.left) tablist.scrollLeft -= row.left - tab.left + 48;
    else if (tab.right > row.right) tablist.scrollLeft += tab.right - row.right + 48;
  };

  // Shows one diagram. A click or a number key adds a step to the browser's history; arrow keys and
  // the first view replace the current step, so Back is not a replay of every key press.
  function show(index, {focus = false, push = true} = {}) {
    if (index < 0 || index >= tabs.length) index = 0;
    if (index !== active) {
      active = index;
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        panels[i].classList.toggle('shown', on);
        panels[i].toggleAttribute('inert', !on);
        panels[i].setAttribute('aria-hidden', String(!on));
      });
      reveal(index);
      begin(index);
      alone.href = address(index);
      alone.setAttribute('aria-label', data.openAloneLabel.replace('{title}', data.diagrams[index].title));
      document.title = data.diagrams[index].title + ' · ' + data.title;
    }
    if (focus || tabs.includes(document.activeElement)) tabs[index].focus();
    const slug = data.diagrams[index].slug;
    if (hashSlug() !== slug) {
      if (push) location.hash = encodeURIComponent(slug);
      else history.replaceState(null, '', '#' + encodeURIComponent(slug));
    }
  }

  // A new theme reloads the shown diagram first and the others one by one, as on first load.
  function applyTheme() {
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    themeControl.value = theme;
    if (active < 0) return;
    started.forEach(index => { if (index !== active) frames[index].removeAttribute('src'); });
    started.clear();
    begin(active);
    alone.href = address(active);
  }

  // Fades the tab row's edge where more tabs are scrolled out of view.
  const edges = () => {
    const more = [];
    if (tablist.scrollLeft > 1) more.push('start');
    if (tablist.scrollLeft + tablist.clientWidth < tablist.scrollWidth - 1) more.push('end');
    if (more.length) tablist.setAttribute('data-more', more.join(' '));
    else tablist.removeAttribute('data-more');
  };
  tablist.addEventListener('scroll', edges, {passive: true});
  window.addEventListener('resize', edges);

  tabs.forEach((tab, index) => tab.addEventListener('click', () => show(index)));
  tablist.addEventListener('keydown', event => {
    const last = tabs.length - 1;
    const moves = {ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: last};
    if (!(event.key in moves)) return;
    event.preventDefault();
    event.stopPropagation();
    show((moves[event.key] + tabs.length) % tabs.length, {focus: true, push: false});
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    if (event.target.closest && event.target.closest('select, input, textarea')) return;
    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= Math.min(9, tabs.length)) show(digit - 1);
    else if (event.key === 'ArrowRight') show((active + 1) % tabs.length, {push: false});
    else if (event.key === 'ArrowLeft') show((active - 1 + tabs.length) % tabs.length, {push: false});
  });
  themeControl.addEventListener('change', () => {
    theme = themeControl.value;
    try { localStorage.setItem(STORE, theme); } catch (_) {}
    applyTheme();
  });
  dark.addEventListener('change', () => { if (theme === 'auto') applyTheme(); });
  // An address that names no diagram is put back in step with the one shown.
  window.addEventListener('hashchange', () => {
    const index = fromHash();
    show(index === -1 ? active : index, {push: false});
  });

  applyTheme();
  show(fromHash(), {push: false});
  edges();
})();
`;

/**
 * The index page as text.
 * @param {object} options
 * @param {{title: string, href: string, slug: string, type: string|null}[]} options.diagrams
 * @param {string} [options.title] the page's title; the language's word for diagrams by default
 * @param {string} [options.lang] 'en' or 'zh-CN'
 * @param {boolean} [options.embed] open diagrams without their toolbar
 * @param {string} [options.generator] the generator meta value
 */
export function renderPage({ diagrams, title, lang = 'en', embed = false, generator = 'archify-index' }) {
  const strings = STRINGS[lang];
  if (!strings) throw new Error(`Unknown language ${lang}.`);
  if (!diagrams.length) throw new Error('An index needs at least one diagram.');
  const pageTitle = title || strings.pageTitle;
  const data = {
    title: pageTitle, embed, openAloneLabel: strings.openAloneLabel,
    diagrams: diagrams.map(({ title: t, href, slug }) => ({ title: t, href, slug })),
  };
  const pill = d => d.type ? `<span class="type">${escapeHtml(typeLabel(strings, d.type))}</span>` : '';
  const tabs = diagrams.map((d, i) => `
      <button type="button" role="tab" id="tab-${escapeHtml(d.slug)}" aria-controls="panel-${escapeHtml(d.slug)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"${i < 9 ? ` aria-keyshortcuts="${i + 1}"` : ''}>${i < 9 ? `<span class="key" aria-hidden="true">${i + 1}</span>` : ''}<span>${escapeHtml(d.title)}</span>${pill(d)}</button>`).join('');
  const panels = diagrams.map((d, i) => `
    <div role="tabpanel" id="panel-${escapeHtml(d.slug)}" aria-labelledby="tab-${escapeHtml(d.slug)}"${i === 0 ? ' class="shown"' : ' inert aria-hidden="true"'}>
      <iframe title="${escapeHtml(d.title)}"></iframe>
    </div>`).join('');
  const links = diagrams.map(d => `<li><a href="${escapeHtml(d.href)}">${escapeHtml(d.title)}</a>${d.type ? ` · ${escapeHtml(typeLabel(strings, d.type))}` : ''}</li>`).join('\n          ');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${escapeHtml(generator)}">
<title>${escapeHtml(pageTitle)}</title>
<script>
  // The stored theme is applied before first paint, so a dark page never flashes light.
  document.documentElement.classList.add('js');
  try { const t = localStorage.getItem('archify-index-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (_) {}
</script>
<style>${STYLE}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(pageTitle)}</h1>
    <div class="side">
      <span class="hint" aria-hidden="true">${escapeHtml(strings.keys)}</span>
      <label>${escapeHtml(strings.theme)}
        <select id="archify-index-theme">
          <option value="auto">${escapeHtml(strings.themeAuto)}</option>
          <option value="light">${escapeHtml(strings.themeLight)}</option>
          <option value="dark">${escapeHtml(strings.themeDark)}</option>
        </select>
      </label>
      <a id="archify-index-alone" href="${escapeHtml(diagrams[0].href)}" target="_blank" rel="noopener">${escapeHtml(strings.openAlone)}</a>
    </div>
    <div role="tablist" aria-label="${escapeHtml(strings.tabsLabel)}" aria-describedby="archify-index-keys">${tabs}
    </div>
    <span id="archify-index-keys" class="hidden">${escapeHtml(strings.keysHelp)}</span>
  </header>
  <main>
    <noscript>
      <div class="fallback">
        <p>${escapeHtml(strings.noScript)}</p>
        <ul>
          ${links}
        </ul>
      </div>
    </noscript>${panels}
  </main>
<script type="application/json" id="archify-index-data">${scriptJson(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
