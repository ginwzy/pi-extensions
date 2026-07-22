/**
 * pi-crg — code-review-graph integration for Pi
 *
 * Provides:
 *   /crg build   — full graph build
 *   /crg update  — incremental update
 *   /crg review  — risk-scored change analysis
 *   /crg status  — graph statistics
 *   /crg watch   — watch mode instructions
 *
 * Hooks:
 *   session_start — detect existing graph, show status widget
 *   turn_end      — auto-update graph if enabled and files changed
 *
 * Config (via env):
 *   PI_CRG_AUTO_UPDATE=1  — enable auto-update on turn_end (default: off)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  SessionStartEvent,
  TurnEndEvent,
  SessionShutdownEvent,
} from "@earendil-works/pi-coding-agent";
import { graphExists, runCrg } from "./cli.js";
import { registerCommands } from "./commands.js";
import { createInitialState, updateWidget, clearWidget, type CrgState } from "./widget.js";

export default function (pi: ExtensionAPI) {
  const state: CrgState = createInitialState();
  let autoUpdate = process.env.PI_CRG_AUTO_UPDATE === "1";
  let sessionCwd: string | null = null;

  // Register /crg commands
  registerCommands(pi, state);

  // ─── before_agent_start: inject CRG context into system prompt ──────────
  pi.on("before_agent_start", (event: BeforeAgentStartEvent, _ctx: ExtensionContext): BeforeAgentStartEventResult | undefined => {
    if (!state.graphReady || !sessionCwd) return undefined;

    const crgContext = [
      "",
      "[code-review-graph] A knowledge graph is available for this codebase.",
      "When answering questions about code structure, dependencies, or impact of changes,",
      "prefer using code-review-graph MCP tools before scanning files manually:",
      "- semantic_search_nodes: find classes, functions, or types by name/keyword",
      "- query_graph (callers_of, callees_of, imports_of, importers_of, tests_for, file_summary): explore relationships",
      "- get_impact_radius: understand blast radius of changes",
      "- get_review_context: token-efficient review context",
      "- detect_changes: risk-scored change analysis",
      "- get_affected_flows: execution paths impacted by changes",
      "Fall back to grep/read only when the graph does not cover what you need.",
      "This saves significant tokens by avoiding full codebase scans.",
    ].join("\n");

    return { systemPrompt: event.systemPrompt + crgContext };
  });

  // ─── session_start: detect graph and show widget ───────────────────────
  pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
    sessionCwd = ctx.cwd;
    autoUpdate = process.env.PI_CRG_AUTO_UPDATE === "1";

    if (!graphExists(ctx.cwd)) {
      state.graphReady = false;
      if (ctx.hasUI) updateWidget(state, ctx);
      return;
    }

    // Graph exists — fetch status in background
    state.graphReady = true;
    if (ctx.hasUI) updateWidget(state, ctx);

    const result = await runCrg(["status"], ctx.cwd, 10_000);
    if (result.ok) {
      const nodeMatch = result.stdout.match(/(\d[\d,]*)\s*(?:nodes|symbols)/i);
      if (nodeMatch) state.nodeCount = parseInt(nodeMatch[1].replace(/,/g, ""), 10);
      state.lastBuild = "ready";
    }
    if (ctx.hasUI) updateWidget(state, ctx);
  });

  // ─── turn_end: auto-update if enabled ──────────────────────────────────
  pi.on("turn_end", async (_event: TurnEndEvent, ctx: ExtensionContext) => {
    if (!autoUpdate || !sessionCwd || !state.graphReady) return;
    if (state.updating) return;

    state.updating = true;
    if (ctx.hasUI) updateWidget(state, ctx);

    const result = await runCrg(["update"], sessionCwd, 30_000);

    state.updating = false;
    if (result.ok) {
      state.lastBuild = "just now";
      const nodeMatch = result.stdout.match(/(\d[\d,]*)\s*(?:nodes|symbols)/i);
      if (nodeMatch) state.nodeCount = parseInt(nodeMatch[1].replace(/,/g, ""), 10);
    }
    if (ctx.hasUI) updateWidget(state, ctx);
  });

  // ─── session_shutdown: cleanup widget ──────────────────────────────────
  pi.on("session_shutdown", (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
    clearWidget(ctx);
    sessionCwd = null;
  });
}
