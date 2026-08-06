/**
 * pi-rewind — UI helpers
 *
 * Aggregated footer status and notifications.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { clearRootStatus, setRootStatus } from "../../pi-footer/src/status-store.js";
import type { RewindState } from "./state.js";

const STATUS_KEY = "rewind";

/** Update aggregated footer status with checkpoint count */
export function updateStatus(state: RewindState, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  if (!state.gitAvailable) {
    clearRootStatus(STATUS_KEY);
    return;
  }

  const count = state.checkpoints.size;
  if (count === 0) {
    clearRootStatus(STATUS_KEY);
    return;
  }

  setRootStatus(STATUS_KEY, {
    label: "rewind",
    state: "ok",
    value: String(count),
    priority: 65,
  });
}

/** Clear status */
export function clearStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  clearRootStatus(STATUS_KEY);
}
