/**
 * K9-B — kreator stacji SN/nN, opcja MAX: od szablonu do zapisu.
 *
 * Bramka 1 karty K9-B: przejście na ŻYWEJ aplikacji (real backend, kliki
 * NATYWNE — zero dispatchEvent) przez wszystkie kroki kreatora:
 * szablon → rodzaj (oznaczenie B-4, konstrukcja B-5) → transformator →
 * EDYTOWALNA lista pól (zmiana aparatu z pickera) → CT/VT/przekaźnik →
 * podgląd skutków (dane z dry_run) → zapis. Po zapisie asercje PRZEZ API:
 * stacja + pola + aparaty z JAWNYMI referencjami (B-12), CT/VT/zabezpieczenie
 * obecne w modelu, oznaczenie stacji zapisane.
 *
 * Druga ścieżka: praca „od zera" (bez szablonu) też przechodzi do zapisu.
 *
 * Wzorzec seedu i wejścia do kreatora: e2e/kreator-oze-max.spec.ts (K9-A) oraz
 * e2e/ux-feedback-loop.spec.ts (`__mvdpOpenOperationForm`).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
/** Aparat inny niż domyślny pierwszy z listy — dowód realnej zmiany z pickera. */
const APARAT_ZMIENIONY = 'sw-cb-abb-vd4-24kv-1250a';

let opCounter = 0;
let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

type Substation = {
  ref_id: string;
  name?: string;
  designation?: string | null;
  construction_type?: string | null;
  meta?: { field_specs?: Array<Record<string, unknown>> } | null;
};

type Snapshot = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  branches?: Array<{ ref_id: string; catalog_ref?: string | null; tags?: string[]; meta?: Record<string, unknown> }>;
  substations?: Substation[];
  measurements?: Array<{ ref_id: string; measurement_type?: string; bay_ref?: string | null }>;
  protection_assignments?: Array<{ ref_id: string; catalog_ref?: string | null; meta?: Record<string, unknown> }>;
};

type DomainOpResponse = { error?: string | null; snapshot?: Snapshot };

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
        idempotency_key: `e2e-stacja-max-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

async function createProjectAndCase(request: APIRequestContext) {
  const suffix = nextEntitySuffix();
  const projectName = `E2E kreator stacji MAX ${suffix}`;
  const caseName = `Przypadek stacji MAX ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K9-B: kreator stacji od szablonu do zapisu',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: project.id, name: caseName, description: '', config: {}, set_active: true },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };
  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function otworzAplikacje(page: Page, request: APIRequestContext): Promise<{ caseId: string }> {
  const { projectId, projectName, caseId, caseName } = await createProjectAndCase(request);
  await page.addInitScript((seed) => {
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
          activeRunId: null,
          activeAnalysisType: 'SHORT_CIRCUIT',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { projectId, projectName, caseId, caseName });

  // Stanowisko projektanta: kreator otwiera się w panelu warsztatu obok kanwy —
  // przy 1280 px panel wychodzi poza widok. Ustawiamy szerokość realnego
  // stanowiska (1600×1000), tak jak w zrzutach dokumentacyjnych.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return { caseId };
}

/** Magistrala SN: GPZ + 3 odcinki. Zwraca ref ostatniego odcinka (miejsce stacji). */
async function zbudujMagistrale(request: APIRequestContext, caseId: string): Promise<string> {
  let op = await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  for (const [idx, length] of [300, 250, 200].entries()) {
    op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  return segmentRefs[segmentRefs.length - 1];
}

async function otworzKreatorStacji(page: Page, segmentId: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__mvdpOpenOperationForm), null, {
    timeout: 15000,
  });
  await page.evaluate((seg) => {
    (window as any).__mvdpOpenOperationForm('insert_station_on_segment_sn', {
      segment_id: seg,
      segment_ref: seg,
      position_on_segment: 0.5,
      element_ref: seg,
      element_type: 'LineBranch',
    });
  }, segmentId);
  await expect(page.getByTestId('mvd-kreator-stacja')).toBeVisible({ timeout: 20000 });
}

/** Klik natywny w krok kreatora (nagłówek kroków ramy). */
async function przejdzDoKroku(page: Page, tytul: string): Promise<void> {
  await page.getByRole('button', { name: tytul, exact: false }).first().click();
}

test('K9-B: kreator stacji MAX — szablon → pola → CT/VT/przekaźnik → podgląd → zapis (bramka 1)', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);

  const { caseId } = await otworzAplikacje(page, request);
  const segmentId = await zbudujMagistrale(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await otworzKreatorStacji(page, segmentId);

  // ---------------------------------------------------------------- krok 0
  // Szablon „farma PV" wypełnia formularz; wszystko pozostaje edytowalne.
  await expect(page.getByTestId('mvd-kreator-stacja-szablon')).toBeVisible();
  await page.getByTestId('mvd-kreator-stacja-szablon-kategoria').selectOption('farma_pv');
  const wyborSzablonu = page.getByTestId('mvd-kreator-stacja-szablon-wybor');
  await expect(wyborSzablonu.locator('option')).not.toHaveCount(1, { timeout: 20000 });
  const idSzablonu = await wyborSzablonu.locator('option').nth(1).getAttribute('value');
  expect(idSzablonu).toBeTruthy();
  await wyborSzablonu.selectOption(idSzablonu!);
  await page.getByTestId('mvd-kreator-stacja-szablon-zastosuj').click();
  await expect(page.getByTestId('mvd-kreator-stacja-szablon-zastosowany')).toBeVisible({
    timeout: 20000,
  });

  // ---------------------------------------------------------------- krok 1
  await przejdzDoKroku(page, 'Rodzaj i umiejscowienie');
  await page.getByTestId('mvd-kreator-stacja-typ').selectOption('branch');
  await page.getByTestId('mvd-kreator-stacja-nazwa').fill('Stacja K9-B MAX');
  await page.getByTestId('mvd-kreator-stacja-oznaczenie').fill('ST-15/0,4-77');
  await page.getByTestId('mvd-kreator-stacja-konstrukcja').selectOption('kontenerowa');

  // ---------------------------------------------------------------- krok 2
  await przejdzDoKroku(page, 'Transformator i strona nN');
  const katalogTrafo = page.getByTestId('mvd-kreator-stacja-katalog');
  await expect(katalogTrafo.locator('option')).not.toHaveCount(1, { timeout: 20000 });
  const trafoId = await katalogTrafo.locator('option').nth(1).getAttribute('value');
  expect(trafoId).toBeTruthy();
  await katalogTrafo.selectOption(trafoId!);

  // ---------------------------------------------------------------- krok 3
  // Edytowalna lista pól: zmiana aparatu pierwszego pola z pickera katalogowego.
  await przejdzDoKroku(page, 'Pola rozdzielnicy SN');
  await expect(page.getByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeVisible({ timeout: 20000 });
  const producent = page.getByTestId('mvd-kreator-stacja-producent');
  await expect(producent.locator('option')).not.toHaveCount(1, { timeout: 20000 });
  const aparat1 = page.getByTestId('mvd-kreator-stacja-aparat-1');
  await expect(aparat1.locator(`option[value="${APARAT_ZMIENIONY}"]`)).toHaveCount(1, {
    timeout: 20000,
  });
  await aparat1.selectOption(APARAT_ZMIENIONY);
  await expect(aparat1).toHaveValue(APARAT_ZMIENIONY);

  // ---------------------------------------------------------------- krok 4
  await przejdzDoKroku(page, 'Pomiar i zabezpieczenia pól');
  const ct1 = page.getByTestId('mvd-kreator-stacja-ct-1');
  await expect(ct1.locator('option')).not.toHaveCount(1, { timeout: 20000 });
  const ctId = await ct1.locator('option').nth(1).getAttribute('value');
  await ct1.selectOption(ctId!);
  const vt1 = page.getByTestId('mvd-kreator-stacja-vt-1');
  const vtId = await vt1.locator('option').nth(1).getAttribute('value');
  await vt1.selectOption(vtId!);
  const relay1 = page.getByTestId('mvd-kreator-stacja-przekaznik-1');
  const relayId = await relay1.locator('option').nth(1).getAttribute('value');
  await relay1.selectOption(relayId!);

  // ---------------------------------------------------------------- krok 7
  // Podgląd skutków WYŁĄCZNIE z dry_run — asercja, że dane backendu są widoczne.
  await przejdzDoKroku(page, 'Podgląd skutków');
  const odpowiedzPodgladu = page.waitForResponse(
    (response) =>
      response.url().includes('/enm/domain-ops')
      && response.request().method() === 'POST'
      && (response.request().postData() ?? '').includes('"dry_run":true'),
    { timeout: 30000 },
  );
  await page.getByTestId('mvd-kreator-stacja-podglad-przelicz').click();
  await odpowiedzPodgladu;
  await expect(page.getByTestId('mvd-kreator-stacja-podglad-blad')).toHaveCount(0);
  await expect(page.getByTestId('mvd-kreator-stacja-podglad-skutkow')).toContainText('/station');

  // Podgląd NIE zapisał stacji (dry_run jest tylko odczytem).
  const przedZapisem = await pobierzEnm(request, caseId);
  expect((przedZapisem.substations ?? []).filter((s) => s.ref_id.includes('/station'))).toHaveLength(0);

  // ---------------------------------------------------------------- krok 8
  await przejdzDoKroku(page, 'Podsumowanie i zapis');
  const zapisz = page.getByTestId('mvd-kreator-stacja-zapisz');
  await expect(zapisz).toBeEnabled({ timeout: 20000 });
  await zapisz.click();
  await expect(page.getByTestId('mvd-kreator-stacja')).toHaveCount(0, { timeout: 60000 });

  // ------------------------------------------------------- asercje przez API
  const enm = await pobierzEnm(request, caseId);
  const stacja = (enm.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja, 'stacja powstała w modelu').toBeTruthy();
  // B-4: oznaczenie stacji zapisane w modelu.
  expect(stacja?.designation).toBe('ST-15/0,4-77');
  // B-5: typ konstrukcji zapisany.
  expect(stacja?.construction_type).toBe('kontenerowa');

  const polaStacji = (stacja?.meta?.field_specs ?? []) as Array<Record<string, unknown>>;
  expect(polaStacji.length).toBeGreaterThan(0);

  // B-12: KAŻDY aparat pola ma jawną referencję katalogową (żadnego domysłu).
  const aparaty = (enm.branches ?? []).filter((b) => (b.tags ?? []).includes('station_field_device'));
  expect(aparaty.length).toBe(polaStacji.length);
  for (const aparat of aparaty) {
    expect(aparat.catalog_ref, 'aparat pola ma referencję katalogową').toBeTruthy();
  }
  // Zmiana z pickera trafiła do modelu.
  expect(aparaty.some((a) => a.catalog_ref === APARAT_ZMIENIONY)).toBe(true);

  // Krok 4: CT/VT/zabezpieczenie obecne w modelu (sekwencja po zapisie stacji).
  const pomiary = enm.measurements ?? [];
  expect(pomiary.some((m) => m.measurement_type === 'CT')).toBe(true);
  expect(pomiary.some((m) => m.measurement_type === 'VT')).toBe(true);
  expect((enm.protection_assignments ?? []).length).toBeGreaterThan(0);
});

test('K9-B: ścieżka „od zera" (bez szablonu) przechodzi do zapisu (bramka 1)', async ({
  page,
  request,
}) => {
  test.setTimeout(300000);

  const { caseId } = await otworzAplikacje(page, request);
  const segmentId = await zbudujMagistrale(request, caseId);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await otworzKreatorStacji(page, segmentId);

  // Krok 0: świadomy wybór pracy bez szablonu.
  await page.getByTestId('mvd-kreator-stacja-szablon-od-zera').click();

  await przejdzDoKroku(page, 'Rodzaj i umiejscowienie');
  await page.getByTestId('mvd-kreator-stacja-nazwa').fill('Stacja od zera');

  await przejdzDoKroku(page, 'Transformator i strona nN');
  const katalogTrafo = page.getByTestId('mvd-kreator-stacja-katalog');
  await expect(katalogTrafo.locator('option')).not.toHaveCount(1, { timeout: 20000 });
  const trafoId = await katalogTrafo.locator('option').nth(1).getAttribute('value');
  await katalogTrafo.selectOption(trafoId!);

  // Krok 3: domyślne pola rodzaju stacji z aparatem z katalogu (bez szablonu).
  await przejdzDoKroku(page, 'Pola rozdzielnicy SN');
  await expect(page.getByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeVisible({ timeout: 20000 });
  const aparat1 = page.getByTestId('mvd-kreator-stacja-aparat-1');
  await expect(aparat1).not.toHaveValue('');

  // Dodanie pola odgałęźnego — lista jest edytowalna.
  const liczbaPrzed = await page.locator('[data-testid^="mvd-kreator-stacja-pole-wiersz-"]').count();
  await page.getByTestId('mvd-kreator-stacja-pole-dodaj').click();
  await expect(page.locator('[data-testid^="mvd-kreator-stacja-pole-wiersz-"]')).toHaveCount(
    liczbaPrzed + 1,
  );

  await przejdzDoKroku(page, 'Podsumowanie i zapis');
  const zapisz = page.getByTestId('mvd-kreator-stacja-zapisz');
  await expect(zapisz).toBeEnabled({ timeout: 20000 });
  await zapisz.click();
  await expect(page.getByTestId('mvd-kreator-stacja')).toHaveCount(0, { timeout: 60000 });

  const enm = await pobierzEnm(request, caseId);
  const stacja = (enm.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja, 'stacja powstała także bez szablonu').toBeTruthy();
  const aparaty = (enm.branches ?? []).filter((b) => (b.tags ?? []).includes('station_field_device'));
  expect(aparaty.length).toBeGreaterThan(0);
  for (const aparat of aparaty) {
    expect(aparat.catalog_ref).toBeTruthy();
  }
});
