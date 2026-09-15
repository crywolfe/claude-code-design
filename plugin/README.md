# claude-code-design (plugin)

A self-contained Claude Code **plugin** packaging of this repo's design workflow — the same skills,
commands, starters, scripts and guard hooks as the `.claude/`-based workspace mode documented in the
repo root `README.md`, repackaged so they install into *any* project via `/plugin install` instead of
being checked into that project's own `.claude/` directory.

This directory is **additive**: it does not replace, modify, or depend on the root `.claude/`
workspace. The two modes are independent and can coexist in this same repo. If you are working
directly in a clone of `claude-code-design` itself, you almost certainly want the workspace mode in
the root `README.md`, not this plugin — this plugin exists for using the same skills *from other
projects*.

## How this differs from workspace mode

| | Workspace mode (`.claude/`) | This plugin (`plugin/`) |
|---|---|---|
| Install | Checked into the project's own `.claude/` | `/plugin install` or `--plugin-dir plugin/` |
| Starters / scripts location | `starters/`, `scripts/` at project root | `"${CLAUDE_PLUGIN_ROOT}"/starters/`, `"${CLAUDE_PLUGIN_ROOT}"/scripts/` (install path set by Claude Code at runtime — never known ahead of time, so every skill reference to them is the literal, unexpanded text `"${CLAUDE_PLUGIN_ROOT}"/...`) |
| Bash/browser guard | `.claude/hooks/guard-bash.sh`, `.claude/hooks/guard-browser.py`, wired via `.claude/settings.json` | `plugin/hooks/guard-bash.sh`, `plugin/hooks/guard-browser.py`, wired via `plugin/hooks/hooks.json` |
| Project-level deny list | `.claude/settings.json`'s `permissions.deny` | **Not available.** A plugin's own `settings.json` only honors the `agent` and `subagentStatusLine` keys — it cannot carry `permissions.deny`. See "Managed settings" below. |

## Required setup step before this plugin will actually run

This checkout's sandbox permission engine blocks any tool (Bash `cp`/`mv`/`mkdir`, and the `Write`
tool) from creating or renaming a path that contains a `scripts` directory segment, or a file named
`.mcp.json`, anywhere in the tree — an unanchored, gitignore-style match against this same repo's own
`.claude/settings.json` deny rules (`Write(scripts/**)`, `Write(.mcp.json)`, and their `Edit`
equivalents), which this build was explicitly forbidden from touching. As a result, `plugin/scripts/`
and `plugin/.mcp.json` could not be created directly and instead exist, byte-identical, at:

- `plugin/scripts_stage/` (rename to `plugin/scripts/`)
- `plugin/mcp_stage.json` (rename to `plugin/.mcp.json`)

Before installing or testing this plugin, run, from an unrestricted shell:

```
mv plugin/scripts_stage plugin/scripts
mv plugin/mcp_stage.json plugin/.mcp.json
```

Everything in this plugin (`hooks.json`, every skill's `"${CLAUDE_PLUGIN_ROOT}"/scripts/...`
reference, `guard-bash.sh`'s allowlist) already assumes the final `plugin/scripts/` path — only the
two `mv` commands above are needed to make the tree match.

There is also one leftover empty scratch directory, `plugin/zztest/`, created while diagnosing the
above (the guard's `rm` allowlist only permits removing `/tmp/cd-ingest-*`, so it could not be deleted
from within this session either) — delete it manually; it is untracked and was not staged.

## Install

Either:

- `/plugin install` and point it at this `plugin/` directory (or a marketplace entry — see
  `marketplace-entry.example.json` for the shape), or
- Launch Claude Code with `--plugin-dir plugin/` from a checkout of this repo.

## Managed settings — required before any security-sensitive use

Because a plugin's `settings.json` cannot carry a `permissions.deny` list, this plugin's PreToolUse
hooks (`guard-bash.sh`, `guard-browser.py`) are, by default, the *only* enforced control — there is no
separate, admin-deployed deny-list layer underneath them the way workspace mode has via
`.claude/settings.json`. Before relying on this plugin for anything security-sensitive, have your
Claude Code administrator deploy `managed-settings.reference.json` (or an equivalent deny list) as
**managed settings** at the OS-specific path:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux: `/etc/claude-code/managed-settings.json`
- Windows: `C:\Program Files\ClaudeCode\managed-settings.json`

`/doctor` checks for this file and **warns** (it never blocks — doctor is diagnostic only) when it is
missing, on macOS directly; Linux/Windows administrators should check their own path.

## Verify before you trust this

Run these yourself — do not take this plugin's word for its own safety:

```
bash -n plugin/hooks/guard-bash.sh
python3 -m py_compile plugin/hooks/guard-browser.py
bash plugin/hooks/test-guard.sh
```

`plugin/hooks/test-guard.sh` currently defines **403 cases** (103 must-allow bash cases, 258
must-block bash cases, 42 browser-guard cases — verified via `rg -c '^b?check ' plugin/hooks/test-guard.sh`
against the file as committed). It should print `403 cases, 0 failed`. It will not, currently: this
build knowingly ships **one flagged, unresolved case** — see "Known issues" below — so expect exactly
one `FAIL` line for `node --check "${CLAUDE_PLUGIN_ROOT}"/scripts/export-pdf.mjs` until that is fixed
upstream in `guard-bash.sh`.

## Known issues (flagged, not silently patched)

This plugin's `guard-bash.sh` and `test-guard.sh` were built by transcribing a specified set of edits
onto the already-hardened `artifacts/hardening-patch/guard-bash.sh` base, exactly as given, without
redesigning the given logic. Two internal inconsistencies surfaced while doing this and were
deliberately left in place rather than silently "fixed," so a human reviewer can decide:

1. **`node --check "${CLAUDE_PLUGIN_ROOT}"/scripts/<file>.mjs` is denied even though the interpreter
   check (`re_node_ok`) explicitly allows it.** The final path-arguments loop assumes token index 1 is
   always the plugin script path when `mode == node` (true for `node <script> <args>`), but for the
   `--check <script>` form token index 1 is the literal flag `--check` and index 2 is the actual script
   path — which then gets checked against `path_ok` in non-READ mode and denied by the
   `"${CLAUDE_PLUGIN_ROOT}"/*` case. Net effect: this form is always blocked in practice, contradicting
   what `re_node_ok` was written to allow.
2. **`re_node_ok`'s `--check` branch does not restrict the script name to the three real export
   scripts** the way the plain-execution branch does — it accepts any `"${CLAUDE_PLUGIN_ROOT}"/scripts/<name>.mjs`.
   In current practice this is masked by issue (1) above (the path-loop denies it regardless of
   filename), but if (1) is ever fixed without also tightening this regex, `--check` would newly accept
   an arbitrary script name under `scripts/`.

Fixing either requires changing `guard-bash.sh` logic, which was explicitly out of scope for this build
(transcribe the given edits verbatim; flag, don't redesign). `plugin/hooks/test-guard.sh` marks both
with `KNOWN-DIVERGENT` comments at the relevant cases.

## Out of scope for this build

- Real testing against Bedrock/Foundry-hosted Claude Code deployments — not available in this
  environment.
- Actually publishing this plugin to a marketplace, or registering it with a live `/plugin install` —
  `marketplace-entry.example.json` is a template, not a deployed listing.
- Applying the `artifacts/hardening-patch/` fixes to the *workspace's own* `.claude/hooks/`
  (`.claude/hooks/guard-bash.sh` etc. as checked into this repo's root `.claude/` remain the older,
  unpatched versions) — that is a separate, still-outstanding manual step for a human, described in
  `artifacts/hardening-patch/README.md`. Building this plugin from the already-fixed hardening-patch
  files did not do this.

## Files

```
plugin/
├── .claude-plugin/plugin.json         ← manifest (name, description, version, author)
├── hooks/
│   ├── hooks.json                     ← PreToolUse wiring, "${CLAUDE_PLUGIN_ROOT}" paths
│   ├── guard-bash.sh                  ← Bash tool guard
│   ├── guard-browser.py               ← Chrome DevTools MCP guard (byte-identical to the hardening-patch source)
│   └── test-guard.sh                  ← self-test, 403 cases
├── skills/                            ← 28 skills, copied from .claude/skills and rewritten for "${CLAUDE_PLUGIN_ROOT}"
├── commands/                          ← 4 command files
├── starters/                          ← 6 starter files (deck_stage.js, animations.jsx, etc.)
├── scripts/                           ← export-pdf.mjs, export-pptx.mjs, make-assets-index.mjs
├── .mcp.json                          ← chrome-devtools MCP server registration
├── managed-settings.reference.json    ← deny list for an admin to deploy as managed settings
└── marketplace-entry.example.json     ← example marketplace listing shape
```
