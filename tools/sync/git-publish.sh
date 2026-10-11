#!/usr/bin/env bash
# Job B helper: rebase the sync commit onto the latest branch, or push it. git only — no node, no npm.
#   PUSH_TOKEN=… BRANCH=main tools/sync/git-publish.sh rebase
#   PUSH_TOKEN=… BRANCH=main tools/sync/git-publish.sh push
# The token is passed per command as an HTTP header (never written to .git/config) and only for
# https://github.com/ remotes. Pushes are plain fast-forwards: never forced.
set -euo pipefail
: "${BRANCH:?BRANCH is required}"
remote="${REMOTE:-origin}"
git_auth() {
  if [ -n "${PUSH_TOKEN:-}" ]; then
    git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$PUSH_TOKEN" | base64 | tr -d '\n')" "$@"
  else
    git "$@"
  fi
}
case "${1:-}" in
  rebase)
    git_auth fetch -q "$remote" "$BRANCH"
    if ! git rebase -q "$remote/$BRANCH"; then
      git rebase --abort || true
      echo "::error::Generated files conflict with a newer commit on $BRANCH. Nothing was pushed; the next run re-syncs from the new state."
      exit 1
    fi
    ;;
  push)
    if git_auth push -q "$remote" "HEAD:refs/heads/$BRANCH"; then
      echo "sha=$(git rev-parse HEAD)"
    else
      echo "::error::Push was rejected (the branch moved). Nothing was overwritten; the next run will retry."
      exit 1
    fi
    ;;
  *) echo "usage: $0 rebase|push" >&2; exit 2 ;;
esac
