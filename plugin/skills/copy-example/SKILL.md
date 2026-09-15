---
name: copy-example
description: Generate a working demo artifact on dummy content so the user can see a reference implementation. Use when user says "show me an example deck", "what does a prototype look like", "give me a starter", "I want to see an example of X". Generates live — not from a static gallery.
argument-hint: <kind: deck|prototype|wireframe|animation|design-system>
allowed-tools: Read Write Edit Glob Grep Bash(cp "${CLAUDE_PLUGIN_ROOT}"/starters/:*) Bash(cp artifacts/:*) Bash(mkdir -p artifacts:*) Bash(ls design-systems:*) Bash(open file://:*) Bash(open http://127.0.0.1:*) Bash(xdg-open file://:*) Bash(xdg-open http://127.0.0.1:*) mcp__chrome-devtools__navigate_page mcp__chrome-devtools__take_screenshot mcp__chrome-devtools__take_snapshot mcp__chrome-devtools__list_console_messages
---

# Copy Example

Build a working reference artifact in `artifacts/examples/<kind>-<timestamp>/` using a realistic dummy brief, so the user can see the format, then copy-paste or edit to kickstart their own work.

Unlike a static gallery (files pre-authored), this skill runs the actual workflow skill on a curated brief — the output is always up-to-date with current starters and conventions.

## Steps

1. Parse `$0` (kind): one of `deck`, `prototype`, `wireframe`, `animation`, `design-system`. If omitted or invalid → show supported kinds and ask.

2. Pick a canned brief from the matrix below. Tell the user which one you're using so they can change it.

3. Route to the matching workflow skill **bypassing Phase 0/1** (context pre-flight and ambiguity gate) — we're generating a demo, not gathering requirements. Pass the dummy brief plus these overrides:
   - Use `frontend-design` for aesthetic if it is installed, else the `CLAUDE.md` taste rules (no brand context)
   - Write under `artifacts/examples/<kind>-<YYYYMMDD>/` instead of the top level of `artifacts/` (keeps demos inside the served root, but out of the user's real work)
   - Skip register-asset (demos shouldn't clutter `assets.html`)

4. After the workflow skill completes (including `/done` on the output), report:
   - Path to the generated artifact
   - URL the user can open (file:// or http://127.0.0.1:4567/examples/<kind>-<ts>/...)
   - Suggestion to `cp -r artifacts/examples/<kind>-<ts>/ artifacts/my-<kind>/` and then iterate via the regular workflow skill

## Canned briefs

| Kind | Brief |
|---|---|
| `deck` | "5-slide internal pitch deck: 'Why we should ship feature X in Q2'. Audience: engineering leadership. Tone: data-driven, concise." |
| `prototype` | "iOS food-delivery app prototype, 3 screens: restaurant list, dish detail, cart. Include a slide transition between list and detail." |
| `wireframe` | "Landing page for a developer tool. 4 variants on the canvas — hero-first, feature-grid-first, terminal-demo-first, testimonials-first. Greyscale." |
| `animation` | "5-second product intro reel — logo fades in, tagline slides up, accent color wash transitions to final brand color. Use Stage/Sprite/interpolate." |
| `design-system` | "Extract a tokens-only design system from a dummy fintech brand: deep navy primary, gold accent, Söhne-esque sans, 8px spacing grid. Render full style guide." |

## Important

- **Don't write to the top level of `artifacts/`** — examples belong in `artifacts/examples/` to avoid polluting the user's real work
- **Don't register as assets** — examples are reference material, not deliverables
- **Tell the user explicitly** this is a generated example and invite them to iterate on a copy
- Regenerate fresh each time the skill is called — timestamps in the folder name keep old ones around if the user wants to compare
