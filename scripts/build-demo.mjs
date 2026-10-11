#!/usr/bin/env node
// Builds the demo site in site/: Archify's own example specs, one per diagram type, rendered with
// Archify and gathered into one index. Needs Archify: pass its bin/archify.mjs, or set ARCHIFY_BIN.
//   node scripts/build-demo.mjs [path/to/archify/bin/archify.mjs]

import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildIndex } from '../src/build.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const archify = process.argv[2] ?? process.env.ARCHIFY_BIN;
if (!archify) {
  process.stderr.write('Pass the path to archify/bin/archify.mjs, or set ARCHIFY_BIN.\n');
  process.exit(1);
}

const SPECS = [
  'web-app.architecture.json',
  'cache-miss-request.sequence.json',
  'agent-tool-call.workflow.json',
  'product-analytics.dataflow.json',
  'deployment-release.lifecycle.json',
];

await rm(`${root}site`, { recursive: true, force: true });
const receipt = await buildIndex({
  inputs: SPECS.map(name => `${root}examples/specs/${name}`),
  out: `${root}site/index.html`,
  title: 'Archify examples',
  archify,
});
process.stdout.write(`Wrote ${receipt.output}:\n${receipt.diagrams.map(d => `  ${d.slug}  ${d.title} (${d.type})`).join('\n')}\n`);
