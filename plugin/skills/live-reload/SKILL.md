---
name: live-reload
description: Add a dev-only auto-reload script to an HTML artifact so the preview refreshes on every save while served from 127.0.0.1. Use when user says "live reload", "auto refresh the preview", "hot reload", or runs /live-reload.
argument-hint: <html-path>
allowed-tools: Read Edit Grep Bash(cp "${CLAUDE_PLUGIN_ROOT}"/starters/live_reload.js artifacts/:*) Bash(ls artifacts/:*) mcp__chrome-devtools__navigate_page mcp__chrome-devtools__take_snapshot mcp__chrome-devtools__list_console_messages
---

# Live reload

Injects `"${CLAUDE_PLUGIN_ROOT}"/starters/live_reload.js` next to the artifact and a `data-dev-only`
script tag before `</body>`. The script polls the file's `Last-Modified`
header over the `/serve` server and reloads on change. It no-ops on `file://`
and on any host other than `127.0.0.1`, and `/publish`, `/export-standalone`
and `/handoff` drop `[data-dev-only]` scripts.

## Prerequisites

- `$0` is an HTML file under `artifacts/`.
- The artifact is (or will be) previewed over `/serve`.

## Phase 1 — Idempotency check

`Grep` `$0` for `live_reload.js`. If found, report "already enabled" and stop.

## Phase 2 — Copy the starter

`Bash(cp "${CLAUDE_PLUGIN_ROOT}"/starters/live_reload.js artifacts/<dir-of-$0>/)` — spell the
directory literally (for `artifacts/deck.html` that is `artifacts/`).

## Phase 3 — Inject the tag

`Edit` `$0`: replace the final `</body>` with

    <script src="./live_reload.js" data-dev-only></script>
    </body>

If the artifact already has `<link rel="icon" href="data:,"/>` skip; otherwise
add it to `<head>` (the `/serve` favicon rule in CLAUDE.md).

## Verify

`/serve` if not running, then `/done http://127.0.0.1:4567/<relative path>`.
Console must be clean. No further checks; the reload behaviour is covered by
`test/smoke-live-reload.html`.

## Report

"Live reload on. Save the file and the preview refreshes within a second.
Only active at http://127.0.0.1; exports and publishes drop it."
