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
  issues?: Array<{
    code: string;
    element_ref?: string | null;
    element_refs?: string[];
    severity?: string;
  }>;
};

type TopologySummary = {
  spine?: Array<{ bus_ref: string }>;
  lateral_roots?: string[];
  adjacency?: Array<{ bus_ref: string; neighbor_ref: string }>;
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
  // 90 s: PIERWSZE wejscie w biegu uruchamia zimny transform vite dev calego
  // grafu modulow (zmierzone na tym kontenerze: >30 s, kolejne wejscia ~2 s).
  // To budzet rozruchu narzedzia, nie asercja produktu — asercje maja wlasne,
  // krotkie limity, wiec realne zwisy UI nadal sa lapane.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
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

/** Szyny widoczne w drzewie topologii (te same, na których siadają liczniki). */
async function szynyDrzewa(request: APIRequestContext, caseId: string): Promise<Set<string>> {
  const response = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm/topology/summary`);
  expect(response.ok()).toBeTruthy();
  const summary = (await response.json()) as TopologySummary;
  const refy = new Set<string>();
  for (const wezel of summary.spine ?? []) refy.add(wezel.bus_ref);
  for (const ref of summary.lateral_roots ?? []) refy.add(ref);
  for (const wpis of summary.adjacency ?? []) {
    refy.add(wpis.bus_ref);
    refy.add(wpis.neighbor_ref);
  }
  return refy;
}

/**
 * Rozwija grupy drzewa topologii („Magistrala (od GPZ)", „Węzły izolowane") —
 * liczniki siedza na WEZLACH, wiec bez rozwiniecia nie sa wyrenderowane.
 * Klik w chevron = ta sama kontrolka, ktorej uzywa inzynier (klik natywny).
 */
async function rozwinGrupyDrzewa(page: Page): Promise<void> {
  for (const grupa of ['magistrala', 'izolowane']) {
    const chevron = page.getByTestId(`mvd-tree-chevron-${grupa}`);
    if ((await chevron.count()) === 0) continue;
    if ((await chevron.textContent())?.includes('▸')) await chevron.click();
  }
}

test('drzewo topologii i panel gotowości pokazują TĘ SAMĄ blokadę — i gasną razem po naprawie', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);

  const seed = await createProjectAndCase(request);
  await otworzPowlokeZKontekstem(page, seed);

  // --- Sieć gotowa: GPZ + dwa odcinki katalogowe ----------------------------
  await executeDomainOp(request, seed.caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let op: DomainOpResponse | null = null;
  for (const [idx, dlugosc] of [300, 250].entries()) {
    op = await executeDomainOp(request, seed.caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: dlugosc,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmenty = op?.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmenty.length).toBeGreaterThan(1);

  // --- BLOKADA GOTOWOŚCI: łącznik normalnie otwarty odcina ciąg od źródła ---
  // (realna sytuacja projektowa: NOP na pierwszym odcinku ⇒ wyspa bez zasilania,
  // walidator zwraca blokadę E003 wskazującą SZYNY — czyli węzły drzewa.)
  await executeDomainOp(request, seed.caseId, 'set_normal_open_point', {
    switch_ref: segmenty[0],
  });

  // ŹRÓDŁO 1 (serwer): blokada istnieje i wskazuje szyny obecne w drzewie.
  const gotowoscPrzed = await pobierzGotowosc(request, seed.caseId);
  expect(gotowoscPrzed.ready).toBe(false);
  expect(blokadySerwera(gotowoscPrzed)).toBeGreaterThan(0);

  const szyny = await szynyDrzewa(request, seed.caseId);
  const blokadyNaSzynach = new Set<string>();
  for (const issue of gotowoscPrzed.issues ?? []) {
    if (issue.severity !== 'BLOCKER') continue;
    for (const ref of [issue.element_ref, ...(issue.element_refs ?? [])]) {
      if (ref && szyny.has(ref)) blokadyNaSzynach.add(ref);
    }
  }
  expect(blokadyNaSzynach.size).toBeGreaterThan(0);

  await przeladujPowloke(page);

  // ŹRÓDŁO 2 (drzewo topologii przestrzeni „Model") — licznik NIEZEROWY na tej
  // samej szynie, o której mówi serwer. Przed KD-1 badge NIE POJAWIAL sie nigdy.
  await page.getByRole('button', { name: /^Model sieci \d$/ }).click();
  await rozwinGrupyDrzewa(page);
  const pierwszaSzyna = [...blokadyNaSzynach].sort()[0];
  const badge = page.getByTestId(`mvd-tree-badge-${pierwszaSzyna}`);
  await expect(badge).toBeVisible({ timeout: 20000 });
  // Jeden problem = JEDEN wpis (regresja podwojnego liczenia element_ref/element_refs).
  await expect(badge.locator('.mvd-tree-badge-blokady')).toHaveText('1');

  // ŹRÓDŁO 3 (chrom powłoki) — ta sama liczba blokad co u serwera.
  await expect(page.getByTestId('mvd-casebar-readiness')).toContainText(
    String(blokadySerwera(gotowoscPrzed)),
  );

  // Zrzut do oceny właściciela: DRZEWO topologii z licznikiem blokad na węźle
  // (przed KD-1 ten znacznik nie pojawiał się nigdy — liczniki były zerowe).
  await zrzutObuMotywow(page, 'gotowosc-drzewo');

  // ŹRÓDŁO 4 (panel gotowości) — liczy DOKŁADNIE tyle blokad co serwer.
  await page.getByRole('button', { name: /^Gotowość \d$/ }).click();
  await expect(page.getByTestId('mvd-gotowosc-panel')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-gotowosc-blokady-calkowite')).toHaveText(
    String(blokadySerwera(gotowoscPrzed)),
  );

  // --- NAPRAWA blokady: zamkniecie lacznika przywraca zasilanie ciagu -------
  await executeDomainOp(request, seed.caseId, 'update_element_parameters', {
    element_ref: segmenty[0],
    parameters: { status: 'closed' },
  });

  const gotowoscPo = await pobierzGotowosc(request, seed.caseId);
  expect(blokadySerwera(gotowoscPo)).toBe(0);

  await przeladujPowloke(page);
  await page.getByRole('button', { name: /^Model sieci \d$/ }).click();
  await rozwinGrupyDrzewa(page);

  // Obie prawdy gasna RAZEM: licznik znika z drzewa, chrom przestaje liczyc blokady.
  await expect(page.getByTestId(`mvd-tree-badge-${pierwszaSzyna}`)).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(page.getByTestId('mvd-casebar-readiness')).not.toContainText('blokad');
});
