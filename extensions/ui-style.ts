import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

export type PaintTheme = Pick<Theme, "fg"> & Partial<Pick<Theme, "bold" | "strikethrough">>;
export type IconMode = "auto" | "nerd" | "ascii";

export interface UiGlyphs {
  active: string;
  pending: string;
  done: string;
  blocked: string;
  marker: string;
  arrow: string;
  ellipsis: string;
  separator: string;
  barDone: string;
  barActive: string;
  barPending: string;
  selectMarker: string;
  emptyMark: string;
  model: string;
  git: string;
  workspace: string;
  task: string;
  rewind: string;
  box: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    horizontal: string;
    vertical: string;
  };
}

const NERD_GLYPHS: UiGlyphs = {
  active: "●",
  pending: "○",
  done: "✓",
  blocked: "!",
  marker: "◆",
  arrow: "›",
  ellipsis: "…",
  separator: " · ",
  barDone: "█",
  barActive: "▓",
  barPending: "░",
  selectMarker: "›",
  emptyMark: "○",
  model: "⚡",
  git: "",
  workspace: "",
  task: "☰",
  rewind: "↺",
  box: { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" },
};

const ASCII_GLYPHS: UiGlyphs = {
  active: "*",
  pending: "o",
  done: "+",
  blocked: "!",
  marker: "*",
  arrow: ">",
  ellipsis: "...",
  separator: " | ",
  barDone: "#",
  barActive: "+",
  barPending: "-",
  selectMarker: ">",
  emptyMark: "o",
  model: "~",
  git: "git",
  workspace: "[]",
  task: "task",
  rewind: "rew",
  box: { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" },
};

const NERD_FONT_TERMINALS = new Set([
  "iTerm.app",
  "Ghostty",
  "WezTerm",
  "kitty",
  "rio",
  "tabby",
  "WindowsTerminal",
  "vscode",
]);

export function detectNerdFont(): boolean {
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram && NERD_FONT_TERMINALS.has(termProgram)) return true;
  const lcTerminal = process.env.LC_TERMINAL;
  if (lcTerminal && NERD_FONT_TERMINALS.has(lcTerminal)) return true;
  if (process.env.TERM === "xterm-kitty") return true;
  if (process.env.WT_SESSION) return true;
  return false;
}

export function resolveIconMode(mode: IconMode = "auto"): "nerd" | "ascii" {
  const envMode = process.env.PI_EXTENSIONS_ICON_MODE;
  const selected = envMode === "nerd" || envMode === "ascii" || envMode === "auto" ? envMode : mode;
  if (selected === "nerd") return "nerd";
  if (selected === "ascii") return "ascii";
  return detectNerdFont() ? "nerd" : "ascii";
}

export function resolveGlyphs(mode: IconMode = "auto"): UiGlyphs {
  return resolveIconMode(mode) === "nerd" ? NERD_GLYPHS : ASCII_GLYPHS;
}

export const uiGlyphs = resolveGlyphs("auto");

export interface PrioritizedSegment {
  text: string;
  priority: number;
  clippable?: boolean;
  minWidth?: number;
}

export function bold(theme: PaintTheme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

export function struck(theme: PaintTheme, text: string): string {
  return theme.strikethrough ? theme.strikethrough(text) : text;
}

export function dimSeparator(theme: PaintTheme): string {
  return theme.fg("dim", uiGlyphs.separator.trim());
}

export function clipLine(text: string, width: number, theme: PaintTheme): string {
  return truncateToWidth(text, Math.max(1, width), theme.fg("dim", uiGlyphs.ellipsis));
}

export function fitLineByPriority(
  segments: readonly PrioritizedSegment[],
  width: number,
  theme: PaintTheme,
  separator = ` ${dimSeparator(theme)} `,
): string {
  const maxWidth = Math.max(1, width);
  const ellipsis = theme.fg("dim", uiGlyphs.ellipsis);
  const ellipsisWidth = visibleWidth(ellipsis);
  const separatorWidth = visibleWidth(separator);
  const items = segments.map((segment) => ({
    text: segment.text,
    priority: segment.priority,
    clippable: segment.clippable !== false,
    minWidth: Math.max(segment.minWidth ?? 0, ellipsisWidth + 1),
    width: visibleWidth(segment.text),
  }));

  const totalWidth = (): number => {
    const active = items.filter((item) => item.text !== "");
    return active.reduce((total, item) => total + item.width, 0)
      + Math.max(0, active.length - 1) * separatorWidth;
  };

  while (totalWidth() > maxWidth) {
    let target = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].text !== "" && (target === -1 || items[i].priority < items[target].priority)) {
        target = i;
      }
    }
    if (target === -1) break;

    const otherItems = items.filter((_, index) => index !== target && items[index].text !== "");
    const otherWidth = otherItems.reduce((total, item) => total + item.width, 0)
      + Math.max(0, otherItems.length - 1) * separatorWidth;
    const available = maxWidth - otherWidth - (otherItems.length > 0 ? separatorWidth : 0);
    const drop = (): void => {
      items[target].text = "";
      items[target].width = 0;
    };

    if (!items[target].clippable || available < items[target].minWidth) {
      drop();
    } else if (available < items[target].width) {
      const clipped = truncateToWidth(items[target].text, available, ellipsis);
      const clippedWidth = visibleWidth(clipped);
      if (clippedWidth < items[target].minWidth) {
        drop();
      } else {
        items[target].text = clipped;
        items[target].width = clippedWidth;
      }
    } else {
      break;
    }
  }

  return items.filter((item) => item.text !== "").map((item) => item.text).join(separator);
}

export function statusGlyph(
  theme: PaintTheme,
  status: "active" | "pending" | "done" | "blocked",
): string {
  const color: Record<typeof status, ThemeColor> = {
    active: "warning",
    pending: "accent",
    done: "success",
    blocked: "error",
  };
  return theme.fg(color[status], uiGlyphs[status]);
}

export function renderBar(pct: number, width: number, theme: PaintTheme): string {
  const cells = Math.max(0, width);
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.max(0, Math.min(cells, Math.round((clamped / 100) * cells)));
  const empty = cells - filled;
  const color: ThemeColor = pct >= 90 ? "error" : pct >= 70 ? "warning" : "accent";
  return theme.fg("dim", "[")
    + theme.fg(color, uiGlyphs.barDone.repeat(filled))
    + theme.fg("dim", uiGlyphs.barPending.repeat(empty))
    + theme.fg("dim", "]");
}

export function boxedLines(lines: readonly string[], width: number, theme: PaintTheme): string[] {
  const maxWidth = Math.max(4, width);
  const innerWidth = Math.max(0, maxWidth - 4);
  const box = uiGlyphs.box;
  const horizontal = box.horizontal.repeat(Math.max(0, maxWidth - 2));
  const border = (text: string): string => theme.fg("borderMuted", text);
  const result = [border(`${box.topLeft}${horizontal}${box.topRight}`)];
  for (const line of lines) {
    const clipped = clipLine(line, innerWidth, theme);
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
    result.push(`${border(box.vertical)} ${clipped}${padding} ${border(box.vertical)}`);
  }
  result.push(border(`${box.bottomLeft}${horizontal}${box.bottomRight}`));
  return result;
}

export class RenderLines implements Component {
  constructor(private readonly renderLines: (width: number) => string[]) {}

  render(width: number): string[] {
    return this.renderLines(Math.max(1, width));
  }

  invalidate(): void {}
}
