/** Slash commands for code-review-graph. */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getCrgStatus, getWorkspaceFingerprint, runCrg } from "./cli.js";
import type { CrgState } from "./widget.js";
import { updateWidget } from "./widget.js";

function shortError(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160) || "command failed";
}

function beginUpdate(state: CrgState, ctx: ExtensionCommandContext): boolean {
  if (state.updating) {
    ctx.ui.notify("A CRG build or update is already running.", "warning");
    return false;
  }
  state.updating = true;
  state.lastError = null;
  updateWidget(state, ctx);
  return true;
}

async function refreshStatus(state: CrgState, cwd: string): Promise<boolean> {
  const result = await getCrgStatus(cwd);
  if (!result.status) {
    state.graphReady = false;
    state.nodeCount = null;
    state.lastError = result.error;
    return false;
  }
  state.graphReady = true;
  state.nodeCount = result.status.nodes;
  state.lastError = null;
  return true;
}

export function registerCommands(pi: ExtensionAPI, state: CrgState): void {
  pi.registerCommand("crg", {
    description: "code-review-graph: build, update, review, status",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const sub = args.trim().split(/\s+/)[0] || "status";
      switch (sub) {
        case "build": return handleBuild(pi, ctx, state);
        case "update": return handleUpdate(ctx, state);
        case "review": return handleReview(pi, ctx, state);
        case "status": return handleStatus(ctx, state);
        case "watch": return handleWatch(ctx, state);
        default: ctx.ui.notify(`Unknown: ${sub}. Usage: /crg <build|update|review|status|watch>`, "warning");
      }
    },
  });
}

async function handleBuild(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: CrgState): Promise<void> {
  if (!beginUpdate(state, ctx)) return;
  ctx.ui.notify("Building code graph...", "info");
  const result = await runCrg(["build"], ctx.cwd, 120_000);
  state.updating = false;

  if (result.ok) {
    await refreshStatus(state, ctx.cwd);
    state.workspaceFingerprint = await getWorkspaceFingerprint(ctx.cwd);
    state.lastBuild = "just now";
    ctx.ui.notify("Graph built successfully", "info");
    pi.sendMessage({
      customType: "crg-output",
      content: result.stdout.slice(0, 800),
      display: true,
      details: { command: "build", isError: false },
    });
  } else {
    state.lastError = shortError(result.stderr || result.stdout);
    ctx.ui.notify("Graph build failed", "error");
    pi.sendMessage({
      customType: "crg-output",
      content: `Build failed:\n${state.lastError}`,
      display: true,
      details: { command: "build", isError: true },
    });
  }
  updateWidget(state, ctx);
}

async function handleUpdate(ctx: ExtensionCommandContext, state: CrgState): Promise<void> {
  if (!(await refreshStatus(state, ctx.cwd))) {
    updateWidget(state, ctx);
    ctx.ui.notify("No graph found. Run /crg build first.", "warning");
    return;
  }
  if (!beginUpdate(state, ctx)) return;

  const result = await runCrg(["update"], ctx.cwd, 60_000);
  state.updating = false;
  if (result.ok) {
    await refreshStatus(state, ctx.cwd);
    state.workspaceFingerprint = await getWorkspaceFingerprint(ctx.cwd);
    state.lastBuild = "just now";
    ctx.ui.notify("Graph updated", "info");
  } else {
    state.lastError = shortError(result.stderr || result.stdout);
    ctx.ui.notify("Graph update failed", "error");
  }
  updateWidget(state, ctx);
}

async function handleReview(pi: ExtensionAPI, ctx: ExtensionCommandContext, state: CrgState): Promise<void> {
  if (!(await refreshStatus(state, ctx.cwd))) {
    updateWidget(state, ctx);
    ctx.ui.notify("No graph found. Run /crg build first.", "warning");
    return;
  }

  ctx.ui.notify("Analyzing changes...", "info");
  const result = await runCrg(["detect-changes", "--brief"], ctx.cwd, 60_000);
  if (result.ok) {
    pi.sendMessage({
      customType: "crg-output",
      content: result.stdout || "No changes detected.",
      display: true,
      details: { command: "review", isError: false },
    });
    updateWidget(state, ctx);
  } else {
    state.lastError = shortError(result.stderr || result.stdout);
    updateWidget(state, ctx);
    ctx.ui.notify("Review analysis failed", "error");
    pi.sendMessage({
      customType: "crg-output",
      content: `Review failed:\n${state.lastError}`,
      display: true,
      details: { command: "review", isError: true },
    });
  }
}

async function handleStatus(ctx: ExtensionCommandContext, state: CrgState): Promise<void> {
  const ready = await refreshStatus(state, ctx.cwd);
  state.lastBuild = ready ? "ready" : null;
  updateWidget(state, ctx);
  ctx.ui.notify(ready ? `${state.nodeCount ?? 0} nodes` : "No graph database found. Run /crg build.", ready ? "info" : "warning");
}

async function handleWatch(ctx: ExtensionCommandContext, state: CrgState): Promise<void> {
  if (!(await refreshStatus(state, ctx.cwd))) {
    updateWidget(state, ctx);
    ctx.ui.notify("No graph found. Run /crg build first.", "warning");
    return;
  }
  updateWidget(state, ctx);
  ctx.ui.notify("Run: code-review-graph watch & (or: code-review-graph daemon start)", "info");
}
