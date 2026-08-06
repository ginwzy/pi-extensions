import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import register from "../index.js";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => Promise<void> | void;

describe("pi-shell registration", () => {
  it("installs and clears the header and footer as one shell", async () => {
    const handlers = new Map<string, Handler>();
    const pi = {
      on: (event: string, handler: Handler) => handlers.set(event, handler),
    } as unknown as ExtensionAPI;
    register(pi);

    let header: unknown;
    let footer: unknown;
    const ctx = {
      hasUI: true,
      mode: "tui",
      ui: {
        setHeader: (factory: unknown) => { header = factory; },
        setFooter: (factory: unknown) => { footer = factory; },
      },
    } as unknown as ExtensionContext;

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
    assert.equal(typeof header, "function");
    assert.equal(typeof footer, "function");

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
    assert.equal(header, undefined);
    assert.equal(footer, undefined);
  });
});
