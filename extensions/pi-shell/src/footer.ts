import { stripVTControlCharacters } from "node:util";
import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
  ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import {
  clipLine,
  dimSeparator,
  fitLineByPriority,
  renderBar,
  statusGlyph,
  uiGlyphs,
  type PaintTheme,
  type PrioritizedSegment,
} from "../../ui-style.js";
import { loadShellConfig } from "./config-store.js";
import type { FooterContextStyle, ShellConfig } from "./config.js";
import { getRootStatuses, onRootStatusChange, type RootStatus, type RootStatusState } from "./status-store.js";

const FOOTER_STATUS_KEYS = new Set(["task", "rewind"]);
const CONTROL_STATUS_KEYS = new Set(["mode", "approval-mode"]);
const HIDDEN_STATUS_KEYS = new Set([
  "maestro-auto-compact-mode",
  "swarm-best",
  "team-swarm",
]);

const UNSAFE_APPROVAL_MODES = new Set(["yolo", "bypasspermissions"]);

interface ExternalStatus {
  key: string;
  text: string;
  priority: number;
}

interface FooterRenderInput {
  ctx: ExtensionContext;
  footerData: ReadonlyFooterDataProvider;
  theme: PaintTheme;
  width: number;
  config: ShellConfig;
}

export type FooterRenderOptions = Omit<FooterRenderInput, "config"> & { config?: ShellConfig };

function shortModel(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const tail = id.split("/").at(-1);
  return tail || id;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${trimMetric(n / 1_000_000)}m`;
  if (n >= 1_000) return `${trimMetric(n / 1_000)}k`;
  return String(n);
}

function trimMetric(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

function approvalMode(text: string): string {
  return text.replace(/^APPROVAL\s+/i, "").trim().toLowerCase();
}

function externalColor(status: ExternalStatus): ThemeColor {
  if (/\b(?:error|failed|failure|blocked|denied)\b/i.test(status.text)) return "error";
  if (/\b(?:warn|warning|connecting|pending|retry)\b/i.test(status.text)) return "warning";

  if (status.key === "approval-mode") {
    const mode = approvalMode(status.text);
    if (UNSAFE_APPROVAL_MODES.has(mode)) return "error";
    if (mode === "dontask") return "warning";
    if (mode === "acceptedits") return "success";
    if (mode === "plan") return "accent";
  }

  if (status.key === "mode") {
    const mode = status.text.trim().toUpperCase();
    if (mode === "ACT") return "success";
    if (mode === "PLAN") return "warning";
    if (mode === "READY" || mode === "PLAN READY") return "accent";
  }

  return "muted";
}

function normalizeExternalStatus(status: ExternalStatus): string {
  if (status.key === "approval-mode" && UNSAFE_APPROVAL_MODES.has(approvalMode(status.text))) {
    return "YOLO";
  }
  return status.text;
}

function isSteadyMagicContextStatus(text: string): boolean {
  if (!/^mc:\s*[\d.]+[km]?\s*(?:\(\d+%\))?/i.test(text)) return false;
  const rest = text
    .replace(/^mc:\s*[\d.]+[km]?\s*(?:\(\d+%\))?/i, "")
    .replace(/^\s*(?:·|\|)\s*/, "")
    .trim();
  return rest === "" || /^(?:idle|ready|done|completed|ok)$/i.test(rest);
}

function shouldHideExternalStatus(key: string, text: string): boolean {
  const lower = text.toLowerCase();
  if (FOOTER_STATUS_KEYS.has(key) || HIDDEN_STATUS_KEYS.has(key)) return true;

  // These are either reproduced in the right-hand resource group or carry no active signal.
  if (isSteadyMagicContextStatus(text)) return true;
  if (/^mc:\s*[\d.]+[km]?\s*(?:\(\d+%\))?$/i.test(text)) return true;
  if (/^ctx\b/i.test(text)) return true;
  if (/^model\b/i.test(text)) return true;
  if (/^git\b/i.test(text)) return true;
  if (/^\d+\s+providers?$/i.test(text)) return true;
  if (/^(?:idle|ready|done|completed|ok)$/i.test(text)) return true;

  // MCP's steady 0/N server summary is noisy in the unified footer; keep active/error text.
  if (/^mcp:\s*0\/\d+\s+servers?$/i.test(text)) return true;
  if (key.toLowerCase().includes("mcp") && /\b(?:idle|ready|ok)$/i.test(lower)) return true;

  if (/^(?:TEAM SWARM\b|BEST\b|COMPLETED$)$/i.test(text)) return true;
  return false;
}

function externalPriority(key: string, text: string): number {
  if (CONTROL_STATUS_KEYS.has(key)) return 100;
  if (/\b(?:error|failed|failure|blocked|denied)\b/i.test(text)) return 85;
  if (/\b(?:warn|warning|connecting|pending|retry)\b/i.test(text)) return 70;
  if (/^mcp:/i.test(text) || key.toLowerCase().includes("mcp")) return 35;
  return 20;
}

function collectExternalStatuses(statuses: ReadonlyMap<string, string>): ExternalStatus[] {
  const result: ExternalStatus[] = [];
  for (const [key, rawText] of statuses) {
    const text = stripVTControlCharacters(rawText)
      .replace(/[\r\n\t\f\v]+/g, " ")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (shouldHideExternalStatus(key, text)) continue;
    result.push({ key, text, priority: externalPriority(key, text) });
  }
  return result.sort((a, b) => {
    const aControl = CONTROL_STATUS_KEYS.has(a.key) ? 0 : 1;
    const bControl = CONTROL_STATUS_KEYS.has(b.key) ? 0 : 1;
    return aControl - bControl || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  });
}

function rootStateGlyph(theme: PaintTheme, state: RootStatusState): string {
  if (state === "active" || state === "warning") return statusGlyph(theme, "active");
  if (state === "pending") return statusGlyph(theme, "pending");
  if (state === "error") return statusGlyph(theme, "blocked");
  return statusGlyph(theme, "done");
}

function rootStateColor(state: RootStatusState): ThemeColor {
  if (state === "active" || state === "warning") return "warning";
  if (state === "pending") return "accent";
  if (state === "error") return "error";
  return "success";
}

function renderRootStatus(status: RootStatus, theme: PaintTheme): string {
  const value = status.title ?? status.value;
  const label = theme.fg(status.state === "ok" ? "dim" : "muted", status.label);
  if (!value) return `${rootStateGlyph(theme, status.state)} ${label}`;
  if (status.state === "ok") return `${label} ${theme.fg("dim", value)}`;
  const glyph = rootStateGlyph(theme, status.state);
  return `${glyph} ${label} ${theme.fg(rootStateColor(status.state) === "success" ? "muted" : "text", value)}`;
}

function renderExternalStatus(status: ExternalStatus, theme: PaintTheme): string {
  return theme.fg(externalColor(status), normalizeExternalStatus(status));
}

function alignRight(left: string, right: string, width: number): string {
  if (right === "") return left;
  const rightWidth = visibleWidth(right);
  if (left === "") return " ".repeat(Math.max(0, width - rightWidth)) + right;
  const leftWidth = visibleWidth(left);
  if (leftWidth + rightWidth + 1 > width) return left;
  return left + " ".repeat(width - leftWidth - rightWidth) + right;
}

function contextColor(pct: number): ThemeColor {
  if (pct >= 90) return "error";
  if (pct >= 70) return "warning";
  return "success";
}

function contextCandidates(ctx: ExtensionContext, theme: PaintTheme, style: FooterContextStyle): string[] {
  if (style === "off") return [];
  const usage = ctx.getContextUsage();
  if (!usage || usage.percent === null || usage.tokens === null) return [];
  const pct = Math.max(0, Math.min(100, Math.round(usage.percent)));
  const pctText = theme.fg(contextColor(usage.percent), `${usage.percent >= 70 ? `${uiGlyphs.blocked} ` : ""}${pct}%`);
  const icon = theme.fg(contextColor(usage.percent), uiGlyphs.context);
  if (style === "percent") return [pctText];
  if (style === "compact") return [`${icon} ${renderBar(usage.percent, 4, theme)} ${pctText}`];
  const tokens = usage.contextWindow > 0
    ? `${theme.fg("dim", formatTokens(usage.tokens))}${theme.fg("dim", "/")}${theme.fg("dim", formatTokens(usage.contextWindow))}`
    : undefined;
  const candidates = [
    `${icon} ${renderBar(usage.percent, 8, theme)} ${pctText}${tokens ? ` ${dimSeparator(theme)} ${tokens}` : ""}`,
    `${icon} ${renderBar(usage.percent, 4, theme)} ${pctText}`,
    `${icon} ${pctText}`,
    pctText,
  ];
  return [...new Set(candidates)];
}

function resourceCandidates(input: FooterRenderInput): string[] {
  const { ctx, footerData, theme, config } = input;
  const sep = ` ${dimSeparator(theme)} `;
  const contexts = contextCandidates(ctx, theme, config.footerContextStyle);
  const model = config.footerShowModel ? shortModel(ctx.model?.id) : undefined;
  const thinking = ctx.thinkingLevel ?? "off";
  const modelText = model
    ? `${theme.fg("syntaxKeyword", uiGlyphs.model)}${theme.fg("accent", model)} ${theme.fg("dim", thinking)}`
    : undefined;
  const branch = config.footerShowGit ? footerData.getGitBranch() : undefined;
  const gitText = branch ? `${theme.fg("syntaxFunction", uiGlyphs.git)} ${theme.fg("syntaxFunction", branch)}` : undefined;
  const providerCount = config.footerShowProviders ? footerData.getAvailableProviderCount() : 0;
  const providerText = providerCount > 0
    ? `${theme.fg("syntaxType", uiGlyphs.provider)} ${theme.fg("dim", String(providerCount))}`
    : undefined;

  const candidates: string[] = [];
  const add = (...parts: Array<string | undefined>): void => {
    const text = parts
      .filter((part): part is string => Boolean(part))
      .reverse()
      .join(sep);
    if (text && !candidates.includes(text)) candidates.push(text);
  };

  const [fullContext, compactContext, labelledContext, percentContext] = contexts;
  add(fullContext, modelText, gitText, providerText);
  add(fullContext, modelText, gitText);
  add(compactContext, modelText, gitText);
  add(labelledContext, modelText, gitText);
  add(labelledContext, modelText);
  add(percentContext, modelText);
  add(modelText, gitText);
  add(modelText);
  add(labelledContext);
  add(percentContext);
  candidates.push("");
  return candidates;
}

export function renderRootFooter(options: FooterRenderOptions): string[] {
  const input: FooterRenderInput = { ...options, config: options.config ?? loadShellConfig() };
  const width = Math.max(1, input.width);
  const theme = input.theme;
  const external = collectExternalStatuses(input.footerData.getExtensionStatuses());
  const rootStatuses = getRootStatuses();
  const segments: PrioritizedSegment[] = [
    { text: theme.fg("accent", "pi"), priority: 95, clippable: false },
  ];
  const hasTaskStatus = rootStatuses.some((status) => /\btask\b/i.test(status.label));
  if (!hasTaskStatus) {
    segments.push({ text: `${theme.fg("dim", "task")} ${theme.fg("dim", "idle")}`, priority: 50, clippable: false });
  }

  for (const status of external.filter((candidate) => CONTROL_STATUS_KEYS.has(candidate.key))) {
    segments.push({ text: renderExternalStatus(status, theme), priority: 100, clippable: false });
  }

  for (const status of rootStatuses) {
    segments.push({ text: renderRootStatus(status, theme), priority: status.priority, minWidth: 8 });
  }

  for (const status of external.filter((candidate) => !CONTROL_STATUS_KEYS.has(candidate.key))) {
    segments.push({ text: renderExternalStatus(status, theme), priority: status.priority, minWidth: 8 });
  }

  const displaySegments = [...segments].reverse();
  const candidates = resourceCandidates(input);
  const separator = ` ${dimSeparator(theme)} `;
  for (const candidate of candidates) {
    const available = width - visibleWidth(candidate) - (candidate ? 1 : 0);
    if (available < 1) continue;
    const right = fitLineByPriority(displaySegments, available, theme, separator);
    if (!right) continue;
    const line = alignRight(candidate, right, width);
    if (visibleWidth(line) <= width) return [line];
  }

  const fallback = clipLine(fitLineByPriority(displaySegments, width, theme, separator), width, theme);
  return [alignRight("", fallback, width)];
}

export function installRootFooter(ctx: ExtensionContext): void {
  if (!ctx.hasUI || ctx.mode !== "tui") return;

  ctx.ui.setFooter((tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider): Component & { dispose(): void } => {
    const unsubscribeRootStatus = onRootStatusChange(() => tui.requestRender());
    const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
    return {
      render(width: number): string[] {
        return renderRootFooter({ ctx, footerData, theme, width });
      },
      invalidate(): void {},
      dispose(): void {
        unsubscribeRootStatus();
        unsubscribeBranch();
      },
    };
  });
}
