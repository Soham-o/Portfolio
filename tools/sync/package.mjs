#!/usr/bin/env node
// Job A (read-only): package the sync's file changes into an artifact directory.
//
//   node tools/sync/package.mjs --root . --out "$RUNNER_TEMP/sync-output" --base "$GITHUB_SHA"
//
// Produces <out>/manifest.json + <out>/files/<path>. Every changed path must match the generated-file
// allowlist; anything else (e.g. a workflow, tooling or content file) aborts the run. Dependency-free.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isGeneratedPath } from './validate.mjs';
import { sha256 } from './util.mjs';

export const MANIFEST_VERSION = 1;

/** Changed paths in the working tree: [{ path, deleted }]. Ignored files (node_modules, lock) are skipped. */
export function gitChanges(root) {
  const out = execFileSync('git', ['status', '--porcelain=v1', '-z', '-uall', '--no-renames'], { cwd: root, encoding: 'utf8' });
  const entries = out.split('\0').filter(Boolean);
  return entries.map((e) => ({ path: e.slice(3), deleted: e[0] === 'D' || e[1] === 'D' }));
}

export async function packageChanges({ root, out, base }) {
  const changes = gitChanges(root);
  const unexpected = changes.filter((c) => !isGeneratedPath(c.path));
  if (unexpected.length) {
    throw new Error(`Sync changed files outside the generated-file allowlist: ${unexpected.map((c) => c.path).join(', ')}`);
  }
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'files'), { recursive: true });
  const manifest = { version: MANIFEST_VERSION, base: base || null, createdAt: new Date().toISOString(), writes: [], deletes: [] };
  for (const c of changes.sort((a, b) => a.path.localeCompare(b.path))) {
    const abs = path.join(root, c.path);
    if (c.deleted) { manifest.deletes.push(c.path); continue; }
    const st = await fs.lstat(abs);
    if (!st.isFile()) throw new Error(`${c.path} is not a regular file`);
    const buf = await fs.readFile(abs);
    const dest = path.join(out, 'files', c.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    manifest.writes.push({ path: c.path, sha256: sha256(buf), size: buf.length });
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
  try {
    const m = await packageChanges({ root: path.resolve(args.root || '.'), out: path.resolve(args.out), base: args.base });
    const changed = m.writes.length + m.deletes.length > 0;
    console.log(`Packaged ${m.writes.length} changed and ${m.deletes.length} deleted generated files.`);
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
