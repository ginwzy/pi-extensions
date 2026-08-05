import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface ModuleResources {
  skillPaths?: readonly string[];
  promptPaths?: readonly string[];
  themePaths?: readonly string[];
}

export interface AllInOneModule {
  id: string;
  order: number;
  defaultEnabled: boolean;
  resources?: ModuleResources;
  register(pi: ExtensionAPI): void | Promise<void>;
}

export type ModuleActivation = Readonly<Record<string, boolean | undefined>>;

export function isModuleEnabled(module: AllInOneModule, activation: ModuleActivation = {}): boolean {
  return activation[module.id] ?? module.defaultEnabled;
}
