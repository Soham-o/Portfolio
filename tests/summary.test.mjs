// Project-summary extraction: real README fixtures (downloaded from the public repos) + edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { processReadme, summaryRejection } from '../tools/sync/readme.mjs';
import { chooseSummary, isMeaningfulDescription, NO_DESCRIPTION } from '../tools/sync/summary.mjs';
import { REPO_ROOT } from './helpers/site.mjs';

const fixture = async (name) => fs.readFile(path.join(REPO_ROOT, 'tests/fixtures/readmes', `${name}.md`), 'utf8');
const readme = (md, repo = 'r') => processReadme(md, { owner: 'Soham-o', repo, branch: 'main' });

/* ── real READMEs ── */

test('real: tagline then descriptive paragraph inside centered HTML (EarthShare)', async () => {
  const r = readme(await fixture('EarthShare'), 'EarthShare');
  assert.equal(r.tagline, 'Carbon ownership, not carbon awareness.');
  assert.match(r.summary, /^A full-stack carbon-footprint prototype with a deterministic accounting engine, a FastAPI backend and a Next\.js frontend\./);
});

test('real: link directory and pull-quote are skipped; "The Vision" section is used (voteros)', async () => {
  const r = readme(await fixture('voteros'), 'voteros');
  assert.match(r.summary, /^VoterOS is an interactive, AI-powered system designed to demystify the electoral process\./);
  assert.doesNotMatch(r.summary, /Live Demo|Watch the Pitch|Elections are not failing/);
});

test('real: blockquote summary (autonomous-driving-system, CalmReader)', async () => {
  assert.match(readme(await fixture('autonomous-driving-system')).summary, /^Industry-grade autonomous vehicle simulation system integrating deep-learning perception/);
  const calm = readme(await fixture('CalmReader'));
  assert.match(calm.summary, /CalmReader is built to help you understand better/);
  assert.equal(calm.tagline, 'Read deeply. Think clearly. Remember what matters.');
});

test('real: paragraph after a bold tagline and badges (AirTwin-X, cursor_bite)', async () => {
  assert.match(readme(await fixture('AirTwin-X')).summary, /^AirTwin X takes a city's current air-quality reading and walks it through a pipeline/);
  assert.match(readme(await fixture('cursor_bite')).summary, /^A privacy-first, local-first Windows assistant that appears around your mouse cursor/);
});

test('real: insufficient documentation falls back clearly (Employee-Analysis)', async () => {
  const r = readme(await fixture('Employee-Analysis'), 'Employee-Analysis');
  assert.equal(r.summary, '');
  const c = chooseSummary({ description: 'Project Employee Analysis', name: 'Employee-Analysis', readme: r });
  assert.deepEqual(c, { text: NO_DESCRIPTION.readmeOnly, source: 'none' });
});

test('real: "Next.js" and "hpd.ipynb" do not break sentence splitting', async () => {
  for (const name of ['EarthShare', 'MLmini_Projects']) {
    const s = readme(await fixture(name)).summary;
    assert.doesNotMatch(s, /^(js|ipynb)\b/, `${name}: ${s}`);
  }
});

/* ── synthetic edge cases ── */

test('empty description + tagline-only README → no summary invented', () => {
  const r = readme('# Thing\n\n**Fast. Simple. Yours.**\n\n## Install\n```\nnpm i thing\n```\n');
  assert.equal(r.summary, '');
  assert.equal(r.tagline, 'Fast. Simple. Yours.');
  assert.equal(chooseSummary({ description: '', name: 'thing', readme: r }).source, 'none');
});

test('badge-heavy README with a real overview section', () => {
  const md = `<p align="center">
  <img src="https://img.shields.io/badge/a-b-c"> <img src="https://img.shields.io/badge/d-e-f">
</p>

[![CI](https://github.com/o/r/actions/workflows/ci.yml/badge.svg)](x) [![npm](https://img.shields.io/npm/v/x)](y)

## Overview
Ledgerly reconciles bank exports against invoices and flags mismatches before month-end close, so small teams stop doing it by hand in spreadsheets.
`;
  const r = readme(md);
  assert.match(r.summary, /^Ledgerly reconciles bank exports against invoices/);
  assert.equal(r.summaryFrom, 'Overview');
});

test('installation instructions and link directories are never the summary', () => {
  assert.equal(summaryRejection('pip install -r requirements.txt and then run python app.py to start the local server quickly', 'pip install -r requirements.txt and then run python app.py to start the local server quickly'), 'command');
  const dir = '[Docs](a) · [Demo](b) · [Issues](c) · [Roadmap](d)';
  assert.equal(summaryRejection(dir, 'Docs · Demo · Issues · Roadmap'), 'link-directory');
  const r = readme('# X\n\n[Docs](a) • [Demo](b) • [Blog](c)\n\n```bash\ngit clone x\n```\n\nRun `npm install` then `npm start` to launch the dev server on port 3000 locally.\n');
  assert.equal(r.summary, '');
});

test('intro sentence ending with ":" keeps the list it introduces', () => {
  const r = readme('# P\n\nThis toolkit converts scanned receipts into structured expense records capable of:\n\n- reading totals\n- detecting currency\n- exporting CSV\n');
  assert.equal(r.summary, 'This toolkit converts scanned receipts into structured expense records capable of: reading totals; detecting currency; exporting CSV.');
});

test('labels like "What it is:" are stripped from blockquote summaries', () => {
  const r = readme('# P\n\n## Project summary\n\n> **What it is:** Parcel is a delivery-tracking dashboard that merges carrier updates into one timeline for small online shops.\n');
  assert.match(r.summary, /^Parcel is a delivery-tracking dashboard/);
});

test('summary priority: override → meaningful description → README → fallback', () => {
  const r = { summary: 'From the README: a scheduling assistant that books rooms automatically for teams.' };
  assert.deepEqual(chooseSummary({ override: { summary: 'Mine.' }, description: 'A real description of the project here', name: 'x', readme: r }), { text: 'Mine.', source: 'override' });
  assert.equal(chooseSummary({ description: 'Booking assistant for shared office rooms', name: 'rooms', readme: r }).source, 'description');
  assert.equal(chooseSummary({ description: 'Project Rooms', name: 'rooms', readme: r }).source, 'readme');
  assert.equal(chooseSummary({ description: '', name: 'rooms', readme: null }).text, NO_DESCRIPTION.card);
  assert.equal(isMeaningfulDescription('My first repo', 'first-repo'), false);
  assert.equal(isMeaningfulDescription('Cursor Bite - Modern AI-powered context-aware assistant', 'cursor_bite'), true);
});
