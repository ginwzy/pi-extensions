#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

root="$(pwd)"

packages=(
  "$root/pi-rtk-optimizer"
  "$root/pi-mcp-adapter"
  "$root/pi-nano-context"
  "$root/pi-observational-memory"
  "$root/pi-subagents"
  "$root/pi-tool-display"
  "$root/ff-labs-pi-fff/packages/pi-fff"
  "$root/juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question"
  "$root/pi-simplify/packages/pi-simplify"
)

for pkg in "${packages[@]}"; do
  if [ -f "$pkg/package.json" ]; then
    echo "pi install $pkg"
    pi install "$pkg"
  else
    echo "skip $pkg (missing package.json; run: git submodule update --init --recursive)" >&2
  fi
done
