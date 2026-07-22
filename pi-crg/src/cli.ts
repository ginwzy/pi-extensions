/**
 * CLI wrapper for code-review-graph.
 * Spawns `uvx code-review-graph <args>` and returns structured output.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type CrgResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

export type CrgStatus = {
  nodes: number;
  edges: number;
  files: number;
  lastUpdated: string | null;
};

/** Resolve the command used to invoke code-review-graph. */
function resolveCommand(): { cmd: string; args: string[] } {
  const directPaths = [
    join(process.env.HOME ?? "", ".local", "bin", "code-review-graph"),
    "/usr/local/bin/code-review-graph",
  ];
  for (const path of directPaths) {
    if (existsSync(path)) return { cmd: path, args: [] };
  }
  return { cmd: "uvx", args: ["code-review-graph"] };
}

function withConfiguredDataDir(subArgs: string[]): string[] {
  const dataDir = process.env.PI_CRG_DATA_DIR;
  if (!dataDir || !["build", "update", "status"].includes(subArgs[0] ?? "")) return subArgs;
  return [...subArgs, "--data-dir", dataDir];
}

/** Run a code-review-graph CLI command. */
export function runCrg(
  subArgs: string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<CrgResult> {
  const { cmd, args } = resolveCommand();
  const fullArgs = [...args, ...withConfiguredDataDir(subArgs)];

  return new Promise((resolve) => {
    const child = spawn(cmd, fullArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CrgResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => {
      finish({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
    child.on("error", (err) => {
      finish({ ok: false, stdout, stderr: err.message, code: null });
    });
  });
}

/** Query graph availability and statistics through CRG's machine-readable API. */
export async function getCrgStatus(cwd: string): Promise<{ status: CrgStatus | null; error: string | null }> {
  const result = await runCrg(["status", "--json"], cwd, 15_000);
  if (!result.ok) {
    return { status: null, error: result.stderr || result.stdout || "status command failed" };
  }

  try {
    const jsonLine = result.stdout.split("\n").reverse().find((line) => line.trim().startsWith("{"));
    if (!jsonLine) throw new Error("missing JSON");
    const raw = JSON.parse(jsonLine) as Record<string, unknown>;
    const status: CrgStatus = {
      nodes: typeof raw.nodes === "number" ? raw.nodes : 0,
      edges: typeof raw.edges === "number" ? raw.edges : 0,
      files: typeof raw.files === "number" ? raw.files : 0,
      lastUpdated: typeof raw.last_updated === "string" ? raw.last_updated : null,
    };
    const ready = status.lastUpdated !== null || status.files > 0 || status.nodes > 0;
    return { status: ready ? status : null, error: null };
  } catch {
    return { status: null, error: "CRG returned invalid status JSON" };
  }
}

function runGit(args: string[], cwd: string): Promise<CrgResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CrgResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => finish({ ok: code === 0, stdout, stderr, code }));
    child.on("error", (err) => finish({ ok: false, stdout, stderr: err.message, code: null }));
  });
}

/** Fingerprint tracked changes and untracked file contents without scanning clean files. */
export async function getWorkspaceFingerprint(cwd: string): Promise<string | null> {
  const [diff, untracked] = await Promise.all([
    runGit(["diff", "--binary", "HEAD"], cwd),
    runGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd),
  ]);
  if (!diff.ok || !untracked.ok) return null;

  const hash = createHash("sha256");
  hash.update(diff.stdout);
  const paths = untracked.stdout.split("\0").filter(Boolean).sort();
  for (const path of paths) {
    hash.update("\0" + path + "\0");
    try {
      hash.update(await readFile(join(cwd, path)));
    } catch {
      hash.update("<unreadable>");
    }
  }
  return hash.digest("hex");
}
