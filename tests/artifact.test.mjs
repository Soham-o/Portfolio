// Job A → artifact → job B handoff, git concurrency handling, and the public-site allowlist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeWorld } from './helpers/mock-github.mjs';
import { makeSite, makeClient, commit, snapshotTree, exists, read, REPO_ROOT } from './helpers/site.mjs';
import { runSync } from '../tools/sync/sync.mjs';
import { packageChanges, gitChanges } from '../tools/sync/package.mjs';
import { applyArtifact } from '../tools/sync/apply.mjs';
import { sha256 } from '../tools/sync/util.mjs';

const T0 = new Date('2026-10-11T00:00:00Z');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tmp = (p) => fs.mkdtemp(path.join(os.tmpdir(), p));

async function initRepo(dir) {
  await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules/\ndata/.sync.lock\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'base');
}

/** Site with one committed sync; returns { dir, world } where dir is a git repo at a clean HEAD. */
async function syncedRepo() {
  const dir = await makeSite();
  const world = makeWorld();
  await commit(await runSync({ root: dir, client: makeClient(world), now: T0 }));
  await initRepo(dir);
  return { dir, world };
}

const withoutGit = (tree) => Object.fromEntries(Object.entries(tree).filter(([k]) => !k.startsWith('.git/')));

test('artifact round-trip: job B reproduces job A exactly, including stale-page deletion and renames', async () => {
  const { dir, world } = await syncedRepo();
  const jobB = await tmp('jobB-');
  git(jobB, 'clone', '-q', dir, '.');
  const base = git(dir, 'rev-parse', 'HEAD');

  world.repos.find((r) => r.id === 102).name = 'PersonaLearn-v2';                 // rename
  world.repos.find((r) => r.id === 104).private = true;                          // made private
  world.repos.push({ ...world.repos[3], id: 140, name: 'fresh-repo', private: false, description: 'A freshly published repository for testing' });
  await commit(await runSync({ root: dir, client: makeClient(world), now: new Date('2026-10-11T02:00:00Z') }));

  const out = path.join(await tmp('artifact-'), 'sync-output');
  const manifest = await packageChanges({ root: dir, out, base });
  assert.ok(manifest.deletes.includes('projects/newsletter-digest.html'), 'page of now-private repo is deleted');
  assert.ok(manifest.deletes.includes('data/cache/repos/104.json'));
  assert.ok(manifest.writes.some((w) => w.path === 'projects/personalearn-v2.html'));
  assert.ok(manifest.writes.some((w) => w.path === 'projects/fresh-repo.html'));
  assert.ok(manifest.writes.some((w) => w.path === 'data/state.json'), 'sync state travels with the artifact');
  assert.ok(manifest.writes.some((w) => w.path.startsWith('data/cache/repos/')), 'incremental cache travels with the artifact');

  await applyArtifact({ root: jobB, artifact: out });
  assert.deepEqual(withoutGit(await snapshotTree(jobB)), withoutGit(await snapshotTree(dir)));
  assert.ok(!(await exists(jobB, 'projects/newsletter-digest.html')));
  assert.match(await read(jobB, 'projects/personalearn.html'), /url=personalearn-v2\.html/, 'old slug redirects');
});

test('artifact: tampered content, foreign paths, traversal and wrong base are refused before writing', async () => {
  const { dir, world } = await syncedRepo();
  const base = git(dir, 'rev-parse', 'HEAD');
  world.repos.find((r) => r.id === 103).description = 'Changed description for the artifact test';
  world.repos.find((r) => r.id === 103).updated_at = '2026-10-11T05:00:00Z';
  await commit(await runSync({ root: dir, client: makeClient(world), now: new Date('2026-10-11T06:00:00Z') }));
  const out = path.join(await tmp('artifact-'), 'o');
  await packageChanges({ root: dir, out, base });

  const fresh = async () => { const d = await tmp('jobB-'); git(d, 'clone', '-q', dir, '.'); git(d, 'checkout', '-q', base); return d; };
  const mutate = async (fn) => {
    const copy = path.join(await tmp('artifact-copy-'), 'o');
    await fs.cp(out, copy, { recursive: true });
    const m = JSON.parse(await fs.readFile(path.join(copy, 'manifest.json'), 'utf8'));
    await fn(m, copy);
    await fs.writeFile(path.join(copy, 'manifest.json'), JSON.stringify(m));
    return copy;
  };

  // content changed after hashing
  let d = await fresh();
  let before = await snapshotTree(d);
  const tampered = await mutate(async (m, copy) => { await fs.appendFile(path.join(copy, 'files', m.writes[0].path), '<script>x</script>'); });
  await assert.rejects(() => applyArtifact({ root: d, artifact: tampered }), /hash mismatch/);
  assert.deepEqual(await snapshotTree(d), before, 'nothing written');

  // paths outside the allowlist (workflow / tooling / traversal)
  for (const bad of ['.github/workflows/evil.yml', 'tools/sync/sync.mjs', '../outside.html', 'projects/../index.html', 'content/achievements.json']) {
    d = await fresh();
    const evil = await mutate(async (m, copy) => {
      await fs.mkdir(path.dirname(path.join(copy, 'files', bad.replace(/\.\.\//g, ''))), { recursive: true });
      await fs.writeFile(path.join(copy, 'files', bad.replace(/\.\.\//g, '')), 'x');
      m.writes.push({ path: bad, sha256: sha256('x'), size: 1 });
    });
    await assert.rejects(() => applyArtifact({ root: d, artifact: evil }), /allowlist/, bad);
  }

  // checkout at a different commit than the artifact was built from
  d = await tmp('jobB-'); git(d, 'clone', '-q', dir, '.');
  git(d, 'config', 'user.email', 't@t'); git(d, 'config', 'user.name', 't');
  git(d, 'commit', '-q', '--allow-empty', '-m', 'someone else moved the branch');
  await assert.rejects(() => applyArtifact({ root: d, artifact: out }), /built from/);
});

test('artifact: output that fails validation cannot be applied (so it cannot be committed)', async () => {
  const { dir, world } = await syncedRepo();
  const base = git(dir, 'rev-parse', 'HEAD');
  world.repos.find((r) => r.id === 103).description = 'Another change';
  world.repos.find((r) => r.id === 103).updated_at = '2026-10-11T07:00:00Z';
  await commit(await runSync({ root: dir, client: makeClient(world), now: new Date('2026-10-11T08:00:00Z') }));
  // Corrupt a generated page in job A's tree after the sync: remove a marker end
  const html = await read(dir, 'projects.html');
  await fs.writeFile(path.join(dir, 'projects.html'), html.replace('<!-- github-sync:projects:end -->', ''));
  const out = path.join(await tmp('artifact-'), 'o');
  await packageChanges({ root: dir, out, base });
  const d = await tmp('jobB-'); git(d, 'clone', '-q', dir, '.'); git(d, 'checkout', '-q', base);
  await assert.rejects(() => applyArtifact({ root: d, artifact: out }), /Validation failed/);
});

test('package: a sync that touches non-generated files aborts', async () => {
  const { dir } = await syncedRepo();
  await fs.mkdir(path.join(dir, '.github/workflows'), { recursive: true });
  await fs.writeFile(path.join(dir, '.github/workflows/pwn.yml'), 'on: push');
  await assert.rejects(async () => packageChanges({ root: dir, out: path.join(await tmp('a-'), 'o'), base: null }), /outside the generated-file allowlist/);
  assert.deepEqual(gitChanges(dir).map((c) => c.path), ['.github/workflows/pwn.yml']);
});

test('apply/validate/package are dependency-free (job B never loads npm packages or the README pipeline)', async () => {
  const seen = new Set();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = await fs.readFile(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('.'), `${path.basename(file)} imports package "${spec}"`);
      await visit(path.resolve(path.dirname(file), spec));
    }
  };
  for (const entry of ['apply.mjs', 'check.mjs', 'package.mjs']) await visit(path.join(REPO_ROOT, 'tools/sync', entry));
  const names = [...seen].map((f) => path.basename(f));
  assert.ok(!names.includes('readme.mjs') && !names.includes('sync.mjs') && !names.includes('render.mjs'), names.join(','));
});

/* ── git concurrency (tools/sync/git-publish.sh against a real local remote) ── */

async function remoteAndClones() {
  const remote = await tmp('remote-');
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  const seed = await tmp('seed-');
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'config', 'user.email', 't@t'); git(seed, 'config', 'user.name', 't');
  await fs.writeFile(path.join(seed, 'projects.html'), 'one\n');
  await fs.writeFile(path.join(seed, 'README.md'), 'readme\n');
  git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'seed');
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '-q', 'origin', 'main');
  const clone = async () => {
    const d = await tmp('clone-'); git(d, 'clone', '-q', remote, '.');
    git(d, 'config', 'user.email', 'b@b'); git(d, 'config', 'user.name', 'bot');
    return d;
  };
  return { remote, clone };
}
const publish = (cwd, phase) => spawnSync('bash', [path.join(REPO_ROOT, 'tools/sync/git-publish.sh'), phase], {
  cwd, encoding: 'utf8', env: { ...process.env, BRANCH: 'main', PUSH_TOKEN: 'ghs_secret_token_value' },
});

test('git: unrelated concurrent commit → rebase and fast-forward push', async () => {
  const { remote, clone } = await remoteAndClones();
  const bot = await clone(); const human = await clone();
  await fs.writeFile(path.join(bot, 'projects.html'), 'synced\n'); git(bot, 'commit', '-qam', 'sync');
  await fs.writeFile(path.join(human, 'README.md'), 'human edit\n'); git(human, 'commit', '-qam', 'human'); git(human, 'push', '-q');
  assert.equal(publish(bot, 'rebase').status, 0);
  const res = publish(bot, 'push');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^sha=[0-9a-f]{40}$/m);
  assert.doesNotMatch(res.stdout + res.stderr, /ghs_secret_token_value/);
  const log = git(remote, 'log', '--format=%s', 'main');
  assert.deepEqual(log.split('\n'), ['sync', 'human', 'seed'], 'human work kept, nothing overwritten');
});

test('git: conflicting concurrent commit → no push, remote untouched, no force', async () => {
  const { remote, clone } = await remoteAndClones();
  const bot = await clone(); const human = await clone();
  await fs.writeFile(path.join(bot, 'projects.html'), 'synced\n'); git(bot, 'commit', '-qam', 'sync');
  await fs.writeFile(path.join(human, 'projects.html'), 'hand edit\n'); git(human, 'commit', '-qam', 'human'); git(human, 'push', '-q');
  const before = git(remote, 'rev-parse', 'main');
  const res = publish(bot, 'rebase');
  assert.equal(res.status, 1);
  assert.match(res.stdout, /conflict with a newer commit/);
  assert.equal(git(remote, 'rev-parse', 'main'), before);
  assert.equal(git(bot, 'status', '--porcelain'), '', 'rebase aborted cleanly');
});

test('git: push rejected when the branch moved after the rebase', async () => {
  const { remote, clone } = await remoteAndClones();
  const bot = await clone(); const human = await clone();
  await fs.writeFile(path.join(bot, 'projects.html'), 'synced\n'); git(bot, 'commit', '-qam', 'sync');
  assert.equal(publish(bot, 'rebase').status, 0);
  await fs.writeFile(path.join(human, 'README.md'), 'late edit\n'); git(human, 'commit', '-qam', 'late'); git(human, 'push', '-q');
  const before = git(remote, 'rev-parse', 'main');
  const res = publish(bot, 'push');
  assert.equal(res.status, 1);
  assert.match(res.stdout, /rejected/);
  assert.equal(git(remote, 'rev-parse', 'main'), before, 'nothing overwritten');
});

/* ── public site assembly ── */

test('assemble-site: only public website files are deployed', async () => {
  const out = path.join(await tmp('site-'), '_site');
  const res = spawnSync('bash', [path.join(REPO_ROOT, 'tools/assemble-site.sh'), out], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const files = Object.keys(await snapshotTree(out));
  const allowed = /^(index|about|projects|journey)\.html$|^(style\.css|script\.js|github-sync\.js|sitemap\.xml)$|^Image-Doc\/[^/]+$|^projects\/[a-z0-9-]+\.html$/;
  for (const f of files) assert.match(f, allowed, `unexpected file in deploy: ${f}`);
  for (const must of ['index.html', 'projects.html', 'journey.html', 'style.css', 'Image-Doc/resume.pdf']) assert.ok(files.includes(must), must);
  for (const f of files) assert.doesNotMatch(f, /^(data|tools|tests|content|docs|relay|templates|node_modules|\.github)\/|package/, f);
});
