#!/usr/bin/env node
// Entry point: `npm run sync` (incremental), `npm run sync:full`, `npm run render`, `npm run check`.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GitHubClient } from './github.mjs';
import { runSync } from './sync.mjs';
import { paths as pathsFor } from './config.mjs';
import { validateMarkers } from './markers.mjs';
import { writeFileAtomic, consoleLogger, readJson } from './util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '../..');

export function parseArgs(argv) {
  const args = { full: false, renderOnly: false, check: false, dryRun: false, root: DEFAULT_ROOT, debug: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--full') args.full = true;
    else if (a === '--render-only') args.renderOnly = true;
    else if (a === '--check') args.check = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--debug') args.debug = true;
    else if (a === '--root') args.root = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function acquireLock(file, now = Date.now()) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const fh = await fs.open(file, 'wx');
    await fh.writeFile(JSON.stringify({ pid: process.pid, at: new Date(now).toISOString() }));
    await fh.close();
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const info = await readJson(file, {}).catch(() => ({}));
    const age = now - new Date(info?.at || 0).getTime();
    if (age > 30 * 60 * 1000) { // stale lock from a crashed run
      await fs.rm(file, { force: true });
      return acquireLock(file, now);
    }
    return false;
  }
}

/** Validate generated output before anything touches disk. Returns a list of problems. */
export async function validateOutput(files, p) {
  const problems = [];
  for (const [file, content] of files) {
    if (typeof content !== 'string' || !content.length) problems.push(`${file}: empty output`);
    if (file.endsWith('.json')) {
      try { JSON.parse(content); } catch (e) { problems.push(`${file}: invalid JSON (${e.message})`); }
    }
    if (file.endsWith('.html')) {
      if (!/<\/html>\s*$/i.test(content)) problems.push(`${path.basename(file)}: truncated HTML`);
      for (const e of validateMarkers(content)) problems.push(`${path.basename(file)}: ${e}`);
      if (/<script(?![^>]*(?:src="(?:\.\.\/)?(?:script|github-sync)\.js"|type="application\/ld\+json"))[^>]*>/i.test(content)) {
        problems.push(`${path.basename(file)}: unexpected <script> tag in generated output`);
      }
    }
  }
  for (const f of [p.projectsHtml, p.journeyHtml]) if (!files.has(f)) problems.push(`${path.basename(f)} was not rendered`);
  return problems;
}

export async function checkCommitted(root) {
  const p = pathsFor(root);
  const problems = [];
  for (const f of [p.projectsHtml, p.journeyHtml]) {
    const html = await fs.readFile(f, 'utf8');
    for (const e of validateMarkers(html)) problems.push(`${path.basename(f)}: ${e}`);
  }
  const projects = (await readJson(p.projectsJson, { projects: [] }))?.projects || [];
  for (const proj of projects) {
    try { await fs.access(path.join(p.projectPagesDir, `${proj.slug}.html`)); } catch { problems.push(`missing page projects/${proj.slug}.html`); }
  }
  for (const f of [p.statusJson, p.state, p.profileJson, p.achievementsJson, p.historyJson].filter(Boolean)) {
    try { await readJson(f, null); } catch (e) { problems.push(e.message); }
  }
  return problems;
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await fs.appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function stepSummary(md) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const logger = consoleLogger({ debug: args.debug });
  const p = pathsFor(args.root);

  if (args.check) {
    const problems = await checkCommitted(args.root);
    if (problems.length) { problems.forEach((x) => logger.error(x)); return 1; }
    logger.info('Generated files are consistent.');
    return 0;
  }

  const token = env.PORTFOLIO_SYNC_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN || null;
  const client = new GitHubClient({
    token,
    baseUrl: env.GITHUB_SYNC_API_URL || 'https://api.github.com',
    logger,
    maxRateLimitWaitMs: Number(env.SYNC_MAX_RATE_WAIT_MS || 90_000),
  });
  const full = args.full || env.SYNC_FULL === 'true';

  if (!(await acquireLock(p.lock))) {
    logger.warn('Another sync is running; exiting without changes.');
    await setOutput('changed', 'false');
    return 0;
  }
  const started = Date.now();
  try {
    logger.info(`Sync starting (${args.renderOnly ? 'render-only' : full ? 'full' : 'incremental'}, ${token ? 'authenticated' : 'unauthenticated'})`);
    const result = await runSync({ root: args.root, client, logger, full, env, renderOnly: args.renderOnly });

    const problems = await validateOutput(result.files, p);
    if (problems.length) {
      problems.forEach((x) => logger.error(x));
      throw new Error('Generated output failed validation; nothing was written.');
    }

    const s = result.summary;
    if (!args.renderOnly) {
      logger.info(`Repos: ${s.discovered} discovered · ${s.added.length} added · ${s.updated.length} updated · ${s.renamed.length} renamed · ${s.removed.length} removed · ${s.excluded.length} excluded`);
      logger.info(`API requests: ${client.requestCount}; rate limit remaining: ${client.rate.remaining ?? 'n/a'}`);
      for (const w of result.warnings) logger.warn(w);
    }

    if (args.dryRun) {
      logger.info(`Dry run: would ${result.publish ? '' : 'not '}write ${result.files.size} files and delete ${result.deletes.length}.`);
      await setOutput('changed', 'false');
      return 0;
    }

    if (!result.publish) {
      logger.info('No meaningful changes and no heartbeat due — leaving files untouched.');
      await setOutput('changed', 'false');
      return 0;
    }

    for (const [file, content] of result.files) {
      const prev = await fs.readFile(file, 'utf8').catch(() => null);
      if (prev !== content) await writeFileAtomic(file, content);
    }
    for (const file of result.deletes) await fs.rm(file, { force: true });
    await setOutput('changed', 'true');

    if (!args.renderOnly) {
      await stepSummary([
        '### Portfolio GitHub sync',
        `- Mode: **${result.status.mode}** · ${(Date.now() - started) / 1000}s · ${client.requestCount} API requests`,
        `- Repositories: ${s.discovered} public, ${result.status.repoCount} shown`,
        s.added.length ? `- Added: ${s.added.map((x) => x.name).join(', ')}` : null,
        s.updated.length ? `- Updated: ${s.updated.map((x) => x.name).join(', ')}` : null,
        s.renamed.length ? `- Renamed: ${s.renamed.map((x) => `${x.from} → ${x.to}`).join(', ')}` : null,
        s.removed.length ? `- Removed: ${s.removed.length} (deleted, private or transferred)` : null,
        result.warnings.length ? `- Warnings: ${result.warnings.length} (see log)` : null,
      ].filter(Boolean).join('\n'));
    }
    logger.info(`Wrote output (${result.files.size} files checked, ${result.deletes.length} removed).`);
    return 0;
  } catch (err) {
    logger.error(err.message);
    await setOutput('changed', 'false');
    await stepSummary(`### Portfolio GitHub sync failed\n\n${String(err.message).slice(0, 500)}\n\nThe live site was not modified.`);
    return 1;
  } finally {
    await fs.rm(p.lock, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
