#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Usage: ./scripts/sync.sh [--install | --skip-install]

Pull the top-level repository, check out its recorded submodule commits, and
install dependencies when the recorded repository version changes. The script
refuses to run when local changes are present.

Options:
  --install       Install dependencies even when the repository is unchanged.
  --skip-install  Never install dependencies after updating.
  -h, --help      Show this help.
EOF
}

install_mode=auto

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install)
      install_mode=always
      ;;
    --skip-install)
      install_mode=never
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

old_head="$(git rev-parse HEAD)"

echo "== Pulling $branch =="
git pull --ff-only
new_head="$(git rev-parse HEAD)"

echo
echo "== Synchronizing submodule configuration =="
git submodule sync --recursive

echo
echo "== Checking out recorded submodule commits =="
git submodule update --init --recursive

should_install=false
if [ "$install_mode" = always ]; then
  should_install=true
elif [ "$install_mode" = auto ] && [ "$old_head" != "$new_head" ]; then
  should_install=true
fi

if [ "$should_install" = true ]; then
  echo
  echo "== Installing dependencies =="
  ./scripts/install-deps.sh
else
  echo
  echo "== Dependencies unchanged; skipping installation (use --install to force) =="
fi

echo
echo "Sync complete. Run /reload in Pi or restart Pi to activate the updates."
