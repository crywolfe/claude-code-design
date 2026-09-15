#!/usr/bin/env node
// Generates assets.html from design-assets.json
// Usage: node scripts/make-assets-index.mjs [path-to-json]

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const JSON_PATH = process.argv[2] || path.join(ROOT, 'design-assets.json');
const OUT_PATH = path.join(path.dirname(JSON_PATH), 'assets.html');

const GROUPS = ['Type', 'Colors', 'Spacing', 'Components', 'Brand'];
const STATUS_COLOR = {
  'approved': { bg: '#dcfce7', fg: '#166534' },
  'needs-review': { bg: '#fef9c3', fg: '#854d0e' },
  'changes-requested': { bg: '#fecaca', fg: '#991b1b' },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function card(item) {
  const st = STATUS_COLOR[item.status] || STATUS_COLOR['needs-review'];
  const thumb = item.thumbnail || '';
  const updated = item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '';
  // encodeURI preserves slashes but escapes spaces and special chars
  const href = encodeURI(item.path || '');
  const thumbUrl = thumb ? encodeURI(thumb) : '';
  return `
    <a class="card" href="${escapeHtml(href)}" target="_blank" data-asset="${escapeHtml(item.asset)}">
      <div class="thumb">${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt=""/>` : '<div class="thumb-empty">no preview</div>'}</div>
      <div class="meta">
        <div class="title">${escapeHtml(item.asset)}</div>
        ${item.subtitle ? `<div class="subtitle">${escapeHtml(item.subtitle)}</div>` : ''}
        <div class="foot">
          <span class="badge" style="background:${st.bg};color:${st.fg}">${escapeHtml(item.status)}</span>
          ${updated ? `<span class="updated">${updated}</span>` : ''}
        </div>
      </div>
    </a>
  `;
}

function groupSection(name, items) {
  if (!items.length) return '';
  return `
    <section class="group">
      <h2>${escapeHtml(name)} <span class="count">${items.length}</span></h2>
      <div class="grid">${items.map(card).join('')}</div>
    </section>
  `;
}

const data = JSON.parse(await fs.readFile(JSON_PATH, 'utf8').catch(() => '{"items":[]}'));
const items = data.items || [];
const grouped = GROUPS.map((g) => [g, items.filter((i) => i.group === g)])
  .concat([['Other', items.filter((i) => !GROUPS.includes(i.group))]]);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Design assets overview</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px;
    font-family: ui-sans-serif, -apple-system, system-ui, sans-serif;
    background: #fafaf9; color: #1a1a1a;
    max-width: 1400px; margin: 0 auto;
  }
  h1 {
    font-size: 32px; font-weight: 600; margin: 0 0 8px;
    letter-spacing: -0.02em;
  }
  .sub { color: #666; font-size: 14px; margin-bottom: 40px; }
  section.group { margin-bottom: 56px; }
  section.group h2 {
    font-size: 13px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: #666; border-bottom: 1px solid #e5e5e5;
    padding-bottom: 10px; margin-bottom: 20px;
    display: flex; align-items: center; gap: 10px;
  }
  section.group h2 .count {
    background: #e5e5e5; color: #666;
    font-size: 11px; padding: 2px 8px; border-radius: 10px;
    letter-spacing: 0;
  }
  .grid {
    display: grid; gap: 20px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .card {
    display: block; text-decoration: none; color: inherit;
    background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
    overflow: hidden;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    border-color: #ccc;
  }
  .thumb {
    aspect-ratio: 16 / 10;
    background: #f4f4f4; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb-empty { color: #999; font-size: 12px; }
  .meta { padding: 14px 16px; }
  .title { font-weight: 500; font-size: 15px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 12px; line-height: 1.4; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .badge {
    font-size: 11px; padding: 3px 10px; border-radius: 10px;
    font-weight: 500; letter-spacing: 0.02em;
  }
  .updated { color: #999; font-size: 11px; }
  .empty { text-align: center; padding: 80px; color: #999; font-size: 14px; }
</style>
</head>
<body>
  <h1>Design assets</h1>
  <div class="sub">${items.length} item${items.length === 1 ? '' : 's'} across ${grouped.filter(([, i]) => i.length).length} group${grouped.filter(([, i]) => i.length).length === 1 ? '' : 's'}. Click any card to open.</div>
  ${items.length === 0 ? '<div class="empty">No assets registered yet. Use <code>/register-asset &lt;html-path&gt;</code> to add one.</div>' : grouped.map(([g, i]) => groupSection(g, i)).join('')}
</body>
</html>
`;

await fs.writeFile(OUT_PATH, html, 'utf8');
console.log(`wrote ${OUT_PATH} (${items.length} items)`);
