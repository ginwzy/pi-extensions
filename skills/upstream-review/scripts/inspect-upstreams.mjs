#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const PROJECT_ID = "pi-extensions-all-in-one";
const MARKER_FILE = ".pi-all-in-one-project.json";
const REVIEW_REF_PREFIX = "refs/upstream-review";
const REVIEW_DIRECTORY = ".upstream-reviews";
const MAX_COMMITS = 200;
const GIT_TIMEOUT_MS = 30_000;

function fail(message) {
  console.error(`upstream-review: ${message}`);
  process.exit(1);
}

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: GIT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    ...options,
  }).trim();
}

function gitSucceeds(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "ignore",
    timeout: GIT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return result.status === 0;
}

function findRoot() {
  try {
    return realpathSync(git(process.cwd(), ["rev-parse", "--show-toplevel"]));
  } catch {
    fail("current directory is not inside a Git repository");
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${label} at ${path}: ${error.message}`);
  }
}

function assertInside(base, candidate, label, allowBase = true) {
  const rel = relative(base, candidate);
  if ((!allowBase && rel === "") || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail(`${label} must stay inside ${base}`);
  }
}

function assertSafeRepoPath(value, label) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) {
    fail(`${label} must be a non-empty relative path`);
  }
  const parts = value.split(/[\\/]+/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label} contains an unsafe path segment`);
  }
}

function parseArgs(argv) {
  const options = { fetch: false, output: null, modules: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fetch") {
      options.fetch = true;
    } else if (arg === "--output") {
      const value = argv[index + 1];
      if (!value) fail("--output requires a path");
      options.output = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: inspect-upstreams.mjs [--fetch] [--output <path>] [module-id ...]");
      process.exit(0);
    } else if (arg.startsWith("-")) {
      fail(`unknown option: ${arg}`);
    } else {
      options.modules.push(arg);
    }
  }
  return options;
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.modules)) {
    fail("upstream manifest must use schemaVersion 1 and contain a modules array");
  }

  const ids = new Set();
  for (const module of manifest.modules) {
    if (!module || typeof module.id !== "string" || typeof module.path !== "string" ||
        typeof module.repository !== "string" || typeof module.branch !== "string" ||
        !Array.isArray(module.scopes) || !Array.isArray(module.entrypoints)) {
      fail("every manifest module requires id, path, repository, branch, scopes, and entrypoints");
    }
    if (!module.id || !module.repository || !module.branch || module.entrypoints.length === 0) {
      fail(`module ${module.id || "<unknown>"} has an empty identity, repository, branch, or entrypoint list`);
    }
    assertSafeRepoPath(module.path, `module path for ${module.id}`);
    for (const [index, scope] of module.scopes.entries()) {
      assertSafeRepoPath(scope, `scope ${index} for ${module.id}`);
    }
    for (const [index, entrypoint] of module.entrypoints.entries()) {
      assertSafeRepoPath(entrypoint, `entrypoint ${index} for ${module.id}`);
    }

    const hasIntegrationPath = Object.hasOwn(module, "integrationPath");
    const hasIntegratedCommit = Object.hasOwn(module, "integratedCommit");
    if (hasIntegrationPath !== hasIntegratedCommit) {
      fail(`module ${module.id} must define integrationPath and integratedCommit together`);
    }
    if (hasIntegrationPath) {
      assertSafeRepoPath(module.integrationPath, `integration path for ${module.id}`);
      if (typeof module.integratedCommit !== "string" || !/^[0-9a-f]{40}$/.test(module.integratedCommit)) {
        fail(`module ${module.id} has an invalid integratedCommit`);
      }
    }
    if (ids.has(module.id)) fail(`duplicate module id: ${module.id}`);
    ids.add(module.id);
  }
}

function fetchModule(module, modulePath, reviewRef) {
  const refspec = `+refs/heads/${module.branch}:${reviewRef}`;
  const result = spawnSync("git", ["fetch", "--no-tags", "--prune", module.repository, refspec], {
    cwd: modulePath,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status !== 0) {
    const timeout = result.error?.code === "ETIMEDOUT" ? `timed out after ${GIT_TIMEOUT_MS}ms` : null;
    return timeout ?? (result.stderr || result.stdout || `git fetch exited ${result.status}`).trim();
  }
  return null;
}

function scopedArgs(module) {
  return module.scopes.length > 0 ? ["--", ...module.scopes] : [];
}

function scopeCovers(scope, entrypoint) {
  return entrypoint === scope || entrypoint.startsWith(`${scope.replace(/\/$/, "")}/`);
}

function validateCheckout(module, modulePath) {
  for (const scope of module.scopes) {
    if (!git(modulePath, ["ls-files", "--", scope])) {
      fail(`scope ${JSON.stringify(scope)} for ${module.id} resolves to no tracked files`);
    }
  }
  for (const entrypoint of module.entrypoints) {
    if (!gitSucceeds(modulePath, ["cat-file", "-e", `HEAD:${entrypoint}`])) {
      fail(`entrypoint ${JSON.stringify(entrypoint)} for ${module.id} is not tracked at HEAD`);
    }
    if (module.scopes.length > 0 && !module.scopes.some((scope) => scopeCovers(scope, entrypoint))) {
      fail(`entrypoint ${JSON.stringify(entrypoint)} for ${module.id} is outside its declared scopes`);
    }
  }
}

function classifyHistory(modulePath, baselineCommit, upstreamCommit, hasIntegratedBaseline) {
  if (baselineCommit === upstreamCommit) {
    return { relation: "current", mergeBase: baselineCommit, rangeEstablished: true };
  }

  const baselineIsAncestor = gitSucceeds(modulePath, ["merge-base", "--is-ancestor", baselineCommit, upstreamCommit]);
  const upstreamIsAncestor = gitSucceeds(modulePath, ["merge-base", "--is-ancestor", upstreamCommit, baselineCommit]);
  let mergeBase = null;
  try {
    mergeBase = git(modulePath, ["merge-base", baselineCommit, upstreamCommit]);
  } catch {
    // No merge base means the histories are unrelated.
  }

  if (baselineIsAncestor) return { relation: "updates-available", mergeBase, rangeEstablished: true };
  if (upstreamIsAncestor) return { relation: "ahead", mergeBase, rangeEstablished: true };
  if (!mergeBase) return { relation: "unrelated", mergeBase: null, rangeEstablished: false };
  if (hasIntegratedBaseline) {
    return { relation: "upstream-rewritten", mergeBase, rangeEstablished: false };
  }
  return { relation: "diverged", mergeBase, rangeEstablished: true };
}

function inspectModule(root, module, shouldFetch) {
  const modulePath = resolve(root, module.path);
  assertInside(root, modulePath, `module path for ${module.id}`);
  if (existsSync(modulePath)) {
    assertInside(root, realpathSync(modulePath), `resolved module path for ${module.id}`);
  }
  if (module.integrationPath) {
    const integrationPath = resolve(root, module.integrationPath);
    assertInside(root, integrationPath, `integration path for ${module.id}`);
    if (!existsSync(integrationPath)) fail(`integration path for ${module.id} does not exist`);
    assertInside(root, realpathSync(integrationPath), `resolved integration path for ${module.id}`);
  }

  let localCommit;
  try {
    localCommit = git(modulePath, ["rev-parse", "HEAD"]);
  } catch (error) {
    return { id: module.id, path: module.path, status: "unavailable", error: error.stderr?.trim() || error.message };
  }
  validateCheckout(module, modulePath);

  const baselineCommit = module.integratedCommit ?? localCommit;
  if (module.integratedCommit && !gitSucceeds(modulePath, ["rev-parse", "--verify", `${baselineCommit}^{commit}`])) {
    return {
      id: module.id,
      path: module.path,
      integrationPath: module.integrationPath,
      localCommit,
      integratedCommit: module.integratedCommit,
      status: "unavailable",
      error: `integrated commit ${module.integratedCommit} is not available in the reference checkout`,
    };
  }

  const reviewRef = `${REVIEW_REF_PREFIX}/${module.id}/${module.branch}`;
  let fetchError = null;
  if (shouldFetch) fetchError = fetchModule(module, modulePath, reviewRef);

  let upstreamCommit = null;
  try {
    upstreamCommit = git(modulePath, ["rev-parse", "--verify", reviewRef]);
  } catch {
    // A review ref does not exist until the first successful fetch.
  }

  const common = {
    id: module.id,
    path: module.path,
    repository: module.repository,
    branch: module.branch,
    scopes: module.scopes,
    entrypoints: module.entrypoints,
    integrationPath: module.integrationPath ?? null,
    localCommit,
    integratedCommit: module.integratedCommit ?? null,
    baselineCommit,
    reviewRef,
  };

  if (!upstreamCommit) {
    return {
      ...common,
      status: fetchError ? "fetch-failed" : "not-fetched",
      fetchError,
    };
  }

  const history = classifyHistory(modulePath, baselineCommit, upstreamCommit, Boolean(module.integratedCommit));
  const ahead = history.rangeEstablished
    ? Number(git(modulePath, ["rev-list", "--count", `${upstreamCommit}..${baselineCommit}`]))
    : null;
  const behind = history.rangeEstablished
    ? Number(git(modulePath, ["rev-list", "--count", `${baselineCommit}..${upstreamCommit}`]))
    : null;

  let commits = [];
  let commitsTruncated = false;
  let diffStat = "";
  let changedFiles = "";
  if (history.rangeEstablished) {
    const rawLog = git(modulePath, [
      "log",
      `--max-count=${MAX_COMMITS + 1}`,
      "--format=%H%x1f%aI%x1f%an%x1f%s%x1e",
      `${baselineCommit}..${upstreamCommit}`,
      ...scopedArgs(module),
    ]);
    const parsed = rawLog
      ? rawLog.split("\x1e").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
          const [commit, authoredAt, author, subject] = entry.split("\x1f");
          return { commit, authoredAt, author, subject };
        })
      : [];
    commitsTruncated = parsed.length > MAX_COMMITS;
    commits = parsed.slice(0, MAX_COMMITS);
    diffStat = git(modulePath, ["diff", "--stat", `${baselineCommit}..${upstreamCommit}`, ...scopedArgs(module)]);
    changedFiles = git(modulePath, ["diff", "--name-status", `${baselineCommit}..${upstreamCommit}`, ...scopedArgs(module)]);
  }

  return {
    ...common,
    upstreamCommit,
    status: fetchError ? "stale-after-fetch-failure" : history.relation,
    relation: history.relation,
    rangeEstablished: history.rangeEstablished,
    mergeBase: history.mergeBase,
    fetchError,
    ahead,
    behind,
    relevantCommitCount: commits.length,
    commitsTruncated,
    commits,
    diffStat,
    changedFiles,
  };
}

function createSafeDirectories(base, target) {
  assertInside(base, target, "artifact directory");
  const rel = relative(base, target);
  let current = base;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) fail(`artifact path must not traverse symlink ${current}`);
      if (!stat.isDirectory()) fail(`artifact path component is not a directory: ${current}`);
    } else {
      mkdirSync(current);
    }
  }
}

function resolveSafeOutput(root, requested) {
  const reviewRoot = resolve(root, REVIEW_DIRECTORY);
  const outputPath = resolve(root, requested);
  assertInside(reviewRoot, outputPath, "output path", false);
  createSafeDirectories(root, reviewRoot);
  createSafeDirectories(reviewRoot, dirname(outputPath));
  if (existsSync(outputPath) && lstatSync(outputPath).isSymbolicLink()) {
    fail(`output path must not be a symlink: ${outputPath}`);
  }
  const realReviewRoot = realpathSync(reviewRoot);
  const realParent = realpathSync(dirname(outputPath));
  assertInside(realReviewRoot, realParent, "resolved output parent");
  return outputPath;
}

const options = parseArgs(process.argv.slice(2));
const root = findRoot();
const markerPath = resolve(root, MARKER_FILE);
const marker = readJson(markerPath, "project marker");
if (marker.project !== PROJECT_ID || marker.schemaVersion !== 1 || typeof marker.manifest !== "string") {
  fail(`project marker must identify ${PROJECT_ID} with schemaVersion 1`);
}

const manifestPath = resolve(root, marker.manifest);
assertInside(root, manifestPath, "manifest path");
const manifest = readJson(manifestPath, "upstream manifest");
validateManifest(manifest);

const requested = new Set(options.modules);
const known = new Set(manifest.modules.map((module) => module.id));
for (const id of requested) {
  if (!known.has(id)) fail(`unknown module id: ${id}`);
}
const selected = requested.size === 0
  ? manifest.modules
  : manifest.modules.filter((module) => requested.has(module.id));

const snapshot = {
  schemaVersion: 1,
  project: PROJECT_ID,
  generatedAt: new Date().toISOString(),
  fetched: options.fetch,
  root,
  modules: selected.map((module) => inspectModule(root, module, options.fetch)),
};

const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
if (options.output) {
  const outputPath = resolveSafeOutput(root, options.output);
  writeFileSync(outputPath, serialized);
  console.log(relative(root, outputPath));
} else {
  process.stdout.write(serialized);
}
