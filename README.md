# pi-extensions

All-in-One [Pi](https://pi.dev) package maintained in this repository. The repository root is the package: `package.json` declares the Pi extension entries that should load from one install.

Package-owned extension source lives under `extensions/`. Remaining submodules are standalone packages that are still installed separately until they are either migrated or removed.

## Layout

| Directory | Runtime/integration path | Upstream | Fork | Default |
|---|---|---|---|---|
| `extensions/pi-tool-display` | `extensions/pi-tool-display` | `MasuRii/pi-tool-display` | package-owned integration | enabled |
| `extensions/pi-tasks` | `extensions/pi-tasks` | `skhoroshavin/pi-supergsd` | package-owned integration | enabled |
| `pi-mcp-adapter` | `pi-mcp-adapter` | `nicobailon/pi-mcp-adapter` | `ginwzy/pi-mcp-adapter` | enabled |
| `ff-labs-pi-fff` | `ff-labs-pi-fff/packages/pi-fff` | `dmtrKovalenko/fff` | `ginwzy/fff` | enabled |
| `juicesharp-rpiv-ask-user-question` | `packages/rpiv-ask-user-question`, `packages/rpiv-todo` | `juicesharp/rpiv-mono` | `ginwzy/rpiv-mono` | enabled |
| `pi-simplify` | `pi-simplify/packages/pi-simplify` | `MattDevy/pi-extensions` | `ginwzy/pi-extensions-1` | enabled |
| `pi-btw` | `pi-btw` | `dbachelder/pi-btw` | `ginwzy/pi-btw` | enabled |
| `pi-rewind` | `pi-rewind` | `arpagon/pi-rewind` | `ginwzy/pi-rewind` | enabled |
| `pi-rtk-optimizer` | `pi-rtk-optimizer` | `MasuRii/pi-rtk-optimizer` | `ginwzy/pi-rtk-optimizer` | enabled |

`extensions/pi-tool-display` includes the fork commits for colored tool pills and the Pi 0.83 peer-runtime compatibility metadata from `ginwzy/pi-tool-display` commit `f9bad41f9d880497c36500dee5177c1ea3292ac0`.

`extensions/pi-tasks` was adapted from `skhoroshavin/pi-supergsd` commit `69f0650f64e999cb093e8e554a2a5cc39905ca5e` so its task-branch runtime can be modified as package-owned source.

## Root Package

The root manifest exposes:

- `extensions/pi-tool-display/index.ts`, package-owned Tool Display source.
- `extensions/pi-tasks/index.ts`, package-owned Task Branches source.

Task Branches provides `push-task`, `/tasks`, `/start-task`, `/discard-task`, `/finish-task`, `/abort-task`, and `/auto`.

Do not enable the root package alongside standalone packages that it owns. The installer writes the root package and the enabled standalone local package paths.

## Initial Setup

```bash
git clone --recurse-submodules git@github.com:ginwzy/pi-extensions.git
cd pi-extensions
```

If the repo was already cloned without submodules:

```bash
git submodule update --init --recursive
```

Install dependencies for the root package and remaining standalone packages:

```bash
./scripts/install-deps.sh
```

Replace the managed npm/package entries in Pi settings with local paths:

```bash
./scripts/pi-install-all.sh
```

The configuration script validates the root and every standalone package, backs up `~/.pi/agent/settings.json`, preserves package order and filters for existing managed packages, removes duplicate managed entries, and writes the enabled local package paths.

## Daily Workflow

Check repository and submodule status:

```bash
./scripts/status.sh
```

After pushing changes, apply the same versions on another computer with:

```bash
./scripts/sync.sh
```

The script refuses to overwrite local changes, fast-forwards the top-level repository, synchronizes submodule URLs, and checks out the exact submodule commits recorded by this repository. Dependencies are installed only when the recorded top-level version changes. Then run `/reload` or restart Pi.

To force dependency installation when the repository is already current:

```bash
./scripts/sync.sh --install
```

To update only the repositories and defer dependency installation:

```bash
./scripts/sync.sh --skip-install
```

## Package Updates

Pi updates packages that are present as package sources in `~/.pi/agent/settings.json` or project `.pi/settings.json`. A source folded into this root package is no longer independently tracked by Pi. Updating it requires updating this repository and then updating the root package.

For this package:

- `pi update --extensions` can update the root `@ginwzy/pi-extensions` package when installed from an unpinned npm or Git source.
- Pinned npm versions and pinned Git refs are fixed; Pi reconciles pinned Git clones to the configured ref but does not advance them.
- Dependencies of standalone packages are installed by their own package installs. Pi updates them only when their package source appears in settings and is updateable.

## Notes

- Sparse submodules have `ignore = dirty` configured because sparse-checkout makes unrelated upstream paths appear deleted in normal `git status`.
- Package-owned runtime source lives under `extensions/`; submodules are not runtime dependencies for migrated source.
- Run `/reload` or restart Pi after changing extension code or package sources.
