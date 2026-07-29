// One-off rasterizer for SCHEMAT-10 S4 proof (not a repo-wide guard tool —
// same nested-<svg> Chromium file:// quirk as S3, see `rasterize_s3_host.mjs`
// header). S4 adds:
//  - per-file host background (dark for `s4-ekran-*`, white for
//    `s4-eksport-*` — export SVG already paints its own white rect, host bg
//    is belt-and-suspenders);
//  - uniform PROOF viewport (`TARGET_W`×`TARGET_H`): the export SVG's native
//    `width`/`height` are the content-fit kadr (often larger than a screen —
//    D12 proof), so we scale it DOWN with a CSS transform on the host page
//    (presentation-only, for a fair side-by-side "sama sieć, ten sam kadr"
//    comparison against the ekran screenshot) — the exported .svg FILE
//    itself is untouched, only this proof PNG is resized.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const dir = process.env.CANON_OUT ?? '/tmp/canon';
const TARGET_W = 1800;
const TARGET_H = 1100;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
  const svg = readFileSync(`${dir}/${f}`, 'utf8');
  const w = Number(svg.match(/width="(\d+)"/)?.[1] ?? TARGET_W);
  const h = Number(svg.match(/height="(\d+)"/)?.[1] ?? TARGET_H);
  // Z4 (audyt SLD 2026-07): baner metryczny leży w STOPCE POD sceną (poza bbox
  // treści). Skala kadru liczona z wysokości SCENY (h − stopka), nie całości —
  // dzięki temu SCENA zachowuje identyczną skalę jak przed przeniesieniem
  // baneru, a stopka tylko dokłada pas pod spodem (rośnie tylko wysokość PNG).
  const footer = Number(svg.match(/data-footer="(\d+)"/)?.[1] ?? 0);
  const sceneH = h - footer;
  const scale = Math.min(TARGET_W / w, TARGET_H / sceneH, 1);
  const hostBg = f.includes('eksport') ? '#FFFFFF' : '#0B0F14';
  const htmlPath = `${dir}/${f}.host.html`;
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `html,body{margin:0;padding:0;background:${hostBg}}` +
      `.proof-scale{transform:scale(${scale});transform-origin:top left;width:${w}px;height:${h}px}` +
      `</style></head><body><div class="proof-scale">${svg}</div></body></html>`,
  );
  await page.setViewportSize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  await page.goto(`file://${htmlPath}`);
  const out = f.replace('.svg', '.png');
  await page.screenshot({
    path: `${dir}/${out}`,
    clip: { x: 0, y: 0, width: Math.round(w * scale), height: Math.round(h * scale) },
  });
  console.log('png', out, `(${w}x${h} @ scale ${scale.toFixed(3)})`);
}
await browser.close();
