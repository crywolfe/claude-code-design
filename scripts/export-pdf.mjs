#!/usr/bin/env node
// Export an HTML artifact to PDF via headless Chromium.
// Usage: node export-pdf.mjs <input.html> [output.pdf]

import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const [, , input, output] = process.argv;
if (!input) {
  console.error('Usage: node export-pdf.mjs <input.html> [output.pdf]');
  process.exit(1);
}

const inAbs = path.resolve(process.cwd(), input);
const outAbs = path.resolve(process.cwd(), output || input.replace(/\.html?$/i, '.pdf'));

console.log(`input:  ${inAbs}`);
console.log(`output: ${outAbs}`);

// --no-sandbox is only needed when running as root in a container; gate it on CI.
const browser = await puppeteer.launch({ args: process.env.CI ? ['--no-sandbox'] : [] });
try {
  const page = await browser.newPage();

  // Block every outbound request except the artifact itself and the pinned CDNs it may use.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const ok = u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')
      || u.startsWith('https://unpkg.com/')
      || u.startsWith('https://fonts.googleapis.com/') || u.startsWith('https://fonts.gstatic.com/');
    if (ok) req.continue(); else req.abort();
  });
  await page.goto(pathToFileURL(inAbs).toString(), { waitUntil: 'networkidle0', timeout: 30000 });

  // If this is a deck, switch it to natural size so print CSS works
  const deckDims = await page.evaluate(() => {
    const d = document.querySelector('deck-stage');
    if (!d) return null;
    d.setAttribute('noscale', '');
    const w = parseInt(d.getAttribute('width') || '1920', 10);
    const h = parseInt(d.getAttribute('height') || '1080', 10);
    return [w, h];
  });

  await page.emulateMediaType('print');
  await new Promise((r) => setTimeout(r, 300));

  const opts = {
    path: outAbs,
    printBackground: true,
    preferCSSPageSize: true,
  };
  if (deckDims) {
    opts.width = `${deckDims[0]}px`;
    opts.height = `${deckDims[1]}px`;
  } else {
    opts.format = 'A4';
  }

  await page.pdf(opts);
} finally {
  await browser.close();
}

const stat = await fs.stat(outAbs);
console.log(`wrote ${outAbs} (${(stat.size / 1024).toFixed(1)} KB)`);
