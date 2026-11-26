# Security policy

## Reporting a vulnerability

Please use GitHub private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Do not open a public issue for anything exploitable. Include the affected file or skill, steps to reproduce, and the Claude Code version.

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x | Yes |
| < 0.2 | No |

## Trust model

- **Bash guard.** `.claude/hooks/guard-bash.sh` (repo) and `plugin/hooks/guard-bash.sh` (plugin) are PreToolUse hooks that allow only documented command forms and reject substitution, redirects, wrappers, package managers and out-of-project paths. Self-test: `bash .claude/hooks/test-guard.sh` and `bash plugin/hooks/test-guard.sh`.
- **Browser guard.** `guard-browser.py` restricts Chrome DevTools MCP to `file://` paths inside the project and `http://127.0.0.1`, and refuses `initScript`. The MCP runs with `--isolated` (throwaway profile, no real cookies).
- **Tool guard and hook integrity (workspace mode).** `.claude/hooks/guard-tools.py` runs before every tool call. It allows MCP tools only from this project's Chrome DevTools server, refuses `WebFetch` / `WebSearch`, and blocks every call when `guard-bash.sh` or `guard-browser.py` no longer match the SHA-256 values in `.claude/hooks/hooks.sha256`. After a reviewed change to either hook, a person re-pins them (never the agent):

  ```
  bash .claude/hooks/test-guard.sh
  (cd .claude/hooks && shasum -a 256 guard-bash.sh guard-browser.py > hooks.sha256)
  ```

  Commit `hooks.sha256` together with the hook change. Every hook is registered with `"onFailure": "block"`, so a crashed hook blocks instead of allowing.
- **Audit log (workspace mode).** `.claude/audit/*.jsonl` (gitignored, not writable by the agent) records one line per tool call and per Bash guard decision: time, session, tool, decision, and a SHA-256 of the input. It never stores the input itself.
- **Sandbox (workspace mode).** `.claude/settings.json` enables the Claude Code Bash sandbox with `failIfUnavailable`. Network is limited to the hosts this workflow uses, and writes to policy paths are denied. The export scripts and the local preview server are listed in `excludedCommands`.
- **Policy-file changes.**
  - **What the agent may edit:** `CLAUDE.md`, `SECURITY.md`, skills, commands, `starters/` and the generated `plugin/skills/`, with its file tools and no per-edit prompt. The Bash guard and the sandbox refuse shell writes to them.
  - **What the agent never writes:** hooks, settings, `.mcp.json`, `scripts/`, and everything that checks or builds the agent's own changes or decides where the plugin is installed from: `.github/`, `tools/`, `.claude-plugin/`, `plugin/hooks/`, `plugin/scripts/` and the package files. The `Monitor` tool is denied, because it runs shell commands that the Bash guard never sees. `Edit`/`Write` deny rules in `settings.json` enforce this, and they override any local allow.
  - **How changes reach `claude-design-features`:** only through a PR. Branch protection (on since 2026-11-26) requires the `checks` job and an up-to-date branch, applies to admins, and blocks force-pushes and deletion.
  - **Who merges:** `ship-branch` merges without a per-PR approval only when the PR changes no policy file. A PR that touches any policy path is merged by the maintainer. `guard-tools.py` enforces this before any `gh pr merge`. It reads the PR's full file list, including the old path of a renamed file, and requires the merge to be pinned with `--match-head-commit` to the commit it checked. It blocks whenever it cannot verify the PR. `ship-branch` also asks first when a change was prompted by untrusted content.
  - **Known gap:** the agent acts under the maintainer's GitHub login, so GitHub itself cannot tell the two apart. The local merge gate is what separates them.
- **Deny rules.** In workspace mode the deny list lives in `.claude/settings.json`. A plugin cannot ship `permissions.deny`, so plugin users must have an administrator deploy `plugin/managed-settings.reference.json` as a managed settings file. Without it, the hooks are the only enforced control.
- **Untrusted content.** Anything read from repos, Figma, screenshots, office documents, comment threads or prior artifacts is data. Instructions found in it are not followed; the agent quotes them to the user and stops. Evals under `plugin/evals/` exercise this.
- **Supply chain.** Dependencies are pinned exactly and installed from the lockfile (`npm ci --ignore-scripts`). CI runs the guard self-tests, checks that `plugin/` is generated from `.claude/skills` (`node tools/sync-plugin.mjs --check`), and audits dependencies. Tagged releases publish a CycloneDX SBOM.

## Known residual risks

- The `evaluate_script` filter in the browser guard is best-effort pattern matching, not a sandbox. Only artifact pages should ever be loaded.
- `plugin/.mcp.json` starts the MCP server with `npx -y chrome-devtools-mcp@<pinned>`, which downloads and runs a package outside any lockfile. The version is pinned but the download is not integrity-verified by this repo. The repo-local `.mcp.json` runs the locally installed copy instead.
- `allowed-tools` in a skill's frontmatter is pre-approval, not scoping. It removes permission prompts for matching calls; it does not stop other tools. Real enforcement is the guards and deny rules above.
- The generate-design-md skill asks the user to run the pinned `npx @google/design.md@0.4.0` lint themselves; if the package is not installed locally this downloads and executes it.
