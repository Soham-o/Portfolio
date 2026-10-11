// In-memory fake of the GitHub REST/GraphQL endpoints used by tools/sync.
// Usable as a fetch implementation (unit tests) or as a real HTTP server (end-to-end CLI test).
import http from 'node:http';

export function makeWorld(overrides = {}) {
  const user = {
    login: 'Soham-o', name: 'Soham Panda', bio: 'AI Automation Engineer', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
    html_url: 'https://github.com/Soham-o', blog: '', location: 'India', company: null, twitter_username: null,
    followers: 12, following: 3, public_repos: 0, public_gists: 0, created_at: '2023-01-10T10:00:00Z',
  };
  const repo = (o) => ({
    owner: 'Soham-o', private: false, fork: false, archived: false, is_template: false, description: '', topics: [],
    language: 'Python', stargazers_count: 0, forks_count: 0, subscribers_count: 1, open_issues_count: 0, has_issues: true,
    has_pages: false, has_wiki: false, homepage: '', default_branch: 'main', license: null, size: 100,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z', pushed_at: '2024-06-01T00:00:00Z',
    readme: null, languages: { Python: 1000 }, files: {}, dirs: [], workflows: false, releases: [],
    ...o,
  });
  const repos = [
    repo({
      id: 101, name: 'Task_Manager', language: 'JavaScript', description: 'Simple task manager web app',
      languages: { JavaScript: 5000, HTML: 3000, CSS: 2000 }, created_at: '2024-02-01T00:00:00Z', pushed_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z', has_pages: true,
      readme: { path: 'README.md', content: '# Task Manager\n\nA clean task manager that lets you add, complete and clear tasks without reloads.\n\n## Features\n- Add tasks\n- Complete tasks\n- Clear completed\n\n![UI](screenshots/ui.png)\n' },
    }),
    repo({
      id: 102, name: 'PersonaLearn', description: 'Adaptive learning with ML', topics: ['machine-learning', 'streamlit'],
      stargazers_count: 11, created_at: '2024-04-01T00:00:00Z', pushed_at: '2025-01-15T00:00:00Z', updated_at: '2025-01-15T00:00:00Z',
      files: { 'requirements.txt': 'streamlit==1.30\npandas>=2\nscikit-learn\n# comment\n' },
      readme: { path: 'README.md', content: '# PersonaLearn\n\nPersonaLearn adapts learning content to each learner using behaviour signals.\n\n## Problem\nOne-size-fits-all courses lose most learners within the first week of study.\n\n## Installation\n```bash\npip install -r requirements.txt\n```\n' },
    }),
    repo({
      id: 103, name: 'InternPilot-AI', description: 'Autonomous internship discovery with LLM scam detection',
      topics: ['github-actions', 'groq', 'telegram-bot'], stargazers_count: 27, forks_count: 6,
      created_at: '2024-08-10T00:00:00Z', pushed_at: '2025-09-01T00:00:00Z', updated_at: '2025-09-01T00:00:00Z',
      homepage: 'https://internpilot.example.com', license: { spdx_id: 'MIT', name: 'MIT License' },
      files: { 'requirements.txt': 'requests\nbeautifulsoup4\ngroq\npython-telegram-bot\n' }, dirs: ['.github', 'docs'], workflows: true,
      languages: { Python: 9000, Shell: 100 },
      readme: { path: 'README.md', content: '<p align="center"><img src="https://img.shields.io/badge/python-3.11-blue"></p>\n\n# InternPilot AI\n\nInternPilot AI finds internships across five platforms, removes duplicates and flags scams before sending a daily Telegram digest.\n\n## Why\nSearching five sites every day wastes hours and still misses good roles.\n\n## Features\n- Multi-source scraping\n- Fuzzy de-duplication\n- LLM scam detection\n\n## Architecture\n![Architecture](docs/arch.png)\n\nSee [the docs](docs/README.md) and [setup](#setup).\n\n## Setup\n```bash\npip install -r requirements.txt\n```\n\n## License\nMIT\n' },
      releases: [
        { id: 9001, tag_name: 'v0.9.0', name: 'Beta', draft: false, prerelease: true, published_at: '2025-02-01T00:00:00Z', html_url: 'https://github.com/Soham-o/InternPilot-AI/releases/tag/v0.9.0' },
        { id: 9002, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false, published_at: '2025-03-01T00:00:00Z', html_url: 'https://github.com/Soham-o/InternPilot-AI/releases/tag/v1.0.0' },
        { id: 9003, tag_name: 'v2.0.0', name: 'Two', draft: false, prerelease: false, published_at: '2025-08-01T00:00:00Z', html_url: 'https://github.com/Soham-o/InternPilot-AI/releases/tag/v2.0.0' },
        { id: 9004, tag_name: 'v3.0.0', name: 'Draft', draft: true, prerelease: false, published_at: null, html_url: 'x' },
      ],
    }),
    repo({
      id: 104, name: 'newsletter-digest', language: 'Python', description: '',
      created_at: '2025-05-01T00:00:00Z', pushed_at: '2025-05-02T00:00:00Z', updated_at: '2025-05-02T00:00:00Z', readme: null,
    }),
    repo({ id: 105, name: 'some-fork', fork: true, description: 'A fork', created_at: '2024-01-05T00:00:00Z' }),
    repo({ id: 106, name: 'Soham-o', description: 'Profile README', language: null, created_at: '2023-02-01T00:00:00Z' }),
    repo({ id: 107, name: 'old-experiment', archived: true, language: 'Java', description: 'Archived Java experiment', languages: { Java: 4000 }, created_at: '2023-06-01T00:00:00Z', pushed_at: '2023-07-01T00:00:00Z', updated_at: '2023-07-01T00:00:00Z' }),
    repo({ id: 199, name: 'secret-client-work', private: true, visibility: 'private', description: 'CONFIDENTIAL client project', readme: { path: 'README.md', content: '# Secret\nCONFIDENTIAL' } }),
  ];
  const days = [];
  const start = new Date('2025-10-12T00:00:00Z');
  for (let i = 0; i < 364; i += 1) {
    const d = new Date(start.getTime() + i * 864e5);
    days.push({ date: d.toISOString().slice(0, 10), contributionCount: i >= 300 && i < 312 ? 3 : i % 5 === 0 ? 1 : 0 });
  }
  return {
    user,
    repos,
    contributions: { days, available: true },
    externalPRs: [{ title: 'Fix typo in docs', html_url: 'https://github.com/other/lib/pull/5', repository_url: 'https://api.github.com/repos/other/lib', pull_request: { merged_at: '2025-07-01T00:00:00Z' }, closed_at: '2025-07-01T00:00:00Z' }],
    transferred: {}, // id -> new owner
    failures: [],    // { match: RegExp, status, times, headers, body }
    pageSize: 3,
    log: [],
    ...overrides,
  };
}

function apiRepo(r) {
  const { readme, languages, files, dirs, workflows, releases, owner, license, ...rest } = r;
  return {
    ...rest,
    full_name: `${owner}/${r.name}`,
    html_url: `https://github.com/${owner}/${r.name}`,
    owner: { login: owner },
    node_id: `R_${r.id}`,
    visibility: r.private ? 'private' : 'public',
    watchers_count: r.subscribers_count,
    license: license ? { spdx_id: license.spdx_id, name: license.name } : null,
  };
}

export function handle(world, method, rawUrl, headers = {}, body = null) {
  const url = new URL(rawUrl, 'http://mock.local');
  const p = url.pathname;
  world.log.push(`${method} ${p}${url.search}`);

  for (const f of world.failures) {
    if (f.match.test(`${method} ${p}${url.search}`) && (f.times === undefined || f.times > 0)) {
      if (f.times !== undefined) f.times -= 1;
      return { status: f.status, headers: f.headers || {}, body: f.body ?? { message: 'Injected failure' } };
    }
  }

  const scopeHeader = world.oauthScopes !== undefined ? { 'x-oauth-scopes': world.oauthScopes } : {};
  const json = (status, data, extra = {}) => ({ status, headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '9999999999', ...scopeHeader, ...extra }, body: data });
  const owner = world.user.login;
  const find = (o, n) => world.repos.find((r) => r.owner.toLowerCase() === o.toLowerCase() && r.name.toLowerCase() === n.toLowerCase() && !r.private);
  let m;

  if ((m = p.match(/^\/users\/([^/]+)\/repos$/))) {
    if (m[1].toLowerCase() !== owner.toLowerCase()) return json(404, { message: 'Not Found' });
    // The real endpoint never returns private repos to other users; we deliberately include them
    // when `leakPrivate` is set to prove the client-side filter works.
    const visible = world.repos.filter((r) => r.owner === owner && (!r.private || world.leakPrivate));
    const page = Number(url.searchParams.get('page') || 1);
    const size = world.pageSize;
    const slice = visible.slice((page - 1) * size, page * size);
    const extra = {};
    if (page * size < visible.length) {
      const next = new URL(rawUrl, 'http://mock.local');
      next.searchParams.set('page', String(page + 1));
      extra.link = `<${world.baseUrl || 'http://mock.local'}${next.pathname}${next.search}>; rel="next"`;
    }
    return json(200, slice.map(apiRepo), extra);
  }
  if ((m = p.match(/^\/users\/([^/]+)$/))) {
    if (m[1].toLowerCase() !== owner.toLowerCase()) return json(404, { message: 'Not Found' });
    return json(200, { ...world.user, public_repos: world.repos.filter((r) => !r.private).length });
  }
  if ((m = p.match(/^\/repositories\/(\d+)$/))) {
    const r = world.repos.find((x) => String(x.id) === m[1]);
    if (!r || r.private) return json(404, { message: 'Not Found' });
    return json(200, apiRepo(r));
  }
  if ((m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/readme$/))) {
    const r = find(m[1], m[2]);
    if (!r || !r.readme) return json(404, { message: 'Not Found' });
    return json(200, {
      path: r.readme.path, sha: `sha-${r.id}`, encoding: 'base64',
      html_url: `https://github.com/${r.owner}/${r.name}/blob/${r.default_branch}/${r.readme.path}`,
      content: Buffer.from(r.readme.content).toString('base64').replace(/(.{60})/g, '$1\n'),
    });
  }
  if ((m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/languages$/))) {
    const r = find(m[1], m[2]);
    return r ? json(200, r.languages) : json(404, { message: 'Not Found' });
  }
  if ((m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/releases$/))) {
    const r = find(m[1], m[2]);
    return r ? json(200, r.releases) : json(404, { message: 'Not Found' });
  }
  if ((m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/?(.*)$/))) {
    const r = find(m[1], m[2]);
    if (!r) return json(404, { message: 'Not Found' });
    const sub = decodeURIComponent(m[3] || '');
    if (sub === '') {
      const list = [
        ...(r.readme ? [{ type: 'file', name: r.readme.path, size: r.readme.content.length }] : []),
        ...Object.entries(r.files).map(([name, c]) => ({ type: 'file', name, size: c.length })),
        ...r.dirs.map((name) => ({ type: 'dir', name })),
      ];
      return json(200, list);
    }
    if (sub === '.github/workflows') return r.workflows ? json(200, [{ type: 'file', name: 'ci.yml' }]) : json(404, { message: 'Not Found' });
    if (r.files[sub] !== undefined) return { status: 200, headers: { 'content-type': 'text/plain' }, body: r.files[sub], raw: true };
    return json(404, { message: 'Not Found' });
  }
  if (p === '/graphql' && method === 'POST') {
    if (!headers.authorization && !headers.Authorization) return json(401, { message: 'Requires authentication' });
    const c = world.contributions;
    if (!c.available) return json(200, { data: { user: null } });
    const weeks = [];
    for (let i = 0; i < c.days.length; i += 7) weeks.push({ contributionDays: c.days.slice(i, i + 7) });
    const total = c.days.reduce((a, d) => a + d.contributionCount, 0);
    return json(200, {
      data: {
        user: {
          contributionsCollection: {
            totalCommitContributions: total, totalPullRequestContributions: 1, totalIssueContributions: 0, totalPullRequestReviewContributions: 0,
            contributionCalendar: { totalContributions: total, weeks },
          },
          repositoriesContributedTo: { totalCount: 1, nodes: [{ nameWithOwner: 'other/lib', url: 'https://github.com/other/lib', stargazerCount: 50, isPrivate: false }, { nameWithOwner: 'corp/private', url: 'x', stargazerCount: 0, isPrivate: true }] },
        },
      },
    });
  }
  if (p === '/search/issues') {
    return json(200, { total_count: world.externalPRs.length, items: world.externalPRs });
  }
  return json(404, { message: `Mock: no route for ${method} ${p}` });
}

/** fetch-compatible implementation backed by the world. */
export function mockFetch(world) {
  return async (url, init = {}) => {
    if (world.networkDown) throw new TypeError('fetch failed');
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const res = handle(world, init.method || 'GET', url, headers, init.body);
    const body = res.raw ? res.body : JSON.stringify(res.body);
    return new Response(res.status === 204 ? null : body, { status: res.status, headers: res.headers });
  };
}

/** Start a real HTTP server for end-to-end tests. Resolves to { url, close }. */
export function startServer(world) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        const out = handle(world, req.method, req.url, req.headers, data);
        res.writeHead(out.status, out.headers);
        res.end(out.raw ? out.body : JSON.stringify(out.body));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      world.baseUrl = `http://127.0.0.1:${port}`;
      resolve({ url: world.baseUrl, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
