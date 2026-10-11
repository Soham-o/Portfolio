// Data collection from the GitHub API. Read-only. Only public endpoints for a single user.
import { GitHubError } from './github.mjs';
import { MANIFESTS } from './tech.mjs';

/** All public repositories owned by `username`. Throws unless every page was fetched. */
export async function listPublicRepos(client, username) {
  const repos = await client.paginate(`/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&per_page=100`);
  // Defence in depth: the endpoint only returns public repos, but never trust a single check.
  return repos.filter((r) => r && r.private === false && (r.visibility === undefined || r.visibility === 'public'));
}

export function pickRepo(r) {
  return {
    id: r.id,
    nodeId: r.node_id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner?.login,
    htmlUrl: r.html_url,
    description: r.description || '',
    homepage: r.homepage || '',
    topics: Array.isArray(r.topics) ? r.topics : [],
    language: r.language || null,
    license: r.license && r.license.spdx_id && r.license.spdx_id !== 'NOASSERTION'
      ? { spdx: r.license.spdx_id, name: r.license.name }
      : r.license ? { spdx: null, name: r.license.name || 'Other' } : null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    watchers: r.subscribers_count ?? r.watchers_count ?? 0,
    openIssues: r.open_issues_count ?? 0,
    hasIssues: Boolean(r.has_issues),
    hasPages: Boolean(r.has_pages),
    hasWiki: Boolean(r.has_wiki),
    fork: Boolean(r.fork),
    archived: Boolean(r.archived),
    isTemplate: Boolean(r.is_template),
    defaultBranch: r.default_branch || 'main',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pushedAt: r.pushed_at,
    size: r.size ?? 0,
  };
}

function decodeBase64(content) {
  return Buffer.from(String(content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

/**
 * README, languages, root file list, manifests. Any non-404 failure throws so the caller can keep
 * the previously cached details instead of publishing partial data.
 */
export async function fetchRepoDetails(client, repo, { maxManifestBytes = 200000 } = {}) {
  const base = `/repos/${repo.owner}/${repo.name}`;

  const readmeRes = await client.request(`${base}/readme`, { allowStatus: [404] });
  let readme = null;
  if (readmeRes.status === 200 && readmeRes.data) {
    readme = {
      path: readmeRes.data.path || 'README.md',
      sha: readmeRes.data.sha,
      htmlUrl: readmeRes.data.html_url,
      content: readmeRes.data.encoding === 'base64' ? decodeBase64(readmeRes.data.content) : String(readmeRes.data.content || ''),
    };
  }

  const languages = (await client.request(`${base}/languages`, { allowStatus: [404] })).data || {};

  const rootRes = await client.request(`${base}/contents/?ref=${encodeURIComponent(repo.defaultBranch)}`, { allowStatus: [404] });
  const root = Array.isArray(rootRes.data) ? rootRes.data : [];
  const files = root.filter((e) => e.type === 'file').map((e) => e.name);
  const dirs = root.filter((e) => e.type === 'dir').map((e) => e.name);

  const manifests = {};
  for (const name of MANIFESTS) {
    const entry = root.find((e) => e.type === 'file' && e.name === name);
    if (!entry || entry.size > maxManifestBytes) continue;
    const res = await client.request(`${base}/contents/${encodeURIComponent(name)}?ref=${encodeURIComponent(repo.defaultBranch)}`, {
      allowStatus: [404],
      accept: 'application/vnd.github.raw+json',
      raw: true,
    });
    if (res.status === 200 && typeof res.data === 'string') manifests[name] = res.data;
  }

  let hasWorkflows = false;
  if (dirs.includes('.github')) {
    const wf = await client.request(`${base}/contents/.github/workflows?ref=${encodeURIComponent(repo.defaultBranch)}`, { allowStatus: [404] });
    hasWorkflows = Array.isArray(wf.data) && wf.data.some((e) => /\.ya?ml$/.test(e.name));
  }

  return { readme, languages, files, dirs, manifests, hasWorkflows };
}

export async function fetchReleases(client, repo) {
  const res = await client.request(`/repos/${repo.owner}/${repo.name}/releases?per_page=30`, { allowStatus: [404] });
  if (!Array.isArray(res.data)) return [];
  return res.data
    .filter((r) => !r.draft && r.published_at)
    .map((r) => ({
      id: r.id,
      tag: r.tag_name,
      name: r.name || r.tag_name,
      url: r.html_url,
      publishedAt: r.published_at,
      prerelease: Boolean(r.prerelease),
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * A repo vanished from the public listing. Find out why before removing anything.
 * Returns: 'gone' (deleted or private), 'moved' (transferred/redirected), 'present' (still public, keep), 'unknown' (error).
 */
export async function confirmRemoval(client, repo, username) {
  try {
    const res = await client.request(`/repositories/${repo.id}`, { allowStatus: [301, 302, 307, 404, 451], redirect: 'manual' });
    if (res.status === 404 || res.status === 451) return 'gone';
    if (res.status >= 300 && res.status < 400) return 'moved';
    const d = res.data;
    if (d && d.private === false && d.owner?.login?.toLowerCase() === username.toLowerCase()) return 'present';
    if (d && d.private) return 'gone';
    return 'moved';
  } catch (err) {
    if (err instanceof GitHubError) return 'unknown';
    throw err;
  }
}

export async function fetchProfile(client, username) {
  const u = await client.get(`/users/${encodeURIComponent(username)}`);
  return {
    login: u.login,
    name: u.name || u.login,
    bio: u.bio || '',
    avatarUrl: u.avatar_url,
    htmlUrl: u.html_url,
    blog: u.blog || '',
    location: u.location || '',
    company: u.company || '',
    twitter: u.twitter_username || '',
    followers: u.followers ?? 0,
    following: u.following ?? 0,
    publicRepos: u.public_repos ?? 0,
    publicGists: u.public_gists ?? 0,
    createdAt: u.created_at,
  };
}

const CONTRIB_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    repositoriesContributedTo(first: 50, includeUserRepositories: false, privacy: PUBLIC,
      contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW]) {
      totalCount
      nodes { nameWithOwner url stargazerCount isPrivate }
    }
  }
}`;

/** Contribution calendar (needs a token; GITHUB_TOKEN in Actions is enough). Returns null when unavailable. */
export async function fetchContributions(client, username) {
  if (!client.authenticated) return { available: false, reason: 'no-token' };
  const data = await client.graphql(CONTRIB_QUERY, { login: username });
  const c = data?.user?.contributionsCollection;
  if (!c) return { available: false, reason: 'not-found' };
  const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));
  const contributedTo = (data.user.repositoriesContributedTo?.nodes || [])
    .filter((n) => n && n.isPrivate === false)
    .map((n) => ({ nameWithOwner: n.nameWithOwner, url: n.url, stars: n.stargazerCount }));
  return {
    available: true,
    total: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    pullRequests: c.totalPullRequestContributions,
    issues: c.totalIssueContributions,
    reviews: c.totalPullRequestReviewContributions,
    days,
    contributedTo,
  };
}

/** Merged pull requests the user authored in repositories they don't own (public search). */
export async function fetchExternalPullRequests(client, username) {
  const q = encodeURIComponent(`type:pr is:merged is:public author:${username} -user:${username}`);
  const d = await client.get(`/search/issues?q=${q}&sort=updated&order=desc&per_page=50`);
  const items = (d.items || []).map((i) => {
    const m = String(i.repository_url || '').match(/repos\/([^/]+\/[^/]+)$/);
    return {
      title: i.title,
      url: i.html_url,
      repo: m ? m[1] : null,
      mergedAt: i.pull_request?.merged_at || i.closed_at,
    };
  }).filter((i) => i.repo);
  return { total: d.total_count ?? items.length, items };
}
