#!/usr/bin/env bash
# PreToolUse guard for the Bash tool.
# Blocks commands that could exfiltrate data, run arbitrary code, or write
# outside the project's scratch areas — independent of permission-pattern
# semantics. Every rule is a positive allowlist where the workflow needs the
# command at all (curl, node, python3, open, rm, gh, zip/unzip, cp/mv/mkdir)
# and a denylist for everything the workflow never needs.
#
#   exit 0  -> allow
#   exit 2  -> block, message on stderr is shown to Claude
#
# The guard inspects the unparsed command string, per pipeline segment. It
# cannot tell a command from prose, so a quoted string that contains `curl`,
# a backtick, `$(` or `..` is blocked too. Use the Read/Grep/Edit tools for
# such text instead of echo/rg/sed.
#
# Fails closed: any internal error blocks the command.
# Self-test: bash .claude/hooks/test-guard.sh
set -euo pipefail
trap 'echo "blocked by guard-bash: internal error while inspecting command" >&2; exit 2' ERR

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"

deny() { echo "blocked by guard-bash: $1" >&2; exit 2; }

if (( ${#cmd} > 20000 )); then deny "command longer than 20000 characters"; fi

# ---------------------------------------------------------------- 0. normalise
# Mask the project dir so absolute in-project paths (what `realpath` prints) read as PROJECT_DIR/...
proj="${CLAUDE_PROJECT_DIR:-}"
if [[ -n "$proj" && "$proj" == /* ]]; then cmd="${cmd//"$proj"/PROJECT_DIR}"; fi
# \curl, \rm and friends bypass aliases, not this guard.
cmd="${cmd//\\/}"

# ---------------------------------------------------------------- 1. whole-command rules
re_subst='\$\(|`|<\(|>\('
if [[ "$cmd" =~ $re_subst ]]; then deny "command / process substitution"; fi

re_traverse='(^|[^A-Za-z0-9.])\.\.(/|[[:space:]"'"'"']|$)'
if [[ "$cmd" =~ $re_traverse ]]; then deny "'..' path traversal"; fi

# Paths that hold credentials or shell startup state — never readable or writable from here.
re_secret='(~|\$HOME|/Users/[^/[:space:]"'"'"']+|/home/[^/[:space:]"'"'"']+|/root|/var/root)/(\.(ssh|aws|gnupg|gpg|config|claude|netrc|npmrc|pypirc|docker|kube|zsh|bash|profile|zprofile|zshenv|gitconfig|git-credentials|env|local)|Library/(Keychains|Cookies|Application Support|Mail|Messages|Safari|Group Containers|Containers))'
re_secret2='(^|[[:space:]/"'"'"'=])(\.env([./"'"'"'[:space:]]|$)|\.git-credentials|id_(rsa|ed25519|ecdsa|dsa)|credentials|[^[:space:]/]+\.(pem|p12|pfx|key)([[:space:]"'"'"']|$))|/proc/|/dev/(tcp|udp)/'
if [[ "$cmd" =~ $re_secret ]] || [[ "$cmd" =~ $re_secret2 ]]; then deny "credential / dotfile path"; fi

# rm: only the ingest scratch dir, as the whole command (never combined with anything else)
re_rm='(^|[[:space:];&|(/])rm([[:space:]]|$)'
if [[ "$cmd" =~ $re_rm ]]; then
  re_rm_ok='^[[:space:]]*rm[[:space:]]+-rf?[[:space:]]+/tmp/cd-ingest-[A-Za-z0-9._-]+/?[[:space:]]*$'
  if ! [[ "$cmd" =~ $re_rm_ok ]]; then deny "rm outside /tmp/cd-ingest-* (or combined with other commands)"; fi
fi

# ---------------------------------------------------------------- 2. split into segments
# Separators inside quotes are neutralised first so "?ids=1:2&depth=2" does not become a segment.
neutralised=""
in_sq=0; in_dq=0
for ((i = 0; i < ${#cmd}; i++)); do
  c="${cmd:i:1}"
  if (( in_sq )); then
    if [[ "$c" == "'" ]]; then in_sq=0; fi
    case "$c" in ';'|'&'|'|'|'('|')'|$'\n') c='_' ;; esac
  elif (( in_dq )); then
    if [[ "$c" == '"' ]]; then in_dq=0; fi
    case "$c" in ';'|'&'|'|'|'('|')'|$'\n') c='_' ;; esac
  else
    if [[ "$c" == "'" ]]; then in_sq=1; elif [[ "$c" == '"' ]]; then in_dq=1; fi
  fi
  neutralised+="$c"
done
segs="${neutralised//&&/$'\n'}"
segs="${segs//||/$'\n'}"
segs="${segs//[;&|()]/$'\n'}"

# "start of a command word" inside a segment: segment start, whitespace, or a path separator
W='(^|[[:space:]/=])'

# Every path argument of these commands must stay inside the project.
re_path_cmds="${W}(cp|mv|mkdir|touch|zip|monolith|node|gh|git)([[:space:]]|$)"
path_ok() {
  # relative path without a leading / ~ $ or -, or an absolute in-project / ingest-scratch path
  local t="$1"
  t="${t//[\"\']/}"
  [[ -z "$t" ]] && return 0
  case "$t" in
    PROJECT_DIR/*|/tmp/cd-ingest-*) ;;
    /*|~*|\$*) return 1 ;;
  esac
  t="${t#PROJECT_DIR/}"
  case "$t" in
    .claude/hooks*|.claude/settings*|.mcp.json*|.git/*) return 1 ;;
    scripts/*) [[ "$2" == node ]] || return 1 ;;   # node may run them; nothing may write them
  esac
  return 0
}

segidx=-1
while IFS= read -r seg || [[ -n "$seg" ]]; do
  [[ "$seg" =~ ^[[:space:]]*$ ]] && continue
  segidx=$((segidx + 1))
  first="${seg#"${seg%%[![:space:]]*}"}"   # ltrim
  first="${first%%[[:space:]]*}"           # first word

  # ---- command position
  case "$first" in
    \$*) deny "variable as command" ;;
    .|*/*|~*) deny "path as command (only bare command names are allowed)" ;;
  esac
  re_assign='^[A-Za-z_][A-Za-z0-9_]*='
  if [[ "$first" =~ $re_assign ]]; then deny "assignment at command position"; fi

  # ---- wrappers that run another command
  re_wrap='^(xargs|time|nohup|nice|ionice|command|builtin|sudo|doas|su|env|timeout|watch|caffeinate|script|expect|exec|eval|source|chroot|strace|dtruss|ltrace)$'
  if [[ "$first" =~ $re_wrap ]]; then deny "command wrapper: $first"; fi
  re_find_exec='(^|[[:space:]])-(exec|execdir|ok|okdir|delete)([[:space:]]|$)'
  if [[ "$seg" =~ $re_find_exec ]]; then deny "find -exec / -delete"; fi

  # ---- interpreters: node and python3 only for the documented invocations
  re_node="${W}(node|nodejs)([[:space:]]|$)"
  if [[ "$seg" =~ $re_node ]]; then
    re_node_ok='^[[:space:]]*node[[:space:]]+(scripts/(export-pdf|export-pptx|make-assets-index)\.mjs([[:space:]]|$)|--check[[:space:]]+[^[:space:]-][^[:space:]]*[[:space:]]*$|(--version|-v)[[:space:]]*$)'
    if ! [[ "$seg" =~ $re_node_ok ]]; then deny "node: only scripts/export-pdf.mjs, scripts/export-pptx.mjs, scripts/make-assets-index.mjs, --check <file>, --version"; fi
  fi
  re_py="${W}python[0-9.]*([[:space:]]|$)"
  if [[ "$seg" =~ $re_py ]]; then
    re_py_ok='^[[:space:]]*python3?[0-9.]*[[:space:]]+(-m[[:space:]]+http\.server[[:space:]]+[0-9]+[[:space:]]+--bind[[:space:]]+127\.0\.0\.1[[:space:]]+--directory[[:space:]]+artifacts/?[[:space:]]*$|(--version|-V)[[:space:]]*$)'
    if ! [[ "$seg" =~ $re_py_ok ]]; then deny "python: only 'python3 -m http.server <port> --bind 127.0.0.1 --directory artifacts' or --version"; fi
  fi
  re_shell="${W}(sh|bash|zsh|dash|ksh|fish|csh|tcsh|osascript|perl|ruby|php|deno|bun|tclsh|lua|swift|Rscript|awk|gawk|nawk|mawk|jq)([[:space:]]|$)"
  if [[ "$seg" =~ $re_shell ]]; then
    re_selftest='^[[:space:]]*bash[[:space:]]+(PROJECT_DIR/)?\.claude/hooks/test-guard\.sh[[:space:]]*$'
    if ! [[ "$cmd" =~ $re_selftest ]]; then deny "shell / script interpreter (only 'bash .claude/hooks/test-guard.sh' is allowed)"; fi
  fi

  # ---- package managers, build tools, nested agents
  re_pkg="${W}(npm|npx|yarn|pnpm|bun|pip|pip3|pipx|uv|brew|port|gem|cargo|go|make|cmake|docker|podman|nix)([[:space:]]|$)"
  if [[ "$seg" =~ $re_pkg ]]; then deny "package manager / build tool"; fi
  re_claude="${W}claude([[:space:]]|$)"
  if [[ "$seg" =~ $re_claude ]]; then
    re_claude_ok='^[[:space:]]*claude[[:space:]]+(mcp[[:space:]]+list|--version|-v)[[:space:]]*$'
    if ! [[ "$seg" =~ $re_claude_ok ]]; then deny "claude: only 'claude mcp list' and --version"; fi
  fi

  # ---- network / remote tools
  re_net="${W}(wget|nc|ncat|netcat|socat|ssh|scp|sftp|rsync|telnet|ftp|tftp|openssl|dig|nslookup|host|ping|traceroute|networksetup|scutil|aria2c|http|https|httpie|lynx|w3m|links)([[:space:]]|$)"
  if [[ "$seg" =~ $re_net ]]; then deny "network tool"; fi

  # ---- system state, clipboard, keychain, in-place editors
  re_sys="${W}(dd|truncate|install|ln|chmod|chown|chflags|xattr|crontab|launchctl|defaults|shred|mkfifo|mount|umount|diskutil|hdiutil|security|pbcopy|pbpaste|screencapture|tee|kill|killall|reboot|shutdown|halt|systemctl|service|automator|plutil|sqlite3|patch|ed|ex|vi|vim|nano|emacs)([[:space:]]|$)"
  if [[ "$seg" =~ $re_sys ]]; then deny "system / clipboard / keychain / editor command"; fi
  re_sed_i="${W}sed[[:space:]]+([^[:space:]]+[[:space:]]+)*(-[a-zA-Z]*i|--in-place)"
  if [[ "$seg" =~ $re_sed_i ]]; then deny "sed -i"; fi
  re_pkill="${W}pkill([[:space:]]|$)"
  if [[ "$seg" =~ $re_pkill ]]; then
    re_pkill_ok='^[[:space:]]*pkill[[:space:]]+-f[[:space:]]+http\.server\.[0-9]+[[:space:]]*$'
    if ! [[ "$seg" =~ $re_pkill_ok ]]; then deny "pkill: only 'pkill -f http.server.<port>'"; fi
  fi

  # ---- secrets to stdout
  re_env="${W}(printenv|env|set|export|declare|typeset|compgen)([[:space:]]|$)"
  if [[ "$seg" =~ $re_env ]]; then deny "environment dump"; fi
  re_echo_tok='(echo|printf)[^\n]*\$\{?[A-Z_]*(TOKEN|SECRET|KEY|PASS|PWD|HOME)'
  if [[ "$seg" =~ $re_echo_tok ]]; then deny "printing a secret-looking variable"; fi
  re_b64='base64[[:space:]]+(-d|-D|--decode)|xxd[[:space:]]+-r'
  if [[ "$seg" =~ $re_b64 ]]; then deny "base64 / hex decode"; fi

  # ---- redirects: the only allowed targets are /dev/null and other descriptors
  redir="$seg"
  re_redir_ok='[0-9]?&?>>?[[:space:]]*(/dev/null|&[0-9]+)'
  while [[ "$redir" =~ $re_redir_ok ]]; do redir="${redir/"${BASH_REMATCH[0]}"/ }"; done
  if [[ "$redir" == *'>'* ]]; then deny "redirect to a file (use the Write tool)"; fi

  # ---- URLs only in curl / open / xdg-open segments (checked below)
  re_url='[A-Za-z][A-Za-z0-9+.-]*://'
  re_url_cmd="${W}(curl|open|xdg-open)([[:space:]]|$)"
  if [[ "$seg" =~ $re_url ]] && ! [[ "$seg" =~ $re_url_cmd ]]; then deny "URL in a command that does not take one"; fi

  # ---- curl: one allowlisted URL, GET only, output only under artifacts/ingested/
  re_curl="${W}curl([[:space:]]|$)"
  if [[ "$seg" =~ $re_curl ]]; then
    re_curl_pos='^[[:space:]]*curl[[:space:]]'
    if ! [[ "$seg" =~ $re_curl_pos ]] || (( segidx > 0 )); then deny "curl must be the first command (nothing piped into it)"; fi
    c="$seg"
    re_figma='https://api\.figma\.com/[^[:space:]]*'
    re_local='http://127\.0\.0\.1(:[0-9]+)?(/[^[:space:]]*)?'
    while [[ "$c" =~ $re_figma ]]; do c="${c/"${BASH_REMATCH[0]}"/ ALLOWED_URL }"; done
    while [[ "$c" =~ $re_local ]]; do c="${c/"${BASH_REMATCH[0]}"/ ALLOWED_URL }"; done
    re_q='"[^"]*"|'"'"'[^'"'"']*'"'"
    while [[ "$c" =~ $re_q ]]; do c="${c/"${BASH_REMATCH[0]}"/ QSTR }"; done
    urls=0; outs=0; expect=""
    read -r -a toks <<< "$c"
    for t in "${toks[@]:1}"; do
      if [[ -n "$expect" ]]; then
        case "$expect" in
          H) [[ "$t" == QSTR || "$t" != -* ]] || deny "curl -H value";;
          o) [[ "$t" == artifacts/ingested/* ]] || deny "curl -o: output must be under artifacts/ingested/";;
        esac
        expect=""; continue
      fi
      case "$t" in
        ALLOWED_URL) urls=$((urls + 1)) ;;
        -H) expect=H ;;
        -o) expect=o; outs=$((outs + 1)) ;;
        -s|-S|-sS|-Ss|-I|-sI|-L|-f|-sSf|-sSL|-sSfL|-sL|-sf|--silent|--show-error|--head|--fail|--location) ;;
        *) deny "curl: argument '$t' is not allowed (allowed: one https://api.figma.com/ or http://127.0.0.1:<port>/ URL, -s -S -I -L -f, -H <quoted>, -o artifacts/ingested/<file>)" ;;
      esac
    done
    if (( urls != 1 )); then deny "curl: exactly one allowlisted URL required"; fi
    if (( outs > 1 )); then deny "curl: more than one -o"; fi
  fi

  # ---- open / xdg-open: only .html inside the project, or the local server
  re_open="${W}(open|xdg-open)([[:space:]]|$)"
  if [[ "$seg" =~ $re_open ]]; then
    re_open_ok='^[[:space:]]*(open|xdg-open)[[:space:]]+(file://"PROJECT_DIR/[^"]*\.html?([?#][^"]*)?"|"file://PROJECT_DIR/[^"]*\.html?([?#][^"]*)?"|file://PROJECT_DIR/[^[:space:]"'"'"']*\.html?([?#][^[:space:]"'"'"']*)?|"?http://127\.0\.0\.1:[0-9]+(/[^[:space:]"]*)?"?)[[:space:]]*$'
    if ! [[ "$seg" =~ $re_open_ok ]]; then deny "open: only file://<project>/…/*.html or http://127.0.0.1:<port>/… (one URL, nothing else)"; fi
  fi

  # ---- gh / git
  re_gh="${W}gh([[:space:]]|$)"
  re_which_gh='^[[:space:]]*which[[:space:]]+gh[[:space:]]*$'
  if [[ "$seg" =~ $re_gh ]] && ! [[ "$seg" =~ $re_which_gh ]]; then
    re_gh_ok='^[[:space:]]*gh[[:space:]]+(repo[[:space:]]+(clone|fork)[[:space:]]|auth[[:space:]]+status([[:space:]]|$)|(--version|-v)[[:space:]]*$|pr[[:space:]]|issue[[:space:]])'
    if ! [[ "$seg" =~ $re_gh_ok ]]; then deny "gh: only repo clone, repo fork, auth status, pr, issue, --version"; fi
  fi
  re_git="${W}git([[:space:]]|$)"
  if [[ "$seg" =~ $re_git ]]; then
    re_git_cfg='^[[:space:]]*git[[:space:]]+config[[:space:]]'
    re_git_cfg_ok='^[[:space:]]*git[[:space:]]+config[[:space:]]+(--get|--list|-l|--show-origin)([[:space:]]|$)'
    re_git_bad='^[[:space:]]*git[[:space:]]+(-c[[:space:]]|-C[[:space:]]|--git-dir|--work-tree|--exec-path|clone|daemon|send-email|svn|instaweb|filter-branch|filter-repo|submodule|difftool|mergetool|bisect|credential|remote[[:space:]]+(add|set-url|rename)|(push|fetch|pull)[[:space:]]+[^\n]*(://|@)|rebase[[:space:]]+[^\n]*(--exec|-x[[:space:]]))'
    if [[ "$seg" =~ $re_git_bad ]]; then deny "git: remote URLs, config writes, clone, submodules, external tools and --exec are not allowed"; fi
    if [[ "$seg" =~ $re_git_cfg ]] && ! [[ "$seg" =~ $re_git_cfg_ok ]]; then deny "git config: read-only (--get, --list)"; fi
  fi

  # ---- zip / unzip
  re_zip="${W}zip([[:space:]]|$)"
  if [[ "$seg" =~ $re_zip ]]; then
    re_zip_ok='^[[:space:]]*zip[[:space:]]+(-[a-zA-Z0-9]+[[:space:]]+)*(handoff/|artifacts/)[^[:space:]]+([[:space:]]+(handoff/|artifacts/)[^[:space:]]+)*[[:space:]]*$'
    if ! [[ "$seg" =~ $re_zip_ok ]]; then deny "zip: archive and inputs must all be under handoff/ or artifacts/"; fi
  fi
  re_unzip="${W}unzip([[:space:]]|$)"
  if [[ "$seg" =~ $re_unzip ]]; then
    re_unzip_ok='^[[:space:]]*unzip[[:space:]]+(-p|-l|-Z)[[:space:]]'
    re_unzip_d='(^|[[:space:]])-[a-zA-Z]*d([[:space:]]|$)'
    if ! [[ "$seg" =~ $re_unzip_ok ]] || [[ "$seg" =~ $re_unzip_d ]]; then deny "unzip: only -p (to stdout) or -l (list) are allowed"; fi
  fi

  # ---- cp / mv / mkdir / touch / zip / monolith / node / gh / git: every path stays inside the project
  if [[ "$seg" =~ $re_path_cmds ]]; then
    read -r -a toks <<< "$seg"
    for t in "${toks[@]:1}"; do
      [[ "$t" == -* ]] && continue
      if ! path_ok "$t" "$first"; then deny "path argument '$t' is outside the project (or a protected file)"; fi
    done
  fi
done <<< "$segs"

exit 0
