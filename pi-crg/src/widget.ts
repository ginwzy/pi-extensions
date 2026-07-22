/**
 * Status widget showing code-review-graph state.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { graphExists } from "./cli.js";

const WIDGET_KEY = "pi-crg-status";

export type CrgState = {
  graphReady: boolean;
  lastBuild: string | null;
  nodeCount: number | null;
  updating: boolean;
};

export function createInitialState(): CrgState {
  return { graphReady: false, lastBuild: null, nodeCount: null, updating: false };
}

export function updateWidget(state: CrgState, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  if (!state.graphReady) {
    ctx.ui.setWidget(WIDGET_KEY, ["crg: no graph — /crg build"], { placement: "belowEditor" });
    return;
  }

  const parts: string[] = [];
  if (state.updating) {
    parts.push("⟳ crg updating");
  } else {
    parts.push("● crg");
  }
  if (state.nodeCount !== null) {
    parts.push(`${state.nodeCount} nodes`);
  }
  if (state.lastBuild) {
    parts.push(state.lastBuild);
  }
  ctx.ui.setWidget(WIDGET_KEY, [parts.join("  ")], { placement: "belowEditor" });
}

export function clearWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_KEY, undefined);
}
