// Integration tests for the full sync pipeline against an in-memory GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeWorld } from './helpers/mock-github.mjs';
import { makeSite, makeClient, commit, read, exists, snapshotTree, REPO_ROOT } from './helpers/site.mjs';
import { runSync } from '../tools/sync/sync.mjs';
import { RateLimitError } from '../tools/sync/github.mjs';

const T0 = new Date('2026-10-11T00:00:00Z');
const later = (h) => new Date(T0.getTime() + h * 36e5);

async function sync(dir, world, now = T0, extra = {}) {
  const r = await runSync({ root: dir, client: makeClient(world, extra.client), now, ...extra.opts });
  await commit(r);
  return r;
}
const projectsOf = async (dir) => JSON.parse(await read(dir, 'data/projects.json')).projects;

test('initial discovery: eligible public repos get cards, pages and data', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  const r = await sync(dir, world);
  const projects = await projectsOf(dir);
  const names = projects.map((p) => p.name).sort();
  assert.deepEqual(names, ['InternPilot-AI', 'PersonaLearn', 'Task_Manager', 'newsletter-digest', 'old-experiment']);
  assert.equal(r.summary.added.length, 5);
  for (const p of projects) assert.ok(await exists(dir, `projects/${p.slug}.html`), `page for ${p.slug}`);
  const html = await read(dir, 'projects.html');
  // Auto grid contains non-curated repos only; curated ones keep their hand-written card.
  const grid = html.slice(html.indexOf('github-sync:projects:start'), html.indexOf('github-sync:projects:end'));
  assert.match(grid, /<h2>InternPilot-AI<\/h2>/);
  assert.doesNotMatch(grid, /PersonaLearn/);
  // Curated card links now point to the generated detail page
  assert.match(html, /github-sync:card-links:PersonaLearn:start -->\s*<div class="fp-links">[\s\S]*?href="projects\/personalearn\.html" class="btn-visit"/);
  // Fork and configured exclusions are absent
  assert.doesNotMatch(JSON.stringify(projects), /some-fork/);
  assert.equal(projects.find((p) => p.name === 'Soham-o'), undefined);
  // Archived repo kept and labelled
  assert.equal(projects.find((p) => p.name === 'old-experiment').archived, true);
  assert.match(grid, /Java · Archived/);
  // Sitemap and status
  assert.match(await read(dir, 'sitemap.xml'), /projects\/internpilot-ai\.html/);
  const status = JSON.parse(await read(dir, 'data/sync-status.json'));
  assert.equal(status.lastPublishedAt, T0.toISOString());
});

test('private repositories never reach any generated file (even if the API leaked one)', async () => {
  const dir = await makeSite();
  const world = makeWorld({ leakPrivate: true });
  await sync(dir, world);
  const tree = await snapshotTree(dir);
  for (const [file, content] of Object.entries(tree)) {
    assert.doesNotMatch(content, /secret-client-work|CONFIDENTIAL/, `private data leaked into ${file}`);
  }
  // Private repos the user contributed to are dropped from GraphQL results as well
  assert.doesNotMatch(tree['data/profile.json'], /corp\/private/);
});

test('a newly public repository is discovered on the next run, without duplicates', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const secret = world.repos.find((x) => x.id === 199);
  // made public later
  secret.private = false;
  secret.visibility = 'public';
  secret.name = 'client-dashboard';
  secret.description = 'Now open source';
  secret.readme = { path: 'README.md', content: '# Client dashboard\n\nA dashboard that is now open source for everyone to use.' };
  world.repos.push({ ...world.repos[3], id: 120, name: 'brand-new-tool', description: 'Fresh project', created_at: '2026-10-10T00:00:00Z', pushed_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z' });
  const r = await sync(dir, world, later(1));
  assert.deepEqual(r.summary.added.map((a) => a.name).sort(), ['brand-new-tool', 'client-dashboard']);
  const projects = await projectsOf(dir);
  assert.equal(projects.length, 7);
  assert.equal(new Set(projects.map((p) => p.id)).size, 7, 'no duplicate ids');
  assert.equal(new Set(projects.map((p) => p.slug)).size, 7, 'no duplicate slugs');
  assert.ok(await exists(dir, 'projects/brand-new-tool.html'));
  // Newest push sorts first among non-featured
  assert.equal(projects[0].name, 'brand-new-tool');
});

test('updating an existing repository updates its record in place', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const before = await projectsOf(dir);
  const r0 = world.repos.find((x) => x.id === 103);
  r0.description = 'Updated description';
  r0.topics = [...r0.topics, 'automation'];
  r0.updated_at = '2026-10-11T00:30:00Z';
  r0.readme.content += '\n## Usage\nRun `python main.py` daily.\n';
  r0.pushed_at = '2026-10-11T00:30:00Z';
  const r = await sync(dir, world, later(1));
  const after = await projectsOf(dir);
  assert.equal(after.length, before.length);
  const p = after.find((x) => x.id === 103);
  assert.equal(p.description, 'Updated description');
  assert.equal(p.slug, before.find((x) => x.id === 103).slug);
  assert.ok(p.readme.sections.some((s) => s.kind === 'usage'));
  assert.ok(r.summary.updated.some((u) => u.id === 103));
  assert.match(await read(dir, `projects/${p.slug}.html`), /Updated description/);
});

test('renamed repository keeps identity, gets a new slug and a redirect, overrides follow', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const r0 = world.repos.find((x) => x.id === 102); // PersonaLearn (curated override)
  r0.name = 'PersonaLearn-v2';
  r0.updated_at = '2026-10-11T01:00:00Z';
  const r = await sync(dir, world, later(1));
  assert.deepEqual(r.summary.renamed, [{ id: 102, from: 'PersonaLearn', to: 'PersonaLearn-v2' }]);
  const projects = await projectsOf(dir);
  const p = projects.find((x) => x.id === 102);
  assert.equal(projects.filter((x) => x.id === 102).length, 1);
  assert.equal(p.slug, 'personalearn-v2');
  assert.equal(p.curated, true, 'override keyed by old name still applies');
  assert.equal(p.category, 'ML · Adaptive Learning');
  const redirect = await read(dir, 'projects/personalearn.html');
  assert.match(redirect, /http-equiv="refresh" content="0; url=personalearn-v2\.html"/);
  // Curated card (marker uses the old name) links to the new page
  assert.match(await read(dir, 'projects.html'), /href="projects\/personalearn-v2\.html" class="btn-visit"/);
});

test('deleted or privatized repositories are removed only after confirmation', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  assert.ok(await exists(dir, 'projects/newsletter-digest.html'));

  // Transient failure while confirming → keep data
  const victim = world.repos.find((x) => x.id === 104);
  victim.private = true;
  world.failures.push({ match: /\/repositories\/104/, status: 500 });
  let r = await sync(dir, world, later(1));
  assert.equal(r.summary.removed.length, 0);
  assert.ok((await projectsOf(dir)).some((p) => p.id === 104), 'kept after unconfirmed disappearance');
  assert.ok(await exists(dir, 'projects/newsletter-digest.html'));

  // Confirmed (404) → removed, page deleted
  world.failures = [];
  r = await sync(dir, world, later(2));
  assert.deepEqual(r.summary.removed.map((x) => x.id), [104]);
  assert.ok(!(await projectsOf(dir)).some((p) => p.id === 104));
  assert.ok(!(await exists(dir, 'projects/newsletter-digest.html')));
  assert.ok(!(await exists(dir, 'data/cache/repos/104.json')));

  // Made public again → returns with the same slug
  victim.private = false;
  r = await sync(dir, world, later(3));
  assert.ok(r.summary.added.some((a) => a.id === 104 && a.returning));
  assert.ok(await exists(dir, 'projects/newsletter-digest.html'));
});

test('transferred repositories are removed', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const t = world.repos.find((x) => x.id === 107);
  t.owner = 'someone-else';
  const r = await sync(dir, world, later(1));
  assert.deepEqual(r.summary.removed, [{ id: 107, name: 'old-experiment', reason: 'moved' }]);
});

test('listing failure aborts the whole run before anything is written', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const before = await snapshotTree(dir);
  world.failures.push({ match: /\/users\/Soham-o\/repos.*page=2/, status: 500 });
  await assert.rejects(() => runSync({ root: dir, client: makeClient(world), now: later(30) }));
  assert.deepEqual(await snapshotTree(dir), before);
});

test('rate limit during details keeps previous data and flags it as stale', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  world.failures.push({
    match: /\/repos\/Soham-o\/InternPilot-AI\/readme/, status: 403,
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) },
  });
  world.repos.find((x) => x.id === 103).pushed_at = '2026-10-11T05:00:00Z';
  const r = await sync(dir, world, later(2), { client: { maxRateLimitWaitMs: 1000 } });
  const p = (await projectsOf(dir)).find((x) => x.id === 103);
  assert.equal(p.stale, true);
  assert.equal(p.readmeStatus, 'ok', 'previous README kept');
  assert.ok(r.warnings.some((w) => /InternPilot-AI/.test(w)));
});

test('rate limit error class is raised when the wait would be too long', async () => {
  const world = makeWorld();
  world.failures.push({ match: /\/users\/Soham-o\/repos/, status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) } });
  const dir = await makeSite();
  await assert.rejects(() => runSync({ root: dir, client: makeClient(world, { maxRateLimitWaitMs: 10 }), now: T0 }), RateLimitError);
});

test('idempotent: re-running with unchanged data writes nothing and creates no duplicates', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const before = await snapshotTree(dir);
  const r = await sync(dir, world, later(1));
  assert.equal(r.publish, false);
  assert.deepEqual(await snapshotTree(dir), before);
  // Even forcing a write produces the same content apart from timestamps
  const r2 = await runSync({ root: dir, client: makeClient(world), now: later(2), full: true });
  assert.equal(r2.publish, true);
  const projects = JSON.parse(r2.files.get(path.join(dir, 'data/projects.json'))).projects;
  assert.equal(projects.length, 5);
});

test('incremental: unchanged repos are not re-fetched; heartbeat publishes after 24h', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  world.log.length = 0;
  await sync(dir, world, later(1));
  assert.equal(world.log.filter((l) => /\/readme/.test(l)).length, 0, 'no README requests on an unchanged incremental run');
  const r = await sync(dir, world, later(25));
  assert.equal(r.publish, true, 'heartbeat / daily full refresh');
  assert.ok(world.log.some((l) => /\/readme/.test(l)), 'daily full refresh re-reads READMEs');
});

test('manually maintained achievements are rendered and never modified', async () => {
  const dir = await makeSite();
  const manualBefore = await read(dir, 'content/achievements.json');
  const world = makeWorld();
  await sync(dir, world);
  await sync(dir, world, later(30));
  assert.equal(await read(dir, 'content/achievements.json'), manualBefore);
  const journey = await read(dir, 'journey.html');
  for (const item of JSON.parse(manualBefore).items) {
    assert.ok(journey.includes(item.title), `manual achievement "${item.title}" rendered`);
  }
  assert.match(journey, /Verified on GitHub/);
});

test('hand-written HTML outside the markers is preserved byte for byte', async () => {
  const dir = await makeSite();
  const original = await fs.readFile(path.join(REPO_ROOT, 'projects.html'), 'utf8');
  await sync(dir, makeWorld());
  const after = await read(dir, 'projects.html');
  const strip = (h) => h.replace(/(<!--\s*github-sync:[^\s]+:start\s*-->)[\s\S]*?(<!--\s*github-sync:[^\s]+:end\s*-->)/g, '$1$2');
  assert.equal(strip(after), strip(original));
});

test('API failure for optional sources never fabricates numbers', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  world.failures.push({ match: /\/graphql/, status: 502 });
  world.failures.push({ match: /\/search\/issues/, status: 502 });
  await sync(dir, world);
  const profile = JSON.parse(await read(dir, 'data/profile.json'));
  assert.equal(profile.stats.contributionsLastYear, null);
  const journey = await read(dir, 'journey.html');
  assert.match(journey, /Contribution calendar unavailable/);
  assert.doesNotMatch(journey, /Contributions · Past Year/);
  const ach = JSON.parse(await read(dir, 'data/achievements.json')).items;
  assert.ok(!ach.some((a) => a.type === 'streak' || a.type === 'external'));
});

test('excluding a repo via override removes its page', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  const ovFile = path.join(dir, 'content/projects.overrides.json');
  const ov = JSON.parse(await fs.readFile(ovFile, 'utf8'));
  ov.projects['old-experiment'] = { hidden: true };
  await fs.writeFile(ovFile, JSON.stringify(ov));
  await sync(dir, world, later(1));
  assert.ok(!(await exists(dir, 'projects/old-experiment.html')));
  assert.ok(!(await projectsOf(dir)).some((p) => p.name === 'old-experiment'));
});

test('render-only mode rebuilds pages from committed data without API calls', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  await fs.rm(path.join(dir, 'projects/task-manager.html'));
  world.log.length = 0;
  world.networkDown = true;
  const r = await runSync({ root: dir, client: makeClient(world), now: later(1), renderOnly: true });
  await commit(r);
  assert.equal(world.log.length, 0);
  assert.ok(await exists(dir, 'projects/task-manager.html'));
});

test('editing the project template republishes even when GitHub data is unchanged', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  await sync(dir, world);
  let r = await runSync({ root: dir, client: makeClient(world), now: later(1) });
  assert.equal(r.publish, false);
  const tpl = path.join(dir, 'templates/project.html');
  await fs.writeFile(tpl, (await fs.readFile(tpl, 'utf8')).replace('</body>', '<!-- tweak -->\n</body>'));
  r = await sync(dir, world, later(2));
  assert.equal(r.publish, true);
  assert.match(await read(dir, 'projects/internpilot-ai.html'), /<!-- tweak -->/);
});

test('empty repositories (no commits, no README, no languages) are handled', async () => {
  const dir = await makeSite();
  const world = makeWorld();
  world.repos.push({ ...world.repos[3], id: 130, name: 'empty-repo', description: 'Just created', readme: null, languages: {}, files: {}, dirs: [], language: null, releases: [] });
  world.failures.push({ match: /\/repos\/Soham-o\/empty-repo\/contents/, status: 404, body: { message: 'This repository is empty.' } });
  await sync(dir, world);
  const p = (await projectsOf(dir)).find((x) => x.name === 'empty-repo');
  assert.equal(p.readmeStatus, 'missing');
  assert.equal(p.displayName, 'Empty Repo');
  assert.match(await read(dir, 'projects/empty-repo.html'), /doesn't have a README yet/);
});

test('a classic token with write scopes is refused; read-only scopes are accepted', async () => {
  const dir = await makeSite();
  for (const scopes of ['repo', 'public_repo, read:user', 'workflow']) {
    const world = makeWorld({ oauthScopes: scopes });
    await assert.rejects(() => runSync({ root: dir, client: makeClient(world), now: T0 }), /write-capable scopes/, scopes);
  }
  const ok = makeWorld({ oauthScopes: 'read:user, user:email' });
  const r = await runSync({ root: dir, client: makeClient(ok), now: T0 });
  assert.equal(r.summary.discovered, 7);
});

test('canonical, Open Graph and sitemap URLs share one base, including a Pages sub-path', async () => {
  for (const [siteUrl, base] of [[undefined, 'https://soham-o.github.io/Portfolio/'], ['https://example.github.io/Sub', 'https://example.github.io/Sub/']]) {
    const dir = await makeSite();
    const env = siteUrl ? { SITE_URL: siteUrl } : {};
    await commit(await runSync({ root: dir, client: makeClient(makeWorld()), now: T0, env }));
    const page = await read(dir, 'projects/internpilot-ai.html');
    assert.match(page, new RegExp(`<link rel="canonical" href="${base.replace(/\./g, '\\.')}projects/internpilot-ai\\.html">`));
    assert.match(page, new RegExp(`<meta property="og:url" content="${base.replace(/\./g, '\\.')}projects/internpilot-ai\\.html">`));
    const locs = [...(await read(dir, 'sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.ok(locs.length > 4 && locs.every((l) => l.startsWith(base)), locs.join(' '));
    // nested pages use relative asset paths that resolve under any base path
    assert.match(page, /href="\.\.\/style\.css"/);
    assert.match(page, /href="\.\.\/projects\.html"/);
    const { checkCommitted } = await import('../tools/sync/validate.mjs');
    assert.deepEqual(await checkCommitted(dir), []);
  }
});

test('README portfolio link matches the configured canonical base URL', async () => {
  const cfg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'content/portfolio.config.json'), 'utf8'));
  const readmeMd = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const links = [...readmeMd.matchAll(/https:\/\/soham-o\.github\.io\/[^"')\s]*/gi)].map((m) => m[0]);
  assert.ok(links.length > 0);
  for (const l of links) assert.ok(l.startsWith(cfg.site.url), `${l} vs ${cfg.site.url}`);
});

test('cards use the chosen summary; undocumented repos show the explicit fallback', async () => {
  const dir = await makeSite();
  await commit(await runSync({ root: dir, client: makeClient(makeWorld()), now: T0 }));
  const projects = await projectsOf(dir);
  const nd = projects.find((p) => p.name === 'newsletter-digest');
  assert.equal(nd.summarySource, 'none');
  const html = await read(dir, 'projects.html');
  assert.ok(html.includes('No description yet — the repository has no description or README summary.'));
  const ip = projects.find((p) => p.name === 'InternPilot-AI');
  assert.equal(ip.summarySource, 'description');
  const pl = projects.find((p) => p.name === 'PersonaLearn');
  assert.equal(pl.summarySource, 'override', 'manual override wins');
});
