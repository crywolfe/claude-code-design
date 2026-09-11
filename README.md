# claude-code-design

**Claude Design (by Anthropic Labs), reproduced for Claude Code CLI.** Same outputs — HTML decks, interactive prototypes, design systems, animated videos — through an agent in your terminal instead of a canvas-based web app.

## Why this exists

[Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) is Anthropic Labs' chat+canvas for producing polished designs. It lives on claude.ai.

This repo gives you the same generative power — minus the canvas — through **skills + starter components + Chrome DevTools MCP**, all inside Claude Code. Same endpoint (HTML artifacts with designer-grade polish), different medium (terminal, not browser).

**The philosophy:** every Claude Design "user clicks a tab / drops a chip / toggles a switch" moment becomes an agent-autonomy moment here. Phase 0 auto-detects context. Skill triggers route by keyword. Heuristics decide speaker-notes vs self-sufficient slides. `/done` auto-registers every artifact. You tell the agent what you want; it handles the orchestration.

## Install

This repo is a **Claude Code workspace**, meant to be used as a **GitHub template**: one copy per team or project, with your own artifacts, design systems and permission answers living inside it.

**As a template (recommended):** on GitHub, open the repo, click **Use this template → Create a new repository**, then clone your copy. The template ships without artifacts, design systems or `settings.local.json` (all gitignored; `/doctor` creates the working dirs), so nothing personal is carried over. (Repository owners: enabling *Template repository* is a one-time switch under **Settings → General**.)

**As a plain clone:**

```bash
git clone https://github.com/bluzir/claude-code-design.git
cd claude-code-design
```

In a Claude Code session in this folder:

```
/doctor
```

First-run health check: verifies Chrome DevTools MCP (declared in `.mcp.json`, pinned and `--isolated`), `monolith`, `pptxgenjs + puppeteer`, creates working dirs, runs a smoke test. It prints the install commands for anything missing — you run them; the agent never installs software.

Full requirements + walkthrough in [`GETTING_STARTED.md`](./GETTING_STARTED.md).

**First session in a fresh copy:** approve the `.mcp.json` prompt (pinned `chrome-devtools-mcp`, `--isolated`), run `/doctor`, run `bash .claude/hooks/test-guard.sh` and confirm it reports 0 failures. What the security model is, and what an auditor should check, is drawn out in [`docs/architecture/security-architecture.html`](./docs/architecture/security-architecture.html) (open it in a browser). The plan for packaging this as a plugin for enterprise inference (Microsoft Foundry, Amazon Bedrock, Google Cloud) is in [`docs/enterprise-plugin.md`](./docs/enterprise-plugin.md).

## Features

### Creating artifacts

Skills that produce the five primary output kinds. All trigger by keyword in the brief — no launcher UI.

| Skill | Use when you need | What it does |
|---|---|---|
| `/make-deck` | a pitch deck, slides, keynote | Generates a 1920×1080 HTML deck using the `<deck-stage>` web component. Handles keyboard nav (←/→/Space/Home/End), tap-edge navigation on mobile, overlay slide counter, `@media print` one-page-per-slide, localStorage position, speaker-notes postMessage. Notes on/off is decided by a heuristic over brief length + audience keywords. |
| `/interactive-prototype` | a clickable app mockup | Scaffolds a React+Babel (pinned 18.3.1 + `@babel/standalone` 7.29.0 with integrity hashes) inside `<DeviceFrame kind="ios|android|mac|browser">`. Uses component-prefixed style names (`headerStyles`, `cardStyles`) to avoid Babel multi-file collisions. Transitions via `<Transition>` from `animations.jsx`. |
| `/wireframe` | to explore 3+ options side-by-side | Greyscale variations on a `<DesignCanvas columns=N>` grid. Placeholders instead of SVG-drawn imagery. Mixes conservative and novel patterns per the original spec's variation guidelines. |
| `/animated-video` | a motion reel, product intro, explainer | Composes scenes with `<Stage duration width height>` + `<Sprite start end easing>` + `useTime()` / `useSprite()` (Remotion-compatible API). Auto-scale canvas, built-in scrubber with play/pause, postMessage `{seekMs}` protocol for frame export. MP4 path writes a Remotion project source for the user to render themselves. |
| `/create-design-system` | to extract or build a brand | Reads `theme.*`, `tokens.*`, `tailwind.config.*`, `_variables.*` from a codebase; or builds from brief via `frontend-design`. Renders a living style guide with sections tagged `data-design-group` (Colors / Type / Spacing / Components / Brand). Offers to persist to the cross-project registry (see below). |

### Context ingestion

When the brief references an external source, these skills load it before the workflow skill runs. Auto-detected at Phase 0 — manual invocation rarely needed.

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
| `/inspect "<description>"` | to reference a specific visual element without pointing at source | Uses `.claude/last-snapshot.json` from `mcp__chrome-devtools__take_snapshot` (accessibility tree with UIDs). Matches description → UID → source location via `id` > `data-*` > unique class > `outerHTML` substring. Replaces Claude Design's `<mentioned-element>` pointer protocol |
| `/verify-artifact` | a visual QA pass before claiming done | Silent-on-pass. Fresh screenshot + console sweep; vision reads the image and checks Claude Design anti-pattern list (min 24px text on slides, contrast ≥ 4.5:1, no gradient backgrounds, no Inter/Roboto, no AI-slop card patterns, no filler). When `.claude/design-tokens.json` is loaded, also walks computed colors / fonts / radii and reports off-token drift (P1 fonts, P1/P2 colors). Reports P0/P1/P2/P3 with coordinates or element descriptions |

### Organization

Produced and maintained automatically — no explicit user action required.

| Skill / output | Mechanism |
|---|---|
| `/done <path-or-url>` | End-of-turn gate. `/preview` + async await for `document.readyState === 'complete'` + `document.fonts.ready` (2s race). Screenshot → `.claude/last-preview.png`. DOM snapshot → `.claude/last-snapshot.json`. Console sweep for errors. On clean, auto-invokes `/register-asset --auto` with group inferred from content (`<deck-stage>` → Brand; `<DeviceFrame>` / `<DesignCanvas>` → Components; `data-design-group` attrs → per-section) |
| `/register-asset` | Upserts entry in `design-assets.json`, reuses `.claude/last-preview.png` as thumbnail when `--auto`, regenerates `assets.html` via `scripts/make-assets-index.mjs` |
| `assets.html` | Auto-generated grid, grouped by Type / Colors / Spacing / Components / Brand. Cards show thumbnail, name, subtitle, status badge (needs-review / approved / changes-requested), updated date. The persistent workspace — equivalent of Claude Design's Recent tab |

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

### Reference / cold-start

| Skill | Purpose |
|---|---|
| `/doctor` | First-run health check. `claude mcp list`, `which monolith / node / gh`, verifies project structure, prints install commands for missing pieces (the user runs them), creates working dirs, runs a smoke test, prints skill cheat-sheet |
| `/copy-example <kind>` | Generates a working reference artifact in `artifacts/examples/<kind>-<ts>/` via a real skill run on a curated dummy brief. Live — not from a static gallery. `kind ∈ {deck, prototype, wireframe, animation, design-system}` |
| `/preview <path-or-url>` | `open` in default browser + Chrome DevTools MCP `navigate_page`. Accepts a local path or an `http://127.0.0.1:<port>/` URL — nothing else |
| `/screenshot <out.png> [--step "js"]` | One or more screenshots of current preview; runs JS via `evaluate_script` between frames. Multi-step saves as `<base>-01.png`, `<base>-02.png`, … |
| `/serve [port]` | `python3 -m http.server 4567 --bind 127.0.0.1 --directory artifacts` in background — serves only `artifacts/`. Required for artifacts that load external `.jsx` starters — Babel-standalone fetches via XHR which CORS-blocks on `file://` |

## Architecture

```
claude-code-design/
├── CLAUDE.md                           # project agent instructions (read by Claude)
├── GETTING_STARTED.md                  # human-facing setup + walkthrough
├── starters/                           # scaffolds copied into artifacts on demand
│   ├── deck_stage.js                   #   <deck-stage> web component (~260 LOC)
│   ├── device_frame.jsx                #   <DeviceFrame kind=...> (~230 LOC)
│   ├── design_canvas.jsx               #   <DesignCanvas columns=N> (~65 LOC)
│   └── animations.jsx                  #   Stage/Sprite + hooks + Easing + primitives (~400 LOC)
├── docs/
│   └── claude-design-parity.md         # feature-by-feature map to Claude Design
├── .claude/
│   ├── skills/                         # 24 skills
│   ├── commands/                       # 4 atomic slash commands
│   ├── hooks/guard-bash.sh             # PreToolUse bash guard (per-segment allowlists)
│   ├── hooks/guard-browser.py          # PreToolUse guard for Chrome DevTools MCP navigation / scripts
│   ├── hooks/test-guard.sh             # 287-case self-test for both guards
│   └── settings.json                   # deny list + hook registration (hooks, settings, scripts/ are write-protected)
├── scripts/
│   ├── export-pptx.mjs                 # puppeteer + pptxgenjs
│   ├── export-pdf.mjs                  # puppeteer Page.pdf
│   └── make-assets-index.mjs           # assets.html generator
├── test/                               # smoke tests (deck, canvas, stage)
├── package.json                        # dev deps: pptxgenjs, puppeteer
└── artifacts/                          # user work (git-ignored)
```

Brand registry (lives inside the repo, gitignored — nothing outside the project is auto-discovered):

```
design-systems/
├── <name>/
│   ├── tokens.json           # required — colors, fonts, spacing, radii, shadows
│   ├── manifest.json         # optional — default / locked / version / source / synced_project_id
│   ├── preview.html          # optional visual reference
│   └── sync/                 # upload bundle built by /sync-design-system
```

Versions and publish copies (both under the gitignored `artifacts/`):

```
artifacts/versions/<name>/<ts>-<label>.html + index.json    # /snapshot
artifacts/publish/<name>.html                               # /publish (self-contained copy)
```

Session state for `/make-tweakable` + `/apply-tweaks`:

```
artifacts/tweaks/<session-id>/    # session-id = tweaks-<slug>-<YYYYMMDD>
├── state.yaml                    # phase, last_applied_at, target_html
├── pending.yaml                  # buffered panel edits
└── applied/<ISO8601>.yaml        # append-only apply log for revert
```

## External dependencies

One MCP + two native CLIs + two npm packages. `/doctor` checks them and prints the commands; you run them.

| | Installed via | Used by |
|---|---|---|
| Chrome DevTools MCP | Declared in `.mcp.json` (approve when prompted), or `claude mcp add chrome-devtools -s project -- npx chrome-devtools-mcp@1.9.0 --isolated` | `/preview`, `/done`, `/screenshot`, `/inspect`, `/verify-artifact`, `/register-asset` |
| monolith (Rust) | `brew install monolith` | `/export-standalone` |
| pptxgenjs | `npm install -D pptxgenjs@4.0.1` | `/export-pptx` |
| puppeteer | `npm install -D puppeteer@24.41.0` | `/export-pptx`, `/export-pdf` |
| `gh` (optional) | `brew install gh && gh auth login` | `/ingest-github` |
| `FIGMA_TOKEN` env (optional) | `export FIGMA_TOKEN=...` | `/ingest-figma` |

## Parity status

Full feature-by-feature map: [`docs/claude-design-parity.md`](./docs/claude-design-parity.md).

**Reproduced:** deck-stage scaling + letterboxing + keyboard nav + speaker notes + print CSS, device frames (iPhone 15 Pro with Dynamic Island, Pixel 8 with punch-hole, macOS traffic lights, Chromium browser chrome), design canvas, Stage/Sprite timeline with Remotion-compatible API, ingestion from codebase / screenshot / Figma / office documents, typed tweak panel with claude-pipe on-disk persistence, PPTX / PDF / standalone export, developer handoff bundles, private share links with comments (`/publish`), design-system conformance check in `verify-artifact`, project-local design-system registry with default / locked governance, auto-register on `/done`.

**Bridged to Claude Design itself:** `/sync-design-system` pushes a registry entry into a claude.ai/design design-system project via the `DesignSync` tool.

**Adapted (different form, same outcome):**
- No canvas workspace → `assets.html` auto-populated grid
- No click-to-comment on elements → `/inspect "<description>"` via DOM snapshot UIDs
- No pointer-drag to edit → natural-language references resolved to source locations
- No toggle UI → heuristics (speaker notes, context detection, ambiguity gate)
- Version history → `/snapshot` folders under `artifacts/versions/`

**Not reproducible in a terminal (explicit skip):**
- Sub-second live preview loop — Chrome DevTools MCP round-trip is ~6–10s
- Real-time multi-user group mode, org sharing controls, connectors
- Web-page capture — would violate the Browser-scope rule (screenshot it yourself, then `/ingest-screenshot`)
- Multi-artboard `.dc.html` canvas format, canvas sketch pad

## Status

Research / personal tool, packaged as a GitHub template workspace. Single-user local. macOS-first (uses `open`, `brew`). All state lives in the repo folder — not cloud-synced. It runs on the Claude Code CLI only; Claude Desktop is not involved. Publishing (`/publish`) and `/sync-design-system` need a claude.ai login and are unavailable on third-party inference providers; everything else works there (see [`docs/enterprise-plugin.md`](./docs/enterprise-plugin.md)). Permissions are locked down by `.claude/settings.json` (deny list + two PreToolUse hooks: `guard-bash.sh` allowlists the documented command forms per pipeline segment, `guard-browser.py` keeps Chrome DevTools MCP on project files and 127.0.0.1); every skill's `allowed-tools` grants only the exact commands it runs. `bash .claude/hooks/test-guard.sh` runs the 287-case matrix.

## References

- [Claude Design announcement (Anthropic Labs, April 2026)](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [claude-pipe](https://github.com/bluzir/claude-pipe) — file-state pattern used for Tweaks persistence
- [Remotion](https://www.remotion.dev) — API naming inspiration for `<Stage>` / `<Sprite>` / `useTime` / `interpolate`
- [monolith](https://github.com/Y2Z/monolith) — standalone HTML bundler

## License

MIT
