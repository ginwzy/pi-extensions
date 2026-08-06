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

/** Render an inverted-colour pill badge: ` name ` */
export function pill(name: string, theme: PillTheme): string {
  const role = TOOL_ROLES[name] ?? "dim";
  return theme.bold(theme.inverse(theme.fg(role, ` ${name} `)));
}
