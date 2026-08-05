import { gptFastModeModule } from "./modules/gpt-fast-mode/module.js";
import { createAllInOneExtension } from "./runtime/registry.js";

export const allInOneModules = [gptFastModeModule] as const;

// Persistent activation configuration is deferred; the injectable host option
// is exercised by tests and will back the eventual user-facing config loader.
export default createAllInOneExtension(allInOneModules);
