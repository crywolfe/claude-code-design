---
description: Open HTML in browser and navigate Chrome DevTools MCP to same URL
argument-hint: <html-path>
allowed-tools: Bash(open file://:*) Bash(open http://127.0.0.1:*) Bash(xdg-open file://:*) Bash(xdg-open http://127.0.0.1:*) Bash(realpath:*) Bash(date:*) mcp__chrome-devtools__navigate_page
---

Preview the HTML file or URL at `$0` in the user's browser and navigate the Chrome DevTools MCP session to the same URL.

## Argument forms

- Path (e.g. `artifacts/deck.html`) → converted to `file://<abs>`. Only paths inside this project are accepted.
- `http://127.0.0.1:<port>/...` → used as-is (use this for artifacts that need `/serve` due to React+Babel CORS)
- Any other origin (`https://...`, other hosts) → refuse. This command only opens local artifacts.

## Steps

1. If `$0` starts with `http://127.0.0.1:`, use as `url`. Otherwise resolve to an absolute path with `Bash(realpath "$0")` and prepend `file://`.
2. **Cache-bust** (important): append a `?v=<epoch-ms>` query so the browser doesn't serve a stale cached render after an `Edit` to the HTML. Generate via `Bash(date +%s000)` (seconds with three zeros appended; macOS `date` has no `%N`, so `%3N` would print a literal `3N` and, because the exit code is still 0, an `||` fallback never fires). Resulting URL: `file://<abs>?v=1729440000000`.
   - Browsers ignore unknown query params on `file://`, so this is safe.
   - For `http(s)://` URLs, same pattern works unless the server strips query strings.
3. Open in default browser. The command must begin with the literal `open file://` or `open http://127.0.0.1:` — quote only the part after the scheme so the permission prefix still matches paths with spaces:
   - `Bash(open file://"<abs>?v=<epoch>")` (macOS) or `Bash(xdg-open file://"<abs>?v=<epoch>")` (linux)
   - `Bash(open http://127.0.0.1:<port>/<path>?v=<epoch>)`
4. Navigate Chrome DevTools MCP: `mcp__chrome-devtools__navigate_page({pageId, url: "<url>", type: "url"})` — the fresh `?v=` query forces a network fetch even if the tab was previously loaded. `pageId` is required by every page-scoped tool in `chrome-devtools-mcp@1.9.0` (`navigate_page`, `evaluate_script`, `take_screenshot`, `take_snapshot`, `list_console_messages`): call `mcp__chrome-devtools__list_pages` once and reuse the id of the artifact tab; if no tab exists yet, `mcp__chrome-devtools__new_page({url})` creates one.
5. Report: preview is live; screenshots and console inspection now work via the MCP session
