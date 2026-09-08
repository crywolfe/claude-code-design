---
name: use-design-system
description: Explicitly load a design system from the project-local registry at design-systems/<name>/ for the current project. Use when user says "use the Acme design system", "apply company-x tokens", or similar.
argument-hint: <design-system-name>
allowed-tools: Read Write Bash(ls design-systems:*) Bash(test -d design-systems/:*) Bash(mkdir -p .claude) Bash(cp design-systems/:*)
---

# Use Design System

Load a design system from the project-local registry `design-systems/<name>/` (gitignored) into `.claude/design-tokens.json`.

## Steps

1. If `$0` (name) is missing → `Bash(ls design-systems/ 2>/dev/null)` and show the list, ask which one. `$0` must be a plain folder name (letters, digits, `-`, `_`) — reject anything containing `/` or `..`.

2. Verify the folder exists:
   `Bash(test -d design-systems/$0)` — exit code 0 = ok.
   If missing → tell the user, list what's available, stop.

3. Read the tokens file:
   `Read design-systems/$0/tokens.json`

4. Copy to project-level for faster subsequent reads:
   ```
   Bash(mkdir -p .claude)
   Bash(cp design-systems/$0/tokens.json .claude/design-tokens.json)
   ```

5. If `design-systems/$0/preview.html` exists, offer to open it for visual reference via `/preview design-systems/$0/preview.html` — lets the user remember what the system looks like before starting work.

6. Report: "Loaded design system `$0` — colors, fonts, spacing, radii written to `.claude/design-tokens.json`. Subsequent `/make-deck`, `/interactive-prototype`, `/wireframe` will use it automatically."

## When to NOT use this skill

- User is extracting a **new** system from a codebase / screenshot / Figma → use `/create-design-system` instead
- User explicitly said "ignore existing, I want something fresh" → route to `/create-design-system` with "from scratch" mode

## Registry format reminder

```
design-systems/
├── acme/
│   ├── tokens.json           # required
│   └── preview.html          # optional
├── company-x/
│   └── tokens.json
└── minimal-mono/
    └── tokens.json
```

`tokens.json` schema:
```json
{
  "name": "acme",
  "colors": { "primary": "#D97757", "accent": "...", "bg": "...", "text": "..." },
  "fonts": { "display": "...", "body": "...", "mono": "..." },
  "spacing": [4, 8, 12, 16, 24, 32, 48, 64],
  "radii": { "sm": 4, "md": 8, "lg": 16 },
  "shadows": [...]
}
```
