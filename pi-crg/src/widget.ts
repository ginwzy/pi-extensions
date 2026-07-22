/**
 * Status widget showing code-review-graph state.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const WIDGET_KEY = "pi-crg-status";

export type CrgState = {
  graphReady: boolean;
  lastBuild: string | null;
  nodeCount: number | null;
  updating: boolean;
  lastError: string | null;
  workspaceFingerprint: string | null;
};

export function createInitialState(): CrgState {
  return {
    graphReady: false,
    lastBuild: null,
    nodeCount: null,
    updating: false,
    lastError: null,
    workspaceFingerprint: null,
  };
}

export function updateWidget(state: CrgState, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  if (!state.graphReady) {
    const message = state.lastError ? `crg: error - ${state.lastError}` : "crg: no graph - /crg build";
    ctx.ui.setWidget(WIDGET_KEY, [message], { placement: "belowEditor" });
    return;
  }

  const parts: string[] = [];
  if (state.updating) {
    parts.push("crg: updating");
  } else if (state.lastError) {
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
