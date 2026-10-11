// Builds an index page for a set of Archify diagrams. It reads delivered pages, renders JSON
// specs through the Archify CLI when asked, and writes one index file. It never changes a diagram:
// it replaces only files it wrote itself, and lets Archify replace only pages Archify wrote.

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { archifyVersion, describe, receiptType, TYPE_NAME } from './artifact.mjs';
import { renderPage } from './page.mjs';
import { commonFolder, inside, isRoot } from './paths.mjs';
import { LANGUAGES } from './strings.mjs';

const run = promisify(execFile);
const VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const DELIVER_TIMEOUT_MS = 10 * 60 * 1000;

/** A refusal with a stable code. */
export class IndexError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
const isIndex = html => /<meta\s+name="generator"\s+content="archify-index[\s"]/i.test(html);

/** A name for the address bar, kept in any script: "Data Flow" and "数据 流" both survive. */
function slugFor(file, taken) {
  const base = path.basename(file).replace(/\.html?$/i, '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'diagram';
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/** The address of `file` from the index's folder: relative, below that folder, each segment encoded. */
function hrefFor(outDir, file) {
  if (!inside(outDir, file) || path.relative(outDir, file) === '') {
    throw new IndexError('outside-index-folder',
      `${file} is not inside ${outDir}. Write the index into a folder that holds every diagram.`);
  }
  return path.relative(outDir, file).split(path.sep).map(encodeURIComponent).join('/');
}

/** Reads one page; a page that cannot be read is refused, never skipped. */
async function readPage(file) {
  try {
    return await readFile(file);
  } catch (error) {
    throw new IndexError('unreadable-input', `${file} could not be read (${error.code ?? error.message}).`);
  }
}

/** Refuses to replace `file` unless it is missing or `replaceable(html)` holds. */
async function guard(file, replaceable, writer, advice) {
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw new IndexError('would-overwrite', `${file} exists but cannot be read as a page (${error.code}). ${advice}`);
  }
  if (!replaceable(html)) throw new IndexError('would-overwrite', `${file} exists and was not written by ${writer}. ${advice}`);
}

/** Reads a spec's diagram type, so a set is checked before Archify delivers any of it. */
async function specType(spec) {
  let type;
  try {
    type = JSON.parse(await readFile(spec, 'utf8'))?.diagram_type;
  } catch (error) {
    throw new IndexError('unreadable-spec', `${spec} is not readable JSON: ${error.message}`);
  }
  if (typeof type !== 'string' || !TYPE_NAME.test(type)) {
    throw new IndexError('invalid-diagram-type', `${spec} names diagram_type ${JSON.stringify(type)}; Archify names types in lowercase, such as "sequence".`);
  }
  return type;
}

async function deliver(archify, spec, type, target, quality) {
  let receipt;
  try {
    const { stdout } = await run(process.execPath, [archify, 'deliver', type, spec, target, '--quality', quality, '--json'],
      { maxBuffer: 64 * 1024 * 1024, timeout: DELIVER_TIMEOUT_MS });
    receipt = JSON.parse(stdout);
  } catch (error) {
    let detail = error.killed ? `Archify did not finish within ${DELIVER_TIMEOUT_MS / 60000} minutes.` : error.message;
    try {
      const failed = JSON.parse(error.stdout);
      detail = (failed.diagnostics ?? []).map(d => `${d.code}: ${d.message}`).join('\n') || detail;
    } catch (_) { /* the plain error says enough */ }
    throw new IndexError('render-failed', `Archify could not deliver ${spec}:\n${detail}`);
  }
  if (!receipt.ok) throw new IndexError('render-failed', `Archify did not deliver ${spec}.`);
  return receipt.receiptId ?? null;
}

/**
 * Builds the index and returns its receipt. Every input is checked before anything is written; if
 * Archify then refuses a spec, the specs it delivered before stay delivered and no index is written.
 * @param {object} options
 * @param {string[]} options.inputs delivered `.html` pages, folders holding them, or `.json` specs
 * @param {string} [options.out] the index file; by default `index.html` in the folder that holds
 *   every input (for specs alone, the current folder)
 * @param {string} [options.title]
 * @param {'en'|'zh-CN'} [options.lang]
 * @param {boolean} [options.embed] open diagrams without their toolbar
 * @param {string} [options.archify] Archify's `bin/archify.mjs`; required for `.json` inputs
 * @param {'standard'|'showcase'} [options.quality] passed to `archify deliver`
 * @param {string} [options.cwd]
 */
export async function buildIndex({ inputs, out, title, lang = 'en', embed = false, archify,
  quality = 'showcase', cwd = process.cwd() }) {
  if (!LANGUAGES.includes(lang)) throw new IndexError('unknown-language', `Language ${lang} is not one of ${LANGUAGES.join(', ')}.`);
  if (!['standard', 'showcase'].includes(quality)) throw new IndexError('unknown-quality', `Quality ${quality} is not standard or showcase.`);
  if (!inputs?.length) throw new IndexError('no-inputs', 'Name at least one diagram, folder or spec.');

  const entries = [];
  for (const input of inputs) {
    const file = path.resolve(cwd, input);
    let info;
    try {
      info = await stat(file);
    } catch {
      throw new IndexError('missing-input', `${input} does not exist.`);
    }
    if (info.isDirectory()) {
      const names = (await readdir(file, { withFileTypes: true }))
        .filter(item => !item.isDirectory() && /\.html?$/i.test(item.name)).map(item => item.name).sort(byName);
      entries.push(...names.map(name => ({ kind: 'html', file: path.join(file, name), fromFolder: true })));
    } else if (/\.html?$/i.test(file)) {
      entries.push({ kind: 'html', file, fromFolder: false });
    } else if (/\.json$/i.test(file)) {
      entries.push({ kind: 'json', file });
    } else {
      throw new IndexError('unknown-input', `${input} is not an .html page, a .json spec or a folder.`);
    }
  }
  if (!entries.length) throw new IndexError('no-diagrams', 'None of the inputs is a page Archify wrote.');

  // Specs: each named once, each checked, before Archify is asked for anything.
  const specs = [...new Map(entries.filter(entry => entry.kind === 'json').map(entry => [entry.file, entry])).values()];
  if (specs.length && !archify) {
    throw new IndexError('archify-required', 'JSON specs need --archify <path to archify/bin/archify.mjs> to be rendered.');
  }
  const archifyBin = archify && path.resolve(cwd, archify);
  if (specs.length && !(await stat(archifyBin).then(info => info.isFile(), () => false))) {
    throw new IndexError('archify-missing', `--archify ${archify} is not a file. Pass Archify's bin/archify.mjs.`);
  }
  for (const entry of specs) entry.type = await specType(entry.file);

  // The index's own file: never an input, never a file someone else wrote, never the top of a drive.
  let outFile;
  if (out === undefined) {
    const common = commonFolder(entries.map(entry => entry.kind === 'json' ? cwd : path.dirname(entry.file)));
    if (common === null || isRoot(common)) {
      throw new IndexError('no-common-folder', 'The inputs share no folder below the top of the drive. Name the index with --out.');
    }
    outFile = path.join(common, 'index.html');
  } else {
    outFile = path.resolve(cwd, out);
  }
  const outDir = path.dirname(outFile);
  const named = new Set(entries.filter(entry => entry.kind === 'html' && !entry.fromFolder).map(entry => entry.file));
  if (named.has(outFile)) throw new IndexError('would-overwrite', `${outFile} is one of the inputs. Write the index to another file.`);
  await guard(outFile, isIndex, 'archify-index', 'Choose another --out.');

  // Specs render into the index's folder, so the folder holds the whole set.
  const targets = new Set();
  for (const entry of specs) {
    entry.source = entry.file;
    entry.file = path.join(outDir, `${path.basename(entry.file, path.extname(entry.file))}.html`);
    if (targets.has(entry.file) || entry.file === outFile || named.has(entry.file)) {
      throw new IndexError('duplicate-name', `${entry.source} would render to ${entry.file}, which another input or the index already uses.`);
    }
    targets.add(entry.file);
    await guard(entry.file, html => archifyVersion(html) !== null, 'Archify', 'Rename the spec or move that file.');
  }

  // Every page is read and checked before Archify writes anything.
  const seen = new Set();
  const pages = new Map();
  for (const entry of entries) {
    if (entry.kind !== 'html' || entry.file === outFile || targets.has(entry.file) || seen.has(entry.file)) continue;
    seen.add(entry.file);
    const bytes = await readPage(entry.file);
    if (archifyVersion(bytes.toString('utf8')) === null) {
      if (entry.fromFolder) continue;
      throw new IndexError('not-archify', `${entry.file} was not written by Archify.`);
    }
    hrefFor(outDir, entry.file);
    pages.set(entry.file, bytes);
  }

  if (specs.length) await mkdir(outDir, { recursive: true });
  for (const entry of specs) {
    entry.receipt = await deliver(archifyBin, entry.source, entry.type, entry.file, quality);
    pages.set(entry.file, await readPage(entry.file));
  }

  const taken = new Set();
  const diagrams = [];
  for (const entry of entries) {
    const bytes = pages.get(entry.file);
    if (bytes === undefined) continue;
    pages.delete(entry.file);
    const facts = describe(bytes.toString('utf8'), path.basename(entry.file).replace(/\.html?$/i, ''));
    diagrams.push({
      title: facts.title, type: (await receiptType(entry.file, bytes)) ?? facts.type ?? entry.type ?? null,
      archify: facts.archify, href: hrefFor(outDir, entry.file), slug: slugFor(entry.file, taken), file: entry.file,
      ...(entry.source ? { source: entry.source, deliveryReceipt: entry.receipt } : {}),
    });
  }
  if (!diagrams.length) throw new IndexError('no-diagrams', 'None of the inputs is a page Archify wrote.');

  const html = renderPage({ diagrams, title, lang, embed, generator: `archify-index ${VERSION}` });
  await mkdir(outDir, { recursive: true });
  const temporary = `${outFile}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, html, 'utf8');
    await rename(temporary, outFile);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { ok: true, version: VERSION, output: outFile, lang, embed, diagrams };
}

export { VERSION };
