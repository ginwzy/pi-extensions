#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm_install() {
  local dir="$1"
  if [ ! -f "$dir/package.json" ]; then
    echo "skip $dir (no package.json; initialize submodules first)" >&2
    return
  fi

  if [ -f "$dir/package-lock.json" ]; then
    echo "npm ci in $dir"
    npm ci --prefix "$dir"
  else
    echo "npm install in $dir"
    npm install --prefix "$dir" --no-package-lock
  fi
}

# Root package dependencies include bundled external packages.
npm_install "."

# Standalone packages currently enabled in Pi.
for dir in \
  pi-btw \
  pi-rewind
do
  npm_install "$dir"
done

# Enabled packages contained in sparse monorepo submodules.
for dir in \
  ff-labs-pi-fff \
  juicesharp-rpiv-ask-user-question \
  pi-simplify
do
  npm_install "$dir"
done

echo "npm run build in ff-labs-pi-fff/packages/fff-node"
npm run build --prefix ff-labs-pi-fff/packages/fff-node

fff_version="$(git -C ff-labs-pi-fff describe --tags --abbrev=0 --match 'v[0-9]*' | sed 's/^v//')"
fff_binary_package="$(
  cd ff-labs-pi-fff/packages/pi-fff
  node --input-type=module -e \
    "import('@ff-labs/fff-node').then(m => process.stdout.write(m.getNpmPackageName()))"
)"
echo "installing $fff_binary_package@$fff_version"
npm install \
  --prefix ff-labs-pi-fff/packages/fff-node \
  --workspaces=false \
  --no-save \
  --package-lock=false \
  "$fff_binary_package@$fff_version"

echo "npm run build in pi-simplify/packages/pi-simplify"
npm run build --prefix pi-simplify/packages/pi-simplify
