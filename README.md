# pi-extensions

Personal workspace for managing [pi](https://pi.dev) extension packages.

This repository is a management repo. Each extension is tracked as a Git
submodule pointing to a personal fork, so local customizations can be committed
and upstream updates can be fetched, reviewed, and merged when needed.

Some upstream projects are monorepos. Those submodules use Git sparse-checkout
and only check out the relevant package directory.

## Layout

| Directory | Pi package path | Upstream | Fork | Default |
|---|---|---|---|---|
| `pi-mcp-adapter` | `pi-mcp-adapter` | `nicobailon/pi-mcp-adapter` | `ginwzy/pi-mcp-adapter` | enabled |
| `pi-subagents` | `pi-subagents` | `nicobailon/pi-subagents` | `ginwzy/pi-subagents` | enabled |
| `pi-tool-display` | `pi-tool-display` | `MasuRii/pi-tool-display` | `ginwzy/pi-tool-display` | enabled |
| `ff-labs-pi-fff` | `ff-labs-pi-fff/packages/pi-fff` | `dmtrKovalenko/fff` | `ginwzy/fff` | enabled |
| `juicesharp-rpiv-ask-user-question` | `packages/rpiv-ask-user-question`, `packages/rpiv-todo` | `juicesharp/rpiv-mono` | `ginwzy/rpiv-mono` | enabled |
| `pi-simplify` | `pi-simplify/packages/pi-simplify` | `MattDevy/pi-extensions` | `ginwzy/pi-extensions-1` | enabled |
| `pi-markdown-preview` | `pi-markdown-preview` | `omaclaren/pi-markdown-preview` | `ginwzy/pi-markdown-preview` | enabled |
| `pi-btw` | `pi-btw` | `dbachelder/pi-btw` | `ginwzy/pi-btw` | enabled |
| `pi-rewind` | `pi-rewind` | `arpagon/pi-rewind` | `ginwzy/pi-rewind` | enabled |
| `pi-glance` | `pi-glance` | `LinYS77/pi-glance` | `ginwzy/pi-glance` | enabled |
| `pi-context-core` | `pi-context-core` | `k0valik/pi-blackhole`, `daynin/nano-context` | `ginwzy/pi-context-core` | enabled |
| `pi-rtk-optimizer` | `pi-rtk-optimizer` | `MasuRii/pi-rtk-optimizer` | `ginwzy/pi-rtk-optimizer` | enabled |
| `pi-nano-context` | `pi-nano-context` | `daynin/nano-context` | `ginwzy/nano-context` | reference |
| `pi-observational-memory` | `pi-observational-memory` | `elpapi42/pi-observational-memory` | `ginwzy/pi-observational-memory` | reference |

`pi-context-core` integrates nano-context and observational-memory behavior. Do not install the standalone `pi-nano-context` or `pi-observational-memory` packages alongside it. `pi-tool-display` contains custom commits for colored tool pills.

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

The configuration script validates every package, backs up `~/.pi/agent/settings.json`, preserves package order and filters, removes duplicate managed entries, and writes the enabled local package paths. Reference-only packages are not installed.

## Daily workflow

Check submodule status:

```bash
./scripts/status.sh
```

Fetch upstream updates without changing local branches:

```bash
./scripts/fetch-upstream.sh
```

Run `./scripts/setup-remotes.sh` first after a fresh clone because Git submodule remote configuration is local and is not stored in `.gitmodules`.

Then inspect a specific submodule:

```bash
cd pi-subagents
git log --oneline main..upstream/main
```

## Updating one extension

For a normal submodule:

```bash
cd pi-subagents
git fetch upstream
git switch main
git merge upstream/main
# resolve conflicts, run tests
git push origin main

cd ..
git add pi-subagents
git commit -m "chore: update pi-subagents"
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
- `pi-nano-context`, `pi-observational-memory`, and `pi-rtk-optimizer` are
  reference-only and are intentionally excluded from the default Pi config.
- The top-level repo records submodule commits, so updates are explicit and
  reviewable.
- Run `/reload` or restart Pi after changing extension code or package sources.
