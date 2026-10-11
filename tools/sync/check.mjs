#!/usr/bin/env node
// `npm run check`: validate generated files on disk. Dependency-free (safe to run in the commit job).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommitted } from './validate.mjs';

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const problems = await checkCommitted(root);
if (problems.length) {
  for (const p of problems) console.error(`error: ${p}`);
  process.exitCode = 1;
} else {
  console.log('Generated files are consistent.');
}
