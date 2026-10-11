// End-to-end: run the real CLI as a child process against a mock GitHub API over HTTP,
// exactly as the GitHub Actions workflow does (scheduled sync → outputs → check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeWorld, startServer } from './helpers/mock-github.mjs';
import { makeSite, read, REPO_ROOT } from './helpers/site.mjs';

const CLI = path.join(REPO_ROOT, 'tools/sync/cli.mjs');

async function run(dir, server, extraEnv = {}, args = []) {
  const out = path.join(dir, 'gh-output.txt');
  const summary = path.join(dir, 'gh-summary.md');
  await fs.writeFile(out, '');
  // Async spawn: the mock server lives in this process and must keep serving while the CLI runs.
  const res = await new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, '--root', dir, ...args], { env: {
      PATH: process.env.PATH, GITHUB_SYNC_API_URL: server.url, GITHUB_TOKEN: 'ghs_mocktoken123',
      GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary, SITE_URL: 'https://soham-o.github.io/Portfolio',
      SYNC_MAX_RATE_WAIT_MS: '0', ...extraEnv,
    } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, output: await fs.readFile(out, 'utf8'), summary: await fs.readFile(summary, 'utf8').catch(() => '') };
}

test('e2e: CLI syncs over HTTP, reports outputs, is idempotent and fails safely', async (t) => {
  const world = makeWorld();
  const server = await startServer(world);
  t.after(() => server.close());
  const dir = await makeSite();

  const first = await run(dir, server);
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.output, /changed=true/);
  assert.match(first.summary, /Portfolio GitHub sync/);
  assert.doesNotMatch(first.stdout + first.stderr + first.summary, /ghs_mocktoken123/, 'token never logged');
  assert.match(await read(dir, 'projects/internpilot-ai.html'), /<link rel="canonical" href="https:\/\/soham-o\.github\.io\/Portfolio\/projects\/internpilot-ai\.html">/);

  const check = spawnSync(process.execPath, [CLI, '--root', dir, '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);

  const second = await run(dir, server);
  assert.equal(second.code, 0);
  assert.match(second.output, /changed=false/);

  // Total API outage → non-zero exit, nothing changed, live site kept
  const before = await read(dir, 'projects.html');
  await server.close();
  const down = await run(dir, server);
  assert.equal(down.code, 1);
  assert.match(down.output, /changed=false/);
  assert.match(down.summary, /The live site was not modified/);
  assert.equal(await read(dir, 'projects.html'), before);
  // lock released even after failure
  await assert.rejects(() => fs.access(path.join(dir, 'data/.sync.lock')));
});

test('e2e: a concurrent run exits cleanly without touching files', async () => {
  const dir = await makeSite();
  await fs.mkdir(path.join(dir, 'data'), { recursive: true });
  await fs.writeFile(path.join(dir, 'data/.sync.lock'), JSON.stringify({ pid: 1, at: new Date().toISOString() }));
  const res = await run(dir, { url: 'http://127.0.0.1:9' });
  assert.equal(res.code, 0);
  assert.match(res.output, /changed=false/);
  assert.match(res.stderr, /Another sync is running/);
});
