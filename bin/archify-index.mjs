#!/usr/bin/env node
// The archify-index command: parses arguments, builds the index, prints the outcome.

import { parseArgs } from 'node:util';
import { buildIndex, IndexError, VERSION } from '../src/build.mjs';

const HELP = `Usage: archify-index [options] <input>...

Writes one index page that shows a set of Archify diagrams in a single window:
a tab per diagram, keys 1 to 9 and the arrow keys to switch, a link per diagram,
and one theme for all of them.

Inputs:
  page.html          a page Archify delivered
  folder/            every Archify page directly inside the folder
  spec.json          an Archify JSON spec, rendered first with --archify

Options:
  -o, --out <file>       the index to write (default: index.html in the inputs' common folder)
      --title <text>     the page's title (default: "Diagrams")
      --lang <en|zh-CN>  the language of the index's own words (default: en)
      --embed            open diagrams without their toolbar (Archify's ?embed=1)
      --archify <file>   Archify's bin/archify.mjs; .json specs are delivered with it
                         into the index's folder
      --quality <level>  standard or showcase, passed to archify deliver (default: showcase)
      --json             print a machine-readable receipt
  -h, --help             show this help
  -v, --version          show the version

Every diagram must sit inside the index's folder, so the set can be moved or
published as one folder.`;

function fail(json, code, message) {
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  else process.stderr.write(`archify-index: ${message}\n`);
  process.exitCode = 1;
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      title: { type: 'string' },
      lang: { type: 'string', default: 'en' },
      embed: { type: 'boolean', default: false },
      archify: { type: 'string' },
      quality: { type: 'string', default: 'showcase' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
} catch (error) {
  fail(process.argv.includes('--json'), 'invalid-arguments', `${error.message}\nRun archify-index --help.`);
}

if (parsed) {
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
  } else if (values.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    try {
      const receipt = await buildIndex({
        inputs: positionals, out: values.out, title: values.title, lang: values.lang,
        embed: values.embed, archify: values.archify, quality: values.quality,
      });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      } else {
        process.stdout.write(`Wrote ${receipt.output} with ${receipt.diagrams.length} diagram${receipt.diagrams.length === 1 ? '' : 's'}.\n`);
      }
    } catch (error) {
      if (error instanceof IndexError) fail(values.json, error.code, error.message);
      else fail(values.json, 'unexpected', error.stack ?? String(error));
    }
  }
}
