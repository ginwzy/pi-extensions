#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git submodule foreach --quiet '
  echo "--- $name ---"
  remotes="$(git remote | grep "^upstream" || true)"
  if [ -z "$remotes" ]; then
    echo "  no upstream remote"
  else
    for remote in $remotes; do
      git fetch "$remote" --prune --tags
    done
  fi
'
