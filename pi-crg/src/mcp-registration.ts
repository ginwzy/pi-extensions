import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const SERVER_NAME = "code-review-graph";

type JsonObject = Record<string, unknown>;

export type McpRegistrationResult =
  | { status: "registered"; path: string }
  | { status: "existing"; path: string }
  | { status: "disabled" }
  | { status: "error"; path: string; error: string };

function readConfig(path: string): JsonObject | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP config root must be a JSON object");
  }
  return parsed as JsonObject;
}

function hasCrgServer(config: JsonObject | null): boolean {
  if (!config) return false;
  const servers = config.mcpServers;
  return Boolean(
    servers
      && typeof servers === "object"
      && !Array.isArray(servers)
      && SERVER_NAME in servers,
  );
}

export function ensureCrgMcpRegistration(cwd = process.cwd()): McpRegistrationResult {
  if (process.env.PI_CRG_REGISTER_MCP === "0") return { status: "disabled" };

  const targetPath = join(getAgentDir(), "mcp.json");
  const configPaths = [
    join(homedir(), ".config", "mcp", "mcp.json"),
    targetPath,
    join(cwd, ".mcp.json"),
    join(cwd, ".pi", "mcp.json"),
  ];

  try {
    for (const path of configPaths) {
      if (hasCrgServer(readConfig(path))) return { status: "existing", path };
    }

    const target = readConfig(targetPath) ?? {};
    const currentServers = target.mcpServers;
    if (currentServers !== undefined && (!currentServers || typeof currentServers !== "object" || Array.isArray(currentServers))) {
      throw new Error("mcpServers must be a JSON object");
    }

    const mcpServers = { ...(currentServers as JsonObject | undefined) };
    mcpServers[SERVER_NAME] = {
      command: "uvx",
      args: ["code-review-graph", "serve"],
      lifecycle: "lazy",
    };

    const next = { ...target, mcpServers };
    mkdirSync(dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    renameSync(tempPath, targetPath);
    return { status: "registered", path: targetPath };
  } catch (error) {
    return {
      status: "error",
      path: targetPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
