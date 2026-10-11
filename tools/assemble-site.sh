#!/usr/bin/env bash
# Copy ONLY the public website into an output directory (default: _site) for GitHub Pages.
# Allowlist, not denylist: tooling, tests, content/, data/ (sync state + caches), docs, workflows,
# package files and anything new are excluded unless added here on purpose.
set -euo pipefail
out="${1:-_site}"
rm -rf "$out"
mkdir -p "$out"
for f in index.html about.html projects.html journey.html style.css script.js github-sync.js sitemap.xml robots.txt favicon.ico CNAME; do
  if [ -f "$f" ]; then cp "$f" "$out/"; fi
done
for d in Image-Doc projects; do
  if [ -d "$d" ]; then cp -R "$d" "$out/"; fi
done
if [ -n "$(find "$out" -type l)" ]; then echo "error: symlinks are not allowed in the site" >&2; exit 1; fi
test -f "$out/index.html"
echo "Assembled $(find "$out" -type f | wc -l | tr -d ' ') files into $out"
