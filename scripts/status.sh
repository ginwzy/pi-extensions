#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Top-level status =="
git status --short

echo
echo "== Submodule status =="
git submodule status

echo
echo "== Submodule branches and remotes =="
git submodule foreach --quiet '
  echo "--- $name ---"
  git status --short --branch
  git remote -v | sed "s/^/  /"
'
