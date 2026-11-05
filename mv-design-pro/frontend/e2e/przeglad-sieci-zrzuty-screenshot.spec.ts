/**
 * KARTA PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — przegląd sieci na schemacie SLD v3 na ŻYWEJ aplikacji
 * i REALNYM backendzie (materiał oceny wizualnej właściciela, bramka B-02; spec NIE wystawia
 * werdyktu wizualnego).
 *
 * Model: ten sam co na zrzucie oceny właściciela 0/10 — GPZ z kreatora źródła z wartościami
 * domyślnymi (2 sekcje × 2 pola liniowe = 4 pola) i JEDNA magistrala bez stacji odbiorczej.
 * Ścieżka użytkownika (bez wywołań API budujących sieć): projekt i przypadek z API (miejsce
 * pracy), potem wyłącznie kanwa — natywny prawy klik w tło → „Wstaw GPZ" → kreator; prawy klik
 * w GPZ → „ciąg główny" → kreator magistrali.
 *
 * Sprawdzenia (rysunek z DOM kanwy, każdy motyw):
 *  - widok startowy i widok po „Dopasuj widok": poziom szczegółu ≥ L1 (mały model nie
 *    rysuje się w przeglądzie zgrubnym), treść (obrys wszystkich uchwytów trafienia kanwy)
 *    zajmuje ≥ 60 % mniejszego wymiaru kanwy (wyrocznia (f) karty);
 *  - żaden widoczny tekst kanwy nie kończy się wielokropkiem (wyrocznia (e));
 *  - brak symbolu zwiniętego GPZ/stacji (jedna kompozycja na każdym LOD).
 *
 * Sieć referencyjna duża (`sldSubstrate52s`, harness zrzutów) — poziomy L0, L1 i L2 × motyw.
 *
 * Zrzuty: `docs/uiux/zrzuty/przeglad-sieci/<kadr>-<motyw>.png` (do drzewa repo wyłącznie
 * z `ZRZUTY_DO_DOKUMENTACJI=1`, inaczej `test-results/zrzuty-dokumentacji/…`). Prefiks pliku
 * z `PRZEGLAD_ZRZUTY_PREFIKS` (domyślnie `po`; zrzuty stanu sprzed karty — `przed`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { adresHarnessu } from './adresHarnessu';
import { katalogZrzutow } from './katalogZrzutow';
import { przelaczMotyw } from './powloka';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const HERE = dirname(fileURLToPath(import.meta.url));
const KATALOG_ZRZUTOW = katalogZrzutow(resolve(HERE, '..', '..', 'docs', 'uiux', 'zrzuty', 'przeglad-sieci'));
const PREFIKS = process.env.PRZEGLAD_ZRZUTY_PREFIKS ?? 'po';
const KANWA = 'svg[data-testid="sld-canvas-v3"]';
/** Stan sprzed karty: same zrzuty, bez wyroczni (dokumentują defekt, który karta naprawia). */
const TYLKO_ZRZUTY = PREFIKS === 'przed';

type Snapshot = {
  bays?: Array<{ ref_id: string; tags?: string[]; gpz_section_id?: string | null }>;
  branches?: Array<{ ref_id: string; type?: string }>;
};

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

async function otworzAplikacje(page: Page, request: APIRequestContext): Promise<{ caseId: string }> {
  const suffix = Date.now().toString(36);
  const projectName = `Przeglad sieci ${suffix}`;
  const caseName = `Przypadek przegladu ${suffix}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Przegląd sieci — GPZ z 4 polami i magistrala', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;
  await page.addInitScript((seed) => {
    if (localStorage.getItem('mv-design-app-state')) return;
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: seed.projectId,
          activeProjectName: seed.projectName,
          activeCaseId: seed.caseId,
          activeCaseName: seed.caseName,
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId, projectName, caseId, caseName });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  return { caseId };
}

async function zbudujModelWlasciciela(page: Page, request: APIRequestContext, caseId: string): Promise<void> {
  const kanwa = page.getByTestId('sld-canvas-v3');
  await expect(kanwa).toBeVisible({ timeout: 30000 });
  await kanwa.click({ button: 'right', position: { x: 40, y: 40 } });
  await page.getByRole('menu').getByTestId('sld-menu-insert-gpz').click();
  const kreator = page.getByTestId('mvd-kreator-zrodlo');
  await expect(kreator).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Sekcje i pola', exact: false }).first().click();
  const aparatKatalog = page.getByTestId('mvd-kreator-zrodlo-aparat-katalog');
  await expect(aparatKatalog).toBeVisible({ timeout: 60000 });
  await expect.poll(async () => (await aparatKatalog.inputValue()).trim(), { timeout: 60000 }).not.toBe('');
  await page.getByTestId('mvd-kreator-zrodlo-zapisz').click();
  await expect(kreator).toBeHidden({ timeout: 60000 });
  await expect
    .poll(async () => ((await pobierzEnm(request, caseId)).bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field')).length, { timeout: 60000 })
    .toBe(4);

  await expect.poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 }).toBeGreaterThan(0);
  const uchwytGpz = page.locator('[data-hit-klasa="zrodlo"][data-hit-role="obrys"]').first();
  await expect.poll(async () => ((await uchwytGpz.boundingBox().catch(() => null))?.width ?? 0), { timeout: 60000 }).toBeGreaterThan(0);
  const r = (await uchwytGpz.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y + Math.min(r.height / 2, 30), { button: 'right' });
  await page.getByRole('menu').getByTestId('sld-menu-continue-trunk').click();
  const magistrala = page.getByTestId('mvd-kreator-magistrala');
  await expect(magistrala).toBeVisible({ timeout: 20000 });
  const katalogKabla = page.getByTestId('mvd-kreator-magistrala-katalog');
  await expect.poll(async () => katalogKabla.locator('option').count(), { timeout: 60000 }).toBeGreaterThan(1);
  await katalogKabla.selectOption({ index: 1 });
  await page.getByTestId('mvd-kreator-magistrala-dalej').click();
  await page.getByTestId('mvd-kreator-magistrala-dlugosc').fill('400');
  await expect(magistrala).toHaveAttribute('data-status', 'gotowy', { timeout: 30000 });
  await page.getByTestId('mvd-kreator-magistrala-zapisz').click();
  const zakoncz = page.getByTestId('mvd-kreator-magistrala-zakoncz');
  if (await zakoncz.isVisible({ timeout: 15000 }).catch(() => false)) await zakoncz.click();
  await expect(magistrala).toBeHidden({ timeout: 60000 });
  await expect.poll(async () => ((await pobierzEnm(request, caseId)).branches ?? []).filter((b) => b.type === 'cable').length, { timeout: 60000 }).toBe(1);
}

async function naSchemacie(page: Page): Promise<void> {
  const okruszek = page.getByRole('button', { name: 'Schemat', exact: true }).first();
  if (await okruszek.isVisible({ timeout: 3000 }).catch(() => false)) await okruszek.click();
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => page.locator('[data-hit-klasa]').count(), { timeout: 60000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
}

interface PomiarKadru {
  readonly lod: number;
  readonly kanwa: { w: number; h: number };
  readonly tresc: { w: number; h: number };
  readonly udzial: number;
  readonly wielokropki: string[];
  readonly zwiniete: number;
}

/** Pomiar kadru: obrys treści = suma prostokątów uchwytów trafienia (geometria rysunku),
 *  przycięta do kanwy; udział = większy wymiar treści / mniejszy wymiar kanwy. */
async function zmierzKadr(page: Page): Promise<PomiarKadru> {
  return page.evaluate((selektor) => {
    const svg = document.querySelector(selektor) as SVGSVGElement;
    const k = svg.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of svg.querySelectorAll('[data-hit-klasa]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, Math.max(r.left, k.left));
      y0 = Math.min(y0, Math.max(r.top, k.top));
      x1 = Math.max(x1, Math.min(r.right, k.right));
      y1 = Math.max(y1, Math.min(r.bottom, k.bottom));
    }
    const w = Math.max(0, x1 - x0);
    const h = Math.max(0, y1 - y0);
    const wielokropki = [...svg.querySelectorAll('text')]
      .map((t) => t.textContent ?? '')
      .filter((t) => t.includes('…'));
    return {
      lod: Number(svg.getAttribute('data-scene-lod')),
      kanwa: { w: k.width, h: k.height },
      tresc: { w, h },
      udzial: Math.max(w, h) / Math.min(k.width, k.height),
      wielokropki,
      zwiniete: svg.querySelectorAll('[data-symbol-canon="gpzCollapsed"],[data-symbol-canon="stationCollapsed"]').length,
    };
  }, KANWA);
}

async function motywBiezacy(page: Page): Promise<'jasny' | 'ciemny'> {
  const t = await page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? '');
  return t.includes('dark') ? 'ciemny' : 'jasny';
}

test('przegląd sieci — GPZ z 4 polami i magistrala: widok startowy i „Dopasuj widok" (oba motywy)', async ({ page, request }) => {
  test.setTimeout(600_000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const { caseId } = await otworzAplikacje(page, request);
  await zbudujModelWlasciciela(page, request, caseId);

  const pomiary: Record<string, PomiarKadru> = {};
  for (let i = 0; i < 2; i += 1) {
    if (i === 1) await przelaczMotyw(page);
    // Widok startowy: świeże wejście w aplikację (stan kamery bez historii).
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
    await naSchemacie(page);
    const motyw = await motywBiezacy(page);
    const start = await zmierzKadr(page);
    pomiary[`start-${motyw}`] = start;
    await page.locator(KANWA).screenshot({ path: resolve(KATALOG_ZRZUTOW, `${PREFIKS}-model-wlasciciela-start-${motyw}.png`) });
    await page.getByTestId('sld-v3-fit-view').click();
    await page.waitForTimeout(1200);
    const dopasowany = await zmierzKadr(page);
    pomiary[`dopasuj-${motyw}`] = dopasowany;
    await page.locator(KANWA).screenshot({ path: resolve(KATALOG_ZRZUTOW, `${PREFIKS}-model-wlasciciela-dopasuj-${motyw}.png`) });
  }
  console.log(`[przeglad-sieci] pomiary kadrów: ${JSON.stringify(pomiary)}`);
  if (TYLKO_ZRZUTY) return;
  for (const [kadr, p] of Object.entries(pomiary)) {
    expect(p.zwiniete, `${kadr}: symbol zwinięty GPZ/stacji`).toBe(0);
    expect(p.lod, `${kadr}: mały model na poziomie szczegółu ≥ L1`).toBeGreaterThanOrEqual(1);
    expect(p.udzial, `${kadr}: treść ≥ 60 % mniejszego wymiaru kanwy (${JSON.stringify(p)})`).toBeGreaterThanOrEqual(0.6);
    expect(p.wielokropki, `${kadr}: tekst ucięty wielokropkiem`).toEqual([]);
  }
});

for (const lod of [0, 1, 2] as const) {
  test(`przegląd sieci — sieć referencyjna duża na L${lod} (oba motywy)`, async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.goto(adresHarnessu(`screenshot-harness.html?fixture=sldSubstrate52s&lod=${lod}&theme=${theme}`), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await expect(page.locator('[data-testid="sld-harness-root"]').first()).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
      await expect(page.locator(KANWA).first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(900);
      const p = await zmierzKadr(page);
      await page.locator(KANWA).first().screenshot({
        path: resolve(KATALOG_ZRZUTOW, `${PREFIKS}-siec-referencyjna-L${lod}-${theme === 'light' ? 'jasny' : 'ciemny'}.png`),
      });
      if (TYLKO_ZRZUTY) continue;
      expect(p.lod).toBe(lod);
      expect(p.zwiniete, 'symbol zwinięty GPZ/stacji').toBe(0);
      expect(p.wielokropki, 'tekst ucięty wielokropkiem').toEqual([]);
    }
  });
}
