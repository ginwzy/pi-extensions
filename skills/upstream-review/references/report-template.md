# Upstream Review: <timestamp>

## Scope

- Modules: <module IDs>
- Reference commits: <module=localCommit>
- Integrated baselines: <module=integratedCommit or localCommit>
- Upstream refs: <module=commit>
- History relations: <module=current | ahead | updates-available | diverged | upstream-rewritten | unrelated>
- Snapshot: `snapshot.json`
- Fetch failures: <none or exact failures>

## Summary

<What changed upstream, what is relevant locally, and what needs a decision.>

## Candidates

### U01: <independently selectable change>

- Source: `<module>` `<commit(s)>`
- Recommendation: `accept | defer | reject | investigate`
- Local area: `<paths/modules>`
- Runtime path: `<trigger -> registration/call -> state/side effect -> output>`
- Benefit: <observable benefit>
- Compatibility: <Pi/API/dependency implications>
- Risk: `low | medium | high`
- Migration outline: <smallest local adaptation>
- Verification needed: <specific commands or scenarios>
- Evidence: <upstream and local files, release notes, issues>
- Unknowns: <none or explicit gaps>

Repeat for each independently selectable candidate.

## Not Relevant

List reviewed changes that do not apply, with concise reasons. Do not silently omit them.

## Suggested Decision

Use candidate IDs in the response, for example:

```text
Implement U01 and U03; defer U02.
```

No implementation or merge has been performed during this review.