/**
 * Iter 2 — Screenshot harness z DZIAŁAJĄCYM backendem.
 *
 * Zmiana vs iter 1: backend uvicorn :8000 podniesiony, więc lista
 * projektów się załaduje. Projekt + study case + ENM utworzone przez API.
 *
 * Sprawdzamy realny stan FE po:
 *   - załadowaniu listy projektów
 *   - wybraniu projektu "Demo SLD Audit"
 *   - przejściu na widok SLD / Designer / Workspace
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve(
  '/home/user/MV-Design-PRO/mv-design-pro/docs/audit/visual_iteration_2',
);
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173';

const VIEWPORTS = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '4k_3840x2160', w: 3840, h: 2160 },
];

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'projects', path: '/projects' },
  { name: 'sld', path: '/sld' },
  { name: 'workspace', path: '/workspace' },
  { name: 'designer', path: '/designer' },
  { name: 'study-cases', path: '/study-cases' },
];

async function captureRoute(browser, viewport, route) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  const url = APP_URL + route.path;
  let status = 'OK';
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2500); // settle async renders + API calls
  } catch (e) {
    status = `NAV_FAIL: ${e.message}`;
  }
  const fileName = `${route.name}_${viewport.name}.png`;
  const path = resolve(OUT_DIR, fileName);
  try {
    await page.screenshot({ path, fullPage: false });
  } catch (e) {
    status = `SCREENSHOT_FAIL: ${e.message}`;
  }
  await context.close();
  return {
    route: route.name,
    viewport: viewport.name,
    status,
    errors: errors.slice(0, 5),
    file: fileName,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const v of VIEWPORTS) {
    for (const r of ROUTES) {
      const result = await captureRoute(browser, v, r);
      results.push(result);
      console.log(
        `[${result.status === 'OK' ? '+' : '!'}] ${r.path} @ ${v.name} → ${result.file} (${result.status})`,
      );
      if (result.errors.length > 0) {
        console.log(`    errors[0..2]: ${result.errors.slice(0, 3).join(' | ')}`);
      }
    }
  }
  await browser.close();
  await writeFile(
    resolve(OUT_DIR, 'index.json'),
    JSON.stringify(
      { iteration: 2, appUrl: APP_URL, viewports: VIEWPORTS, results },
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`\nDone. ${results.length} screenshots in ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
