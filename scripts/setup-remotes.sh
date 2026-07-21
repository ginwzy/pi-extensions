#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

set_remote() {
  local dir="$1"
  local name="$2"
  local url="$3"

  if [ ! -d "$dir" ]; then
    echo "skip $dir (submodule not initialized)" >&2
    return
  fi

  if git -C "$dir" remote get-url "$name" >/dev/null 2>&1; then
    git -C "$dir" remote set-url "$name" "$url"
  else
    git -C "$dir" remote add "$name" "$url"
  fi
  echo "$dir: $name -> $url"
}

set_remote pi-rtk-optimizer upstream https://github.com/MasuRii/pi-rtk-optimizer.git
set_remote pi-mcp-adapter upstream https://github.com/nicobailon/pi-mcp-adapter.git
set_remote pi-nano-context upstream https://github.com/daynin/nano-context.git
set_remote pi-observational-memory upstream https://github.com/elpapi42/pi-observational-memory.git
set_remote pi-subagents upstream https://github.com/nicobailon/pi-subagents.git
set_remote pi-tool-display upstream https://github.com/MasuRii/pi-tool-display.git
set_remote ff-labs-pi-fff upstream https://github.com/dmtrKovalenko/fff.git
set_remote juicesharp-rpiv-ask-user-question upstream https://github.com/juicesharp/rpiv-mono.git
set_remote pi-simplify upstream https://github.com/MattDevy/pi-extensions.git
set_remote pi-markdown-preview upstream https://github.com/omaclaren/pi-markdown-preview.git
set_remote pi-btw upstream https://github.com/dbachelder/pi-btw.git
set_remote pi-rewind upstream https://github.com/arpagon/pi-rewind.git
set_remote pi-glance upstream https://github.com/LinYS77/pi-glance.git
set_remote pi-context-core upstream-blackhole https://github.com/k0valik/pi-blackhole.git
set_remote pi-context-core upstream-nano https://github.com/daynin/nano-context.git
set_remote pi-hashline-edit-pro upstream https://github.com/YuGiMob/pi-hashline-edit-pro.git
