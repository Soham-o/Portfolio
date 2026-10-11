// Load and validate the hand-maintained content/ files. The sync only ever reads these.
import path from 'node:path';
import { readJson, safeUrl } from './util.mjs';

const DEFAULTS = {
  github: { username: null, includeForks: false, includeArchived: true, excludeRepos: [], excludeTopics: [], requireDescriptionOrReadme: false },
  site: { url: '', ownerName: '', linkedin: '', email: '' },
  sync: {
    staleAfterHours: 36, heartbeatHours: 24, fullRefreshHours: 24, maxReadmeBytes: 300000, maxManifestBytes: 200000,
    fetchContributions: true, fetchExternalContributions: true,
  },
  achievements: {
    repoStarMilestones: [10, 25, 50, 100, 250, 500, 1000], repoForkMilestones: [5, 10, 25, 50, 100],
    totalStarMilestones: [10, 25, 50, 100, 250, 500, 1000], publicRepoMilestones: [5, 10, 25, 50, 100],
    minStreakDays: 7, minLanguagesForBreadth: 3, maxItems: 12, maxPerType: 4, minStarsToShow: 10,
  },
};

export function paths(root) {
  return {
    root,
    config: path.join(root, 'content/portfolio.config.json'),
    overrides: path.join(root, 'content/projects.overrides.json'),
    manualAchievements: path.join(root, 'content/achievements.json'),
    dataDir: path.join(root, 'data'),
    state: path.join(root, 'data/state.json'),
    cacheDir: path.join(root, 'data/cache/repos'),
    projectsJson: path.join(root, 'data/projects.json'),
    profileJson: path.join(root, 'data/profile.json'),
    achievementsJson: path.join(root, 'data/achievements.json'),
    historyJson: path.join(root, 'data/stats-history.json'),
    statusJson: path.join(root, 'data/sync-status.json'),
    projectsHtml: path.join(root, 'projects.html'),
    journeyHtml: path.join(root, 'journey.html'),
    projectPagesDir: path.join(root, 'projects'),
    projectTemplate: path.join(root, 'templates/project.html'),
    sitemap: path.join(root, 'sitemap.xml'),
    lock: path.join(root, 'data/.sync.lock'),
  };
}

export async function loadContent(root, env = process.env) {
  const p = paths(root);
  const raw = await readJson(p.config);
  if (!raw) throw new Error(`Missing ${p.config}`);
  const config = {
    github: { ...DEFAULTS.github, ...raw.github },
    site: { ...DEFAULTS.site, ...raw.site },
    sync: { ...DEFAULTS.sync, ...raw.sync },
    achievements: { ...DEFAULTS.achievements, ...raw.achievements },
  };
  if (env.PORTFOLIO_GITHUB_USERNAME) config.github.username = env.PORTFOLIO_GITHUB_USERNAME;
  if (env.SITE_URL && safeUrl(env.SITE_URL)) config.site.url = env.SITE_URL;
  if (!config.site.url.endsWith('/') && config.site.url) config.site.url += '/';
  validateConfig(config);

  const overridesRaw = (await readJson(p.overrides, { projects: {} })) || { projects: {} };
  const overrides = {};
  for (const [name, o] of Object.entries(overridesRaw.projects || {})) {
    if (!o || typeof o !== 'object') throw new Error(`Override for "${name}" must be an object`);
    if (o.demo && !safeUrl(o.demo)) throw new Error(`Override for "${name}": demo must be an http(s) URL`);
    overrides[name.toLowerCase()] = o;
  }

  const manualRaw = (await readJson(p.manualAchievements, { items: [] })) || { items: [] };
  if (!Array.isArray(manualRaw.items)) throw new Error('content/achievements.json: "items" must be an array');
  const manualAchievements = manualRaw.items.map((it, i) => {
    if (!it || typeof it.title !== 'string' || !it.title.trim()) throw new Error(`content/achievements.json item ${i}: "title" is required`);
    if (it.url && !safeUrl(it.url)) throw new Error(`content/achievements.json item ${i}: url must be http(s)`);
    return { title: it.title, org: it.org || '', when: it.when || '', description: it.description || '', url: it.url || '' };
  });

  return { config, overrides, manualAchievements, paths: p };
}

export function validateConfig(config) {
  const u = config.github.username;
  if (!u || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(u)) throw new Error(`Invalid github.username: ${u}`);
  for (const k of ['excludeRepos', 'excludeTopics']) {
    if (!Array.isArray(config.github[k])) throw new Error(`github.${k} must be an array`);
  }
  for (const k of ['staleAfterHours', 'heartbeatHours', 'fullRefreshHours', 'maxReadmeBytes']) {
    if (typeof config.sync[k] !== 'number' || config.sync[k] <= 0) throw new Error(`sync.${k} must be a positive number`);
  }
}

/** Look up overrides by current name or any previous name of the repo. */
export function overrideFor(overrides, names) {
  for (const n of names) {
    const o = overrides[String(n).toLowerCase()];
    if (o) return o;
  }
  return {};
}
