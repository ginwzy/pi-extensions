import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ICON_MODES, FOOTER_CONTEXT_STYLES, DEFAULT_SHELL_CONFIG, type ShellConfig } from "./config.js";
import { applyShellConfig, getShellConfigPath, loadShellConfig, saveShellConfig } from "./config-store.js";
import { installShellHeader } from "./header.js";
import type { InspectorSettingItem } from "../../settings-inspector-modal.js";

interface ModalOverlayOptions {
  anchor: "center";
  width: number;
  maxHeight: number;
  margin: number;
}

const ON_OFF = ["on", "off"] as const;

function toOnOff(value: boolean): string {
  return value ? "on" : "off";
}

function shortenPath(path: string): string {
  const home = process.env.HOME;
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}

export function summarizeShellConfig(config: ShellConfig): string {
  return [
    `icons=${config.icons}`,
    `header=${toOnOff(config.headerEnabled)}`,
    `animate=${toOnOff(config.headerAnimate)}`,
    `path=${toOnOff(config.headerShowPath)}`,
    `context=${config.footerContextStyle}`,
    `model=${toOnOff(config.footerShowModel)}`,
    `git=${toOnOff(config.footerShowGit)}`,
    `providers=${toOnOff(config.footerShowProviders)}`,
  ].join(", ");
}

function buildInspectorSettings(config: ShellConfig): InspectorSettingItem[] {
  const configPath = shortenPath(getShellConfigPath());
  return [
    {
      id: "icons",
      label: "Icon style",
      currentValue: config.icons,
      values: ICON_MODES,
      inspectorTitle: "Icon Style",
      inspectorSummary: [
        "Selects the glyph set used across the Pi shell, footer, and other extensions sharing the UI style module.",
        "Auto detects Nerd Font support from the terminal; nerd forces rich icons; ascii falls back to plain characters.",
      ],
      inspectorOptions: [
        "auto — detect the terminal's Nerd Font support",
        "nerd — force Nerd Font glyphs",
        "ascii — plain ASCII fallback glyphs",
      ],
      inspectorPath: configPath,
      searchTerms: ["nerd", "font", "glyph", "icon", "ascii"],
    },
    {
      id: "headerEnabled",
      label: "Header",
      currentValue: toOnOff(config.headerEnabled),
      values: ON_OFF,
      inspectorTitle: "Header",
      inspectorSummary: [
        "Shows or hides the Pi shell header with the logo and workspace information.",
      ],
      inspectorOptions: ["on — show the header", "off — hide the header"],
      inspectorPath: configPath,
      searchTerms: ["header", "logo", "banner", "visible"],
    },
    {
      id: "headerAnimate",
      label: "Header animation",
      currentValue: toOnOff(config.headerAnimate),
      values: ON_OFF,
      inspectorTitle: "Header Animation",
      inspectorSummary: [
        "Plays the pixel logo build-up animation when a session starts.",
        "Toggling this setting to on replays the animation as a preview.",
      ],
      inspectorOptions: ["on — animate the logo on startup", "off — show the final logo immediately"],
      inspectorPath: configPath,
      searchTerms: ["animation", "animate", "logo", "startup"],
    },
    {
      id: "headerShowPath",
      label: "Header path",
      currentValue: toOnOff(config.headerShowPath),
      values: ON_OFF,
      inspectorTitle: "Header Path",
      inspectorSummary: [
        "Controls whether the header shows the full workspace path in addition to the workspace name.",
      ],
      inspectorOptions: ["on — show the full workspace path", "off — workspace name only"],
      inspectorPath: configPath,
      searchTerms: ["path", "directory", "cwd", "workspace"],
    },
    {
      id: "footerContextStyle",
      label: "Context usage",
      currentValue: config.footerContextStyle,
      values: FOOTER_CONTEXT_STYLES,
      inspectorTitle: "Context Usage",
      inspectorSummary: [
        "Controls how the footer presents the context window usage.",
        "Full shows the bar, percentage, and token counts, then degrades gracefully when space runs out.",
      ],
      inspectorOptions: [
        "full — bar, percentage, and token counts",
        "compact — short bar and percentage",
        "percent — percentage only",
        "off — hide context usage",
      ],
      inspectorPath: configPath,
      searchTerms: ["context", "tokens", "usage", "bar", "percent"],
    },
    {
      id: "footerShowModel",
      label: "Model info",
      currentValue: toOnOff(config.footerShowModel),
      values: ON_OFF,
      inspectorTitle: "Model Info",
      inspectorSummary: ["Shows the active model and thinking level on the right side of the footer."],
      inspectorOptions: ["on — show model and thinking level", "off — hide model info"],
      inspectorPath: configPath,
      searchTerms: ["model", "thinking", "footer"],
    },
    {
      id: "footerShowGit",
      label: "Git branch",
      currentValue: toOnOff(config.footerShowGit),
      values: ON_OFF,
      inspectorTitle: "Git Branch",
      inspectorSummary: ["Shows the current git branch on the right side of the footer."],
      inspectorOptions: ["on — show the git branch", "off — hide the git branch"],
      inspectorPath: configPath,
      searchTerms: ["git", "branch", "footer"],
    },
    {
      id: "footerShowProviders",
      label: "Provider count",
      currentValue: toOnOff(config.footerShowProviders),
      values: ON_OFF,
      inspectorTitle: "Provider Count",
      inspectorSummary: ["Shows the number of available providers on the right side of the footer."],
      inspectorOptions: ["on — show the provider count", "off — hide the provider count"],
      inspectorPath: configPath,
      searchTerms: ["provider", "count", "footer"],
    },
  ];
}

function applySetting(config: ShellConfig, id: string, value: string): ShellConfig {
  switch (id) {
    case "icons":
      return { ...config, icons: value as ShellConfig["icons"] };
    case "headerEnabled":
      return { ...config, headerEnabled: value === "on" };
    case "headerAnimate":
      return { ...config, headerAnimate: value === "on" };
    case "headerShowPath":
      return { ...config, headerShowPath: value === "on" };
    case "footerContextStyle":
      return { ...config, footerContextStyle: value as ShellConfig["footerContextStyle"] };
    case "footerShowModel":
      return { ...config, footerShowModel: value === "on" };
    case "footerShowGit":
      return { ...config, footerShowGit: value === "on" };
    case "footerShowProviders":
      return { ...config, footerShowProviders: value === "on" };
    default:
      return config;
  }
}

/** Persists the config and applies effects visible outside the footer render loop. */
export function applyShellConfigChange(
  ctx: ExtensionContext,
  next: ShellConfig,
  changed?: { id: string; value: string },
): void {
  saveShellConfig(next);
  applyShellConfig(next);
  if (!ctx.hasUI || ctx.mode !== "tui") return;
  if (next.headerEnabled) {
    const animate = changed?.id === "headerAnimate" && changed.value === "on";
    installShellHeader(ctx, animate, next.headerShowPath);
  } else {
    ctx.ui.setHeader(undefined);
  }
}

function resolveResponsiveOverlayOptions(): ModalOverlayOptions {
  const terminalWidth =
    typeof process.stdout.columns === "number" && Number.isFinite(process.stdout.columns)
      ? process.stdout.columns
      : 120;
  const terminalHeight =
    typeof process.stdout.rows === "number" && Number.isFinite(process.stdout.rows)
      ? process.stdout.rows
      : 36;

  const margin = 1;
  const availableWidth = Math.max(72, terminalWidth - margin * 2);
  const preferredWidth = terminalWidth >= 170 ? 128 : terminalWidth >= 145 ? 118 : terminalWidth >= 120 ? 106 : 92;
  const width = Math.max(72, Math.min(preferredWidth, availableWidth));

  const availableHeight = Math.max(14, terminalHeight - margin * 2);
  const preferredHeight = Math.max(14, Math.floor(terminalHeight * 0.78));
  const maxHeight = Math.min(preferredHeight, availableHeight);

  return { anchor: "center", width, maxHeight, margin };
}

async function openShellSettingsModal(ctx: ExtensionCommandContext): Promise<void> {
  const overlayOptions = resolveResponsiveOverlayOptions();

  const [{ ZellijModal }, { SplitPaneInspectorModal }] = await Promise.all([
    import("../../zellij-modal.js"),
    import("../../settings-inspector-modal.js"),
  ]);

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => {
      const inspector = new SplitPaneInspectorModal(
        {
          title: "Pi Shell Settings",
          getSettings: () => buildInspectorSettings(loadShellConfig()),
          onChange: (id, newValue) => {
            const next = applySetting(loadShellConfig(), id, newValue);
            applyShellConfigChange(ctx, next, { id, value: newValue });
          },
          onClose: () => done(),
        },
        theme,
      );

      const modal = new ZellijModal(
        inspector,
        {
          borderStyle: "square",
          padding: 0,
          titleBar: {},
          overlay: overlayOptions,
        },
        theme,
      );

      return {
        render: (width: number) => modal.renderModal(width).lines,
        invalidate: () => modal.invalidate(),
        handleInput(data: string) {
          modal.handleInput(data);
          tui.requestRender();
        },
      };
    },
    { overlay: true, overlayOptions },
  );
}

function handleShellArgs(args: string, ctx: ExtensionCommandContext): boolean {
  const normalized = args.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized === "show") {
    ctx.ui.notify(`shell: ${summarizeShellConfig(loadShellConfig())}`, "info");
    return true;
  }

  if (normalized === "reset") {
    applyShellConfigChange(ctx, { ...DEFAULT_SHELL_CONFIG });
    ctx.ui.notify("Shell settings reset to defaults.", "info");
    return true;
  }

  ctx.ui.notify("Usage: /shell [show|reset]", "warning");
  return true;
}

export function registerShellCommand(pi: ExtensionAPI): void {
  pi.registerCommand("shell", {
    description: "Configure the Pi shell header and footer",
    handler: async (args, ctx) => {
      if (handleShellArgs(args, ctx)) return;
      if (!ctx.hasUI) {
        ctx.ui.notify("/shell requires interactive TUI mode.", "warning");
        return;
      }
      await openShellSettingsModal(ctx);
    },
  });
}
