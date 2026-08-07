import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerShellCommand } from "./src/config-modal.js";
import { applyShellConfig, loadShellConfig } from "./src/config-store.js";
import { installShellHeader } from "./src/header.js";
import { installRootFooter } from "./src/footer.js";
import { clearRootStatuses } from "./src/status-store.js";

export default function register(pi: ExtensionAPI): void {
  registerShellCommand(pi);

  pi.on("session_start", async (event, ctx) => {
    const config = loadShellConfig();
    applyShellConfig(config);
    const animate = event.reason === "startup" || event.reason === "new";
    if (config.headerEnabled) installShellHeader(ctx, animate && config.headerAnimate, config.headerShowPath);
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
