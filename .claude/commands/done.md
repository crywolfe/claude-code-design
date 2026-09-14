---
description: End-of-turn handoff — preview, wait for ready, screenshot, snapshot DOM, sweep console, auto-register asset
argument-hint: <html-path-or-url>
allowed-tools: Bash(open file://:*) Bash(open http://127.0.0.1:*) Bash(xdg-open file://:*) Bash(xdg-open http://127.0.0.1:*) Bash(realpath:*) Bash(date:*) Bash(mkdir -p .claude) Bash(sleep:*) Read Write Edit mcp__chrome-devtools__navigate_page mcp__chrome-devtools__take_screenshot mcp__chrome-devtools__take_snapshot mcp__chrome-devtools__list_console_messages mcp__chrome-devtools__list_network_requests mcp__chrome-devtools__evaluate_script
---

End-of-turn gate: make sure the artifact at `$0` opens cleanly, capture evidence, and register the asset so it shows up in `assets.html`.

## Steps

1. Run `/preview $0` (open in browser + navigate Chrome DevTools MCP). `/preview` automatically appends a `?v=<epoch>` cache-buster so the browser shows the latest on-disk HTML — if you've edited the file this turn, the new render loads; screenshots reflect current state.

   If `/done` is called on a URL that's already loaded without running `/preview`, also do `mcp__chrome-devtools__navigate_page({type: "reload", ignoreCache: true})` as a fallback.

2. Wait for readiness via `mcp__chrome-devtools__evaluate_script` with an async function that **actually awaits** fonts:
   ```js
   async () => {
     if (document.readyState !== 'complete') {
       await new Promise(r => window.addEventListener('load', r, { once: true }));
     }
     if (document.fonts && document.fonts.ready) {
       await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2000))]);
     }
     return { ready: true, readyState: document.readyState };
   }
   ```
   (The older form `document.fonts?.ready?.then(...)` was fire-and-forget and did NOT wait — always use the async/await form above.)

3. Take screenshot: `mcp__chrome-devtools__take_screenshot` → save to `.claude/last-preview.png` (create `.claude/` first if missing via `Bash(mkdir -p .claude)`).

4. **Snapshot DOM for element-reference** (H2):
   `mcp__chrome-devtools__take_snapshot` with `filePath: ".claude/last-snapshot.txt"` → `.claude/last-snapshot.txt`
   (The MCP writes a plain-text tree and forces a `.txt` extension, so never ask for `.json`.)
   This captures an accessibility tree with UIDs. Later turns can reference "the red button in the hero" and `/inspect` will resolve to a specific UID and then to source.

5. List console messages: `mcp__chrome-devtools__list_console_messages` — filter by severity `error`.
   One message is browser noise, not an artifact error: `Failed to load resource: the server responded with a status of 404` for `/favicon.ico` when previewing over `http://127.0.0.1`. Chrome requests the icon on its own and the `/serve` server has none. Confirm it is the favicon (the `/serve` background output logs `GET /favicon.ico ... 404`, or `mcp__chrome-devtools__list_network_requests`), then add `<link rel="icon" href="data:,"/>` to the artifact `<head>` so the request stops, and treat the sweep as clean. Every other 404 is a real missing asset.

6. If any errors:
   - Report each with file location + message
   - Fix them in source HTML
   - Re-run `/done $0`

7. If clean:
   - Report "preview OK — `.claude/last-preview.png` captured, `.claude/last-snapshot.txt` captured"
   - Include a screenshot reference in end-of-turn summary so Claude and user see the same frame.

8. **Auto-register** (H1): if `$0` is a local path (not an http URL) AND it lives under `artifacts/`:
   - Invoke `Skill: register-asset` whether or not the path is already in `design-assets.json`: it upserts, so a re-run refreshes the thumbnail and `updated_at` and leaves `registered_at`, `status`, `subtitle` and any `published_*` fields as they were.
   - Pass:
     - `path = $0`
     - `asset = <Title-Cased slug of basename without extension>`
     - `group = <infer from artifact>`:
       - Contains `<deck-stage>` → `Brand` (a deck is brand-representative)
       - Contains `<DeviceFrame>` → `Components`
       - Contains `<DesignCanvas>` → `Components`
       - Contains `data-design-group` → let register-asset detect per-section groups
       - Fallback: `Brand`
     - `status = needs-review`
     - `auto = true` — silent registration, no thumbnail capture dialog (the screenshot from step 3 is reused)
   - After registration, `assets.html` auto-regenerates (see `register-asset` skill).

   **Note to self:** auto-registration is *non-blocking noise* — report in one line: "Registered <asset> to assets.html" and move on. Don't re-prompt the user to confirm.
