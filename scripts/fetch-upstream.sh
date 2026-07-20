#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git submodule foreach --quiet '
  echo "--- $name ---"
  if git remote get-url upstream >/dev/null 2>&1; then
    git fetch upstream --prune --tags
  else
    echo "  no upstream remote"
  fi
'
