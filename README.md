# pi-extensions

Personal pi extension packages. Installed via local paths in `~/.pi/agent/settings.json`.

## Packages

| Directory | Package | Description |
|-----------|---------|-------------|
| `pi-observational-memory` | pi-observational-memory | Observational memory (compacted memory + recall) |
| `pi-subagents` | pi-subagents | Subagent orchestration (single/chain/parallel/async) |
| `pi-mcp-adapter` | pi-mcp-adapter | MCP server gateway adapter |
| `ff-labs-pi-fff` | @ff-labs/pi-fff | Fast file search (ffgrep / fffind) |
| `pi-simplify` | pi-simplify | Simplification helpers |
| `pi-nano-context` | pi-nano-context | Lightweight context management |
| `juicesharp-rpiv-ask-user-question` | @juicesharp/rpiv-ask-user-question | Structured user question UI |
| `pi-tool-display` | pi-tool-display | Tool call display |

## Usage

On a new machine, clone this repo and install each package:

```bash
git clone <repo-url> ~/projects/pi-extensions
cd ~/projects/pi-extensions
for dir in */; do
  [ -f "$dir/package.json" ] && pi install "/home/users/nate/projects/pi-extensions/${dir%/}"
done
```

Or manually add local paths to `~/.pi/agent/settings.json`.

## Modifying

Edit any package in place, then restart pi (or start a new session) to pick up changes.
Commit and push to sync across machines.
