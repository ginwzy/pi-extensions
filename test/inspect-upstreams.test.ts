import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSPECTOR = resolve(ROOT, "skills/upstream-review/scripts/inspect-upstreams.mjs");
const MARKER = {
  project: "pi-extensions-all-in-one",
  schemaVersion: 1,
  manifest: "upstreams.json",
};

interface FixtureModule {
  id: string;
  path: string;
  repository: string;
  branch: string;
  scopes: string[];
  entrypoints: string[];
  integrationPath?: string;
  integratedCommit?: string;
}

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function initRepo(path: string): void {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-b", "main");
  git(path, "config", "user.email", "fixture@example.com");
  git(path, "config", "user.name", "Fixture");
}

function commitFile(repo: string, content: string, message: string): string {
  writeFileSync(resolve(repo, "index.ts"), `${content}\n`);
  git(repo, "add", "index.ts");
  git(repo, "commit", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function createFixture(moduleOverrides: Partial<FixtureModule> = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "pi-upstream-inspector-"));
  temporaryRoots.push(root);
  initRepo(root);
  writeFileSync(resolve(root, ".pi-all-in-one-project.json"), `${JSON.stringify(MARKER)}\n`);
  writeFileSync(resolve(root, "README.md"), "source remains unchanged\n");

  const modulePath = resolve(root, "reference");
  initRepo(modulePath);
  const initial = commitFile(modulePath, "initial", "initial");
  const module: FixtureModule = {
    id: "fixture",
    path: "reference",
    repository: modulePath,
    branch: "main",
    scopes: [],
    entrypoints: ["index.ts"],
    ...moduleOverrides,
  };
  writeManifest(root, [module]);
  return { root, modulePath, module, initial };
}

function writeManifest(root: string, modules: FixtureModule[]): void {
  writeFileSync(resolve(root, "upstreams.json"), `${JSON.stringify({ schemaVersion: 1, modules }, null, 2)}\n`);
}

function runInspector(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [INSPECTOR, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function inspect(root: string, ...args: string[]) {
  const result = runInspector(root, ...args);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function setReviewRef(repo: string, id: string, commit: string): void {
  git(repo, "update-ref", `refs/upstream-review/${id}/main`, commit);
}

describe("upstream inspector output safety", () => {
  test("allows only artifact descendants and rejects lexical escapes", () => {
    const { root } = createFixture();

    for (const output of ["README.md", "../snapshot.json", resolve(tmpdir(), "snapshot.json"), ".upstream-reviews"]) {
      const result = runInspector(root, "--output", output);
      expect(result.status, output).not.toBe(0);
      expect(result.stderr).toContain("output path must stay inside");
    }

    const allowed = runInspector(root, "--output", ".upstream-reviews/run/snapshot.json");
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(JSON.parse(readFileSync(resolve(root, ".upstream-reviews/run/snapshot.json"), "utf8"))).toMatchObject({
      project: "pi-extensions-all-in-one",
    });
  });

  test("rejects symlink traversal before writing outside the artifact root", () => {
    const { root } = createFixture();
    const outside = mkdtempSync(resolve(tmpdir(), "pi-upstream-outside-"));
    temporaryRoots.push(outside);
    mkdirSync(resolve(root, ".upstream-reviews"));
    symlinkSync(outside, resolve(root, ".upstream-reviews/escape"));

    const result = runInspector(root, "--output", ".upstream-reviews/escape/snapshot.json");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must not traverse symlink");
    expect(() => readFileSync(resolve(outside, "snapshot.json"))).toThrow();
  });
});

describe("upstream inspector history", () => {
  test("uses the integrated commit as baseline while retaining local checkout state", () => {
    const fixture = createFixture();
    const upstream = commitFile(fixture.modulePath, "upstream", "upstream");
    mkdirSync(resolve(fixture.root, "integration"));
    fixture.module.integrationPath = "integration";
    fixture.module.integratedCommit = fixture.initial;
    writeManifest(fixture.root, [fixture.module]);
    setReviewRef(fixture.modulePath, fixture.module.id, upstream);

    const [result] = inspect(fixture.root).modules;

    expect(result).toMatchObject({
      localCommit: upstream,
      integratedCommit: fixture.initial,
      baselineCommit: fixture.initial,
      upstreamCommit: upstream,
      relation: "updates-available",
      status: "updates-available",
      rangeEstablished: true,
      behind: 1,
    });
  });

  test("treats an empty scope as the whole repository", () => {
    const fixture = createFixture();
    setReviewRef(fixture.modulePath, fixture.module.id, fixture.initial);

    const [result] = inspect(fixture.root).modules;

    expect(result).toMatchObject({ scopes: [], relation: "current", relevantCommitCount: 0 });
  });

  test("classifies diverged, rewritten, and unrelated histories", () => {
    const diverged = createFixture();
    const local = commitFile(diverged.modulePath, "local", "local");
    git(diverged.modulePath, "switch", "-c", "upstream", diverged.initial);
    const upstream = commitFile(diverged.modulePath, "upstream", "upstream");
    git(diverged.modulePath, "switch", "main");
    setReviewRef(diverged.modulePath, diverged.module.id, upstream);
    expect(inspect(diverged.root).modules[0]).toMatchObject({
      localCommit: local,
      relation: "diverged",
      rangeEstablished: true,
    });

    mkdirSync(resolve(diverged.root, "integration"));
    diverged.module.integrationPath = "integration";
    diverged.module.integratedCommit = local;
    writeManifest(diverged.root, [diverged.module]);
    expect(inspect(diverged.root).modules[0]).toMatchObject({
      relation: "upstream-rewritten",
      rangeEstablished: false,
      ahead: null,
      behind: null,
    });

    const unrelated = createFixture();
    git(unrelated.modulePath, "switch", "--orphan", "unrelated");
    const unrelatedCommit = commitFile(unrelated.modulePath, "unrelated", "unrelated");
    git(unrelated.modulePath, "switch", "main");
    setReviewRef(unrelated.modulePath, unrelated.module.id, unrelatedCommit);
    expect(inspect(unrelated.root).modules[0]).toMatchObject({
      relation: "unrelated",
      rangeEstablished: false,
    });
  });
});

describe("upstream inspector validation", () => {
  test("rejects unknown IDs and scopes that resolve to no tracked files", () => {
    const fixture = createFixture();
    const unknown = runInspector(fixture.root, "missing");
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain("unknown module id: missing");

    fixture.module.scopes = ["missing"];
    writeManifest(fixture.root, [fixture.module]);
    const invalidScope = runInspector(fixture.root);
    expect(invalidScope.status).not.toBe(0);
    expect(invalidScope.stderr).toContain("resolves to no tracked files");
  });

  test("reports an unavailable checkout without aborting the snapshot", () => {
    const fixture = createFixture({ path: "missing-reference" });

    const [result] = inspect(fixture.root).modules;

    expect(result).toMatchObject({ id: "fixture", path: "missing-reference", status: "unavailable" });
  });

  test("does not mutate source, checkout HEAD, status, or review refs", () => {
    const fixture = createFixture();
    setReviewRef(fixture.modulePath, fixture.module.id, fixture.initial);
    const before = {
      readme: readFileSync(resolve(fixture.root, "README.md"), "utf8"),
      head: git(fixture.modulePath, "rev-parse", "HEAD"),
      status: git(fixture.modulePath, "status", "--short"),
      ref: git(fixture.modulePath, "rev-parse", "refs/upstream-review/fixture/main"),
    };

    const result = runInspector(fixture.root, "--output", ".upstream-reviews/run/snapshot.json");
    expect(result.status, result.stderr).toBe(0);

    expect(readFileSync(resolve(fixture.root, "README.md"), "utf8")).toBe(before.readme);
    expect(git(fixture.modulePath, "rev-parse", "HEAD")).toBe(before.head);
    expect(git(fixture.modulePath, "status", "--short")).toBe(before.status);
    expect(git(fixture.modulePath, "rev-parse", "refs/upstream-review/fixture/main")).toBe(before.ref);
  });
});
