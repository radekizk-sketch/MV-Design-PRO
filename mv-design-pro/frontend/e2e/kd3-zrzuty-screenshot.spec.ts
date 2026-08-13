/**
 * Zrzuty ŻYWEJ aplikacji dla karty KD-3 (bramka 6, dyrektywa właściciela nr 8).
 *
 * Cztery ekrany × dwa motywy, WYŁĄCZNIE z realnego backendu:
 *   • bilans obwodów wtórnych CT/VT w kroku pomiarów kreatora stacji,
 *   • zaczepy transformatora w kroku transformatora (B-2),
 *   • katalog z kategoriami nN/CT/VT (L-16),
 *   • porównanie A/B zwarć z deltami z backendu (poz. 11).
 *
 * Zrzuty trafiają do `docs/audit/visual/flow-ekspert/kd3-*-{dark,light}.png`.
 * Sceny NIE są atrapami — aplikacja rozmawia z prawdziwym API na portach
 * prywatnych (`PLAYWRIGHT_BACKEND_URL` / `PLAYWRIGHT_FRONTEND_URL`).
 */
import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** Odpowiedź bilansu wtórnego dla obwodu KOMPLETNEGO (przekrój + moc aparatów). */
function bilansZKompletem(
  sciezka: string,
  oczekiwane: { przekroj: number; mocVa: number },
): (response: Response) => boolean {
  return (response) => {
    if (!response.url().includes(sciezka) || response.request().method() !== 'POST') return false;
    const surowe = response.request().postData();
    if (!surowe) return false;
    let payload: {
      przekroj_przewodu_mm2?: number | null;
      obciazenia_aparatow?: Array<{ moc_va?: number }>;
    };
    try {
      payload = JSON.parse(surowe);
    } catch {
      return false;
    }
    return (
      payload.przekroj_przewodu_mm2 === oczekiwane.przekroj
      && (payload.obciazenia_aparatow ?? []).some((a) => a.moc_va === oczekiwane.mocVa)
    );
  };
}

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const OUTPUT_DIR = path.resolve(process.cwd(), '../docs/audit/visual/flow-ekspert');
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';

const MOTYWY = [
  { nazwa: 'dark', tryb: 'dark_scada' },
  { nazwa: 'light', tryb: 'light_technical' },
] as const;

let opCounter = 0;
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

type Snapshot = { corridors?: Array<{ ordered_segment_refs?: string[] }> };
type DomainOpResponse = { error?: string | null; snapshot?: Snapshot };

async function executeDomainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-kd3-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function otworzAplikacje(page: Page, request: APIRequestContext, tryb: string) {
  const suffix = nextEntitySuffix();
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `E2E zrzuty KD-3 ${suffix}`,
      description: 'Zrzuty ekranow karty KD-3',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: `Przypadek KD-3 ${suffix}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  await page.addInitScript(
    (dane) => {
      localStorage.setItem(
        'mv-design-app-state',
        JSON.stringify({
          state: {
            activeProjectId: dane.projectId,
            activeProjectName: dane.projectName,
            activeCaseId: dane.caseId,
            activeCaseName: dane.caseName,
            activeCaseKind: 'ShortCircuitCase',
            activeCaseResultStatus: 'NONE',
            activeSnapshotId: null,
            activeMode: 'MODEL_EDIT',
            activeRunId: null,
            activeAnalysisType: 'SHORT_CIRCUIT',
            caseManagerOpen: false,
            issuePanelOpen: false,
          },
          version: 1,
        }),
      );
      // Motyw z parametru sceny — zrzut ma pokazać OBA warianty kolorystyczne.
      localStorage.setItem(
        'mvd-theme-mode',
        JSON.stringify({ state: { mode: dane.tryb }, version: 0 }),
      );
    },
    {
      projectId: project.id,
      projectName: `E2E zrzuty KD-3 ${suffix}`,
      caseId: studyCase.id,
      caseName: `Przypadek KD-3 ${suffix}`,
      tryb,
    },
  );

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return studyCase.id;
}

async function zbudujMagistrale(request: APIRequestContext, caseId: string): Promise<string> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  const op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 400,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmenty = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmenty.length).toBeGreaterThan(0);
  return segmenty[segmenty.length - 1];
}

async function otworzKreatorStacji(page: Page, segmentId: string) {
  await page.evaluate((segment) => {
    const globalny = window as unknown as {
      __mvdpOpenOperationForm?: (nazwa: string, kontekst: Record<string, unknown>) => void;
    };
    globalny.__mvdpOpenOperationForm?.('insert_station_on_segment_sn', {
      segment_id: segment,
      position_on_segment: 0.5,
    });
  }, segmentId);
  await expect(page.getByTestId('mvd-kreator-stacja')).toBeVisible({ timeout: 20000 });
}

async function przejdzDoKroku(page: Page, tytul: string) {
  await page.getByRole('button', { name: new RegExp(tytul) }).click();
}

test.beforeAll(() => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

for (const motyw of MOTYWY) {
  test(`KD-3 zrzuty — ${motyw.nazwa}`, async ({ page, request }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const caseId = await otworzAplikacje(page, request, motyw.tryb);

    // ------------------------------------------------ 1. Katalog (L-16)
    await page.getByRole('button', { name: /^Model sieci \d$/ }).click();
    await page.getByTestId('mvd-model-zakladka-katalog').click();
    await expect(page.getByRole('button', { name: 'Przekładniki prądowe' })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: 'Przekładniki prądowe' }).click();
    // Pierwsza pozycja listy → karta techniczna z parametrami z katalogu.
    const pierwszaPozycja = page.locator('.mvd-katalog__typ-btn').first();
    await expect(pierwszaPozycja).toBeVisible({ timeout: 20000 });
    await pierwszaPozycja.click();
    await expect(page.getByText('Prąd znamionowy pierwotny')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(300);
    const sciezkaKatalog = path.join(OUTPUT_DIR, `kd3-katalog-nn-${motyw.nazwa}.png`);
    await page.screenshot({ path: sciezkaKatalog });
    expect(fs.existsSync(sciezkaKatalog)).toBe(true);

    // ------------------------------------------------ 2. Zaczepy (B-2)
    // Powrót na kanwę schematu: formularze operacji domenowych (kreator stacji)
    // żyją na niej, a aktywna przestrzeń jest utrwalana i przeżywa przeładowanie.
    await page.getByRole('button', { name: /^Schemat \(SLD\) \d$/ }).click();
    const segmentId = await zbudujMagistrale(request, caseId);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
    await otworzKreatorStacji(page, segmentId);

    await przejdzDoKroku(page, 'Transformator i strona nN');
    const katalogTrafo = page.getByTestId('mvd-kreator-stacja-katalog');
    await expect(katalogTrafo.locator('option')).not.toHaveCount(1, { timeout: 20000 });
    const trafoId = await katalogTrafo.locator('option').nth(1).getAttribute('value');
    await katalogTrafo.selectOption(trafoId!);
    await page.getByTestId('mvd-kreator-stacja-zaczepy-rodzaj').selectOption('DETC');
    await page.getByTestId('mvd-kreator-stacja-zaczepy-biezaca').fill('-1');
    await expect(page.getByTestId('mvd-kreator-stacja-zaczepy')).toBeVisible();
    await page.waitForTimeout(300);
    const sciezkaZaczepy = path.join(OUTPUT_DIR, `kd3-zaczepy-${motyw.nazwa}.png`);
    await page.screenshot({ path: sciezkaZaczepy });
    expect(fs.existsSync(sciezkaZaczepy)).toBe(true);

    // ------------------------------------------------ 3. Bilans CT/VT
    await przejdzDoKroku(page, 'Pomiar i zabezpieczenia pól');
    const ct1 = page.getByTestId('mvd-kreator-stacja-ct-1');
    await expect(ct1.locator('option')).not.toHaveCount(1, { timeout: 20000 });
    const ctId = await ct1.locator('option').nth(1).getAttribute('value');
    await ct1.selectOption(ctId!);
    const vt1 = page.getByTestId('mvd-kreator-stacja-vt-1');
    const vtId = await vt1.locator('option').nth(1).getAttribute('value');
    await vt1.selectOption(vtId!);

    // Zrzut ma pokazać POLICZONY bilans, więc czekamy na odpowiedź dla obwodu
    // KOMPLETNEGO (każde pole wysyła własne żądanie; te wcześniejsze są uczciwie
    // niedostępne — backend zwraca kod gotowości zamiast zmyślonej mocy).
    await page.getByTestId('mvd-kreator-stacja-ct-dlugosc-1').fill('25');
    await page.getByTestId('mvd-kreator-stacja-ct-przekroj-1').fill('4');
    const bilansCt = page.waitForResponse(
      bilansZKompletem('/api/solver/ct-burden-check', { przekroj: 4, mocVa: 3.5 }),
      { timeout: 30000 },
    );
    await page.getByTestId('mvd-kreator-stacja-ct-moc-1').fill('3.5');
    await bilansCt;
    await page.getByTestId('mvd-kreator-stacja-vt-dlugosc-1').fill('40');
    await page.getByTestId('mvd-kreator-stacja-vt-przekroj-1').fill('2.5');
    const bilansVt = page.waitForResponse(
      bilansZKompletem('/api/solver/vt-burden-check', { przekroj: 2.5, mocVa: 12 }),
      { timeout: 30000 },
    );
    await page.getByTestId('mvd-kreator-stacja-vt-moc-1').fill('12');
    await bilansVt;
    await expect(page.getByTestId('mvd-kryteria-ct-1')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('mvd-kryteria-ct-1').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const sciezkaBilans = path.join(OUTPUT_DIR, `kd3-bilans-${motyw.nazwa}.png`);
    await page.screenshot({ path: sciezkaBilans });
    expect(fs.existsSync(sciezkaBilans)).toBe(true);
  });
}
