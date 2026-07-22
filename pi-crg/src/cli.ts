/**
 * CLI wrapper for code-review-graph.
 * Spawns `uvx code-review-graph <args>` and returns structured output.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type CrgResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

/** Resolve the best command to invoke code-review-graph. */
function resolveCommand(): { cmd: string; args: string[] } {
  // Prefer direct binary if installed via pip/pipx
  const directPaths = [
    join(process.env.HOME ?? "", ".local", "bin", "code-review-graph"),
    "/usr/local/bin/code-review-graph",
  ];
  for (const p of directPaths) {
    if (existsSync(p)) return { cmd: p, args: [] };
  }
  // Fall back to uvx
  return { cmd: "uvx", args: ["code-review-graph"] };
}

/**
 * Run a code-review-graph CLI command.
 * @param subArgs - Arguments after `code-review-graph` (e.g. ["build", "--base", "HEAD~1"])
 * @param cwd - Working directory (project root)
 * @param timeoutMs - Max execution time (default 120s for build, 30s otherwise)
 */
export function runCrg(
  subArgs: string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<CrgResult> {
  const { cmd, args } = resolveCommand();
  const fullArgs = [...args, ...subArgs];

  return new Promise((resolve) => {
    const child = spawn(cmd, fullArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
    });

    child.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: err.message, code: null });
    });
  });
}

/** Check if a graph database exists for the given project root. */
export function graphExists(cwd: string): boolean {
  return existsSync(join(cwd, ".code-review-graph", "graph.db"));
}

/** Get graph database path. */
export function graphDbPath(cwd: string): string {
  return join(cwd, ".code-review-graph", "graph.db");
}
