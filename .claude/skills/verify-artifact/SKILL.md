---
name: verify-artifact
description: Screenshot + console sweep + visual inspection of an artifact for layout/color/typography regressions. Silent on pass, reports only on issues. Use after /done reports clean and before end-of-turn.
argument-hint: <html-path-or-url>
allowed-tools: mcp__chrome-devtools__take_screenshot mcp__chrome-devtools__list_console_messages mcp__chrome-devtools__evaluate_script mcp__chrome-devtools__navigate_page Read Bash(date:*)
---

# Verify Artifact

Deeper check than `/done` — uses vision on the actual rendering and flags visual problems, not just console errors.

## Pipeline

1. **Ensure preview is live:** if `$0` isn't already open in Chrome DevTools MCP, navigate there first via `/preview $0`.

2. **Deck-aware pre-check (if `<deck-stage>` present).** Decks have `overflow: hidden` on sections — vertical overflow is visually silent, so vision alone will miss it. Before screenshot, also **hard-reload with cache-bust** to make sure the browser is rendering the current on-disk CSS, not a cached state from before the last edit:

   ```js
   mcp__chrome-devtools__navigate_page({ type: "reload", ignoreCache: true })
   ```

   Then run the programmatic audit:

   ```js
   // mcp__chrome-devtools__evaluate_script
   async () => {
     const stage = document.querySelector('deck-stage');
     if (!stage) return { isDeck: false };
     const DECORATIVE = '.glow, .glow-2, .hero-glow, .chrome, [data-decorative], [aria-hidden="true"].backdrop';
     const isDecorative = (el) => {
       if (el.matches(DECORATIVE) || el.closest(DECORATIVE)) return true;
       const cs = getComputedStyle(el);
       if (cs.pointerEvents === 'none' && !el.textContent?.trim() && parseFloat(cs.opacity) < 1) return true;
       return false;
     };
     const out = [];
     for (let i = 0; i < stage.totalSlides; i++) {
       stage.goToSlide(i);
       await new Promise(r => setTimeout(r, 80));
       const s = stage.querySelectorAll('section')[i];
       const sRect = s.getBoundingClientRect();
       const scale = 1080 / sRect.height;
       let maxBottom = 0, culprit = null;
       for (const el of s.querySelectorAll('*')) {
         if (isDecorative(el)) continue;
         const cs = getComputedStyle(el);
         if (cs.display === 'none' || cs.visibility === 'hidden') continue;
         const r = el.getBoundingClientRect();
         if (r.height === 0 && r.width === 0) continue;
         const b = (r.bottom - sRect.top) * scale;
         if (b > maxBottom) { maxBottom = b; culprit = el.className?.toString?.().slice(0, 40) || el.tagName; }
       }
       const contentBottom = Math.round(maxBottom);
       const overflow = contentBottom - 1080;
       const headroom = 1080 - contentBottom;
       const status = overflow > 0 ? 'FAIL' : headroom < 40 ? 'WARN' : 'OK';
       out.push({ slide: i + 1, contentBottom, overflow, headroom, status, culprit });
     }
     stage.goToSlide(0);
     return { isDeck: true, slides: out };
   }
   ```

   Severity:
   - `FAIL` (`overflow > 0`) — **P0**. Content silently clipped. Report list of slides + culprit class; skip rest of verify, tell Claude to fix.
   - `WARN` (`headroom < 40`) — **P1**. Visually tight against edge (font-metric variance can push over). Report as soft issue.
   - `OK` — proceed.

2b. **Design-system conformance (if `.claude/design-tokens.json` exists).** Claude Design validates artifacts against the active design system; here it is a computed-style walk. `Read .claude/design-tokens.json`, then run with the token palette pasted into `TOKENS`:

   ```js
   // mcp__chrome-devtools__evaluate_script
   () => {
     const TOKENS = { colors: { /* name: "#rrggbb" from design-tokens.json */ }, fonts: [ /* family names */ ], radii: [ /* px numbers */ ] };
     const DECORATIVE = '.glow, .glow-2, .hero-glow, .chrome, [data-decorative], [aria-hidden="true"].backdrop, #tweaks-panel, #tweaks-panel *';
     const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
     const parseRgb = (s) => { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
     const pal = Object.entries(TOKENS.colors).map(([name, hex]) => [name, hex2rgb(hex)]);
     const nearest = (rgb) => pal.map(([n, t]) => [n, Math.hypot(rgb[0]-t[0], rgb[1]-t[1], rgb[2]-t[2])]).sort((a, b) => a[1] - b[1])[0];
     const fontOk = (ff) => TOKENS.fonts.some(f => ff.toLowerCase().includes(f.toLowerCase()));
     const offColor = new Map(), offFont = new Map(), offRadius = new Map();
     const label = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className?.toString?.() ? '.' + el.className.toString().trim().split(/\s+/)[0] : ''));
     for (const el of document.body.querySelectorAll('*')) {
       if (el.matches(DECORATIVE)) continue;
       const cs = getComputedStyle(el);
       if (cs.display === 'none') continue;
       for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
         const rgb = parseRgb(cs[prop]); if (!rgb || rgb[3] === 0) continue;
         const [name, d] = nearest(rgb);
         if (d > 12) { const k = cs[prop]; const e = offColor.get(k) || { count: 0, nearest: name, distance: Math.round(d), sample: label(el), prop }; e.count++; offColor.set(k, e); }
       }
       if (el.textContent?.trim() && !fontOk(cs.fontFamily)) { const k = cs.fontFamily; const e = offFont.get(k) || { count: 0, sample: label(el) }; e.count++; offFont.set(k, e); }
       const r = parseFloat(cs.borderTopLeftRadius);
       if (TOKENS.radii.length && r > 0 && !TOKENS.radii.includes(r)) { const e = offRadius.get(r) || { count: 0, sample: label(el) }; e.count++; offRadius.set(r, e); }
     }
     const top = (m, n) => [...m.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, n).map(([value, info]) => ({ value, ...info }));
     return { offColor: top(offColor, 8), offFont: top(offFont, 4), offRadius: top(offRadius, 4) };
   }
   ```

   Caveat: `parseRgb` only reads `rgb()` / `rgba()`. Chrome reports colors authored in `oklch()`, `color()`, `lab()` etc. as those functions, so such elements are skipped silently — if the artifact uses `oklch()` (this file recommends it), say so in the report and treat the color walk as partial.

   Severity: any `offFont` → **P1** (typography is the loudest brand signal). `offColor` with `distance > 40` → **P1**, otherwise **P2** ("drift"). `offRadius` → **P2**. Report as `[P2] 3 elements use rgb(217,119,87) (nearest token: primary, Δ 18) — e.g. button.cta`. Do not auto-fix; only when the user asks for `--fix`, replace each off-token value in the source with the nearest token via `Edit` and re-run this step. Colors deliberately outside the palette (a screenshot, a placeholder) are fine — say so instead of listing them.

3. **Take a fresh screenshot** to a timestamped path:
   ```
   Bash(date -u +%Y%m%dT%H%M%SZ)   → use the printed value as <ts> (no shell substitution)
   mcp__chrome-devtools__take_screenshot({ filePath: `.claude/verify-<ts>.png`, fullPage: true })
   ```

   For decks that passed the overflow audit, also sample slides at positions `[0, mid, last]` and save as `.claude/verify-${ts}-slide-${n}.png` — vision-check each rather than just the current viewport.

3. **Read the screenshot with vision:** use the `Read` tool on `.claude/verify-<ts>.png` — Claude is multimodal and will see the image as input.

4. **Grab console:** `mcp__chrome-devtools__list_console_messages` — collect all severities.

5. **Reason over the image + console.** Check against the Claude Design taste rules:
   - **Typography**: text ≥ 24px on 1920×1080 slides, ≥ 12pt on print, ≥ 44px for mobile hit targets, legible hierarchy, no AI-slop fonts (Inter, Roboto, Arial, Fraunces)
   - **Layout**: no overflow/clipping/misalignment, consistent spacing rhythm
   - **Color**: contrast ≥ 4.5:1 on body text, palette from brand/design system, no invented colors
   - **Content**: no Lorem ipsum or TODO markers still visible, no filler
   - **AI-slop tropes**: no aggressive gradients, no rounded-card-with-left-border-accent, no emoji without brand justification, no SVG-drawn imagery (should be placeholders)
   - **Console**: errors, React hydration mismatches, CORS, missing assets

6. **Severity rubric:**
   - **P0** — artifact is broken (crashes, blank page, major overflow)
   - **P1** — looks wrong (contrast failure, typography violation, layout bug)
   - **P2** — could be better (inconsistent spacing, minor color drift)
   - **P3** — nitpick

7. **Silent-on-pass:** if no P0/P1 issues **and** console is clean, respond with a single line: `verify-artifact: OK`.
   - Do NOT print anything else on a clean pass. This is noise otherwise.

8. **Report:** if issues found, list them by severity with screenshot coordinates or element descriptions precise enough for Claude to fix:
   ```
   [P1] Header h1 at top-left is 18px — should be ≥ 32px for slide context
   [P2] Footer contrast 3.2:1 vs 4.5:1 minimum — lighten text or darken bg
   ```

9. **Auto-fix loop** (only if user requested): address each P0/P1, then re-run `verify-artifact`.

## Optional deep-dive

If the user asks for a deep check, run:
- `mcp__chrome-devtools__performance_start_trace` — LCP/CLS/INP
- `mcp__chrome-devtools__lighthouse_audit` — a11y / best-practices / SEO

These are opt-in; default verify is just screenshot + console + vision.

## Alternative: parallel background check

For truly large artifacts (20+ slides) where verify latency matters, consider forking a subagent via the Agent tool (built into Claude Code) to run the visual inspection in parallel while you continue working. Pass the screenshot path + console dump in the prompt. This is optional — most artifacts benefit from inline verification.
