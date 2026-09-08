#!/usr/bin/env python3
"""PreToolUse guard for Chrome DevTools MCP navigation and script tools.

Enforces the CLAUDE.md "Browser scope" rule mechanically:
  - navigate_page / new_page may only load file:// pages inside this project
    or http://127.0.0.1:<port>/... (the /serve server).
  - navigate_page may not inject an initScript.
  - evaluate_script may not save its output to a file (filePath) and its
    function may not open network connections, navigate, or inject elements.

  exit 0 -> allow
  exit 2 -> block, message on stderr is shown to Claude

Fails closed: any parse error or missing CLAUDE_PROJECT_DIR blocks the call.
"""
import json
import os
import re
import sys
from urllib.parse import unquote, urlsplit

NET_RE = re.compile(
    r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|"
    r"SharedWorker|serviceWorker|RTCPeerConnection|Image)\s*\(|"
    r"\bnew\s+(Image|Worker|WebSocket|EventSource|XMLHttpRequest|RTCPeerConnection)\b|"
    r"\bimport\s*\(|"
    r"\bwindow\s*\.\s*open\s*\(|"
    r"\blocation\s*\.\s*(href|assign|replace|host|hostname|protocol|pathname|search)\b|"
    r"\bdocument\s*\.\s*(location|write|writeln|cookie)\b|"
    r"\.(src|srcset|href|action|srcdoc)\s*=|"
    r"\bcreateElement\s*\(\s*['\"](script|iframe|img|link|object|embed|form|video|audio|source)['\"]|"
    r"\b(insertAdjacentHTML|outerHTML|innerHTML)\s*[=(]|"
    r"\bnavigator\s*\.\s*(clipboard|credentials|geolocation|mediaDevices|share)\b|"
    r"\b(localStorage|sessionStorage|indexedDB|caches)\b|"
    r"\bsubmit\s*\(",
    re.IGNORECASE,
)


def deny(msg):
    sys.stderr.write("blocked by guard-browser: %s\n" % msg)
    sys.exit(2)


def project_dir():
    p = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not p or not os.path.isabs(p):
        deny("CLAUDE_PROJECT_DIR is not set; refusing to navigate")
    return os.path.realpath(p)


def check_url(url):
    if not isinstance(url, str) or not url:
        deny("url is required")
    if url == "about:blank":
        return
    parts = urlsplit(url)
    if parts.scheme == "file":
        if parts.netloc not in ("", "localhost"):
            deny("file:// URL with a host")
        path = os.path.realpath(unquote(parts.path))
        root = project_dir()
        if path != root and not path.startswith(root + os.sep):
            deny("file:// path is outside the project: %s" % path)
        if "/.claude/" in path + "/" or "/.git/" in path + "/" or "/node_modules/" in path + "/":
            deny("file:// path inside a protected directory")
        return
    if parts.scheme == "http" and parts.hostname == "127.0.0.1":
        return
    deny("only file://<project>/... and http://127.0.0.1:<port>/... may be opened (got %s)" % url)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        deny("could not parse hook input")
    name = str(data.get("tool_name", ""))
    inp = data.get("tool_input") or {}
    if not isinstance(inp, dict):
        deny("tool_input is not an object")

    if name.endswith("navigate_page"):
        if inp.get("initScript"):
            deny("navigate_page with initScript")
        kind = inp.get("type", "url")
        if kind in ("back", "forward", "reload") and not inp.get("url"):
            return
        check_url(inp.get("url"))
        return

    if name.endswith("new_page"):
        check_url(inp.get("url"))
        return

    if name.endswith("evaluate_script"):
        if inp.get("filePath"):
            deny("evaluate_script filePath (writes a file outside the Write tool)")
        fn = inp.get("function", "")
        if not isinstance(fn, str):
            deny("function is not a string")
        m = NET_RE.search(fn)
        if m:
            deny("evaluate_script function uses '%s' (network, navigation, storage or DOM injection)" % m.group(0).strip())
        return

    # Any other tool routed here by a broad matcher: allow.
    return


if __name__ == "__main__":
    main()
