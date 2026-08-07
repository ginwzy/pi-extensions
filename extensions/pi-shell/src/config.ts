import type { IconMode } from "../../ui-style.js";

export type FooterContextStyle = "full" | "compact" | "percent" | "off";

export const FOOTER_CONTEXT_STYLES: readonly FooterContextStyle[] = ["full", "compact", "percent", "off"];
export const ICON_MODES: readonly IconMode[] = ["auto", "nerd", "ascii"];

export interface ShellConfig {
  /** Glyph set selection. "auto" detects Nerd Font support from the terminal. */
  icons: IconMode;
  headerEnabled: boolean;
  headerAnimate: boolean;
  headerShowPath: boolean;
  footerContextStyle: FooterContextStyle;
  footerShowModel: boolean;
  footerShowGit: boolean;
  footerShowProviders: boolean;
}

export const DEFAULT_SHELL_CONFIG: ShellConfig = {
  icons: "auto",
  headerEnabled: true,
  headerAnimate: true,
  headerShowPath: true,
  footerContextStyle: "full",
  footerShowModel: true,
  footerShowGit: true,
  footerShowProviders: true,
};
