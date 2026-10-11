#!/usr/bin/env node
// Job B (commit): apply a packaged sync artifact to a checkout, then validate the result.
//
//   node tools/sync/apply.mjs --root . --artifact "$RUNNER_TEMP/sync-output"
//
// Runs WITHOUT credentials (the push happens in a later step) and without npm dependencies: it never
// imports the README/markdown pipeline. It refuses any path outside the generated-file allowlist,
// any file whose hash doesn't match the manifest, symlinks, and a checkout at a different base commit.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isGeneratedPath, checkCommitted } from './validate.mjs';
import { sha256 } from './util.mjs';
import { MANIFEST_VERSION } from './package.mjs';

async function isSymlink(p) {
  try { return (await fs.lstat(p)).isSymbolicLink(); } catch { return false; }
}

export async function applyArtifact({ root, artifact, checkBase = true }) {
  const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8'));
  if (manifest.version !== MANIFEST_VERSION) throw new Error(`Unsupported manifest version ${manifest.version}`);
  if (!Array.isArray(manifest.writes) || !Array.isArray(manifest.deletes)) throw new Error('Malformed manifest');
  if (checkBase && manifest.base) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (head !== manifest.base) throw new Error(`Checkout is at ${head}, artifact was built from ${manifest.base}`);
  }
  const all = [...manifest.writes.map((w) => w.path), ...manifest.deletes];
  if (new Set(all).size !== all.length) throw new Error('Manifest lists a path more than once');
  for (const p of all) if (!isGeneratedPath(p)) throw new Error(`Refusing path outside the generated-file allowlist: ${JSON.stringify(p)}`);

  // Verify everything before touching the checkout
  const payload = [];
  for (const w of manifest.writes) {
    const src = path.join(artifact, 'files', w.path);
    const st = await fs.lstat(src);
    if (!st.isFile()) throw new Error(`${w.path}: artifact entry is not a regular file`);
    const buf = await fs.readFile(src);
    if (sha256(buf) !== w.sha256) throw new Error(`${w.path}: content hash mismatch`);
    payload.push([w.path, buf]);
  }
  for (const [rel, buf] of payload) {
    const dest = path.join(root, rel);
    for (let d = path.dirname(dest); d.startsWith(root) && d !== root; d = path.dirname(d)) {
      if (await isSymlink(d)) throw new Error(`${rel}: parent directory is a symlink`);
    }
    if (await isSymlink(dest)) throw new Error(`${rel}: destination is a symlink`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
  }
  for (const rel of manifest.deletes) {
    const dest = path.join(root, rel);
    if (await isSymlink(dest)) throw new Error(`${rel}: destination is a symlink`);
    await fs.rm(dest, { force: true });
  }
  const problems = await checkCommitted(root);
  if (problems.length) throw new Error(`Validation failed after applying the artifact:\n  ${problems.join('\n  ')}`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
  try {
    const m = await applyArtifact({ root: path.resolve(args.root || '.'), artifact: path.resolve(args.artifact) });
    console.log(`Applied ${m.writes.length} writes and ${m.deletes.length} deletions; generated files validated.`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}
