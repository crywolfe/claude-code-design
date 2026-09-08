#!/usr/bin/env bash
# PreToolUse guard for the Bash tool.
# Blocks commands that could exfiltrate data, run arbitrary code, or escape the
# project's scratch areas — independent of permission-pattern semantics.
#
#   exit 0  -> allow
#   exit 2  -> block, message on stderr is shown to Claude
#
# Fails closed: any internal error blocks the command.
set -euo pipefail
trap 'echo "blocked by guard-bash: internal error while inspecting command" >&2; exit 2' ERR

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"

deny() { echo "blocked by guard-bash: $1" >&2; exit 2; }

# "start of a command word": string start, or after ; & | ( or whitespace
W='(^|[[:space:];&|(])'

# ---------------------------------------------------------------- curl
# Only GET requests to api.figma.com or the local preview server.
re_curl="${W}curl([[:space:]]|\$)"
if [[ "$cmd" =~ $re_curl ]]; then
  re_figma='https://api\.figma\.com/'
  re_local='http://127\.0\.0\.1(:[0-9]+)?/'
  if ! [[ "$cmd" =~ $re_figma ]] && ! [[ "$cmd" =~ $re_local ]]; then
    deny "curl to non-allowlisted host (allowed: https://api.figma.com/, http://127.0.0.1:<port>/)"
  fi
  # whole-flag match so -F inside "X-FIGMA-TOKEN" and -T inside "-TOKEN" do not trip it
  re_upload='(^|[[:space:]])(-d|--data|--data-binary|--data-raw|--data-urlencode|-F|--form|--form-string|-T|--upload-file|-X|--request|-K|--config)([[:space:]=]|$)'
  if [[ "$cmd" =~ $re_upload ]]; then deny "curl upload/method flag"; fi
  re_at='[[:space:]]@[^[:space:]]'
  if [[ "$cmd" =~ $re_at ]]; then deny "curl @file argument"; fi
fi

# ---------------------------------------------------------------- inline interpreters
re_node="${W}(node|nodejs)[[:space:]]+(-e|--eval|-p|--print|--input-type|-r|--require|--import)([[:space:]=]|\$)"
if [[ "$cmd" =~ $re_node ]]; then deny "node inline evaluation"; fi

re_py="${W}python[0-9.]*[[:space:]]+-[a-zA-Z]*c([[:space:]]|\$)"
if [[ "$cmd" =~ $re_py ]]; then deny "python -c"; fi

re_shc="${W}(sh|bash|zsh|dash|ksh)[[:space:]]+-[a-zA-Z]*c([[:space:]]|\$)"
if [[ "$cmd" =~ $re_shc ]]; then deny "shell -c"; fi

# ---------------------------------------------------------------- network / remote tools
re_net="${W}(wget|nc|ncat|socat|ssh|scp|sftp|rsync|telnet|ftp)([[:space:]]|\$)"
if [[ "$cmd" =~ $re_net ]]; then deny "network tool"; fi

# ---------------------------------------------------------------- shell tricks that bypass prefix matching
re_subst='\$\(|`|<\('
if [[ "$cmd" =~ $re_subst ]]; then deny "command / process substitution"; fi
re_eval="${W}(eval|exec|source)[[:space:]]"
if [[ "$cmd" =~ $re_eval ]]; then deny "eval / exec / source"; fi
re_b64='base64[[:space:]]+(-d|-D|--decode)'
if [[ "$cmd" =~ $re_b64 ]]; then deny "base64 decode"; fi

# ---------------------------------------------------------------- secrets to stdout
re_env="${W}(printenv|env|set|export)([[:space:]]|\$)"
if [[ "$cmd" =~ $re_env ]]; then deny "environment dump"; fi
re_echo_tok='(echo|printf)[^|;&]*\$\{?[A-Z_]*(TOKEN|SECRET|KEY|PASS)'
if [[ "$cmd" =~ $re_echo_tok ]]; then deny "printing a secret-looking variable"; fi

# ---------------------------------------------------------------- writes outside the project via redirection
re_redir='(>|>>|\|[[:space:]]*tee([[:space:]]+-a)?)[[:space:]]*(~|\$HOME|/Users/|/home/|/etc/|/usr/|/opt/|/Library/)'
if [[ "$cmd" =~ $re_redir ]]; then deny "redirect outside the project"; fi

# ---------------------------------------------------------------- open: only artifacts and the local server
re_open="${W}(open|xdg-open)[[:space:]]"
if [[ "$cmd" =~ $re_open ]]; then
  re_open_ok="${W}(open|xdg-open)[[:space:]]+[\"']?(file://|http://127\\.0\\.0\\.1[:/])"
  if ! [[ "$cmd" =~ $re_open_ok ]]; then deny "open: only file:// artifacts or http://127.0.0.1:<port> are allowed"; fi
fi

# ---------------------------------------------------------------- rm: only the ingest scratch dir, as the whole command
re_rm="${W}rm[[:space:]]"
if [[ "$cmd" =~ $re_rm ]]; then
  re_rm_ok='^[[:space:]]*rm[[:space:]]+-rf?[[:space:]]+/tmp/cd-ingest-[A-Za-z0-9._-]+/?[[:space:]]*$'
  if ! [[ "$cmd" =~ $re_rm_ok ]]; then deny "rm outside /tmp/cd-ingest-* (or combined with other commands)"; fi
fi

exit 0
