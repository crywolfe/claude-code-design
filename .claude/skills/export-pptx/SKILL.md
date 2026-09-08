---
name: export-pptx
description: Export an HTML deck to PPTX via per-slide screenshots. Requires Node + pptxgenjs + puppeteer (run /doctor first).
argument-hint: <deck.html> [output.pptx]
allowed-tools: Read Write Bash(node scripts/export-pptx.mjs:*) Bash(realpath:*) Bash(mkdir -p:*) Bash(which:*) Bash(test:*) Bash(stat:*) Bash(ls:*)
---

# Export PPTX

Screenshot-based PPTX export — each `<section>` inside `<deck-stage>` becomes one slide (1920×1080 image + optional speaker notes).

## Preflight

1. `Bash(which node)` — if missing, tell user to install Node 20+
2. `Bash(test -d node_modules/pptxgenjs)` and `Bash(test -d node_modules/puppeteer)` — if either exit code is non-zero, tell the user to run `npm install -D pptxgenjs@4.0.1 puppeteer@24.41.0` in a separate shell (or `/doctor`), and stop. Never run `npm` from this skill.

## Steps

1. Resolve paths:
   - `$0` = deck HTML (required)
   - `$1` = output (default: basename + `.pptx`)

2. Run the export script:
   ```
   Bash(node scripts/export-pptx.mjs "<input>" "<output>")
   ```

3. Report size + path.

## Script dependencies

`scripts/export-pptx.mjs` is versioned. If it is missing, restore it from git — do not rewrite it, and never run `node` with anything other than that script. The script launches Chromium without `--no-sandbox` and blocks every outbound request except `file://`, `data:`, `blob:`, `https://unpkg.com/` and Google Fonts.

## What the script does

- Launches headless Chromium (puppeteer)
- Loads the deck HTML at 1920×1080
- Reads `<deck-stage>.totalSlides`
- For each slide: `goToSlide(i)`, set `noscale`, `page.screenshot` at clip 0,0,1920,1080
- Reads `#speaker-notes` JSON (if present) and attaches per-slide notes
- Builds `.pptx` with `pptxgenjs` (16:9 layout, one PNG-background slide each)

## Notes

- Images can be large — 5 MB per slide at 1920×1080 is normal
- For smaller files, pass `--jpeg 0.8` to the script (compress to JPEG at 80% quality)
- Not editable in PowerPoint — each slide is a raster image. For native-editable export, skill not supported in v3.
