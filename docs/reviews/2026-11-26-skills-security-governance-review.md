# Security & governance review: claude-code-design agent skills (follow-up)

**Date:** 2026-11-26 · **Revision reviewed:** `46af4f1` on `claude-design-features` (clean tree)
**Previous review:** [`2026-11-21-skills-security-governance-review.md`](2026-11-21-skills-security-governance-review.md) at `a4e9912`
**Reviewer:** Claude (Opus 5.5), static review plus the session's own tool calls against the live guards.

## 0. Scope, method, caveats

The brief said the skills would be attached, but none were. As on 2026-11-21, this review covers the skill set in this repository: the 29 skills under `.claude/skills/`, the 4 commands, the three guard hooks, `settings.json`, the maintainer's `settings.local.json`, `.mcp.json`, `scripts/`, `.github/`, and the `plugin/` distribution. It stands on its own. Each item says whether it is **new**, **carried forward**, or a **regression** compared with 2026-11-21.

**What changed between the two reviews.** `git diff --stat a4e9912..HEAD`: 76 files, +5526/−679. PRs #8–#9 put most of the 11-21 fixes in place. PRs #10–#13 then loosened control at the maintainer's request (§2).

**Evidence labels**
- **[src]**: read in the source at `46af4f1`.
- **[live]**: observed this session from the guards' actual decisions.
- **[env]**: true of the environment this review ran in, not of the repo.
- **[recall]**: Claude Code or GitHub behaviour stated from memory, because WebFetch is denied in this project. Check it before relying on it.
- **[unverified]**: plausible from reading, not confirmed.

**What was checked live**
- `bash .claude/hooks/test-guard.sh` exited 0. The script exits with its failure flag (`exit $fail`, L638–640), so exit 0 means no case failed. The summary line itself could not be read back: the output was 30 KB and the tool-results folder is read-denied.
- `cd artifacts && pwd` was **blocked** by the guard. The `cd <project> && …` prefixes on this session's first calls ran only because they named the current directory, which the harness appears to drop. This is not a bypass.
- `sed`, pipes into `tail`, and any path under `~/.claude` were all blocked, as designed.

**Citations.** These are cited by ID only where the ID is well established:
- NIST AI RMF 1.0 subcategories
- SP 800-218 SSDF practices
- SP 800-53 Rev. 5 controls
- CSF 2.0 categories
- ISO/IEC 42001 clauses and Annex A topics
- ISO/IEC 23894 clauses, which follow the ISO 31000 structure
- ISO/IEC 27001:2022 Annex A controls

These are cited **by topic only**:
- NIST AI 600-1 (by its risk-area names)
- SP 800-218A's AI additions
- ISO/IEC 27090
- NIST's COSAiS overlays (the brief's "COSIS")
- the Cyber AI Profile

No clause numbers were invented. Model-training items (weight integrity, training-data protection, membership inference) do not apply: these skills neither train nor host models.

**Files read in full vs. skimmed.**
- **Read in full:** ship-branch, publish, sync-design-system, all four ingest skills, apply-edits, apply-tweaks, make-editable, local-comments, doctor, use-design-system, create-design-system, handoff, export-standalone, export-pdf, live-reload, inspect, snapshot, and the four commands.
- **Skimmed** (frontmatter plus a keyword sweep): make-deck, interactive-prototype, wireframe, copy-example, verify-artifact, make-tweakable, register-asset, export-pptx, and the first half of animated-video. Its second half (Remotion, Popmotion) was read in full.
- **Carried forward, not re-checked this session:** the 13 `npm audit` highs and the "no valid eval run" status both come from the 11-21 table.

---

## 1. Summary verdict for the whole set

**Overall: Weak.** On 11-21 the verdict was Critical gaps. **Change control is a Critical-gap area** (see N-01, N-02).

On 2026-11-26 the user ran `gh api repos/crywolfe/claude-code-design/branches/claude-design-features/protection` and got `404 Branch not protected` [live].

**Update, same day: branch protection is now on** [live, from the PUT response].
- A PR is required.
- The `checks` status must pass, pinned to the GitHub Actions app (`app_id` 15368), so another app cannot post a passing status in its place.
- The branch must be up to date before merging (`strict`).
- The rules apply to administrators too (`enforce_admins`).
- Force-pushes and deletion are blocked.

This closes N-02 and stops merges on red CI. **Critical still applies to N-01**: required approvals are 0, and the agent can still edit `security.yml` in the PR that the check validates. The verdict stays **Weak** until action 2 is done.

**What improved, and is good.**
- The 11-21 enforcement bypasses are closed:
  - The Bash sandbox is on, with `failIfUnavailable`.
  - Reader commands that write or execute are refused.
  - Every hook has `onFailure: block`.
  - `curl -L` together with `-H` is refused.
- `guard-tools.py` gives an MCP allowlist and a web-tool deny.
- Deterministic validators exist: `validate-pending.mjs` and `prepare-publish.mjs`, with its secret and PII scan.
- Provenance hashes are recorded for ingest-github and sync.
- Ingest skills use `disallowed-tools`.
- There is CI and a CODEOWNERS file.

Taken together, this is better mechanical enforcement than most agent skill sets have. It maps to SSDF PW.7, PW.8 and PW.9, and to 800-53 CM-7, SI-10 and SI-17.

**What dominates the verdict.** Between 11-24 and 11-26, four PRs removed every human checkpoint on the path from an agent edit to the default branch:
1. The agent can edit, without prompting, the skills and CLAUDE.md that govern it. It can also edit the **CI workflow, the plugin sync checker, the shipped plugin hooks and the package manifests**.
2. It can push and merge outside the sandbox.
3. `ship-branch` merges on green CI.

That CI is defined by files the same PR can change, so a green check is self-attested. The only remaining stop is the model's own judgement of whether "untrusted content prompted the change", and that judgement is exactly what a prompt injection targets.

This conflicts with:
- separation of policy and enforcement from model reasoning (COSAiS, topic)
- 800-53 CM-3, CM-5, AC-5 and SA-10
- SSDF PS.1 and PO.3
- 27001 A.5.3 and A.8.32
- the human-oversight expectations of AI RMF MAP 3.5 and 42001

The same agent's edits then reach every marketplace user of `plugin/` (AI 600-1 *Value Chain & Component Integration*).

---

## 2. Control relaxations since 11-21 (PRs #10–#13)

| PR | Change | Effect |
|---|---|---|
| #10 `2055d52` | Removed `ask` for `git push`, `gh pr create`, `gh pr merge` | The maintainer's `settings.local.json` now allows them, and runs them **outside the sandbox** (`excludedCommands: "git push origin *"`, `"gh pr merge *"`, `"gh issue create *"`) |
| #11 `48969d6` | Removed `ask` for edits to `CLAUDE.md`, skills, commands, `starters/`, `plugin/`, `tools/`, `.github/`, package files | `settings.local.json` `allow` has `Edit(.github/**)`, `Edit(tools/**)`, `Edit(plugin/**)`, `Edit(package.json)`, `Edit(package-lock.json)` [src] |
| #12 `c8b65fb` | ship-branch fast-forwards the local checkout | Low risk by itself. The guard allows only the exact forms |
| #13 `bfdd258` | ship-branch merges on green CI without asking | The per-PR human approval is gone. It asks only if the model decides that untrusted content was involved |

In addition, **this session ran in bypass-permissions mode** [env]. Any `ask` rule or `allowed-tools`-based checkpoint is void in that mode. Only hooks, `deny` rules and the sandbox still apply. Two documents still describe a prompt that no longer exists:
- `guard-bash.sh` L150 says "change these with the Edit tool (which asks)".
- SECURITY.md's trust model implies a review step that no longer exists in practice.

None of these four changes has a risk-acceptance record with an owner, a compensating control or a review date. The only trace is two "Accepted by the maintainer" rows in the 11-21 review's appendix. That is a gap against 42001 6.1.3 (risk treatment), 23894 §6.5 and §6.7, and AI RMF GOVERN 1.4 and MANAGE 1.4.

---

## 3. Cross-cutting findings

New IDs are N-xx. Where an item continues an 11-21 finding, the old ID is given.

| ID | Finding | Evidence | Framework mapping | Priority |
|---|---|---|---|---|
| **N-01** (new; extends X-02/S-01) | **The merge gate is self-attested.** The agent may edit `.github/workflows/security.yml`, `tools/sync-plugin.mjs` (the plugin drift check), `plugin/hooks/guard-bash.sh` (the guard shipped to marketplace users; `sync-plugin.mjs` L13 says `plugin/hooks/**` is *not* generated) and `package*.json`, all without a prompt. A `pull_request` run uses the workflow file from the PR's own head [recall], so one PR can weaken the check and pass it. ship-branch then merges. CODEOWNERS cannot enforce review: with one maintainer whose `gh` login the agent uses, the PR author and the would-be approver are the same account, and GitHub does not let authors approve their own PRs [recall]. | [src] `settings.local.json` L7–16; `security.yml`; `ship-branch` step 8–9; CODEOWNERS header comment | 800-53 CM-3, CM-5, AC-5, SA-10, SA-11; SSDF PO.3, PS.1, PW.7; 27001 A.5.3, A.8.25, A.8.32; 42001 6.1.3, 8.1; AI RMF MAP 3.5, GOVERN 2.1; AI 600-1 *Value Chain* | **Critical → fix staged** (see §6) |
| **N-02** (new) | **`git push` is not constrained by refspec, force or target.** The guard blocks only URLs and `user@host` remotes (`re_git_bad`). `git push origin HEAD:claude-design-features`, `git push origin claude-design-features --force`, `git push origin --delete claude-design-features` and `git push origin --tags` (which triggers the `v*` SBOM job) all pass the guard, are pre-allowed, and run outside the sandbox under the maintainer settings. That path skips the PR and CI entirely. A force-push also rewrites the history that serves as the change record. The self-test has only allow and URL-block cases for push (`test-guard.sh` L116, L370–372). Branch protection was off (404 on 2026-11-26). **It was enabled the same day**: PR required, force-push and deletion blocked, administrators included. The server now refuses these pushes to the default branch. The guard still allows them, so they fail at GitHub instead of locally. They also remain possible against any other branch. | [src] `guard-bash.sh` L362; `settings.local.json` L25, L56; [live] 404, then the PUT response | 800-53 CM-5, AC-3, AU-9, SI-7; SSDF PS.1; 27001 A.8.32, A.8.4 | **Mitigated** (was Critical). Guard hardening (action 3) is still Medium |
| **N-03** (new) | **`gh pr merge <n>` can merge any PR in the fork, and PR content is not classed as untrusted.** The guard checks only `--repo`. The fork has merged an outside contributor's PR (#6, `82c4e14`). An injected "merge PR #N" therefore reaches a third party's code. The output of `gh pr view`, `gh pr diff` and `gh pr checks` (titles, bodies, diffs and CI logs written by others) is missing from CLAUDE.md's untrusted-content list. | [src] `guard-bash.sh` L336–349; CLAUDE.md "Untrusted content rule" | 800-53 AC-3, AC-6, SI-10; AI 600-1 *Information Security* (indirect prompt injection); 27090 (prompt injection, topic) | **High** |
| **N-04** (new) | **Taint tracking is the model judging itself.** ship-branch's only remaining human gate, and the "never publish unasked" rule, depend on the model remembering whether any part of the work was prompted by ingested content. Nothing records that mechanically. The hook input already carries `session_id`, so a hook can do it. | [src] `ship-branch` L10, L36 | COSAiS (separate policy from reasoning, topic); 800-53 AC-4, SI-10; AI RMF MEASURE 2.7, MANAGE 2.4; AI 600-1 *Information Security* | **High** |
| **N-05** (X-03, partly fixed and overstated) | **Built-in tools that leave the machine, persist, or delegate are ungated.** `guard-tools.py` filters only `mcp__*` names plus WebFetch and WebSearch. These pass with no hook check: `Artifact` (publishing, including `capabilities` and `force`), `ArtifactComments` reply, `ArtifactData` writes, `DesignSync` `finalize_plan`/`write_files`/`delete_files` to an org-visible project, `SendMessage` (to **other local Claude sessions**, which run outside this project's guards, so this is a lateral-movement path), `RemoteTrigger`, `CronCreate` (persistence), and `Agent`/`Workflow` fan-out. Whether project hooks fire inside subagents is [unverified]. The 11-21 table marks X-03 "Fixed". | [src] `guard-tools.py` L36–42 (`ALLOWED_MCP`, `DENIED_BUILTIN`) and the checks in `main()` | 800-53 AC-4, AC-6, CM-7, SC-7; CSF PR.AA, PR.PS; COSAiS (tool-calling boundaries); AI RMF MANAGE 2.4 | **High** |
| **N-06** (new) | **The publish scan can be overridden by the model and is not bound to the publish.** `--allow-findings` is a plain argument that the guard accepts. No hook ties an `Artifact` call to a file that `prepare-publish.mjs` produced or scanned. The skill's "never pass `--allow-findings` on your own" is prose. | [src] `guard-bash.sh` L231; `publish` Phase 2 | 800-53 AC-22, AC-21, SI-10; AI 600-1 *Data Privacy*; 27001 A.5.12, A.8.12 | **Medium-High** |
| **N-07** (new) | **Persistent poisoning through tokens.** Ingested values (font names, color strings, component names) are written by the model into `artifacts/ingested/*-tokens.json`, then `.claude/design-tokens.json` and `design-systems/<name>/`. Every workflow skill's Phase 0 reads `design-tokens.json` as "the project's own tokens, so no prompt is needed" (create-design-system L91). The values are emitted into `<style>`, Google Fonts `<link>` URLs, published pages and the org's Claude Design project through sync. No schema validation runs on tokens. `validate-pending.mjs` covers tweaks and edits only. A crafted `font-family` or color value carries CSS or HTML injection, or instruction text, across sessions. The path is inferred from the skill text; exploitability was not demonstrated [unverified]. | [src] make-deck L17, interactive-prototype L15, create-design-system L91, ingest-document L68 | AI 600-1 *Information Integrity*, *Information Security*; 27090 (data poisoning, topic); 800-53 SI-7, SI-10; SSDF PW.5 | **Medium-High** |
| **N-08** (new) | **Public exfiltration channels.** `gh issue create` and `gh pr create --body-file <any in-project file>` are pre-allowed and run outside the sandbox. `gh` is in READ mode for path checks, so `--body-file artifacts/ingested/figma-….json` posts private Figma or private-repo-derived data to the public fork. `git add -f` of gitignored `artifacts/` followed by push does the same. | [src] `guard-bash.sh` L388–389; `settings.local.json` L36 | 800-53 AC-4, AC-22, SC-7; AI 600-1 *Data Privacy*; 27001 A.5.14 | **Medium-High** |
| **N-09** (X-09 continued) | **Marketplace users do not get the workspace controls.** `plugin/hooks/hooks.json` registers only the Bash and chrome-devtools guards. There is no `guard-tools.py`: no MCP allowlist, no hook-level WebFetch deny, no integrity pin, no audit log. `managed-settings.reference.json` is advisory and still carries the `ask` rules the repo dropped, so the two policies differ. | [src] `plugin/hooks/hooks.json`; `plugin/managed-settings.reference.json` L114–121 | SSDF PS.2, PS.3; 800-53 SR-4, SR-11, CM-2; 42001 Annex A third-party and customer relationships; CSF GV.SC; AI 600-1 *Value Chain* | **Medium** |
| **N-10** (new) | **Browser egress and profile scope.** Chrome (MCP) runs outside the Bash sandbox. Artifact JavaScript has unrestricted network access. `click`, `fill` and `press_key` are unguarded, so a link click can leave the allowed origins. `check_url` allows **any** `127.0.0.1` port, which exposes other local services to CSRF or SSRF. `ALLOWED_MCP` admits `plugin_chrome-devtools-mcp_chrome-devtools`, a **user-level** plugin whose launch flags (including `--isolated`) this repo does not control, and that plugin is loaded in this session [env]. `/preview` also `open`s artifacts in the user's real default browser and profile. | [src] `guard-browser.py` L89–90, L167; `guard-tools.py` L36–41; `preview.md` step 3 | 800-53 SC-7, AC-4, CM-7; 27001 A.8.20, A.8.23 | **Medium** |
| **N-11** (X-06, partly fixed) | **The audit log cannot support an investigation.** It records a SHA-256 of the input only: no outcome (no PostToolUse), no skill attribution, and no plain record of outbound parameters (push refspec, PR number, Artifact URL, DesignSync planId). It has no hash chain, is local and gitignored, and has no retention, review or alerting. Nothing reads it. | [src] `guard-tools.py` `audit()` L49–59, `call_record()` L62 onward | 800-53 AU-3, AU-6, AU-9, AU-10, AU-11, SI-4; 27001 A.8.15, A.8.16; AI RMF MEASURE 2.4, MANAGE 4.1; CSF DE.CM | **Medium** |
| **N-12** (new) | **The integrity pin has no independent root of trust.** `hooks.sha256` sits beside the files it pins, with the same protection. It does not cover `guard-tools.py` (the verifier itself), `test-guard.sh` or `settings.json`. | [src] `hooks.sha256`; `guard-tools.py` L35 (`PINNED`) | 800-53 SI-7, CM-14; SSDF PS.2 | **Low-Medium** |
| **N-13** (X-07, open) | **The agent has no identity of its own.** It acts as the user on GitHub (full `gh` login), in Figma (long-lived PAT) and on claude.ai. This is now the root cause of N-01: without a separate agent identity, a human review on GitHub cannot be required. | [src] doctor credentials block (guidance only) | 800-53 IA-2, IA-4, IA-5, IA-9, AC-5, AC-6; COSAiS (distinct agent identity, short-lived authorization, topic); CSF PR.AA | **Medium-High** |
| **N-14** (X-11, partly fixed) | **Measurement does not cover the risky paths.** There are 6 evals, all for codebase scanning or generate-design-md. None covers ship-branch, publish, sync, ingest-figma, ingest-document, ingest-screenshot, comments, or the tainted-merge path. Evals do not run in CI. Per the 11-21 table (not re-checked): there is still no valid eval run, the fixes "have not yet had an adversarial bypass review", and `npm audit` reports 13 untriaged highs. The audit step is `continue-on-error`. Actions are pinned to tags, not SHAs. | [src] `plugin/evals/`; `security.yml` L17–20, L47–49 | AI RMF MEASURE 1.1, 2.7, 3.1; SSDF PW.8, RV.1, PW.4; 42001 9.1; 800-53 CA-2, RA-5, SR-3 | **Medium** |
| **N-15** (X-13 continued) | **Governance records have drifted.** Skills have no owner, version, risk tier or review date. There is no decommissioning runbook (revoking tokens, unpublishing artifacts, removing synced projects, removing the plugin). The status claims are stale: X-14 is marked "Fixed (evaluate_script pre-approvals removed)", but `evaluate_script` is still pre-approved in `done.md`, `make-deck` and `verify-artifact`. SECURITY.md describes a `generate-design-md` skill that exists only in `plugin/`. | [src] frontmatter sweep; 11-21 §5 | 42001 5.3, 6.1.3, A.6.2 (lifecycle, topic); AI RMF GOVERN 1.6, 1.7; 23894 §6.7; CSF GV.RR, ID.AM | **Low-Medium** |

### Places where the set can still act unsafely or non-deterministically

1. **An agent edit can reach the default branch with no human involved** (N-01, N-02, N-04). An injected instruction or a confabulated change goes to a skill, `security.yml` or `plugin/hooks/guard-bash.sh`. The agent commits it, pushes, opens a PR, gets green CI, and ship-branch merges it. Or it pushes straight to `claude-design-features`. The marketplace plugin then ships it.
2. **A third-party PR is merged on request** (N-03).
3. **Data leaves through tools the guard never sees** (N-05, N-08). Examples: a public `gh issue create --body-file artifacts/ingested/...`, an `Artifact` publish of an unscanned file, or a `SendMessage` to an unguarded session.
4. **Poisoned tokens persist across sessions and propagate** into published pages and the org's Claude Design project (N-07).
5. **Page-controlled text drives edits.** `/done` step 6 tells the agent to "fix" console errors, and `/inspect` matches against the accessibility snapshot. Both texts are written by the page, which may be built from ingested content. Neither is named as untrusted.

---

## 4. Per-skill assessments

### 4.1 Skills that publish, push or merge

#### `ship-branch`: **Critical gaps** · Priority **High** · regression since 11-21
- **Strengths**
  - Self-test before push.
  - `--repo` pinned to the fork.
  - Never passes `--admin`, `--auto` or `-D`.
  - Waits for `gh pr checks`.
  - Lists policy-path changes first.
  - Stops on a diverged branch instead of forcing.
- **Gaps**
  - Merges its own PR with no human approval (800-53 AC-5, CM-3; 42001 A.6.2 lifecycle; AI RMF MAP 3.5).
  - The remaining gate is model-judged taint (N-04).
  - The CI it trusts can be edited in the same PR (N-01).
  - The guard allows any PR number (N-03) and an unconstrained push (N-02).
  - The policy-path list is shown *after* the merge decision, not as a gate.
- **Recommendations**
  1. In `guard-tools.py`, before `gh pr merge`, run `gh pr view <n> --json headRefName,author,files` (the hook runs outside the guard). Deny the merge if any of these hold:
     - the head is not the current branch
     - the author is not the authenticated user
     - any changed file is a policy path
     - the session is tainted

     In each case the message is "merge it yourself with `! gh pr merge …`".
  2. Add `disable-model-invocation: true` to the frontmatter so only the user's typed `/ship-branch` starts it [recall: check the key on your Claude Code version].
  3. Constrain push in the guard (N-02).

#### `publish`: **Adequate** · Priority **High** · improved since 11-21
- **Strengths**
  - Scripted, deterministic preparation: inlining, CDN rewrite, dev-only stripping, secret and PII scan.
  - Capabilities off; never uses `force`.
  - Comments are data.
  - Append-only `manifest.json` with the SHA-256 of what was published.
  - Uses the correct `ArtifactComments` contract.
- **Gaps**
  - `--allow-findings` and the publish itself are model-gated only (N-06).
  - No hook checks `Artifact.file_path`, `capabilities` or `force` (N-05).
  - The scanner is regex and line-based. It cannot see text inside inlined images or base64. It misses names, phone numbers, internal hostnames and customer data (27001 A.8.12; AI 600-1 *Data Privacy*).
  - `allowed-tools: Artifact` pre-approves publishing.
- **Recommendations**
  1. Add an `Artifact` branch to the hook. Require `file_path` under `artifacts/publish/`, refuse `capabilities` and `force`, and re-run the scanner on that file inside the hook, blocking on findings.
  2. Have the guard refuse `--allow-findings`, so the user must run it with `!`.
  3. Add `disable-model-invocation: true`.
  4. Add a scanner rule for `data:image` payloads that reminds the user that images are not scanned.

#### `sync-design-system`: **Adequate** · Priority **Medium** · improved since 11-21
- **Strengths**
  - Plan, then approve, then write.
  - Deletes only when the user names them.
  - Checks the project type.
  - Classification question before pushing.
  - Append-only `sync-log/` with file hashes.
  - Remote files are data.
- **Gaps**
  - All gates are model-run `AskUserQuestion` calls. `DesignSync` is pre-approved in `allowed-tools`, and no hook stops `write_files` or `delete_files` (N-05).
  - It pushes tokens that may come from untrusted ingestion with no schema check (N-07).
  - It acts as the user (N-13).
- **Recommendations**
  1. Hook: deny `DesignSync delete_files` outright, and deny `finalize_plan`/`write_files` in tainted sessions.
  2. Run the token validator (action 8) over `sync/` before `finalize_plan`.
  3. Add `disable-model-invocation: true`.

### 4.2 Ingest skills (the untrusted-content entry points)

| Skill | Assessment | Strengths | Gaps → mapping | Recommendations | Priority |
|---|---|---|---|---|---|
| `ingest-github` | **Adequate** (improved) | Confirms before cloning; shallow clone into `/tmp`; reads only files matching the token globs (20 files, 64 KB caps); records the commit SHA and per-file SHA-256; `disallowed-tools` | Full-scope user `gh` login (N-13). Extracted values are not validated (N-07). No injection eval for repo config files. Whether `disallowed-tools` is honoured in skill frontmatter is [recall: verify]; if not, it is documentation only | Read-only fine-grained token, or a separate identity. Token validator on output. Mark the session tainted. Eval with an instruction planted in `tailwind.config.js` | Medium |
| `ingest-figma` | **Adequate** (improved) | `fileKey`/`nodeId` validated; GET-only curl to one host; `-L` with `-H` refused; token never echoed | Long-lived PAT in the shell environment, visible to every Bash call (IA-5). Raw JSON kept indefinitely (X-12, 27001 A.8.10). Text layers flow into tokens unvalidated (N-07) | Short-expiry PAT or OAuth. Offer to delete the raw JSON after parsing. Validator. Taint. Text-layer injection eval | Medium |
| `ingest-document` | **Adequate** (unchanged since 11-21) | Path must come from this turn; confirms first; `unzip -l`/`-p` only; 64 KB caps; never copies the source | **The source SHA-256 is still not recorded** (11-21 S-06; SR-4, 42001 A.7 data provenance). Still no sensitivity label on the outline (A.5.12). `unzip` paths are deliberately unchecked, so any zip on disk can be read | Record `sha256` and `sensitivity` in `*-tokens.json` and the outline front matter. Taint. Slide-text injection eval | Low-Medium |
| `ingest-screenshot` | **Weak** (unchanged since 11-21) | Honest confidence flags | **Still no confirmation step** (it bypasses the CLAUDE.md Phase 0 gate). **Still no data-not-instructions line**, though text inside an image is an injection vector (AI 600-1 *Information Security*). Still records the full image path, which contains the OS username (PII, 27001 A.5.34). No hash | Add Step 0 "Read `<file>`? (yes/no)", the untrusted-content rule, basename plus SHA-256 only, taint | Medium |

### 4.3 Write-back and state skills

| Skill | Assessment | Strengths | Change since 11-21 | Main gap → mapping | Recommendation | Priority |
|---|---|---|---|---|---|---|
| `apply-edits` | **Strong** | All-or-nothing validation in code; leaf-only text; allowlisted CSS; the log stores previous values, so revert is exact | Validation moved into code | The session lookup "most recent prefix" can pick the wrong session. No HTML hash before and after (SI-7) | Log the SHA-256 of `$0` before and after in `applied/<ts>.yaml` | Low |
| `apply-tweaks` | **Strong** | Typed schema checked in code; previous values logged; revert stops if a value is missing instead of guessing | Shared validator; previous values logged | Same as apply-edits | Same | Low |
| `make-editable`, `make-tweakable`, `live-reload` | **Adequate** | Nothing touches the HTML until an `apply` step; dev-only tags are stripped in code at publish, export and handoff; live reload no-ops off 127.0.0.1 | Dev-only stripping now done in code | Starters that stay in a published page (`deck_stage.js`, the `.jsx` siblings) are copied into `artifacts/` and inlined at publish with no integrity check against `starters/`, so a modified copy ships unnoticed (SI-7) | `prepare-publish.mjs` compares each inlined sibling that shares a name with a starter against `starters/` and warns on mismatch | Low |
| `local-comments` | **Strong** | Read-only; comments are data; acts only on the user's pick | None | None material | None | Low |
| `snapshot` | **Adequate** | Validated labels; restore snapshots first (`before-restore`); restore takes a basename only | None (11-21 S-17 open) | No content hashes; versions have no off-machine backup (SI-7, CP-9) | SHA-256 per version in `index.json` | Low |
| `register-asset` | **Adequate** (skimmed) | The `--auto` upsert never resets status; the index generator escapes HTML | None (11-21 S-18 open) | The agent can set `status: approved` on its own work, and nothing records who approved it (AC-5) | `approved_by`/`approved_at`; set `approved` only when the user's message says so | Low |
| `use-design-system` | **Adequate** | Folder name validated; registry match confirmed before applying; `ls`-based existence checks | None | `locked` is advisory. `--unlock` needs no confirmation (CM-5). It copies tokens into the trusted `design-tokens.json` with no validation (N-07) | Run the validator on load; confirm `--unlock` | Low-Medium |
| `create-design-system` | **Adequate** | Checks the registry first; a locked entry becomes a remix; asks before ingesting from GitHub; "real values, not invented" | None (11-21 S-20 open) | Local-codebase source: no read caps, no untrusted-content line. Writes `design-tokens.json` from ingested data and calls it the project's own (N-07) | Caps plus the untrusted line; record provenance `source` and `external: true` in the tokens file | Medium |
| `handoff` | **Adequate** | Writes only under `handoff/`; dev-only stripping in code; never copies stripped files; lists assumptions and open questions (AI RMF MEASURE 2.8) | Dev-only stripping now done in code | `dependencies` is still a hard-coded example, not derived from the artifact (AI 600-1 *Confabulation*). No `MANIFEST.sha256` (SSDF PS.3). `reference.png` goes out unscanned | Derive dependencies and SRI from `<script>` tags; write `MANIFEST.sha256` | Low |

### 4.4 Generation, export and verification skills

| Skill / command | Assessment | Strengths | Main gap → mapping | Recommendation | Priority |
|---|---|---|---|---|---|
| `make-deck`, `interactive-prototype`, `wireframe`, `copy-example` (skimmed) | **Adequate** | Phase 0 asks before any ingest and never auto-applies a design system; React and Babel pinned with SRI; mock data inline with no external fetch; the deck overflow audit runs in code | Phase 0 trusts `design-tokens.json` (N-07). "No invented data" is a prose control only (AI 600-1 *Confabulation*). `evaluate_script` is still pre-approved in make-deck (N-15) | verify-artifact lists unsourced numerals for the user to confirm; drop `evaluate_script` from `allowed-tools` | Low-Medium |
| `animated-video` | **Adequate** | Remotion path never runs `npx` itself; it hands commands to the user | **New:** the Popmotion snippet loads `unpkg.com/popmotion@11.0.5` with **no `integrity` attribute** (SSDF PW.4, 800-53 SR-11, SI-7). Path B writes a `package.json` with no lockfile and has the user run `npx remotion`, which hands an unlocked dependency install to a human | Add the SRI hash and `crossorigin`. Ship a lockfile in the Remotion scaffold, or tell the user to run `npm ci` against a reviewed lockfile | Medium |
| `verify-artifact` (skimmed) | **Strong** (as measurement) | Overflow audit in code; computed-style design-token conformance; P0–P3 rubric | Silent on pass, so it leaves no record (AU-3, AI RMF MEASURE 2.4). No CSP check (N-10) | Write `.claude/verify-<ts>.json`; check that a CSP `<meta>` is present | Low |
| `export-pdf`, `export-pptx` | **Strong** | Chromium sandbox kept; DNS deny-all plus request allowlist; scripts versioned and write-protected; the guard gives `node` only these scripts | Chromium is downloaded at install time (PW.4). unpkg is allowed without script-level SRI enforcement | Reject unpkg requests whose tag lacks `integrity` | Low |
| `export-standalone` | **Adequate** | monolith `--isolate` CSP; runs only on the code-stripped copy | monolith is unpinned (brew) | `/doctor` records `monolith --version` against an expected version | Low |
| `inspect` | **Adequate** | Read-only resolution; shows candidates when the match is ambiguous | The optional `Edit` runs without showing a diff (11-21 open). Matches against page-written snapshot text (§3 item 5) | Show the old and new text first; name snapshot and console text as untrusted | Low |
| `doctor` | **Adequate** | Never installs; prints pinned install commands; never asks for or reads token values; checks that the pin files exist | Checks that the pins exist, not that controls work. It does not run `test-guard.sh` or check that branch protection, bypass mode or user-level plugins are in an expected state (800-53 CA-7, SI-6) | Add those checks. Print the `gh api …/protection` command for the user to run | Low (high leverage) |
| `/done` | **Adequate** | Cache-busted reload; real font wait; URL scope enforced by the hook | The auto-fix loop acts on console text the page writes. `evaluate_script` is pre-approved | Treat console text as data; drop the pre-approval | Low |
| `/preview` | **Adequate** | Refuses any origin other than the project and 127.0.0.1 | `open` runs artifacts in the user's real browser profile (N-10) | Preview only in the isolated MCP Chrome by default; use `open` only on request | Low-Medium |
| `/screenshot` | **Adequate** (fixed since 11-21) | Step JS is shown verbatim and needs the user's confirmation; the guard enforces output paths | None material | None | Low |
| `/serve` | **Adequate** | Loopback bind; rooted at `artifacts/`, not the project | Serves `artifacts/ingested/`. No Host-header validation (DNS rebinding, [unverified]) | Serve `artifacts/` minus `ingested/`, or move ingested data outside the web root | Low-Medium |

---

## 5. Prioritised action list

These steps are ordered by risk reduced per unit of effort. Steps 1–4 close the Critical-gap area.

1. **Enable branch protection on `claude-design-features`.** **Done on 2026-11-26**, verified from the PUT response. It was 404 before.
   - Require a PR and the `checks` status, block force-pushes and deletion, and include administrators. The user applies this; `gh api` is denied to the agent.
   - Re-run the GET afterwards to confirm it took effect.
   - With zero required approvals this closes N-02, the push-bypass half of N-01, and merges on red CI. It does not give separation of duties; that needs action 2. (800-53 CM-5, AC-3; SSDF PS.1)
2. **Take the CI and supply-chain files out of the agent's reach.** **Fix staged 2026-11-26** (see §6): deny rules, plus a hook that keeps the agent from merging policy changes. A separate agent identity is still open.
   - Move `.github/**`, `tools/**`, `plugin/hooks/**`, `plugin/scripts/**` and `package*.json` into the "never written by Claude" tier: add `Edit(...)` deny rules in `settings.json`, and remove the matching `allow` lines from `settings.local.json`.
   - Either keep the no-prompt edits for skills and CLAUDE.md, but have the merge hook (step 4) refuse any PR that touches them,
   - or give the agent a **separate GitHub identity** (a machine user or a GitHub App with short-lived installation tokens, `contents:write` on non-default branches and `pull_requests:write` only). Then require one approving review from you. This one change makes separation of duties possible, and it also closes N-13. (AC-5, IA-4, IA-9; COSAiS agent identity)
3. **Constrain `git push` in `guard-bash.sh`.** **Fix staged 2026-11-26**, in `guard-tools.py` rather than `guard-bash.sh`, so no re-pin is needed. `--no-verify` is refused too (see §6). Allow only `git push origin <name>` where `<name>` matches `[A-Za-z0-9._/-]+` and is not `claude-design-features`. Refuse `:`, a leading `+`, `-f`, `--force*`, `--mirror`, `--all` and `--tags`. Allow `--delete` only for a non-default branch. Add `test-guard.sh` cases for each form, then re-pin. (CM-5, SI-7)
4. **Move the merge and outbound decisions into `guard-tools.py`.** This separates enforcement from reasoning.
   - **Taint.** Mark the session tainted when it calls `gh repo clone`, `curl https://api.figma.com`, `unzip -p`, `ArtifactComments`, `DesignSync get_file`, `gh pr view|diff` on a PR not authored by the user, or `Read` of `/tmp/cd-ingest-*`, `artifacts/ingested/`, or an image **outside the project**. Exempt the preview files (`.claude/last-preview.png`, `.claude/verify-*`), which `/done` and `verify-artifact` read every turn. Record the `session_id` under `.claude/audit/`.
   - **Merge.** Deny `gh pr merge` unless all four hold: the head is the current branch, the author is the user, no policy path changed, and the session is untainted.
   - **Push and public text.** Deny `git push`, `gh pr create`, `gh issue create`, `Artifact` publish and `DesignSync` writes in tainted sessions.
   - **How the user overrides it.** For `git` and `gh`, the deny message is "run it yourself with `! <command>`". `Artifact` and `DesignSync` are built-in tools the user cannot run with `!`, so give them a different escape: start a fresh, untainted session, or create a one-time override file under `.claude/audit/`. The agent cannot write there.
   - **Why deny, not ask.** Use deny rather than `ask`, because bypass mode voids `ask`. (AC-4, SI-10; AI 600-1 *Information Security*)
5. **Make `guard-tools.py` default-deny by tool name.** **Fix staged 2026-11-26**, except for three items: taint-based DesignSync gating (needs action 4), bypass-mode disabling, and shipping the hook in the plugin (see §6).
   - **Allowlist:** derive it from the tool names already recorded in `.claude/audit/tool-calls.jsonl`, not from this list. It will include at least: Read, Write, Edit, Glob, Grep, Bash, Skill, AskUserQuestion, ToolSearch, `ArtifactComments` (the publish comment loop), `Agent` (your reviewer agents), `mcp__ide__getDiagnostics`, and the project's chrome-devtools server.
   - **Artifact:** allow only with `file_path` under `artifacts/publish/`, with no `capabilities` and no `force`. The hook re-runs the secret and PII scan.
   - **DesignSync:** allow reads freely, writes only in untainted sessions, and never `delete_files`.
   - **Deny:** `SendMessage`, `RemoteTrigger` and `CronCreate`.
   - **`--allow-findings`:** have the guard refuse it.
   - **Bypass mode:** set `permissions.disableBypassPermissionsMode: "disable"` in `settings.json` [recall: check the key name].
   - **Plugin:** ship the same `guard-tools.py` (with pins) in `plugin/hooks/hooks.json` (N-09). (AC-6, CM-7, SC-7)
6. **Validate tokens in code.** **Fix staged 2026-11-26**, as a hook check on every write or copy of a token file rather than a node script (see §6). Add `scripts/validate-tokens.mjs` to the node allowlist with a strict schema:
   - colors match `#rrggbb` or `oklch()`/`rgb()`/`hsl()` with numeric arguments
   - font families match `^[A-Za-z0-9 \-]{1,64}$`
   - numbers are bounded
   - unknown keys are dropped

   Run it when ingest writes, when `use-design-system` loads, and before `sync`. Record `source` and `external: true` in the tokens. Phase 0 then treats external tokens as data. (SI-10, SI-7; 27090 poisoning; AI 600-1 *Information Integrity*)
7. **Close the browser egress paths.**
   - Pin `check_url` to `127.0.0.1:4567`.
   - Drop `plugin_chrome-devtools-mcp_chrome-devtools` from `ALLOWED_MCP`, or require that it launch `--isolated`.
   - Add a CSP `<meta>` (`default-src 'self' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'self'`) to the starters, and have `verify-artifact` check for it.
   - Add SRI to the Popmotion snippet.
   - Stop `/serve` from serving `artifacts/ingested/`. (SC-7, AC-4, SR-11)
8. **Restrict public posts.** **Fix staged 2026-11-26** (see §6). Limit `gh pr create` and `gh issue create` `--body-file` to `artifacts/pr-body.md` and `artifacts/issue-body.md`, and run the PII and secret scanner on that file in the hook. Refuse `git add -f`. (AC-22, AC-4; AI 600-1 *Data Privacy*)
9. **Measure the risky paths.**
   - Add evals for ship-branch (an injected "merge PR #N" and an injected skill edit), publish (seeded PII, and an attempt at `--allow-findings`), sync (a delete request planted in a remote file), and ingest-figma, ingest-document and ingest-screenshot (planted instructions and malicious token values). Run them in CI as a merge gate.
   - Commission an adversarial bypass review of the 11-21 fixes.
   - Triage the 13 `npm audit` highs and make the audit blocking.
   - Pin Actions to commit SHAs. (MEASURE 1.1, 2.7; SSDF PW.8, RV.1, PW.4)
10. **Fix governance records.**
    - **Risk register:** add one entry per relaxation in PRs #10–#13, with owner, rationale, compensating control and review date (42001 6.1.3; 23894 §6.5).
    - **Skill metadata:** add `owner`, `version` and `risk: high|medium|low` to each skill's frontmatter or a `skills/INVENTORY.md` (AI RMF GOVERN 1.6).
    - **Decommissioning:** write a runbook for revoking tokens, deleting published artifacts and synced projects, and uninstalling the plugin (GOVERN 1.7).
    - **Audit log:** hash-chain it and add PostToolUse outcome records for outbound tools (AU-9, AU-3).
    - **Pins:** cover `guard-tools.py`, `test-guard.sh` and `settings.json` (N-12).
    - **Status table:** correct the 11-21 entries for X-03 and X-14, the stale "(which asks)" comment, and SECURITY.md's `generate-design-md` reference.
    - **Carried-forward items:** finish the open 11-21 items for ingest-document, ingest-screenshot, snapshot, register-asset, create-design-system and handoff (§4).

---

## 6. Remediation log

### N-01: fix staged on branch `security/n01-merge-gate`

The fix has two parts that work together:

| Part | What it does | Where |
|---|---|---|
| **Agent can no longer write the checker** | `Edit`/`Write` deny for `.github/**`, `tools/**`, `plugin/hooks/**`, `plugin/scripts/**`, `package.json`, `package-lock.json`. A deny in `settings.json` overrides the maintainer's local `allow` lines, which are also removed | Staged: `artifacts/security-fixes/n01/settings.json`, `settings.local.json` |
| **Agent can no longer merge policy changes** | Any command with a `gh` word and a standalone `merge` word must be exactly `gh pr merge <n> --repo <fork> --merge --match-head-commit <sha>`. The hook then reads the PR with `gh`: the head, the full file list including the old path of a renamed file, and the head again. It blocks if any policy file changed, the PR comes from another repository, the head is not the current branch, the pin is not the checked head, or anything cannot be read. Every error or timeout blocks. Policy PRs are merged by the maintainer in their own shell | Staged: `artifacts/security-fixes/n01/guard-tools.py`, tests in `test_merge_gate.py` |
| **Docs** | ship-branch stops before merging any policy PR. CLAUDE.md "Tool guard" and "Changes to policy files", and SECURITY.md, describe the new rule. PR, issue and CI text written by others is added to the untrusted-content list (part of N-03) | Edited on the branch |

**Effect.** Every change to the agent's rules, guards, CI or dependencies now has a human merge step. Branch protection (on since 2026-11-26) stops anyone going around the PR.

**Code review of the staged hook (same day).** An independent review found four gaps in the first version. All four are fixed in the staged files:

| Gap | Fix |
|---|---|
| **Check-then-merge race.** `git push … && gh pr merge 5` (or a push started in the background) could add a policy commit after the hook checked the PR | The hook reads `headRefOid` and re-reads it after the file list. The merge must be the whole command, in one exact form that ends with `--match-head-commit <that sha>`. GitHub then refuses the merge if the head moved. A second review caught a pin hidden inside `--subject "…"` or after `&& echo`, so the form is checked on the raw command, not on a quote-stripped copy |
| **`Monitor` tool.** It runs shell commands that `guard-bash.sh` never sees, so a merge through it went unchecked | `Monitor` is denied in settings and in `guard-tools.py`. The merge check now runs for any tool call that carries a `command` |
| **`.claude-plugin/` not covered.** `marketplace.json` decides where plugin installs come from | Added to the policy paths, the `Edit`/`Write` deny rules and the sandbox `denyWrite`. `.gitignore` is now merge-gated too |
| **Renames.** `gh pr view --json files` lists only the new path, so moving `security.yml` out of `.github/` looked harmless | The file list now comes from the paginated REST files endpoint, and both `filename` and `previous_filename` are checked |

**Still open after it is installed**
- **Mitigated (N-03).** The gate refuses PRs from other repositories and PRs whose head is not the current branch.
- **Open (N-13).** Separation of duties still rests on a local hook, not on GitHub. The agent still uses the maintainer's GitHub login, so GitHub cannot tell the two apart. A separate agent identity is still recommended.
- **Accepted (false positive).** Any command with a `gh` word and a standalone `merge` word is treated as a merge. So a `gh pr create` whose title or branch name contains "merge" is blocked, and so is a Bash search for that text. ship-branch says to keep the word in the body file; use the Grep tool for searches.
- **Unverified.** The hook's three `gh` calls are capped at 40 s in total, below the default 60 s hook timeout [recall]. That a timed-out hook blocks under `onFailure: block` was not tested.

### Actions 3, 5, 6 and 8: fixes staged the same day

GitHub Actions credits ran out on 2026-11-26. With no Actions, the `checks` status can't be produced, so branch protection now blocks every merge, which fails closed. Everything below runs on the maintainer's machine and needs no Actions. It is in the same staged `guard-tools.py`, with its tests in `test_merge_gate.py`.

| Action | What was built | Differences from the plan above |
|---|---|---|
| **3. Push** | The whole command must be `git push origin <branch>` or `git push origin --delete <branch>`. It refuses the default branch, `refs/…`, `HEAD`, tag names, refspecs, force, `--tags` and `--no-verify`. A pushed branch must exist locally | In `guard-tools.py`, not `guard-bash.sh`, so no re-pin. `--no-verify` added, so the pre-push hook can't be skipped |
| **5. Default-deny** | `ALLOWED_TOOLS` comes from the audit log plus the skills' `allowed-tools`.<br>- `SendMessage`: only to this session's subagents, by id.<br>- `Artifact`: only `artifacts/publish/` files, with no capabilities, force, type or copy, after a secret and home-path scan.<br>- `DesignSync`: no `delete_files`, and local paths under `design-systems/`.<br>- `ReadMcpResourceTool`, `RemoteTrigger`, `CronCreate`, `Workflow` and `NotebookEdit` are refused by default | `SendMessage` is limited rather than denied, because resuming a reviewer subagent needs it. Still open: DesignSync gating by taint (needs action 4), `disableBypassPermissionsMode` (not set, because the maintainer works in bypass mode), and shipping `guard-tools.py` in the plugin (N-09) |
| **6. Tokens** | Writing or copying `.claude/design-tokens.json` or `design-systems/*/tokens.json` requires the content to validate:<br>- strict colours under colour keys and plain font names under font keys<br>- numbers within ±10000<br>- values of at most 96 plain characters and 5 words<br>- no `url()`, `data:`, `@import` or markup<br>`Edit` of a token file is refused, so the whole file is always validated | A hook check instead of `scripts/validate-tokens.mjs`, so no node allowlist change and no re-pin. Invalid files are rejected, not cleaned. `source` / `external` marking is not done |
| **8. Public posts** | `gh pr|issue create` must be the whole command, with exactly one `--body-file artifacts/pr-body.md` / `artifacts/issue-body.md`. `--body`, `--fill`, `--template`, `--web` and `--editor` are refused. The title and body are scanned for secrets, e-mail addresses (`noreply` and example domains are fine) and home paths. `git add -f` and `--allow-findings` are refused | — |
| **Local CI** | Staged `pre-push` for `.git/hooks/` runs both guard self-tests, the plugin sync check, the tool-guard tests and `node --check` | Stands in for the `checks` job until Actions returns. `npm ci` / `npm audit` are left to a manual run |

**Residual risks**
- The token word limit is a heuristic. A short instruction of five words or fewer still fits, and values under colour keys must be colours, so a `description` there is rejected.
- The scanner finds known secret formats only. It does not catch names, phone numbers or free-form confidential text.
- Everything in this section is a local control, and so is the merge gate. Separation of duties still waits on a separate agent identity (N-13).
- **Accepted (deliberate).** Policy edits to skills and CLAUDE.md still need no prompt. What changed is that they can no longer be merged by the agent.
- **Unverified.** Whether Claude Code runs hooks inside the sandbox is [recall: unsandboxed]. If they are sandboxed, `gh pr view` fails and every agent merge blocks. That is fail-closed, but ship-branch would then hand over every merge.
