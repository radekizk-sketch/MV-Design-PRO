/**
 * BLOK GPZ ZWINIĘTY NA PRZEGLĄDZIE (L0) — bramka karty KD-5 (dług nazwany w
 * V12K-285: „blok GPZ nie jest zwijany na L0 — aparaty 16 px renderowane przy
 * skali przeglądu ≈2 px").
 *
 * Mierzy na ŻYWEJ aplikacji i REALNYM backendzie, wyłącznie klikami NATYWNYMI
 * (zero syntetycznych `dispatchEvent` — CLAUDE.md Zero-Debt pkt 5):
 *  1. widok przeglądowy startuje na L0 i pokazuje GPZ jako JEDEN zwarty blok,
 *     BEZ geometrii pól wewnętrznych (zero transformatorów/odłączników/głowic
 *     w rysunku GPZ),
 *  2. blok niesie tożsamość (ref GPZ na węźle) i sylwetkę (mini-GPZ),
 *  3. KLIK w blok ROZWIJA widok: kamera schodzi na poziom szczegółu (LOD
 *     rośnie), a pełny układ GPZ (transformator) pojawia się na rysunku,
 *  4. NAWIGATOR (minimapa) DZIEDZICZY zwinięcie: jest projekcją TEJ SAMEJ
 *     sceny L0, więc jego zawartość NIE zmienia się po rozwinięciu kanwy
 *     (gdyby minimapa miała własną ścieżkę renderu, liczba kształtów by się
 *     ruszyła razem z poziomem kanwy).
 *
 * Sieć: GPZ + magistrala z 3 stacjami SN/nN — wzorzec seedu 1:1 z
 * `e2e/sld-minimapa.spec.ts` (ta sama droga danych, zero równoległego seedu).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: { corridors?: Array<{ ordered_segment_refs?: string[] }> };
};

function buildCatalogBinding(catalogNamespace: string, catalogItemId: string) {
  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

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
        idempotency_key: `e2e-gpz-zwiniety-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function utworzProjektISiec(request: APIRequestContext): Promise<{
  projectId: string;
  projectName: string;
  caseId: string;
  caseName: string;
}> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `E2E Blok GPZ zwiniety ${suffix}`;
  const caseName = `Zakres przegladu ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka KD-5: blok GPZ zwiniety na L0',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const caseId = ((await caseResponse.json()) as { id: string }).id;

  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  let op: DomainOpResponse = {};
  for (const [idx, length] of [400, 350, 300, 250].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  for (let i = 0; i < 3; i++) {
    const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
    expect(segmentRefs.length).toBeGreaterThan(0);
    op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
      field_apparatus_catalog_ref: FIELD_APPARATUS_ID,
      segment_id: segmentRefs[segmentRefs.length - 1],
      station_type: 'B',
      insert_at: { value: 0.5 },
      station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
      sn_fields: ['IN', 'OUT', 'FEEDER'],
      transformer: { create: true, catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID) },
    });
  }

  return { projectId: project.id, projectName, caseId, caseName };
}

async function otworzSchemat(page: Page, request: APIRequestContext): Promise<void> {
  const seed = await utworzProjektISiec(request);
  await page.addInitScript((s) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: s.projectId,
          activeProjectName: s.projectName,
          activeCaseId: s.caseId,
          activeCaseName: s.caseName,
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
  }, seed);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
}

test('przeglad: GPZ jako zwiniety blok, klik rozwija uklad, nawigator dziedziczy zwiniecie (bramka KD-5)', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  await otworzSchemat(page, request);

  const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
  const symbole = page.locator('[data-testid="sld-v3-symbols"]');

  // (1) Wejście w WIDOK PRZEGLĄDOWY: mała sieć fituje się w skali szczegółu,
  // więc na przegląd schodzimy kółkiem (natywnie) — dokładnie tak, jak robi to
  // projektant oddalający widok. Pętla przy okazji dowodzi, że drabina LOD
  // działa na żywej aplikacji.
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  let poziom = await canvas.getAttribute('data-scene-lod');
  for (let krok = 0; krok < 16 && poziom !== '0'; krok++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(150);
    poziom = await canvas.getAttribute('data-scene-lod');
  }
  await expect(canvas).toHaveAttribute('data-scene-lod', '0');

  // (2) Blok GPZ ZWINIĘTY: dokładnie JEDEN, z tożsamością i sylwetką.
  const blok = symbole.locator('[data-symbol-canon="gpzCollapsed"]');
  await expect(blok).toHaveCount(1);
  await expect(blok).toHaveAttribute('data-gpz-silhouette', 'mini-gpz');
  const wezelBloku = symbole.locator('g[data-element-kind="station"]', {
    has: page.locator('[data-symbol-canon="gpzCollapsed"]'),
  });
  await expect(wezelBloku).toHaveCount(1);
  const refGpz = await wezelBloku.getAttribute('data-owner-ref');
  expect(refGpz, 'blok GPZ niesie ref GPZ (tozsamosc LOD-niezalezna)').toBeTruthy();
  expect(refGpz!.startsWith('gpz/')).toBeTruthy();

  // …i ZERO geometrii pól wewnętrznych GPZ na rysunku przeglądowym.
  await expect(symbole.locator('[data-symbol-canon="transformer2W"]')).toHaveCount(0);
  await expect(symbole.locator('[data-symbol-canon="currentTransformer"]')).toHaveCount(0);
  await expect(symbole.locator('[data-symbol-canon="cableHead"]')).toHaveCount(0);
  // Sieć zewnętrzna ZOSTAJE (źródło widoczne na każdym poziomie).
  await expect(symbole.locator('[data-symbol-canon="gridSource"]')).toHaveCount(1);
  // Aparat ciągłości pola odejściowego ZOSTAJE (LOD nie ukrywa łączników toru).
  await expect(symbole.locator('[data-symbol-canon="breaker"]').first()).toBeVisible();

  // (3) NAWIGATOR przed rozwinięciem — zapamiętujemy liczbę kształtów.
  await page.getByTestId('sld-v3-minimap-toggle').click();
  await expect(page.getByTestId('sld-v3-minimap-panel')).toBeVisible();
  const minimapa = page.getByTestId('sld-v3-minimap-svg');
  const ksztaltyPrzed = await minimapa.locator('rect, polyline').count();
  expect(ksztaltyPrzed).toBeGreaterThan(0);

  // (4) KLIK NATYWNY w blok ⇒ ROZWINIĘCIE (kamera schodzi na poziom szczegółu).
  const box = await wezelBloku.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(600);

  await expect(canvas).not.toHaveAttribute('data-scene-lod', '0');
  // Blok zwinięty znika, pojawia się pełny układ GPZ (transformator).
  await expect(symbole.locator('[data-symbol-canon="gpzCollapsed"]')).toHaveCount(0);
  await expect(symbole.locator('[data-symbol-canon="transformer2W"]').first()).toBeVisible();

  // (5) NAWIGATOR jest projekcją sceny L0 — jego zawartość się NIE zmieniła
  // (dziedziczy zwinięcie; własna ścieżka renderu ruszyłaby liczby razem z
  // poziomem kanwy).
  const ksztaltyPo = await minimapa.locator('rect, polyline').count();
  expect(ksztaltyPo).toBe(ksztaltyPrzed);
});
