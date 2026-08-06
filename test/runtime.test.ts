import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import manifest from "../package.json" with { type: "json" };
import type { AllInOneModule } from "../src/runtime/module.js";
import { LifecycleRegistry } from "../src/runtime/lifecycle.js";
import { createAllInOneExtension, ModuleRegistry } from "../src/runtime/registry.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface FakePi {
  api: ExtensionAPI;
  commands: Map<string, unknown>;
  tools: Map<string, unknown>;
  handlers: Map<string, Array<(event: unknown, context: unknown) => unknown>>;
  eventHandlers: Map<string, Set<(data: unknown) => void>>;
  eventDisposals: string[];
  shortcuts: string[];
  flags: string[];
  flagValues: Map<string, unknown>;
  providers: string[];
  providerConfigs: Map<string, Record<string, unknown>>;
  providerDisposals: string[];
}

function createFakePi(): FakePi {
  const commands = new Map<string, unknown>();
  const tools = new Map<string, unknown>();
  const handlers = new Map<string, Array<(event: unknown, context: unknown) => unknown>>();
  const eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  const eventDisposals: string[] = [];
  const shortcuts: string[] = [];
  const flags: string[] = [];
  const flagValues = new Map<string, unknown>();
  const providers: string[] = [];
  const providerConfigs = new Map<string, Record<string, unknown>>();
  const providerDisposals: string[] = [];

  const api = {
    on(event: string, handler: (event: unknown, context: unknown) => unknown) {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
    registerTool(tool: { name: string }) {
      tools.set(tool.name, tool);
    },
    registerCommand(name: string, options: unknown) {
      commands.set(name, options);
    },
    registerShortcut(name: string) {
      shortcuts.push(name);
    },
    registerFlag(name: string, options: { default?: unknown } = {}) {
      flags.push(name);
      if (options.default !== undefined && !flagValues.has(name)) flagValues.set(name, options.default);
    },
    getFlag(name: string) {
      return flags.includes(name) ? flagValues.get(name) : undefined;
    },
    registerMessageRenderer: vi.fn(),
    registerEntryRenderer: vi.fn(),
    registerProvider(provider: string | { id: string }, config?: Record<string, unknown>) {
      const name = typeof provider === "string" ? provider : provider.id;
      providers.push(name);
      if (typeof provider === "string") {
        const effective = { ...providerConfigs.get(name) };
        for (const [key, value] of Object.entries(config ?? {})) {
          if (value !== undefined) effective[key] = value;
        }
        providerConfigs.set(name, effective);
      } else {
        providerConfigs.delete(name);
      }
    },
    unregisterProvider(name: string) {
      providerDisposals.push(name);
      providerConfigs.delete(name);
    },
    events: {
      emit(channel: string, data: unknown) {
        eventHandlers.get(channel)?.forEach((handler) => handler(data));
      },
      on(channel: string, handler: (data: unknown) => void) {
        const registered = eventHandlers.get(channel) ?? new Set();
        registered.add(handler);
        eventHandlers.set(channel, registered);
        return () => {
          if (registered.delete(handler)) eventDisposals.push(channel);
        };
      },
    },
  } as unknown as ExtensionAPI;

  return {
    api,
    commands,
    tools,
    handlers,
    eventHandlers,
    eventDisposals,
    shortcuts,
    flags,
    flagValues,
    providers,
    providerConfigs,
    providerDisposals,
  };
}

function moduleDefinition(
  id: string,
  order: number,
  register: AllInOneModule["register"],
  overrides: Partial<AllInOneModule> = {},
): AllInOneModule {
  return { id, order, defaultEnabled: true, register, ...overrides };
}

async function emitPiEvent(fake: FakePi, event: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of fake.handlers.get(event) ?? []) {
    results.push(await handler({}, {}));
  }
  return results;
}

function packageManager(projectSettings: Record<string, unknown> = {}) {
  const settingsManager = {
    getGlobalSettings: () => ({}),
    getProjectSettings: () => projectSettings,
    isProjectTrusted: () => true,
  };
  return new DefaultPackageManager({
    cwd: ROOT,
    agentDir: resolve(ROOT, ".tmp-test-agent"),
    settingsManager: settingsManager as never,
  });
}

describe("package discovery", () => {
  test("loads package extensions and excludes the carried maintenance skill", async () => {
    const resolved = await packageManager().resolveExtensionSources([ROOT], { temporary: true });

    expect(resolved.extensions.filter((entry) => entry.enabled).map((entry) => entry.path)).toEqual([
      resolve(ROOT, "src/index.ts"),
      resolve(ROOT, "node_modules/pi-mcp-adapter/index.ts"),
    ]);
    expect(resolved.skills).toEqual([]);
    expect(manifest.files).toContain("skills/upstream-review");
  });

  test("does not let a package filter re-enable a manifest-excluded skill", async () => {
    const resolved = await packageManager({
      packages: [{ source: ROOT, skills: ["skills/**"] }],
    }).resolve();

    expect(resolved.skills.filter((entry) =>
      entry.path === resolve(ROOT, "skills/upstream-review/SKILL.md") && entry.enabled)).toEqual([]);
  });

  test("loads upstream-review only from this project's explicit settings path", async () => {
    const resolved = await packageManager({ skills: ["../skills/upstream-review"] }).resolve();

    expect(resolved.skills.filter((entry) =>
      entry.path === resolve(ROOT, "skills/upstream-review/SKILL.md") && entry.enabled).map((entry) => entry.path)).toEqual([
      resolve(ROOT, "skills/upstream-review/SKILL.md"),
    ]);
  });
});

describe("module host", () => {
  test("uses deterministic order with module id as the tie-breaker", () => {
    const registry = new ModuleRegistry([
      moduleDefinition("later", 20, () => {}),
      moduleDefinition("zeta", 10, () => {}),
      moduleDefinition("alpha", 10, () => {}),
    ]);

    expect(registry.list().map((module) => module.id)).toEqual(["alpha", "zeta", "later"]);
  });

  test("registers enabled modules in deterministic code-point order", async () => {
    const observed: string[] = [];
    const fake = createFakePi();
    await createAllInOneExtension([
      moduleDefinition("second", 20, () => { observed.push("second"); }),
      moduleDefinition("first", 10, () => { observed.push("first"); }),
      moduleDefinition("ä", 30, () => { observed.push("ä"); }),
      moduleDefinition("z", 30, () => { observed.push("z"); }),
    ])(fake.api);

    expect(observed).toEqual(["first", "second", "z", "ä"]);
  });

  test("rejects cross-module collisions while allowing same-module replacement", async () => {
    const fake = createFakePi();
    const owner = moduleDefinition("owner", 10, (pi) => {
      pi.registerCommand("shared", { handler: async () => {} });
      pi.registerCommand("shared", { handler: async () => {} });
    });
    const contender = moduleDefinition("contender", 20, (pi) => {
      pi.registerCommand("shared", { handler: async () => {} });
    });

    await expect(createAllInOneExtension([owner, contender])(fake.api)).rejects.toThrow(
      'Cannot register command "shared" for module "contender"; it is already owned by module "owner"',
    );
  });

  test("keeps assignment, deletion, definition, and metadata monkeypatches isolated", async () => {
    const fake = createFakePi();
    const baseRegisterTool = fake.api.registerTool;
    const marker = Symbol("module marker");
    let otherSawMarker = true;
    let otherSawTool = false;

    const interceptor = moduleDefinition("interceptor", 10, (pi) => {
      const original = pi.registerTool;
      Object.defineProperty(pi, "registerTool", { value: (tool: Parameters<ExtensionAPI["registerTool"]>[0]) => original(tool) });
      (pi as ExtensionAPI & { [marker]?: string })[marker] = "private";
      delete (pi as Partial<ExtensionAPI>).registerShortcut;
      pi.registerTool({ name: "first-tool" } as Parameters<ExtensionAPI["registerTool"]>[0]);
    });
    const other = moduleDefinition("other", 20, (pi) => {
      otherSawMarker = marker in pi;
      otherSawTool = typeof pi.registerTool === "function";
      pi.registerTool({ name: "second-tool" } as Parameters<ExtensionAPI["registerTool"]>[0]);
    });

    await createAllInOneExtension([interceptor, other])(fake.api);

    expect(fake.api.registerTool).toBe(baseRegisterTool);
    expect(otherSawMarker).toBe(false);
    expect(otherSawTool).toBe(true);
    expect([...fake.tools.keys()]).toEqual(["first-tool", "second-tool"]);
  });

  test("preserves accessor descriptors and facade-local setter state", async () => {
    const fake = createFakePi();
    let stored = "initial";
    let getterThis: unknown;
    let setterThis: unknown;

    await createAllInOneExtension([
      moduleDefinition("accessor", 10, (pi) => {
        const facade = pi as ExtensionAPI & { localState?: string };
        const scopedRegisterCommand = pi.registerCommand;
        Object.defineProperty(facade, "localState", {
          configurable: true,
          enumerable: false,
          get() {
            getterThis = this;
            return stored;
          },
          set(value: string) {
            setterThis = this;
            stored = value;
          },
        });
        Object.defineProperty(pi, "registerCommand", {
          configurable: true,
          get: () => scopedRegisterCommand,
        });

        expect(facade.localState).toBe("initial");
        facade.localState = "updated";
        expect(getterThis).toBe(pi);
        expect(setterThis).toBe(pi);
        const descriptor = Object.getOwnPropertyDescriptor(facade, "localState");
        expect(descriptor?.get).toBeTypeOf("function");
        expect(descriptor?.set).toBeTypeOf("function");
        expect(descriptor?.enumerable).toBe(false);
        expect(Reflect.ownKeys(facade)).toContain("localState");
        pi.registerCommand("owned", { handler: async () => {} });
        expect(delete facade.localState).toBe(true);
        expect("localState" in facade).toBe(false);
        expect(facade.localState).toBeUndefined();
        expect(delete (pi as Partial<ExtensionAPI>).registerCommand).toBe(true);
        pi.registerCommand("owned-again", { handler: async () => {} });
      }),
      moduleDefinition("other", 20, (pi) => {
        expect("localState" in (pi as ExtensionAPI & { localState?: string })).toBe(false);
      }),
    ])(fake.api);

    expect(stored).toBe("updated");
    expect([...fake.commands.keys()]).toEqual(["owned", "owned-again"]);
  });

  test("keeps a non-extensible facade internally consistent and module-local", async () => {
    const fake = createFakePi();
    let frozenFacade: ExtensionAPI | undefined;
    await createAllInOneExtension([
      moduleDefinition("frozen", 10, (pi) => {
        frozenFacade = pi;
        expect(Reflect.preventExtensions(pi)).toBe(true);
        expect(Reflect.isExtensible(pi)).toBe(false);
        expect(() => Reflect.ownKeys(pi)).not.toThrow();
        expect(typeof pi.registerCommand).toBe("function");
        expect(Reflect.set(pi, "newLocalProperty", true)).toBe(false);
        pi.registerCommand("from-frozen", { handler: async () => {} });
      }),
      moduleDefinition("other", 20, (pi) => {
        expect(Reflect.isExtensible(pi)).toBe(true);
        pi.registerCommand("from-other", { handler: async () => {} });
      }),
    ])(fake.api);

    expect(Reflect.ownKeys(frozenFacade as ExtensionAPI)).toContain("registerCommand");
    expect([...fake.commands.keys()]).toEqual(["from-frozen", "from-other"]);
  });

  test("prevents descriptor reflection from bypassing command and event scoping", async () => {
    const fake = createFakePi();
    let hits = 0;
    const original = new Error("stop");
    const first = moduleDefinition("first", 10, (pi) => {
      const command = Object.getOwnPropertyDescriptor(pi, "registerCommand")?.value as ExtensionAPI["registerCommand"];
      const events = Object.getOwnPropertyDescriptor(pi, "events")?.value as ExtensionAPI["events"];
      command("shared", { handler: async () => {} });
      events.on("reflected", () => { hits += 1; });
    });
    const second = moduleDefinition("second", 20, (pi) => {
      expect(() => pi.registerCommand("shared", { handler: async () => {} })).toThrow(/already owned/);
      throw original;
    });

    await expect(createAllInOneExtension([first, second])(fake.api)).rejects.toBe(original);
    fake.api.events.emit("reflected", {});
    expect(hits).toBe(0);
    expect(fake.eventDisposals).toEqual(["reflected"]);
  });

  test("omits disabled registration and resources", async () => {
    const fake = createFakePi();
    const enabled = moduleDefinition("enabled", 10, (pi) => pi.registerCommand("enabled", { handler: async () => {} }), {
      resources: { skillPaths: ["/enabled/skill"], promptPaths: ["/enabled/prompt"] },
    });
    const disabled = moduleDefinition("disabled", 20, (pi) => pi.registerCommand("disabled", { handler: async () => {} }), {
      resources: { skillPaths: ["/disabled/skill"], promptPaths: ["/disabled/prompt"] },
    });

    await createAllInOneExtension([disabled, enabled], { activation: { disabled: false } })(fake.api);
    const [resources] = await emitPiEvent(fake, "resources_discover");

    expect([...fake.commands.keys()]).toEqual(["enabled"]);
    expect(resources).toEqual({
      skillPaths: ["/enabled/skill"],
      promptPaths: ["/enabled/prompt"],
      themePaths: [],
    });
  });

  test("rejects relative module resource paths and accepts absolute paths", async () => {
    const relative = createFakePi();
    await expect(createAllInOneExtension([
      moduleDefinition("relative-resources", 10, () => {}, {
        resources: { skillPaths: ["skills/local"] },
      }),
    ])(relative.api)).rejects.toThrow(
      'All-in-One module "relative-resources" has a relative skill path: "skills/local"',
    );

    const absolute = createFakePi();
    await createAllInOneExtension([
      moduleDefinition("absolute-resources", 10, () => {}, {
        resources: {
          skillPaths: ["/absolute/skill"],
          promptPaths: ["/absolute/prompt"],
          themePaths: ["/absolute/theme"],
        },
      }),
    ])(absolute.api);
    const [resources] = await emitPiEvent(absolute, "resources_discover");
    expect(resources).toEqual({
      skillPaths: ["/absolute/skill"],
      promptPaths: ["/absolute/prompt"],
      themePaths: ["/absolute/theme"],
    });
  });

  test("disposes two active shared subscriptions once in reverse order", async () => {
    const fake = createFakePi();
    await createAllInOneExtension([
      moduleDefinition("subscriber", 10, (pi) => {
        pi.events.on("first", () => {});
        pi.events.on("second", () => {});
      }),
    ])(fake.api);

    await emitPiEvent(fake, "session_shutdown");
    await emitPiEvent(fake, "session_shutdown");

    expect(fake.eventDisposals).toEqual(["second", "first"]);
  });

  test("keeps an early manual unsubscribe idempotent during shutdown", async () => {
    const fake = createFakePi();
    let unsubscribe: (() => void) | undefined;
    await createAllInOneExtension([
      moduleDefinition("subscriber", 10, (pi) => {
        unsubscribe = pi.events.on("first", () => {});
        pi.events.on("second", () => {});
      }),
    ])(fake.api);

    unsubscribe?.();
    await emitPiEvent(fake, "session_shutdown");
    await emitPiEvent(fake, "session_shutdown");

    expect(fake.eventDisposals).toEqual(["first", "second"]);
  });

  test("propagates manual sync disposal errors and awaits async cleanup once", async () => {
    const lifecycle = new LifecycleRegistry();
    const syncError = new Error("sync disposal failed");
    const syncDispose = lifecycle.track("sync", () => { throw syncError; });
    expect(() => syncDispose()).toThrow(syncError);
    expect(() => syncDispose()).not.toThrow();

    let resolveCleanup: (() => void) | undefined;
    let asyncCalls = 0;
    const asyncDispose = lifecycle.track("async", async () => {
      asyncCalls += 1;
      await new Promise<void>((resolve) => { resolveCleanup = resolve; });
    });
    const pending = asyncDispose();
    expect(pending).toBeInstanceOf(Promise);
    expect(asyncCalls).toBe(1);
    resolveCleanup?.();
    await pending;
    await lifecycle.disposeAll();
    expect(asyncCalls).toBe(1);
  });

  test("cleans earlier subscriptions and preserves the original factory error", async () => {
    const fake = createFakePi();
    let hits = 0;
    const original = new Error("factory failed");
    const first = moduleDefinition("first", 10, (pi) => {
      pi.events.on("shared", () => { hits += 1; });
    });
    const second = moduleDefinition("second", 20, () => { throw original; });

    await expect(createAllInOneExtension([first, second])(fake.api)).rejects.toBe(original);
    fake.api.events.emit("shared", {});

    expect(hits).toBe(0);
    expect(fake.eventDisposals).toEqual(["shared"]);
  });

  test("preserves registration and cleanup errors in an AggregateError", async () => {
    const fake = createFakePi();
    const original = new Error("factory failed");
    const cleanup = new Error("cleanup failed");
    fake.api.events.on = (() => () => { throw cleanup; }) as ExtensionAPI["events"]["on"];

    const result = createAllInOneExtension([
      moduleDefinition("first", 10, (pi) => {
        pi.events.on("shared", () => {});
      }),
      moduleDefinition("second", 20, () => { throw original; }),
    ])(fake.api);

    await expect(result).rejects.toMatchObject({
      name: "AggregateError",
      cause: original,
      errors: [original, expect.any(AggregateError)],
    });
  });

  test("owns string and native providers, blocks foreign unregister, and cleans committed providers", async () => {
    const native = { id: "native", name: "Native" };
    const owner = moduleDefinition("owner", 10, (pi) => {
      pi.registerProvider("shared", {});
      (pi.registerProvider as unknown as (provider: { id: string; name: string }) => void)(native);
    });

    const failed = createFakePi();
    const contender = moduleDefinition("contender", 20, (pi) => pi.unregisterProvider("shared"));
    await expect(createAllInOneExtension([owner, contender])(failed.api)).rejects.toThrow(/owned by module "owner"/);
    expect(failed.providers).toEqual([]);
    expect(failed.providerDisposals).toEqual([]);

    const committed = createFakePi();
    await createAllInOneExtension([owner])(committed.api);
    expect(committed.providers).toEqual(["shared", "native"]);
    await emitPiEvent(committed, "session_shutdown");
    expect(committed.providerDisposals).toEqual(["native", "shared"]);
  });

  test("rejects provider and case-normalized shortcut collisions", async () => {
    const providerFake = createFakePi();
    await expect(createAllInOneExtension([
      moduleDefinition("first", 10, (pi) => pi.registerProvider("shared", {})),
      moduleDefinition("second", 20, (pi) => pi.registerProvider("shared", {})),
    ])(providerFake.api)).rejects.toThrow(/Cannot register provider/);

    const shortcutFake = createFakePi();
    await expect(createAllInOneExtension([
      moduleDefinition("first", 10, (pi) => pi.registerShortcut("Ctrl+Alt+M" as never, { handler: async () => {} })),
      moduleDefinition("second", 20, (pi) => pi.registerShortcut("ctrl+alt+m" as never, { handler: async () => {} })),
    ])(shortcutFake.api)).rejects.toThrow(/Cannot register shortcut/);
  });

  test("preserves same-module provider order, string merges, and one cleanup per id", async () => {
    const fake = createFakePi();
    let scoped: ExtensionAPI | undefined;
    const nativeFirst = { id: "native-same", name: "Native First" };
    const nativeSecond = { id: "native-same", name: "Native Second" };
    await createAllInOneExtension([
      moduleDefinition("owner", 10, (pi) => {
        scoped = pi;
        pi.registerProvider("same", { apiKey: "first-key", baseUrl: "https://first.invalid" });
        pi.registerProvider("same", { apiKey: undefined, baseUrl: "https://second.invalid" });
        (pi.registerProvider as unknown as (provider: { id: string; name: string }) => void)(nativeFirst);
        (pi.registerProvider as unknown as (provider: { id: string; name: string }) => void)(nativeSecond);
      }),
    ])(fake.api);

    expect(fake.providers).toEqual(["same", "same", "native-same", "native-same"]);
    expect(fake.providerConfigs.get("same")).toEqual({
      apiKey: "first-key",
      baseUrl: "https://second.invalid",
    });
    expect(fake.providerDisposals).toEqual([]);

    scoped?.registerProvider("same", { name: "Dynamic Name" });
    expect(fake.providers).toEqual(["same", "same", "native-same", "native-same", "same"]);
    expect(fake.providerConfigs.get("same")).toEqual({
      apiKey: "first-key",
      baseUrl: "https://second.invalid",
      name: "Dynamic Name",
    });
    expect(fake.providerDisposals).toEqual([]);

    await emitPiEvent(fake, "session_shutdown");
    expect(fake.providerDisposals).toEqual(["native-same", "same"]);
  });

  test("suppresses every queued provider registration after pre-commit unregister", async () => {
    const fake = createFakePi();
    await createAllInOneExtension([
      moduleDefinition("owner", 10, (pi) => {
        pi.registerProvider("removed", { apiKey: "first" });
        pi.registerProvider("removed", { baseUrl: "https://second.invalid" });
        pi.unregisterProvider("removed");
      }),
      moduleDefinition("next-owner", 20, (pi) => {
        pi.registerProvider("removed", { name: "Replacement" });
      }),
    ])(fake.api);

    expect(fake.providers).toEqual(["removed"]);
    expect(fake.providerConfigs.get("removed")).toEqual({ name: "Replacement" });
    await emitPiEvent(fake, "session_shutdown");
    expect(fake.providerDisposals).toEqual(["removed"]);
  });

  test("propagates synchronous provider unregister errors without an unhandled promise", async () => {
    const fake = createFakePi();
    let scoped: ExtensionAPI | undefined;
    await createAllInOneExtension([
      moduleDefinition("owner", 10, (pi) => {
        scoped = pi;
        pi.registerProvider("throwing", { name: "Throwing" });
      }),
    ])(fake.api);

    const unregisterError = new Error("unregister failed");
    fake.api.unregisterProvider = () => { throw unregisterError; };
    expect(() => scoped?.unregisterProvider("throwing")).toThrow(unregisterError);
    await expect(emitPiEvent(fake, "session_shutdown")).resolves.toEqual([undefined]);
  });

  test("defers flags while keeping getFlag scoped to the owning module", async () => {
    const fake = createFakePi();
    let scoped: ExtensionAPI | undefined;
    let foreignScoped: ExtensionAPI | undefined;
    await createAllInOneExtension([
      moduleDefinition("first", 10, (pi) => {
        scoped = pi;
        pi.registerFlag("ready", { description: "ready", type: "boolean", default: true });
        expect(pi.getFlag("ready")).toBe(true);
        pi.registerFlag("ready", { description: "replacement", type: "boolean", default: false });
        expect(pi.getFlag("ready")).toBe(true);
        pi.registerFlag("missing", { description: "missing", type: "boolean" });
        expect(pi.getFlag("missing")).toBeUndefined();
        expect(fake.flags).toEqual([]);
      }),
      moduleDefinition("second", 20, (pi) => {
        foreignScoped = pi;
        expect(pi.getFlag("ready")).toBeUndefined();
        expect(pi.getFlag("missing")).toBeUndefined();
        expect(fake.flags).toEqual([]);
      }),
    ])(fake.api);

    expect(fake.flags).toEqual(["ready", "ready", "missing"]);
    expect(scoped?.getFlag("ready")).toBe(true);
    expect(scoped?.getFlag("missing")).toBeUndefined();
    expect(foreignScoped?.getFlag("ready")).toBeUndefined();
    scoped?.registerFlag("later", { description: "later", type: "boolean", default: false });
    expect(fake.flags).toEqual(["ready", "ready", "missing", "later"]);
    expect(scoped?.getFlag("later")).toBe(false);
    expect(foreignScoped?.getFlag("later")).toBeUndefined();
  });

  test("prevalidates string providers and aborts pending flags after factory failure", async () => {
    const fake = createFakePi();
    let scoped: ExtensionAPI | undefined;
    await expect(createAllInOneExtension([
      moduleDefinition("first", 10, (pi) => {
        scoped = pi;
        pi.registerFlag("leaked", { description: "leaked", type: "boolean", default: true });
        expect(pi.getFlag("leaked")).toBe(true);
        (pi.registerProvider as unknown as (name: string) => void)("invalid");
      }),
    ])(fake.api)).rejects.toThrow("Provider config is required when registering by name");

    expect(fake.flags).toEqual([]);
    expect(fake.providers).toEqual([]);
    expect(scoped?.getFlag("leaked")).toBeUndefined();
    expect(() => scoped?.registerFlag("after-failure", {
      description: "after failure",
      type: "boolean",
    })).toThrow("Cannot register after All-in-One module loading failed");
  });
});
