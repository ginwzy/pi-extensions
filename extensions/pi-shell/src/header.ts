import { basename } from "node:path";
import { VERSION, type ExtensionContext, type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import {
  bold,
  clipLine,
  dimSeparator,
  fitLineByPriority,
  uiGlyphs,
  type PaintTheme,
  type PrioritizedSegment,
} from "../../ui-style.js";

const LOGO_WIDTH = 14;
const FULL_HEADER_MIN_WIDTH = 52;
const FRAME_INTERVAL_MS = 55;
const FINAL_FRAME = 4;

const PIXEL_PHASES: ReadonlyArray<ReadonlyArray<number | undefined>> = [
  [undefined, 0, 0, 0, undefined, undefined, undefined],
  [undefined, undefined, 1, undefined, 1, undefined, undefined],
  [undefined, undefined, 2, undefined, 2, undefined, undefined],
  [undefined, undefined, 3, undefined, 3, undefined, undefined],
  [undefined, 4, 4, undefined, 4, 4, undefined],
];

const PIXEL_COLORS: readonly ThemeColor[] = [
  "accent",
  "syntaxKeyword",
  "syntaxType",
  "syntaxFunction",
  "success",
];

export interface HeaderRenderInput {
  cwd: string;
  frame: number;
  theme: PaintTheme;
  version?: string;
  width: number;
}

export function formatWorkspacePath(cwd: string): string {
  const home = process.env.HOME;
  if (!home || (cwd !== home && !cwd.startsWith(`${home}/`))) return cwd;
  return `~${cwd.slice(home.length)}`;
}

function renderLogo(frame: number, theme: PaintTheme): string[] {
  const current = Math.max(0, Math.min(FINAL_FRAME, Math.floor(frame)));
  return PIXEL_PHASES.map((row, rowIndex) => row.map((phase) => {
    if (phase === undefined || phase > current) return "  ";
    return theme.fg(PIXEL_COLORS[rowIndex], "██");
  }).join(""));
}

function joinColumns(left: string, right: string, width: number, theme: PaintTheme): string {
  const leftWidth = visibleWidth(left);
  const available = Math.max(0, width - leftWidth - 2);
  if (!right || available === 0) return clipLine(left, width, theme);
  return `${left}  ${clipLine(right, available, theme)}`;
}

function renderCompactHeader(input: HeaderRenderInput): string[] {
  const { cwd, theme, width } = input;
  const workspace = basename(cwd) || cwd;
  const segments: PrioritizedSegment[] = [
    {
      text: `${bold(theme, theme.fg("accent", "Pi"))} ${theme.fg("dim", `v${input.version ?? VERSION}`)}`,
      priority: 100,
      clippable: false,
    },
    {
      text: `${theme.fg("syntaxType", uiGlyphs.workspace)} ${theme.fg("text", workspace)}`,
      priority: 70,
      minWidth: 8,
    },
    {
      text: theme.fg("muted", formatWorkspacePath(cwd)),
      priority: 20,
      minWidth: 8,
    },
  ];
  const separator = ` ${dimSeparator(theme)} `;
  const line = fitLineByPriority(segments, Math.max(1, width), theme, separator);
  const fallback = bold(theme, theme.fg("accent", "Pi"));
  return [clipLine(line || fallback, Math.max(1, width), theme)];
}

export function renderShellHeader(input: HeaderRenderInput): string[] {
  const width = Math.max(1, input.width);
  if (width < FULL_HEADER_MIN_WIDTH) return renderCompactHeader({ ...input, width });

  const logo = renderLogo(input.frame, input.theme);
  const workspace = basename(input.cwd) || input.cwd;
  const info = [
    `${bold(input.theme, input.theme.fg("accent", "Pi"))} ${input.theme.fg("dim", `v${input.version ?? VERSION}`)}`,
    "",
    bold(input.theme, input.theme.fg("text", workspace)),
    `${input.theme.fg("syntaxType", uiGlyphs.workspace)} ${input.theme.fg("muted", formatWorkspacePath(input.cwd))}`,
    input.theme.fg("dim", "workspace ready"),
  ];

  return logo.map((line, index) => joinColumns(line.padEnd(LOGO_WIDTH), info[index] ?? "", width, input.theme));
}

export class ShellHeader implements Component {
  private frame: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly ctx: ExtensionContext,
    private readonly tui: TUI,
    private readonly theme: Theme,
    animate: boolean,
  ) {
    this.frame = animate ? 0 : FINAL_FRAME;
    if (animate) this.scheduleFrame();
  }

  private scheduleFrame(): void {
    this.timer = setTimeout(() => {
      if (this.disposed) return;
      this.frame++;
      this.tui.requestRender();
      if (this.frame < FINAL_FRAME) this.scheduleFrame();
      else this.timer = undefined;
    }, FRAME_INTERVAL_MS);
    this.timer.unref?.();
  }

  render(width: number): string[] {
    return renderShellHeader({
      cwd: this.ctx.cwd,
      frame: this.frame,
      theme: this.theme,
      width,
    });
  }

  invalidate(): void {}

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export function installShellHeader(ctx: ExtensionContext, animate: boolean): void {
  if (!ctx.hasUI || ctx.mode !== "tui") return;
  ctx.ui.setHeader((tui: TUI, theme: Theme) => new ShellHeader(ctx, tui, theme, animate));
}
