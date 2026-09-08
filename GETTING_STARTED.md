# Getting started

Step-by-step setup for a fresh machine.

## Requirements

| | Why |
|---|---|
| **macOS 14+** | `open` command, Homebrew (Linux possible with `xdg-open` but untested) |
| **Claude Code CLI** | Main interface to skills and MCP tools. [Install](https://docs.claude.com/en/docs/agents-and-tools/claude-code). Authenticate with your Anthropic account |
| **Node.js ≥ 20** | For `scripts/export-pptx.mjs`, `scripts/export-pdf.mjs`, `scripts/make-assets-index.mjs`. Check: `node --version`. Recommend [nvm](https://github.com/nvm-sh/nvm) |
| **Homebrew** | Installs `monolith` and optionally `gh`. [brew.sh](https://brew.sh) |
| **Google Chrome (or Chromium)** | Host for Chrome DevTools MCP. Regular Chrome works; the MCP attaches to it |
| **`gh` CLI** (optional) | Needed for `/ingest-github`. `brew install gh && gh auth login` |

Optional depending on which skills you use:

| | Needed for |
|---|---|
| `FIGMA_TOKEN` env var | `/ingest-figma` — [create a personal access token](https://www.figma.com/developers/api#access-tokens) and `export FIGMA_TOKEN=...` in your shell profile |
| A design system in `design-systems/<name>/` (gitignored, inside the repo) | Brand reuse via `/use-design-system` |

## Install

```bash
git clone https://github.com/bluzir/claude-code-design.git
cd claude-code-design
```

Open Claude Code in this directory (or run `claude` if the CLI is installed and that's the binary name).

In the first turn, run:

```
/doctor
```

`/doctor` performs:

1. Inventory: `claude mcp list` → checks Chrome DevTools MCP; `which monolith node gh`; tests project structure
2. Repair: prints the install commands for missing pieces (`claude mcp add chrome-devtools -s project -- npx chrome-devtools-mcp@1.9.0 --isolated`, `brew install monolith`, `npm install -D pptxgenjs@4.0.1 puppeteer@24.41.0`) — **you run them in a separate shell**; the agent never installs software
3. Smoke test: creates a tiny `test/smoke-deck.html`, runs `/done` on it, reports pass/fail
4. Prints a skill cheat-sheet

If something in step 1 is already installed, `/doctor` skips the corresponding install. Safe to run multiple times.

### Claude Code restart after MCP install

The MCP is declared in `.mcp.json` (pinned version, `--isolated` so it runs a throwaway Chrome profile with none of your real cookies); Claude Code asks you to approve it on first launch. A manual `claude mcp add chrome-devtools …` requires a Claude Code restart before the new MCP tools appear. If `/doctor` asks you to restart — do it, then run `/doctor` again so it can proceed with the remaining steps.

## First artifact — end-to-end walkthrough

Once `/doctor` is clean, try:

```
make a 3-slide deck about the history of butter
```

Expected flow:

1. `make-deck` skill fires on trigger ("deck", "slides")
2. Phase 0: scans project for design tokens / attached files → reports "No context — using frontend-design for aesthetic direction". If the brief contained a GitHub/Figma URL, a document or an image, Claude lists it and **asks** before ingesting — nothing is cloned, fetched or installed without you saying yes
3. Phase 1: ambiguity gate — brief has length (3 slides) but no audience/style → one or two quick `AskUserQuestion`s
4. Phase 1.5: speaker-notes heuristic — "history of butter / 3 slides" is short → decides **notes: off**
5. Writes `artifacts/history-of-butter.html`, copies `starters/deck_stage.js` alongside
6. Runs `/done artifacts/history-of-butter.html`:
   - Opens in Chrome via `open`
   - Chrome DevTools MCP navigates + waits for fonts
   - Screenshot saved to `.claude/last-preview.png`
   - DOM snapshot saved to `.claude/last-snapshot.json`
   - Console messages listed
7. If clean: auto-registers the deck → updates `assets.html`
8. Verifies visually via `verify-artifact` (silent on pass; also checks the active design system's tokens when one is loaded)
9. Offers next steps: `/snapshot` a version, `/publish` a private share link, `/export-pptx`, `/export-pdf`, `/export-standalone`, `/make-tweakable`, `/handoff`

Open `assets.html` in a browser to see the result with its thumbnail.

## Folder layout after first use

```
claude-code-design/
├── artifacts/
│   └── history-of-butter.html       # your deck
│   └── deck_stage.js                # copied starter
├── assets.html                      # auto-generated overview (open this)
├── assets/thumbs/                   # auto-captured thumbnails
├── design-assets.json               # registry data
└── .claude/
    ├── last-preview.png             # last /done screenshot
    └── last-snapshot.json           # last /done DOM snapshot
```

`artifacts/`, `assets.html`, `assets/thumbs/`, `design-assets.json`, and `.claude/last-*` are **git-ignored** — each clone starts clean.

## Going further

| I want to… | Read |
|---|---|
| See the full skill + command map | [`README.md`](./README.md) |
| Understand what Claude will do on my brief | [`CLAUDE.md`](./CLAUDE.md) |
| Understand the taste + anti-pattern rules | [`CLAUDE.md`](./CLAUDE.md) "Anti-patterns" and "Scales" sections |
| Build a reusable brand | Run `/create-design-system` — it offers to save to `design-systems/<name>/` (gitignored) at the end; `/use-design-system --default <name>` makes it the project default, `--lock` protects it |
| Start from an existing deck or brand PDF | `/ingest-document <file>` (`.pptx`, `.docx`, `.xlsx` or `.pdf`) — theme colors, fonts and outline into `artifacts/ingested/` |
| Share for feedback | `/publish artifacts/<name>.html` → private claude.ai link; `/publish comments …` reads the threads |
| Push a brand to Claude Design proper | `/sync-design-system <name>` (needs the DesignSync tool in your Claude Code build) |
| See what Claude Design has that this repo does not | [`docs/claude-design-parity.md`](./docs/claude-design-parity.md) |
| Copy a working reference | `/copy-example deck` (or `prototype`, `wireframe`, `animation`, `design-system`) |

## Common issues

**`/done` reports a broken preview but the HTML loads when I `open` it manually.**
Often CORS on `file://` for external `.jsx` starters. Run `/serve` to start `http://127.0.0.1:4567` (root: `artifacts/`), then `/done http://127.0.0.1:4567/<name>.html`. The `interactive-prototype` / `wireframe` / `animated-video` skills already handle this — but if you wrote HTML manually, switch to the http URL.

**Chrome DevTools MCP won't connect after install.**
Requires a Claude Code restart after `claude mcp add`. If still failing, fallback: `claude mcp add playwright -s project -- npx @playwright/mcp@<pinned version> --isolated` (ships its own Chromium; pin the version, never `@latest`).

**`/export-pptx` hangs on fonts.**
The script has a 30s timeout on `waitForFunction` and awaits `document.fonts.ready`. If your deck uses custom fonts from a remote CDN, preload via `<link rel="preload" as="font">` in the artifact head, or convert to base64 data URLs.

**`gh` asks to authenticate during `/ingest-github`.**
Run `gh auth login` once outside Claude Code; then all subsequent skill runs use the stored token.

**Tweaks panel's "Link pending.yaml" button does nothing.**
File System Access API requires a secure context (http/https). Run `/serve` first. For `file://`, use the panel's "Copy YAML" button instead and paste the YAML to Claude with "save tweaks".

## Uninstall

No state outside the repo folder, except:

- Chrome DevTools MCP registration lives in the repo's `.mcp.json` (project scope) — nothing is written to `~/.claude.json` unless you registered it with `-s user` yourself
- Design system registry at `design-systems/` inside the repo — deleted with the clone
- `monolith` was installed globally — remove with `brew uninstall monolith` if you don't need it elsewhere
- `pptxgenjs` / `puppeteer` are local (`node_modules/` in this repo) — just delete the repo clone

Deleting the repo folder is a clean uninstall of the project itself.
