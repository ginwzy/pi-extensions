#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

root="$(pwd)"
settings="${PI_SETTINGS_FILE:-$HOME/.pi/agent/settings.json}"

packages=(
  "@ginwzy/pi-extensions|."
  "pi-rtk-optimizer|pi-rtk-optimizer"
  "pi-mcp-adapter|pi-mcp-adapter"
  "@ff-labs/pi-fff|ff-labs-pi-fff/packages/pi-fff"
  "pi-simplify|pi-simplify/packages/pi-simplify"
  "@juicesharp/rpiv-ask-user-question|juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question"
  "pi-tool-display|pi-tool-display"
  "pi-btw|pi-btw"
  "pi-rewind|pi-rewind"
  "@juicesharp/rpiv-todo|juicesharp-rpiv-ask-user-question/packages/rpiv-todo"
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
  ["@ginwzy/pi-extensions", "."],
  ["pi-rtk-optimizer", "pi-rtk-optimizer"],
  ["pi-mcp-adapter", "pi-mcp-adapter"],
  ["@ff-labs/pi-fff", "ff-labs-pi-fff/packages/pi-fff"],
  ["pi-simplify", "pi-simplify/packages/pi-simplify"],
  ["@juicesharp/rpiv-ask-user-question", "juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question"],
  ["pi-tool-display", "pi-tool-display"],
  ["pi-btw", "pi-btw"],
  ["pi-rewind", "pi-rewind"],
  ["@juicesharp/rpiv-todo", "juicesharp-rpiv-ask-user-question/packages/rpiv-todo"],
]);

const localSources = new Map(
  [...packagePaths].map(([name, relativePath]) => [name, path.join(root, relativePath)]),
);
const rootPackageName = "@ginwzy/pi-extensions";
const standaloneGptFastModeName = "@tunnckocore/pi-gpt-fast-mode";
const removedPiRewindName = "@ayulab/pi-rewind";
const recognizedNpmNames = new Set([...localSources.keys(), standaloneGptFastModeName, removedPiRewindName]);

function sourceOf(entry) {
  return typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.source : undefined;
}

function npmPackageName(source) {
  if (typeof source !== "string" || !source.startsWith("npm:")) return undefined;
  for (const name of recognizedNpmNames) {
    const prefix = `npm:${name}`;
    if (source === prefix || (source.startsWith(`${prefix}@`) && source.length > prefix.length + 1)) return name;
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

function gitPackageName(source) {
  const normalized = source.toLowerCase().replace(/^git\+/, "").replace(/#.*$/, "").replace(/\.git$/, "");
  if (/[@:/]github\.com[/:]tunnckocore\/pi-gpt-fast-mode$/.test(normalized)) {
    return standaloneGptFastModeName;
  }
  if (/[@:/]github\.com[/:]ginwzy\/pi-extensions$/.test(normalized)) {
    return rootPackageName;
  }
  return undefined;
}

function packageName(entry) {
  const source = sourceOf(entry);
  if (typeof source !== "string") return undefined;
  return npmPackageName(source) ?? gitPackageName(source) ?? localPackageName(source);
}

function withSource(entry, source) {
  return typeof entry === "string" ? source : { ...entry, source };
}

function migrateStandaloneGptEntry(entry, source) {
  if (typeof entry === "string") return source;
  const { extensions, skills, prompts, themes, ...rest } = entry;
  return { ...rest, source };
}

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const current = Array.isArray(settings.packages) ? settings.packages : [];
const hasRootEntry = current.some((entry) => packageName(entry) === rootPackageName);
const seen = new Set();
const next = [];

for (const entry of current) {
  const name = packageName(entry);
  if (name === standaloneGptFastModeName) {
    if (!hasRootEntry && !seen.has(rootPackageName)) {
      next.push(migrateStandaloneGptEntry(entry, localSources.get(rootPackageName)));
      seen.add(rootPackageName);
    }
    continue;
  }
  if (npmPackageName(sourceOf(entry)) === removedPiRewindName) {
    continue;
  }
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
