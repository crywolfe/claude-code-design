---
name: governance-review
description: Review this repo's agent skills, hooks and settings against NIST (AI RMF, AI 600-1, SSDF/800-218A, 800-53, CSF 2.0) and ISO (42001, 23894, 27001/27002, 27090) for security and governance gaps, as a dated follow-up to the previous review. Use when the user asks for a security or governance review of the skills, an "AI governance review", a "NIST/ISO review", or pastes the reviewer brief.
argument-hint: "[focus area]"
allowed-tools: Read Glob Grep
---

# Governance review

Static review of the skill set in this repo. It produces a dated report and changes nothing else.

## Scope

- If the brief says skills are attached but none are, review this repo and say so in §0:
  - `.claude/skills/*`, `.claude/commands/*`
  - `.claude/hooks/*`, `.claude/settings.json`, `.claude/settings.local.json`
  - `.mcp.json`, `scripts/`, `.github/`
  - `plugin/`: its `hooks/hooks.json` and `managed-settings.reference.json`
- Find the newest `docs/reviews/*-skills-security-governance-review.md`. Read it in full, including its remediation table. Treat that table's "Fixed" rows as **claims** to re-verify, not as facts.

## Evidence (in this order)

1. `git log --oneline --no-color -25`. Then `git diff --stat <previous revision>..HEAD`. Note any PR that **loosens** a control; these get their own report section.
2. Read the guards and settings in full: `guard-bash.sh` (with the Read tool; `sed` is blocked), `guard-browser.py`, `guard-tools.py`, `hooks.sha256`, both settings files.
3. Read every outward-facing skill in full: ship-branch, publish, sync-design-system, the four ingest skills, and any skill that has a remote-write tool (DesignSync, Artifact) in `allowed-tools`. For the rest, read the frontmatter plus run `rg` for `https?://|evaluate_script|untrusted|design-tokens|sha256`. Say in §0 which files you read in full and which you skimmed.
4. Run `bash .claude/hooks/test-guard.sh` exactly as written, with no pipe. It exits with its failure flag, so exit 0 means no failures. Probe one or two guard claims live (for example, `cd artifacts && pwd` must be blocked).
5. Run `rg -n '^(allowed-tools|disallowed-tools):' .claude/skills .claude/commands` to compare pre-approvals against the claims.

## Questions that found real gaps before

- Can the agent edit the files that **gate its own merge**? Check `.github/`, `tools/`, `plugin/hooks/` and the package files against the `Edit` allow and deny rules.
- Does the `git push` rule constrain the refspec, `--force`, `--delete` and `--tags`? Can `gh pr merge` merge someone else's PR?
- Which built-in tools that leave the machine pass with no hook? Check `Artifact`, `ArtifactData`, `DesignSync`, `SendMessage`, `RemoteTrigger`, `CronCreate` and `Agent`.
- Is a human gate actually enforced by a hook, a `deny` rule or the sandbox? Or does it depend on the model's own judgement (for example, "was this prompted by untrusted content")? Note whether the session runs in bypass mode, because bypass mode voids `ask`.
- Where does ingested data **persist**? `.claude/design-tokens.json` and `design-systems/` are the main places. Is it validated before reuse?
- Do marketplace (`plugin/`) users get the same hooks as the workspace?

## Citations

- WebFetch is denied here, so every control ID comes from memory.
- Cite by ID only where you are confident: AI RMF subcategories, SSDF practices, 800-53 controls, CSF categories, 42001 clauses, 23894 clauses, 27001 Annex A.
- Cite by topic only: AI 600-1 risk areas, 800-218A, 27090, COSAiS, the Cyber AI Profile.
- Never invent clause numbers.
- Label each piece of evidence [src], [live], [env], [recall] or [unverified].
- Mark facts carried from the previous review as not re-checked.
- Check every line number you cite with Read; do not cite numbers from `cat` output.

## Output

- Write `docs/reviews/<YYYY-MM-DD>-skills-security-governance-review.md` with these sections:
  - §0 scope and method
  - §1 summary verdict
  - §2 control relaxations since the previous review
  - §3 cross-cutting findings table (ID, finding, evidence, mapping, priority) plus unsafe and non-deterministic paths
  - §4 per-skill assessments, each with Strengths, gaps → mapping, recommendation and priority
  - §5 prioritized top 10 actions
- For each recommendation, check that it would work. For example: a taint rule must not fire on the preview files every turn, and `!` cannot run built-in tools.
- Do not edit the previous review, any skill, any hook or any setting. Do not commit, push or publish. Offer those only.
- End the turn with:
  - the report path
  - the one check only the user can run: `! gh api repos/crywolfe/claude-code-design/branches/claude-design-features/protection` (a 404 means the branch is unprotected)
  - the top three actions
