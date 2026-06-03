// Rasterize the rendered canon SVGs to PNG (visual review). Run: node scripts/rasterize.mjs
import { readdirSync } from 'node:fs';

import { chromium } from 'playwright';

const dir = process.env.CANON_OUT ?? '/tmp/canon';
const W = 1640;
const H = 956;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
  await page.goto(`file://${dir}/${f}`);
  const out = f.replace('.svg', '.png');
  await page.screenshot({ path: `${dir}/${out}`, clip: { x: 0, y: 0, width: W, height: H } });
  console.log('png', out);
}
await browser.close();
