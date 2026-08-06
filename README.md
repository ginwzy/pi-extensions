# pi-extensions

All-in-One [Pi](https://pi.dev) package maintained in this repository. The repository root is the package: `package.json` declares the Pi extension entries that should load from one install.

Package-owned extension source lives under `extensions/`. Remaining submodules are standalone packages that are still installed separately until they are either migrated or removed.

## Layout

| Directory | Runtime/integration path | Upstream | Fork | Default |
|---|---|---|---|---|
| `extensions/pi-tool-display` | `extensions/pi-tool-display` | `MasuRii/pi-tool-display` | package-owned integration | enabled |
| `extensions/pi-tasks` | `extensions/pi-tasks` | `skhoroshavin/pi-supergsd` | package-owned integration | enabled |
| `extensions/pi-rewind` | `extensions/pi-rewind` | `arpagon/pi-rewind` | package-owned integration | enabled |
| `pi-mcp-adapter` | `pi-mcp-adapter` | `nicobailon/pi-mcp-adapter` | `ginwzy/pi-mcp-adapter` | enabled |
| `ff-labs-pi-fff` | `ff-labs-pi-fff/packages/pi-fff` | `dmtrKovalenko/fff` | `ginwzy/fff` | enabled |
| `juicesharp-rpiv-ask-user-question` | `packages/rpiv-ask-user-question`, `packages/rpiv-todo` | `juicesharp/rpiv-mono` | `ginwzy/rpiv-mono` | enabled |
| `pi-simplify` | `pi-simplify/packages/pi-simplify` | `MattDevy/pi-extensions` | `ginwzy/pi-extensions-1` | enabled |
| `pi-btw` | `pi-btw` | `dbachelder/pi-btw` | `ginwzy/pi-btw` | enabled |
| `pi-rtk-optimizer` | `pi-rtk-optimizer` | `MasuRii/pi-rtk-optimizer` | `ginwzy/pi-rtk-optimizer` | enabled |
| `@cortexkit/pi-magic-context` | Pi-managed npm package | `cortexkit/magic-context` | upstream npm release | enabled |

`extensions/pi-tool-display` includes the fork commits for colored tool pills and the Pi 0.83 peer-runtime compatibility metadata from `ginwzy/pi-tool-display` commit `f9bad41f9d880497c36500dee5177c1ea3292ac0`.

`extensions/pi-tasks` was adapted from `skhoroshavin/pi-supergsd` commit `69f0650f64e999cb093e8e554a2a5cc39905ca5e` so its task-branch runtime can be modified as package-owned source.

`extensions/pi-rewind` was adapted from `arpagon/pi-rewind` commit `91611ad87992fb7b635a41ba68f67916ff6e6ae3` so its checkpoint runtime can be modified as package-owned source. It keeps explicit `/rewind`, `Esc Esc`, checkpointing, and fork restore behavior, but does not prompt for file restore on ordinary session tree navigation.

## Root Package

The root manifest exposes:

- `extensions/pi-footer/index.ts`, package-owned footer/status aggregator.
- `extensions/pi-tool-display/index.ts`, package-owned Tool Display source.
- `extensions/pi-tasks/index.ts`, package-owned Task Branches source.
- `extensions/pi-rewind/src/index.ts`, package-owned Rewind source.

The root footer aggregator owns the package's status surface. It renders a custom Pi footer from structured root-owned statuses plus Pi footer data, using semantic glyphs, theme color slots, compact separators, and width-aware priority clipping. Shared terminal UI primitives auto-select Nerd Font glyphs or ASCII fallback, with `PI_EXTENSIONS_ICON_MODE=nerd|ascii|auto` available for explicit control. Task Branches and Rewind publish status into this shared surface instead of writing independent footer strings. External extension statuses are filtered before display so context totals, idle markers, and steady-state transport summaries do not duplicate the footer's resource group.

Task Branches provides `push-task`, `/tasks`, `/start-task`, `/discard-task`, `/finish-task`, `/abort-task`, and `/auto`. Its task-list panel uses the same shared terminal UI primitives as the root footer.

Rewind provides `/rewind`, `Esc Esc`, automatic checkpoints after mutating turns, and fork restore prompts. It intentionally does not prompt on normal session tree navigation so task branches can start and finish without file-restore interruption.

Do not enable the root package alongside standalone packages that it owns. The installer writes the root package, the enabled standalone local package paths, and the upstream Magic Context npm package.

Magic Context owns context compaction and long-term memory. Its setup is intentionally kept in the upstream package rather than duplicated here; after first install, run `npx @cortexkit/magic-context@latest setup --harness pi` to select historian, dreamer, and sidekick models. Its shared configuration lives under `~/.config/cortexkit/` and project overrides live under `.cortexkit/`.

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
