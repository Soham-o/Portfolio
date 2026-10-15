# Automated GitHub sync — setup & operations guide

Your portfolio is still the same static HTML/CSS/JS site on GitHub Pages. A GitHub Actions
workflow now reads your **public** GitHub data on a schedule, regenerates the GitHub-driven parts
of the site, commits them, and redeploys. There is no server, database or paid service.

```
 hourly (+ content/ pushes, manual, optional webhook)
        │
        ▼
 A · sync   (contents:read)   npm test → read-only GitHub API → sanitize READMEs → render → validate
        │                     → upload ONLY the changed generated files + SHA-256 manifest (artifact)
        ▼
 B · commit (contents:write)  no npm, no README code: verify allowlist + hashes → apply → validate
        │                     → commit → rebase → re-validate → fast-forward push (token only for git)
        ▼
 C · deploy (pages:write)     static.yml (reused) → allowlisted site files only → GitHub Pages
```

## 1. Activate it

The code is in `Soham-o/Portfolio` on `main`, and the repository is **public**.

> **One manual step left (Oct 2026):** GitHub Pages is not enabled for the repository
> (`has_pages: false`). It's a repository setting that only you can switch on:
> **Settings → Pages → Build and deployment → Source: GitHub Actions.**
> Until then, the sync keeps running and committing fresh data, `static.yml` finishes with a
> "Site not deployed" warning instead of failing, and the deploy job is skipped.

Then:

1. **Actions → "Deploy static content to Pages" → Run workflow** once to publish the current site.
2. **Actions → "Sync GitHub projects" → Run workflow** (tick *full*) for a fresh sync; it commits
   `chore(sync): …` if anything changed and deploys.
3. Open `https://soham-o.github.io/Portfolio/projects.html` and `/journey.html`. You should see
   *Everything Else I've Shipped* and *Built in Public* filled in, and a green
   "GitHub data synced …" indicator.

**Canonical URL.** `https://soham-o.github.io/Portfolio/` is GitHub's address for Pages on the
`Soham-o/Portfolio` repository (there is no `soham-o.github.io` user site or custom domain that would
change it; the old `…/Portfolio-Folder/` link pointed at a repository that no longer exists). It is set
in `content/portfolio.config.json` and the README. In CI the URL that GitHub Pages actually reports
overrides the config automatically (e.g. if you add a custom domain later), and `npm run check`
verifies that every canonical link, `og:url` and sitemap entry share one base.

No secrets are required. The workflow uses the built-in `GITHUB_TOKEN`, which is created per run,
expires when the run ends, and is never written to disk by the sync code.

### Test the automation end-to-end

1. Create a new repository on GitHub, add a README and a description, make it **public**.
2. Either wait for the next hourly run, or go to **Actions → Sync GitHub projects → Run workflow**.
3. The run summary lists it under **Added**. After the deploy finishes, it appears on
   `/projects.html` with its own page at `/projects/<repo-name>.html`.
4. Make the repo private again → the next run confirms it via the API, removes its card and page.

## 2. How often does it update?

| Trigger | Latency | Notes |
|---|---|---|
| Schedule (`17 * * * *`) | **≤ ~1 hour**, plus GitHub's scheduling delay (often 5–15 min, occasionally more) | Always on. Also reconciles anything missed. Actions minutes are free for public repositories; if the repo ever goes private again, use `17 */3 * * *` to stay inside the Free plan's 2,000 minutes/month. |
| Push to `content/**` or `templates/**` | ~1–2 min | Your edits to overrides/achievements/template are rendered and deployed right away. |
| Manual "Run workflow" | ~1–2 min | Tick **full** to re-read every README. |
| Optional webhook relay | ~1–2 min after the event | Needs a GitHub App + a tiny free worker (section 6). |

This is a **scheduled** system, not a real-time webhook, unless you set up the optional relay.

Each run:
- lists your public repos (a full listing must succeed, otherwise the run aborts and changes nothing);
- re-fetches README/languages/manifests **only** for repos whose `pushed_at`/`updated_at` changed,
  plus a full refresh once per day;
- always re-checks releases (one cheap request per repo);
- commits **only** when content changed, or once a day as a heartbeat (keeps the "synced" indicator
  fresh and keeps scheduled workflows from being auto-disabled for inactivity).

A typical incremental run makes ~10–30 API requests; `GITHUB_TOKEN` allows 1,000/hour.
Each run is billed as ~2 Actions minutes (install, tests, sync); deploys add ~1 minute when they happen.

## 3. What gets published, and from where

| Shown | Source |
|---|---|
| Project list, name, description, topics, stars, forks, license, dates, archived flag | `GET /users/{user}/repos` (public repos only, double-checked with `private === false`) |
| Project page body | The repo's README, parsed into sections, sanitized, relative links/images rewritten |
| "Problem", "Key features" boxes | Only when the README has a matching section (labelled *from README*) |
| Tech stack | Languages API + `package.json` / `requirements.txt` / `pyproject.toml` / root files (parsed as text; never executed) + topics |
| Live demo | Override → repo homepage → GitHub Pages → a demo link found in the README (labelled) |
| Cover image | Override → first non-badge README image → GitHub's social preview image |
| Releases | Releases API (drafts excluded) |
| Profile, followers | `GET /users/{user}` |
| Contribution calendar | GraphQL `contributionsCollection` (needs a token; see limitations) |
| Merged PRs to other people's projects | Search API: `is:pr is:merged author:you -user:you` |

Nothing is invented. When data is missing the page says so ("no README yet", "calendar unavailable")
instead of showing estimates. No AI summarisation is used: summaries are deterministic extracts from
your README/description, so they can't contain claims you didn't write.

**Card summaries** (first usable wins):

1. `summary` in `content/projects.overrides.json`;
2. the GitHub description, if it says more than the repo name ("Project Employee Analysis" doesn't);
3. a README paragraph: the overview before the first section, then *Overview / Project summary /
   About / Introduction / Purpose / The idea / The vision*, then early *Why / Problem* sections.
   Paragraphs inside centered HTML and blockquotes count; taglines (< 12 words), link directories
   ("Docs · Demo · Issues"), badge strings, pull-quotes and install commands are skipped; an intro
   ending in ":" keeps its bullet list; at most ~320 characters, cut at sentence boundaries;
4. otherwise an explicit "No description yet" message — never a guess.

The detail page keeps the full README, and shows a short tagline (or the GitHub description) under the title.

## Projects page layout

1. **"Systems That Run Themselves." (top):** your hand-written case studies (InternPilot AI, PVCA,
   Newsletter Digest), followed automatically by every public repo that has the GitHub topic
   **`autonomous`**, shown as large cards.
2. **"Everything Else I've Shipped" (bottom):** every other public repo, in **GitHub order** (most
   recently pushed first, like the *Last updated* sort on your GitHub profile), with search, filters
   and sorting.
3. **Mybuddy:** a hand-written card below the list, because its repository is private and can't be
   placed by GitHub order. Make it public and it appears in the list automatically (then delete the
   hand-written card).

**To mark a new project as self-running:** on its GitHub page click ⚙ next to *About* → *Topics* →
add `autonomous`. The next sync (hourly, or *Run workflow*) moves it to the top. To override, set
`"autonomous": true` or `false` for that repo in `content/projects.overrides.json`. The topic list
is configurable as `github.autonomousTopics` in `content/portfolio.config.json`.

## 4. Controlling what appears — `content/` (yours; the sync never writes here)

**`content/projects.overrides.json`** — keyed by repo name (renames are followed automatically):

```jsonc
"InternPilot-AI": {
  "featured": true,           // large card, shown first
  "order": 1,                 // order among featured
  "category": "AI Automation · Live Pipeline",
  "summary": "Your own one-paragraph pitch",
  "image": "Image-Doc/p5.png",
  "demo": "https://…"
},
"some-old-thing": { "hidden": true }
```

`"curated": true` means *this repo already has a hand-written card on projects.html* — it then gets
a generated detail page, and its card's **View Project** button links there, but it isn't duplicated
in the auto grid. Your four existing repo cards are set up this way.

To link one of the three featured case studies (InternPilot AI, PVCA, Newsletter Digest) to a real
repo once it's public: wrap its `<div class="fp-links">…</div>` in
`<!-- github-sync:card-links:REPO_NAME:start -->` / `<!-- github-sync:card-links:REPO_NAME:end -->`
(copy the pattern used on the Task Manager card) and add `"REPO_NAME": { "curated": true }`.

**`content/portfolio.config.json`** — `includeForks`, `includeArchived`, `excludeRepos`
(names or numeric IDs), `excludeTopics` (add the topic `portfolio-hide` to any repo to hide it),
stale threshold, heartbeat, achievement thresholds.

**`content/achievements.json`** — accomplishments outside GitHub (certifications, awards,
hackathons, papers, roles). Your six existing Milestones were moved here unchanged; they render
into the same timeline with the same markup. Add an item and push — it appears on the next deploy.

After editing `content/` just push: the push triggers a sync that re-renders and deploys. Locally,
`npm run render` rebuilds pages from the committed data without any API calls.

## 5. Achievements — the rules

Generated only from verifiable public data; each item links to its source. Newest first,
at most 12 items and 4 per type (configurable).

| Type | Rule | Date shown |
|---|---|---|
| First public project | Earliest-created repo | Repo creation date |
| Featured launch | Each `featured` repo | Repo creation date |
| First release | First non-prerelease release of each repo | Release date |
| Major release | Later releases tagged `vN.0.0` (N ≥ 1) | Release date |
| Project adoption | Highest star (10/25/50/…) and fork (5/10/25/…) milestone **per repo** | First observed by the sync ("Reached by …" for milestones already passed at the first sync) |
| Total stars | Highest total-star milestone | First observed |
| Project count | Highest of 5/10/25/50 public projects | Creation date of the Nth project |
| Technical breadth | ≥ 3 distinct primary languages | Creation date of the repo that added the last one |
| Consistency | Longest contribution streak in the past year (≥ 7 days) | Streak dates |
| Open source | Merged PRs into repos you don't own | Latest merge |

Not covered: GitHub's profile badges (Pull Shark, YOLO, Arctic Code Vault…). GitHub doesn't expose
them through any API, so they are not shown or claimed.

## 6. Optional: near-instant updates (webhook relay)

GitHub has no account-wide webhook, so instant updates need a GitHub App plus a relay:

1. **Create a fine-grained token** (Settings → Developer settings → Fine-grained tokens):
   repository access *only the portfolio repo*, permission **Contents: Read and write**
   (required by `repository_dispatch`). Expiry: your choice; renew when it expires.
2. **Deploy the relay** (`relay/worker.mjs`) on Cloudflare Workers' free tier:
   `cp relay/wrangler.toml.example relay/wrangler.toml`, set `TARGET_REPO`, then in `relay/`:
   `npx wrangler deploy`, `npx wrangler secret put WEBHOOK_SECRET` (any long random string),
   `npx wrangler secret put DISPATCH_TOKEN` (the token from step 1).
3. **Create a GitHub App** (Settings → Developer settings → GitHub Apps → New):
   webhook URL = the worker URL, webhook secret = the same `WEBHOOK_SECRET`;
   permissions: **Metadata: read**, **Contents: read** (both read-only);
   events: *Repository*, *Release*, *Public*, *Push*. Install it on **All repositories**.

The relay verifies `X-Hub-Signature-256` (HMAC-SHA256, constant-time compare), ignores irrelevant
events and activity in private repos, and forwards only a coarse reason (e.g. `release.published`) —
never repo names or content. The hourly schedule keeps running as a safety net.

## 7. Optional: higher rate limits / private-contribution counts

Add a repository secret **`PORTFOLIO_SYNC_TOKEN`**: a **fine-grained** token with *Public repositories
(read-only)* access and no extra permissions. Only job A (the read-only sync) receives it. Classic
tokens report their scopes, and the sync refuses to run with one that has any write-capable scope
(`repo`, `public_repo`, `workflow`, `write:*`, `admin:*`, `gist`, `user`, …). Fine-grained tokens don't
report their permissions, so creating them read-only is up to you. Only useful if the contribution
calendar shows as unavailable, or you have a very large number of repos.

## 8. Security model

- **Three jobs, least privilege each** (workflow-level `permissions: {}`):
  - **A · sync** has `contents: read` + `pages: read` only. It is the only job that fetches and parses
    repository content (READMEs, manifests). Its `GITHUB_TOKEN` cannot write. Checkout uses
    `persist-credentials: false`. It validates the output, then `tools/sync/package.mjs` uploads only the
    changed generated files plus a SHA-256 manifest; any change outside the generated-file allowlist
    (`data/*.json`, `data/cache/repos/*.json`, `projects/*.html`, `projects.html`, `journey.html`,
    `sitemap.xml`) aborts the run.
  - **B · commit** has `contents: write` and never runs `npm install` or the README pipeline.
    `tools/sync/apply.mjs` (dependency-free) checks the base commit, the path allowlist, every hash and
    symlinks *before* writing, applies writes and deletions (stale project pages), and re-validates —
    all with no token present. The token is handed only to `git fetch`/`git push` in
    `tools/sync/git-publish.sh`, as a per-command header (never stored in `.git/config`). Pushes are
    fast-forward only; a conflicting or moved branch makes the run fail without overwriting anything.
  - **C · deploy** (`pages: write`, `id-token: write`) runs `static.yml` for the exact pushed commit,
    only when Pages is enabled. `tools/assemble-site.sh` copies an **allowlist** of public files (pages,
    CSS/JS, `Image-Doc/`, `projects/`, `sitemap.xml`). Tooling, tests, `content/`, `data/` (sync state
    and caches), docs and package files are never published.
- No `pull_request` triggers, so untrusted PR code never runs with these permissions or secrets.
- Private repos: the listing endpoint returns public repos only, results are filtered again on
  `private === false`, private repos in GraphQL results are dropped, and the relay never forwards
  names. A test asserts private data never reaches any generated file even if the API leaked it.
- README content is untrusted: rendered with `marked`, then `sanitize-html` with a strict allowlist
  (no scripts, styles, iframes, event handlers, `javascript:`/`data:` URLs, foreign `id`s), and
  sanitized again at render time. External links get `rel="noopener noreferrer nofollow"`.
- All other repository text is HTML-escaped. Repository code is never executed.
- `tests/workflow.test.mjs` parses both workflows and fails if any of these boundaries regress.

## 9. Reliability

- Listing must fully succeed or the run aborts with no changes; the deployed site stays as it was.
- A failure fetching one repo's README/releases keeps that repo's previous data (marked stale).
- A repo that disappears is removed only after `GET /repositories/{id}` confirms it is gone
  (404 → deleted/private) or transferred; on an API error it is kept.
- Renames are detected by stable repository ID: same record, new slug, and the old URL becomes a
  redirect page. Overrides keyed by the old name keep applying.
- Running the sync repeatedly with unchanged data writes nothing (tested).
- Deploys go through GitHub Pages, which only switches to a new version after a successful deploy.
- Job A failing → nothing is uploaded; job B failing (bad artifact, failed validation, conflict,
  rejected push) → nothing is pushed; in every case the live site stays as it was.
- A failed run shows an error in the Actions run summary; the next scheduled run retries.

## 10. Local development

```bash
npm ci
npm test                    # 77 tests: unit, mock-API integration, artifact/git handoff, workflow permissions, relay, end-to-end CLI
npm run lint                # syntax, JSON, markers, secret scan
GITHUB_TOKEN=$(gh auth token) npm run sync      # real sync against your account
npm run render              # rebuild pages from committed data, no API calls
npm run check               # verify generated files are consistent
```

Edit the look of project pages in `templates/project.html` and the appended section at the end of
`style.css`. Don't hand-edit anything between `<!-- github-sync:…:start/end -->` markers or under
`projects/` — it's regenerated.

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| Sync never runs | Actions → enable workflows. Scheduled workflows only run on the default branch. |
| Sync succeeds but nothing deploys | GitHub Pages isn't enabled (see the blocker in section 1). The run summary shows the deploy job as *skipped*. |
| Run fails at **Commit** with 403 | Settings → Actions → General → Workflow permissions; or branch protection on `main` blocks the bot — allow GitHub Actions to push, or remove the rule. |
| Deploy job fails "not allowed to deploy to github-pages" | Settings → Environments → github-pages → deployment branches: allow `main`. |
| "Contribution calendar unavailable" | Add `PORTFOLIO_SYNC_TOKEN` (section 7). |
| Indicator says "may be out of date" | No successful publish in 36 h — open the latest failed run in Actions. |
| A repo is missing | Is it public, not a fork, not archived-excluded, not in `excludeRepos`, no `portfolio-hide` topic, not `hidden`? Run the workflow manually and read the summary. |
| A README image is broken | Images load from `raw.githubusercontent.com`; broken ones are hidden automatically. Use repo-relative paths in the README. |
| Wrong canonical URLs | Detected from Pages automatically; otherwise set `site.url` in the config. |
