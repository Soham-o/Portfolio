// Output validation shared by the sync (job A), the commit job (job B) and `npm run check`.
// Deliberately dependency-free: it never imports the README/markdown pipeline or any npm package,
// so the commit job can run it without installing or executing third-party code.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { paths as pathsFor } from './config.mjs';
import { validateMarkers } from './markers.mjs';
import { readJson } from './util.mjs';

/** The only paths the sync is allowed to create, change or delete (repo-relative, POSIX). */
export const GENERATED_PATTERNS = [
  /^data\/(projects|profile|achievements|stats-history|sync-status|state)\.json$/,
  /^data\/cache\/repos\/\d+\.json$/,
  /^projects\/[a-z0-9][a-z0-9-]*\.html$/,
  /^(projects|journey)\.html$/,
  /^sitemap\.xml$/,
];

export function isGeneratedPath(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || rel.startsWith('/') || rel.split('/').includes('..')) return false;
  return GENERATED_PATTERNS.some((re) => re.test(rel));
}

const ALLOWED_SCRIPT = /<script(?![^>]*(?:src="(?:\.\.\/)?(?:script|github-sync)\.js"|type="application\/ld\+json"))[^>]*>/i;

export function validateHtml(name, content) {
  const problems = [];
  if (!/<\/html>\s*$/i.test(content)) problems.push(`${name}: truncated HTML`);
  for (const e of validateMarkers(content)) problems.push(`${name}: ${e}`);
  if (ALLOWED_SCRIPT.test(content)) problems.push(`${name}: unexpected <script> tag in generated output`);
  if (/\son[a-z]+\s*=/i.test(content.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''))) {
    problems.push(`${name}: inline event handler attribute in generated output`);
  }
  if (/(href|src)\s*=\s*"\s*javascript:/i.test(content)) problems.push(`${name}: javascript: URL in generated output`);
  return problems;
}

/** Validate an in-memory result (Map absPath → content) before anything is written. */
export async function validateOutput(files, p) {
  const problems = [];
  for (const [file, content] of files) {
    const name = path.relative(p.root, file);
    if (typeof content !== 'string' || !content.length) { problems.push(`${name}: empty output`); continue; }
    if (file.endsWith('.json')) {
      try { JSON.parse(content); } catch (e) { problems.push(`${name}: invalid JSON (${e.message})`); }
    }
    if (file.endsWith('.html')) problems.push(...validateHtml(name, content));
    if (!isGeneratedPath(name.split(path.sep).join('/'))) problems.push(`${name}: outside the generated-file allowlist`);
  }
  for (const f of [p.projectsHtml, p.journeyHtml]) if (!files.has(f)) problems.push(`${path.basename(f)} was not rendered`);
  return problems;
}

/** Relative href/src targets in a generated page that don't exist on disk. */
async function brokenRelativeLinks(root, rel, html) {
  const out = [];
  const dir = path.posix.dirname(rel);
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) continue; // absolute, anchor or protocol-relative
    const target = path.posix.normalize(path.posix.join(dir, decodeURI(url.split(/[?#]/)[0])));
    if (target.startsWith('..')) { out.push(`${rel}: link escapes the site root (${url})`); continue; }
    try { await fs.access(path.join(root, target)); } catch { out.push(`${rel}: broken relative link ${url}`); }
  }
  for (const m of html.matchAll(/http-equiv="refresh" content="0; url=([^"]+)"/g)) {
    try { await fs.access(path.join(root, dir, m[1])); } catch { out.push(`${rel}: redirect target missing (${m[1]})`); }
  }
  return out;
}

/** Validate the generated files as they are on disk (used by `npm run check` and the commit job). */
export async function checkCommitted(root) {
  const p = pathsFor(root);
  const problems = [];
  const pages = [];
  for (const f of [p.projectsHtml, p.journeyHtml]) {
    const html = await fs.readFile(f, 'utf8');
    for (const e of validateMarkers(html)) problems.push(`${path.basename(f)}: ${e}`);
    pages.push([path.basename(f), html]);
  }
  for (const f of [p.statusJson, p.state, p.profileJson, p.achievementsJson, p.historyJson, p.projectsJson]) {
    try { await readJson(f, null); } catch (e) { problems.push(e.message); }
  }
  const projects = (await readJson(p.projectsJson, { projects: [] }))?.projects || [];
  // The canonical base can legitimately differ from content/portfolio.config.json (in CI the URL that
  // GitHub Pages reports wins), so check consistency instead: the sitemap's root <loc> is the base, and
  // every sitemap entry and project-page canonical must sit under it.
  let site = '';
  try {
    const locs = [...(await fs.readFile(p.sitemap, 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    site = locs[0] || '';
    for (const l of locs) if (!l.startsWith(site)) problems.push(`sitemap.xml: ${l} is not under ${site}`);
  } catch { /* no sitemap yet */ }
  const expected = new Set(projects.map((x) => `${x.slug}.html`));
  let files = [];
  try { files = (await fs.readdir(p.projectPagesDir)).filter((f) => f.endsWith('.html')); } catch { /* none yet */ }
  for (const proj of projects) {
    if (!files.includes(`${proj.slug}.html`)) { problems.push(`missing page projects/${proj.slug}.html`); continue; }
  }
  for (const f of files) {
    const html = await fs.readFile(path.join(p.projectPagesDir, f), 'utf8');
    pages.push([`projects/${f}`, html]);
    const redirect = /http-equiv="refresh"/.test(html);
    if (!expected.has(f) && !redirect) problems.push(`projects/${f}: stale page (no matching project)`);
    if (expected.has(f)) {
      problems.push(...validateHtml(`projects/${f}`, html));
      const canon = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
      if (site && canon && canon !== new URL(`projects/${f}`, site).href) problems.push(`projects/${f}: canonical ${canon} does not match the sitemap base ${site}`);
    }
  }
  for (const [rel, html] of pages) problems.push(...await brokenRelativeLinks(root, rel, html));
  return problems;
}
