import type { EventBus, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LifecycleRegistry } from "./lifecycle.js";
import type { OwnershipLedger, RegistrationKind } from "./ownership.js";

type Registration = (...args: any[]) => void;
type RegistrationName = (...args: any[]) => string;
type Disposer = () => void | Promise<void>;

interface ProviderState {
  active: boolean;
  hostRegistered: boolean;
  dispose: Disposer;
}

export class DeferredRegistrations {
  private state: "collecting" | "committed" | "aborted" = "collecting";
  private pending: Array<() => void> = [];
  private readonly pendingFlagNames = new Set<string>();
  private readonly pendingFlagDefaults = new Map<string, unknown>();

  register(action: () => void): void {
    if (this.state === "committed") {
      action();
      return;
    }
    if (this.state === "aborted") {
      throw new Error("Cannot register after All-in-One module loading failed");
    }
    this.pending.push(action);
  }

  registerFlag(name: string, defaultValue: unknown, action: () => void): void {
    if (this.state === "collecting") {
      this.pendingFlagNames.add(name);
      if (defaultValue !== undefined && !this.pendingFlagDefaults.has(name)) {
        this.pendingFlagDefaults.set(name, defaultValue);
      }
    }
    this.register(action);
  }

  getFlag<T>(name: string, readHost: () => T | undefined): T | undefined {
    if (this.state === "collecting" && this.pendingFlagNames.has(name)) {
      return this.pendingFlagDefaults.get(name) as T | undefined;
    }
    return readHost();
  }

  commit(): void {
    if (this.state !== "collecting") return;
    const pending = this.pending;
    this.pending = [];
    this.state = "committed";
    for (const action of pending) action();
    this.pendingFlagNames.clear();
    this.pendingFlagDefaults.clear();
  }

  abort(): void {
    if (this.state !== "collecting") return;
    this.pending = [];
    this.pendingFlagNames.clear();
    this.pendingFlagDefaults.clear();
    this.state = "aborted";
  }
}

function namedRegistration(
  moduleId: string,
  ledger: OwnershipLedger,
  kind: RegistrationKind,
  register: Registration,
  nameFromArgs: RegistrationName,
): Registration {
  return (...args) => {
    const name = nameFromArgs(...args);
    const newlyClaimed = ledger.claim(kind, name, moduleId);
    try {
      register(...args);
    } catch (error) {
      if (newlyClaimed) ledger.release(kind, name, moduleId);
      throw error;
    }
  };
}

export function createScopedExtensionApi(
  pi: ExtensionAPI,
  moduleId: string,
  ledger: OwnershipLedger,
  lifecycle: LifecycleRegistry,
  deferredRegistrations: DeferredRegistrations,
): ExtensionAPI {
  const defaults = new Map<PropertyKey, unknown>();

  defaults.set(
    "registerTool",
    namedRegistration(moduleId, ledger, "tool", pi.registerTool.bind(pi), (tool) => tool.name),
  );
  defaults.set(
    "registerCommand",
    namedRegistration(moduleId, ledger, "command", pi.registerCommand.bind(pi), (name) => name),
  );
  defaults.set(
    "registerShortcut",
    namedRegistration(moduleId, ledger, "shortcut", pi.registerShortcut.bind(pi), (name) => name.toLowerCase()),
  );
  defaults.set(
    "registerFlag",
    namedRegistration(
      moduleId,
      ledger,
      "flag",
      (...args) => deferredRegistrations.registerFlag(
        args[0],
        args[1]?.default,
        () => (pi.registerFlag as Registration)(...args),
      ),
      (name) => name,
    ),
  );
  defaults.set("getFlag", (name: string) => {
    if (ledger.ownerOf("flag", name) !== moduleId) return undefined;
    return deferredRegistrations.getFlag(name, () => pi.getFlag(name));
  });
  defaults.set(
    "registerMessageRenderer",
    namedRegistration(
      moduleId,
      ledger,
      "message-renderer",
      pi.registerMessageRenderer.bind(pi),
      (name) => name,
    ),
  );
  defaults.set(
    "registerEntryRenderer",
    namedRegistration(
      moduleId,
      ledger,
      "entry-renderer",
      pi.registerEntryRenderer.bind(pi),
      (name) => name,
    ),
  );

  const providerStates = new Map<string, ProviderState>();
  defaults.set("registerProvider", (...args: any[]) => {
    const provider = args[0];
    if (typeof provider === "string" && !args[1]) {
      throw new Error("Provider config is required when registering by name");
    }
    const name = typeof provider === "string" ? provider : provider.id;
    const newlyClaimed = ledger.claim("provider", name, moduleId);
    let state = providerStates.get(name);
    if (!state) {
      state = { active: true, hostRegistered: false, dispose: () => {} };
      const createdState = state;
      createdState.dispose = lifecycle.track(moduleId, () => {
        if (!createdState.active) return;
        createdState.active = false;
        if (providerStates.get(name) === createdState) providerStates.delete(name);
        try {
          if (createdState.hostRegistered) pi.unregisterProvider(name);
        } finally {
          ledger.release("provider", name, moduleId);
        }
      });
      providerStates.set(name, createdState);
    }

    try {
      deferredRegistrations.register(() => {
        if (!state.active || providerStates.get(name) !== state) return;
        (pi.registerProvider as Registration)(...args);
        state.hostRegistered = true;
      });
    } catch (error) {
      if (newlyClaimed) state.dispose();
      throw error;
    }
  });
  defaults.set("unregisterProvider", (name: string) => {
    const owner = ledger.ownerOf("provider", name);
    if (owner !== moduleId) {
      throw new Error(
        `Cannot unregister provider ${JSON.stringify(name)} for module ${JSON.stringify(moduleId)}; ` +
          (owner ? `it is owned by module ${JSON.stringify(owner)}` : "it is not owned by this module"),
      );
    }
    const state = providerStates.get(name);
    if (state) state.dispose();
  });

  const scopedEvents: EventBus = {
    emit: pi.events.emit.bind(pi.events),
    on(channel, handler) {
      return lifecycle.track(moduleId, pi.events.on(channel, handler)) as () => void;
    },
  };
  defaults.set("events", scopedEvents);

  const target = Object.create(null) as object;
  let facade: ExtensionAPI;
  const valueFor = (property: PropertyKey, receiver: unknown): unknown => {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    if (defaults.has(property)) return defaults.get(property);

    const value = Reflect.get(pi, property, pi);
    return typeof value === "function" ? value.bind(pi) : value;
  };
  const hasValue = (property: PropertyKey): boolean =>
    Reflect.has(target, property) || defaults.has(property) || Reflect.has(pi, property);

  const visibleKeys = (): Array<string | symbol> =>
    [...new Set([...Reflect.ownKeys(pi), ...defaults.keys(), ...Reflect.ownKeys(target)])]
      .filter((property): property is string | symbol =>
        (typeof property === "string" || typeof property === "symbol") && hasValue(property));
  const materializeVisibleProperties = (): boolean => {
    for (const property of visibleKeys()) {
      if (Reflect.has(target, property)) continue;
      if (!Reflect.defineProperty(target, property, {
        configurable: true,
        enumerable: Reflect.getOwnPropertyDescriptor(pi, property)?.enumerable ?? true,
        writable: true,
        value: valueFor(property, facade),
      })) return false;
    }
    return true;
  };

  facade = new Proxy(target, {
    get(_target, property, receiver) {
      if (!Reflect.isExtensible(target) && !Reflect.has(target, property)) return undefined;
      return valueFor(property, receiver);
    },
    set(_target, property, value, receiver) {
      if (Reflect.has(target, property)) return Reflect.set(target, property, value, receiver);
      return Reflect.defineProperty(target, property, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    },
    deleteProperty(_target, property) {
      return Reflect.deleteProperty(target, property);
    },
    defineProperty(_target, property, descriptor) {
      return Reflect.defineProperty(target, property, descriptor);
    },
    preventExtensions() {
      return materializeVisibleProperties() && Reflect.preventExtensions(target);
    },
    has(_target, property) {
      if (!Reflect.isExtensible(target)) return Reflect.has(target, property);
      return hasValue(property);
    },
    ownKeys() {
      if (!Reflect.isExtensible(target)) return Reflect.ownKeys(target);
      return visibleKeys();
    },
    getOwnPropertyDescriptor(_target, property) {
      const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, property);
      if (ownDescriptor) return ownDescriptor;
      if (!Reflect.isExtensible(target) || !hasValue(property)) return undefined;
      return {
        configurable: true,
        enumerable: Reflect.getOwnPropertyDescriptor(pi, property)?.enumerable ?? true,
        writable: true,
        value: valueFor(property, facade),
      };
    },
  }) as ExtensionAPI;
  return facade;
}
