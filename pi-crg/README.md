# pi-crg

Pi extension for [code-review-graph](https://github.com/tirth8205/code-review-graph) — a local-first code intelligence graph that builds a persistent map of your codebase so AI tools read only what matters.

## Features

- `/crg build` — full graph build (~10s for 500 files)
- `/crg update` — incremental update (<2s)
- `/crg review` — risk-scored change impact analysis
- `/crg status` — graph statistics
- `/crg watch` — watch mode instructions
- Activity widget shown only while updating or when CRG needs attention
- Auto-update on turn end (opt-in via `PI_CRG_AUTO_UPDATE=1`)
- Automatic `code-review-graph` MCP server registration

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip/pipx
- code-review-graph installed: `pip install code-review-graph` or use via `uvx`

## Install

```bash
pi install /path/to/pi-crg
```

Or from this monorepo:

```bash
./scripts/pi-install-all.sh
```

## Usage

1. Open a project in Pi
2. Run `/crg build` to parse the codebase
3. The graph auto-detects on subsequent sessions
4. Use `/crg review` before code reviews for blast-radius analysis
5. Set `PI_CRG_AUTO_UPDATE=1` to update the graph after turns that changed tracked or untracked files
6. If CRG stores its database externally, set `PI_CRG_DATA_DIR=/path/to/data`

## Widget Modes

Set `PI_CRG_WIDGET` to control the status widget:

| Value | Behavior |
|---|---|
| `activity` | Default. Show only while updating or when an error/stale graph needs attention. |
| `always` | Always show no-graph, ready, updating, and error states. |
| `off` | Never show the widget. `/crg status` notifications still work. |

In the default mode, successful updates clear the widget automatically. Use `/crg status` whenever you need the current graph node count.

## MCP Integration

The extension automatically registers this server in Pi's global `mcp.json`:

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "uvx",
      "args": ["code-review-graph", "serve"],
      "lifecycle": "lazy"
    }
  }
}
```

Existing registrations in standard global or project MCP configuration files are preserved. Set `PI_CRG_REGISTER_MCP=0` to disable automatic registration.

This extension handles lifecycle (build/update/status); MCP handles queries.

## License

MIT
