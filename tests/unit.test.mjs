// Unit tests: GitHub client, README processing, tech detection, achievements, markers, rendering safety.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, GitHubError, RateLimitError, parseNextLink } from '../tools/sync/github.mjs';
import { processReadme, makeUrlResolver, isBadgeUrl, classifySection, resanitize } from '../tools/sync/readme.mjs';
import { detectTech, parseRequirements, parsePyproject } from '../tools/sync/tech.mjs';
import { computeAchievements, longestStreak } from '../tools/sync/achievements.mjs';
import { replaceMarker, validateMarkers } from '../tools/sync/markers.mjs';
import { renderProjectCard, renderProjectPage, renderManualMilestones, renderCuratedLinks } from '../tools/sync/render.mjs';
import { eligibility, sortProjects, prettyName } from '../tools/sync/sync.mjs';
import { slugify, safeUrl, truncate } from '../tools/sync/util.mjs';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const resp = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/* ── GitHub client ───────────────────────────────────── */

test('client: paginates through Link headers and refuses foreign hosts', async () => {
  const pages = {
    'https://api.github.com/x?page=1': resp(200, [1, 2], { link: '<https://api.github.com/x?page=2>; rel="next"' }),
    'https://api.github.com/x?page=2': resp(200, [3], {}),
  };
  const c = new GitHubClient({ fetchImpl: async (u) => pages[u], logger: quiet });
  assert.deepEqual(await c.paginate('/x?page=1'), [1, 2, 3]);
  const evil = new GitHubClient({ fetchImpl: async () => resp(200, [1], { link: '<https://evil.example/x>; rel="next"' }), logger: quiet });
  await assert.rejects(() => evil.paginate('/x'), /foreign host/);
  assert.equal(parseNextLink('<a>; rel="prev", <b>; rel="next"'), 'b');
});

test('client: retries 5xx and network errors, then succeeds', async () => {
  let n = 0;
  const c = new GitHubClient({
    fetchImpl: async () => { n += 1; if (n === 1) throw new TypeError('fetch failed'); if (n === 2) return resp(502, {}); return resp(200, { ok: 1 }); },
    sleep: async () => {}, logger: quiet,
  });
  assert.deepEqual(await c.get('/y'), { ok: 1 });
  assert.equal(n, 3);
});

test('client: gives up after max retries with a retryable error', async () => {
  const c = new GitHubClient({ fetchImpl: async () => resp(503, {}), sleep: async () => {}, logger: quiet, maxRetries: 2 });
  await assert.rejects(() => c.get('/z'), (e) => e instanceof GitHubError && e.status === 503);
});

test('client: waits out short rate limits, fails fast on long ones', async () => {
  let n = 0;
  const slept = [];
  const c = new GitHubClient({
    fetchImpl: async () => (++n === 1 ? resp(429, {}, { 'retry-after': '2' }) : resp(200, { ok: true })),
    sleep: async (ms) => { slept.push(ms); }, logger: quiet,
  });
  assert.deepEqual(await c.get('/r'), { ok: true });
  assert.equal(slept[0], 2000);
  const reset = String(Math.floor(Date.now() / 1000) + 3600);
  const c2 = new GitHubClient({ fetchImpl: async () => resp(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }), sleep: async () => {}, logger: quiet, maxRateLimitWaitMs: 1000 });
  await assert.rejects(() => c2.get('/r'), RateLimitError);
});

test('client: times out hanging requests', async () => {
  const c = new GitHubClient({
    timeoutMs: 20, maxRetries: 0, logger: quiet,
    fetchImpl: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  await assert.rejects(() => c.get('/slow'), /timed out/);
});

test('client: never puts the token in error messages', async () => {
  const c = new GitHubClient({ token: 'ghp_SUPERSECRET', fetchImpl: async () => resp(401, { message: 'Bad credentials' }), logger: quiet });
  await assert.rejects(() => c.get('/user'), (e) => !String(e.message).includes('SUPERSECRET') && !String(e.stack).includes('SUPERSECRET'));
});

/* ── README processing ───────────────────────────────── */

const md = `<p align="center"><img src="https://img.shields.io/badge/a-b-c"></p>

# Cool Tool

Cool Tool turns messy newsletters into a short morning briefing you can read in minutes.

## Problem
People waste 40 minutes a day skimming newsletters for a few useful lines.

## Key Features
- Summarises 10+ sources
- Sends to Telegram

## Screenshots
![shot](docs/shot.png)
<img src="../assets/raw.png" width="300">
<picture><source srcset="img/dark.png" media="(prefers-color-scheme: dark)"><img src="img/light.png"></picture>

## Installation
See [guide](docs/INSTALL.md), [section](#key-features), [site](https://cool.vercel.app) and [Live demo](https://demo.example.org).

## Danger
<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>
<iframe src="https://evil.example"></iframe><style>body{display:none}</style>
<a href="data:text/html,hi">d</a> <img src="data:image/png;base64,AAAA"> <a href="//evil.example">pr</a>
<h2 id="hijack" onclick="x()">Hijack</h2>
`;

test('readme: builds sections, highlights and excerpt from the README', () => {
  const r = processReadme(md, { owner: 'o', repo: 'r', branch: 'main', readmePath: 'docs/README.md' });
  assert.equal(r.title, 'Cool Tool');
  assert.deepEqual(r.sections.map((s) => s.kind), ['problem', 'features', 'demo', 'setup', 'other']);
  assert.match(r.excerpt, /^Cool Tool turns messy newsletters/);
  assert.match(r.highlights.problem, /40 minutes/);
  assert.deepEqual(r.highlights.features, ['Summarises 10+ sources', 'Sends to Telegram']);
});

test('readme: rewrites relative links/images against the README location', () => {
  const r = processReadme(md, { owner: 'o', repo: 'r', branch: 'main', readmePath: 'docs/README.md' });
  const html = r.sections.map((s) => s.html).join('');
  assert.match(html, /src="https:\/\/raw\.githubusercontent\.com\/o\/r\/main\/docs\/docs\/shot\.png"/);
  assert.match(html, /src="https:\/\/raw\.githubusercontent\.com\/o\/r\/main\/assets\/raw\.png"/);
  assert.match(html, /srcset="https:\/\/raw\.githubusercontent\.com\/o\/r\/main\/docs\/img\/dark\.png"/);
  assert.match(html, /href="https:\/\/github\.com\/o\/r\/blob\/main\/docs\/docs\/INSTALL\.md"/);
  assert.match(html, /href="#readme-key-features"/);
  assert.ok(r.images.every((u) => u.startsWith('https://raw.githubusercontent.com/')), 'badges excluded from images');
  assert.deepEqual(r.demoLinks.map((d) => d.url), ['https://cool.vercel.app/', 'https://demo.example.org/']);
});

test('readme: strips scripts, event handlers, dangerous URLs, iframes, styles and foreign ids', () => {
  const r = processReadme(md, { owner: 'o', repo: 'r', branch: 'main' });
  const html = [r.overviewHtml, ...r.sections.map((s) => s.html)].join('\n');
  for (const bad of [/<script/i, /onerror/i, /onclick/i, /javascript:/i, /<iframe/i, /<style/i, /data:text/i, /data:image/i, /\/\/evil\.example"/, /id="hijack"/]) {
    assert.doesNotMatch(html, bad);
  }
  assert.match(html, /target="_blank" rel="noopener noreferrer nofollow"/);
});

test('readme: resanitize is idempotent on stored HTML and still blocks injection', () => {
  const r = processReadme(md, { owner: 'o', repo: 'r', branch: 'main' });
  const once = r.sections[3].html;
  assert.equal(resanitize(once), resanitize(resanitize(once)));
  assert.match(resanitize(once), /href="#readme-key-features"/);
  assert.doesNotMatch(resanitize('<img src="x" onerror="a()"><script>1</script><a href="rel/path">r</a>'), /onerror|<script|href="rel/);
});

test('readme: handles empty, headingless and oversized input', () => {
  const empty = processReadme('', { owner: 'o', repo: 'r', branch: 'main' });
  assert.equal(empty.sections.length, 0);
  assert.equal(empty.excerpt, '');
  const flat = processReadme('Just a paragraph of text that is long enough to be an excerpt.', { owner: 'o', repo: 'r', branch: 'main' });
  assert.equal(flat.sections.length, 0);
  assert.match(flat.overviewHtml, /Just a paragraph/);
  const big = processReadme('# T\n\n' + 'word '.repeat(100000), { owner: 'o', repo: 'r', branch: 'main', maxBytes: 1000 });
  assert.equal(big.truncated, true);
});

test('readme: url resolver drops unsafe schemes and upgrades http images', () => {
  const resolve = makeUrlResolver({ owner: 'o', repo: 'r', branch: 'dev' });
  assert.equal(resolve('javascript:alert(1)'), null);
  assert.equal(resolve('vbscript:x'), null);
  assert.equal(resolve('http://x.com/a.png', 'image'), 'https://x.com/a.png');
  assert.equal(resolve('https://github.com/o/r/blob/dev/a.png', 'image'), 'https://raw.githubusercontent.com/o/r/dev/a.png');
  assert.equal(resolve('/root.md'), 'https://github.com/o/r/blob/dev/root.md');
  assert.equal(resolve('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(isBadgeUrl('https://img.shields.io/badge/x'), true);
  assert.equal(isBadgeUrl('https://github.com/o/r/actions/workflows/ci.yml/badge.svg'), true);
  assert.equal(classifySection('🚀 Getting Started'), 'setup');
});

/* ── Tech detection ──────────────────────────────────── */

test('tech: combines languages, manifests, files and topics without duplicates', () => {
  const tech = detectTech({
    languages: { Python: 9000, HTML: 1000, Dockerfile: 50 },
    topics: ['flask', 'machine-learning'],
    files: ['Dockerfile', 'requirements.txt', 'notebook.ipynb'],
    manifests: { 'requirements.txt': 'Flask==3.0\npandas>=2 # data\n-r other.txt\nscikit-learn[all]\n', 'package.json': '{"dependencies":{"react":"18"}}' },
    hasWorkflows: true,
  });
  const names = tech.map((t) => t.name);
  assert.deepEqual(names.slice(0, 2), ['Python', 'HTML']);
  for (const n of ['React', 'Flask', 'Pandas', 'scikit-learn', 'Docker', 'Jupyter Notebook', 'GitHub Actions', 'Machine Learning']) assert.ok(names.includes(n), n);
  assert.equal(names.filter((n) => n === 'Flask').length, 1);
  assert.deepEqual(parseRequirements('a==1\n# x\nB>=2; python_version>"3"\n'), ['a', 'b']);
  assert.deepEqual(parsePyproject('[project]\ndependencies = ["fastapi>=0.1", "uvicorn"]').sort(), ['fastapi', 'uvicorn']);
  assert.deepEqual(detectTech({ manifests: { 'package.json': '{not json' } }), []);
});

/* ── Achievements ────────────────────────────────────── */

const cfg = {
  github: { username: 'u' },
  achievements: { repoStarMilestones: [10, 25], repoForkMilestones: [5], totalStarMilestones: [10, 50], publicRepoMilestones: [2, 5], minStreakDays: 3, minLanguagesForBreadth: 2, maxItems: 20, maxPerType: 4 },
};
const proj = (o) => ({ id: 1, name: 'a', displayName: 'A', url: 'https://github.com/u/a', fork: false, stars: 0, forks: 0, releases: [], language: 'Python', createdAt: '2024-01-01T00:00:00Z', ...o });

test('achievements: rule-based, verifiable, stable observed dates', () => {
  const state = { firstSyncAt: '2026-01-01T00:00:00.000Z', milestones: {} };
  const projects = [
    proj({ id: 1, stars: 30, forks: 6, releases: [{ id: 5, tag: 'v1.0.0', name: 'v1.0.0', url: 'https://r', publishedAt: '2025-01-01T00:00:00Z', prerelease: false }] }),
    proj({ id: 2, name: 'b', displayName: 'B', language: 'Go', createdAt: '2025-02-01T00:00:00Z' }),
  ];
  const now = new Date('2026-01-01T00:00:00Z');
  const items = computeAchievements({ projects, profile: null, contributions: { available: true, days: [{ date: '2025-01-01', count: 1 }, { date: '2025-01-02', count: 2 }, { date: '2025-01-03', count: 1 }, { date: '2025-01-04', count: 0 }] }, external: { total: 0, items: [] }, state, config: cfg, now });
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes('stars:1:25'), 'only highest per-repo star milestone');
  assert.ok(!ids.includes('stars:1:10'));
  assert.ok(ids.includes('forks:1:5'));
  assert.ok(ids.includes('totalStars:10'));
  assert.ok(ids.includes('count:2'));
  assert.ok(ids.some((i) => i.startsWith('release:1:5')));
  assert.ok(ids.some((i) => i.startsWith('streak:')));
  assert.ok(ids.some((i) => i.startsWith('breadth:2')));
  assert.ok(!ids.some((i) => i.startsWith('external')), 'no contribution claim without data');
  for (const it of items) assert.match(it.url, /^https:\/\//);
  assert.match(items.find((i) => i.id === 'stars:1:25').when, /^Reached by/);
  // A later run keeps the first observed date
  const again = computeAchievements({ projects, profile: null, contributions: null, external: null, state, config: cfg, now: new Date('2026-05-01T00:00:00Z') });
  assert.equal(again.find((i) => i.id === 'stars:1:25').date, '2026-01-01T00:00:00.000Z');
  assert.ok(!again.some((i) => i.type === 'streak'));
});

test('achievements: caps per type and in total', () => {
  const state = { firstSyncAt: 'x', milestones: {} };
  const projects = Array.from({ length: 10 }, (_, i) => proj({ id: i + 1, name: `p${i}`, displayName: `P${i}`, stars: 12 }));
  const items = computeAchievements({ projects, profile: null, contributions: null, external: null, state, config: { ...cfg, achievements: { ...cfg.achievements, maxPerType: 2, maxItems: 5 } }, now: new Date() });
  assert.ok(items.filter((i) => i.type === 'stars').length <= 2);
  assert.ok(items.length <= 5);
});

test('achievements: longest streak', () => {
  const days = ['01', '02', '03', '05', '06'].map((d, i) => ({ date: `2025-01-${d}`, count: 1 })).concat([{ date: '2025-01-04', count: 0 }]);
  assert.deepEqual(longestStreak(days), { length: 3, start: '2025-01-01', end: '2025-01-03' });
});

/* ── Markers ─────────────────────────────────────────── */

test('markers: replace only inside the region; detect broken markers', () => {
  const html = 'A\n<!-- github-sync:x:start -->\nold\n<!-- github-sync:x:end -->\nB';
  assert.equal(replaceMarker(html, 'x', 'new'), 'A\n<!-- github-sync:x:start -->\nnew\n<!-- github-sync:x:end -->\nB');
  assert.equal(replaceMarker(replaceMarker(html, 'x', 'new'), 'x', 'new'), replaceMarker(html, 'x', 'new'));
  assert.throws(() => replaceMarker('nothing', 'x', 'y'), /not found/);
  assert.deepEqual(validateMarkers('<!-- github-sync:a:start -->'), ['marker a has 0 end markers']);
});

/* ── Rendering safety ────────────────────────────────── */

const evilProject = {
  id: 9, slug: 'evil', name: 'evil', displayName: '<img src=x onerror=alert(1)>', fullName: 'u/evil', url: 'https://github.com/u/evil',
  description: '"><script>alert(1)</script>', summary: '', category: '', topics: ['x"y'], language: 'Python', languages: [], tech: [{ name: '<b>T</b>', source: 'topic' }],
  license: null, stars: 1, forks: 0, archived: false, isTemplate: false, featured: false, pushedAt: '2025-01-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z',
  demo: { url: 'https://demo.example/?a=1&b="2"', source: 'homepage' }, image: { url: 'javascript:alert(1)', source: 'override' }, releases: [], latestRelease: null,
  readme: { path: 'README.md', htmlUrl: 'https://github.com/u/evil', overviewHtml: '<p>ok</p><script>bad()</script>', sections: [{ id: 'readme-a', title: 'A', kind: 'other', html: '<h2 id="readme-a">A</h2><img src="x" onerror="y">' }], highlights: { features: ['<i>f</i>'] }, excerpt: '' },
  readmeStatus: 'ok', hasIssues: true, openIssues: 0, defaultBranch: 'main', homepage: '',
};
const config = { github: { username: 'u' }, site: { url: 'https://u.github.io/site/', ownerName: 'Me', linkedin: '', email: 'a@b.c' } };

test('render: all repository-controlled text is escaped in cards and pages', () => {
  const card = renderProjectCard(evilProject);
  const page = renderProjectPage(evilProject, { template: '<html><head>{{head}}</head><body>{{main}}</body></html>', config, status: null });
  for (const html of [card, page]) {
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x onerror/);
    assert.doesNotMatch(html, /src="javascript:/);
    assert.doesNotMatch(html, /<b>T<\/b>/);
  }
  assert.doesNotMatch(page, /<script>bad/);
  assert.doesNotMatch(page, /onerror="y"/);
  assert.match(page, /<link rel="canonical" href="https:\/\/u\.github\.io\/site\/projects\/evil\.html">/);
  assert.match(page, /application\/ld\+json/);
  assert.doesNotMatch(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1], /</);
});

test('render: curated cards never guess a URL when the source repo is not public', () => {
  const html = renderCuratedLinks('Mybuddy', null);
  assert.match(html, /Source repository for Mybuddy is not publicly available/);
  assert.doesNotMatch(html, /<a\b|href=/i);
});

test('render: manual milestones reproduce the original timeline markup', () => {
  const html = renderManualMilestones([{ title: 'Award', org: '@Org', when: '2025', description: 'Won it.', url: '' }]);
  assert.match(html, /<h3>Award <span class="company">@Org<\/span><\/h3>/);
  assert.match(html, /<span class="time">2025<\/span>/);
  assert.match(html, /<p>Won it\.<\/p>/);
});

/* ── Misc helpers ────────────────────────────────────── */

test('eligibility, sorting and naming helpers', () => {
  const config2 = { github: { includeForks: false, includeArchived: false, excludeRepos: ['Skip', '42'], excludeTopics: ['hide'] } };
  const base = { id: 1, name: 'ok', fork: false, archived: false, topics: [] };
  assert.equal(eligibility(base, { config: config2, override: {} }), null);
  assert.equal(eligibility({ ...base, fork: true }, { config: config2, override: {} }), 'fork');
  assert.equal(eligibility({ ...base, archived: true }, { config: config2, override: {} }), 'archived');
  assert.equal(eligibility({ ...base, name: 'skip' }, { config: config2, override: {} }), 'config-exclude');
  assert.equal(eligibility({ ...base, id: 42 }, { config: config2, override: {} }), 'config-exclude');
  assert.equal(eligibility({ ...base, topics: ['hide'] }, { config: config2, override: {} }), 'topic-exclude');
  assert.equal(eligibility(base, { config: config2, override: { hidden: true } }), 'hidden');
  const sorted = sortProjects([
    { name: 'old', featured: false, archived: false, pushedAt: '2020' },
    { name: 'arch', featured: false, archived: true, pushedAt: '2030' },
    { name: 'new', featured: false, archived: false, pushedAt: '2025' },
    { name: 'feat2', featured: true, order: 2, pushedAt: '2000' },
    { name: 'feat1', featured: true, order: 1, pushedAt: '1999' },
  ]);
  assert.deepEqual(sorted.map((p) => p.name), ['feat1', 'feat2', 'new', 'old', 'arch']);
  assert.equal(prettyName('Movie_Recommender_System'), 'Movie Recommender System');
  assert.equal(prettyName('Fake-News-Detection-'), 'Fake-News-Detection');
  assert.equal(prettyName('AirTwin-X'), 'AirTwin-X');
  assert.equal(prettyName('cursor_bite'), 'Cursor Bite');
  assert.equal(prettyName('old-experiment'), 'Old Experiment');
  assert.equal(slugify('InternPilot-AI'), 'internpilot-ai');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(truncate('a b c d e f', 7), 'a b c…');
});

test('achievements: breadth ignores markup/notebook "languages"', () => {
  const state = { firstSyncAt: 'x', milestones: {} };
  const projects = [
    proj({ id: 1, language: 'Jupyter Notebook', languages: [{ name: 'Jupyter Notebook' }, { name: 'Python' }] }),
    proj({ id: 2, language: 'HTML', languages: [{ name: 'HTML' }, { name: 'CSS' }] }),
    proj({ id: 3, language: 'Python' }),
    proj({ id: 4, language: 'JavaScript' }),
  ];
  const items = computeAchievements({ projects, profile: null, contributions: null, external: null, state, config: { ...cfg, achievements: { ...cfg.achievements, minLanguagesForBreadth: 3 } }, now: new Date() });
  assert.ok(!items.some((i) => i.type === 'breadth'), 'Python + JavaScript only = 2 languages');
});
