---
name: animated-video
description: Build animated motion design (explainer, transition reel, product intro). Uses Stage/Sprite timeline from animations.jsx for in-browser compositions or Remotion for full video/MP4 workflows.
argument-hint: <what to animate>
allowed-tools: Read Write Edit Bash(cp "${CLAUDE_PLUGIN_ROOT}"/starters/:*) Bash(cp artifacts/:*) Bash(mkdir -p artifacts:*) Bash(ls design-systems:*) Bash(open file://:*) Bash(open http://127.0.0.1:*) Bash(xdg-open file://:*) Bash(xdg-open http://127.0.0.1:*) mcp__chrome-devtools__navigate_page mcp__chrome-devtools__take_screenshot mcp__chrome-devtools__take_snapshot mcp__chrome-devtools__list_console_messages
---

# Animated Video

Two paths depending on complexity. **Decide first, tell the user which path you're taking.**

## Phase 0 — Context pre-flight (auto-detect, ONE question max)

Before deciding Path A vs B, silently check for context:
1. `Read .claude/design-tokens.json` if exists
2. `Bash(ls design-systems/ 2>/dev/null)` — project-local registry (gitignored). If the brief names a registered brand, say
   "Found design system <name> in the registry. Apply it?" and wait. Never auto-apply.
3. `Glob` codebase tokens
4. Scan brief/attachments for external references: github URL → `ingest-github`, Figma URL → `ingest-figma`,
   image path → `ingest-screenshot`, `.pptx` / `.docx` / `.xlsx` / `.pdf` path → `ingest-document`, `.md` / `.txt` → `Read`.
   Do NOT invoke any ingest skill automatically. List what was found and ask one
   AskUserQuestion: "Ingest <X>? (yes / no)". Only invoke the matching ingest skill on an explicit yes.

If nothing — ONE `AskUserQuestion`: design system / codebase / screenshot / Figma / none / decide. Report "Using <context>. Proceeding."

## Path A — Standalone HTML with Stage/Sprite

For any animation that can live in one HTML file (explainer reel, product intro, transition sequences, hero animations — <60s typical).

Uses the Remotion-compatible in-browser engine in `"${CLAUDE_PLUGIN_ROOT}"/starters/animations.jsx`. Same mental model as Remotion — different runtime (no build step, runs under Babel standalone).

**Available primitives:**

| Primitive | Role |
|---|---|
| `<Stage duration width height [id] [loop] [showControls]>` | Root composition. Owns one RAF clock, scale-to-fit canvas, scrubber UI, play/pause. Reads/writes position in localStorage. |
| `<Sprite start end [easing]>` | Active only in `[start..end]`ms window. Children can be element or `(localT) => element`. Unmounts when out of range. |
| `useTime({ stopAt? })` | Returns current ms. Inside Stage: reads shared clock (free). Standalone: spawns its own RAF (costlier). |
| `useSprite()` | Returns local t ∈ [0,1] within the current Sprite. |
| `Easing` | `linear`, `inQuad`, `outQuad`, `inOutCubic`, `outQuart`, `inOutExpo`, `spring(stiffness, damping)` |
| `interpolate(t, [in], [out], { clamp?, easing? })` | Piecewise lerp. Supports numbers and hex colors. |
| `<FadeIn>`, `<FadeOut>`, `<SlideIn from=...>`, `<ScaleIn from=...>`, `<Reveal from=...>` | Entry/exit sugar. **Persist after their animation window** (unlike Sprite). |
| `<Transition from to duration>` | Standalone one-shot wrapper (no Stage needed). |

**Steps:**

1. Invoke `Skill: frontend-design` for aesthetic direction if it is installed; otherwise proceed with the taste rules in `CLAUDE.md`
2. Create `artifacts/<slug>.html` with React + Babel + `animations.jsx`
3. `Bash(cp "${CLAUDE_PLUGIN_ROOT}"/starters/animations.jsx artifacts/<dir-of-html>/)` — copy starter next to the HTML, spelling the directory out literally (no `$(dirname …)`)
4. Run `/serve` (required for external `.jsx` CORS)
5. Compose the scene. Pattern:

```jsx
function Scene() {
  const t = useTime();  // Stage-shared clock
  // drive properties via interpolate()
  const bg = interpolate(t, [0, 2000, 5000], ['#fef9f3', '#f3d8a8', '#8a5a22'], { easing: Easing.inOutCubic });
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg }}>
      <FadeIn start={0} duration={500}>
        <h1>Entry stays visible after 500ms</h1>
      </FadeIn>
      <Reveal start={400} duration={700} from="bottom" distance={40}>
        <p>Fade + slide combo</p>
      </Reveal>
      <Sprite start={1500} end={3500} easing={Easing.outQuart}>
        {(local) => <div style={{ opacity: local, transform: `scale(${local})` }}>Bounded — disappears after 3500</div>}
      </Sprite>
    </div>
  );
}

function App() {
  return <Stage duration={5000} width={1920} height={1080} loop={false}><Scene/></Stage>;
}
```

6. `/done http://127.0.0.1:4567/<slug>.html` — verify scrubber works, animation plays cleanly, console clean
7. For exporting frames/seeking for PPTX: external tools can send `window.postMessage({ seekMs: N, playing: false }, '*')` — Stage listens and jumps

## Path B — Remotion (MP4 export, multi-scene video)

For long-form (>60s), multi-scene narrative, or MP4-export needs.

1. This path needs a Remotion toolchain (Node project, `npx remotion`), which the project's permission set does not grant. Tell the user: "MP4 export needs a separate Remotion project; I can write the composition source into `artifacts/<slug>-remotion/`, and you run `npx remotion render` yourself."
2. Write the composition source (`src/Root.tsx`, `src/*.tsx`, `package.json` with pinned `remotion` version) into `artifacts/<slug>-remotion/` — no third-party skill is required
3. Print the exact commands for the user to run in a separate shell and stop

## When to pick which

| Need | Path |
|---|---|
| Single scene, any length | A |
| Product intro, explainer under a minute | A |
| Multi-scene narrative | B |
| MP4 export required | B |
| Browser-only preview (ship an HTML) | A |
| Exact frame timing (e.g. 30fps video) | B (Remotion is frame-based) |
| Physics / gesture-driven | A with Popmotion `<script src>` fallback, or B |

## Popmotion fallback

For real spring physics, keyframe math, or gesture tracking beyond what `Easing.spring()` supports, add:
```html
<script src="https://unpkg.com/popmotion@11.0.5/dist/popmotion.min.js"></script>
```
and use `window.popmotion` directly.

## Verify

Path A: `/done <url>` — scrubber reaches end, clicking bar seeks, play/pause toggles, console clean. If the user wants PPTX frames of this animation: seek via postMessage before each screenshot.

Path B: Remotion preview server at `localhost:3000` + exported MP4.
