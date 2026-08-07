import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SHELL_CONFIG } from "./config.js";
import { getShellConfigPath, loadShellConfig, normalizeShellConfig, saveShellConfig } from "./config-store.js";

describe("normalizeShellConfig", () => {
  it("falls back to defaults for missing or invalid values", () => {
    assert.deepEqual(normalizeShellConfig(undefined), DEFAULT_SHELL_CONFIG);
    assert.deepEqual(normalizeShellConfig("garbage"), DEFAULT_SHELL_CONFIG);
    assert.deepEqual(
      normalizeShellConfig({ icons: "wingdings", footerContextStyle: "huge", headerEnabled: "yes" }),
      DEFAULT_SHELL_CONFIG,
    );
  });

  it("keeps valid values", () => {
    const config = normalizeShellConfig({
      icons: "nerd",
      headerEnabled: false,
      headerAnimate: false,
      headerShowPath: false,
      footerContextStyle: "percent",
      footerShowModel: false,
      footerShowGit: false,
      footerShowProviders: false,
    });
    assert.equal(config.icons, "nerd");
    assert.equal(config.headerEnabled, false);
    assert.equal(config.headerAnimate, false);
    assert.equal(config.headerShowPath, false);
    assert.equal(config.footerContextStyle, "percent");
    assert.equal(config.footerShowModel, false);
    assert.equal(config.footerShowGit, false);
    assert.equal(config.footerShowProviders, false);
  });
});

describe("shell config persistence", () => {
  let tempDir: string;
  let previousAgentDir: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-shell-config-"));
    previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = tempDir;
  });

  afterEach(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults before any config file exists", () => {
    assert.deepEqual(loadShellConfig(), DEFAULT_SHELL_CONFIG);
  });

  it("round-trips saved config through the agent dir", () => {
    const result = saveShellConfig({ ...DEFAULT_SHELL_CONFIG, icons: "ascii", footerContextStyle: "off" });
    assert.deepEqual(result, { success: true });
    assert.ok(getShellConfigPath().startsWith(join(tempDir, "extensions", "pi-shell")));

    const config = loadShellConfig();
    assert.equal(config.icons, "ascii");
    assert.equal(config.footerContextStyle, "off");
  });

  it("picks up manual JSON edits", () => {
    saveShellConfig(DEFAULT_SHELL_CONFIG);
    const file = getShellConfigPath();
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    raw.headerShowPath = false;
    writeFileSync(file, JSON.stringify(raw));

    assert.equal(loadShellConfig().headerShowPath, false);
  });

  it("falls back to defaults when the file is corrupt", () => {
    const file = getShellConfigPath();
    mkdirSync(join(tempDir, "extensions", "pi-shell"), { recursive: true });
    writeFileSync(file, "{ not json");

    assert.deepEqual(loadShellConfig(), DEFAULT_SHELL_CONFIG);
  });
});
