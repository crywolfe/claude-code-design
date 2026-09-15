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

## Setup-step history (resolved)

`plugin/scripts/` and `plugin/.mcp.json` now exist at their final paths and are what everything in
this plugin (`hooks.json`, every skill's `"${CLAUDE_PLUGIN_ROOT}"/scripts/...` reference,
`guard-bash.sh`'s allowlist) assumed all along. They could not be created directly by any Claude Code
tool during this build: the checkout's permission engine blocks Bash `cp`/`mv`/`mkdir` and the `Write`
tool from creating or renaming any path containing a `scripts` directory segment, or a file named
`.mcp.json`, anywhere in the tree — an unanchored, gitignore-style match against this same repo's own
`.claude/settings.json` deny rules (`Write(scripts/**)`, `Write(.mcp.json)`, and their `Edit`
equivalents), which this build was explicitly forbidden from touching. The content was staged
byte-identical at `plugin/scripts_stage/` and `plugin/mcp_stage.json`, and a human then ran, from an
unrestricted shell outside Claude Code's tool permissions:

```
mv plugin/scripts_stage plugin/scripts
mv plugin/mcp_stage.json plugin/.mcp.json
```

which is reflected in the current tree.

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

`plugin/hooks/test-guard.sh` currently defines **408 cases** (103 must-allow bash cases, 263
must-block bash cases, 42 browser-guard cases — verified via `rg -c '^b?check ' plugin/hooks/test-guard.sh`
against the file as committed). It should print `408 cases, 0 failed` — confirmed against this build's
final `plugin/scripts/` and `plugin/.mcp.json` layout.

## Critical bypass found by adversarial review, fixed (2026-09-15)

An Opus-tier adversarial review of `guard-bash.sh` after this build landed found a critical bug,
**not introduced by this build** — it was inherited unchanged from the already-hardened
`artifacts/hardening-patch/guard-bash.sh` base this plugin's guard was built from, and is also
present, unfixed, in the still-unapplied `.claude/hooks/guard-bash.sh` that protects this repo's
own workspace mode today.

`cmd="${cmd//\\/}"` blanket-stripped every backslash from the command string before the
quote-tracking segment splitter ran. Bash treats an unquoted `\"` as a literal `"` character that
does **not** open a quoted region — but erasing the backslash made the guard's own quote-tracking
believe a quoted region *had* opened. Every real `;`/`&`/`|` separator after that point, and every
command they introduced, was then hidden inside what the guard mis-saw as one harmless quoted
segment. Concretely:

```
echo \"; cp artifacts/payload ~/Library/LaunchAgents/evil.plist ; echo \"
```

traced, in the guard, as a single allowed `echo`-led segment (mode selection only inspects the
parsed first word, which is `echo`, so `path_ok` never ran on the `cp` destination) — while bash
actually executed all three real commands, including the unchecked `cp` to an arbitrary path
outside the project. The same mechanism defeats every `first`-keyed protection in the file,
including the checks meant to stop a `cp`/`mv` from overwriting the guard or its own hooks.

**Fix:** the backslash-strip is now narrow — only a backslash immediately followed by a letter, at
the start of the command or right after whitespace/`;`/`&`/`|`/`(`/`)`, is stripped (the documented
`\curl`/`\rm` shell-alias-bypass normalisation this line originally existed for). Any other
backslash anywhere in the command — in particular one right before a quote character — is now an
outright deny instead of being silently dropped. Five new self-test cases cover it (the exact
proof-of-concept above, a read-exfiltration variant, an attempt to overwrite the guard itself, and
a lone-backslash fail-closed check, plus one `allow` case confirming the narrow `\curl` form still
works). The same fix was applied to `artifacts/hardening-patch/guard-bash.sh` — **applying that
patch to `.claude/hooks/guard-bash.sh` is now urgent, not just outstanding**, since the live guard
has the identical bug today.

## Known issues (flagged, not silently patched, then fixed)

This plugin's `guard-bash.sh` and `test-guard.sh` were built by transcribing a specified set of edits
onto the already-hardened `artifacts/hardening-patch/guard-bash.sh` base, exactly as given, without
redesigning the given logic. Two internal inconsistencies surfaced while doing this and were initially
left in place, flagged rather than silently "fixed," for a human reviewer to decide:

1. `node --check "${CLAUDE_PLUGIN_ROOT}"/scripts/<file>.mjs` was denied even though the interpreter
   check (`re_node_ok`) explicitly allowed it. The final path-arguments loop assumes token index 1 is
   always the plugin script path when `mode == node` (true for `node <script> <args>`), but for the
   `--check <script>` form token index 1 is the literal flag `--check` and index 2 is the actual script
   path — which then got checked against `path_ok` in non-READ mode and denied by the
   `"${CLAUDE_PLUGIN_ROOT}"/*` case.
2. `re_node_ok`'s `--check` branch did not restrict the script name to the three real export scripts
   the way the plain-execution branch does — it accepted any `"${CLAUDE_PLUGIN_ROOT}"/scripts/<name>.mjs`.

Resolution: rather than adding token-offset-tracking logic to support a form nothing in the documented
skill workflow actually uses, `--check` support was dropped from `re_node_ok` entirely. `node --check
...` is now simply denied, same as any other unsupported `node` flag. `plugin/hooks/test-guard.sh`'s
corresponding case was flipped from `allow` to `block` and the `KNOWN-DIVERGENT` comments were removed.

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
│   └── test-guard.sh                  ← self-test, 408 cases
├── skills/                            ← 28 skills, copied from .claude/skills and rewritten for "${CLAUDE_PLUGIN_ROOT}"
├── commands/                          ← 4 command files
├── starters/                          ← 6 starter files (deck_stage.js, animations.jsx, etc.)
├── scripts/                           ← export-pdf.mjs, export-pptx.mjs, make-assets-index.mjs
├── .mcp.json                          ← chrome-devtools MCP server registration
├── managed-settings.reference.json    ← deny list for an admin to deploy as managed settings
└── marketplace-entry.example.json     ← example marketplace listing shape
```
