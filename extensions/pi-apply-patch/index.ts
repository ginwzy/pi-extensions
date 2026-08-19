import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  registerApplyPatchExtension,
  type ApplyPatchExtensionAPI,
} from "../../pi-apply-patch/src/index.js";
import { decorateApplyPatchToolForRegistration } from "../pi-tool-display/src/tool-overrides.js";

export default function applyPatchBridgeExtension(pi: ExtensionAPI): void {
  const bridgedApi = {
    on: pi.on.bind(pi),
    getActiveTools: pi.getActiveTools.bind(pi),
    setActiveTools: pi.setActiveTools.bind(pi),
    registerTool(tool: object) {
      decorateApplyPatchToolForRegistration(tool);
      pi.registerTool(tool as unknown as ToolDefinition);
    },
  } as unknown as ApplyPatchExtensionAPI;

  registerApplyPatchExtension(bridgedApi);
}
