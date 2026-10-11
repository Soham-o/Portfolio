// Rule-based achievements derived only from verifiable public GitHub data.
// Every item links to where it can be checked. Nothing is inferred beyond the numbers the API returns.
import { fmtMonth, fmtDate } from './util.mjs';

function highestReached(value, thresholds) {
  let best = null;
  for (const t of [...thresholds].sort((a, b) => a - b)) if (value >= t) best = t;
  return best;
}

/** Records the first time the sync observed a milestone, so dates stay stable across runs. */
function observe(state, key, nowIso) {
  state.milestones ||= {};
  if (!state.milestones[key]) {
    const initial = !state.firstSyncAt || state.firstSyncAt === nowIso;
    state.milestones[key] = { observedAt: nowIso, initial };
  }
  return state.milestones[key];
}

function observedLabel(obs) {
  return obs.initial ? `Reached by ${fmtMonth(obs.observedAt)}` : fmtMonth(obs.observedAt);
}

export function longestStreak(days) {
  let best = { length: 0, start: null, end: null };
  let cur = { length: 0, start: null };
  for (const d of [...(days || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.count > 0) {
      if (cur.length === 0) cur.start = d.date;
      cur.length += 1;
      if (cur.length > best.length) best = { length: cur.length, start: cur.start, end: d.date };
    } else {
      cur = { length: 0, start: null };
    }
  }
  return best;
}

function isMajorTag(tag) {
  const m = String(tag).match(/^v?(\d+)\.0(?:\.0)?$/i);
  return m && Number(m[1]) >= 1;
}

export function computeAchievements({ projects, profile, contributions, external, state, config, now }) {
  const cfg = config.achievements;
  const nowIso = now.toISOString();
  const owned = projects.filter((p) => !p.fork);
  const items = [];
  const user = config.github.username;

  // 1. First public project + featured project launches (dated by repository creation)
  const byCreated = [...owned].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (byCreated.length) {
    const first = byCreated[0];
    items.push({
      id: `launch:first:${first.id}`, type: 'launch', title: 'First Public Project', org: `— ${first.displayName}`,
      date: first.createdAt, when: `${fmtMonth(first.createdAt)} · Launch`,
      description: `${first.displayName} became the earliest repository in this portfolio, created ${fmtDate(first.createdAt)}.`,
      url: first.url,
    });
  }
  for (const p of owned.filter((x) => x.featured && x.id !== byCreated[0]?.id)) {
    items.push({
      id: `launch:${p.id}`, type: 'launch', title: p.displayName, org: '— Launched', date: p.createdAt,
      when: `${fmtMonth(p.createdAt)} · Launch`,
      description: p.description || `Repository created ${fmtDate(p.createdAt)}.`, url: p.url,
    });
  }

  // 2. Releases: first stable release per project, plus later major versions
  for (const p of owned) {
    const stable = [...(p.releases || [])].filter((r) => !r.prerelease).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    if (!stable.length) continue;
    const first = stable[0];
    items.push({
      id: `release:${p.id}:${first.id}`, type: 'release', title: `${p.displayName} ${first.tag}`, org: '— First Release',
      date: first.publishedAt, when: `${fmtDate(first.publishedAt)} · Release`,
      description: `Published the first release of ${p.displayName}${first.name && first.name !== first.tag ? ` (“${first.name}”)` : ''}.`,
      url: first.url,
    });
    for (const r of stable.slice(1).filter((x) => isMajorTag(x.tag))) {
      items.push({
        id: `release:${p.id}:${r.id}`, type: 'release', title: `${p.displayName} ${r.tag}`, org: '— Major Release',
        date: r.publishedAt, when: `${fmtDate(r.publishedAt)} · Release`,
        description: `Shipped major version ${r.tag} of ${p.displayName}.`, url: r.url,
      });
    }
  }

  // 3. Per-project adoption (stars / forks): only the highest milestone reached per project
  for (const p of owned) {
    const s = highestReached(p.stars, cfg.repoStarMilestones);
    if (s) {
      const obs = observe(state, `repoStars:${p.id}:${s}`, nowIso);
      items.push({
        id: `stars:${p.id}:${s}`, type: 'stars', title: `${p.displayName}`, org: `— ${s}+ Stars`,
        date: obs.observedAt, when: observedLabel(obs),
        description: `${p.displayName} has ${p.stars} stars on GitHub.`, url: `${p.url}/stargazers`,
      });
    }
    const f = highestReached(p.forks, cfg.repoForkMilestones);
    if (f) {
      const obs = observe(state, `repoForks:${p.id}:${f}`, nowIso);
      items.push({
        id: `forks:${p.id}:${f}`, type: 'forks', title: `${p.displayName}`, org: `— ${f}+ Forks`,
        date: obs.observedAt, when: observedLabel(obs),
        description: `${p.forks} developers have forked ${p.displayName} to build on it.`, url: `${p.url}/forks`,
      });
    }
  }

  // 4. Total stars across projects
  const totalStars = owned.reduce((a, p) => a + p.stars, 0);
  const ts = highestReached(totalStars, cfg.totalStarMilestones);
  if (ts) {
    const obs = observe(state, `totalStars:${ts}`, nowIso);
    items.push({
      id: `totalStars:${ts}`, type: 'total-stars', title: `${ts}+ Stars`, org: '— Across Projects', date: obs.observedAt,
      when: observedLabel(obs), description: `Public projects have earned ${totalStars} stars in total.`,
      url: `https://github.com/${user}?tab=repositories&sort=stargazers`,
    });
  }

  // 5. Number of public projects (dated by the creation of the Nth project — verifiable)
  const pc = highestReached(byCreated.length, cfg.publicRepoMilestones);
  if (pc) {
    const nth = byCreated[pc - 1];
    items.push({
      id: `count:${pc}`, type: 'count', title: `${pc} Public Projects`, org: '— Milestone', date: nth.createdAt,
      when: fmtMonth(nth.createdAt), description: `Reached ${pc} public projects with ${nth.displayName}.`,
      url: `https://github.com/${user}?tab=repositories`,
    });
  }

  // 6. Technical breadth: distinct primary languages across projects
  const seenLangs = [];
  let breadthDate = null;
  for (const p of byCreated) {
    if (p.language && !seenLangs.includes(p.language)) { seenLangs.push(p.language); breadthDate = p.createdAt; }
  }
  if (seenLangs.length >= cfg.minLanguagesForBreadth) {
    items.push({
      id: `breadth:${seenLangs.length}`, type: 'breadth', title: `Projects in ${seenLangs.length} Languages`, org: '— Breadth',
      date: breadthDate, when: fmtMonth(breadthDate),
      description: `Primary languages across public projects: ${seenLangs.join(', ')}.`,
      url: `https://github.com/${user}?tab=repositories`,
    });
  }

  // 7. Consistency: longest contribution streak in the past year (requires calendar data)
  if (contributions?.available) {
    const st = longestStreak(contributions.days);
    if (st.length >= cfg.minStreakDays) {
      items.push({
        id: `streak:${st.start}:${st.length}`, type: 'streak', title: `${st.length}-Day Streak`, org: '— Consistency',
        date: `${st.end}T00:00:00Z`, when: `${fmtDate(st.start)} – ${fmtDate(st.end)}`,
        description: `Contributed on GitHub ${st.length} days in a row — the longest run in the past year.`,
        url: profile?.htmlUrl || `https://github.com/${user}`,
      });
    }
  }

  // 8. Contributions to other people's public projects (merged pull requests)
  if (external && external.total > 0) {
    const repos = [...new Set(external.items.map((i) => i.repo))];
    const latest = external.items.map((i) => i.mergedAt).filter(Boolean).sort().pop() || null;
    items.push({
      id: `external:${external.total}`, type: 'external', title: 'Open Source Contributions',
      org: `— ${external.total} Merged PR${external.total === 1 ? '' : 's'}`, date: latest,
      when: latest ? `Latest ${fmtMonth(latest)}` : '',
      description: `Pull requests merged into ${repos.length} public project${repos.length === 1 ? '' : 's'} owned by others${repos.length ? `, including ${repos.slice(0, 3).join(', ')}` : ''}.`,
      url: `https://github.com/search?q=${encodeURIComponent(`type:pr is:merged author:${user} -user:${user}`)}&type=pullrequests`,
    });
  }

  // Order newest first, keep the list varied and short
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const perType = {};
  const out = [];
  for (const it of items) {
    perType[it.type] = (perType[it.type] || 0) + 1;
    if (perType[it.type] > cfg.maxPerType) continue;
    out.push(it);
    if (out.length >= cfg.maxItems) break;
  }
  return out;
}
