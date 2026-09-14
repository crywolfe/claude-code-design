# claude-code-design

**Claude Design outcomes for enterprise Claude Code on non-Anthropic inference.** HTML decks, interactive prototypes, wireframes, design systems and animated videos, produced by an agent in your terminal and written to disk, for teams whose Claude Code runs against Microsoft Foundry, Amazon Bedrock, Google Vertex AI or an internal gateway.

## Start here

| You are | Read |
|---|---|
| Opening this repo for the first time | [Quick start](#quick-start), then [Examples](#examples) |
| Coming back to continue work | [Daily loop](#daily-loop-for-continuing-users) and [Where your work lives](#where-your-work-lives) |
| A security reviewer or platform admin | [`docs/architecture/security-architecture.html`](./docs/architecture/security-architecture.html) (open in a browser) and [`docs/enterprise-plugin.md`](./docs/enterprise-plugin.md) |
| Looking for one skill's exact behaviour | [Skill reference](#skill-reference) |

## Why this exists

[Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) is Anthropic Labs' chat+canvas for producing polished designs. It lives on claude.ai. Claude Code also ships a built-in `/design` command that drafts artboards and publishes them as a claude.ai artifact running the Claude Design editor.

Both require a claude.ai session on the Anthropic API. The Claude Code docs state that artifacts, and therefore `/design`, are not available on Amazon Bedrock, Google Vertex AI, Microsoft Foundry or Claude Platform on AWS. Enterprise clients on those endpoints get neither.

This repo fills that gap: the same generative power, minus the canvas, through **skills + starter components + Chrome DevTools MCP**, all inside Claude Code on any provider. Output is HTML on disk with designer-grade polish, plus decks, exports and developer handoff that `/design` does not cover. If you are on the Anthropic API with a paid claude.ai plan and want to hand-edit a mockup, use `/design` for that step; everything here still works alongside it.

**The philosophy:** every Claude Design "user clicks a tab / drops a chip / toggles a switch" moment becomes an agent-autonomy moment here. Phase 0 auto-detects context. Skill triggers route by keyword. Heuristics decide speaker-notes vs self-sufficient slides. `/done` auto-registers every artifact. You tell the agent what you want; it handles the orchestration.

## Quick start

This repo is a **Claude Code workspace** meant to be used as a **GitHub template**: one copy per team or project, with your own artifacts, design systems and permission answers living inside it. Nothing personal ships with the template; `artifacts/`, `design-systems/` and `settings.local.json` are gitignored.

1. **Get a copy.** On GitHub open the repo, click **Use this template → Create a new repository**, then clone your copy. Or clone the original directly:

   ```bash
   git clone https://github.com/<your-org>/<your-copy>.git   # your template copy
   git clone https://github.com/bluzir/claude-code-design.git   # or the original
   cd claude-code-design
   ```

2. **Open Claude Code in the folder** and approve the `.mcp.json` prompt. It registers `chrome-devtools-mcp@1.9.0` with `--isolated`, a throwaway Chrome profile with none of your cookies.

3. **Run the health check.**

   ```
   /doctor
   ```

   It inventories Chrome DevTools MCP, Node, `monolith`, `gh`, `pptxgenjs` and `puppeteer`, creates the working directories, runs a smoke deck and prints the install command for anything missing. You run those commands in a separate shell; the agent never installs software.

4. **Run the guard self-test** and confirm the last line reads `287 cases, 0 failed`.

   ```
   bash .claude/hooks/test-guard.sh
   ```

5. **Make something.**

   ```
   make a 3-slide deck about the history of butter for a general audience, editorial style
   ```

   Audience, style and length are all in the brief, so the ambiguity gate asks one or two short questions and starts. The deck lands at `artifacts/history-of-butter.html`, opens in Chrome, gets screenshotted to `.claude/last-preview.png` and appears in `assets.html`. Leave the audience and style out and you get the full questionnaire instead.

The long-form walkthrough with requirements, expected console output and common issues is in [`GETTING_STARTED.md`](./GETTING_STARTED.md).

(Repository owners: enabling *Template repository* is a one-time switch under **Settings → General**.)

## Examples

Each example is something you type into Claude Code in this folder, followed by what happens. Paths are what the skills actually write.

### A pitch deck with speaker notes

```
make-deck: 8-slide investor deck for Northwind Coffee's Series A, warm editorial style, with speaker notes
```

- **Fires** `/make-deck`. Audience, style and length are all in the brief, so the ambiguity gate skips the questionnaire and asks one or two questions.
- **Writes** `artifacts/northwind-series-a.html` and copies `starters/deck_stage.js` beside it. Speaker notes go into a `<script id="speaker-notes">` block.
- **Then** `/done` runs the per-slide overflow audit. Anything with `overflow > 0` is fixed before the turn ends. Export with `/export-pptx artifacts/northwind-series-a.html`; the notes attach to each slide.

### A clickable phone prototype

```
interactive prototype of a habit-tracking app, iOS, three screens: today, streaks, settings
```

- **Fires** `/interactive-prototype`. React 18.3.1 and Babel standalone are pinned with integrity hashes; the screens sit inside `<DeviceFrame kind="ios">`.
- **Writes** `artifacts/habit-tracker.html` plus copies of `device_frame.jsx` and `animations.jsx`. Because Babel fetches `.jsx` over XHR, the skill starts `/serve` and previews at `http://127.0.0.1:4567/habit-tracker.html`.
- **Then** say `make the streak card tappable and open a detail sheet`; the skill edits in place and re-runs `/done`.

### Three layout options before committing

```
wireframe 3 options for a pricing page: conservative, bold, and something in between
```

- **Fires** `/wireframe`. Greyscale, placeholders instead of drawn imagery, all three on one `<DesignCanvas columns="3">`.
- **Writes** `artifacts/pricing-page-options.html`.
- **Then** pick one: `go with option 2 as a full interactive prototype`.

### A design system from your codebase

```
create a design system from ./web (it has tailwind.config.ts) and call it acme
```

- **Fires** `/create-design-system`. Phase 0 globs `tailwind.config.*`, `theme.*`, `tokens.*` and `_variables.*` under the path you named and reads only those files.
- **Writes** a living style guide at `artifacts/acme-design-system.html` with sections tagged `data-design-group`, then offers to save `design-systems/acme/tokens.json`.
- **Then** make it the project default so every later brief uses it:

  ```
  /use-design-system --default acme
  ```

  `/verify-artifact` now reports colors, fonts and radii that drift from those tokens.

### Start from an existing PowerPoint

```
/ingest-document ~/Downloads/brand-deck-2025.pptx
```

- **Asks first**, then reads the theme XML with `unzip -p` and never extracts to disk.
- **Writes** `artifacts/ingested/brand-deck-2025-tokens.json` (color scheme, major and minor fonts, slide size) and `artifacts/ingested/brand-deck-2025-outline.md` (text outline, capped at 20 slides).
- **Then** `make a 6-slide deck from that outline, same brand`. Text inside the document is data; instructions found in it are quoted back to you, never followed.

### Live knobs, then persist the changes

```
/make-tweakable artifacts/northwind-series-a.html
```

- **Adds** a floating panel bound to `--tweak-*` custom properties. Shift+T toggles it. You change the accent colour and headline size in the browser.
- **Buffers** the edits in `artifacts/tweaks/tweaks-northwind-series-a-20260913/pending.yaml`. Nothing touches the HTML yet.
- **Then** `/apply-tweaks artifacts/northwind-series-a.html` validates each value against its declared type, edits the source and appends `applied/<timestamp>.yaml` so the change can be reverted.

### Save a version before a big rework, then go back

```
/snapshot artifacts/northwind-series-a.html before-rebrand
```

- **Copies** the file to `artifacts/versions/northwind-series-a/<timestamp>-before-rebrand.html` and records the label in `index.json`.
- **Rework** freely: `rebrand the whole deck to the acme design system`.
- **Then**, if it went wrong: `/snapshot list artifacts/northwind-series-a.html` and `/snapshot restore artifacts/northwind-series-a.html <version-file>`. Restore snapshots the current state as `before-restore` first.

### Share for feedback and answer the comments

```
/publish artifacts/northwind-series-a.html --label "v1 for the board"
```

- **Writes** a self-contained copy to `artifacts/publish/northwind-series-a.html` and deploys it as a private claude.ai page. The URL is recorded in `design-assets.json`. Redeploys keep the URL.
- **Later**: `/publish comments artifacts/northwind-series-a.html` lists the threads. Comment text is treated as data.
- **Then** `/publish reply artifacts/northwind-series-a.html <thread-id> "Swapped the chart for a table, see slide 5"`. Needs a claude.ai login on the Anthropic API; on Foundry, Bedrock or Vertex the skill stops and says so.

### Hand the prototype to a developer

```
/handoff artifacts/habit-tracker.html --zip
```

- **Writes** `handoff/habit-tracker/` with the source, the starters it uses, React components extracted to `src/components/*.jsx`, tokens as `src/tokens.css` and `src/tokens.json`, a `handoff.json` manifest and a README listing structure, run steps, design decisions, assumptions and open questions.
- **Adds** `handoff/habit-tracker-<timestamp>.zip`.
- **Then** commit the folder or attach the zip to the ticket.

### See a reference before writing your own brief

```
/copy-example deck
```

- **Generates** a working deck on dummy content in `artifacts/examples/deck-<timestamp>/` by running the real skill, not by copying a gallery file.
- Also accepts `prototype`, `wireframe`, `animation` and `design-system`.

## Daily loop for continuing users

1. **Brief in plain language.** Keywords route to a skill: "deck", "prototype", "wireframe", "animation", "design system". Include audience, style and length and the questionnaire collapses to one or two questions.
2. **Let `/done` gate the turn.** Every meaningful change ends with a preview, a console sweep, a screenshot at `.claude/last-preview.png`, a DOM snapshot at `.claude/last-snapshot.txt`, and automatic registration in `assets.html`. Decks also get the overflow audit.
3. **Refer to elements in words.** "The red button in the hero" resolves through `/inspect` to a source location. There is no canvas to click.
4. **Snapshot before big reworks**, tweak for small ones, and let `verify-artifact` flag drift from the loaded design system.
5. **Ship**: `/export-pptx`, `/export-pdf`, `/export-standalone`, `/handoff`, or `/publish` when a claude.ai session is available.

**Teach the workspace your taste.** Team-wide rules go in `CLAUDE.md` under "Anti-patterns" and "Scales". Brands go in `design-systems/<name>/`; `/use-design-system --default <name>` applies one to every brief and `--lock <name>` stops it being overwritten.

**Expect the guard to say no sometimes.** The bash guard allows only the documented form of each command and reads the raw command string, so it also blocks prose that looks like a command. Things returning users hit:

- `which node` is blocked; `node --version` is the allowed form and is what `/doctor` and the export preflights use. `which monolith` and `which gh` are allowed.
- A commit message containing words like "security", "env vars" or a `<…>` trailer is blocked inline. Write the message to `artifacts/commit-msg.txt` and run `git commit -F artifacts/commit-msg.txt`, which is an allowed and self-tested form.
- Redirects go only to `/dev/null`; heredocs, `sed -i` and `tee` are refused. Use Write or Edit for file changes.

When a command is blocked the agent tells you what and why. It does not look for a workaround, and you should not ask it to.

## Where your work lives

Everything is inside the repo folder. Nothing is written outside it, and nothing outside it is auto-discovered.

| Path | Holds | Tracked by git |
|---|---|---|
| `artifacts/<name>.html` | your artifacts and the starters copied beside them | no |
| `artifacts/versions/<name>/` | `/snapshot` copies plus `index.json` | no |
| `artifacts/publish/` | self-contained copies made by `/publish` | no |
| `artifacts/tweaks/<session>/` | `pending.yaml`, `state.yaml`, `applied/*.yaml` | no |
| `artifacts/ingested/` | tokens and outlines from ingest skills | no |
| `handoff/<name>/` | developer bundles | no |
| `design-systems/<name>/` | `tokens.json`, optional `manifest.json`, `preview.html`, `sync/` | no |
| `assets.html`, `design-assets.json`, `assets/thumbs/` | the auto-maintained overview | no |
| `.claude/last-preview.png`, `.claude/last-snapshot.txt` | the latest `/done` capture | no |
| `.claude/design-tokens.json` | the active design system | no |
| `CLAUDE.md`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`, `.mcp.json`, `starters/`, `scripts/` | the workspace itself | yes |

A fresh clone therefore starts empty. To carry a brand between machines, commit `design-systems/<name>/` in your own copy or copy the folder by hand.

## Enterprise use and inference providers

Nothing in this workspace calls a model API. It runs inside Claude Code, and Claude Code picks the provider from environment flags: Anthropic API, Microsoft Foundry, Amazon Bedrock, Google Vertex AI or a gateway. Every creation, ingestion, iteration and export skill works on all of them.

Three things need a claude.ai session on the Anthropic API and are unavailable elsewhere: `/publish`, `/sync-design-system`, and Claude Code's own `/design`. The skills check for the tool and stop with a message rather than failing partway.

Controls an auditor will ask about, all in the repo:

- `.claude/settings.json` carries a deny list and registers two PreToolUse hooks.
- `.claude/hooks/guard-bash.sh` allowlists the documented form of every command per pipeline segment.
- `.claude/hooks/guard-browser.py` keeps Chrome DevTools MCP on project files and `127.0.0.1` and refuses scripts that open connections, navigate, or touch storage.
- `bash .claude/hooks/test-guard.sh` runs the 287-case matrix covering both guards.
- Every skill's `allowed-tools` grants only the exact commands it runs.

The diagrams, egress inventory and findings register are in [`docs/architecture/security-architecture.html`](./docs/architecture/security-architecture.html). The plan for shipping this as a managed plugin, with provider settings and the auditor checklist, is in [`docs/enterprise-plugin.md`](./docs/enterprise-plugin.md).

## Skill reference

### Creating artifacts

Skills that produce the five primary output kinds. All trigger by keyword in the brief; there is no launcher UI.

| Skill | Use when you need | What it does |
|---|---|---|
| `/make-deck` | a pitch deck, slides, keynote | Generates a 1920×1080 HTML deck using the `<deck-stage>` web component. Handles keyboard nav (←/→/Space/Home/End), tap-edge navigation on mobile, overlay slide counter, `@media print` one-page-per-slide, localStorage position, speaker-notes postMessage. Notes on/off is decided by a heuristic over brief length + audience keywords. |
| `/interactive-prototype` | a clickable app mockup | Scaffolds a React+Babel (pinned 18.3.1 + `@babel/standalone` 7.29.0 with integrity hashes) inside `<DeviceFrame kind="ios|android|mac|browser">`. Uses component-prefixed style names (`headerStyles`, `cardStyles`) to avoid Babel multi-file collisions. Transitions via `<Transition>` from `animations.jsx`. |
| `/wireframe` | to explore 3+ options side-by-side | Greyscale variations on a `<DesignCanvas columns=N>` grid. Placeholders instead of SVG-drawn imagery. Mixes conservative and novel patterns per the original spec's variation guidelines. |
| `/animated-video` | a motion reel, product intro, explainer | Composes scenes with `<Stage duration width height>` + `<Sprite start end easing>` + `useTime()` / `useSprite()` (Remotion-compatible API). Auto-scale canvas, built-in scrubber with play/pause, postMessage `{seekMs}` protocol for frame export. MP4 path writes a Remotion project source for the user to render themselves. |
| `/create-design-system` | to extract or build a brand | Reads `theme.*`, `tokens.*`, `tailwind.config.*`, `_variables.*` from a codebase; or builds from brief via `frontend-design`. Renders a living style guide with sections tagged `data-design-group` (Colors / Type / Spacing / Components / Brand). Offers to persist to the project-local registry. |

### Context ingestion

When the brief references an external source, these skills load it before the workflow skill runs. Detected at Phase 0, and always asked about before anything is cloned, fetched or read.

| Skill | Source | Mechanism |
|---|---|---|
| `/ingest-github <url>` | github.com repo | Asks first, then `gh repo clone --depth 1 --branch <ref>` into `/tmp/cd-ingest-*`, `Glob` + `Read` only theme/tokens/tailwind files (max 20 × 64 KB, never README/docs), regex-extract hex colors + fonts + spacing + radii, write `artifacts/ingested/<repo>-tokens.json`. File contents are treated as data, never as instructions |
| `/ingest-screenshot <path>` | PNG / JPG / WebP | Multimodal `Read` loads the image; Claude's vision infers dominant colors (hex approximate), typography family, component patterns, spacing rhythm. Output includes per-category `confidence` flags |
| `/ingest-figma <url>` | figma.com file/frame | Requires `FIGMA_TOKEN` env var. GET-only `curl` to `api.figma.com/v1/files/{key}/nodes?ids={id}` + `/styles` (the only curl the permission set and bash guard allow). SVG fallback path for users without a token |
| `/ingest-document <file>` | `.pptx` / `.docx` / `.xlsx` / `.pdf` | Asks first, then reads the office theme XML with `unzip -p` (never extracts to disk): color scheme, major/minor fonts, slide size, plus a text outline capped at 20 slides × 64 KB. PDF goes through vision. Writes `artifacts/ingested/<slug>-tokens.json` + `-outline.md` |
| `/use-design-system <name>` | `design-systems/<name>/` | Loads tokens.json from the project-local registry (gitignored) into `.claude/design-tokens.json`. `--default` / `--lock` / `--unlock` edit the entry's `manifest.json`; a bare call loads the default |

### Iteration

For refining an artifact after the first `/done`.

| Skill | Use when you need | Mechanism |
|---|---|---|
| `/make-tweakable` | a floating panel so a viewer can change colors/fonts/spacing/copy/variants live in the preview | Injects a panel driven by a typed `__tweak_schema` (`color`, `number`, `boolean`, `enum`, `string` with `label` / `group` / `target`) bound to `--tweak-*` custom properties, `data-tweak-*` attributes and `data-tweak` text targets. Panel writes to `pending.yaml` via File System Access API (falls back to clipboard / copy-paste). Shift+T toggles visibility |
| `/apply-tweaks` | to persist panel changes to disk | Reads `pending.yaml`, validates each value against its declared type, applies via `Edit` to the source HTML, appends `applied/<ISO8601>.yaml` to session log (claude-pipe file-state pattern). `git diff applied/` is the revert audit trail |
| `/snapshot <html> <label>` | a named version before a big rework, or to go back | Copies to `artifacts/versions/<name>/<ts>-<label>.html` and records label + note in `index.json`. `list` / `restore` (restore snapshots the current state first) |
| `/inspect "<description>"` | to reference a specific visual element without pointing at source | Uses `.claude/last-snapshot.txt` from `mcp__chrome-devtools__take_snapshot` (accessibility tree with UIDs). Matches description → UID → source location via `id` > `data-*` > unique class > `outerHTML` substring. Replaces Claude Design's `<mentioned-element>` pointer protocol |
| `/verify-artifact` | a visual QA pass before claiming done | Silent-on-pass. Fresh screenshot + console sweep; vision reads the image and checks Claude Design anti-pattern list (min 24px text on slides, contrast ≥ 4.5:1, no gradient backgrounds, no Inter/Roboto, no AI-slop card patterns, no filler). When `.claude/design-tokens.json` is loaded, also walks computed colors / fonts / radii and reports off-token drift (P1 fonts, P1/P2 colors). Reports P0/P1/P2/P3 with coordinates or element descriptions |
| `/live-reload <html>` | the preview to refresh itself on every save | Injects `starters/live_reload.js` (`data-dev-only`) which polls the file's `Last-Modified` header over `/serve` and reloads on change. No-ops off `127.0.0.1`; dropped by `/publish`, `/export-standalone`, `/handoff` |
| `/make-editable <html>` | click-to-edit text/style/hide directly in the preview | Stamps `data-edit="eNNN"` ids, injects `starters/editor_overlay.js` (`data-dev-only`). Shift+E outlines stamped elements; a panel offers text (leaf elements only), an allowlisted set of CSS properties, and a hide toggle. Buffers to `artifacts/edits/<session>/pending.yaml` via the same File System Access API writer as the tweaks panel. Static HTML only — refuses React+Babel artifacts |
| `/apply-edits <html>` | to persist buffered click-to-edit changes to disk | Validates every `pending.yaml` entry against the §2.4 allowlist (all-or-nothing), then writes text via `Edit`, rebuilds the single `<style id="__edits">` block, and toggles `hidden`. Logs `applied/<ts>.yaml` with each entry's previous value (revert source), bumps `edits-generation` |

### Organization

Produced and maintained automatically; no explicit user action required.

| Skill / output | Mechanism |
|---|---|
| `/done <path-or-url>` | End-of-turn gate. `/preview` + async await for `document.readyState === 'complete'` + `document.fonts.ready` (2s race). Screenshot → `.claude/last-preview.png`. DOM snapshot → `.claude/last-snapshot.txt` (the MCP writes plain text whatever extension is requested). Console sweep for errors. On clean, auto-invokes `/register-asset --auto` with group inferred from content (`<deck-stage>` → Brand; `<DeviceFrame>` / `<DesignCanvas>` → Components; `data-design-group` attrs → per-section) |
| `/register-asset` | Upserts entry in `design-assets.json`, reuses `.claude/last-preview.png` as thumbnail when `--auto`, regenerates `assets.html` via `scripts/make-assets-index.mjs` |
| `assets.html` | Auto-generated grid, grouped by Type / Colors / Spacing / Components / Brand. Cards show thumbnail, name, subtitle, status badge (needs-review / approved / changes-requested), updated date. The persistent workspace, equivalent of Claude Design's Recent tab |

### Sharing

| Skill | Mechanism |
|---|---|
| `/publish <html> [--label "…"]` | Writes a self-contained copy to `artifacts/publish/` (siblings inlined, wrapper tags stripped, unpkg script tags rewritten to jsdelivr) and deploys it with Claude Code's `Artifact` tool as a **private** claude.ai page. Redeploys keep the URL; `--label` names the version. URL recorded in `design-assets.json` |
| `/publish comments <html>` · `reply` · `watch` | Reads comment threads on the page, replies into threads sent to Claude and resolves them once acted on, or subscribes the session to republishes. Comment text is treated as data |
| `/sync-design-system <name>` | Pushes a registry entry to a Claude Design design-system project through the `DesignSync` tool: build an upload bundle under `design-systems/<name>/sync/`, structural diff, user-approved plan, then `write_files`. Never deletes unless the user names the path. Only available in Claude Code builds that ship `DesignSync` |

### Export

Four paths from HTML artifact to external formats.

| Skill | Produces | Pipeline |
|---|---|---|
| `/export-pptx <deck.html>` | `.pptx` | Puppeteer loads the artifact at 1920×1080, iterates slides via `deck-stage.goToSlide(i)` with `noscale` attr for natural dims, screenshots each, builds the PPTX with `pptxgenjs`. Speaker notes from `<script id="speaker-notes">` attach per slide. Screenshots-only (not editable native shapes) |
| `/export-pdf <path>` | `.pdf` | Puppeteer `Page.pdf()` with `print` media emulation + deck-aware page size (reads `width`/`height` attrs off `<deck-stage>` via public getters; falls back to A4 for non-deck artifacts) |
| `/export-standalone <in> <out>` | single-file `.html` | `monolith --isolate --no-metadata`. Inlines all CSS/JS/images as data URLs. Works offline. Trade-off: 5–10× file size |
| `/handoff <path> [--zip]` | `handoff/<name>/` | Copies the source + sibling starters, extracts React components from inline `<script type="text/babel">` blocks to `src/components/*.jsx`, pulls tokens into `src/tokens.css` + `src/tokens.json`, writes `handoff.json` (artboards, components, dependencies, published URL) and a README with structure, run/integration steps, **design decisions & assumptions**, and open questions. Copies `.claude/last-preview.png` as reference; `--zip` adds `handoff/<name>-<ts>.zip` |

### Reference and cold start

| Skill | Purpose |
|---|---|
| `/doctor` | First-run health check. `claude mcp list`, checks for `monolith`, `node` and `gh`, verifies project structure, prints install commands for missing pieces (the user runs them), creates working dirs, runs a smoke test, prints skill cheat-sheet |
| `/copy-example <kind>` | Generates a working reference artifact in `artifacts/examples/<kind>-<ts>/` via a real skill run on a curated dummy brief. Live, not from a static gallery. `kind ∈ {deck, prototype, wireframe, animation, design-system}` |
| `/preview <path-or-url>` | `open` in default browser + Chrome DevTools MCP `navigate_page`. Accepts a local path or an `http://127.0.0.1:<port>/` URL, nothing else |
| `/screenshot <out.png> [--step "js"]` | One or more screenshots of current preview; runs JS via `evaluate_script` between frames. Multi-step saves as `<base>-01.png`, `<base>-02.png`, … |
| `/serve [port]` | `python3 -m http.server 4567 --bind 127.0.0.1 --directory artifacts` in background; serves only `artifacts/`. Required for artifacts that load external `.jsx` starters, because Babel-standalone fetches via XHR which CORS-blocks on `file://` |

## Architecture

```
claude-code-design/
├── CLAUDE.md                           # project agent instructions (read by Claude)
├── GETTING_STARTED.md                  # human-facing setup + walkthrough
├── starters/                           # scaffolds copied into artifacts on demand
│   ├── deck_stage.js                   #   <deck-stage> web component
│   ├── device_frame.jsx                #   <DeviceFrame kind=...>
│   ├── design_canvas.jsx               #   <DesignCanvas columns=N>
│   └── animations.jsx                  #   Stage/Sprite + hooks + Easing + primitives
├── docs/
│   ├── claude-design-parity.md         # feature-by-feature map to Claude Design and /design
│   ├── enterprise-plugin.md            # plugin packaging plan for Foundry / Bedrock / Vertex clients
│   └── architecture/
│       └── security-architecture.html  # deployment, sequence and control-stack diagrams for auditors
├── .claude/
│   ├── skills/                         # 24 skills
│   ├── commands/                       # 4 atomic slash commands: done, preview, screenshot, serve
│   ├── hooks/guard-bash.sh             # PreToolUse bash guard (per-segment allowlists)
│   ├── hooks/guard-browser.py          # PreToolUse guard for Chrome DevTools MCP navigation / scripts
│   ├── hooks/test-guard.sh             # 287-case self-test for both guards
│   └── settings.json                   # deny list + hook registration (hooks, settings, scripts/ are write-protected)
├── scripts/
│   ├── export-pptx.mjs                 # puppeteer + pptxgenjs
│   ├── export-pdf.mjs                  # puppeteer Page.pdf
│   └── make-assets-index.mjs           # assets.html generator
├── test/                               # smoke tests: deck, canvas, stage
├── .mcp.json                           # chrome-devtools-mcp@1.9.0 --isolated
├── package.json                        # dev deps: pptxgenjs, puppeteer
└── artifacts/                          # user work (gitignored)
```

## External dependencies

One MCP, two native CLIs and two npm packages. `/doctor` checks them and prints the commands; you run them.

| | Installed via | Used by |
|---|---|---|
| Chrome DevTools MCP | Declared in `.mcp.json` (approve when prompted), or `claude mcp add chrome-devtools -s project -- npx chrome-devtools-mcp@1.9.0 --isolated` | `/preview`, `/done`, `/screenshot`, `/inspect`, `/verify-artifact`, `/register-asset` |
| monolith (Rust) | `brew install monolith` | `/export-standalone` |
| pptxgenjs | `npm install -D pptxgenjs@4.0.1` | `/export-pptx` |
| puppeteer | `npm install -D puppeteer@24.41.0` | `/export-pptx`, `/export-pdf` |
| `gh` (optional) | `brew install gh && gh auth login` | `/ingest-github` |
| `FIGMA_TOKEN` env (optional) | `export FIGMA_TOKEN=...` | `/ingest-figma` |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/done` reports a broken preview but the file opens fine by hand | CORS on `file://` for external `.jsx` starters. Run `/serve`, then `/done http://127.0.0.1:4567/<name>.html` |
| Chrome DevTools MCP does not connect after install | Restart Claude Code after any `claude mcp add`, then run `/doctor` again |
| The guard blocked a command | Read the reason it printed. The documented form is in `CLAUDE.md` under "Bash guard"; commit messages go through `git commit -F artifacts/commit-msg.txt` |
| `/export-pdf` or `/export-pptx` dies with `Cannot find package 'puppeteer'` | A fresh clone has no `node_modules/`. Run `npm install -D pptxgenjs@4.0.1 puppeteer@24.41.0` in a separate shell, then retry. The skills check with `ls -d node_modules/puppeteer` before running the script; a silent `test -d` is not used because its exit code is not visible to the agent |
| `/export-pdf` or `/export-pptx` fails with `Failed to launch the browser process` and `dlopen … Google Chrome for Testing Framework … no such file` | The Chrome for Testing build under `~/.cache/puppeteer/chrome/<version>/` is incomplete: puppeteer's zip extraction stopped before the `Frameworks` folder and left the `.zip` beside the folder. Re-downloading with `npx puppeteer browsers install chrome` can fail the same way. Instead, in a separate shell: `cd ~/.cache/puppeteer/chrome`, delete the version folder, `mkdir` it again, and `unzip -q <version>-chrome-mac-arm64.zip -d <folder>`; `Contents/` should then list `Frameworks`, `Info.plist`, `MacOS`, `PkgInfo`, `Resources`. The agent cannot repair this: `rm` outside `/tmp/cd-ingest-*`, `npx` and `unzip` to disk are all blocked |
| `/export-pdf` writes a one-page PDF for a multi-slide deck | Either the deck's copy of `deck_stage.js` predates the print fix of 2026-09-14 (re-copy `starters/deck_stage.js` next to the HTML and re-export), or the deck loads the starter through `../starters/`, which the export sandbox blocks (copy it beside the HTML instead) |
| `/export-pptx` hangs on fonts | Preload remote fonts with `<link rel="preload" as="font">` or inline them as data URLs |
| `/publish` says the Artifact tool is missing | You are on a third-party provider or not logged in to claude.ai. Use `/export-standalone` and share the file instead |
| Tweaks panel's "Link pending.yaml" button does nothing | File System Access needs a secure context. Run `/serve` first, or use "Copy YAML" and paste it to Claude with "save tweaks" |

More in [`GETTING_STARTED.md`](./GETTING_STARTED.md) under "Common issues".

## Parity status

Full feature-by-feature map, including the built-in `/design` command: [`docs/claude-design-parity.md`](./docs/claude-design-parity.md).

**Reproduced:** deck-stage scaling + letterboxing + keyboard nav + speaker notes + print CSS, device frames (iPhone 15 Pro with Dynamic Island, Pixel 8 with punch-hole, macOS traffic lights, Chromium browser chrome), design canvas, Stage/Sprite timeline with Remotion-compatible API, ingestion from codebase / screenshot / Figma / office documents, typed tweak panel with claude-pipe on-disk persistence, PPTX / PDF / standalone export, developer handoff bundles, private share links with comments (`/publish`), design-system conformance check in `verify-artifact`, project-local design-system registry with default / locked governance, auto-register on `/done`.

**Bridged to Claude Design itself:** `/sync-design-system` pushes a registry entry into a claude.ai/design design-system project via the `DesignSync` tool.

**Adapted (different form, same outcome):**
- No canvas workspace → `assets.html` auto-populated grid
- No click-to-comment on elements → `/inspect "<description>"` via DOM snapshot UIDs
- No pointer-drag to edit → natural-language references resolved to source locations
- No toggle UI → heuristics (speaker notes, context detection, ambiguity gate)
- Version history → `/snapshot` folders under `artifacts/versions/`

**Not reproducible in a terminal (explicit skip):**
- The `/design` canvas editor itself, which needs the claude.ai artifact platform
- Sub-second live preview loop; the Chrome DevTools MCP round-trip is several seconds
- Real-time multi-user group mode, org sharing controls, connectors
- Web-page capture, which would violate the Browser-scope rule (screenshot it yourself, then `/ingest-screenshot`)
- Multi-artboard `.dc.html` canvas format, canvas sketch pad

## Status

Research / personal tool, packaged as a GitHub template workspace. Single-user local. macOS-first (uses `open`, `brew`). All state lives in the repo folder and is not cloud-synced. It runs on the Claude Code CLI only; Claude Desktop is not involved. `/publish` and `/sync-design-system` need a claude.ai login and are unavailable on third-party inference providers; everything else works there. Permissions are locked down by `.claude/settings.json` and the two guard hooks described above, and `bash .claude/hooks/test-guard.sh` runs the 287-case matrix.

## References

- [Claude Design announcement (Anthropic Labs, April 2026)](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [Claude Code artifacts and the `/design` command](https://code.claude.com/docs/en/artifacts)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [claude-pipe](https://github.com/bluzir/claude-pipe): file-state pattern used for Tweaks persistence
- [Remotion](https://www.remotion.dev): API naming inspiration for `<Stage>` / `<Sprite>` / `useTime` / `interpolate`
- [monolith](https://github.com/Y2Z/monolith): standalone HTML bundler

## License

MIT
