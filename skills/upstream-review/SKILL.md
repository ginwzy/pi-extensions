---
name: upstream-review
description: Review upstream changes for this All-in-One Pi extension project. Use when the user asks to check, inspect, evaluate, migrate, revisit, or merge upstream updates for this repository.
compatibility: Requires Node.js, Git, initialized submodules, and network access when fetching.
---

# Upstream Review

Use this skill only for the repository identified by `.pi-all-in-one-project.json`. It implements a human-approved upstream review workflow; it is not an automatic updater.

## Project Guard

Before any network or file operation:

1. Resolve the Git root with `git rev-parse --show-toplevel`.
2. Read `<root>/.pi-all-in-one-project.json`.
3. Require `project` to equal `pi-extensions-all-in-one` and `schemaVersion` to equal `1`.
4. Resolve the declared manifest inside the same Git root and read it.
5. Stop if any check fails. Do not infer project identity from the directory name.

## Modes

Infer the mode from the user's request. If it is ambiguous, ask before crossing a permission boundary.

### Review

Examples: "check upstream updates", "review subagents upstream", `/skill:upstream-review check all`.

Review permission allows:

- Fetching upstream refs.
- Reading commits, tags, release notes, issues, source, tests, and diffs.
- Writing review artifacts below `.upstream-reviews/`.
- Reporting candidates to the user.

It is not authorized to edit source, update submodule pointers, create migration branches, commit, push, or merge.

Procedure:

1. Run `node skills/upstream-review/scripts/inspect-upstreams.mjs --fetch --output <artifact>/snapshot.json` with optional module IDs.
2. If fetch fails for one module, continue reviewing the others and report the exact failure.
3. Treat `upstream-rewritten` and `unrelated` snapshots as hard stops: no review range was established.
4. Read every relevant commit and diff. Commit titles and diff statistics are navigation aids, not evidence.
5. Inspect local adaptations and tests before deciding whether an upstream change applies.
6. Consult primary upstream release notes or issues when the diff alone does not establish intent.
7. Group changes by independently selectable behavior, not mechanically by commit.
8. Assign stable candidate IDs `U01`, `U02`, and so on within the review.
9. Write `<artifact>/report.md` using `references/report-template.md`.
10. Present the candidates and wait for the user to select IDs.

Use an artifact directory shaped as `.upstream-reviews/YYYY-MM-DDTHHMMSSZ/`. Do not advance a baseline merely because a commit was reviewed.

### Implement

Examples: "implement U01", "migrate U01 and U03".

Implementation requires explicit candidate IDs from a completed review. Read that review before editing.

1. Confirm each requested ID exists and is still pending or deferred.
2. Create one isolated branch and Git worktree for the selected set. Never edit the user's active worktree.
3. Port behavior into the local architecture; do not blindly copy upstream files.
4. Add or update focused tests and run the module's relevant verification.
5. Record source commits, local adaptations, changed files, commands, and observed results.
6. Commit only inside the isolated branch.
7. Report the branch and commit, then wait for merge approval.

Implementation permission does not imply permission to merge, push, delete worktrees, or update the main branch.

### Merge

Examples: "merge U01", "merge the verified U01 migration".

Merge requires explicit approval for candidate IDs whose implementation report shows passing verification.

1. Recheck the implementation branch and commit.
2. Re-run required verification if the branch or target changed since the report.
3. Merge non-interactively into the current integration branch.
4. Update decision records and integrated commit metadata only for merged candidates.
5. Do not push unless the user separately requests it.
6. Report the resulting commit and any residual risk.

## Required Reading

Read `references/review-policy.md` before reviewing or implementing. Use `references/report-template.md` for review reports.

## Hard Stops

Stop and ask the user when:

- A request would cross from review to implementation or from implementation to merge without explicit authorization.
- The active project has uncommitted changes that prevent an isolated worktree or safe merge.
- Candidate IDs are missing, stale, or ambiguous.
- Upstream history is classified as `upstream-rewritten` or `unrelated`, so the reviewed range cannot be established.
- Verification needs credentials, destructive operations, or writes outside isolated test locations.

Never treat "review", "check", "look at", "prepare", or "try" as merge authorization.