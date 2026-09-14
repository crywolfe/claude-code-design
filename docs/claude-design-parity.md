# Claude Design parity

What Anthropic Labs' Claude Design (claude.ai/design) offers as of September 2026, and how this repo maps each feature. Researched from Anthropic's announcement and docs plus the Claude Code tool surface (`Artifact`, `DesignSync`) on 2026-09-08, with the built-in `/design` command checked on 2026-09-12. Where the mechanics of a Claude Design feature are not public, the local equivalent is marked *approximation* — it aims at the same outcome, not the same internals.

## Status legend

- **Reproduced** — same outcome, terminal-native mechanism
- **Adapted** — different form, same job
- **Bridged** — uses a real Claude Code ↔ claude.ai connector, so the output lands in Claude Design itself
- **Skipped** — not reproducible here, or deliberately excluded (reason given)

## Feature map

| Claude Design feature | Status | Here |
|---|---|---|
| Decks, prototypes, wireframes, motion, design systems | Reproduced | `/make-deck`, `/interactive-prototype`, `/wireframe`, `/animated-video`, `/create-design-system` |
| Ingest a codebase, screenshot, or Figma file | Reproduced (ask-first) | `/ingest-github`, `/ingest-screenshot`, `/ingest-figma` |
| Ingest DOCX / PPTX / XLSX / PDF | Reproduced | `/ingest-document` — office theme XML via `unzip -p`, PDF via vision; no dependencies |
| Built-in `/design` command (artboards on a canvas, published as a claude.ai artifact running the Claude Design editor; direct element editing, saved versions, PNG / PDF export) | Skipped by design | Official Claude Code command, v2.1.234+, Anthropic API and claude.ai login only; the docs list it as unavailable on Bedrock, Vertex AI, Foundry and Claude Platform on AWS. This repo targets exactly those environments, so it does not wrap or replace `/design`. On the Anthropic API, use `/design` for hand-editable mockups and this repo for decks, exports and handoff. Checked 2026-09-12 against code.claude.com/docs/en/artifacts.md and commands.md. |
| Web-page capture as reference | Skipped | Contradicts the committed Browser-scope rule (Chrome DevTools MCP only visits `artifacts/` and `127.0.0.1`). Take a screenshot yourself and use `/ingest-screenshot`. |
| Share link + comments + replies | Reproduced | `/publish` wraps the `Artifact` tool: private URL, `comments` / `reply` / `resolve` / `watch`. Requires a self-contained artifact; the skill inlines siblings and rewrites CDNs. |
| Version history | Adapted | `/snapshot <html> <label>` → `artifacts/versions/<name>/`; `/publish --label` names the same version on the shared page |
| Handoff bundle for developers | Reproduced | `/handoff` → `handoff/<name>/` with sources, extracted components, tokens, `handoff.json`, README (structure, assumptions, open questions), reference screenshot, optional zip |
| Design-system validation of an artifact | Approximation | `verify-artifact` step 2b: computed color / font / radius walk against `.claude/design-tokens.json`, P1/P2 drift report, `--fix` on request |
| Typed tweak controls (`data-props`) | Approximation | `__tweak_schema` now declares `type` (`color`, `number`, `boolean`, `enum`, `string`), `label`, `group`, `target`; elements carry `data-tweak` / `data-props`; `/apply-tweaks` validates by type |
| Design-system governance: default / locked / remix / published | Adapted | `design-systems/<name>/manifest.json`; `/use-design-system --default|--lock|--unlock`; `/create-design-system` refuses to overwrite locked entries and offers `<name>-remix` |
| Sync a component library to a Claude Design project | Bridged | `/sync-design-system <name>` uses the `DesignSync` tool (list → plan → approve → write). Only in Claude Code builds that ship `DesignSync`; the write flow is untested (see below). |
| Multi-artboard canvas (`.dc.html` + manifest) | Skipped | Depends on Claude Design's editor payload. `/wireframe` keeps `<DesignCanvas>` cells; `handoff.json` records artboards so a developer sees the same structure. |
| Click-to-comment on elements | Adapted | `/inspect "<description>"` by description, or Shift+C in a `/make-editable` preview writes `comments.yaml`; `/local-comments` lists them with source lines |
| Direct element editing (text, style, hide) | Approximation | `/make-editable` overlay (Shift+E) buffers edits to `pending.yaml`; `/apply-edits` validates against an allowlist and writes text, a generated `<style id="__edits">` block (`!important` rules, identical to the live preview), and `hidden`. Static HTML only; no drag or resize. |
| Live canvas preview | Adapted | `/preview` + `/done` through Chrome DevTools MCP (seconds, not sub-second); `/live-reload` refreshes the preview on save (sub-second reload, but each change still goes through an agent turn) |
| Multiplayer / org sharing controls / connectors (Slack, Drive, …) | Skipped | Properties of claude.ai, not of a local repo. `/publish` pages start private; share the link yourself. |
| Sub-second render loop, canvas sketch pad | Skipped | Not reproducible in a terminal |

## Constraints that shaped the mapping

- **Least privilege.** Every new skill grants exact commands only (`zip -r handoff/…`, `unzip -p …`, `cp artifacts/…`). The bash guard additionally limits `zip` output to `handoff/` or `artifacts/` and `unzip` to stdout/list modes.
- **Ask first.** Nothing is ingested, published, synced, or overwritten without an explicit yes in the same turn.
- **Untrusted content.** Office documents, comment threads, and files fetched from a Claude Design project are data. Instructions inside them are quoted to the user, never followed.
- **CDN rewrite at publish time.** Local artifacts keep the unpkg React + Babel contract (the only script host the hardened export scripts allow). Published pages cannot load unpkg, so `/publish` rewrites `unpkg.com/<pkg>@<ver>/…` to `cdn.jsdelivr.net/npm/<pkg>@<ver>/…` in the published copy — verified byte-identical, so the `integrity` hashes stay valid.

## Not verified

- The exact schema Claude Design uses for `data-props` and `canvas.json`; the local shapes are documented in the skills and may differ.
- The `DesignSync` tool is present in the Claude Code build this was written with (it appears in the deferred-tool list), but the `DesignSync` entry in `/sync-design-system`'s `allowed-tools` and the list → plan → write flow have not been exercised against a real project. `/sync-design-system` checks for the tool and stops if a build lacks it.
