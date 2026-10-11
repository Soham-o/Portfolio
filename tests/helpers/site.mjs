// Creates a disposable copy of the site (pages, templates, content) for sync tests.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from '../../tools/sync/github.mjs';
import { mockFetch } from './mock-github.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function makeSite({ withData = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-sync-'));
  for (const f of ['projects.html', 'journey.html', 'index.html', 'about.html']) {
    await fs.copyFile(path.join(REPO_ROOT, f), path.join(dir, f));
  }
  await fs.cp(path.join(REPO_ROOT, 'templates'), path.join(dir, 'templates'), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, 'content'), path.join(dir, 'content'), { recursive: true });
  if (withData) await fs.cp(path.join(REPO_ROOT, 'data'), path.join(dir, 'data'), { recursive: true });
  return dir;
}

export function makeClient(world, opts = {}) {
  return new GitHubClient({
    token: 'test-token',
    baseUrl: 'http://mock.local',
    fetchImpl: mockFetch(world),
    sleep: async () => {},
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    maxRetries: 2,
    ...opts,
  });
}

/** Write a runSync result to disk exactly as the CLI does. */
export async function commit(result) {
  if (!result.publish) return false;
  for (const [file, content] of result.files) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  for (const f of result.deletes) await fs.rm(f, { force: true });
  return true;
}

export async function read(dir, rel) {
  return fs.readFile(path.join(dir, rel), 'utf8');
}

export async function exists(dir, rel) {
  try { await fs.access(path.join(dir, rel)); return true; } catch { return false; }
}

export async function snapshotTree(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) await walk(abs);
      else out[path.relative(dir, abs)] = await fs.readFile(abs, 'utf8');
    }
  }
  await walk(dir);
  return out;
}
