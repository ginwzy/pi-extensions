import { stripVTControlCharacters } from "node:util";

export type RootStatusState = "active" | "pending" | "ok" | "warning" | "error";

export interface RootStatus {
  label: string;
  state: RootStatusState;
  priority: number;
  title?: string;
  value?: string;
}

type Listener = () => void;

type RootStatusStore = {
  statuses: Map<string, RootStatus>;
  listeners: Set<Listener>;
};

const STORE_SYMBOL = Symbol.for("@ginwzy/pi-extensions/root-status-store");
const globalWithStore = globalThis as typeof globalThis & { [STORE_SYMBOL]?: RootStatusStore };
const store = globalWithStore[STORE_SYMBOL] ??= {
  statuses: new Map<string, RootStatus>(),
  listeners: new Set<Listener>(),
};

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = stripVTControlCharacters(value)
    .replace(/[\r\n\t\f\v]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function notify(): void {
  for (const listener of store.listeners) listener();
}

export function setRootStatus(key: string, status: RootStatus | undefined): void {
  if (status === undefined) {
    if (store.statuses.delete(key)) notify();
    return;
  }

  const title = clean(status.title);
  const value = clean(status.value);
  const next: RootStatus = {
    label: clean(status.label) ?? key,
    state: status.state,
    priority: status.priority,
    ...(title ? { title } : {}),
    ...(value ? { value } : {}),
  };

  const previous = store.statuses.get(key);
  if (
    previous &&
    previous.label === next.label &&
    previous.state === next.state &&
    previous.priority === next.priority &&
    previous.title === next.title &&
    previous.value === next.value
  ) {
    return;
  }

  store.statuses.set(key, next);
  notify();
}

export function clearRootStatus(key: string): void {
  setRootStatus(key, undefined);
}

export function clearRootStatuses(): void {
  if (store.statuses.size === 0) return;
  store.statuses.clear();
  notify();
}

export function getRootStatuses(): RootStatus[] {
  return [...store.statuses.entries()]
    .sort((a, b) => b[1].priority - a[1].priority || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, status]) => status);
}

export function onRootStatusChange(listener: Listener): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}
