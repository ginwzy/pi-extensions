import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installRootFooter } from "./src/footer.js";
import { clearRootStatuses } from "./src/status-store.js";

export default function register(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    installRootFooter(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    installRootFooter(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearRootStatuses();
    if (ctx.hasUI) {
      ctx.ui.setFooter(undefined);
    }
  });
}
