// Orchestrates one synchronization run. Pure-ish: computes everything first, returns the files to write.
// Nothing is written unless discovery fully succeeded and the rendered output validates.
import path from 'node:path';
import { loadContent, overrideFor } from './config.mjs';
import {
  listPublicRepos, pickRepo, fetchRepoDetails, fetchReleases, confirmRemoval, fetchProfile,
  fetchContributions, fetchExternalPullRequests,
} from './collect.mjs';
import { processReadme } from './readme.mjs';
import { detectTech } from './tech.mjs';
import { computeAchievements } from './achievements.mjs';
import { chooseSummary } from './summary.mjs';
import { renderAll } from './render.mjs';
import { writeCapableScopes } from './github.mjs';
import { readJson, readText, stableJson, sha256, slugify, hoursBetween, safeUrl, dayKey, noopLogger } from './util.mjs';

export const PROCESSOR_VERSION = 5; // bump to force re-processing of cached READMEs
export const RENDER_VERSION = 3;    // bump when render.mjs output changes, to force a republish
const STATE_VERSION = 1;

export function emptyState() {
  return { version: STATE_VERSION, repos: {}, milestones: {}, firstSyncAt: null, lastFullRefreshAt: null };
}

export function eligibility(repo, { config, override }) {
  const g = config.github;
  const lowerName = repo.name.toLowerCase();
  if (repo.fork && !g.includeForks) return 'fork';
  if (repo.archived && !g.includeArchived) return 'archived';
  if (g.excludeRepos.some((x) => String(x).toLowerCase() === lowerName || String(x) === String(repo.id))) return 'config-exclude';
  if (repo.topics.some((t) => g.excludeTopics.includes(t))) return 'topic-exclude';
  if (override.hidden) return 'hidden';
  return null;
}

function uniqueSlug(base, id, takenBy) {
  const owner = takenBy.get(base);
  if (!owner || owner === id) return base;
  return `${base}-${id}`;
}

function chooseDemo(repo, override, readme) {
  if (override.demo && safeUrl(override.demo)) return { url: safeUrl(override.demo), source: 'override' };
  if (repo.homepage && safeUrl(repo.homepage)) return { url: safeUrl(repo.homepage), source: 'homepage' };
  if (repo.hasPages) {
    const owner = repo.owner.toLowerCase();
    const url = repo.name.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo.name}/`;
    return { url, source: 'pages' };
  }
  if (readme?.demoLinks?.length) return { url: readme.demoLinks[0].url, source: 'readme' };
  return null;
}

function chooseImage(repo, override, readme) {
  if (override.image) return { url: override.image, source: 'override' };
  if (readme?.firstImage) return { url: readme.firstImage, source: 'readme' };
  // GitHub's generated social preview: available for every public repository.
  const v = sha256(`${repo.fullName}:${repo.pushedAt}`).slice(0, 16);
  return { url: `https://opengraph.githubassets.com/${v}/${repo.fullName}`, source: 'social' };
}

function languagePercentages(languages) {
  const total = Object.values(languages || {}).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, bytes, pct: Math.round((bytes / total) * 1000) / 10 }));
}

/** GitHub order: most recently pushed first, like the "Last updated" sort on a GitHub profile. */
export function sortProjects(list) {
  return [...list].sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt))
    || String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name));
}

/** A self-running system: tagged on GitHub with an autonomous topic, or marked in the overrides. */
export function isAutonomous(repo, override, config) {
  if (typeof override.autonomous === 'boolean') return override.autonomous;
  const topics = (config.github.autonomousTopics || []).map((t) => String(t).toLowerCase());
  return (repo.topics || []).some((t) => topics.includes(String(t).toLowerCase()));
}

/**
 * Run a sync. Returns { files: Map<absPath, string>, deletes: string[], publish: boolean, summary, status }.
 */
export async function runSync({ root, client, now = new Date(), logger = noopLogger, full = false, env = process.env, renderOnly = false }) {
  const { config, overrides, manualAchievements, paths } = await loadContent(root, env);
  const state = (await readJson(paths.state, emptyState())) || emptyState();
  const prevStatus = (await readJson(paths.statusJson, {})) || {};
  const prevProjects = (await readJson(paths.projectsJson, { projects: [] }))?.projects || [];
  const prevProfile = await readJson(paths.profileJson, null);
  const prevHistory = (await readJson(paths.historyJson, { snapshots: [] })) || { snapshots: [] };
  const prevAchievements = await readJson(paths.achievementsJson, null);
  const nowIso = now.toISOString();
  const username = config.github.username;
  const warnings = [];
  const components = {};

  if (renderOnly) {
    // Re-render pages from the committed data without touching the API (used after template edits).
    const model = {
      projects: prevProjects, profile: prevProfile?.profile ?? null, stats: prevProfile?.stats ?? null,
      contributions: prevProfile?.contributions ?? null, external: prevProfile?.external ?? null,
      achievements: prevAchievements?.items ?? [], manualAchievements, history: prevHistory.snapshots,
      status: prevStatus, removedSlugs: [], redirects: redirectsFrom(state), minStarsToShow: config.achievements.minStarsToShow,
    };
    const out = await renderAll({ root, paths, config, model, now });
    return { files: out.files, deletes: out.deletes, publish: true, summary: { renderOnly: true }, status: prevStatus };
  }

  const fullRefresh = Boolean(full) || !state.lastFullRefreshAt
    || hoursBetween(state.lastFullRefreshAt, nowIso) >= config.sync.fullRefreshHours;
  if (!state.firstSyncAt) state.firstSyncAt = nowIso;

  // ── 1. Discovery (must fully succeed; otherwise we abort and keep the live site untouched)
  const listed = (await listPublicRepos(client, username)).map(pickRepo)
    .filter((r) => r.owner && r.owner.toLowerCase() === username.toLowerCase());
  logger.info(`Discovered ${listed.length} public repositories for ${username}`);
  const risky = writeCapableScopes(client.oauthScopes);
  if (risky.length) {
    throw new Error(`Refusing to sync with a token that has write-capable scopes (${risky.join(', ')}). `
      + 'Use a fine-grained token with public read-only access, or no PORTFOLIO_SYNC_TOKEN at all.');
  }

  // ── 2. Identity: stable repo IDs, rename tracking, stable slugs
  const takenBy = new Map();
  for (const [id, s] of Object.entries(state.repos)) if (s.status === 'active' && s.slug) takenBy.set(s.slug, id);
  const summary = { discovered: listed.length, added: [], updated: [], renamed: [], removed: [], excluded: [], unchanged: 0, detailFetches: 0, detailFailures: 0 };

  const eligible = [];
  for (const repo of listed) {
    const id = String(repo.id);
    let s = state.repos[id];

    if (!s) {
      s = state.repos[id] = {
        id: repo.id, name: repo.name, fullName: repo.fullName, slug: null, slugHistory: [], nameHistory: [],
        firstSeenAt: nowIso, status: 'new',
      };
    } else if (s.name !== repo.name) {
      s.nameHistory = [...new Set([s.name, ...(s.nameHistory || [])])].filter((n) => n !== repo.name);
      summary.renamed.push({ id: repo.id, from: s.name, to: repo.name });
      logger.info(`Rename detected: ${s.name} → ${repo.name} (id ${repo.id})`);
      s.name = repo.name;
      s.fullName = repo.fullName;
      const newSlug = uniqueSlug(slugify(repo.name), id, takenBy);
      if (s.slug && newSlug !== s.slug) {
        s.slugHistory = [...new Set([s.slug, ...(s.slugHistory || [])])].filter((x) => x !== newSlug);
        takenBy.delete(s.slug);
        s.slug = newSlug;
        takenBy.set(newSlug, id);
      }
    }
    s.fullName = repo.fullName;
    // Overrides are matched by current *or* previous names, so renames keep their settings.
    const names = [repo.name, ...(s.nameHistory || [])];
    const override = overrideFor(overrides, names);
    const reason = eligibility(repo, { config, override });

    if (reason) {
      if (s.status === 'active') summary.excluded.push({ id: repo.id, name: repo.name, reason });
      if (s.slug && takenBy.get(s.slug) === id) takenBy.delete(s.slug);
      s.status = 'excluded';
      s.excludedReason = reason;
      continue;
    }
    if (!s.slug || takenBy.get(s.slug) !== id) {
      const slug = s.slug && !takenBy.has(s.slug) ? s.slug : uniqueSlug(slugify(repo.name), id, takenBy);
      s.slug = slug;
      takenBy.set(slug, id);
    }
    if (s.status !== 'active') {
      if (s.status === 'new') summary.added.push({ id: repo.id, name: repo.name });
      else summary.added.push({ id: repo.id, name: repo.name, returning: true });
    }
    s.status = 'active';
    delete s.excludedReason;
    delete s.removedAt;
    delete s.removedReason;
    // A historical slug now owned by this repo can't also be a redirect for another one
    for (const [oid, os] of Object.entries(state.repos)) {
      if (oid !== id && os.slugHistory?.includes(s.slug)) os.slugHistory = os.slugHistory.filter((x) => x !== s.slug);
    }
    eligible.push({ repo, s, override, names });
  }

  // ── 3. Details (incremental) + releases
  const projects = [];
  for (const { repo, s, override, names } of eligible) {
    const cacheFile = path.join(paths.cacheDir, `${repo.id}.json`);
    const cache = await readJson(cacheFile, null);
    const needsDetails = fullRefresh || !cache || cache.processorVersion !== PROCESSOR_VERSION
      || cache.pushedAt !== repo.pushedAt || cache.updatedAt !== repo.updatedAt
      || cache.defaultBranch !== repo.defaultBranch || cache.name !== repo.name || cache.failed;
    let details = cache?.details ?? null;
    let detailsStale = false;
    let newCache = cache;

    if (needsDetails) {
      summary.detailFetches += 1;
      try {
        const raw = await fetchRepoDetails(client, repo, { maxManifestBytes: config.sync.maxManifestBytes });
        const readme = raw.readme
          ? {
            path: raw.readme.path, sha: raw.readme.sha, htmlUrl: raw.readme.htmlUrl,
            ...processReadme(raw.readme.content, {
              owner: repo.owner, repo: repo.name, branch: repo.defaultBranch, readmePath: raw.readme.path,
              maxBytes: config.sync.maxReadmeBytes,
            }),
          }
          : null;
        details = {
          readme,
          languages: raw.languages,
          tech: detectTech({ languages: raw.languages, topics: repo.topics, files: raw.files, manifests: raw.manifests, hasWorkflows: raw.hasWorkflows }),
        };
        newCache = {
          id: repo.id, name: repo.name, processorVersion: PROCESSOR_VERSION, pushedAt: repo.pushedAt,
          updatedAt: repo.updatedAt, defaultBranch: repo.defaultBranch, fetchedAt: nowIso, details,
          releases: cache?.releases ?? [],
        };
      } catch (err) {
        summary.detailFailures += 1;
        warnings.push(`Details for ${repo.fullName} could not be refreshed (${err.message}); keeping previous data.`);
        logger.warn(`details ${repo.fullName}: ${err.message}`);
        detailsStale = true;
        if (!cache) newCache = { id: repo.id, name: repo.name, failed: true, processorVersion: PROCESSOR_VERSION, releases: [] };
      }
    }

    let releases = newCache?.releases ?? cache?.releases ?? [];
    try {
      releases = await fetchReleases(client, repo);
      newCache = { ...(newCache || {}), releases };
    } catch (err) {
      warnings.push(`Releases for ${repo.fullName} could not be refreshed (${err.message}); keeping previous data.`);
      detailsStale = true;
    }
    s._cache = newCache;
    s._cacheFile = cacheFile;
    s.lastSeenAt = nowIso;

    if (details && config.github.requireDescriptionOrReadme && !override.featured && !repo.description && !details.readme) {
      summary.excluded.push({ id: repo.id, name: repo.name, reason: 'no-description-or-readme' });
      s.status = 'excluded';
      s.excludedReason = 'no-description-or-readme';
      continue;
    }

    const readme = details?.readme ?? null;
    const prev = prevProjects.find((p) => String(p.id) === String(repo.id));
    const project = {
      id: repo.id,
      slug: s.slug,
      name: repo.name,
      displayName: override.title || prettyName(repo.name),
      fullName: repo.fullName,
      owner: repo.owner,
      url: repo.htmlUrl,
      description: repo.description,
      summary: override.summary || '',
      ...(() => { const c = chooseSummary({ override, description: repo.description, name: repo.name, readme }); return { summaryText: c.text, summarySource: c.source }; })(),
      category: override.category || '',
      featured: Boolean(override.featured),
      curated: Boolean(override.curated),
      autonomous: isAutonomous(repo, override, config),
      order: typeof override.order === 'number' ? override.order : null,
      topics: repo.topics,
      language: repo.language,
      languages: languagePercentages(details?.languages),
      tech: details?.tech ?? (repo.language ? [{ name: repo.language, source: 'language' }] : []),
      license: repo.license,
      stars: repo.stars,
      forks: repo.forks,
      watchers: repo.watchers,
      openIssues: repo.openIssues,
      hasIssues: repo.hasIssues,
      archived: repo.archived,
      isTemplate: repo.isTemplate,
      fork: repo.fork,
      defaultBranch: repo.defaultBranch,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      pushedAt: repo.pushedAt,
      homepage: safeUrl(repo.homepage) || '',
      demo: chooseDemo(repo, override, readme),
      image: chooseImage(repo, override, readme),
      releases: releases.slice(0, 15),
      latestRelease: releases.find((r) => !r.prerelease) || releases[0] || null,
      readmeStatus: readme ? 'ok' : details ? 'missing' : 'unavailable',
      readme: readme
        ? {
          path: readme.path, htmlUrl: readme.htmlUrl, overviewHtml: readme.overviewHtml, sections: readme.sections,
          highlights: readme.highlights, excerpt: readme.excerpt, truncated: readme.truncated, demoLinks: readme.demoLinks,
          summary: readme.summary || '', summaryFrom: readme.summaryFrom || '', tagline: readme.tagline || '',
          images: readme.images.slice(0, 12),
        }
        : null,
      nameHistory: s.nameHistory || [],
      stale: detailsStale || undefined,
    };
    if (!prev) { /* added, already recorded */ } else if (JSON.stringify(stripVolatile(prev)) !== JSON.stringify(stripVolatile(project))) {
      summary.updated.push({ id: repo.id, name: repo.name });
    } else {
      summary.unchanged += 1;
    }
    projects.push(project);
  }

  // ── 4. Repos that vanished from the public listing
  const listedIds = new Set(listed.map((r) => String(r.id)));
  for (const [id, s] of Object.entries(state.repos)) {
    if (listedIds.has(id) || s.status !== 'active') continue;
    const verdict = await confirmRemoval(client, { id, fullName: s.fullName }, username);
    if (verdict === 'gone' || verdict === 'moved') {
      logger.info(`Removing ${s.fullName} (${verdict === 'gone' ? 'deleted or made private' : 'transferred'})`);
      summary.removed.push({ id: Number(id), name: s.name, reason: verdict });
      s.status = 'removed';
      s.removedAt = nowIso;
      s.removedReason = verdict;
      s._deleteCache = path.join(paths.cacheDir, `${id}.json`);
    } else {
      // Not confirmed — keep the last published version rather than risk erasing valid data.
      const prev = prevProjects.find((p) => String(p.id) === id);
      if (prev) projects.push({ ...prev, stale: true });
      warnings.push(`${s.fullName} missing from listing but not confirmed removed (${verdict}); kept previous data.`);
    }
  }

  // ── 5. Profile, contributions, external contributions (each optional; fall back to previous values)
  let profile = prevProfile?.profile ?? null;
  try {
    profile = await fetchProfile(client, username);
    components.profile = 'ok';
  } catch (err) {
    components.profile = profile ? 'stale' : 'unavailable';
    warnings.push(`Profile not refreshed: ${err.message}`);
  }

  let contributions = prevProfile?.contributions ?? null;
  if (config.sync.fetchContributions) {
    try {
      const c = await fetchContributions(client, username);
      if (c.available) { contributions = c; components.contributions = 'ok'; } else {
        components.contributions = contributions?.available ? 'stale' : 'unavailable';
        if (!contributions?.available) contributions = c;
        warnings.push(`Contribution calendar unavailable (${c.reason}).`);
      }
    } catch (err) {
      components.contributions = contributions?.available ? 'stale' : 'unavailable';
      warnings.push(`Contributions not refreshed: ${err.message}`);
    }
  }

  let external = prevProfile?.external ?? null;
  if (config.sync.fetchExternalContributions) {
    try {
      external = await fetchExternalPullRequests(client, username);
      components.external = 'ok';
    } catch (err) {
      components.external = external ? 'stale' : 'unavailable';
      warnings.push(`External pull requests not refreshed: ${err.message}`);
    }
  }

  const sorted = sortProjects(projects);
  const stats = computeStats(sorted, profile, contributions);

  // ── 6. History (one snapshot per UTC day)
  const today = dayKey(nowIso);
  const snapshots = (prevHistory.snapshots || []).filter((x) => x.date !== today);
  snapshots.push({ date: today, repos: stats.projects, stars: stats.stars, forks: stats.forks, followers: profile?.followers ?? null });
  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  const history = snapshots.slice(-730);

  // ── 7. Achievements (verifiable, rule-based)
  const achievements = computeAchievements({ projects: sorted, profile, contributions, external, state, config, now });

  // ── 8. Publish decision: only write when meaningful content changed or a heartbeat is due
  const template = await readText(paths.projectTemplate, '');
  const contentHash = sha256(JSON.stringify({
    p: sorted.map(stripVolatile), profile, stats, c: contributions, e: external, a: achievements,
    m: manualAchievements, r: redirectsFrom(state), site: config.site, tpl: sha256(template),
    v: RENDER_VERSION,
  }));
  const changed = contentHash !== prevStatus.contentHash;
  const heartbeatDue = !prevStatus.lastPublishedAt || hoursBetween(prevStatus.lastPublishedAt, nowIso) >= config.sync.heartbeatHours;
  const publish = changed || heartbeatDue || fullRefresh;
  if (fullRefresh) state.lastFullRefreshAt = nowIso;

  const status = {
    lastSuccessAt: nowIso,
    lastPublishedAt: publish ? nowIso : prevStatus.lastPublishedAt,
    contentHash,
    mode: fullRefresh ? 'full' : 'incremental',
    authenticated: client.authenticated,
    repoCount: sorted.length,
    components,
    warnings,
    staleAfterHours: config.sync.staleAfterHours,
    apiRequests: client.requestCount,
    rateLimit: client.rate,
  };

  const model = {
    projects: sorted, profile, stats, contributions, external, achievements, manualAchievements, history, status,
    minStarsToShow: config.achievements.minStarsToShow,
    removedSlugs: summary.removed.flatMap((r) => { const s = state.repos[String(r.id)]; return [s.slug, ...(s.slugHistory || [])]; }),
    excludedSlugs: Object.values(state.repos).filter((s) => s.status === 'excluded' && s.slug).flatMap((s) => [s.slug, ...(s.slugHistory || [])]),
    redirects: redirectsFrom(state),
  };

  const out = await renderAll({ root, paths, config, model, now });
  const files = out.files;

  // Data files + per-repo caches + state
  const cleanState = { ...state, repos: {} };
  for (const [id, s] of Object.entries(state.repos)) {
    const { _cache, _cacheFile, _deleteCache, ...rest } = s;
    cleanState.repos[id] = rest;
    if (_cache && _cacheFile) files.set(_cacheFile, stableJson(_cache));
    if (_deleteCache) out.deletes.push(_deleteCache);
  }
  files.set(paths.state, stableJson(cleanState));
  files.set(paths.projectsJson, stableJson({ generatedAt: nowIso, username, projects: sorted }));
  files.set(paths.profileJson, stableJson({ generatedAt: nowIso, profile, stats, contributions, external }));
  files.set(paths.achievementsJson, stableJson({ generatedAt: nowIso, rules: 'See docs/AUTOMATION.md#achievements', items: achievements }));
  files.set(paths.historyJson, stableJson({ snapshots: history }));
  files.set(paths.statusJson, stableJson(status));

  return { files, deletes: out.deletes, publish, changed, summary, status, warnings };
}

export function computeStats(projects, profile, contributions) {
  const owned = projects.filter((p) => !p.fork);
  const langBytes = {};
  for (const p of owned) for (const l of p.languages || []) langBytes[l.name] = (langBytes[l.name] || 0) + l.bytes;
  const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0);
  const langs = Object.entries(langBytes).filter(([, b]) => totalBytes && b / totalBytes >= 0.001).sort((a, b) => b[1] - a[1]);
  const top = langs.slice(0, 7).map(([name, bytes]) => ({ name, pct: Math.round((bytes / totalBytes) * 1000) / 10 }));
  const rest = totalBytes - langs.slice(0, 7).reduce((a, [, b]) => a + b, 0);
  if (rest / totalBytes >= 0.001) top.push({ name: 'Other', pct: Math.round((rest / totalBytes) * 1000) / 10 });
  const primaryCounts = {};
  for (const p of owned) if (p.language) primaryCounts[p.language] = (primaryCounts[p.language] || 0) + 1;
  return {
    projects: owned.length,
    stars: owned.reduce((a, p) => a + (p.stars || 0), 0),
    forks: owned.reduce((a, p) => a + (p.forks || 0), 0),
    releases: owned.reduce((a, p) => a + (p.releases?.length || 0), 0),
    followers: profile?.followers ?? null,
    contributionsLastYear: contributions?.available ? contributions.total : null,
    languages: totalBytes ? top : [],
    primaryLanguages: primaryCounts,
  };
}

function redirectsFrom(state) {
  const r = [];
  for (const s of Object.values(state.repos)) {
    if (s.status !== 'active') continue;
    for (const old of s.slugHistory || []) if (old !== s.slug) r.push({ from: old, to: s.slug, name: s.name });
  }
  return r;
}

export function stripVolatile(p) {
  const { stale, ...rest } = p;
  return rest;
}

export function prettyName(name) {
  // Underscores become spaces ("Movie_Recommender_System" → "Movie Recommender System").
  // All-lowercase names are title-cased ("old-experiment" → "Old Experiment"); names the owner styled
  // with capitals keep their hyphens ("AirTwin-X", "InternPilot-AI"). Use an override "title" to rename.
  const trimmed = name.replace(/^[-_.\s]+|[-_.\s]+$/g, '') || name;
  const lower = trimmed === trimmed.toLowerCase();
  let out = trimmed.replace(/_+/g, ' ');
  if (lower) out = out.replace(/-+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return out.replace(/\s+/g, ' ').trim();
}
