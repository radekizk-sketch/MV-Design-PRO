// One-off rasterizer for SCHEMAT-10 S3 proof (not a repo-wide guard tool —
// SldCanvasV3 nests an inner <svg> (SheetFrame) inside the outer <svg>
// (canvas root); some Chromium file:// SVG-document heuristics render that
// as an XML source tree instead of the image. Wrapping in a minimal HTML
// host sidesteps it. `rasterize.mjs` (S1, single-root CompositionPreview
// svg) does not hit this — left unchanged.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const dir = process.env.CANON_OUT ?? '/tmp/canon';
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
  const svg = readFileSync(`${dir}/${f}`, 'utf8');
  const w = Number(svg.match(/width="(\d+)"/)?.[1] ?? 1800);
  const h = Number(svg.match(/height="(\d+)"/)?.[1] ?? 1100);
  const htmlPath = `${dir}/${f}.host.html`;
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0B0F14}</style></head><body>${svg}</body></html>`,
  );
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`file://${htmlPath}`);
  const out = f.replace('.svg', '.png');
  await page.screenshot({ path: `${dir}/${out}`, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('png', out);
}
await browser.close();
