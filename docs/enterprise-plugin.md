# Enterprise plugin roadmap

Status: **proposal, not implemented.** Today this repo is a workspace (a project folder with
`.claude/skills`, `.claude/commands`, `.claude/settings.json`, `.claude/hooks` and `.mcp.json`).
This document describes what it would take to ship the same capability as a Claude Code
**plugin** for an enterprise client that

- runs Claude Code against its own inference endpoint (Microsoft Foundry, Amazon Bedrock,
  Google Cloud, or an internal LLM gateway), and
- cannot use Claude Desktop or the claude.ai web app.

The second constraint is already met: this workspace runs in the **Claude Code CLI** and has
never depended on Claude Desktop. The features that do touch claude.ai are listed below and
degrade to "unavailable" rather than breaking the rest.

Facts marked *(docs)* were checked against the Claude Code documentation by a
documentation-lookup agent on 2026-09-08, with a second pass on 2026-09-11 that resolved most
of the items previously marked *(verify)*. Two *(verify)* notes remain: the bypass-mode
behaviour of deny rules and hook denies in §3, which the agent could only source from search
snippets, and the plugin-cache carve-out in §3, which depends on the client's environment.
Documentation URLs are at the end.

---

## 1. What changes between a workspace and a plugin

| Concern | Workspace (today) | Plugin (proposed) |
|---|---|---|
| Distribution | Clone or "Use this template" | `/plugin install` from a marketplace, `--plugin-dir <path>` for local testing, `--plugin-url` for a remote zip *(docs)* |
| Manifest | none | `.claude-plugin/plugin.json` at the plugin root; required fields `name`, `description`; optional `version`, `author`, `homepage`, `repository`, `license` *(docs)* |
| Skills, commands | `.claude/skills/*`, `.claude/commands/*` | `skills/`, `commands/` at the plugin root, **outside** `.claude-plugin/` *(docs)* |
| Hooks | registered in `.claude/settings.json`, scripts under `.claude/hooks/`, referenced as `"$CLAUDE_PROJECT_DIR"/.claude/hooks/…` | `hooks/hooks.json` at the plugin root *(docs)*. A hook references its own script through `"${CLAUDE_PLUGIN_ROOT}"/hooks/guard-bash.sh`, the absolute path of the plugin's installation directory, quoted in shell-form hooks *(docs)* |
| MCP server | `.mcp.json` in the project | `.mcp.json` at the plugin root *(docs)* |
| Permission deny list | `permissions.deny` in `.claude/settings.json` | **Plugins cannot ship permission rules** *(docs)*. The deny list must be delivered another way, see §3 |
| Default settings | n/a | a plugin may ship a `settings.json`, but only the `agent` and `subagentStatusLine` keys are honoured, so it cannot carry `permissions` *(docs)* |
| CLAUDE.md policy | project `CLAUDE.md` | not a plugin component; ship it as a skill's instructions or ask the client to add it to their project or managed `CLAUDE.md` |
| Starters, export scripts | `starters/`, `scripts/*.mjs` | plugin root; the guard's `node` allowlist must be rewritten to `${CLAUDE_PLUGIN_ROOT}/scripts/…` and the self-test extended for it |

### Why the deny list matters more than it looks

The security model of this workspace is **three layers that overlap on purpose**
(drawn in `docs/architecture/security-architecture.html`):

1. `permissions.deny` in settings: cheap, evaluated by Claude Code before any hook, and
   the only layer that covers `Read`/`Write`/`Edit` (protecting the hooks themselves,
   `.mcp.json`, `scripts/`, credentials and dotfiles).
2. Two PreToolUse hooks: `guard-bash.sh` allowlists command forms per pipeline segment,
   `guard-browser.py` keeps Chrome DevTools MCP on project files and `127.0.0.1`.
3. Per-skill `allowed-tools`, plus the `CLAUDE.md` rules the model is expected to follow.

A plugin can carry layer 2 and layer 3. It cannot carry layer 1. Without layer 1 the hooks
are writable by the agent, which makes layer 2 advisory. **The plugin is therefore only
"fit for use" when the client installs layer 1 through managed settings** (§3). The
plugin's `README` and its `/doctor` skill must check for that and refuse to run the
export, ingest and browser skills until it is present.

---

## 2. Inference without Anthropic-hosted endpoints

Claude Code selects the provider with one environment flag; everything in this workspace
is provider-agnostic because it never calls the model API itself, it only runs inside
Claude Code. *(docs, all rows)*

This is the reason the workspace exists. Claude Code's built-in `/design` command and the
artifact platform it publishes to require a claude.ai session on the Anthropic API; the
docs list both as unavailable on Amazon Bedrock, Google Vertex AI, Microsoft Foundry and
Claude Platform on AWS *(docs, artifacts.md and commands.md, checked 2026-09-12)*. A client
on those endpoints has no supported path to Claude Design output from Claude Code, and this
workspace, or the plugin proposed here, is that path.

| Provider | Enable | Endpoint / region | Auth | Model names |
|---|---|---|---|---|
| Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | `ANTHROPIC_FOUNDRY_RESOURCE` or `ANTHROPIC_FOUNDRY_BASE_URL` | `ANTHROPIC_FOUNDRY_API_KEY`, Microsoft Entra ID (default Azure credential chain), or `ANTHROPIC_FOUNDRY_AUTH_TOKEN` | Must match the client's deployment names, e.g. `claude-sonnet-5`, `claude-opus-4-8`, `claude-haiku-4-5`. There is no startup check; a missing deployment fails at request time |
| Amazon Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | `AWS_REGION` (falls back to `us-east-1`) | AWS default credential chain, `--profile`, `AWS_BEARER_TOKEN_BEDROCK`, or an `awsAuthRefresh` command in settings | Inference-profile ids such as `us.anthropic.claude-opus-5` |
| Google Cloud (Agent Platform, formerly Vertex AI) | `CLAUDE_CODE_USE_VERTEX=1` | `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_PROJECT_ID` | Application Default Credentials, `GOOGLE_APPLICATION_CREDENTIALS`, or a `gcpAuthRefresh` command in settings | `claude-opus-5`, `claude-sonnet-4-5@20250929`, … |
| LLM gateway / proxy | provider flag as above | `ANTHROPIC_BASE_URL`, or per-provider `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_FOUNDRY_BASE_URL` | whatever the gateway requires | as the underlying provider |

Pin models with `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`,
`ANTHROPIC_DEFAULT_HAIKU_MODEL` *(docs)*.

### What is unavailable on third-party providers *(docs)*

| Feature | Used by this workspace? | Effect |
|---|---|---|
| Artifact tool (`/publish`, comments, replies) | yes, `publish` skill | skill reports "unavailable on this provider" and stops; sharing falls back to `/export-standalone` and the client's own hosting |
| DesignSync (`/sync-design-system`) | yes, `sync-design-system` skill | unavailable; the design-system registry under `design-systems/` keeps working locally |
| WebSearch, fast mode, Advisor, Channels, analytics dashboard, server-managed settings, `/import` | no | none |
| Remote Control (gateway only) | no | none |

Everything else in the workspace, including Chrome DevTools MCP, exports, ingest, snapshots
and handoff, is local tooling and does not depend on the provider.

Telemetry is off by default on Bedrock, Vertex and Foundry; `DISABLE_TELEMETRY` turns it off
elsewhere *(docs)*. Data retention on third-party providers follows the cloud provider's
agreement, not Anthropic's *(docs)*.

---

## 3. Delivering the controls a plugin cannot carry

**Managed settings** are the enterprise mechanism. Paths *(docs)*:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux: `/etc/claude-code/managed-settings.json`
- Windows: `C:\Program Files\ClaudeCode\managed-settings.json`

Precedence is managed → user (`~/.claude/settings.json`) → project (`.claude/settings.json`)
→ `--settings` flag, and managed settings can force hooks, restrict MCP servers and set
`permissions` *(docs)*. Deny rules, and hooks that return a deny decision, are reported to
block the tool in every permission mode, including `bypassPermissions` and
`--dangerously-skip-permissions` *(verify: this comes from search snippets only; confirm it
on the permission-modes page, section "Skip all checks with bypassPermissions mode", before
an auditor relies on it)*. Managed settings can also disable that mode outright with
`permissions.disableBypassPermissionsMode`, listed in the settings reference as "Prevent
anyone from entering bypassPermissions mode" *(docs; the reference does not state the value
type, so confirm the accepted value in the client's Claude Code version)*.

Proposed split:

| Control | Where it lives in the plugin model |
|---|---|
| `permissions.deny` (network tools, package managers, credential paths, protected files) | managed settings, maintained by the client's platform team; the plugin ships a reference copy and `/doctor` diffs against it |
| `guard-bash.sh`, `guard-browser.py` | plugin `hooks/hooks.json`; a managed-settings hook entry can additionally force them so a project cannot omit them *(docs: managed settings can force hooks)* |
| `.mcp.json` with pinned `chrome-devtools-mcp` and `--isolated` | plugin; managed settings restrict which MCP servers may run |
| `CLAUDE.md` rules (ask before ingest, untrusted content, browser scope) | client's managed or project `CLAUDE.md`, copied from the plugin |
| Self-test (`test-guard.sh`) | plugin; run by `/doctor` and in the client's CI |

Open item: the workspace's deny list currently includes `Read(~/.claude/**)`, which also
blocks reading plugin caches under `~/.claude/plugins/`. A plugin version of the deny list
must carve out the plugin's own root or the plugin cannot read its own skills. *(verify
against the client's plugin cache location.)*

---

## 4. Supply chain and egress inventory

An auditor will ask what leaves the machine. Complete list for this workspace:

| Destination | Initiated by | Gate | Required? |
|---|---|---|---|
| Inference endpoint (Anthropic API, Foundry, Bedrock, Vertex, or gateway) | Claude Code itself, every turn | provider env flags; not visible to hooks | yes |
| npm registry | `npx chrome-devtools-mcp@1.9.0` on every MCP start, per `.mcp.json` | version pinned; **no integrity hash**; the client should vendor the package or point npm at an internal registry | yes, for preview |
| Chrome / Chromium | the MCP launches Chrome with `--isolated`; Chrome's own background traffic is not controlled by this repo | none from this repo | yes, for preview |
| github.com | `gh repo clone` in `ingest-github`, after an explicit yes | guard-bash allows only `repo clone`, `repo fork`, `auth status`, `pr`, `issue`; `gh api` denied | optional |
| api.figma.com | `curl` GET in `ingest-figma`, after an explicit yes | guard-bash allows one `https://api.figma.com/` URL, GET, `-o` under `artifacts/ingested/` | optional |
| fonts.googleapis.com, fonts.gstatic.com | artifact pages and export scripts | script hosts limited to unpkg + Google Fonts in the export scripts | optional (fonts fall back) |
| unpkg.com | React/Babel artifacts, pinned with SRI hashes | export scripts refuse other hosts | optional |
| cdn.jsdelivr.net | published copies only (`/publish` rewrites unpkg → jsdelivr, same hashes) | n/a on third-party providers | optional |
| claude.ai | `/publish`, comments, `/sync-design-system` | user asks each time; unavailable on third-party providers | optional |
| puppeteer's Chromium download | `npm install -D puppeteer` at install time, run by the user, never the agent | user's shell | optional (PDF export) |

No other outbound call exists in the committed skills. `wget`, `nc`, `ssh`, `scp`, `rsync`,
`npx`, `npm`, `brew`, `pip` are denied by settings and by the guard.

---

## 5. What an auditor should run

1. `bash .claude/hooks/test-guard.sh` and confirm **0 failed**. The committed suite has 287
   cases; the pending patch under `artifacts/hardening-patch/` raises it to 384 once applied.
2. `git diff --no-index` the two hooks against the plugin's reference copy (a plugin must
   ship a checksum file for this).
3. Confirm `.claude/settings.json` (or managed settings) contains the deny list, and that
   `Write`/`Edit` on `.claude/hooks/**`, `settings*.json`, `.mcp.json`, `scripts/**` is denied.
4. Confirm `.mcp.json` pins `chrome-devtools-mcp@1.9.0` with `--isolated`.
5. Read the findings register in `docs/architecture/security-architecture.html`: G-01 to
   G-09 are reviewer-confirmed gaps in the committed guard with a patch pending; R-01 to
   R-05 are accepted residual risks. A deployment should not go live before the patch is
   applied and the self-test passes at 384.

---

## 6. Work plan

1. Apply and test the hardening patch on the workspace (user's shell; see
   `artifacts/hardening-patch/README.md`). Nothing below should start before this.
2. Restructure into plugin layout: move `.claude/skills` → `skills/`, `.claude/commands` →
   `commands/`, hooks → `hooks/` with `hooks/hooks.json`, add `.claude-plugin/plugin.json`.
   Reference hook scripts as `"${CLAUDE_PLUGIN_ROOT}"/hooks/…` and update `guard-bash.sh`'s
   `node` and `python3` allowlists to the new paths, with self-test cases for each.
3. Write `managed-settings.reference.json` (the deny list) and teach `/doctor` to diff the
   effective settings against it and refuse to proceed on mismatch.
4. Make `publish` and `sync-design-system` detect an unavailable Artifact/DesignSync tool and
   stop with a clear message instead of failing mid-flow.
5. Vendor or mirror `chrome-devtools-mcp@1.9.0` for clients without npm registry egress.
6. Test on one Foundry deployment and one Bedrock inference profile; record the exact
   env-var set used in this document.
7. Publish to a private marketplace. Pin the release in the marketplace entry (`version`, or
   `ref` plus `sha` for a git source; `sha` is the effective pin) and install it with managed
   scope, which administrators set through managed settings and users cannot change *(docs)*.

---

## Documentation checked (2026-09-08, second pass 2026-09-11, `/design` check 2026-09-12)

- https://code.claude.com/docs/en/artifacts.md (`/design` canvas; provider and login requirements)
- https://code.claude.com/docs/en/commands.md (`/design` unavailable on Bedrock, Vertex AI, Foundry, Claude Platform on AWS)
- https://code.claude.com/docs/en/plugins.md
- https://code.claude.com/docs/en/plugins-reference.md (`${CLAUDE_PLUGIN_ROOT}`)
- https://code.claude.com/docs/en/plugin-marketplaces.md (`version`, `ref`, `sha` pinning)
- https://code.claude.com/docs/en/discover-plugins.md (managed scope)
- https://code.claude.com/docs/en/admin-setup.md (Windows managed-settings path)
- https://code.claude.com/docs/en/settings-reference.md (`permissions.disableBypassPermissionsMode`)
- https://code.claude.com/docs/en/permission-modes.md (bypass-mode behaviour of deny rules and hook denies; not yet confirmed on the page)
- https://code.claude.com/docs/en/microsoft-foundry.md
- https://code.claude.com/docs/en/amazon-bedrock.md
- https://code.claude.com/docs/en/google-vertex-ai.md
- https://code.claude.com/docs/en/third-party-integrations.md
- https://code.claude.com/docs/en/feature-availability.md
- https://code.claude.com/docs/en/managed-settings.md
- https://code.claude.com/docs/en/hooks.md (full PreToolUse schema and exit codes not re-checked)
