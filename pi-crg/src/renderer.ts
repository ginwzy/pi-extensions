import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";

export type CrgMessageDetails = {
  command: "build" | "review";
  isError: boolean;
};

export function registerCrgMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("crg-output", (message, _options, theme) => {
    const details = message.details as CrgMessageDetails | undefined;
    const command = details?.command ?? "output";
    const isError = details?.isError ?? false;
    const background = isError ? "toolErrorBg" : "toolSuccessBg";

    const title = theme.fg("toolTitle", theme.bold("crg"));
    const subtitle = theme.fg(isError ? "error" : "muted", ` ${command}`);
    const content = typeof message.content === "string"
      ? message.content
      : message.content
          .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
          .map((part) => part.text)
          .join("\n");
    const output = theme.fg("toolOutput", content || "(no output)");

    const box = new Box(1, 0, (text) => theme.bg(background, text));
    box.addChild(new Text(`${title}${subtitle}\n${output}`, 0, 0));
    return box;
  });
}
