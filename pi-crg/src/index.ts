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
 *   PI_CRG_AUTO_UPDATE=1        — enable auto-update on turn_end (default: off)
 *   PI_CRG_WIDGET=activity      — activity | always | off (default: activity)
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
import { getCrgStatus, getWorkspaceFingerprint, runCrg } from "./cli.js";
import { registerCommands } from "./commands.js";
import { ensureCrgMcpRegistration } from "./mcp-registration.js";
import { registerCrgMessageRenderer } from "./renderer.js";
import { createInitialState, resolveWidgetMode, updateWidget, clearWidget, type CrgState } from "./widget.js";

export default function (pi: ExtensionAPI) {
  const state: CrgState = createInitialState();
  const mcpRegistration = ensureCrgMcpRegistration();
  let autoUpdate = process.env.PI_CRG_AUTO_UPDATE === "1";
  let sessionCwd: string | null = null;
  let missingGraphNotified = false;

  registerCrgMessageRenderer(pi);
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

  // Detect graph state through CRG so external data directories remain supported.
  pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
    sessionCwd = ctx.cwd;
    autoUpdate = process.env.PI_CRG_AUTO_UPDATE === "1";
    state.widgetMode = resolveWidgetMode();
    if (mcpRegistration.status === "registered" && ctx.hasUI) {
      ctx.ui.notify("Registered code-review-graph MCP server", "info");
    } else if (mcpRegistration.status === "error" && ctx.hasUI) {
      ctx.ui.notify(`CRG MCP registration failed: ${mcpRegistration.error}`, "error");
    }
    state.workspaceFingerprint = await getWorkspaceFingerprint(ctx.cwd);

    const result = await getCrgStatus(ctx.cwd);
    if (result.status) {
      state.graphReady = true;
      state.nodeCount = result.status.nodes;
      state.lastBuild = "ready";
      state.lastError = null;
    } else {
      state.graphReady = false;
      state.nodeCount = null;
      state.lastBuild = null;
      state.lastError = result.error;
    }
    if (ctx.hasUI) {
      updateWidget(state, ctx);
      if (!state.graphReady && !state.lastError && state.widgetMode === "activity" && !missingGraphNotified) {
        missingGraphNotified = true;
        ctx.ui.notify("CRG graph is not built for this workspace. Run /crg build when needed.", "info");
      }
    }
  });

  // Update only when the workspace contents changed since the last successful check.
  pi.on("turn_end", async (_event: TurnEndEvent, ctx: ExtensionContext) => {
    if (!autoUpdate || !sessionCwd || !state.graphReady || state.updating) return;

    const currentFingerprint = await getWorkspaceFingerprint(sessionCwd);
    if (currentFingerprint === null || currentFingerprint === state.workspaceFingerprint) return;

    state.updating = true;
    state.lastError = null;
    if (ctx.hasUI) updateWidget(state, ctx);

    const result = await runCrg(["update"], sessionCwd, 30_000);
    state.updating = false;
    if (result.ok) {
      state.workspaceFingerprint = currentFingerprint;
      state.lastBuild = "just now";
      const status = await getCrgStatus(sessionCwd);
      if (status.status) state.nodeCount = status.status.nodes;
    } else {
      state.lastError = (result.stderr || result.stdout || "update failed").replace(/\s+/g, " ").slice(0, 160);
    }
    if (ctx.hasUI) updateWidget(state, ctx);
  });

  // ─── session_shutdown: cleanup widget ──────────────────────────────────
  pi.on("session_shutdown", (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
    clearWidget(ctx);
    sessionCwd = null;
    state.workspaceFingerprint = null;
  });
}
