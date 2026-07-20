# pi-extensions

Personal workspace for managing [pi](https://pi.dev) extension packages.

This repository is a management repo. Each extension is tracked as a Git
submodule pointing to a personal fork, so local customizations can be committed
and upstream updates can be fetched, reviewed, and merged when needed.

Some upstream projects are monorepos. Those submodules use Git sparse-checkout
and only check out the relevant package directory.

## Layout

| Directory | Pi package path | Upstream | Fork |
|---|---|---|---|
| `pi-rtk-optimizer` | `pi-rtk-optimizer` | `MasuRii/pi-rtk-optimizer` | `ginwzy/pi-rtk-optimizer` |
| `pi-mcp-adapter` | `pi-mcp-adapter` | `nicobailon/pi-mcp-adapter` | `ginwzy/pi-mcp-adapter` |
| `pi-nano-context` | `pi-nano-context` | `daynin/nano-context` | `ginwzy/nano-context` |
| `pi-observational-memory` | `pi-observational-memory` | `elpapi42/pi-observational-memory` | `ginwzy/pi-observational-memory` |
| `pi-subagents` | `pi-subagents` | `nicobailon/pi-subagents` | `ginwzy/pi-subagents` |
| `pi-tool-display` | `pi-tool-display` | `MasuRii/pi-tool-display` | `ginwzy/pi-tool-display` |
| `ff-labs-pi-fff` | `ff-labs-pi-fff/packages/pi-fff` | `dmtrKovalenko/fff` | `ginwzy/fff` |
| `juicesharp-rpiv-ask-user-question` | `juicesharp-rpiv-ask-user-question/packages/rpiv-ask-user-question` | `juicesharp/rpiv-mono` | `ginwzy/rpiv-mono` |
| `pi-simplify` | `pi-simplify/packages/pi-simplify` | `MattDevy/pi-extensions` | `ginwzy/pi-extensions-1` |

`pi-tool-display` contains custom commits for colored tool pills.

## Initial setup

```bash
git clone --recurse-submodules git@github.com:ginwzy/pi-extensions.git
cd pi-extensions
```

If the repo was already cloned without submodules:

```bash
git submodule update --init --recursive
```

Install dependencies for all submodules:

```bash
./scripts/install-deps.sh
```

Register all packages with pi:

```bash
./scripts/pi-install-all.sh
```

This writes local package paths to `~/.pi/agent/settings.json`.

## Daily workflow

Check submodule status:

```bash
./scripts/status.sh
```

Fetch upstream updates without changing local branches:

```bash
./scripts/fetch-upstream.sh
```

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
- The top-level repo records submodule commits, so updates are explicit and
  reviewable.
- Restart pi after changing extension code or installing/removing packages.
