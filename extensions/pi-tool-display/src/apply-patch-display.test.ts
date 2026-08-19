import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type {
  ExtensionAPI,
  ToolDefinition,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  compactApplyPatchDiff,
  renderApplyPatchResult,
} from "./apply-patch-display.js";
import { disposeAll, resetDisposed } from "./disposable.js";
import { registerToolDisplayOverrides } from "./tool-overrides.js";
import { DEFAULT_TOOL_DISPLAY_CONFIG } from "./types.js";
import applyPatchBridgeExtension from "../../pi-apply-patch/index.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  inverse: (text: string) => text,
};

const collapsedOptions = {
  expanded: false,
  isPartial: false,
} as ToolRenderResultOptions;

function buildDeepDiff(changes: Map<number, string>, lineCount = 80): string {
  const lines: string[] = [];
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
    const replacement = changes.get(lineNumber);
    if (replacement === undefined) {
      lines.push(` ${lineNumber} line-${lineNumber}`);
      continue;
    }
    lines.push(`-${lineNumber} line-${lineNumber}`);
    lines.push(`+${lineNumber} ${replacement}`);
  }
  return lines.join("\n");
}

function createResult(files: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text", text: "update: sample.ts" }],
    details: {
      preview: {
        files,
        added: files.reduce((sum, file) => sum + Number(file.added ?? 0), 0),
        removed: files.reduce((sum, file) => sum + Number(file.removed ?? 0), 0),
      },
      ...extra,
    },
  };
}

function render(component: { render(width: number): string[] } | undefined, width = 100): string {
  return component?.render(width).join("\n") ?? "";
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

describe("apply_patch tool display adapter", () => {
  afterEach(() => disposeAll());

  it("keeps a deep-file change in the compact diff window", () => {
    const compact = compactApplyPatchDiff(buildDeepDiff(new Map([[50, "line-50 updated"]])));

    assert.match(compact, /@@ -47,7 \+47,7 @@/);
    assert.match(compact, /-50 line-50/);
    assert.match(compact, /\+50 line-50 updated/);
    assert.doesNotMatch(compact, / 1 line-1/);
    assert.doesNotMatch(compact, / 80 line-80/);
  });

  it("shows concrete changed lines while collapsed", () => {
    const result = createResult([
      {
        filePath: "src/sample.ts",
        operation: "update",
        diff: buildDeepDiff(new Map([[50, "line-50 updated"]])),
        added: 1,
        removed: 1,
      },
    ]);

    const output = stripAnsi(render(renderApplyPatchResult(
      result,
      collapsedOptions,
      DEFAULT_TOOL_DISPLAY_CONFIG,
      theme,
    )));

    assert.match(output, /applied patch/);
    assert.match(output, /edited src\/sample\.ts \(\+1 -1\)/);
    assert.match(output, /line-50 updated/);
    assert.match(output, /line-50/);
  });

  it("renders each file in a multi-file patch", () => {
    const result = createResult([
      {
        filePath: "src/a.ts",
        operation: "update",
        diff: "-1 before-a\n+1 after-a",
        added: 1,
        removed: 1,
      },
      {
        filePath: "src/b.ts",
        movePath: "src/c.ts",
        operation: "update",
        diff: "-1 before-b\n+1 after-b",
        added: 1,
        removed: 1,
      },
    ]);

    const output = stripAnsi(render(renderApplyPatchResult(
      result,
      collapsedOptions,
      DEFAULT_TOOL_DISPLAY_CONFIG,
      theme,
    )));

    assert.match(output, /edited src\/a\.ts \(\+1 -1\)/);
    assert.match(output, /after-a/);
    assert.match(output, /edited src\/b\.ts -> src\/c\.ts \(\+1 -1\)/);
    assert.match(output, /after-b/);
  });

  it("uses shared collapsed and expanded diff limits", () => {
    const result = createResult([
      {
        filePath: "src/sample.ts",
        operation: "update",
        diff: buildDeepDiff(new Map([
          [10, "line-10 updated"],
          [70, "line-70 updated"],
        ])),
        added: 2,
        removed: 2,
      },
    ]);
    const config = { ...DEFAULT_TOOL_DISPLAY_CONFIG, diffCollapsedLines: 8 };

    const collapsed = stripAnsi(render(renderApplyPatchResult(
      result,
      collapsedOptions,
      config,
      theme,
    )));
    const expanded = stripAnsi(render(renderApplyPatchResult(
      result,
      { ...collapsedOptions, expanded: true },
      config,
      theme,
    )));

    assert.match(collapsed, /line-10 updated/);
    assert.doesNotMatch(collapsed, /line-70 updated/);
    assert.match(expanded, /line-10 updated/);
    assert.match(expanded, /line-70 updated/);
  });

  it("shows apply progress for partial results", () => {
    const result = createResult(
      [{
        filePath: "src/sample.ts",
        operation: "update",
        diff: "-1 before\n+1 after",
        added: 1,
        removed: 1,
      }],
      { progress: { applied: 1, failed: 0, total: 2 } },
    );

    const output = stripAnsi(render(renderApplyPatchResult(
      result,
      { ...collapsedOptions, isPartial: true },
      DEFAULT_TOOL_DISPLAY_CONFIG,
      theme,
    )));

    assert.match(output, /applying patch \(1\/2\)\.\.\./);
    assert.match(output, /after/);
  });

  it("preserves failure reasons alongside the diff", () => {
    const result = createResult(
      [{
        filePath: "src/sample.ts",
        operation: "update",
        diff: "-1 before\n+1 after",
        added: 1,
        removed: 1,
      }],
      { result: { failures: [{ filePath: "src/sample.ts" }] } },
    );
    result.content[0]!.text = "apply_patch failed.\nFailed: context mismatch";

    const output = stripAnsi(render(renderApplyPatchResult(
      result,
      collapsedOptions,
      DEFAULT_TOOL_DISPLAY_CONFIG,
      theme,
    )));

    assert.match(output, /patch partially failed/);
    assert.match(output, /Failed: context mismatch/);
    assert.match(output, /after/);
  });

  it("returns undefined when the upstream preview contract is unavailable", () => {
    assert.equal(
      renderApplyPatchResult(
        { content: [{ type: "text", text: "upstream fallback" }] },
        collapsedOptions,
        DEFAULT_TOOL_DISPLAY_CONFIG,
        theme,
      ),
      undefined,
    );
  });

  it("decorates apply_patch across isolated extension API objects and preserves fallback", () => {
    resetDisposed();
    const displayTools: ToolDefinition[] = [];
    const displayPi = {
      registerTool(tool: ToolDefinition) {
        displayTools.push(tool);
      },
      getAllTools() {
        return displayTools;
      },
      on() {},
    } as unknown as ExtensionAPI;
    registerToolDisplayOverrides(displayPi, () => DEFAULT_TOOL_DISPLAY_CONFIG);

    let applyPatchTool: ToolDefinition | undefined;
    const applyPatchPi = {
      registerTool(tool: ToolDefinition) {
        applyPatchTool = tool;
      },
      getActiveTools() {
        return ["read", "bash", "edit", "write"];
      },
      setActiveTools() {},
      on() {},
    } as unknown as ExtensionAPI;
    applyPatchBridgeExtension(applyPatchPi);

    assert.ok(applyPatchTool?.renderResult);
    const fallback = applyPatchTool.renderResult(
      { content: [{ type: "text", text: "no preview" }], details: undefined },
      collapsedOptions,
      theme as never,
      {} as never,
    );
    assert.match(render(fallback as Text), /no preview/);

    const decorated = applyPatchTool.renderResult(
      createResult([{
        filePath: "src/bridged.ts",
        operation: "update",
        diff: "-1 before\n+1 after",
        added: 1,
        removed: 1,
      }]) as never,
      collapsedOptions,
      theme as never,
      {} as never,
    );
    assert.match(stripAnsi(render(decorated as Text)), /edited src\/bridged\.ts/);
    assert.equal(displayTools.some((tool) => tool.name === "apply_patch"), false);
  });
});
