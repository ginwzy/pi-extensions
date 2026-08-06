# pi-extensions

All-in-One [Pi](https://pi.dev) package and upstream-management workspace.
The repository root is the package: `package.json` declares one Pi extension entry,
and that entry hosts independently owned modules from `src/modules/`.

Runtime source is owned by this package. Retained Git checkouts are upstream references
for review and provenance, not runtime dependencies; Pi's non-recursive Git package
clone therefore does not need submodules to load the migrated modules. GPT Fast Mode
is the first migrated module. Heavier extensions can be carried as pinned package
dependencies, and the remaining extensions continue to run as separate packages until
they reach parity in the All-in-One host.

Some upstream projects are monorepos. Their reference checkouts use Git sparse-checkout
and only check out the relevant package directory.

## Layout

| Directory | Runtime/integration path | Upstream | Fork | Default |
|---|---|---|---|---|
| `upstream-references/pi-gpt-fast-mode` | `src/modules/gpt-fast-mode` | `tunnckoCore/pi-gpt-fast-mode` | package-owned integration | enabled |
| `node_modules/pi-mcp-adapter` | dependency-carried external package | `nicobailon/pi-mcp-adapter` | `ginwzy/pi-mcp-adapter` | enabled |
| `pi-tool-display` | `pi-tool-display` | `MasuRii/pi-tool-display` | `ginwzy/pi-tool-display` | enabled |
| `ff-labs-pi-fff` | `ff-labs-pi-fff/packages/pi-fff` | `dmtrKovalenko/fff` | `ginwzy/fff` | enabled |
| `juicesharp-rpiv-ask-user-question` | `packages/rpiv-ask-user-question`, `packages/rpiv-todo` | `juicesharp/rpiv-mono` | `ginwzy/rpiv-mono` | enabled |
| `pi-simplify` | `pi-simplify/packages/pi-simplify` | `MattDevy/pi-extensions` | `ginwzy/pi-extensions-1` | enabled |
| `pi-btw` | `pi-btw` | `dbachelder/pi-btw` | `ginwzy/pi-btw` | enabled |
| `pi-rewind` | `pi-rewind` | `arpagon/pi-rewind` | `ginwzy/pi-rewind` | enabled |
| `pi-rtk-optimizer` | `pi-rtk-optimizer` | `MasuRii/pi-rtk-optimizer` | `ginwzy/pi-rtk-optimizer` | enabled |

`pi-tool-display` contains custom commits for colored tool pills.

## All-in-One package

The root manifest exposes the All-in-One host extension plus selected dependency-carried
external package entrypoints. The host registers
modules in deterministic order, rejects cross-module registration collisions, isolates
module-level API overrides, and cleans up shared event-bus subscriptions at shutdown.
The first module, GPT Fast Mode, preserves its `/fast` command, shortcut, provider hook,
and state event behavior.

For a local package smoke test or a direct Git installation:

```bash
pi install /absolute/path/to/pi-extensions
pi install git:github.com/ginwzy/pi-extensions
```

Do not enable the root package alongside standalone packages that it owns or carries.
The installer below replaces standalone GPT Fast Mode npm, Git, and local entries with
the All-in-One root, keeps dependency-carried external packages out of settings, and
writes the remaining enabled local package paths.
Persistent All-in-One module activation is intentionally deferred; the current slice
loads GPT Fast Mode by default, while its existing Pi settings control the feature's
initial on/off state.

`skills/upstream-review` is included in the package files for project maintenance but
is explicitly excluded by the negative `package.json#pi.skills` pattern. Package
filters cannot re-enable a manifest-excluded skill. Only this repository's
`.pi/settings.json` loads it, so installing the package elsewhere does not expose it.

## Initial setup

```bash
git clone --recurse-submodules git@github.com:ginwzy/pi-extensions.git
cd pi-extensions
```

If the repo was already cloned without submodules:

```bash
git submodule update --init --recursive
```

Configure upstream remotes used by the update workflow:

```bash
./scripts/setup-remotes.sh
```

Install dependencies for the enabled packages:

```bash
./scripts/install-deps.sh
```

Replace the managed npm/package entries in Pi settings with local paths:

```bash
./scripts/pi-install-all.sh
```

The configuration script validates the root and every standalone package, backs up `~/.pi/agent/settings.json`, preserves package order and filters for existing managed packages, removes duplicate managed entries, replaces standalone GPT Fast Mode with the All-in-One root, and writes the remaining enabled local package paths. Reference-only packages are not installed.
## Daily workflow

Check submodule status:

```bash
./scripts/status.sh
```

Fetch upstream updates without changing local branches:

```bash
./scripts/fetch-upstream.sh
```

## AI-assisted upstream review

The project-local `.pi/settings.json` explicitly loads the packaged `upstream-review`
skill. It is available in this repository but is omitted from package resource
discovery when the All-in-One package is installed in another project.

Start a review with:

```text
/skill:upstream-review check all
```

The review phase may fetch and inspect upstream changes and write a report, but it
is not authorized to modify extension code. The inspector enforces that its output
stays below `.upstream-reviews/`. Select candidate IDs such as `U01` to authorize an
isolated implementation. After the AI reports the implementation and observed
verification results, merging requires a second explicit approval.

Upstream sources are listed in `upstreams.json`. Empty scopes intentionally mean the
whole reference repository. For migrated modules, `integratedCommit` is the latest
commit from the declared upstream history incorporated into package-owned source;
`localCommit` is only the current reference-checkout state. Generated snapshots and
reports are written below `.upstream-reviews/` and are intentionally ignored by Git.

Run `./scripts/setup-remotes.sh` first after a fresh clone because Git submodule remote configuration is local and is not stored in `.gitmodules`.

Then inspect a specific submodule:

```bash
cd pi-tool-display
git log --oneline main..upstream/main
```

## Syncing updates from another computer

After pushing both the changed extension commits and the updated submodule
pointers in this management repository, apply those versions on another
computer with:

```bash
./scripts/sync.sh
```

The script refuses to overwrite local changes, fast-forwards the top-level
repository, synchronizes submodule URLs, and checks out the exact submodule
commits recorded by this repository. Dependencies are installed only when the
recorded top-level version changes. Then run `/reload` or restart Pi.

To force dependency installation when the repository is already current:

```bash
./scripts/sync.sh --install
```

To update only the repositories and defer dependency installation:

```bash
./scripts/sync.sh --skip-install
```

## Updating one extension

For a normal submodule:

```bash
cd pi-tool-display
git fetch upstream
git switch main
git merge upstream/main
# resolve conflicts, run tests
git push origin main

cd ..
git add pi-tool-display
git commit -m "chore: update pi-tool-display"
```

For a sparse monorepo submodule, the workflow is the same, but the package lives
under `packages/<name>` inside the submodule.

Example:

```bash
cd ff-labs-pi-fff
git fetch upstream
git switch main
git merge upstream/main
git push origin main

cd ..
git add ff-labs-pi-fff
git commit -m "chore: update ff-labs-pi-fff"
```

## Making custom changes

Edit files inside the submodule directory, commit inside the submodule, push to
your fork, then update the pointer in this repo:

```bash
cd pi-tool-display
git switch main
# edit files
git commit -am "feat: custom change"
git push origin main

cd ..
git add pi-tool-display
git commit -m "chore: update pi-tool-display pointer"
```

## Notes

- Sparse submodules have `ignore = dirty` configured because sparse-checkout
  makes unrelated upstream paths appear deleted in normal `git status`.
- `pi-rtk-optimizer` is reference-only and is intentionally excluded from the default Pi config.
- Migrated runtime source lives under `src/modules/`; upstream checkouts are review references rather than runtime dependencies.
- The top-level repo records retained submodule commits, so updates are explicit and
  reviewable.
- Run `/reload` or restart Pi after changing extension code or package sources.
