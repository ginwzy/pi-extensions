import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type TUI } from "@earendil-works/pi-tui";
import {
  ShellHeader,
  formatWorkspacePath,
  renderShellHeader,
} from "./header.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

describe("renderShellHeader", () => {
  it("renders a full five-line workspace header at wide widths", () => {
    const lines = renderShellHeader({
      cwd: "/work/pi-extensions",
      frame: 5,
      theme,
      version: "1.2.3",
      width: 80,
    });

    assert.equal(lines.length, 5);
    assert.match(lines.join("\n"), /Pi v1\.2\.3/);
    assert.match(lines.join("\n"), /pi-extensions/);
    assert.match(lines.join("\n"), /workspace ready/);
    assert.ok(lines.every((line) => visibleWidth(line) <= 80));
  });

  it("reveals more logo pixels as animation frames advance", () => {
    const first = renderShellHeader({ cwd: "/work/project", frame: 0, theme, width: 80 }).join("\n");
    const final = renderShellHeader({ cwd: "/work/project", frame: 5, theme, width: 80 }).join("\n");

    assert.ok((final.match(/█/g)?.length ?? 0) > (first.match(/█/g)?.length ?? 0));
  });

  it("collapses to one clipped line on narrow terminals", () => {
    for (const width of [40, 20, 8, 1]) {
      const lines = renderShellHeader({
        cwd: "/work/a-very-long-project-name",
        frame: 5,
        theme,
        version: "1.2.3",
        width,
      });

      assert.equal(lines.length, 1);
      assert.ok(visibleWidth(lines[0]) > 0, `header disappeared at ${width} columns`);
      assert.ok(visibleWidth(lines[0]) <= width, `header exceeded ${width} columns`);
    }
  });
});

describe("formatWorkspacePath", () => {
  it("shortens only paths inside HOME", () => {
    const previousHome = process.env.HOME;
    process.env.HOME = "/Users/example";
    try {
      assert.equal(formatWorkspacePath("/Users/example/project"), "~/project");
      assert.equal(formatWorkspacePath("/Users/example"), "~");
      assert.equal(formatWorkspacePath("/Users/example-other/project"), "/Users/example-other/project");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });
});

describe("ShellHeader", () => {
  it("stops its animation timer when disposed", async () => {
    let renders = 0;
    const tui = { requestRender: () => { renders++; } } as unknown as TUI;
    const ctx = { cwd: "/work/project" } as ExtensionContext;
    const header = new ShellHeader(ctx, tui, theme, true);

    header.dispose();
    await new Promise((resolve) => setTimeout(resolve, 70));

    assert.equal(renders, 0);
  });

  it("requests a render while an animation is active", async () => {
    let renders = 0;
    const tui = { requestRender: () => { renders++; } } as unknown as TUI;
    const ctx = { cwd: "/work/project" } as ExtensionContext;
    const header = new ShellHeader(ctx, tui, theme, true);

    await new Promise((resolve) => setTimeout(resolve, 70));
    header.dispose();

    assert.ok(renders >= 1);
  });
});
