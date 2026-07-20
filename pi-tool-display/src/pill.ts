/**
 * Colored pill badge renderer for tool call headers.
 * Ported from @gtheys/pi-tool-pills.
 *
 * Produces an inverted-colour badge like ` write ` using theme semantic roles.
 */

/** Map tool name → theme semantic colour role for the pill badge. */
const TOOL_ROLES: Record<string, string> = {
  ls: "success",
  read: "success",
  find: "mdCode",
  grep: "mdCode",
  bash: "warning",
  write: "accent",
  create: "accent",
  edit: "accent",
  mcp: "mdCode",
};

interface PillTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
  inverse(text: string): string;
}

/** Powerline round cap glyphs (require Nerd Font). */
const LEFT_CAP = "\uE0B6"; // 
const RIGHT_CAP = "\uE0B4"; // 

/** Render a rounded pill badge:  name  */
export function pill(name: string, theme: PillTheme): string {
  const role = TOOL_ROLES[name] ?? "dim";
  const body = theme.bold(theme.inverse(theme.fg(role, ` ${name} `)));
  return `${theme.fg(role, LEFT_CAP)}${body}${theme.fg(role, RIGHT_CAP)}`;
}
