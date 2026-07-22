# pi-crg

Pi extension for [code-review-graph](https://github.com/tirth8205/code-review-graph) — a local-first code intelligence graph that builds a persistent map of your codebase so AI tools read only what matters.

## Features

- `/crg build` — full graph build (~10s for 500 files)
- `/crg update` — incremental update (<2s)
- `/crg review` — risk-scored change impact analysis
- `/crg status` — graph statistics
- `/crg watch` — watch mode instructions
- Status widget showing graph state below the editor
- Auto-update on turn end (opt-in via `PI_CRG_AUTO_UPDATE=1`)

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
5. Set `PI_CRG_AUTO_UPDATE=1` to keep the graph fresh automatically

## MCP Integration

For full tool access (28 query tools), also configure the MCP server:

```json
{
  "code-review-graph": {
    "command": "uvx",
    "args": ["code-review-graph", "serve"]
  }
}
```

This extension handles lifecycle (build/update/status); MCP handles queries.

## License

MIT
