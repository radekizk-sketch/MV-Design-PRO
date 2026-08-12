/**
 * E2E real-backend — transformator stacji SN/nN NA RYSUNKU także bez pola
 * roli TR (karta TR2W-BEZ-POLA; `docs/v12xx/REJESTR_KONFLIKTOW.md`, wiersz
 * BUGI-PRODUKTU-E2E).
 *
 * DŁUG, KTÓRY TEN SPEC PRZYPINA. Backend
 * (`domain_operations.py::insert_station_on_segment_sn`) ZAWSZE łączy nowy
 * transformator wprost `sn_bus → nn_bus`, ale wiąże go z polem SN wyłącznie
 * wtedy, gdy `sn_fields` niesie wpis `bay_role:'TR'`. Front rysował
 * `transformer2W` WYŁĄCZNIE jako element stosu aparatów pola roli TR — więc
 * sieć zbudowana sekwencją `['IN','OUT','FEEDER']` (wzorzec 29 plików e2e, w
 * tym `critical-run-flow.spec.ts`) miała transformator POPRAWNIE policzony w
 * modelu, widoczny w KPI stacji, i NIEOBECNY na schemacie.
 *
 * TU JEST DOWÓD KOŃCA TEGO DŁUGU, i to na ŻYWYM łańcuchu: realne operacje
 * domenowe → realny backend → realny adapter → realna kanwa v3 → DOM. Sieć
 * budowana JAWNIE BEZ `'TR'` (żadnego obejścia — ten sam kształt danych, który
 * produkują pozostałe specyfikacje).
 *
 * Bramki:
 *  (a) kanwa niesie symbol transformatora stacji, kluczowany REALNYM refem
 *      ENM (klik ma w co trafić),
 *  (b) transformator jest oznaczony jako stan NIEKOMPLETNY — marker przy
 *      stronie WN + zdanie w bloku stacji („Brak skonfigurowanego pola
 *      transformatorowego SN"),
 *  (c) ZERO fabrykacji: przy transformatorze nie pojawia się aparatura pola,
 *      której dane nie niosą,
 *  (d) legenda „na żądanie" objaśnia transformator — bo jest on FAKTYCZNIE
 *      narysowany (treść legendy liczona ze sceny, nie ze słownika).
 *
 * Uruchomienie (WYŁĄCZNIE tak — patrz CLAUDE.md/karta):
 *   cd mv-design-pro/frontend && node ./scripts/playwright-run.mjs \
 *     e2e/tr2w-bez-pola.spec.ts
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
const TEKST_BRAKU_POLA = 'Brak skonfigurowanego pola transformatorowego SN';
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

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    transformers?: Array<{ ref_id?: string; hv_bus_ref?: string; lv_bus_ref?: string }>;
    substations?: Array<{
      ref_id: string;
      transformer_refs?: string[];
      meta?: { field_specs?: Array<{ bay_role?: string }> };
    }>;
  };
};

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
        idempotency_key: `e2e-tr2w-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    // Timeout hojny (nie domyślne 10 s) — maszyna współdzielona, a
    // `insert_station_on_segment_sn` (transformator + rozwiązanie katalogu)
    // jest najcięższą z tych operacji.
    timeout: 30000,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

async function createProjectAndCase(
  request: APIRequestContext,
): Promise<{ projectId: string; projectName: string; caseId: string; caseName: string }> {
  const suffix = nextEntitySuffix();
  const projectName = `E2E TR bez pola ${suffix}`;
  const caseName = `Przypadek TR bez pola ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Transformator SN/nN rysowany bez pola roli TR',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
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
    timeout: 30000,
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string };

  return { projectId: project.id, projectName, caseId: studyCase.id, caseName };
}

/**
 * Źródło SN → magistrala → stacja SN/nN z transformatorem, pola
 * `['IN','OUT','FEEDER']` — BEZ `'TR'`. To NIE jest uproszczenie testu, tylko
 * dokładnie ten kształt danych, który produkuje 29 istniejących specyfikacji
 * e2e i który przez lata nie miał transformatora na rysunku.
 *
 * Zwraca ref transformatora Z MIGAWKI — asercje kanwy sprawdzają, że rysunek
 * kluczuje symbol TYM refem, a nie identyfikatorem wymyślonym przez renderer.
 */
async function buildStationNetworkBezPolaTr(
  request: APIRequestContext,
  caseId: string,
): Promise<{ transformerRef: string }> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  const trunk = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 250,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = trunk.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  const op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });

  // ZAPADKA NA FIKSTURĘ: bez tych dwóch asercji test mógłby przejść na sieci,
  // która wcale nie ćwiczy defektu (np. gdyby backend zaczął dorzucać pole TR
  // sam z siebie, albo przestał tworzyć transformator).
  const station = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(station, 'stacja SN/nN w migawce').toBeTruthy();
  const role = (station!.meta?.field_specs ?? []).map((f) => String(f.bay_role ?? '').toUpperCase());
  expect(role, 'pola stacji NIE mogą zawierać roli TR — inaczej spec nie ćwiczy defektu').not.toContain('TR');

  // Transformator STACJI, nie GPZ: sieć ma DWA transformatory (GPZ WN/SN +
  // stacyjny SN/nN), więc wybór idzie po `Substation.transformer_refs` tej
  // stacji, a nie po dopasowaniu podciągu do refu (pierwsza wersja tego specu
  // łapała transformator GPZ i mierzyła nie ten obiekt).
  const stacyjneRefy = new Set(station!.transformer_refs ?? []);
  expect(stacyjneRefy.size, 'stacja deklaruje transformator').toBeGreaterThan(0);
  const transformator = (op.snapshot?.transformers ?? []).find((t) =>
    stacyjneRefy.has(String(t.ref_id ?? '')),
  );
  expect(transformator?.ref_id, 'transformator stacji w migawce').toBeTruthy();
  // Terminal WN transformatora — kotwica topologiczna kolumny na rysunku.
  expect(transformator?.hv_bus_ref, 'terminal WN transformatora').toBeTruthy();

  return { transformerRef: transformator!.ref_id! };
}

async function openSldWithActiveCase(
  page: Page,
  seed: { projectId: string; projectName: string; caseId: string; caseName: string },
): Promise<void> {
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

  // Rozmiar viewportu WPŁYWA na dobór poziomu szczegółu (ta sama, jedna
  // przyczyna co w `legenda-na-zadanie.spec.ts`): przy 1280×720 mała sieć
  // referencyjna mieści się w kadrze na poziomie „Przegląd sieci" (stacja jako
  // symbol ZBIORCZY — zero aparatury pola i zero transformatora W KAŻDYM
  // wariancie danych). 1600×900 daje pełny szczegół bloku stacji.
  await page.setViewportSize({ width: 1600, height: 900 });

  await page.goto('/#sld', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
}

test.describe('Transformator SN/nN na rysunku BEZ pola roli TR', () => {
  test.setTimeout(120000);

  test('(a)(b)(c) symbol widoczny, kluczowany realnym refem, oznaczony jako stan niekompletny, bez fabrykowanej aparatury', async ({
    page,
    request,
  }) => {
    const seed = await createProjectAndCase(request);
    const { transformerRef } = await buildStationNetworkBezPolaTr(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    const canvas = page.getByTestId('sld-canvas-v3');

    // (a) Symbol transformatora stacji NA KANWIE, kluczowany REALNYM refem
    // z migawki ENM (nie identyfikatorem wymyślonym przez renderer).
    const transformator = canvas.locator(`g[data-owner-ref="${transformerRef}"]`);
    await expect(transformator).toHaveCount(1, { timeout: 30000 });
    await expect(transformator).toHaveAttribute('data-element-kind', 'transformer');

    // (b) Stan NIEKOMPLETNY jawny: znacznik audytu + marker rysunkowy w grupie
    // symbolu + pełne zdanie w bloku stacji.
    await expect(transformator).toHaveAttribute('data-transformer-field-gap', 'true');
    await expect(transformator.locator('g[data-field-gap-warning="true"]')).toHaveCount(1);

    // Pełne ZDANIE stanu żyje w paśmie nazw stacji, więc — jak KAŻDY opis na
    // tej kanwie — podlega odrzucaniu nieczytelnych etykiet przy oddaleniu
    // („Ukryto N opisów — przybliż, aby zobaczyć"). MARKER przy symbolu jest
    // widoczny NIEZALEŻNIE od kadru (asercja wyżej, kadr startowy = poziom 1);
    // zdanie sprawdzamy tam, gdzie rysunek je obiecuje — na pełnym szczególe.
    // Ta sama mechanika kadrowania co `kd11-zrzuty-screenshot.spec.ts`.
    const symbolBox = await transformator.boundingBox();
    const kadr = (await canvas.boundingBox())!;
    const kursor = symbolBox
      ? { x: symbolBox.x + symbolBox.width / 2, y: symbolBox.y + symbolBox.height / 2 }
      : { x: kadr.x + kadr.width / 2, y: kadr.y + kadr.height / 2 };
    await page.mouse.move(kursor.x, kursor.y);
    let poziom = await canvas.getAttribute('data-scene-lod');
    for (let krok = 0; krok < 12 && poziom !== '2'; krok++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(150);
      poziom = await canvas.getAttribute('data-scene-lod');
    }
    await expect(canvas).toHaveAttribute('data-scene-lod', '2');
    await expect(canvas).toContainText(TEKST_BRAKU_POLA);
    // …a marker NIE znika przy zmianie poziomu szczegółu (§0.C.8: transformator
    // bez pola żyje na TYCH SAMYCH poziomach co transformator z polem).
    await expect(canvas.locator('g[data-field-gap-warning="true"]')).toHaveCount(1);

    // (c) ZERO fabrykacji: pod refem transformatora nie ma ŻADNEGO innego
    // obiektu rysunku — żadnego wyłącznika, rozłącznika, bezpiecznika, CT, VT,
    // uziemnika ani zabezpieczenia, których dane nie niosą.
    const podRefem = await canvas
      .locator(`g[data-owner-ref="${transformerRef}"]`)
      .evaluateAll((nodes) =>
        nodes.flatMap((n) =>
          Array.from(n.querySelectorAll('g[data-symbol-canon]')).map((g) =>
            g.getAttribute('data-symbol-canon'),
          ),
        ),
      );
    expect(podRefem).toEqual(['transformer2W']);
  });

  test('(d) legenda „na żądanie" objaśnia transformator — bo jest FAKTYCZNIE narysowany', async ({
    page,
    request,
  }) => {
    const seed = await createProjectAndCase(request);
    await buildStationNetworkBezPolaTr(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    // Klik NATYWNY (Zero-Debt pkt 5: test interakcji zaczyna od ścieżki
    // natywnej, nie od syntetycznego zdarzenia).
    await page.getByTestId('sld-v3-legend-toggle').click();

    const panel = page.getByTestId('sld-v3-legend-panel');
    await expect(panel).toBeVisible();
    // Treść legendy liczona z FAKTYCZNIE narysowanej sceny — wpis
    // transformatora może się pojawić WYŁĄCZNIE wtedy, gdy symbol jest na
    // rysunku. To ta sama asercja, która przed tą kartą była nieosiągalna dla
    // sieci bez pola TR.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-transformer2W')).toBeVisible();
    // Negatyw (zero fabrykacji): sieć nie ma źródła DER — wpis nie ma prawa się
    // pojawić, więc legenda naprawdę filtruje po scenie, a nie pokazuje słownika.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-derPv')).toHaveCount(0);
  });
});
