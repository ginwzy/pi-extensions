/**
 * /crg slash commands for code-review-graph.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { runCrg, graphExists } from "./cli.js";
import type { CrgState } from "./widget.js";
import { updateWidget } from "./widget.js";

/** Parse status output to extract node count. */
function parseNodeCount(output: string): number | null {
  const match = output.match(/(\d[\d,]*)\s*(?:nodes|symbols)/i);
  if (match) return parseInt(match[1].replace(/,/g, ""), 10);
  const totalMatch = output.match(/Total nodes:\s*(\d[\d,]*)/i);
  if (totalMatch) return parseInt(totalMatch[1].replace(/,/g, ""), 10);
  return null;
}

export function registerCommands(pi: ExtensionAPI, state: CrgState): void {
  pi.registerCommand("crg", {
    description: "code-review-graph: build, update, review, status",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const sub = args.trim().split(/\s+/)[0] ?? "status";
      const cwd = ctx.cwd;

      switch (sub) {
        case "build":
          return handleBuild(pi, ctx, state, cwd);
        case "update":
          return handleUpdate(pi, ctx, state, cwd);
        case "review":
          return handleReview(pi, ctx, cwd);
        case "status":
          return handleStatus(ctx, state, cwd);
        case "watch":
          return handleWatch(ctx, cwd);
        default:
          ctx.ui.notify(`Unknown: ${sub}. Usage: /crg <build|update|review|status|watch>`, "warning");
      }
    },
  });
}

async function handleBuild(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: CrgState, cwd: string): Promise<void> {
  ctx.ui.notify("Building code graph...", "info");
  state.updating = true;
  updateWidget(state, ctx);

  const result = await runCrg(["build"], cwd, 120_000);

  state.updating = false;
  if (result.ok) {
    state.graphReady = true;
    state.lastBuild = "just now";
    state.nodeCount = parseNodeCount(result.stdout);
    updateWidget(state, ctx);
    ctx.ui.notify("Graph built successfully", "info");
    pi.sendMessage({
      customType: "crg-output",
      content: result.stdout.slice(0, 800),
      display: true,
    });
  } else {
    updateWidget(state, ctx);
    ctx.ui.notify("Graph build failed", "error");
    pi.sendMessage({
      customType: "crg-output",
      content: `Build failed:\n${(result.stderr || result.stdout).slice(0, 500)}`,
      display: true,
    });
  }
}

async function handleUpdate(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: CrgState, cwd: string): Promise<void> {
  if (!graphExists(cwd)) {
    ctx.ui.notify("No graph found. Run /crg build first.", "warning");
    return;
  }

  state.updating = true;
  updateWidget(state, ctx);

  const result = await runCrg(["update"], cwd, 60_000);

  state.updating = false;
  if (result.ok) {
    state.lastBuild = "just now";
    state.nodeCount = parseNodeCount(result.stdout) ?? state.nodeCount;
    updateWidget(state, ctx);
    ctx.ui.notify("Graph updated", "info");
  } else {
    updateWidget(state, ctx);
    ctx.ui.notify("Graph update failed", "error");
  }
}

async function handleReview(pi: ExtensionAPI, ctx: ExtensionCommandContext, cwd: string): Promise<void> {
  if (!graphExists(cwd)) {
    ctx.ui.notify("No graph found. Run /crg build first.", "warning");
    return;
  }

  ctx.ui.notify("Analyzing changes...", "info");
  const result = await runCrg(["detect-changes", "--brief"], cwd, 60_000);

  if (result.ok) {
    pi.sendMessage({
      customType: "crg-output",
      content: result.stdout || "No changes detected.",
      display: true,
    });
  } else {
    ctx.ui.notify("Review analysis failed", "error");
    pi.sendMessage({
      customType: "crg-output",
      content: `Review failed:\n${(result.stderr || result.stdout).slice(0, 500)}`,
      display: true,
    });
  }
}

async function handleStatus(ctx: ExtensionCommandContext, state: CrgState, cwd: string): Promise<void> {
  if (!graphExists(cwd)) {
    state.graphReady = false;
    updateWidget(state, ctx);
    ctx.ui.notify("No graph database found. Run /crg build.", "warning");
    return;
  }

  const result = await runCrg(["status"], cwd, 15_000);
  if (result.ok) {
    state.graphReady = true;
    state.nodeCount = parseNodeCount(result.stdout);
    state.lastBuild = "ready";
    updateWidget(state, ctx);
    ctx.ui.notify(result.stdout.slice(0, 200), "info");
  } else {
    ctx.ui.notify("Status check failed", "error");
  }
}

async function handleWatch(ctx: ExtensionCommandContext, cwd: string): Promise<void> {
  if (!graphExists(cwd)) {
    ctx.ui.notify("No graph found. Run /crg build first.", "warning");
    return;
  }
  ctx.ui.notify("Run: code-review-graph watch & (or: code-review-graph daemon start)", "info");
}
