/**
 * Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (§0 pkt 1, 3) × GPZ-MODEL (granica zasilania): kreator
 * źródła GPZ na REALNYM backendzie — uziemienie sieci SN to zespół uziemiający sekcji.
 *
 * Ścieżka natywna projektanta: nazwa → pozycja katalogowa równoważnika na szynach SN (bez
 * sekcji składowej zerowej — równoważnik SN nie niesie Z0) → krok Transformatory
 * (transformatory 110/SN są w równoważniku, poza modelem) → Rozdzielnia SN: bez wyboru
 * punktu neutralnego źródła, zespół uziemiający w sekcji 1 (Z.15: transformator ZNyn11
 * z rezystorem) z katalogu → zapis. Dowód przez API:
 *  - źródło NIE niesie `neutral_grounding` ani Z0 (opis tylko dla sieci 110 kV),
 *  - model ma pole ZU sekcji 1 i zespół uziemiający z rezystorem na zacisku tego pola,
 *  - walidator (`GET /enm/validate`) nie zgłasza E-W5-01 ani W-W5-02 dla źródła,
 *  - odczyt uziemienia stacji (`/_uziemienie-sn`) — sekcja 1 „rezystor”, sekcja 2 izolowana,
 *  - szyny GPZ nie niosą `grounding`, meta stacji nie niesie `grounding`/`zero_sequence`.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';

type Snapshot = {
  buses?: Array<Record<string, unknown> & { ref_id: string }>;
  bays?: Array<{ ref_id: string; bay_role?: string; bus_ref?: string; terminal_bus_ref?: string | null }>;
  zespoly_uziemiajace?: Array<{ ref_id: string; bus_ref: string; bay_ref?: string | null; rezystor?: Record<string, unknown> | null; dlawik?: Record<string, unknown> | null }>;
  sources?: Array<{
    ref_id: string;
    bus_ref: string;
    source_side?: string | null;
    neutral_grounding?: { type: string; r_ohm?: number | null; x_ohm?: number | null } | null;
    r0_ohm?: number | null;
    x0_ohm?: number | null;
    z0_z1_ratio?: number | null;
    materialized_params?: Record<string, unknown> | null;
  }>;
  substations?: Array<{ ref_id: string; station_type?: string; meta?: Record<string, unknown> | null }>;
  transformers?: Array<{ ref_id: string; vector_group?: string | null }>;
};

let entityCounter = 0;

function nextEntitySuffix(): string {
  entityCounter += 1;
  return String(entityCounter).padStart(4, '0');
}

async function pobierzEnm(request: APIRequestContext, caseId: string): Promise<Snapshot> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Snapshot;
}

async function createProjectAndCase(request: APIRequestContext) {
  const suffix = nextEntitySuffix();
  const projectName = `E2E kreator zrodla W5-A ${suffix}`;
  const caseName = `Przypadek zrodla W5-A ${suffix}`;
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'W5-A: punkt neutralny zrodla → Source.neutral_grounding, Z0 z danych rownowaznika',
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

async function otworzAplikacje(
  page: Page,
  request: APIRequestContext,
): Promise<{ caseId: string; projectId: string }> {
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
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  return { caseId, projectId };
}

async function otworzKreatorZrodla(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__mvdpOpenOperationForm), null, {
    timeout: 15000,
  });
  await page.evaluate(() => {
    (window as any).__mvdpOpenOperationForm('add_grid_source_sn', {});
  });
  await expect(page.getByTestId('mvd-kreator-zrodlo')).toBeVisible({ timeout: 20000 });
}

async function przejdzDoKroku(page: Page, tytul: string): Promise<void> {
  await page.getByRole('button', { name: tytul, exact: false }).first().click();
}

test('ZU × GPZ-MODEL: kreator źródła — uziemienie sieci SN zespołem uziemiającym sekcji, źródło SN bez punktu neutralnego i Z0', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const { caseId, projectId } = await otworzAplikacje(page, request);
  await otworzKreatorZrodla(page);

  // Krok 1: identyfikacja.
  await page.getByTestId('mvd-kreator-zrodlo-nazwa').fill('GPZ ZU');

  // Krok 2: równoważnik z katalogu (napięcie SN spływa z pozycji). Równoważnik na szynach SN
  // nie opisuje Z0 — sekcji składowej zerowej nie ma.
  await przejdzDoKroku(page, 'Źródło i strona WN');
  const katalog = page.getByTestId('mvd-kreator-zrodlo-katalog-select');
  await expect(katalog.locator(`option[value="${SOURCE_ID}"]`)).toHaveCount(1, { timeout: 20000 });
  await katalog.selectOption(SOURCE_ID);
  await expect(page.getByTestId('mvd-kreator-zrodlo-zero')).toHaveCount(0);

  // Krok 3: transformatory 110/SN są zawarte w równoważniku na szynach SN.
  await przejdzDoKroku(page, 'Transformatory');
  await expect(page.getByTestId('mvd-kreator-zrodlo-transformatory-poza-modelem')).toBeVisible();
  await expect(page.getByTestId('mvd-kreator-zrodlo-transformator-katalog')).toHaveCount(0);

  // Krok 4: rozdzielnia SN — bez wyboru punktu neutralnego źródła; zespół Z.15 w sekcji 1.
  await przejdzDoKroku(page, 'Rozdzielnia SN');
  await expect(page.getByTestId('mvd-kreator-zrodlo-uziemienie')).toHaveCount(0);
  await page.getByTestId('mvd-kreator-zrodlo-sekcja-1-zu').click();
  await page.getByTestId('mvd-kreator-zrodlo-zu-wariant-rezystor').click();
  const tu = page.getByTestId('mvd-kreator-zrodlo-zu-transformator');
  await expect(tu.locator('option[value="TU_ZNYN11_15KV_PW160"]')).toHaveCount(1, { timeout: 20000 });
  await tu.selectOption('TU_ZNYN11_15KV_PW160');
  const rezystor = page.getByTestId('mvd-kreator-zrodlo-zu-rezystor');
  await expect(rezystor.locator('option[value="REZ_200A_15KV"]')).toHaveCount(1, { timeout: 20000 });
  await rezystor.selectOption('REZ_200A_15KV');
  await expect(page.getByTestId('mvd-kreator-zrodlo-zu-wylaczenie-tr')).toHaveCount(0);

  // Zapis: jedna operacja domenowa `add_grid_source_sn`.
  await przejdzDoKroku(page, 'Podsumowanie i zapis');
  const zapisz = page.getByTestId('mvd-kreator-zrodlo-zapisz');
  await expect(zapisz).toBeEnabled({ timeout: 20000 });
  await zapisz.click();
  await expect(page.getByTestId('mvd-kreator-zrodlo')).toHaveCount(0, { timeout: 60000 });

  // ------------------------------------------------------- dowód przez API
  const enm = await pobierzEnm(request, caseId);
  const zrodlo = (enm.sources ?? [])[0];
  expect(zrodlo, 'źródło powstało w modelu').toBeTruthy();
  expect(zrodlo.neutral_grounding ?? null).toBeNull();
  expect(zrodlo.source_side ?? 'SN').toBe('SN');
  expect(enm.transformers ?? []).toHaveLength(0);
  expect(zrodlo.r0_ohm ?? null).toBeNull();
  expect(zrodlo.x0_ohm ?? null).toBeNull();
  expect(zrodlo.z0_z1_ratio ?? null).toBeNull();

  // Zespół uziemiający na zacisku pola ZU sekcji 1.
  const zespoly = enm.zespoly_uziemiajace ?? [];
  expect(zespoly).toHaveLength(1);
  const pole = (enm.bays ?? []).find((b) => b.ref_id === zespoly[0].bay_ref);
  expect(pole?.bay_role).toBe('ZU');
  expect(zespoly[0].bus_ref).toBe(pole?.terminal_bus_ref);
  expect(zespoly[0].rezystor).toBeTruthy();
  expect(zespoly[0].dlawik ?? null).toBeNull();

  // Walidator: źródło SN bez opisu punktu neutralnego i Z0 — ani blokady E-W5-01, ani W-W5-02.
  const walidacja = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm/validate`, { timeout: 30000 });
  expect(walidacja.ok()).toBeTruthy();
  const { issues } = (await walidacja.json()) as {
    issues: Array<{ code: string; element_refs: string[]; message_pl: string }>;
  };
  expect(
    issues.filter((i) => ['E-W5-01', 'W-W5-02'].includes(i.code) && i.element_refs.includes(zrodlo.ref_id)),
  ).toEqual([]);

  // Kasacje: szyny bez `grounding`, meta stacji GPZ bez `grounding`/`zero_sequence`.
  for (const szyna of enm.buses ?? []) expect(szyna).not.toHaveProperty('grounding');
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  expect(gpz, 'stacja GPZ w modelu').toBeTruthy();
  expect(gpz?.meta ?? {}).not.toHaveProperty('grounding');
  expect(gpz?.meta ?? {}).not.toHaveProperty('zero_sequence');

  // Odczyt uziemienia stacji — ta sama funkcja, którą czyta konfigurator stacji.
  const odczyt = await request.post(
    `${BACKEND_BASE}/api/v1/projects/${projectId}/audit2-station-config/${gpz?.ref_id}/_uziemienie-sn`,
    { data: { pola: [] }, timeout: 30000 },
  );
  expect(odczyt.ok()).toBeTruthy();
  const { sekcje } = (await odczyt.json()) as { sekcje: Array<{ szyny: string[]; wariant: string }> };
  const sekcjaZespolu = sekcje.find((s) => s.szyny.includes(pole?.bus_ref ?? ''));
  expect(sekcjaZespolu?.wariant).toBe('rezystor');
});
