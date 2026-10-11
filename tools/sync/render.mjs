// Renders synced data into the existing static pages (between github-sync markers) and into
// generated project pages. Uses the site's existing CSS classes so the design stays consistent.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { esc, safeUrl, fmtMonth, fmtDate, truncate, formatCount, readText } from './util.mjs';
import { replaceMarker, listMarkers } from './markers.mjs';
import { longestStreak } from './achievements.mjs';
import { resanitize } from './readme.mjs';

const GENERATOR_META = '<meta name="generator" content="github-sync">';

/* ─────────────────────────── helpers ─────────────────────────── */

function pageHref(slug, prefix = '') {
  return `${prefix}projects/${encodeURIComponent(slug)}.html`;
}

function assetUrl(url, prefix) {
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return safeUrl(url);
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null;
  return prefix + url.replace(/^\.?\//, '');
}

function absoluteSiteUrl(siteUrl, rel) {
  if (!siteUrl) return null;
  try { return new URL(rel, siteUrl).href; } catch { return null; }
}

function cardDescription(p) {
  // summaryText is chosen during sync (override → meaningful description → README summary → fallback)
  return p.summaryText || p.summary || p.description || p.readme?.excerpt || 'No description provided on GitHub yet.';
}

function categoryLabel(p) {
  const parts = [p.category || p.language || 'Repository'];
  if (p.archived) parts.push('Archived');
  if (p.isTemplate) parts.push('Template');
  return parts.join(' · ');
}

function techKeys(p) {
  const keys = new Set();
  for (const t of p.tech || []) keys.add(t.name.toLowerCase());
  for (const t of p.topics || []) keys.add(t.toLowerCase());
  if (p.language) keys.add(p.language.toLowerCase());
  return [...keys];
}

function techTags(p, max = 6) {
  const tags = (p.tech || []).slice(0, max).map((t) => `<span class="tech-tag">${esc(t.name)}</span>`);
  return tags.length ? `<div class="tech-tags">${tags.join('')}</div>` : '';
}

function metaLine(p) {
  const bits = [];
  bits.push(`<span title="Stars"><i class="fas fa-star" aria-hidden="true"></i> ${formatCount(p.stars)}<span class="visually-hidden"> stars</span></span>`);
  bits.push(`<span title="Forks"><i class="fas fa-code-branch" aria-hidden="true"></i> ${formatCount(p.forks)}<span class="visually-hidden"> forks</span></span>`);
  if (p.latestRelease) bits.push(`<span title="Latest release"><i class="fas fa-tag" aria-hidden="true"></i> ${esc(p.latestRelease.tag)}</span>`);
  bits.push(`<span>Updated ${esc(fmtMonth(p.pushedAt))}</span>`);
  return `<p class="sync-meta">${bits.join('')}</p>`;
}

function linksBlock(p, prefix, indent) {
  const demo = p.demo ? `\n${indent}    <a href="${esc(p.demo.url)}" target="_blank" rel="noopener" aria-label="Live demo of ${esc(p.displayName)}"><i class="fas fa-arrow-up-right-from-square"></i></a>` : '';
  return `${indent}<div class="fp-links">
${indent}    <a href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="${esc(p.displayName)} on GitHub"><i class="fab fa-github"></i></a>${demo}
${indent}    <a href="${esc(pageHref(p.slug, prefix))}" class="btn-visit">View Project</a>
${indent}</div>`;
}

/* ───────────────────────── projects.html ───────────────────────── */

export function renderProjectCard(p, prefix = '') {
  const img = assetUrl(p.image?.url, prefix);
  const href = esc(pageHref(p.slug, prefix));
  const data = [
    `data-name="${esc(`${p.displayName} ${p.name} ${p.description} ${(p.topics || []).join(' ')} ${p.summary} ${p.summarySource === 'none' ? '' : p.summaryText || ''}`.toLowerCase())}"`,
    `data-tech="${esc(techKeys(p).join('|'))}"`,
    `data-stars="${p.stars}"`,
    `data-updated="${esc(p.pushedAt)}"`,
    `data-created="${esc(p.createdAt)}"`,
    `data-featured="${p.featured ? 1 : 0}"`,
  ].join(' ');

  if (p.featured) {
    const hl = p.readme?.highlights || {};
    const cells = [];
    if (hl.problem) cells.push(['Problem', hl.problem]);
    if (hl.features?.length) cells.push(['Key Features', hl.features.slice(0, 3).join(' · ')]);
    cells.push(['Status', [p.archived ? 'Archived' : 'Active', p.latestRelease ? `Latest ${p.latestRelease.tag}` : null, `Updated ${fmtMonth(p.pushedAt)}`].filter(Boolean).join(' · ')]);
    return `            <div class="col-12 sync-card" ${data}>
                <article class="featured-project">
                    <div class="card-bg"></div>
${img ? `                    <a class="fp-image" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" data-sync-img></a>\n` : ''}                    <div class="fp-content">
                        <span class="fp-type">${esc(categoryLabel(p))}</span>
                        <a href="${href}" class="fp-title"><h2>${esc(p.displayName)}</h2></a>
                        <p class="fp-desc">${esc(truncate(cardDescription(p), 420))}</p>
                        <div class="case-grid">
${cells.map(([l, v]) => `                            <div class="case-cell">
                                <span class="case-label">${esc(l)}</span>
                                <span class="case-val">${esc(truncate(v, 220))}</span>
                            </div>`).join('\n')}
                        </div>
                        ${techTags(p, 8)}
                        ${metaLine(p)}
${linksBlock(p, prefix, '                        ')}
                    </div>
                </article>
            </div>`;
  }

  return `            <div class="col-6 sync-card" ${data}>
                <article class="small-project">
                    <div class="card-bg"></div>
${img ? `                    <a class="sp-image" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" data-sync-img></a>\n` : ''}                    <div class="sp-content">
                        <span class="fp-type">${esc(categoryLabel(p))}</span>
                        <a href="${href}" class="fp-title"><h2>${esc(p.displayName)}</h2></a>
                        <p class="fp-desc">${esc(truncate(cardDescription(p), 240))}</p>
                        ${techTags(p, 5)}
                        ${metaLine(p)}
${linksBlock(p, prefix, '                        ')}
                    </div>
                </article>
            </div>`;
}

function syncStatusLine(status, extraClass = '') {
  if (!status?.lastPublishedAt) {
    return `<p class="sync-status ${extraClass}" data-sync-status><span class="sync-dot" aria-hidden="true"></span><span class="sync-status-text">Waiting for the first GitHub sync</span></p>`;
  }
  const degraded = Object.values(status.components || {}).some((v) => v !== 'ok') || (status.warnings || []).length > 0;
  return `<p class="sync-status ${extraClass}${degraded ? ' is-partial' : ''}" data-sync-status data-synced-at="${esc(status.lastPublishedAt)}" data-stale-after="${esc(status.staleAfterHours ?? 36)}"><span class="sync-dot" aria-hidden="true"></span><span class="sync-status-text">GitHub data synced ${esc(fmtDate(status.lastPublishedAt))}${degraded ? ' · some sources used cached data' : ''}</span></p>`;
}

export function renderProjectsSection(model) {
  const auto = model.projects.filter((p) => !p.curated);
  const counts = new Map();
  for (const p of auto) {
    const keys = new Set([p.language, ...(p.tech || []).filter((t) => t.source !== 'language').slice(0, 4).map((t) => t.name)].filter(Boolean));
    for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const chips = [...counts.entries()].filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  const showTools = auto.length >= 3;

  const cards = auto.map((p) => renderProjectCard(p)).join('\n\n');
  const empty = model.status?.lastPublishedAt
    ? 'No additional public repositories yet — new public repositories appear here automatically.'
    : 'Public repositories will appear here automatically after the first GitHub sync.';

  return `        <section class="sync-projects" id="all-projects" aria-labelledby="all-projects-title">
            <div class="sync-projects-head">
                <h2 class="section-heading" id="all-projects-title">Everything Else I've Shipped</h2>
                <p class="projects-subtitle">Every public repository on my GitHub, pulled in automatically — each with its own detail page built from the README.</p>
                ${syncStatusLine(model.status)}
            </div>
${showTools ? `            <div class="sync-toolbar" role="search">
                <label class="visually-hidden" for="sync-search">Search projects</label>
                <input id="sync-search" class="sync-search" type="search" placeholder="Search projects, topics, tech…" autocomplete="off">
                <label class="visually-hidden" for="sync-sort">Sort projects</label>
                <select id="sync-sort" class="sync-select">
                    <option value="default">Featured first</option>
                    <option value="updated">Recently updated</option>
                    <option value="stars">Most stars</option>
                    <option value="newest">Newest</option>
                </select>
            </div>
            <div class="skills-wrapper sync-filters" role="group" aria-label="Filter by technology">
                <button type="button" class="skill-item sync-filter is-active" data-filter="all" aria-pressed="true">All <span class="sync-count">${auto.length}</span></button>
${chips.map(([name, n]) => `                <button type="button" class="skill-item sync-filter" data-filter="${esc(name.toLowerCase())}" aria-pressed="false">${esc(name)} <span class="sync-count">${n}</span></button>`).join('\n')}
            </div>
` : ''}            <div class="projects-grid sync-grid" id="sync-grid">
${cards}
            </div>
            <p class="sync-empty"${auto.length ? ' hidden' : ''} data-sync-empty>${esc(auto.length ? 'No projects match that search.' : empty)}</p>
        </section>`;
}

export function renderCuratedLinks(name, project, config) {
  const indent = '                        ';
  if (!project) {
    const url = `https://github.com/${config.github.username}/${name}`;
    return `${indent}<div class="fp-links">
${indent}    <a href="${esc(url)}" target="_blank"><i class="fab fa-github"></i></a>
${indent}    <a href="${esc(url)}" target="_blank" class="btn-visit">View Project</a>
${indent}</div>`;
  }
  return linksBlock(project, '', indent);
}

/* ───────────────────────── journey.html ───────────────────────── */

export function renderManualMilestones(items) {
  return items.map((it) => `                <ul class="timeline-list">
                    <li class="timeline-item">
                        <div class="li-icon"><div class="inner-dot"></div></div>
                        <div class="timeline-content">
                            <h3>${esc(it.title)}${it.org ? ` <span class="company">${esc(it.org)}</span>` : ''}</h3>
                            ${it.when ? `<span class="time">${esc(it.when)}</span>` : ''}
                            <p>${esc(it.description)}</p>${it.url ? `
                            <a class="sync-verify" href="${esc(it.url)}" target="_blank" rel="noopener">View →</a>` : ''}
                        </div>
                    </li>
                </ul>`).join('\n\n');
}

function heatmapSvg(days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return '';
  const nonzero = sorted.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  const q = (f) => nonzero.length ? nonzero[Math.min(nonzero.length - 1, Math.floor(f * nonzero.length))] : 0;
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const level = (c) => (c <= 0 ? 0 : c <= t1 ? 1 : c <= t2 ? 2 : c <= t3 ? 3 : 4);
  const cell = 11, gap = 3, top = 16;
  const firstDow = new Date(`${sorted[0].date}T00:00:00Z`).getUTCDay();
  const rects = [];
  const months = [];
  let lastMonth = -1;
  sorted.forEach((d, i) => {
    const idx = i + firstDow;
    const col = Math.floor(idx / 7);
    const row = idx % 7;
    const dt = new Date(`${d.date}T00:00:00Z`);
    if (row === 0 || i === 0) {
      const m = dt.getUTCMonth();
      if (m !== lastMonth && dt.getUTCDate() <= 7 && col <= (sorted.length + firstDow) / 7 - 2) { months.push({ col, m }); lastMonth = m; }
    }
    rects.push(`<rect x="${col * (cell + gap)}" y="${top + row * (cell + gap)}" width="${cell}" height="${cell}" rx="2" class="hm-l${level(d.count)}"><title>${d.count} contribution${d.count === 1 ? '' : 's'} on ${esc(fmtDate(d.date))}</title></rect>`);
  });
  const cols = Math.floor((sorted.length - 1 + firstDow) / 7) + 1;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels = months.map(({ col, m }) => `<text x="${col * (cell + gap)}" y="10" class="hm-label">${MONTHS[m]}</text>`);
  const w = cols * (cell + gap) - gap;
  const h = top + 7 * (cell + gap) - gap;
  return `<svg class="sync-heatmap" viewBox="0 0 ${w} ${h}" role="img" aria-label="Contribution calendar for the past year">${labels.join('')}${rects.join('')}</svg>`;
}

function sparkline(history, key) {
  const pts = history.filter((s) => typeof s[key] === 'number');
  if (pts.length < 3) return '';
  const vals = pts.map((s) => s[key]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = 220, h = 44;
  const xy = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`);
  return `<svg class="sync-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${xy.join(' ')}" /></svg>`;
}

function recentActivity(projects, max = 6) {
  const events = [];
  for (const p of projects) {
    for (const r of (p.releases || []).slice(0, 3)) events.push({ date: r.publishedAt, icon: 'fa-tag', html: `Released <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.tag)}</a> of <a href="${esc(pageHref(p.slug))}">${esc(p.displayName)}</a>`, repo: p.id, kind: 'release' });
    events.push({ date: p.createdAt, icon: 'fa-plus', html: `Created <a href="${esc(pageHref(p.slug))}">${esc(p.displayName)}</a>`, repo: p.id, kind: 'create' });
    if (p.pushedAt && (!p.createdAt || new Date(p.pushedAt) - new Date(p.createdAt) > 864e5)) {
      events.push({ date: p.pushedAt, icon: 'fa-code-commit', html: `Pushed updates to <a href="${esc(pageHref(p.slug))}">${esc(p.displayName)}</a>`, repo: p.id, kind: 'push' });
    }
  }
  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const seenPush = new Set();
  const out = [];
  for (const e of events) {
    if (e.kind === 'push') { if (seenPush.has(e.repo)) continue; seenPush.add(e.repo); }
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

export function renderGithubSection(model) {
  const { stats, contributions, history = [], achievements = [], status, profile, projects = [] } = model;
  if (!status?.lastPublishedAt || !stats) {
    return `        <div class="sync-github" id="built-in-public">
            <h2 class="section-heading">Built in Public</h2>
            ${syncStatusLine(status, 'is-centered')}
        </div>`;
  }

  const statItems = [];
  const minStars = model.minStarsToShow ?? 10;
  statItems.push([formatCount(stats.projects), 'Public Projects']);
  if (stats.stars >= minStars) statItems.push([formatCount(stats.stars), 'GitHub Stars']);
  if (stats.forks >= 5) statItems.push([formatCount(stats.forks), 'Forks']);
  if (stats.followers != null && statItems.length < 3) statItems.push([formatCount(stats.followers), 'GitHub Followers']);
  if (stats.contributionsLastYear != null) statItems.push([formatCount(stats.contributionsLastYear), 'Contributions · Past Year']);
  else if (stats.releases > 0) statItems.push([formatCount(stats.releases), 'Releases Published']);
  const strip = statItems.map(([n, l]) => `                <div class="hstat">
                    <span class="hstat-num">${esc(n)}</span>
                    <span class="hstat-label">${esc(l)}</span>
                </div>`).join('\n                <div class="hstat-divider"></div>\n');

  const langs = stats.languages?.length
    ? stats.languages.map((l) => `                        <li class="sync-lang"><span class="sync-lang-name">${esc(l.name)}</span><span class="sync-lang-bar"><span style="width:${Math.max(1, Math.min(100, l.pct))}%"></span></span><span class="sync-lang-pct">${esc(l.pct)}%</span></li>`).join('\n')
    : '                        <li class="sync-unavailable">Language data is not available yet.</li>';

  let contrib;
  if (contributions?.available) {
    const st = longestStreak(contributions.days);
    contrib = `${heatmapSvg(contributions.days)}
                    <p class="sync-caption">${esc(formatCount(contributions.total))} contributions in the past year${st.length ? ` · longest streak ${st.length} day${st.length === 1 ? '' : 's'}` : ''}</p>`;
  } else {
    contrib = `<p class="sync-unavailable">Contribution calendar unavailable in the latest sync${contributions?.reason === 'no-token' ? ' (it needs the workflow token)' : ''}. No numbers are shown rather than estimates.</p>`;
  }

  const activity = recentActivity(projects);
  const activityHtml = activity.length
    ? activity.map((e) => `                    <li><i class="fas ${e.icon}" aria-hidden="true"></i><span class="sync-activity-text">${e.html}</span><time datetime="${esc(e.date)}">${esc(fmtDate(e.date))}</time></li>`).join('\n')
    : '                    <li class="sync-unavailable">No public activity yet.</li>';

  const sparkStars = sparkline(history, 'stars');
  const sparkRepos = sparkline(history, 'repos');
  const growth = sparkStars || sparkRepos
    ? `
            <div class="sync-panel sync-growth">
                <h3 class="skills-cat-label">Growth since tracking began (${esc(fmtDate(history[0].date))})</h3>
                <div class="sync-growth-row">
                    ${sparkStars ? `<figure>${sparkStars}<figcaption>Stars · ${esc(history[0].stars)} → ${esc(history[history.length - 1].stars)}</figcaption></figure>` : ''}
                    ${sparkRepos ? `<figure>${sparkRepos}<figcaption>Projects · ${esc(history[0].repos)} → ${esc(history[history.length - 1].repos)}</figcaption></figure>` : ''}
                </div>
            </div>`
    : '';

  const timeline = achievements.length
    ? achievements.map((a) => `                <ul class="timeline-list">
                    <li class="timeline-item">
                        <div class="li-icon"><div class="inner-dot"></div></div>
                        <div class="timeline-content">
                            <h3>${esc(a.title)} <span class="company">${esc(a.org)}</span></h3>
                            <span class="time">${esc(a.when)}</span>
                            <p>${esc(a.description)}</p>
                            <a class="sync-verify" href="${esc(a.url)}" target="_blank" rel="noopener">Verify on GitHub →</a>
                        </div>
                    </li>
                </ul>`).join('\n\n')
    : '                <p class="sync-unavailable">GitHub milestones will appear here as they are reached.</p>';

  return `        <div class="sync-github" id="built-in-public">
            <h2 class="section-heading">Built in Public</h2>
            <p class="projects-subtitle">Live numbers from my public GitHub${profile?.htmlUrl ? ` (<a href="${esc(profile.htmlUrl)}" target="_blank" rel="noopener">@${esc(profile.login)}</a>)` : ''} — refreshed automatically, never typed in by hand.</p>
            <section class="hero-stats-strip sync-stats" aria-label="GitHub statistics">
${strip}
            </section>
            <div class="sync-panels">
                <div class="sync-panel">
                    <h3 class="skills-cat-label">Languages across projects</h3>
                    <ul class="sync-langs">
${langs}
                    </ul>
                </div>
                <div class="sync-panel">
                    <h3 class="skills-cat-label">Contribution activity</h3>
                    ${contrib}
                </div>
            </div>
            <div class="sync-panel">
                <h3 class="skills-cat-label">Recent development</h3>
                <ul class="sync-activity">
${activityHtml}
                </ul>
            </div>${growth}
        </div>

        <div class="timeline-section" id="journey-github">
            <h2 class="section-heading">Verified on GitHub</h2>
            <p class="sync-caption sync-caption-left">Generated from public GitHub data by fixed rules (first launches, releases, star &amp; fork milestones, streaks, merged contributions). Each item links to its source.</p>
            <div class="timeline-container">
                <div class="scroll-line-bg"></div>
                <div class="scroll-line-progress"></div>

${timeline}
            </div>
            ${syncStatusLine(status)}
        </div>`;
}

/* ───────────────────────── project page ───────────────────────── */

function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function renderProjectPage(p, { template, config, status }) {
  const prefix = '../';
  const siteUrl = config.site.url;
  const canonical = absoluteSiteUrl(siteUrl, pageHref(p.slug));
  const img = assetUrl(p.image?.url, prefix);
  const ogImage = p.image?.url && /^https:/.test(p.image.url) ? p.image.url : absoluteSiteUrl(siteUrl, p.image?.url || '');
  const desc = truncate(p.summarySource && p.summarySource !== 'none' ? p.summaryText : (p.summary || p.description || p.readme?.excerpt || `${p.displayName} — a public project by ${config.site.ownerName}.`), 200);
  const title = `${p.displayName} | ${config.site.ownerName}`;

  const head = [
    `    <title>${esc(title)}</title>`,
    `    <meta name="description" content="${esc(desc)}">`,
    canonical ? `    <link rel="canonical" href="${esc(canonical)}">` : '',
    `    <meta property="og:type" content="article">`,
    `    <meta property="og:title" content="${esc(title)}">`,
    `    <meta property="og:description" content="${esc(desc)}">`,
    canonical ? `    <meta property="og:url" content="${esc(canonical)}">` : '',
    ogImage ? `    <meta property="og:image" content="${esc(ogImage)}">` : '',
    `    <meta name="twitter:card" content="summary_large_image">`,
    `    <script type="application/ld+json">${jsonLd({
      '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: p.displayName, description: desc,
      codeRepository: p.url, programmingLanguage: p.language || undefined, dateCreated: p.createdAt, dateModified: p.pushedAt,
      license: p.license?.spdx ? `https://spdx.org/licenses/${p.license.spdx}.html` : undefined,
      author: { '@type': 'Person', name: config.site.ownerName, url: `https://github.com/${config.github.username}` },
    })}</script>`,
  ].filter(Boolean).join('\n');

  const pills = [];
  if (p.archived) pills.push('Archived');
  if (p.isTemplate) pills.push('Template');
  if (p.latestRelease) pills.push(`Latest release ${p.latestRelease.tag}`);
  if (p.license) pills.push(p.license.spdx ? `${p.license.spdx} License` : p.license.name);
  for (const t of (p.topics || []).slice(0, 8)) pills.push(`#${t}`);

  const facts = [
    ['Primary language', p.language || '—'],
    ['Stars', String(p.stars)],
    ['Forks', String(p.forks)],
    ['Created', fmtDate(p.createdAt)],
    ['Last updated', fmtDate(p.pushedAt)],
    ['License', p.license ? (p.license.spdx || p.license.name) : 'None specified'],
  ];
  if (p.latestRelease) facts.push(['Latest release', `${p.latestRelease.tag} · ${fmtDate(p.latestRelease.publishedAt)}`]);
  if (p.hasIssues) facts.push(['Open issues & PRs', String(p.openIssues)]);

  const demoBtn = p.demo
    ? `\n                        <a href="${esc(p.demo.url)}" target="_blank" rel="noopener" class="btn-visit sync-btn-alt">Live Demo <i class="fas fa-arrow-up-right-from-square"></i></a>`
    : '';
  const demoNote = p.demo?.source === 'readme' ? '<p class="sync-caption">Live demo link found in the project README.</p>' : '';

  const languages = p.languages?.length
    ? `<ul class="sync-langs sync-langs-compact">${p.languages.slice(0, 6).map((l) => `<li class="sync-lang"><span class="sync-lang-name">${esc(l.name)}</span><span class="sync-lang-bar"><span style="width:${Math.max(1, Math.min(100, l.pct))}%"></span></span><span class="sync-lang-pct">${esc(l.pct)}%</span></li>`).join('')}</ul>`
    : '';

  const hero = `        <article class="featured-project project-hero">
            <div class="card-bg"></div>
${img ? `            <div class="fp-image"><img src="${esc(img)}" alt="${esc(p.displayName)} preview" decoding="async" data-sync-img></div>\n` : ''}            <div class="fp-content">
                <div class="case-grid">
${facts.map(([l, v]) => `                    <div class="case-cell">
                        <span class="case-label">${esc(l)}</span>
                        <span class="case-val">${esc(v)}</span>
                    </div>`).join('\n')}
                </div>
                ${techTags(p, 14)}
                ${languages}
                <div class="fp-links">
                        <a href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Repository on GitHub"><i class="fab fa-github"></i></a>
                        <a href="${esc(p.url)}" target="_blank" rel="noopener" class="btn-visit">View on GitHub</a>${demoBtn}
                </div>
                ${demoNote}
            </div>
        </article>`;

  // At-a-glance: only facts extracted from the README, clearly labelled
  const hl = p.readme?.highlights || {};
  const glance = [];
  if (p.summary) glance.push(['Summary', `<p>${esc(p.summary)}</p>`]);
  else if (p.summarySource === 'readme' && (p.description || p.readme?.tagline)) glance.push(['Overview · from README', `<p>${esc(p.summaryText)}</p>`]);
  else if (!p.readme && p.description) glance.push(['Description · from GitHub', `<p>${esc(p.description)}</p>`]);
  if (hl.problem) glance.push(['Problem · from README', `<p>${esc(hl.problem)}</p>`]);
  if (hl.features?.length) glance.push(['Key features · from README', `<ul>${hl.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`]);
  const glanceHtml = glance.length
    ? `        <section class="sync-glance" aria-label="Project at a glance">
${glance.map(([l, v]) => `            <div class="case-cell"><span class="case-label">${esc(l)}</span><div class="case-val">${v}</div></div>`).join('\n')}
        </section>`
    : '';

  let body;
  if (p.readme) {
    const toc = p.readme.sections.length >= 2
      ? `            <nav class="project-toc" aria-label="README sections">
                <span class="skills-cat-label">On this page</span>
                <ol>
${p.readme.sections.map((s) => `                    <li><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`).join('\n')}
                </ol>
                <a class="sync-verify" href="${esc(p.readme.htmlUrl || p.url)}" target="_blank" rel="noopener">Original README →</a>
            </nav>`
      : '';
    body = `        <div class="project-body${toc ? '' : ' no-toc'}">
${toc}
            <div class="readme-body">
                <p class="sync-caption sync-caption-left">From <a href="${esc(p.readme.htmlUrl || p.url)}" target="_blank" rel="noopener">${esc(p.readme.path || 'README.md')}</a> in the repository${p.readme.truncated ? ' (shortened — see the original for the full document)' : ''}.</p>
                ${resanitize(p.readme.overviewHtml)}
${p.readme.sections.map((s) => `                <section class="readme-section" data-kind="${esc(s.kind)}">\n${resanitize(s.html)}\n                </section>`).join('\n')}
            </div>
        </div>`;
  } else if (p.readmeStatus === 'missing') {
    body = `        <p class="sync-notice">This repository doesn't have a README yet, so the details above come from GitHub repository metadata only.</p>`;
  } else {
    body = `        <p class="sync-notice">The README couldn't be loaded during the latest sync. It will be filled in automatically on the next successful run — meanwhile, <a href="${esc(p.url)}" target="_blank" rel="noopener">read it on GitHub</a>.</p>`;
  }

  const releases = p.releases?.length
    ? `
        <div class="timeline-section" id="project-releases">
            <h2 class="section-heading">Releases</h2>
            <div class="timeline-container">
                <div class="scroll-line-bg"></div>
                <div class="scroll-line-progress"></div>
${p.releases.slice(0, 8).map((r) => `                <ul class="timeline-list">
                    <li class="timeline-item">
                        <div class="li-icon"><div class="inner-dot"></div></div>
                        <div class="timeline-content">
                            <h3>${esc(r.name)}${r.name !== r.tag ? ` <span class="company">${esc(r.tag)}</span>` : ''}${r.prerelease ? ' <span class="company">— Pre-release</span>' : ''}</h3>
                            <span class="time">${esc(fmtDate(r.publishedAt))}</span>
                            <a class="sync-verify" href="${esc(r.url)}" target="_blank" rel="noopener">Release notes →</a>
                        </div>
                    </li>
                </ul>`).join('\n')}
            </div>
        </div>`
    : '';

  const resources = [
    ['Repository', p.url],
    p.readme?.htmlUrl ? ['Original README', p.readme.htmlUrl] : null,
    p.hasIssues ? ['Issues', `${p.url}/issues`] : null,
    p.releases?.length ? ['All releases', `${p.url}/releases`] : null,
    p.homepage && p.homepage !== p.demo?.url ? ['Homepage', p.homepage] : null,
    p.license ? ['License', `${p.url}/blob/${encodeURIComponent(p.defaultBranch)}/LICENSE`] : null,
  ].filter(Boolean);

  const main = `    <main class="projects-page project-detail">
        <nav class="sync-breadcrumb" aria-label="Breadcrumb"><a href="../projects.html" class="btn-text"><span class="btn-arrow">←</span> All projects</a></nav>

        <div class="title-section project-title">
            <span class="fp-type">${esc(categoryLabel(p))}</span>
            <h1 class="big-text">${esc(p.displayName)}</h1>
            <p class="projects-subtitle">${esc(p.description || p.readme?.tagline || (p.summarySource && p.summarySource !== 'none' ? truncate(p.summaryText, 220) : '') || 'No description provided on GitHub yet.')}</p>
${pills.length ? `            <div class="tech-tags sync-pills">${pills.map((x) => `<span class="tech-tag">${esc(x)}</span>`).join('')}</div>\n` : ''}        </div>

${hero}

${glanceHtml}

${body}
${releases}

        <section class="sync-resources" aria-label="Links">
            <h2 class="section-heading">Resources</h2>
            <div class="skills-wrapper">
${resources.map(([l, u]) => `                <a class="skill-item" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`).join('\n')}
            </div>
        </section>

        ${syncStatusLine(status, 'is-centered')}
    </main>`;

  return fill(template, {
    head,
    main,
    username: esc(config.github.username),
    linkedin: esc(config.site.linkedin || `https://github.com/${config.github.username}`),
    ownerName: esc(config.site.ownerName),
    email: esc(config.site.email),
  });
}

export function renderRedirectPage({ to, name }) {
  const href = `${encodeURIComponent(to)}.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    ${GENERATOR_META}
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0; url=${esc(href)}">
    <link rel="canonical" href="${esc(href)}">
    <title>${esc(name)} has moved</title>
</head>
<body>
    <p>This project was renamed. Continue to <a href="${esc(href)}">${esc(name)}</a>.</p>
</body>
</html>
`;
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m));
}

export function renderSitemap(config, projects) {
  const base = config.site.url;
  if (!base) return null;
  const urls = [
    ['', null], ['about.html', null], ['projects.html', null], ['journey.html', null],
    ...projects.map((p) => [pageHref(p.slug), p.pushedAt ? p.pushedAt.slice(0, 10) : null]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, lm]) => `  <url><loc>${esc(new URL(u, base).href)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

/* ───────────────────────── orchestration ───────────────────────── */

export async function renderAll({ paths, config, model }) {
  const files = new Map();
  const deletes = [];
  const byName = new Map();
  for (const p of model.projects) {
    byName.set(p.name.toLowerCase(), p);
    for (const old of p.nameHistory || []) if (!byName.has(old.toLowerCase())) byName.set(old.toLowerCase(), p);
  }

  // projects.html
  let projectsHtml = await readText(paths.projectsHtml);
  projectsHtml = replaceMarker(projectsHtml, 'projects', renderProjectsSection(model));
  for (const m of listMarkers(projectsHtml)) {
    const cm = m.match(/^card-links:(.+)$/);
    if (cm) projectsHtml = replaceMarker(projectsHtml, m, renderCuratedLinks(cm[1], byName.get(cm[1].toLowerCase()), config));
  }
  files.set(paths.projectsHtml, projectsHtml);

  // journey.html
  let journeyHtml = await readText(paths.journeyHtml);
  journeyHtml = replaceMarker(journeyHtml, 'milestones', renderManualMilestones(model.manualAchievements));
  journeyHtml = replaceMarker(journeyHtml, 'github', renderGithubSection(model));
  files.set(paths.journeyHtml, journeyHtml);

  // Project pages, redirects, cleanup of stale generated pages
  const template = await readText(paths.projectTemplate);
  const expected = new Set();
  for (const p of model.projects) {
    const file = path.join(paths.projectPagesDir, `${p.slug}.html`);
    files.set(file, renderProjectPage(p, { template, config, status: model.status }));
    expected.add(file);
  }
  for (const r of model.redirects || []) {
    const file = path.join(paths.projectPagesDir, `${r.from}.html`);
    if (expected.has(file)) continue;
    files.set(file, renderRedirectPage(r));
    expected.add(file);
  }
  let existing = [];
  try { existing = await fs.readdir(paths.projectPagesDir); } catch { /* no dir yet */ }
  for (const f of existing) {
    if (!f.endsWith('.html')) continue;
    const abs = path.join(paths.projectPagesDir, f);
    if (expected.has(abs)) continue;
    const content = await readText(abs, '');
    if (content.includes(GENERATOR_META)) deletes.push(abs); // only ever delete pages this tool generated
  }

  const sitemap = renderSitemap(config, model.projects);
  if (sitemap) files.set(paths.sitemap, sitemap);
  return { files, deletes };
}
