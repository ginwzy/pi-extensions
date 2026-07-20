#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

install_dir() {
  local dir="$1"
  if [ -f "$dir/package-lock.json" ]; then
    echo "npm ci in $dir"
    npm ci --prefix "$dir"
  elif [ -f "$dir/package.json" ]; then
    echo "npm install in $dir"
    npm install --prefix "$dir"
  else
    echo "skip $dir (no package.json)"
  fi
}

# Full-repo submodules: package.json is at the submodule root.
for dir in pi-rtk-optimizer pi-mcp-adapter pi-nano-context pi-observational-memory pi-subagents pi-tool-display; do
  if [ -d "$dir" ]; then
    install_dir "$dir"
  fi
done

# Sparse monorepo submodules: package.json is inside packages/<name>.
for dir in \
  ff-labs-pi-fff/packages/pi-fff \
  juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question \
  pi-simplify/packages/pi-simplify
do
  if [ -d "$dir" ]; then
    install_dir "$dir"
  fi
done
