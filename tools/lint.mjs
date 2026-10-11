#!/usr/bin/env node
// Dependency-free checks: JS syntax, JSON validity, sync markers, and an accidental-secret scan.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateMarkers } from './sync/markers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '_site']);
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{36,}/, /github_pat_[A-Za-z0-9_]{60,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/, /xox[baprs]-[A-Za-z0-9-]{10,}/,
];

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(abs); else yield abs;
  }
}

const problems = [];
let files = 0;
for await (const file of walk(root)) {
  const rel = path.relative(root, file);
  const ext = path.extname(file);
  if (!['.js', '.mjs', '.json', '.html', '.yml', '.yaml', '.md', '.css', '.toml', '.example', '.xml', '.txt'].includes(ext)) continue;
  files += 1;
  const text = await fs.readFile(file, 'utf8');
  if (ext === '.js' || ext === '.mjs') {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) problems.push(`${rel}: syntax error\n${r.stderr}`);
  }
  if (ext === '.json') {
    try { JSON.parse(text); } catch (e) { problems.push(`${rel}: invalid JSON (${e.message})`); }
  }
  if (ext === '.html') for (const e of validateMarkers(text)) problems.push(`${rel}: ${e}`);
  if (!rel.startsWith('tests/')) for (const re of SECRET_PATTERNS) if (re.test(text)) problems.push(`${rel}: looks like it contains a secret (${re})`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`lint: ${files} files OK`);
