// Structural tests for the GitHub Actions security boundary (parsed YAML, not string matching).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from './helpers/site.mjs';

const load = async (f) => parse(await fs.readFile(path.join(REPO_ROOT, '.github/workflows', f), 'utf8'));
const stepText = (s) => JSON.stringify(s);
const usesToken = (s) => /github\.token|secrets\.|GITHUB_TOKEN/.test(stepText(s));

test('workflow: no default permissions and no pull-request triggers', async () => {
  for (const f of ['sync-github.yml', 'static.yml']) {
    const wf = await load(f);
    assert.deepEqual(wf.permissions, {}, `${f}: workflow-level permissions must be empty`);
    assert.ok(!('pull_request' in wf.on) && !('pull_request_target' in wf.on), `${f}: no PR triggers`);
  }
});

test('workflow: job A (sync) is read-only and never sees a write-capable token', async () => {
  const { jobs } = await load('sync-github.yml');
  const a = jobs.sync;
  assert.deepEqual(a.permissions, { contents: 'read', pages: 'read' });
  const checkout = a.steps.find((s) => String(s.uses).startsWith('actions/checkout'));
  assert.equal(checkout.with['persist-credentials'], false);
  const tokenSteps = a.steps.filter(usesToken);
  assert.deepEqual(tokenSteps.map((s) => s.name), ['Sync from GitHub'], 'only the sync step gets a (read-only) token');
  assert.equal(tokenSteps[0].env.GITHUB_TOKEN, '${{ secrets.PORTFOLIO_SYNC_TOKEN || github.token }}');
  // validation and packaging happen before anything leaves the job
  const names = a.steps.map((s) => s.name);
  assert.ok(names.indexOf('Validate generated files') > names.indexOf('Sync from GitHub'));
  assert.ok(names.indexOf('Upload generated changes') > names.indexOf('Package generated changes'));
});

test('workflow: job B (commit) is the only writer, runs no npm/README code, token only for git', async () => {
  const { jobs } = await load('sync-github.yml');
  const b = jobs.commit;
  assert.deepEqual(b.permissions, { contents: 'write' });
  assert.equal(b.needs, 'sync');
  assert.match(b.if, /needs\.sync\.outputs\.changed == 'true'/);
  const checkout = b.steps.find((s) => String(s.uses).startsWith('actions/checkout'));
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(checkout.with.ref, '${{ needs.sync.outputs.base }}');
  for (const s of b.steps) {
    const run = s.run || '';
    assert.doesNotMatch(run, /\bnpm\b|\bnpx\b/, `${s.name}: commit job must not run npm`);
    assert.doesNotMatch(run, /readme|sync\/cli\.mjs|npm run sync/i, `${s.name}: commit job must not run the README pipeline`);
    if (usesToken(s)) {
      assert.doesNotMatch(run, /\bnode\b/, `${s.name}: a step with the token must not run node`);
      assert.match(run, /git-publish\.sh (rebase|push)/, `${s.name}: token only used by git-publish.sh`);
    }
  }
  const apply = b.steps.find((s) => s.name === 'Apply and validate');
  assert.ok(apply && !usesToken(apply));
  // every other job has no write permission
  for (const [name, job] of Object.entries(jobs)) {
    if (name === 'commit') continue;
    assert.notEqual(job.permissions?.contents, 'write', `${name} must not have contents:write`);
  }
});

test('workflow: job C deploys the pushed commit only when Pages is enabled', async () => {
  const { jobs } = await load('sync-github.yml');
  const c = jobs.deploy;
  assert.deepEqual(c.needs, ['sync', 'commit']);
  assert.equal(c.if, "needs.commit.outputs.pushed == 'true' && needs.sync.outputs.pages == 'success'");
  assert.equal(c.uses, './.github/workflows/static.yml');
  assert.equal(c.with.ref, '${{ needs.commit.outputs.sha }}');
  assert.deepEqual(c.permissions, { contents: 'read', pages: 'write', 'id-token': 'write' });
});

test('workflow: triggers and concurrency', async () => {
  const wf = await load('sync-github.yml');
  assert.equal(wf.on.schedule[0].cron, '17 * * * *');
  assert.deepEqual(wf.on.push.paths, ['content/**', 'templates/**']);
  assert.ok('workflow_dispatch' in wf.on);
  assert.deepEqual(wf.on.repository_dispatch.types, ['github-sync']);
  assert.deepEqual(wf.concurrency, { group: 'github-sync', 'cancel-in-progress': false });
  const commitStep = wf.jobs.commit.steps.find((s) => s.name === 'Commit');
  assert.match(commitStep.run, /\[skip ci\]/, 'bot commits must not re-trigger push workflows');
  assert.doesNotMatch(JSON.stringify(wf), /--force|-f origin|\+HEAD:/, 'never force-push');
});

test('workflow: static.yml skips cleanly without Pages and publishes only the assembled site', async () => {
  const wf = await load('static.yml');
  assert.deepEqual(wf.jobs['pages-status'].permissions, { pages: 'read' });
  assert.equal(wf.jobs.deploy.needs, 'pages-status');
  assert.equal(wf.jobs.deploy.if, "needs.pages-status.outputs.enabled == 'true'");
  const steps = wf.jobs.deploy.steps;
  assert.equal(steps.find((s) => s.name === 'Checkout').with.ref, '${{ inputs.ref || github.sha }}');
  assert.equal(steps.find((s) => s.name === 'Assemble site').run, 'bash tools/assemble-site.sh _site');
  assert.equal(steps.find((s) => s.name === 'Upload artifact').with.path, '_site');
  assert.ok('workflow_call' in wf.on);
});
