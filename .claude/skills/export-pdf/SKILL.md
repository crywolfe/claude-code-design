---
name: export-pdf
description: Export an HTML artifact to PDF via headless Chromium (puppeteer Page.pdf). For multi-slide decks one page per <section>.
argument-hint: <html-path> [output.pdf]
allowed-tools: Read Write Bash(node scripts/export-pdf.mjs:*) Bash(realpath:*) Bash(mkdir -p:*) Bash(which:*) Bash(test:*) Bash(stat:*) Bash(ls:*)
---

# Export PDF

Produce a PDF from an HTML artifact. Uses puppeteer's `Page.pdf()` which is lossless vector when the source is HTML/CSS/SVG.

**Why puppeteer instead of Chrome DevTools MCP:** the MCP does not expose `Page.printToPDF` directly (only `take_screenshot`, `list_console_messages`, `evaluate_script`, etc.). Using puppeteer via a Node script is deterministic and matches `/export-pptx`.

## Preflight

1. `Bash(which node)` — required
2. `Bash(test -d node_modules/puppeteer)` — if the exit code is non-zero, tell the user to run `npm install -D puppeteer@24.41.0` in a separate shell (or `/doctor` for the full list), and stop

## Steps

1. Resolve paths:
   - `$0` = input HTML (required)
   - `$1` = output (default: input with `.pdf` extension)
   - If the output directory does not exist: `Bash(mkdir -p <output-dir>)` with the literal directory (no command substitution — the bash guard rejects `$(...)`)

2. Run export script:
   ```
   Bash(node scripts/export-pdf.mjs "<input>" "<output>")
   ```
   (The script is versioned at `scripts/export-pdf.mjs`. If it is missing, restore it from git — do not rewrite it, and never run `node` with anything other than that script.)

3. Report size + path.

## Script behaviour (scripts/export-pdf.mjs)

- Launches headless Chromium without `--no-sandbox` (only added when `CI` is set)
- Blocks every outbound request except `file://`, `data:`, `blob:`, `https://unpkg.com/` and Google Fonts — an artifact cannot phone home during export
- Decks render one `<section>` per page at natural size; other pages default to A4

## Notes

- For decks: deck_stage.js must have `@media print { @page { size: ... } section { page-break-after: always } }` in the global `<style>` it injects — already present.
- For general pages: defaults to A4. To override, user can pass inline CSS `@page { size: letter }` or similar.
- `networkidle0` waits for all network activity to stop — if artifact uses lazy images, bump timeout to 15000ms.
