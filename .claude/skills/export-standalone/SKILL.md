---
name: export-standalone
description: Bundle an HTML artifact into a single self-contained file with all CSS/JS/images inlined as data URLs. Requires `monolith` CLI (brew install monolith).
argument-hint: <input.html> [output.html]
allowed-tools: Read Write Bash(monolith --isolate --no-metadata:*) Bash(realpath:*) Bash(mkdir -p:*) Bash(which:*) Bash(ls:*) Bash(stat:*)
---

# Export Standalone

Produce a single HTML file that works offline (no external dependencies). Uses `monolith` — a Rust CLI that inlines everything.

## Preflight

1. `Bash(which monolith)` — check installed. If missing:
   - Tell user: "`monolith` not found. Install with `brew install monolith` (macOS) and rerun."
   - Stop.

## Steps

1. Resolve paths:
   - `$0` = input HTML (required)
   - `$1` = output HTML (default: `<input>-standalone.html`)
   - If the output directory does not exist: `Bash(mkdir -p <output-dir>)` with the literal directory (no command substitution)

2. Drop dev-only scripts. Any `<script … data-dev-only>` tag (live reload, editor overlay, sketch pad) is removed from the copy before bundling, and its sibling file is not copied. These are preview-time tools, not part of the design. Before running monolith, `Write` a copy of the input to `artifacts/<name>-nodev.html` with every `[data-dev-only]` script tag removed and run monolith on that copy.

3. Run monolith on the nodev copy:
   ```
   Bash(monolith --isolate --no-metadata "<name>-nodev.html" -o "<output>")
   ```
   The flags come first — the permission grant is the literal prefix `monolith --isolate --no-metadata`. Flags:
   - `--isolate` — CSP to prevent any remote resource loads after bundling
   - `--no-metadata` — strip `<!-- saved from ... -->` metadata

4. Report:
   - `Bash(stat -f%z "<output>")` or `Bash(ls -la "<output>")` for size
   - "Bundled `<input>` → `<output>` (`<size>` KB). Works offline."

## Tradeoffs

- Pros: single file, drop in email/chat, no CDN dependency, survives archive
- Cons: larger file size (5-10× original), no HMR, fonts often inlined as base64 (bigger)
- Interactivity preserved (React + Babel still run at load time), but network fetches fail by design
