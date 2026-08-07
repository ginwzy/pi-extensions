import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { configureUiGlyphs } from "../../ui-style.js";
import { DEFAULT_SHELL_CONFIG, FOOTER_CONTEXT_STYLES, ICON_MODES, type ShellConfig } from "./config.js";

const PI_AGENT_DIR_ENV_VAR = "PI_CODING_AGENT_DIR";

function resolvePiAgentDir(): string {
  const configured = process.env[PI_AGENT_DIR_ENV_VAR];
  if (!configured) return join(homedir(), ".pi", "agent");
  if (configured === "~") return homedir();
  if (configured.startsWith("~/")) return join(homedir(), configured.slice(2));
  return configured;
}

function getConfigFile(): string {
  return join(resolvePiAgentDir(), "extensions", "pi-shell", "config.json");
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toIconMode(value: unknown): ShellConfig["icons"] {
  return ICON_MODES.includes(value as ShellConfig["icons"]) ? (value as ShellConfig["icons"]) : DEFAULT_SHELL_CONFIG.icons;
}

function toContextStyle(value: unknown): ShellConfig["footerContextStyle"] {
  return FOOTER_CONTEXT_STYLES.includes(value as ShellConfig["footerContextStyle"])
    ? (value as ShellConfig["footerContextStyle"])
    : DEFAULT_SHELL_CONFIG.footerContextStyle;
}

export function normalizeShellConfig(raw: unknown): ShellConfig {
  const source = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    icons: toIconMode(source.icons),
    headerEnabled: toBoolean(source.headerEnabled, DEFAULT_SHELL_CONFIG.headerEnabled),
    headerAnimate: toBoolean(source.headerAnimate, DEFAULT_SHELL_CONFIG.headerAnimate),
    headerShowPath: toBoolean(source.headerShowPath, DEFAULT_SHELL_CONFIG.headerShowPath),
    footerContextStyle: toContextStyle(source.footerContextStyle),
    footerShowModel: toBoolean(source.footerShowModel, DEFAULT_SHELL_CONFIG.footerShowModel),
    footerShowGit: toBoolean(source.footerShowGit, DEFAULT_SHELL_CONFIG.footerShowGit),
    footerShowProviders: toBoolean(source.footerShowProviders, DEFAULT_SHELL_CONFIG.footerShowProviders),
  };
}

let cachedPath: string | undefined;
let cachedFingerprint: string | undefined;
let cachedConfig: ShellConfig | undefined;

function getConfigFingerprint(configFile: string): string {
  try {
    const stats = statSync(configFile);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

export function loadShellConfig(): ShellConfig {
  const configFile = getConfigFile();
  const fingerprint = getConfigFingerprint(configFile);
  if (cachedConfig && cachedPath === configFile && cachedFingerprint === fingerprint) {
    return { ...cachedConfig };
  }

  let config: ShellConfig;
  if (!existsSync(configFile)) {
    config = { ...DEFAULT_SHELL_CONFIG };
  } else {
    try {
      config = normalizeShellConfig(JSON.parse(readFileSync(configFile, "utf-8")));
    } catch {
      config = { ...DEFAULT_SHELL_CONFIG };
    }
  }

  cachedPath = configFile;
  cachedFingerprint = fingerprint;
  cachedConfig = config;
  return { ...config };
}

export function saveShellConfig(config: ShellConfig): { success: boolean; error?: string } {
  const configFile = getConfigFile();
  const normalized = normalizeShellConfig(config);
  const tmpFile = `${configFile}.tmp`;

  try {
    mkdirSync(dirname(configFile), { recursive: true });
    writeFileSync(tmpFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
    renameSync(tmpFile, configFile);
    cachedPath = undefined;
    cachedFingerprint = undefined;
    cachedConfig = undefined;
    return { success: true };
  } catch (error) {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors.
    }
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to save ${configFile}: ${message}` };
  }
}

export function getShellConfigPath(): string {
  return getConfigFile();
}

/** Applies config effects that live outside the header/footer renderers. */
export function applyShellConfig(config: ShellConfig): void {
  configureUiGlyphs(config.icons);
}
