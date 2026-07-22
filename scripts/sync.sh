#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Usage: ./scripts/sync.sh [--skip-install]

Pull the top-level repository, check out its recorded submodule commits, and
install dependencies. The script refuses to run when local changes are present.

Options:
  --skip-install  Update the repository and submodules without installing dependencies.
  -h, --help      Show this help.
EOF
}

skip_install=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-install)
      skip_install=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ -n "$(git status --porcelain --ignore-submodules=none)" ]; then
  echo "local changes detected; commit or stash them before syncing:" >&2
  git status --short >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "cannot sync while the top-level repository is in detached HEAD state" >&2
  exit 1
fi

echo "== Pulling $branch =="
git pull --ff-only

echo
echo "== Synchronizing submodule configuration =="
git submodule sync --recursive

echo
echo "== Checking out recorded submodule commits =="
git submodule update --init --recursive

if [ "$skip_install" = false ]; then
  echo
echo "== Installing dependencies =="
  ./scripts/install-deps.sh
fi

echo
echo "Sync complete. Run /reload in Pi or restart Pi to activate the updates."
