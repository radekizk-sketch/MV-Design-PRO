/**
 * W5-A (jedna reprezentacja uziemienia) × karta GPZ-MODEL (granica zasilania): kreator
 * źródła GPZ na REALNYM backendzie.
 *
 * Ścieżka natywna projektanta: nazwa → pozycja katalogowa równoważnika na szynach SN →
 * składowa zerowa WYŁĄCZONA (brak jawnych liczb Z0) → krok Transformatory (transformatory
 * 110/SN są w równoważniku, poza modelem) → punkt neutralny sieci SN „uziemiony przez
 * rezystor" z R_N → zapis. Dowód przez API:
 *  - `Source.neutral_grounding` niesie opis punktu neutralnego (JEDYNY nośnik),
 *  - model NIE ma transformatorów 110/SN, a Z0 równoważnika NIE jest wyprowadzane
 *    z transformatora spoza modelu (karta GPZ-MODEL skasowała to wyprowadzenie: grupa
 *    Yd11 nie daje drogi składowej zerowej po stronie SN) — `r0_ohm`/`x0_ohm` puste,
 *  - walidator (`GET /enm/validate`) zgłasza blokadę E-W5-01 „uziemiony bez Z0" z
 *    podpowiedzią, skąd wziąć Z0 (dane operatora / transformator uziemiający albo
 *    równoważnik 110 kV z transformatorami w modelu),
 *  - szyny GPZ nie niosą `grounding`, meta stacji nie niesie `grounding`/`zero_sequence`.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';

type Snapshot = {
  buses?: Array<Record<string, unknown> & { ref_id: string }>;
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
  return { caseId };
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

test('W5-A × GPZ-MODEL: kreator zrodla — punkt neutralny → Source.neutral_grounding, uziemiony bez Z0 = blokada E-W5-01', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const { caseId } = await otworzAplikacje(page, request);
  await otworzKreatorZrodla(page);

  // Krok 1: identyfikacja.
  await page.getByTestId('mvd-kreator-zrodlo-nazwa').fill('GPZ W5-A');

  // Krok 2: równoważnik z katalogu (napięcie SN spływa z pozycji), składowa zerowa WYŁĄCZONA.
  await przejdzDoKroku(page, 'Źródło i strona WN');
  const katalog = page.getByTestId('mvd-kreator-zrodlo-katalog-select');
  await expect(katalog.locator(`option[value="${SOURCE_ID}"]`)).toHaveCount(1, { timeout: 20000 });
  await katalog.selectOption(SOURCE_ID);
  const zero = page.getByTestId('mvd-kreator-zrodlo-zero-toggle');
  if (await zero.isChecked()) await zero.click();
  await expect(zero).not.toBeChecked();

  // Krok 3: transformatory 110/SN są zawarte w równoważniku na szynach SN — kreator
  // nie oferuje ich liczby ani typu (granica zasilania SN).
  await przejdzDoKroku(page, 'Transformatory');
  await expect(page.getByTestId('mvd-kreator-zrodlo-transformatory-poza-modelem')).toBeVisible();
  await expect(page.getByTestId('mvd-kreator-zrodlo-transformator-katalog')).toHaveCount(0);

  // Krok 4: rozdzielnia SN — punkt neutralny uziemiony przez rezystor 12 Ω (natywnie).
  await przejdzDoKroku(page, 'Rozdzielnia SN');
  await page.getByTestId('mvd-kreator-zrodlo-uziemienie').selectOption('resistor_grounded');
  await page.getByTestId('mvd-kreator-zrodlo-uziemienie-ohm').fill('12');

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
  // Odpowiedź `/enm` serializuje pełny kontrakt `GroundingConfig` (składowa nieużywana = null).
  expect(zrodlo.neutral_grounding).toMatchObject({ type: 'resistor_grounded', r_ohm: 12 });
  expect(zrodlo.neutral_grounding?.x_ohm ?? null).toBeNull();

  // Granica zasilania SN: brak transformatorów 110/SN w modelu i brak Z0 wyprowadzonego
  // z transformatora spoza modelu.
  expect(zrodlo.source_side ?? 'SN').toBe('SN');
  expect(enm.transformers ?? []).toHaveLength(0);
  expect(zrodlo.r0_ohm ?? null).toBeNull();
  expect(zrodlo.x0_ohm ?? null).toBeNull();
  expect(zrodlo.z0_z1_ratio ?? null).toBeNull();
  expect((zrodlo.materialized_params ?? {}) as Record<string, unknown>).not.toHaveProperty(
    'zero_sequence_provenance',
  );

  // Uziemiony bez Z0 = blokada nazwana walidatora, z podpowiedzią źródła danych Z0.
  const walidacja = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm/validate`, { timeout: 30000 });
  expect(walidacja.ok()).toBeTruthy();
  const { issues } = (await walidacja.json()) as {
    issues: Array<{ code: string; element_refs: string[]; message_pl: string; suggested_fix?: string | null }>;
  };
  const blokada = issues.filter((i) => i.code === 'E-W5-01' && i.element_refs.includes(zrodlo.ref_id));
  expect(blokada).toHaveLength(1);
  expect(blokada[0].message_pl).toContain('nie ma impedancji zerowej');
  expect(blokada[0].suggested_fix ?? '').toContain('równoważnik sieci po stronie 110 kV');

  // Kasacje: szyny bez `grounding`, meta stacji GPZ bez `grounding`/`zero_sequence`.
  for (const szyna of enm.buses ?? []) expect(szyna).not.toHaveProperty('grounding');
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
  expect(gpz, 'stacja GPZ w modelu').toBeTruthy();
  expect(gpz?.meta ?? {}).not.toHaveProperty('grounding');
  expect(gpz?.meta ?? {}).not.toHaveProperty('zero_sequence');
});
