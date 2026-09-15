---
description: Start a local http server on 127.0.0.1:4567 to avoid file:// CORS issues. Required for React/Babel artifacts that load external .jsx files.
argument-hint: [port]
allowed-tools: Bash(python3 -m http.server:*) Bash(lsof -i:*) Bash(sleep:*) Bash(curl -s -I http://127.0.0.1:*) Bash(mkdir -p artifacts) Bash(pkill -f http.server:*)
---

# Serve

Start a local http server on port `$0` (default 4567). Needed for any artifact that loads external `.jsx` through `<script src>` + `type="text/babel"` — Babel-standalone uses XHR, which fails on `file://` due to CORS.

## Steps

1. Port: `${0:-4567}`. Check free: `Bash(lsof -i :<port>)` — exit code 0 means busy, 1 means free. If busy → try `<port>+1` up to `+5`.
2. `Bash(mkdir -p artifacts)`, then start with `run_in_background`: `Bash(python3 -m http.server <port> --bind 127.0.0.1 --directory artifacts)`. The server root is `artifacts/` only — never the project root, which would expose `.claude/`, `node_modules/`, and local settings.
3. Verify: `Bash(sleep 1)` then `Bash(curl -s -I http://127.0.0.1:<port>/)` → first line `HTTP/1.0 200 OK`
4. Report:
   ```
   Server up at http://127.0.0.1:<port> (root: artifacts/)
   Use http://127.0.0.1:<port>/<name>.html for /preview or /done.
   Stop at end of session: pkill -f http.server.<port>
   ```
5. Stop the server at the end of the session: `Bash(pkill -f http.server.<port>)`.

## Notes

- Runs in background — does not block the session
- One server per project is enough; subsequent `/serve` calls just report existing port if already up
- `--bind 127.0.0.1` keeps it loopback-only (not on the network)
- `--directory artifacts` keeps it scoped — starters are copied into the artifact directory anyway, so nothing outside `artifacts/` needs serving
