# Review Policy

## Evidence Standard

A candidate recommendation must be grounded in the observed execution path: upstream change, affected local code, runtime behavior, and verification coverage. Do not recommend a change solely because it is newer or appears in release notes.

For each relevant change:

1. Identify the upstream commits and files.
2. Reconstruct what calls or loads the changed behavior.
3. Locate the equivalent local integration point.
4. Determine whether local adaptations already solve, conflict with, or supersede it.
5. Identify the smallest independently selectable migration.
6. State what evidence is still missing.

## Candidate Decisions

Use one of these recommendations:

- `accept`: applicable, beneficial, and reasonably bounded.
- `defer`: potentially useful, but blocked by architecture, dependencies, timing, or missing evidence.
- `reject`: intentionally incompatible, obsolete locally, out of scope, or lower quality than the local behavior.
- `investigate`: significance cannot be established without additional evidence.

A recommendation is advisory. Only the user changes a candidate from pending to selected, rejected, or deferred.

## Candidate Boundaries

- A candidate may span multiple commits when they implement one inseparable behavior.
- One commit may produce multiple candidates when its behaviors can be selected independently.
- Include supporting tests, types, migrations, and documentation with the behavior they support.
- Separate breaking refactors from user-visible features when they can be migrated independently.
- Do not hide mandatory compatibility work inside an optional feature candidate.

## Local Review Areas

For Pi extensions, inspect at least:

- Extension entrypoints and registration order.
- Pi lifecycle events and changed event signatures.
- Command, tool, shortcut, renderer, and widget name collisions.
- Shared state lifetime across session switches and reloads.
- Settings schema, defaults, and migration behavior.
- Filesystem, process, network, MCP, and browser side effects.
- Package dependencies, peer dependencies, lockfiles, and supported Pi versions.
- Unit tests plus extension-load or lifecycle integration tests.

## Safety Boundaries

During review:

- Review mode is not authorized to merge, rebase, checkout, cherry-pick, or edit source; the inspector only fetches dedicated refs and writes beneath `.upstream-reviews/`.
- Do not run upstream install scripts without inspecting them and obtaining authorization when they mutate the environment.
- Do not execute untrusted upstream code merely to understand it.
- Keep generated artifacts under `.upstream-reviews/`; the inspector rejects lexical escapes and symlink traversal.
- Treat `upstream-rewritten` and `unrelated` histories as unreviewable until a maintainer establishes a new baseline.
- Never modify real Pi settings, global caches, credentials, or user sessions.

During implementation:

- Use one isolated worktree and one writer.
- Preserve unrelated user changes.
- Use temporary HOME/config/cache locations for integration tests.
- Treat generated lockfile changes as source changes requiring review.
- Never force-update branches or delete user branches.

## Verification Reporting

Report commands as actually executed. Distinguish:

- `passed`: command ran and exited successfully.
- `failed`: command ran and failed; include the relevant error.
- `blocked`: prerequisite was unavailable or unsafe.
- `not run`: outside the selected scope.

Do not describe static inspection as a passing runtime test.