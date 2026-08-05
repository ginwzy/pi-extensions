import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isAbsolute } from "node:path";
import { LifecycleRegistry } from "./lifecycle.js";
import type { AllInOneModule, ModuleActivation } from "./module.js";
import { isModuleEnabled } from "./module.js";
import { OwnershipLedger } from "./ownership.js";
import { createScopedExtensionApi, DeferredRegistrations } from "./scoped-api.js";

export interface AllInOneHostOptions {
  activation?: ModuleActivation;
}

export interface ResolvedModuleResources {
  skillPaths: string[];
  promptPaths: string[];
  themePaths: string[];
}

export class ModuleRegistry {
  private readonly orderedModules: readonly AllInOneModule[];

  constructor(modules: readonly AllInOneModule[]) {
    const ids = new Set<string>();
    for (const module of modules) {
      if (ids.has(module.id)) throw new Error(`Duplicate All-in-One module id: ${module.id}`);
      ids.add(module.id);
    }
    this.orderedModules = [...modules].sort((left, right) => {
      const orderDifference = left.order - right.order;
      if (orderDifference !== 0) return orderDifference;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  }

  list(): readonly AllInOneModule[] {
    return this.orderedModules;
  }
}

export function collectModuleResources(modules: readonly AllInOneModule[]): ResolvedModuleResources {
  const skillPaths = new Set<string>();
  const promptPaths = new Set<string>();
  const themePaths = new Set<string>();

  for (const module of modules) {
    const addPaths = (kind: string, paths: readonly string[] | undefined, destination: Set<string>) => {
      for (const path of paths ?? []) {
        if (!isAbsolute(path)) {
          throw new Error(
            `All-in-One module ${JSON.stringify(module.id)} has a relative ${kind} path: ${JSON.stringify(path)}`,
          );
        }
        destination.add(path);
      }
    };
    addPaths("skill", module.resources?.skillPaths, skillPaths);
    addPaths("prompt", module.resources?.promptPaths, promptPaths);
    addPaths("theme", module.resources?.themePaths, themePaths);
  }

  return {
    skillPaths: [...skillPaths],
    promptPaths: [...promptPaths],
    themePaths: [...themePaths],
  };
}

export function createAllInOneExtension(
  modules: readonly AllInOneModule[],
  options: AllInOneHostOptions = {},
): (pi: ExtensionAPI) => Promise<void> {
  const registry = new ModuleRegistry(modules);

  return async (pi) => {
    const enabledModules = registry.list().filter((module) => isModuleEnabled(module, options.activation));
    const lifecycle = new LifecycleRegistry();
    const ledger = new OwnershipLedger();
    const deferredRegistrations = new DeferredRegistrations();

    pi.on("session_shutdown", async () => {
      await lifecycle.disposeAll();
    });

    const resources = collectModuleResources(enabledModules);
    pi.on("resources_discover", () => resources);

    try {
      for (const module of enabledModules) {
        await module.register(createScopedExtensionApi(pi, module.id, ledger, lifecycle, deferredRegistrations));
      }
      deferredRegistrations.commit();
    } catch (error) {
      deferredRegistrations.abort();
      try {
        await lifecycle.disposeAll();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "All-in-One module loading failed and cleanup also failed",
          { cause: error },
        );
      }
      throw error;
    }
  };
}
