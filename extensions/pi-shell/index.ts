import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installRootFooter } from "./src/footer.js";
import { installShellHeader } from "./src/header.js";
import { clearRootStatuses } from "./src/status-store.js";

export default function register(pi: ExtensionAPI): void {
  pi.on("session_start", async (event, ctx) => {
    installShellHeader(ctx, event.reason === "startup" || event.reason === "new");
    installRootFooter(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    installRootFooter(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearRootStatuses();
    if (ctx.hasUI) {
      ctx.ui.setHeader(undefined);
      ctx.ui.setFooter(undefined);
    }
  });
}
