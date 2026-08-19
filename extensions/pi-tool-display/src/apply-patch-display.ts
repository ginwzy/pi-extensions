import type { ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";
import { renderEditDiffResult } from "./diff-renderer.js";
import { extractTextOutput, shortenPath } from "./render-utils.js";
import type { ToolDisplayConfig } from "./types.js";

interface ApplyPatchRenderTheme {
  fg(color: string, text: string): string;
  bg?(color: string, text: string): string;
  bold(text: string): string;
  inverse(text: string): string;
  getFgAnsi?(color: string): string;
  getBgAnsi?(color: string): string;
}

interface ApplyPatchPreviewFile {
  filePath: string;
  movePath?: string;
  operation: "add" | "delete" | "update";
  diff: string;
  added: number;
  removed: number;
}

interface ApplyPatchPreview {
  files: ApplyPatchPreviewFile[];
}

interface ApplyPatchProgress {
  applied: number;
  failed: number;
  total: number;
}

interface ApplyPatchDisplayDetails {
  preview: ApplyPatchPreview;
  progress?: ApplyPatchProgress;
  failureCount: number;
}

interface ApplyPatchToolResult {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
}

interface ParsedApplyPatchDiffLine {
  raw: string;
  kind: "add" | "remove" | "context";
  oldLine: number | null;
  newLine: number | null;
  oldCursor: number;
  newCursor: number;
}

const APPLY_PATCH_TOOL_NAME = "apply_patch";
const APPLY_PATCH_CONTEXT_LINES = 3;
const APPLY_PATCH_DIFF_LINE_PATTERN = /^([+\- ])\s*(\d+)\s(.*)$/;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function parsePreviewFile(value: unknown): ApplyPatchPreviewFile | undefined {
  const record = toRecord(value);
  const operation = record.operation;
  const added = toNonNegativeInteger(record.added);
  const removed = toNonNegativeInteger(record.removed);
  if (
    typeof record.filePath !== "string"
    || record.filePath.length === 0
    || (operation !== "add" && operation !== "delete" && operation !== "update")
    || typeof record.diff !== "string"
    || added === undefined
    || removed === undefined
  ) {
    return undefined;
  }

  const file: ApplyPatchPreviewFile = {
    filePath: record.filePath,
    operation,
    diff: record.diff,
    added,
    removed,
  };
  if (typeof record.movePath === "string" && record.movePath.length > 0) {
    file.movePath = record.movePath;
  }
  return file;
}

function parseApplyPatchDetails(value: unknown): ApplyPatchDisplayDetails | undefined {
  const details = toRecord(value);
  const previewRecord = toRecord(details.preview);
  if (!Array.isArray(previewRecord.files) || previewRecord.files.length === 0) {
    return undefined;
  }

  const files: ApplyPatchPreviewFile[] = [];
  for (const value of previewRecord.files) {
    const file = parsePreviewFile(value);
    if (!file) {
      return undefined;
    }
    files.push(file);
  }

  const progressRecord = toRecord(details.progress);
  const applied = toNonNegativeInteger(progressRecord.applied);
  const failed = toNonNegativeInteger(progressRecord.failed);
  const total = toNonNegativeInteger(progressRecord.total);
  const progress = applied !== undefined && failed !== undefined && total !== undefined
    ? { applied, failed, total }
    : undefined;

  const resultRecord = toRecord(details.result);
  const failures = Array.isArray(resultRecord.failures) ? resultRecord.failures : [];
  return {
    preview: {
      files,
    },
    progress,
    failureCount: failures.length,
  };
}

function parseApplyPatchDiff(diffText: string): ParsedApplyPatchDiffLine[] | undefined {
  if (!diffText.trim()) {
    return [];
  }

  const parsed: ParsedApplyPatchDiffLine[] = [];
  let oldCursor: number | undefined;
  let newCursor: number | undefined;
  for (const raw of diffText.replace(/\r/g, "").split("\n")) {
    const match = raw.match(APPLY_PATCH_DIFF_LINE_PATTERN);
    if (!match) {
      return undefined;
    }

    const sign = match[1];
    const displayedLine = Number.parseInt(match[2] ?? "", 10);
    if (!Number.isFinite(displayedLine)) {
      return undefined;
    }

    if (oldCursor === undefined || newCursor === undefined) {
      oldCursor = displayedLine;
      newCursor = displayedLine;
    }

    const kind = sign === "+" ? "add" : sign === "-" ? "remove" : "context";
    const line: ParsedApplyPatchDiffLine = {
      raw,
      kind,
      oldLine: kind === "add" ? null : oldCursor,
      newLine: kind === "remove" ? null : newCursor,
      oldCursor,
      newCursor,
    };
    parsed.push(line);

    if (kind !== "add") oldCursor++;
    if (kind !== "remove") newCursor++;
  }
  return parsed;
}

function mergeChangedLineWindows(
  changedIndexes: number[],
  lineCount: number,
  contextLines: number,
): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  for (const index of changedIndexes) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(lineCount, index + contextLines + 1);
    const previous = windows[windows.length - 1];
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      windows.push({ start, end });
    }
  }
  return windows;
}

function formatHunkHeader(lines: ParsedApplyPatchDiffLine[]): string {
  const first = lines[0];
  const oldStart = lines.find((line) => line.oldLine !== null)?.oldLine ?? first?.oldCursor ?? 1;
  const newStart = lines.find((line) => line.newLine !== null)?.newLine ?? first?.newCursor ?? 1;
  const oldCount = lines.filter((line) => line.oldLine !== null).length;
  const newCount = lines.filter((line) => line.newLine !== null).length;
  return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
}

export function compactApplyPatchDiff(
  diffText: string,
  contextLines: number = APPLY_PATCH_CONTEXT_LINES,
): string {
  const parsed = parseApplyPatchDiff(diffText);
  if (!parsed || parsed.length === 0) {
    return diffText;
  }

  const changedIndexes = parsed
    .map((line, index) => line.kind === "context" ? -1 : index)
    .filter((index) => index >= 0);
  if (changedIndexes.length === 0) {
    return diffText;
  }

  const normalizedContextLines = Number.isFinite(contextLines)
    ? Math.max(0, Math.floor(contextLines))
    : APPLY_PATCH_CONTEXT_LINES;
  return mergeChangedLineWindows(
    changedIndexes,
    parsed.length,
    normalizedContextLines,
  )
    .flatMap(({ start, end }) => {
      const lines = parsed.slice(start, end);
      return [formatHunkHeader(lines), ...lines.map((line) => line.raw)];
    })
    .join("\n");
}

function formatOperation(operation: ApplyPatchPreviewFile["operation"]): string {
  if (operation === "add") return "added";
  if (operation === "delete") return "deleted";
  return "edited";
}

function formatFileHeader(file: ApplyPatchPreviewFile): string {
  const source = shortenPath(file.filePath);
  const target = file.movePath ? ` -> ${shortenPath(file.movePath)}` : "";
  return `${formatOperation(file.operation)} ${source}${target} (+${file.added} -${file.removed})`;
}

function formatStatus(
  details: ApplyPatchDisplayDetails,
  options: ToolRenderResultOptions,
): { color: string; text: string } {
  if (options.isPartial) {
    const progress = details.progress;
    const suffix = progress ? ` (${progress.applied + progress.failed}/${progress.total})` : "";
    return { color: "warning", text: `applying patch${suffix}...` };
  }
  if (details.failureCount > 0) {
    return { color: "error", text: "patch partially failed" };
  }
  return { color: "muted", text: "applied patch" };
}

export function renderApplyPatchResult(
  result: ApplyPatchToolResult,
  options: ToolRenderResultOptions,
  config: ToolDisplayConfig,
  theme: ApplyPatchRenderTheme,
): Component | undefined {
  const details = parseApplyPatchDetails(result.details);
  if (!details) {
    return undefined;
  }

  const container = new Container();
  const status = formatStatus(details, options);
  const contextLines = Math.min(
    APPLY_PATCH_CONTEXT_LINES,
    Math.max(0, config.diffCollapsedLines - 4),
  );
  container.addChild(new Text(theme.fg(status.color, `↳ ${status.text}`), 0, 0));

  if (!options.isPartial && details.failureCount > 0) {
    const failureText = extractTextOutput(result);
    if (failureText) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("error", failureText), 0, 0));
    }
  }

  for (const file of details.preview.files) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("accent", formatFileHeader(file)), 0, 0));
    if (!file.diff.trim()) {
      continue;
    }
    container.addChild(
      renderEditDiffResult(
        { diff: compactApplyPatchDiff(file.diff, contextLines) },
        { expanded: options.expanded, filePath: file.movePath ?? file.filePath },
        config,
        theme,
        "",
      ),
    );
  }

  return container;
}

export function isApplyPatchTool(candidate: unknown): boolean {
  return toRecord(candidate).name === APPLY_PATCH_TOOL_NAME;
}
