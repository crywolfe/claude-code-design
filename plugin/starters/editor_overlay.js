/* editor_overlay.js — dev-only click-to-edit and click-to-comment overlay.
 * Requires elements stamped with data-edit="eNNN" by /make-editable.
 * Buffers edits to pending.yaml and comments to comments.yaml (File System
 * Access API, clipboard fallback). Never writes the HTML itself; /apply-edits
 * does. No-ops unless served from 127.0.0.1. */
(() => {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') return;

  // ---------- allowlist (must match docs/plans/local-editor-plan.md §2.4)
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const LEN = /^(0|-?\d+(\.\d+)?(px|rem|em|%))$/;
  const PROPS = {
    'color': { kind: 'color', re: HEX },
    'background-color': { kind: 'color', re: HEX },
    'border-color': { kind: 'color', re: HEX },
    'font-size': { kind: 'length', re: LEN },
    'line-height': { kind: 'length', re: LEN },
    'letter-spacing': { kind: 'length', re: LEN },
    'padding': { kind: 'length', re: LEN },
    'margin': { kind: 'length', re: LEN },
    'gap': { kind: 'length', re: LEN },
    'border-radius': { kind: 'length', re: LEN },
    'width': { kind: 'length', re: LEN },
    'max-width': { kind: 'length', re: LEN },
    'font-weight': { kind: 'enum', options: ['100','200','300','400','500','600','700','800','900'] },
    'opacity': { kind: 'range', min: 0, max: 1, step: 0.05, re: /^(0(\.\d+)?|1(\.0+)?)$/ },
    'text-align': { kind: 'enum', options: ['left','center','right','justify'] },
  };
  const TEXT_MAX = 500;

  // ---------- state
  let mode = 'off';            // 'off' | 'edit' | 'comment'
  let selected = null;         // element
  const edits = new Map();     // key "target|kind|prop" -> entry
  const undo = [];             // [{key, prev}] prev = previous entry or null
  const comments = [];         // entries per §2.6
  const originals = new Map(); // element -> {text, hidden} captured before its first edit

  // ---------- helpers
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
  const idOf = (el) => el && el.getAttribute && el.getAttribute('data-edit');
  const VOID = new Set(['img', 'br', 'hr', 'input', 'source', 'track', 'wbr']);
  const canText = (el) => el.children.length === 0 && !VOID.has(el.tagName.toLowerCase());
  const keyOf = (e) => `${e.target}|${e.kind}|${e.prop || ''}`;
  const elOf = (target) => document.querySelector(`[data-edit="${target}"]`);
  const remember = (el) => { if (el && !originals.has(el)) originals.set(el, { text: el.textContent, hidden: el.hidden }); };

  // ---------- localStorage buffer: survives the reloads that live_reload.js triggers.
  // Keyed on pathname + the edits-generation meta, which /apply-edits increments, so a
  // buffer from before an apply is ignored afterwards instead of re-applying stale values.
  const genMeta = document.querySelector('meta[name="edits-generation"]');
  const lsKey = '__edits_' + location.pathname + '_' + (genMeta ? genMeta.content : '0');
  const persist = () => { try { localStorage.setItem(lsKey, JSON.stringify({ edits: [...edits.values()], comments })); } catch (e) {} };
  const restore = () => {
    try {
      const s = JSON.parse(localStorage.getItem(lsKey) || 'null'); if (!s) return;
      for (const e of s.edits || []) { remember(elOf(e.target)); edits.set(keyOf(e), e); }
      for (const c of s.comments || []) comments.push(c);
    } catch (e) {}
  };
  const toHex = (rgb) => {
    const m = rgb.match(/\d+/g); if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
  };
  const yamlStr = (s) => JSON.stringify(String(s));
  const editsYaml = () => {
    const rows = [...edits.values()].sort((a, b) => a.target.localeCompare(b.target));
    if (!rows.length) return '';
    return rows.map(e => {
      if (e.kind === 'text')   return `- target: ${e.target}\n  kind: text\n  value: ${yamlStr(e.value)}\n`;
      if (e.kind === 'style')  return `- target: ${e.target}\n  kind: style\n  prop: ${e.prop}\n  value: ${yamlStr(e.value)}\n`;
      return `- target: ${e.target}\n  kind: hidden\n  value: ${e.value ? 'true' : 'false'}\n`;
    }).join('');
  };
  const commentsYaml = () => comments.map(c =>
    `- target: ${c.target}\n  text: ${yamlStr(c.text)}\n  at: ${yamlStr(c.at)}\n`).join('');

  // ---------- apply the whole edits map to the live DOM.
  // Styles go through a <style> block using the SAME rule text /apply-edits writes
  // (attribute selector + !important), so live and applied always match. Text and
  // hidden are set on the element, or restored from `originals` when no edit remains.
  const liveStyle = document.createElement('style');
  liveStyle.id = '__edits_live';
  onReady(() => document.head.appendChild(liveStyle));
  const cssFor = (map) => {
    const byTarget = {};
    for (const e of map.values()) if (e.kind === 'style') (byTarget[e.target] = byTarget[e.target] || {})[e.prop] = e.value;
    return Object.keys(byTarget).sort().map(t =>
      `[data-edit="${t}"] { ` + Object.keys(byTarget[t]).sort().map(p => `${p}: ${byTarget[t][p]} !important;`).join(' ') + ' }'
    ).join('\n');
  };
  const render = () => {
    liveStyle.textContent = cssFor(edits);
    for (const [el, o] of originals) {
      const id = idOf(el);
      const t = edits.get(`${id}|text|`);
      el.textContent = t ? t.value : o.text;
      const h = edits.get(`${id}|hidden|`);
      el.hidden = h ? !!h.value : o.hidden;
    }
  };
  const record = (entry) => {
    const key = keyOf(entry);
    remember(elOf(entry.target));
    // consecutive edits to the same key (typing, dragging a slider) collapse into one undo step
    const top = undo[undo.length - 1];
    if (!top || top.key !== key) undo.push({ key, prev: edits.get(key) || null });
    edits.set(key, entry);
    render(); persist(); scheduleWrite('edits'); renderStatus();
  };

  // ---------- panel
  const panel = document.createElement('div');
  panel.id = '__edit_panel';
  panel.setAttribute('data-decorative', '');
  panel.hidden = true;
  panel.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;width:280px;max-height:calc(100vh - 32px);overflow:auto;' +
    'font:13px/1.4 ui-sans-serif,system-ui;background:#fff;color:#111;border:1px solid #ddd;border-radius:10px;' +
    'padding:14px;box-shadow:0 8px 24px rgba(0,0,0,.12)';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:600;margin-bottom:8px';
  const title = document.createElement('span'); title.textContent = 'Edit';
  const hint = document.createElement('span'); hint.style.cssText = 'opacity:.5;font-weight:400;font-size:11px';
  hint.textContent = 'Shift+E edit · Shift+C comment · Esc';
  head.append(title, hint);
  const body = document.createElement('div');
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #eee';
  const btn = (label) => { const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'flex:1;padding:6px 8px;font-size:11px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;cursor:pointer'; return b; };
  const linkEditsBtn = btn('Link pending.yaml');
  const linkCommentsBtn = btn('Link comments.yaml');
  const copyBtn = btn('Copy YAML');
  actions.append(linkEditsBtn, linkCommentsBtn, copyBtn);
  const status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;font-size:10px;color:#888';
  panel.append(head, body, actions, status);
  onReady(() => document.body.appendChild(panel));

  const renderStatus = () => {
    const n = edits.size, c = comments.length;
    status.textContent = `${n} edit${n === 1 ? '' : 's'}, ${c} comment${c === 1 ? '' : 's'} buffered` +
      (handles.edits ? ' · writing pending.yaml' : '') + (handles.comments ? ' · writing comments.yaml' : '');
  };

  // ---------- highlight
  const hoverBox = document.createElement('div');
  hoverBox.setAttribute('data-decorative', '');
  hoverBox.style.cssText = 'position:fixed;pointer-events:none;z-index:99997;border:2px dashed #2d7ff9;border-radius:3px;display:none';
  const selBox = hoverBox.cloneNode(); selBox.style.borderStyle = 'solid'; selBox.style.borderColor = '#d97757';
  onReady(() => document.body.append(hoverBox, selBox));
  const box = (b, el) => {
    if (!el) { b.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(b.style, { display: 'block', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 'px', height: r.height + 'px' });
  };

  // ---------- render the panel for the selected element
  const renderPanel = () => {
    body.textContent = '';
    if (!selected) { body.textContent = mode === 'edit' ? 'Click an outlined element.' : 'Click an element to comment on it.'; return; }
    const id = idOf(selected);
    const cs = getComputedStyle(selected);
    const row = (label, input) => {
      const r = document.createElement('label');
      r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin:8px 0';
      const l = document.createElement('span'); l.textContent = label;
      l.style.cssText = 'font-family:ui-monospace,Menlo;font-size:11px;opacity:.7';
      r.append(l, input); body.appendChild(r);
    };
    const idLine = document.createElement('div');
    idLine.style.cssText = 'font-family:ui-monospace,Menlo;font-size:11px;opacity:.6;margin-bottom:6px';
    idLine.textContent = `${selected.tagName.toLowerCase()} · ${id}`;
    body.appendChild(idLine);

    if (mode === 'comment') {
      const ta = document.createElement('textarea');
      ta.rows = 3; ta.style.cssText = 'width:100%;font:inherit;box-sizing:border-box';
      ta.placeholder = 'Comment on this element';
      const add = btn('Add comment');
      add.addEventListener('click', () => {
        const text = ta.value.trim().replace(/[<>]/g, '');
        if (!text) return;
        comments.push({ target: id, text, at: new Date().toISOString() });
        ta.value = '';
        persist(); scheduleWrite('comments'); renderStatus();
      });
      body.append(ta, add);
      return;
    }

    // text (leaf, non-void only)
    if (canText(selected)) {
      const t = document.createElement('input'); t.type = 'text'; t.maxLength = TEXT_MAX; t.style.width = '150px';
      t.value = selected.textContent;
      t.addEventListener('input', () => {
        const v = t.value.replace(/[<>\n]/g, '').slice(0, TEXT_MAX);
        record({ target: id, kind: 'text', value: v });
      });
      row('text', t);
    }
    // styles
    for (const [prop, meta] of Object.entries(PROPS)) {
      let input;
      const current = cs.getPropertyValue(prop).trim();
      if (meta.kind === 'color') { input = document.createElement('input'); input.type = 'color'; input.value = toHex(current); }
      else if (meta.kind === 'enum') { input = document.createElement('select');
        for (const o of meta.options) { const op = document.createElement('option'); op.value = o; op.textContent = o; op.selected = o === current; input.appendChild(op); } }
      else if (meta.kind === 'range') { input = document.createElement('input'); input.type = 'range'; input.min = meta.min; input.max = meta.max; input.step = meta.step; input.value = current || 1; input.style.width = '100px'; }
      else { input = document.createElement('input'); input.type = 'text'; input.placeholder = current; input.style.width = '90px'; }
      input.addEventListener('input', () => {
        const v = String(input.value).trim();
        const ok = meta.kind === 'enum' ? meta.options.includes(v) : meta.re.test(v);
        input.style.outline = ok ? '' : '2px solid #c0392b';
        if (ok) record({ target: id, kind: 'style', prop, value: v });
      });
      row(prop, input);
    }
    // hidden
    const h = document.createElement('input'); h.type = 'checkbox'; h.checked = selected.hidden;
    h.addEventListener('change', () => record({ target: id, kind: 'hidden', value: h.checked }));
    row('hidden', h);
  };

  // ---------- writers (same pattern as the tweaks panel)
  const handles = { edits: null, comments: null };
  const timers = {};
  const scheduleWrite = (which) => {
    const h = handles[which]; if (!h) return;
    clearTimeout(timers[which]);
    timers[which] = setTimeout(async () => {
      try { const w = await h.createWritable(); await w.write(which === 'edits' ? editsYaml() : commentsYaml()); await w.close();
        status.textContent = `Wrote ${which === 'edits' ? 'pending' : 'comments'}.yaml @ ${new Date().toLocaleTimeString()}`; }
      catch (e) { status.textContent = 'Write failed: ' + e.message; }
    }, 300);
  };
  const link = async (which, name) => {
    if (!window.showSaveFilePicker) { status.textContent = 'File System Access API unavailable; use Copy YAML'; return; }
    try { handles[which] = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'YAML', accept: { 'text/yaml': ['.yaml'] } }] });
      // only write now if there is something buffered; re-linking after a reload must not
      // overwrite a pending file that still holds earlier edits with an empty set
      if (which === 'edits' ? edits.size : comments.length) scheduleWrite(which);
      renderStatus(); }
    catch (e) { status.textContent = 'Link cancelled'; }
  };
  linkEditsBtn.addEventListener('click', () => link('edits', 'pending.yaml'));
  linkCommentsBtn.addEventListener('click', () => link('comments', 'comments.yaml'));
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('# pending.yaml\n' + editsYaml() + '# comments.yaml\n' + commentsYaml());
      status.textContent = 'Copied. Paste to Claude and say "apply edits".'; }
    catch (e) { status.textContent = 'Copy failed: ' + e.message; }
  });

  // ---------- mode handling
  const setMode = (m) => {
    mode = m; selected = null; box(hoverBox, null); box(selBox, null);
    panel.hidden = m === 'off';
    title.textContent = m === 'comment' ? 'Comment' : 'Edit';
    document.documentElement.style.cursor = m === 'off' ? '' : 'crosshair';
    renderPanel(); renderStatus();
  };
  const targetFrom = (ev) => {
    if (panel.contains(ev.target)) return null;
    return ev.target.closest && ev.target.closest('[data-edit]');
  };
  document.addEventListener('mousemove', (ev) => { if (mode === 'off') return; box(hoverBox, targetFrom(ev)); });
  document.addEventListener('click', (ev) => {
    if (mode === 'off' || panel.contains(ev.target)) return;
    const el = targetFrom(ev); if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    selected = el; box(selBox, el); renderPanel();
  }, true);
  window.addEventListener('scroll', () => { box(hoverBox, null); box(selBox, selected); }, true);
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (ev.shiftKey && (ev.key === 'E' || ev.key === 'e') && !typing) setMode(mode === 'edit' ? 'off' : 'edit');
    else if (ev.shiftKey && (ev.key === 'C' || ev.key === 'c') && !typing) setMode(mode === 'comment' ? 'off' : 'comment');
    else if (ev.key === 'Escape') { if (selected) { selected = null; box(selBox, null); renderPanel(); } else setMode('off'); }
    else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z') && mode === 'edit' && !typing) {
      const u = undo.pop(); if (!u) return;
      if (u.prev) edits.set(u.key, u.prev); else edits.delete(u.key);
      render(); persist(); scheduleWrite('edits'); renderPanel(); renderStatus();
    }
  });

  onReady(() => { restore(); render(); renderStatus(); });
})();
