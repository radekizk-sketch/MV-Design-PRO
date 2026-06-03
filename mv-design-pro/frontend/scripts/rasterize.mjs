// Rasterize the rendered canon SVGs to PNG (visual review). Run: node scripts/rasterize.mjs
import { readdirSync, readFileSync } from 'node:fs';

import { chromium } from 'playwright';

const dir = process.env.CANON_OUT ?? '/tmp/canon';
const W = 1640; // fallback if an SVG carries no explicit width/height
const H = 956;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
  const svg = readFileSync(`${dir}/${f}`, 'utf8');
  const w = Number(svg.match(/width="(\d+)"/)?.[1] ?? W); // content-aware (wind presets are wider)
  const h = Number(svg.match(/height="(\d+)"/)?.[1] ?? H);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`file://${dir}/${f}`);
  const out = f.replace('.svg', '.png');
  await page.screenshot({ path: `${dir}/${out}`, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('png', out);
}
await browser.close();
