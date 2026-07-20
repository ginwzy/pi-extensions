#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

root="$(pwd)"
settings="${PI_SETTINGS_FILE:-$HOME/.pi/agent/settings.json}"

packages=(
  "pi-subagents|pi-subagents"
  "pi-mcp-adapter|pi-mcp-adapter"
  "@ff-labs/pi-fff|ff-labs-pi-fff/packages/pi-fff"
  "pi-simplify|pi-simplify/packages/pi-simplify"
  "@juicesharp/rpiv-ask-user-question|juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question"
  "pi-tool-display|pi-tool-display"
  "pi-markdown-preview|pi-markdown-preview"
  "pi-btw|pi-btw"
  "pi-rewind|pi-rewind"
  "pi-glance|pi-glance"
  "@juicesharp/rpiv-todo|juicesharp-rpiv-ask-user-question/packages/rpiv-todo"
  "pi-context-core|pi-context-core"
)

for spec in "${packages[@]}"; do
  path="${spec#*|}"
  if [ ! -f "$root/$path/package.json" ]; then
    echo "missing $path/package.json; initialize submodules first" >&2
    exit 1
  fi
done

if [ ! -f "$settings" ]; then
  echo "missing Pi settings: $settings" >&2
  exit 1
fi

backup="$settings.backup.$(date +%Y%m%d-%H%M%S)"
cp "$settings" "$backup"

PI_LOCAL_ROOT="$root" PI_SETTINGS_FILE="$settings" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.PI_LOCAL_ROOT;
const settingsPath = process.env.PI_SETTINGS_FILE;
const settingsDir = path.dirname(settingsPath);
const packagePaths = new Map([
  ["pi-subagents", "pi-subagents"],
  ["pi-mcp-adapter", "pi-mcp-adapter"],
  ["@ff-labs/pi-fff", "ff-labs-pi-fff/packages/pi-fff"],
  ["pi-simplify", "pi-simplify/packages/pi-simplify"],
  ["@juicesharp/rpiv-ask-user-question", "juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question"],
  ["pi-tool-display", "pi-tool-display"],
  ["pi-markdown-preview", "pi-markdown-preview"],
  ["pi-btw", "pi-btw"],
  ["pi-rewind", "pi-rewind"],
  ["pi-glance", "pi-glance"],
  ["@juicesharp/rpiv-todo", "juicesharp-rpiv-ask-user-question/packages/rpiv-todo"],
  ["pi-context-core", "pi-context-core"],
]);

const localSources = new Map(
  [...packagePaths].map(([name, relativePath]) => [name, path.join(root, relativePath)]),
);

function sourceOf(entry) {
  return typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.source : undefined;
}

function npmPackageName(source) {
  if (!source.startsWith("npm:")) return undefined;
  for (const name of localSources.keys()) {
    const prefix = `npm:${name}`;
    if (source === prefix || source.startsWith(`${prefix}@`)) return name;
  }
  return undefined;
}

function localPackageName(source) {
  if (/^(npm:|git:|https?:|ssh:|git:)/.test(source)) return undefined;
  const absolute = path.resolve(settingsDir, source);
  try {
    return JSON.parse(fs.readFileSync(path.join(absolute, "package.json"), "utf8")).name;
  } catch {
    return undefined;
  }
}

function packageName(entry) {
  const source = sourceOf(entry);
  if (typeof source !== "string") return undefined;
  return npmPackageName(source) ?? localPackageName(source);
}

function withSource(entry, source) {
  return typeof entry === "string" ? source : { ...entry, source };
}

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const current = Array.isArray(settings.packages) ? settings.packages : [];
const seen = new Set();
const next = [];

for (const entry of current) {
  const name = packageName(entry);
  if (!localSources.has(name)) {
    next.push(entry);
    continue;
  }
  if (seen.has(name)) continue;
  next.push(withSource(entry, localSources.get(name)));
  seen.add(name);
}

for (const [name, source] of localSources) {
  if (!seen.has(name)) next.push(source);
}

settings.packages = next;
const temp = `${settingsPath}.tmp-${process.pid}`;
fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`);
fs.renameSync(temp, settingsPath);

for (const [name, source] of localSources) {
  console.log(`${name} -> ${source}`);
}
NODE

echo "Pi settings backup: $backup"
echo "Reload or restart Pi to activate the local packages."
