#!/usr/bin/env python3
"""PreToolUse guard for every tool call in this project (matcher "*"), plus a SessionStart mode.

1. Integrity. guard-bash.sh and guard-browser.py must match the SHA-256 values pinned in
   hooks.sha256 next to this file. A mismatch blocks every tool call until a person re-runs
   the self-test and re-pins:
       bash .claude/hooks/test-guard.sh
       (cd .claude/hooks && shasum -a 256 guard-bash.sh guard-browser.py > hooks.sha256)
2. MCP allowlist. An mcp__* tool is allowed only if it belongs to this project's own Chrome
   DevTools server (which guard-browser.py checks further) or is the IDE diagnostics tool.
   Every other MCP server or connector (shell runners, logged-in browser drivers, mail, file
   sharing, payments) is refused, because CLAUDE.md's browser-scope and untrusted-content
   rules are not enforced on them. To allow one, a person edits ALLOWED_MCP below.
3. WebFetch and WebSearch are refused (they are also denied in settings.json). Monitor is refused
   too: it runs a shell command that guard-bash.sh never sees (that hook matches only "Bash").
4. Merge gate. Any tool call whose command runs `gh pr merge <n>` is allowed only when PR <n> on
   the fork (a) is not from another repository, (b) has the current local branch as its head,
   (c) changes no policy file (POLICY_FILES / POLICY_DIRS below), counting both the new and the
   old path of a renamed file, and (d) the merge is the whole command, in exactly the form
   `gh pr merge <n> --repo <fork> --merge --match-head-commit <sha>` (MERGE_FORM_RE, matched on
   the raw command), with <sha> equal to the head commit this hook checked, so a push that lands
   between the check and the merge makes gh refuse the merge. Policy changes are merged by a person, in their own shell
   (`! gh pr merge ...`), so an agent-written change to the agent's own rules, guards, CI or
   dependencies always passes a human. The PR data comes from `gh`, run by this hook outside the
   agent's control. Anything that cannot be verified (gh missing, network error, file list
   incomplete) blocks.
5. Default-deny by tool name (review action 5). A built-in tool runs only if it is in ALLOWED_TOOLS;
   a new or unknown tool is refused until a person adds it. Per-tool limits:
   - SendMessage only to a subagent this session started (an `a` + 16 hex id), never to another
     session or a named peer.
   - Artifact may publish only files under artifacts/publish/, with no `capabilities`, no `force`
     and no `type_url`; the file is scanned for secrets and home-directory paths first.
   - DesignSync never runs `delete_files`, and its local paths must stay under design-systems/.
6. git push (review action 3). The whole command must be `git push origin <branch>` or
   `git push origin --delete <branch>`: no refspec, no force, no --no-verify, no tags, never the
   default branch, and a pushed branch must exist locally.
7. Public posts (review action 8). `gh pr create` / `gh issue create` must be the whole command and
   take their text only from artifacts/pr-body.md / artifacts/issue-body.md, which (with the title)
   are scanned for secrets, e-mail addresses and home-directory paths. `git add -f` and
   `--allow-findings` are refused.
8. Design tokens (review action 6). `.claude/design-tokens.json` and design-systems/*/tokens.json
   may be written only with Write (whole file) or cp/mv from a file that passes validate_tokens():
   strict colours and font names, bounded numbers, short plain strings, no CSS or markup.
9. Audit. One JSON line per call in .claude/audit/tool-calls.jsonl: time, session, tool,
   SHA-256 of the input (never the input itself), decision. Best-effort: a logging failure
   never changes the decision.

SessionStart mode (--session-start) records the skill-set revision in the same log and warns
when the pins do not match. A SessionStart hook cannot block a session, so blocking happens
here on the first tool call.

  exit 0 -> allow
  exit 2 -> block, message on stderr is shown to Claude
Registered with "onFailure": "block", so a crash or a missing python3 also blocks.
"""
import hashlib
import json
import os
import math
import re
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.realpath(__file__))
PINNED = ("guard-bash.sh", "guard-browser.py")
ALLOWED_MCP = re.compile(
    r"^mcp__(chrome-devtools"
    r"|plugin_claude-code-design_chrome-devtools"
    r"|plugin_chrome-devtools-mcp_chrome-devtools)__[A-Za-z0-9_]+$"
    r"|^mcp__ide__getDiagnostics$"
)
DENIED_BUILTIN = {"WebFetch", "WebSearch", "Monitor"}

FORK = "crywolfe/claude-code-design"
# Policy-as-code (CLAUDE.md "Changes to policy files"), compared lower-cased because the macOS
# checkout is case-insensitive. Directories match as prefixes, files match exactly.
POLICY_FILES = {"claude.md", "security.md", ".mcp.json", "package.json", "package-lock.json", ".gitignore"}
POLICY_DIRS = (".claude/", ".claude-plugin/", "scripts/", "starters/", "plugin/", "tools/", ".github/")
# Detection is deliberately wide: any command with a `gh` word and a standalone `merge` word is a merge
# attempt and must match MERGE_FORM_RE exactly. That catches spellings such as `gh pr --repo X merge 5`,
# `gh pr {merge,5}` or `gh pr $'merge'` even from a tool that guard-bash.sh does not see. `mergedAt` /
# `mergeCommit` (ship-branch step 10) and `--merge` alone are not standalone `merge` words.
GH_WORD_RE = re.compile(r"(?<![A-Za-z0-9_.-])gh(?![A-Za-z0-9_.-])")
MERGE_WORD_RE = re.compile(r"(?<![A-Za-z0-9_.-])merge(?![A-Za-z0-9_.-])")
# The only merge form the agent may run: the whole command, nothing chained, no quotes, the pin a real
# argument to gh. Matched against the raw command, so a pin hidden in a quoted string or a second
# command cannot satisfy it.
MERGE_FORM_RE = re.compile(r"[ ]*gh pr merge ([0-9]+) --repo " + re.escape("crywolfe/claude-code-design")
                           + r" --merge --match-head-commit[ =]([0-9a-f]{40})[ ]*")

# Built-in tools this project uses (from .claude/audit/tool-calls.jsonl plus the skills' allowed-tools).
# Anything else (ReadMcpResourceTool, RemoteTrigger, CronCreate, Workflow, NotebookEdit, a tool added in
# a later Claude Code release) is refused until a person adds it here.
ALLOWED_TOOLS = {
    "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "LS", "Bash", "Skill",
    "Agent", "Task", "SendMessage", "ListAgents", "AskUserQuestion", "ToolSearch", "advisor",
    "TodoWrite", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate", "TaskOutput", "TaskStop",
    "EnterPlanMode", "ExitPlanMode", "EnterWorktree", "ExitWorktree",
    "Artifact", "ArtifactComments", "DesignSync",
}
SUBAGENT_ID_RE = re.compile(r"a[0-9a-f]{16}")
DEFAULT_BRANCH = "claude-design-features"
PUSH_FORM_RE = re.compile(r"[ ]*git push origin (--delete )?([A-Za-z0-9][A-Za-z0-9._/-]{0,99})[ ]*")
POST_BODY = {"pr": "artifacts/pr-body.md", "issue": "artifacts/issue-body.md"}
POST_TEXT_FLAGS = {"-b", "--body", "-f", "--fill", "--fill-first", "--fill-verbose", "-T", "--template",
                   "--recover", "-w", "--web", "-e", "--editor"}

SECRET_RES = [
    ("a GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}")),
    ("a GitHub token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}")),
    ("an AWS key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("an Anthropic key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("an API key", re.compile(r"\bsk-[A-Za-z0-9]{32,}")),
    ("a Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("a Figma token", re.compile(r"\bfigd_[A-Za-z0-9_-]{20,}")),
    ("a Google key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
]
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
HOME_PATH_RE = re.compile(r"/(?:Users|home)/[^/\s\"'<>]+/")

TOKEN_KEY_RE = re.compile(r"[A-Za-z0-9_.-]{1,40}")
TOKEN_STR_RE = re.compile(r"[\w #%(),./:'+-]{0,96}")
TOKEN_STR_BAD = ("url(", "expression(", "javascript:", "@import", "data:")
# Words of 3+ letters. Token values are mostly numbers and units; a value with many such words is prose,
# which is how an instruction would be smuggled into a token file.
TOKEN_WORD_RE = re.compile(r"[^\W\d_]{3,}")
COLOR_RE = re.compile(r"#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"
                      r"|(?:oklch|oklab|rgb|rgba|hsl|hsla)\([-0-9.%, /]{1,60}\)"
                      r"|transparent|currentColor")
FONT_RE = re.compile(r"[\w ,.'\"-]{1,96}")
COPY_CMDS = ("cp", "mv", "ln", "install", "rsync", "ditto")
GLOB_CHARS = set("*?[]{}")
COLOR_KEYS = {"colors", "color", "palette"}
FONT_KEYS = {"fonts", "font", "fontfamily", "fontfamilies", "families"}


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def audit(record):
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not proj or not os.path.isabs(proj) or not os.path.isdir(os.path.join(proj, ".claude")):
        return
    try:
        d = os.path.join(proj, ".claude", "audit")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "tool-calls.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record, sort_keys=True) + "\n")
    except Exception:
        pass


def call_record(data, decision, reason):
    raw = json.dumps(data.get("tool_input"), sort_keys=True, default=str).encode("utf-8")
    return {
        "ts": now(),
        "event": "tool_call",
        "session_id": data.get("session_id"),
        "tool": data.get("tool_name"),
        "tool_use_id": data.get("tool_use_id"),
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "decision": decision,
        "reason": reason,
    }


def verify_pins():
    """Return None when every pinned hook matches, else a short description of the problem."""
    pins = {}
    try:
        with open(os.path.join(HERE, "hooks.sha256"), encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    pins[parts[1].lstrip("*")] = parts[0].lower()
    except OSError:
        return "hooks.sha256 is missing"
    for name in PINNED:
        if name not in pins:
            return "%s has no pinned hash" % name
        try:
            with open(os.path.join(HERE, name), "rb") as f:
                digest = hashlib.sha256(f.read()).hexdigest()
        except OSError:
            return "%s is missing" % name
        if digest != pins[name]:
            return "%s does not match its pinned hash" % name
    return None


def git_head(proj):
    """Current commit, read from .git without running git."""
    try:
        gitdir = os.path.join(proj, ".git")
        with open(os.path.join(gitdir, "HEAD"), encoding="utf-8") as f:
            head = f.read().strip()
        if not head.startswith("ref: "):
            return head
        ref = head[5:]
        ref_path = os.path.join(gitdir, *ref.split("/"))
        if os.path.isfile(ref_path):
            with open(ref_path, encoding="utf-8") as f:
                return f.read().strip()
        with open(os.path.join(gitdir, "packed-refs"), encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2 and parts[1] == ref:
                    return parts[0]
    except OSError:
        pass
    return None


def current_branch(proj):
    """Checked-out branch name from .git/HEAD, or None (detached HEAD, not a repo)."""
    try:
        with open(os.path.join(proj, ".git", "HEAD"), encoding="utf-8") as f:
            head = f.read().strip()
    except OSError:
        return None
    prefix = "ref: refs/heads/"
    return head[len(prefix):] if head.startswith(prefix) else None


def is_policy_path(path):
    p = str(path).lower()
    if p.startswith("./"):
        p = p[2:]
    return p in POLICY_FILES or p.startswith(POLICY_DIRS)


def merge_decision(pr, number, branch, match_sha):
    """Pure check. `pr` is `gh pr view --json headRefName,headRefOid,isCrossRepository,changedFiles`
    plus "files": [{"path": new, "previous": old-or-empty}] from the REST files endpoint.
    `match_sha` is the --match-head-commit value in the command (or None).
    Returns None to allow, else the reason to block."""
    if not isinstance(pr, dict):
        return "could not read PR #%s" % number
    if pr.get("isCrossRepository") is not False:
        return "PR #%s comes from another repository (or its origin is unknown); merge it yourself after review" % number
    if not branch:
        return "the current branch could not be read from .git/HEAD"
    if pr.get("headRefName") != branch:
        return ("PR #%s has head '%s', not the current branch '%s'; ship-branch only merges the branch it shipped"
                % (number, pr.get("headRefName"), branch))
    files = pr.get("files")
    changed = pr.get("changedFiles")
    if not isinstance(files, list) or not isinstance(changed, int) or len(files) != changed:
        return "PR #%s file list is missing or truncated, so its policy-file check cannot be completed" % number
    if any(not isinstance(f, dict) or not f.get("path") for f in files):
        return "PR #%s file list has an entry without a path" % number
    touched = set()
    for f in files:
        for p in (f.get("path"), f.get("previous")):
            if p and is_policy_path(p):
                touched.add(str(p))
    policy = sorted(touched)
    if policy:
        shown = ", ".join(policy[:5]) + (" (+%d more)" % (len(policy) - 5) if len(policy) > 5 else "")
        return ("PR #%s changes policy files (%s). Policy changes are merged by the maintainer: review the PR, "
                "then run it yourself with  ! gh pr merge %s --repo %s --merge" % (number, shown, number, FORK))
    head = pr.get("headRefOid")
    if not isinstance(head, str) or not re.fullmatch(r"[0-9a-f]{40}", head):
        return "PR #%s head commit could not be read" % number
    if match_sha != head:
        return ("pin the merge to the commit that was checked: re-run as  gh pr merge %s --repo %s --merge "
                "--match-head-commit %s  (gh then refuses the merge if the branch moved)" % (number, FORK, head))
    return None


def tool_command(data):
    """The shell command a tool call carries (Bash, or any other tool with a string `command`), else None."""
    ti = data.get("tool_input")
    cmd = ti.get("command") if isinstance(ti, dict) else None
    return cmd if isinstance(cmd, str) else None


def parse_merge(cmd):
    """(number, sha) when the raw command is exactly the allowed merge form, else None."""
    m = MERGE_FORM_RE.fullmatch(cmd)
    return (m.group(1), m.group(2)) if m else None


def check_merge(data):
    """Block `gh pr merge` unless merge_decision() allows it. Fails closed on any error.
    Any command containing the words `gh pr merge` is checked, including a search for that text
    (`rg "gh pr merge" ...`), which then blocks: use the Grep tool for such searches."""
    cmd = str(tool_command(data) or "")
    bare = cmd.replace('"', "").replace("'", "")
    if not (GH_WORD_RE.search(bare) and MERGE_WORD_RE.search(bare)):
        return
    form = parse_merge(cmd)
    if form is None:
        block(data, "a merge must be the whole command, in exactly this form: gh pr merge <n> --repo %s --merge "
                    "--match-head-commit <40-char head sha>  (get the sha with gh pr view <n> --repo %s "
                    "--json headRefOid)" % (FORK, FORK))
    number, match_sha = form
    pr = fetch_pr(number)
    if pr is None:
        block(data, "could not verify PR #%s with gh (gh missing, not logged in, or offline); "
                    "merge it yourself if it is ready" % number)
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    reason = merge_decision(pr, number, current_branch(proj) if proj else None, match_sha)
    if reason:
        block(data, reason)


def fetch_pr(number):
    """PR metadata from `gh pr view`, plus every changed file with its pre-rename path from the REST
    endpoint (`gh pr view --json files` gives only the new path of a rename). None on any error.
    The three timeouts add up to 40 s, under Claude Code's default 60 s hook timeout."""
    try:
        view = subprocess.run(
            ["gh", "pr", "view", number, "--repo", FORK,
             "--json", "headRefName,headRefOid,isCrossRepository,changedFiles"],
            capture_output=True, text=True, timeout=10,
        )
        if view.returncode != 0:
            return None
        pr = json.loads(view.stdout)
        if not isinstance(pr, dict):
            return None
        files = subprocess.run(
            ["gh", "api", "--paginate", "repos/%s/pulls/%s/files" % (FORK, number),
             "--jq", '.[] | [.filename, (.previous_filename // "")] | @tsv'],
            capture_output=True, text=True, timeout=20,
        )
        if files.returncode != 0:
            return None
        rows = []
        for line in files.stdout.splitlines():
            if not line:
                continue
            path, _, previous = line.partition("\t")
            rows.append({"path": path, "previous": previous})
        # The two reads above are separate requests. Read the head again so the file list and the
        # head commit the merge gets pinned to are known to describe the same commit.
        again = subprocess.run(
            ["gh", "pr", "view", number, "--repo", FORK, "--json", "headRefOid"],
            capture_output=True, text=True, timeout=10,
        )
        if again.returncode != 0 or json.loads(again.stdout).get("headRefOid") != pr.get("headRefOid"):
            return None
        pr["files"] = rows
        return pr
    except Exception:
        return None


def word(w):
    return re.compile(r"(?<![A-Za-z0-9_.-])" + re.escape(w) + r"(?![A-Za-z0-9_.-])")


def has_words(text, *words):
    return all(word(w).search(text) for w in words)


def split_segments(cmd):
    """shlex tokens grouped into simple commands (split at ; & | ( ) < > and newlines).
    None when the command cannot be parsed (an unbalanced quote): callers block on None."""
    try:
        lex = shlex.shlex(cmd.replace("\r", "\n").replace("\n", " ; "), posix=True, punctuation_chars=";&|()<>")
        lex.whitespace_split = True
        lex.commenters = ""
        toks = list(lex)
    except ValueError:
        return None
    segs, cur = [], []
    for t in toks:
        if t and all(c in ";&|()<>" for c in t):
            if cur:
                segs.append(cur)
            cur = []
        else:
            cur.append(t)
    if cur:
        segs.append(cur)
    return segs


def project_dir():
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    return os.path.realpath(proj) if proj and os.path.isabs(proj) else None


def rel_to_project(path, proj):
    """Project-relative path with '/' separators, or None when it lies outside the project."""
    if not proj or not isinstance(path, str) or not path:
        return None
    full = os.path.realpath(path if os.path.isabs(path) else os.path.join(proj, path))
    if full != proj and not full.startswith(proj + os.sep):
        return None
    return os.path.relpath(full, proj).replace(os.sep, "/")


def scan_text(text, emails=True, home_paths=True):
    """Kinds of secret or personal data found in `text` (never the matches themselves)."""
    found = [kind for kind, rx in SECRET_RES if rx.search(text)]
    if emails:
        for m in EMAIL_RE.finditer(text):
            local, domain = m.group(0).split("@", 1)[0].lower(), m.group(1).lower()
            if local.startswith("noreply") or domain.endswith("users.noreply.github.com") \
                    or domain in ("example.com", "example.org", "example.net"):
                continue
            found.append("an e-mail address")
            break
    if home_paths and HOME_PATH_RE.search(text):
        found.append("a home-directory path")
    return sorted(set(found))


def read_text(path, limit=16 * 1024 * 1024):
    with open(path, "rb") as f:
        return f.read(limit).decode("utf-8", errors="replace")


# ---- git push (action 3)
def ref_exists(proj, kind, name):
    gitdir = os.path.join(proj, ".git")
    if os.path.isfile(os.path.join(gitdir, "refs", kind, *name.split("/"))):
        return True
    try:
        with open(os.path.join(gitdir, "packed-refs"), encoding="utf-8") as f:
            return any(line.rstrip("\n").endswith(" refs/%s/%s" % (kind, name)) for line in f)
    except OSError:
        return False


def check_push(data, cmd, bare):
    if not has_words(bare, "git", "push"):
        return
    m = PUSH_FORM_RE.fullmatch(cmd)
    if not m:
        block(data, "a push must be the whole command, exactly  git push origin <branch>  or  "
                    "git push origin --delete <branch>  (no refspec, force, --no-verify, tags or other flags)")
    delete, branch = bool(m.group(1)), m.group(2)
    low = branch.lower()
    if low in (DEFAULT_BRANCH, "head") or low.startswith("refs/") or ".." in branch \
            or branch.endswith((".lock", "/")) or "//" in branch:
        block(data, "git push: '%s' cannot be pushed from here (never %s; push a feature branch and open a PR)"
                    % (branch, DEFAULT_BRANCH))
    proj = project_dir()
    if not proj or not os.path.isdir(os.path.join(proj, ".git")):
        block(data, "git push: the repository's .git directory could not be read")
    if ref_exists(proj, "tags", branch):
        block(data, "git push: '%s' is a tag name; tags are pushed by the maintainer" % branch)
    if not delete and not ref_exists(proj, "heads", branch):
        block(data, "git push: '%s' is not a local branch" % branch)


# ---- git add -f, --allow-findings, gh pr/issue create (action 8)
def check_add_and_flags(data, cmd, bare):
    if "--allow-findings" in bare:
        block(data, "--allow-findings is for the maintainer to pass in their own shell")
    if not has_words(bare, "git", "add"):
        return
    segs = split_segments(cmd)
    if segs is None:
        block(data, "git add: the command could not be parsed")
    for seg in segs:
        if not seg or os.path.basename(seg[0]) != "git":
            continue
        # `add` anywhere after git, so a global option with a value (git --namespace x add -f) cannot hide it.
        if "add" not in seg[1:]:
            continue
        for arg in seg[seg.index("add", 1) + 1:]:
            if arg == "--":
                break
            name = arg.split("=", 1)[0]
            long_force = name.startswith("--f") and "--force".startswith(name)
            short_force = arg.startswith("-") and not arg.startswith("--") and "f" in arg[1:]
            if long_force or short_force:
                block(data, "git add -f / --force is refused: it stages ignored files such as artifacts/ingested/")


def check_post(data, cmd, bare):
    if not (has_words(bare, "gh", "create") and (word("pr").search(bare) or word("issue").search(bare))):
        return
    segs = split_segments(cmd)
    if segs is None or len(segs) != 1:
        block(data, "gh pr|issue create must be the whole command, with nothing chained before or after it")
    argv = segs[0]
    if len(argv) < 3 or argv[0] != "gh" or argv[1] not in POST_BODY or argv[2] != "create":
        return
    expected = POST_BODY[argv[1]]
    proj = project_dir()
    bodies, i, args = [], 3, argv
    while i < len(args):
        a = args[i]
        flag = a.split("=", 1)[0]
        if flag in POST_TEXT_FLAGS:
            block(data, "gh %s create: %s is refused; put the text in %s and pass --body-file %s"
                        % (argv[1], flag, expected, expected))
        if flag in ("-F", "--body-file"):
            if "=" in a:
                bodies.append(a.split("=", 1)[1])
            elif i + 1 < len(args):
                bodies.append(args[i + 1])
                i += 1
            else:
                bodies.append("")
        i += 1
    if len(bodies) != 1 or rel_to_project(bodies[0], proj) != expected:
        block(data, "gh %s create: pass exactly one --body-file %s" % (argv[1], expected))
    try:
        body = read_text(os.path.join(proj, expected))
    except OSError:
        block(data, "gh %s create: %s could not be read" % (argv[1], expected))
    found = scan_text(body + "\n" + cmd)
    if found:
        block(data, "gh %s create: the title or %s contains %s. Remove it; posts to GitHub are public"
                    % (argv[1], expected, ", ".join(found)))


# ---- built-in tools with outbound effects (action 5)
def check_send_message(data, ti):
    to = ti.get("to")
    if not (isinstance(to, str) and SUBAGENT_ID_RE.fullmatch(to)):
        block(data, "SendMessage may only continue a subagent this session started (by its id); "
                    "other sessions and peers are not guarded by this project's hooks")


def check_artifact(data, ti):
    action = ti.get("action") or "publish"
    if action != "publish":
        return
    if ti.get("capabilities"):
        block(data, "Artifact: runtime capabilities are a separate step the maintainer approves (see the publish skill)")
    if ti.get("force"):
        block(data, "Artifact: force overwrites a newer version; the maintainer decides that")
    if ti.get("type_url") or ti.get("from_url"):
        block(data, "Artifact: creating from a type or copying from another artifact is not part of /publish")
    paths = []
    if ti.get("file_path"):
        paths.append(ti.get("file_path"))
    paths += [p for p in (ti.get("file_paths") or []) if isinstance(p, str)]
    files = ti.get("files")
    if isinstance(files, dict):
        for v in files.values():
            if isinstance(v, str):
                paths.append(v)
            elif isinstance(v, dict) and isinstance(v.get("from"), str):
                paths.append(v["from"])
    elif isinstance(files, list):
        paths += [v.get("path") for v in files if isinstance(v, dict) and isinstance(v.get("path"), str)]
    if not paths:
        return
    proj = project_dir()
    for p in paths:
        rel = rel_to_project(os.path.join(ti["root"], p) if isinstance(ti.get("root"), str) and not os.path.isabs(str(p))
                             else p, proj)
        if not rel or not rel.startswith("artifacts/publish/"):
            block(data, "Artifact: only files under artifacts/publish/ are published (run /publish, which "
                        "prepares and scans them); refused: %s" % p)
        try:
            found = scan_text(read_text(os.path.join(proj, rel)), emails=False)
        except OSError:
            block(data, "Artifact: %s could not be read for the secret scan" % rel)
        if found:
            block(data, "Artifact: %s contains %s" % (rel, ", ".join(found)))


def check_design_sync(data, ti):
    method = ti.get("method")
    if method == "delete_files":
        block(data, "DesignSync delete_files is refused; delete files in Claude Design yourself")
    proj = project_dir()
    locals_ = []
    if isinstance(ti.get("localDir"), str):
        locals_.append(ti["localDir"])
    for f in ti.get("files") or []:
        if isinstance(f, dict) and isinstance(f.get("localPath"), str):
            locals_.append(f["localPath"])
    for p in locals_:
        rel = rel_to_project(p, proj)
        if not rel or not rel.startswith("design-systems/"):
            block(data, "DesignSync: local paths must be under design-systems/; refused: %s" % p)


# ---- design tokens (action 6)
def is_token_path(rel):
    if not rel:
        return False
    rel = rel.lower()   # the macOS checkout is case-insensitive: Design-Tokens.json is the same file
    parts = rel.split("/")
    return rel == ".claude/design-tokens.json" or (len(parts) == 3 and parts[0] == "design-systems"
                                                   and parts[2] == "tokens.json")


def validate_tokens(obj):
    """None when `obj` is an acceptable token tree, else the first problem found."""
    count = [0]

    def walk(node, path, depth, mode):
        count[0] += 1
        if count[0] > 2000:
            return "more than 2000 values"
        if depth > 5:
            return "%s: nested too deeply" % path
        if isinstance(node, dict):
            if len(node) > 128:
                return "%s: more than 128 keys" % path
            for k, v in node.items():
                if not TOKEN_KEY_RE.fullmatch(str(k)):
                    return "%s: key %r is not a plain name" % (path, str(k)[:40])
                kl = str(k).lower()
                sub = "color" if kl in COLOR_KEYS else "font" if kl in FONT_KEYS else mode
                err = walk(v, "%s.%s" % (path, k), depth + 1, sub)
                if err:
                    return err
            return None
        if isinstance(node, list):
            if len(node) > 64:
                return "%s: more than 64 items" % path
            for i, v in enumerate(node):
                err = walk(v, "%s[%d]" % (path, i), depth + 1, mode)
                if err:
                    return err
            return None
        if isinstance(node, bool) or node is None:
            return None
        if isinstance(node, (int, float)):
            return None if math.isfinite(node) and -10000 <= node <= 10000 else "%s: number out of range" % path
        if isinstance(node, str):
            if any(b in node.lower() for b in TOKEN_STR_BAD):
                return "%s: CSS functions such as url() and data: URLs are not allowed" % path
            words = len(TOKEN_WORD_RE.findall(node))
            if mode == "color":
                return None if COLOR_RE.fullmatch(node) else \
                    "%s: not a colour (#rrggbb, oklch(), rgb() or hsl() with numbers)" % path
            if mode == "font":
                return None if FONT_RE.fullmatch(node) and words <= 12 else "%s: not a plain font name" % path
            if not TOKEN_STR_RE.fullmatch(node) or words > 5:
                return ("%s: only short plain values are allowed (no markup, no CSS outside colours, "
                        "at most 5 words)" % path)
            return None
        return "%s: unsupported value" % path

    if not isinstance(obj, dict):
        return "the top level must be an object"
    return walk(obj, "tokens", 0, None)


def token_problem_in_text(text):
    try:
        obj = json.loads(text)
    except ValueError:
        return "not valid JSON"
    return validate_tokens(obj)


def check_token_write(data, name, ti):
    proj = project_dir()
    rel = rel_to_project(ti.get("file_path") or ti.get("notebook_path"), proj)
    if not is_token_path(rel):
        return
    if name != "Write":
        block(data, "%s: change %s with Write (the whole file), so it can be validated" % (name, rel))
    problem = token_problem_in_text(str(ti.get("content", "")))
    if problem:
        block(data, "%s rejected: %s" % (rel, problem))


def copy_targets(src_abs, dest_abs, dest_is_dir):
    """(source file, landing path) pairs a cp/mv of src_abs to dest_abs could produce. A directory source
    is walked, and both cp layouts (dest/<name>/... when dest exists, dest/... when it does not) are
    returned, so a recursive copy cannot drop a tokens.json past the check. None when there are too many."""
    if not os.path.isdir(src_abs):
        into = os.path.join(dest_abs, os.path.basename(src_abs.rstrip("/")))
        return [(src_abs, into if dest_is_dir else dest_abs)]
    # A directory: cp -R src dest lands in dest/<name>/ when dest exists, in dest/ when it does not or when
    # src ends with "/" (BSD cp). Check both.
    roots = [os.path.join(dest_abs, os.path.basename(src_abs.rstrip("/"))), dest_abs]
    pairs = []
    for base, _dirs, files in os.walk(src_abs):
        for fn in files:
            f = os.path.join(base, fn)
            rel = os.path.relpath(f, src_abs)
            pairs += [(f, os.path.join(r, rel)) for r in roots]
            if len(pairs) > 20000:
                return None
    return pairs


def check_token_copy(data, cmd, bare):
    if not any(word(c).search(bare) for c in COPY_CMDS):
        return
    segs = split_segments(cmd)
    if segs is None:
        block(data, "a copy or move command could not be parsed")
    proj = project_dir()
    for seg in segs:
        if not seg or os.path.basename(seg[0]) not in COPY_CMDS:
            continue
        args = [a for a in seg[1:] if not a.startswith("-")]
        if len(args) < 2:
            continue
        dest, srcs = args[-1], args[:-1]
        # The shell expands $VAR, `...`, ~ and wildcards after this hook has looked at the literal text, so
        # an argument the hook cannot resolve cannot be checked: refuse it.
        if any(("$" in a or "`" in a) for a in args) or (GLOB_CHARS | {"~"}) & set(dest):
            block(data, "%s: no variables, wildcards, braces or ~ in the destination (or variables anywhere); "
                        "name the paths" % seg[0])
        dest_abs = dest if os.path.isabs(dest) else os.path.join(proj or "", dest)
        dest_rel = (rel_to_project(dest_abs, proj) or "").lower()
        guarded = dest_rel == ".claude" or dest_rel.startswith((".claude/", "design-systems")) or dest_rel in ("", ".")
        if guarded and any(GLOB_CHARS & set(a) for a in args):
            block(data, "%s: no wildcards or braces when copying into .claude/ or design-systems/; name the files"
                        % seg[0])
        dest_is_dir = os.path.isdir(dest_abs) or dest.endswith("/")
        for src in srcs:
            src_abs = src if os.path.isabs(src) else os.path.join(proj or "", src)
            pairs = copy_targets(src_abs, dest_abs, dest_is_dir)
            if pairs is None:
                block(data, "%s: %s has too many files to check for token files" % (seg[0], src))
            for src_file, target in pairs:
                trel = rel_to_project(target, proj)
                if not is_token_path(trel):
                    continue
                if os.path.basename(seg[0]) == "ln":
                    block(data, "ln: a token file can't be a link (%s); copy a validated file instead" % trel)
                try:
                    problem = token_problem_in_text(read_text(src_file, 1024 * 1024))
                except OSError:
                    problem = "the source file could not be read"
                if problem:
                    block(data, "copying %s into %s rejected: %s" % (src, trel, problem))


def session_start(data):
    problem = verify_pins()
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    audit({
        "ts": now(),
        "event": "session_start",
        "session_id": data.get("session_id"),
        "git_head": git_head(proj) if proj else None,
        "hooks_pinned": problem is None,
        "problem": problem,
    })
    if problem:
        msg = ("WARNING: hook integrity check failed (%s). Every tool call will be blocked until a "
               "person re-runs bash .claude/hooks/test-guard.sh and re-pins hooks.sha256. Tell the user." % problem)
        print(msg)
        sys.stderr.write(msg + "\n")
    sys.exit(0)


def block(data, reason):
    audit(call_record(data, "deny", reason))
    sys.stderr.write("blocked by guard-tools: %s\n" % reason)
    sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
        if not isinstance(data, dict):
            raise ValueError("hook input is not an object")
    except Exception:
        sys.stderr.write("blocked by guard-tools: could not parse hook input\n")
        sys.exit(2)

    if "--session-start" in sys.argv[1:]:
        session_start(data)

    name = str(data.get("tool_name", ""))
    problem = verify_pins()
    if problem:
        block(data, "hook integrity check failed: %s. A person must re-run bash .claude/hooks/test-guard.sh "
                    "and re-pin .claude/hooks/hooks.sha256 (see SECURITY.md)" % problem)
    if name in DENIED_BUILTIN:
        block(data, "%s is not used in this project (WebFetch/WebSearch would bypass the ingest gate and the "
                    "browser scope; Monitor runs shell commands that guard-bash.sh never inspects)" % name)
    if name.startswith("mcp__"):
        if not ALLOWED_MCP.match(name):
            block(data, "MCP tool %s is not on this project's allowlist (ALLOWED_MCP in .claude/hooks/guard-tools.py; "
                        "a person edits it)" % name)
    elif name not in ALLOWED_TOOLS:
        block(data, "tool %s is not on this project's allowlist (ALLOWED_TOOLS in .claude/hooks/guard-tools.py; "
                    "a person edits it)" % name)
    ti = data.get("tool_input") if isinstance(data.get("tool_input"), dict) else {}
    if name == "SendMessage":
        check_send_message(data, ti)
    elif name == "Artifact":
        check_artifact(data, ti)
    elif name == "DesignSync":
        check_design_sync(data, ti)
    elif name in ("Write", "Edit", "MultiEdit"):
        check_token_write(data, name, ti)
    cmd = tool_command(data)
    if cmd is not None:
        bare = cmd.replace('"', "").replace("'", "")
        check_merge(data)
        check_push(data, cmd, bare)
        check_post(data, cmd, bare)
        check_add_and_flags(data, cmd, bare)
        check_token_copy(data, cmd, bare)
    audit(call_record(data, "allow", ""))
    sys.exit(0)


if __name__ == "__main__":
    main()
