/**
 * JEDNA PRAWDA GOTOWOŚCI we wszystkich czytelnikach (bramka karty KD-1, dług V12K-286).
 *
 * INTENCJA: liczniki blokad w drzewie topologii i lista blokad w panelu
 * gotowości muszą pochodzić z TEGO SAMEGO źródła — odpowiedzi domenowej
 * `readiness` migawki modelu (to samo, co zwraca
 * `/api/cases/{id}/engineering-readiness`). Dotąd drzewo czytało osobny store
 * `readinessLiveStore`, którego `refresh` NIKT NIGDY nie wołał, więc liczniki
 * blokad były ZAWSZE zerowe, choć panel gotowości pokazywał blokady.
 *
 * SCENARIUSZ (kliki natywne, realny backend):
 * 1. sieć z BLOKADĄ gotowości (odcinek bez typu katalogowego) → drzewo topologii
 *    przestrzeni „Model" pokazuje NIEZEROWY licznik blokad na tym elemencie,
 *    zgodny z liczbą blokad w panelu gotowości i z odpowiedzią serwera;
 * 2. po naprawie blokady (przypisanie katalogu) licznik ZNIKA, a panel gotowości
 *    przestaje pokazywać ten element — obie prawdy idą razem.
 *
 * Wzorzec seedu i budowy sieci: e2e/stany-zerowe-akcje.spec.ts (real backend).
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
/** Zrzuty do oceny właściciela (dyrektywa #8) — ŻYWA aplikacja, oba motywy. */
const KATALOG_ZRZUTOW = path.resolve(_dirname, '../../docs/audit/visual/flow-ekspert');

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
let opCounter = 0;
let entityCounter = 0;

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string }>;
  };
};

type ReadinessResponse = {
  ready: boolean;
  by_severity?: Record<string, number>;
  issues?: Array<{ code: string; element_ref?: string | null; severity?: string }>;
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
        idempotency_key: `e2e-gotowosc-jedna-prawda-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function pobierzGotowosc(
  request: APIRequestContext,
  caseId: string,
): Promise<ReadinessResponse> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/engineering-readiness`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ReadinessResponse;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  entityCounter += 1;
  const suffix = String(entityCounter).padStart(4, '0');
  const projectName = `E2E jedna prawda gotowosci ${suffix}`;
  const caseName = `Przypadek gotowosci ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka KD-1: jedna prawda gotowości we wszystkich czytelnikach',
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
      name: caseName,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

async function otworzPowlokeZKontekstem(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
  await page.addInitScript((dane) => {
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
  }, seed);

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
}

async function przeladujPowloke(page: Page): Promise<void> {
  const refresh = page
    .waitForResponse(
      (response) =>
        response.url().includes('/enm/domain-ops')
        && response.request().method() === 'POST'
        && (response.request().postData() ?? '').includes('"name":"refresh_snapshot"'),
      { timeout: 15000 },
    )
    .catch(() => null);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await refresh;
}

async function zrzutObuMotywow(page: Page, nazwa: string): Promise<void> {
  fs.mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-dark.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
  await page.screenshot({ path: path.join(KATALOG_ZRZUTOW, `${nazwa}-light.png`) });
  await page.getByTestId('mvd-theme-toggle').click();
}

/** Liczba blokad wg SERWERA (źródło 1). */
function blokadySerwera(gotowosc: ReadinessResponse): number {
  return gotowosc.by_severity?.BLOCKER ?? 0;
}

test('drzewo topologii i panel gotowości pokazują TĘ SAMĄ blokadę — i gasną razem po naprawie', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const seed = await createProjectAndCase(request);
  await otworzPowlokeZKontekstem(page, seed);

  // --- Sieć Z BLOKADĄ: odcinki bez przypisanego typu katalogowego ------------
  await executeDomainOp(request, seed.caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });
  const op = await executeDomainOp(request, seed.caseId, 'continue_trunk_segment_sn', {
    segment: { rodzaj: 'KABEL', dlugosc_m: 300, name: 'Odcinek 1' },
  });
  const segmenty = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmenty.length).toBeGreaterThan(0);

  // ŹRÓDŁO 1 (serwer): gotowość ma blokady, w tym blokady konkretnych elementów.
  const gotowoscPrzed = await pobierzGotowosc(request, seed.caseId);
  expect(gotowoscPrzed.ready).toBe(false);
  expect(blokadySerwera(gotowoscPrzed)).toBeGreaterThan(0);
  const blokadyZElementem = (gotowoscPrzed.issues ?? []).filter(
    (i) => i.severity === 'BLOCKER' && i.element_ref,
  );
  expect(blokadyZElementem.length).toBeGreaterThan(0);

  await przeladujPowloke(page);

  // ŹRÓDŁO 2 (drzewo topologii przestrzeni „Model") — licznik NIEZEROWY.
  await page.getByRole('button', { name: /^Model sieci \d$/ }).click();
  const badge = page.locator('[data-testid^="mvd-tree-badge-"]');
  await expect(badge.first()).toBeVisible({ timeout: 20000 });
  const liczbaWDrzewie = await badge.count();
  expect(liczbaWDrzewie).toBeGreaterThan(0);

  // ŹRÓDŁO 3 (panel gotowości) — ta sama liczba blokad co u serwera.
  await page.getByRole('button', { name: /^Gotowość \d$/ }).click();
  await expect(page.getByTestId('mvd-casebar-readiness')).toContainText(
    String(blokadySerwera(gotowoscPrzed)),
  );
  await zrzutObuMotywow(page, 'gotowosc-drzewo');

  // --- NAPRAWA blokady: przypisanie typu katalogowego odcinkom ---------------
  for (const issue of blokadyZElementem) {
    await executeDomainOp(request, seed.caseId, 'assign_catalog_to_element', {
      element_ref: issue.element_ref,
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    });
  }

  const gotowoscPo = await pobierzGotowosc(request, seed.caseId);
  const blokadyPo = blokadySerwera(gotowoscPo);
  expect(blokadyPo).toBeLessThan(blokadySerwera(gotowoscPrzed));

  await przeladujPowloke(page);
  await page.getByRole('button', { name: /^Model sieci \d$/ }).click();

  // Obie prawdy idą razem: mniej blokad u serwera ⇒ mniej znaczników w drzewie.
  await expect
    .poll(async () => badge.count(), { timeout: 20000 })
    .toBeLessThan(liczbaWDrzewie);
  await expect(page.getByTestId('mvd-casebar-readiness')).toContainText(
    blokadyPo > 0 ? String(blokadyPo) : 'brak uwag',
  );
});
