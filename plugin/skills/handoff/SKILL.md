---
name: handoff
description: Build a developer handoff bundle for an artifact — source, extracted components, tokens, a README with structure + assumptions + open questions, the reference screenshot, and an optional zip. Use when user says "hand off", "handoff", "dev bundle", "give this to engineering".
argument-hint: <html-path> [--zip]
allowed-tools: Read Write Glob Grep Bash(mkdir -p handoff:*) Bash(cp artifacts/:*) Bash(cp .claude/design-tokens.json handoff/:*) Bash(cp .claude/last-preview.png handoff/:*) Bash(zip -r handoff/:*) Bash(date:*) Bash(ls handoff/:*)
---

# Handoff

Mirror of Claude Design's "Handoff" export: a self-describing bundle a developer can pick up without the chat history. Output lands in `handoff/<name>/` (gitignored).

## Preconditions

- `$0` must be a path under `artifacts/`. Refuse anything else.
- The artifact should have passed `/done` this session (a fresh `.claude/last-preview.png` exists). If not, run `/done $0` first.

## Steps

1. **Timestamp:** `Bash(date -u +%Y%m%dT%H%M%SZ)` → `<ts>` (use the printed value; no shell substitution).

2. **Layout:** `<name>` = basename of `$0` without extension, slugified.
   ```
   Bash(mkdir -p handoff/<name>/src/components)
   ```

3. **Copy the source as-is:**
   - `Bash(cp artifacts/<path> handoff/<name>/src/<name>.html)`
   - Every `<script src="./x.jsx">` / `.js` sibling the HTML references: `Bash(cp artifacts/<dir>/x.jsx handoff/<name>/src/x.jsx)` (spell each path literally).
   - `Bash(cp .claude/last-preview.png handoff/<name>/reference.png)` if it exists.
   - Any `<script … data-dev-only>` tag (live reload, editor overlay, sketch pad) is removed from the copy before bundling, and its sibling file is not copied. These are preview-time tools, not part of the design.

4. **Extract components.** `Read` the HTML. For every inline `<script type="text/babel">` block, split top-level `function Foo(...)` / `const Foo = (...) =>` React components into `handoff/<name>/src/components/<Foo>.jsx` via `Write`, each ending with `export default Foo;`. Keep the app entry (`ReactDOM.createRoot(...)`) in `src/App.jsx`. Non-React artifacts (plain decks): skip this step and say so in the README.

5. **Extract tokens.**
   - If `.claude/design-tokens.json` exists: `Bash(cp .claude/design-tokens.json handoff/<name>/src/tokens.json)`.
   - Otherwise derive `src/tokens.json` from `--tweak-*` custom properties and the `:root` block in `<style>`.
   - Always `Write` `src/tokens.css` with the same values as CSS custom properties.

6. **Write `handoff/<name>/handoff.json`** (machine-readable manifest):
   ```json
   {
     "name": "<name>",
     "source": "artifacts/<path>",
     "generated_at": "<ts>",
     "kind": "deck | prototype | wireframe | animation | design-system | page",
     "artboards": [ { "id": "slide-1", "label": "Cover", "width": 1920, "height": 1080 } ],
     "components": ["Header", "Card"],
     "tokens": "src/tokens.json",
     "published_url": "<from design-assets.json if /publish ran, else null>",
     "dependencies": { "react": "18.3.1", "react-dom": "18.3.1", "@babel/standalone": "7.29.0" }
   }
   ```
   `artboards`: one per `<section>` for decks, one per `<DesignCanvas.Cell>` for wireframes, one per top-level screen for prototypes.

7. **Write `handoff/<name>/README.md`** with these sections, in this order:
   - **What this is** — one paragraph, the brief in the user's words.
   - **Structure** — file tree of the bundle; component → path map.
   - **Run it** — `python3 -m http.server 4567 --bind 127.0.0.1 --directory src` then open `http://127.0.0.1:4567/<name>.html`.
   - **Integrate** — Vite / CRA / plain `<script type="module">` steps; note the `window.*` exports the multi-file Babel contract relies on.
   - **Design decisions & assumptions** — every choice made without explicit user confirmation (fonts, spacing scale, placeholder imagery, invented copy). Be specific; this is the list a developer will question.
   - **Open questions** — anything the user deferred or the brief left unresolved.
   - **Tokens** — table of `tokens.json`.
   - **Reference** — link to `reference.png` and, if present, the published URL and its comment thread.

8. **Optional zip** (only with `--zip`): `Bash(zip -r handoff/<name>-<ts>.zip handoff/<name>)`.

9. **Report:** bundle path, file count (`Bash(ls handoff/<name>/src)`), and the two README sections most worth a developer's attention: assumptions and open questions.

## Rules

- Never write outside `handoff/`. Never modify the source artifact.
- No secrets, tokens, or absolute machine paths in the README.
- The README is prose for a developer, not a transcript: summarize what was decided, not what was said.
