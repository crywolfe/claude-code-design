---
name: snapshot
description: Save a labeled version of an artifact before a significant rework, list versions, or restore one. Replaces ad-hoc "deck v2.html" copies. Use when user says "snapshot", "save a version", "checkpoint this", "go back to the version before", "list versions".
argument-hint: <html-path> <label> | list <html-path> | restore <html-path> <version-file>
allowed-tools: Read Write Edit Bash(mkdir -p artifacts/versions:*) Bash(cp artifacts/:*) Bash(ls artifacts/versions:*) Bash(date:*)
---

# Snapshot

Claude Design keeps a version history per design; here it is a folder per artifact under `artifacts/versions/` (gitignored with the rest of `artifacts/`).

```
artifacts/versions/<name>/
├── index.json
├── 20260908T101500Z-first-draft.html
└── 20260908T113000Z-after-review.html
```

## `/snapshot <html> <label>`

1. `$0` must be under `artifacts/` (and not under `artifacts/versions/`). `<label>` → slug: lowercase, `[a-z0-9-]`, ≤ 40 chars; reject anything else.
2. `Bash(date -u +%Y%m%dT%H%M%SZ)` → `<ts>` (use the printed value).
3. `Bash(mkdir -p artifacts/versions/<name>)`
4. `Bash(cp artifacts/<path> artifacts/versions/<name>/<ts>-<slug>.html)`
   Sibling starters (`deck_stage.js`, `*.jsx`) are **not** copied — versions reference the live siblings; if a starter changes shape, restore may need `/serve` from the artifact dir.
5. Upsert `artifacts/versions/<name>/index.json`:
   ```json
   { "source": "artifacts/<path>", "versions": [
       { "file": "<ts>-<slug>.html", "label": "<label>", "at": "<ts>", "note": "<one line: what changed since the previous version>", "published_label": null }
   ] }
   ```
   If `/publish --label` was run with the same label this turn, set `published_label`.
6. Report one line: version file + count of versions.

Workflow skills call this automatically before a **significant** rework (see CLAUDE.md "File versioning"). Small edits do not snapshot.

## `/snapshot list <html>`

`Read artifacts/versions/<name>/index.json` (or `Bash(ls artifacts/versions/<name>/)` if the index is missing) → table: label, time, note.

## `/snapshot restore <html> <version-file>`

1. Snapshot the current state first with label `before-restore` (so nothing is lost).
2. `Bash(cp artifacts/versions/<name>/<version-file> artifacts/<path>)`
3. `/done artifacts/<path>` to verify it renders.

`<version-file>` must be a basename from `index.json` — never a path.
