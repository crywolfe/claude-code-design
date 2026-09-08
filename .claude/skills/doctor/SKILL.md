---
name: doctor
description: First-run health check. Verifies Chrome DevTools MCP and optional deps (monolith, pptxgenjs, puppeteer), prints the install commands for the user to run, creates working dirs, runs smoke test. Use on fresh clone or when things feel broken.
allowed-tools: Read Write Bash(claude mcp list) Bash(which:*) Bash(mkdir -p artifacts:*) Bash(ls:*) Bash(test:*) mcp__chrome-devtools__list_pages mcp__chrome-devtools__take_screenshot
---

# Doctor

Cold-start health check. Never installs anything itself — it prints the commands for the user to run. Safe to run multiple times.

## Phase 1 — Inventory

Run in parallel where possible:

1. `Bash(claude mcp list)` — parse output, look for `chrome-devtools: ✓ Connected`
2. `Bash(which monolith)` — existence check
3. `Bash(which node)` — required
4. `Bash(which gh)` — for `/ingest-github`
5. `Bash(test -f package.json)` — exit 0 = exists
6. `Bash(test -d starters)` — expect exit 0
7. `Bash(test -d artifacts)`
8. `Bash(test -d .claude/skills)` — expect exit 0
9. `Bash(test -d node_modules/puppeteer)` and `Bash(test -d node_modules/pptxgenjs)`

## Phase 2 — Report

Print structured report:

```
Chrome DevTools MCP: ✓ / ✗ (if ✗, show install command)
monolith CLI:        ✓ / ✗ (optional; needed for /export-standalone)
Node:                ✓ / ✗ (required)
gh CLI:              ✓ / ✗ (needed for /ingest-github)
package.json:        exists / missing
starters/ dir:       exists / missing
artifacts/ dir:      will create
.claude/skills/:     N skills found
FIGMA_TOKEN env:     set / not set (only needed for /ingest-figma)
```

## Phase 3 — Repair (user runs the commands)

Do not install anything. Print the exact commands for the user to run in a separate shell:

```
# Chrome DevTools MCP — already declared in .mcp.json (pinned, --isolated); approve it when Claude Code asks,
# or register it manually with the same pinned, isolated form:
claude mcp add chrome-devtools -s project -- npx chrome-devtools-mcp@1.9.0 --isolated
brew install monolith
npm install -D pptxgenjs@4.0.1 puppeteer@24.41.0
```

Then ask them to restart Claude Code and re-run `/doctor`.

The only repair this skill performs itself: `Bash(mkdir -p artifacts assets/thumbs test)`.

## Phase 4 — Smoke test

If everything is green (and user didn't just run install → restart):
1. Write `test/smoke-deck.html`:
   ```html
   <!doctype html>
   <html><head><meta charset="utf-8"/><title>Smoke</title>
   <script src="../starters/deck_stage.js"></script></head>
   <body><deck-stage width="1920" height="1080">
     <section style="padding:60px;font:48px/1.2 Georgia"><h1>One</h1></section>
     <section style="padding:60px;font:48px/1.2 Georgia;background:#f4e4d7"><h1>Two</h1></section>
     <section style="padding:60px;font:48px/1.2 Georgia;background:#4a5d2e;color:#fff"><h1>Three</h1></section>
   </deck-stage></body></html>
   ```
2. Run `/done test/smoke-deck.html`
3. If Chrome DevTools MCP is connected — check screenshot at `.claude/last-preview.png` exists and console is clean
4. Report pass/fail

## Phase 5 — Hint sheet

Print one-liner hints:
```
Available commands & skills:
  /make-deck <brief>            — build a slide deck
  /interactive-prototype <brief> — clickable React prototype
  /wireframe <thing>            — low-fi variants
  /create-design-system <src>   — extract style guide
  /ingest-github <url>          — pull tokens from repo
  /ingest-screenshot <path>     — extract tokens from image
  /ingest-figma <url>           — pull from Figma (needs FIGMA_TOKEN)
  /make-tweakable <html>        — add live tweak panel
  /apply-tweaks <html>          — persist panel changes
  /ingest-document <file>       — theme + outline from PPTX/DOCX/XLSX/PDF
  /register-asset <html>        — add to assets.html overview
  /verify-artifact <html>       — vision + design-system conformance QA
  /snapshot <html> <label>      — save / list / restore versions
  /publish <html>               — private share link on claude.ai + comments
  /sync-design-system <name>    — push a registry entry to Claude Design
  /export-pdf  /export-pptx  /export-standalone  /handoff
  /preview /done /screenshot    — operational atomics
```
