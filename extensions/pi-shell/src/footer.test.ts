import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SHELL_CONFIG, type ShellConfig } from "./config.js";
import { renderRootFooter } from "./footer.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function createCtx(): ExtensionContext {
  return {
    getContextUsage: () => ({ percent: 42, tokens: 1234, contextWindow: 200_000 }),
    model: { id: "anthropic/claude-test-model" },
    thinkingLevel: "high",
  } as unknown as ExtensionContext;
}

function createFooterData(): ReadonlyFooterDataProvider {
  return {
    getExtensionStatuses: () => new Map<string, string>(),
    getGitBranch: () => "main",
    getAvailableProviderCount: () => 3,
    onBranchChange: () => () => {},
  } as unknown as ReadonlyFooterDataProvider;
}

function render(width: number, overrides: Partial<ShellConfig>): string {
  const config = { ...DEFAULT_SHELL_CONFIG, ...overrides };
  return renderRootFooter({ ctx: createCtx(), footerData: createFooterData(), theme, width, config }).join("\n");
}

describe("renderRootFooter config", () => {
  it("shows context usage, model, branch, and providers by default", () => {
    const line = render(160, {});
    assert.match(line, /42%/);
    assert.match(line, /claude-test-model/);
    assert.match(line, /main/);
    assert.match(line, /3/);
  });

  it("hides context usage when footerContextStyle is off", () => {
    assert.doesNotMatch(render(160, { footerContextStyle: "off" }), /42%/);
  });

  it("renders percent-only context without a bar", () => {
    const line = render(160, { footerContextStyle: "percent" });
    assert.match(line, /42%/);
    assert.ok(!line.includes("["), `expected no bar, got: ${line}`);
  });

  it("hides model, branch, and providers when toggled off", () => {
    const line = render(160, { footerShowModel: false, footerShowGit: false, footerShowProviders: false });
    assert.doesNotMatch(line, /claude-test-model/);
    assert.doesNotMatch(line, /main/);
  });
});
