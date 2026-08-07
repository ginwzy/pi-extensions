import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import register from "../index.js";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => Promise<void> | void;

interface RegisteredCommand {
  description?: string;
  handler: (args: string, ctx: unknown) => Promise<void> | void;
}

describe("pi-shell registration", () => {
  let tempDir: string;
  let previousAgentDir: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-shell-test-"));
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createPi(): { handlers: Map<string, Handler>; commands: Map<string, RegisteredCommand> } {
    const handlers = new Map<string, Handler>();
    const commands = new Map<string, RegisteredCommand>();
    const pi = {
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      registerCommand: (name: string, command: RegisteredCommand) => commands.set(name, command),
    } as unknown as ExtensionAPI;
    register(pi);
    return { handlers, commands };
  }

  function createCtx(): { ctx: ExtensionContext; header: () => unknown; footer: () => unknown } {
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
    return { ctx, header: () => header, footer: () => footer };
  }

  it("installs and clears the header and footer as one shell", async () => {
    const { handlers } = createPi();
    const { ctx, header, footer } = createCtx();

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
    assert.equal(typeof header(), "function");
    assert.equal(typeof footer(), "function");

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
    assert.equal(header(), undefined);
    assert.equal(footer(), undefined);
  });

  it("registers the /shell command", () => {
    const { commands } = createPi();
    assert.ok(commands.has("shell"));
  });

  it("skips the header when headerEnabled is false", async () => {
    const { handlers } = createPi();
    const { ctx, header, footer } = createCtx();
    const { saveShellConfig, loadShellConfig } = await import("./config-store.js");
    saveShellConfig({ ...loadShellConfig(), headerEnabled: false });

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
    assert.equal(header(), undefined);
    assert.equal(typeof footer(), "function");
  });
});
