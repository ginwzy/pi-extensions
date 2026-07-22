/**
 * Status widget showing code-review-graph state.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const WIDGET_KEY = "pi-crg-status";

export type CrgWidgetMode = "activity" | "always" | "off";

export function resolveWidgetMode(value = process.env.PI_CRG_WIDGET): CrgWidgetMode {
  return value === "always" || value === "off" || value === "activity" ? value : "activity";
}

export type CrgState = {
  graphReady: boolean;
  lastBuild: string | null;
  nodeCount: number | null;
  updating: boolean;
  lastError: string | null;
  workspaceFingerprint: string | null;
  widgetMode: CrgWidgetMode;
};

export function createInitialState(): CrgState {
  return {
    graphReady: false,
    lastBuild: null,
    nodeCount: null,
    updating: false,
    lastError: null,
    workspaceFingerprint: null,
    widgetMode: resolveWidgetMode(),
  };
}

export function updateWidget(state: CrgState, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  if (state.widgetMode === "off") {
    clearWidget(ctx);
    return;
  }
  if (state.widgetMode === "activity" && !state.updating && !state.lastError) {
    clearWidget(ctx);
    return;
  }

  if (state.updating) {
    const details = [state.nodeCount === null ? "" : `${state.nodeCount} nodes`, state.lastBuild ?? ""].filter(Boolean);
    const message = ["crg: updating", ...details].join("  ");
    ctx.ui.setWidget(WIDGET_KEY, [message], { placement: "belowEditor" });
    return;
  }

  if (!state.graphReady) {
    const message = state.lastError ? `crg: error - ${state.lastError}` : "crg: no graph - /crg build";
    ctx.ui.setWidget(WIDGET_KEY, [message], { placement: "belowEditor" });
    return;
  }

  const parts: string[] = [];
  if (state.lastError) {
    parts.push("crg: stale");
  } else {
    parts.push("crg: ready");
  }
  if (state.nodeCount !== null) {
    parts.push(`${state.nodeCount} nodes`);
  }
  if (state.lastBuild) {
    parts.push(state.lastBuild);
  }
  if (state.lastError) {
    parts.push(state.lastError);
  }
  ctx.ui.setWidget(WIDGET_KEY, [parts.join("  ")], { placement: "belowEditor" });
}

export function clearWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_KEY, undefined);
}
