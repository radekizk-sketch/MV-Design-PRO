/**
 * E2E real-backend — legenda symboli „na żądanie" (K12, KARTA_K12, dyrektywa
 * właściciela 2026-07-30).
 *
 * Legenda symboli NIE może być stałą treścią schematu — zabiera miejsce,
 * jest cięższa wizualnie niż sama sieć, pokazuje symbole nieobecne w
 * projekcie. Wywoływana z przycisku w doku widoku kanwy (`sld-v3-view-dock`),
 * treść panelu liczona z FAKTYCZNIE narysowanej sceny (zero fabrykacji).
 *
 * Bramka 1 karty:
 *  (a) po otwarciu schematu legenda NIE jest widoczna na kanwie,
 *  (b) przycisk legendy otwiera panel; panel zawiera WYŁĄCZNIE symbole
 *      obecne w projekcie (asercja negatywna: sieć NIE ma ŻADNEGO źródła
 *      DER, więc „Instalacja fotowoltaiczna" nie może się pojawić),
 *  (c) zamknięcie panelu przywraca kanwę (legenda znika z DOM).
 *
 * Sieć testowa: TA SAMA sekwencja domain-ops co `critical-run-flow.spec.ts`
 * (źródło SN → magistrala → stacja SN/nN z transformatorem) + pole SN roli
 * `'TR'` (karta BUGI-PRODUKTU-E2E, patrz komentarz przy `sn_fields` niżej —
 * bez niego transformator NIE jest NIGDZIE narysowany, mimo że poprawnie
 * istnieje w modelu) + blok `station_auxiliary` JAWNY w payloadzie.
 *
 * KOREKTA ZAŁOŻENIA (naprawa regresji CI-D, 2026-09-04): poprzednia wersja
 * tego komentarza twierdziła, że backend materializuje „potrzeby własne"
 * stacji BEZWARUNKOWO przy każdym tworzeniu transformatora — NIEPRAWDA
 * względem obecnego kodu. `_materialize_station_auxiliary_load`
 * (`domain_operations.py`) tworzy odbiór WYŁĄCZNIE, gdy payload niesie blok
 * `station_auxiliary` (P>0) — dokładnie to, co realny „Kreator stacji"
 * (`ui2/kreatory/stacja/stacjaModel.ts::blokPotrzebWlasnych`) wysyła TYLKO
 * gdy projektant jawnie wpisze moc (`DEFAULT_FORM_DATA.station_auxiliary_kw
 * = ''` — puste pole = brak odbioru, komentarz w kodzie: „G-STK-3"). Żaden
 * inny plik e2e (~46 używających `insert_station_on_segment_sn`) nie
 * przekazuje tego bloku, więc PRZED tą naprawą test opierał się na
 * odbiorze, którego siec NIGDY nie miała — asercja `loadArrow` była
 * fałszywie pozytywna wyłącznie tak długo, jak nikt jej realnie nie
 * sprawdził na żywym backendzie. Naprawa: sieć jawnie ZAMAWIA potrzeby
 * własne (jak zrobiłby to projektant w kreatorze), więc `loadArrow` jest
 * asercją POZYTYWNĄ opartą o REALNY odbiór, nie o zignorowany domysł;
 * negatyw bramki (b) idzie przez brak źródła DER.
 *
 * Uruchomienie (WYŁĄCZNIE tak — patrz CLAUDE.md/karta):
 *   cd mv-design-pro/frontend && node ./scripts/playwright-run.mjs \
 *     e2e/legenda-na-zadanie.spec.ts
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const CATALOG_VERSION = '2024.1';
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
        idempotency_key: `e2e-legenda-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
    // Domyślne 10 s Playwrighta bywa za krótkie pod obciążeniem współdzielonej
    // maszyny (wiele równoległych sesji agentów) — `insert_station_on_segment_sn`
    // (tworzenie transformatora + rozwiązanie katalogu) bywa cięższe niż
    // `add_grid_source_sn`/`continue_trunk_segment_sn`, zmierzone w tej sesji.
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
  const projectName = `E2E Legenda ${suffix}`;
  const caseName = `Przypadek legenda ${suffix}`;

  // Timeout hojny (nie domyślne 10 s Playwrighta) — patrz komentarz w
  // `executeDomainOp`: maszyna współdzielona z innymi sesjami/testami bywa
  // obciążona, backend odpowiada wolniej niż w izolowanym CI.
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Test legendy na zadanie (K12)',
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
 * Sieć BEZ DER: źródło SN → magistrala (1 odcinek) → stacja SN/nN z
 * transformatorem. Żaden krok NIE dodaje generatora/PV/BESS — symbole DER
 * (np. `derPv`) nie mają prawa pojawić się na scenie ani w legendzie.
 * `loadArrow` ("Odbiór (zagregowany)") NA ODWRÓT: JEST obecny, bo
 * `insert_station_on_segment_sn` niesie tu JAWNY blok `station_auxiliary`
 * (P>0) — TA SAMA droga, którą realny „Kreator stacji" wysyła, gdy
 * projektant wpisze moc potrzeb własnych (`stacjaModel.ts::
 * blokPotrzebWlasnych`, G-STK-3; `_materialize_station_auxiliary_load`,
 * `domain_operations.py`). Backend NIE tworzy tego odbioru bez tego bloku
 * (puste pole w kreatorze = brak odbioru, `DEFAULT_FORM_DATA.
 * station_auxiliary_kw = ''`) — poprzednia wersja komentarza zakładała
 * odwrotnie i test padał na żywym backendzie (naprawa regresji CI-D).
 *
 * POLE 'TR' JEST WYMAGANE (karta BUGI-PRODUKTU-E2E, diagnoza root-cause).
 * Backend (`domain_operations.py::insert_station_on_segment_sn`) ZAWSZE łączy
 * nowy transformator wprost `sn_bus_id → nn_bus_id`, ale wiąże go z polem SN
 * (dopisuje `tr_id` do `equipment_refs`) WYŁĄCZNIE gdy `sn_fields` niesie wpis
 * `bay_role: 'TR'` (pętla „Update substation" po utworzeniu transformatora).
 * Front (`enmToSldAdapter.ts::buildStationMiniBaysFromFieldSpecs` →
 * `compose/station.ts`) rysuje symbol `transformer2W` WYŁĄCZNIE jako część
 * stosu aparatów pola z rolą TRANSFORMER/RMU_TRANSFORMER — bez pola TR
 * transformator ISTNIEJE w modelu (poprawnie połączony, widoczny w KPI/
 * badge'ach stacji), ale NIE JEST NIGDZIE narysowany na kanwie v3 (potwierdzone
 * pomiarem DOM: `scene.symbols` dla takiej stacji niesie WYŁĄCZNIE
 * loadBreakSwitch/cableHead/earthSwitch trzech pól liniowych, zero
 * `transformer2W`). Sekwencja `['IN','OUT','FEEDER']` (bez `'TR'`) jest
 * powielona w ~29 innych plikach e2e (w tym `critical-run-flow.spec.ts`) —
 * KLASA defektu nazwana w `docs/v12xx/REJESTR_KONFLIKTOW.md` (wpis
 * BUGI-PRODUKTU-E2E), naprawa rysowania transformatora BEZ pola TR jest poza
 * zakresem tej karty (dotyka `compose/station.ts`, współdzielonego z ~20
 * zrzutami ekranowymi innej, równolegle prowadzonej karty — zmiana geometrii
 * przesunęłaby ich baseline'y). Tu: sieć zbudowana z JAWNYM polem TR — droga
 * już poprawnie zaimplementowana i przetestowana — żeby bramka (b) testowała
 * legendę (jej filtr „tylko obecne symbole"), a nie nieudokumentowany brak
 * rysunku.
 */
async function buildStationNetworkWithoutDer(request: APIRequestContext, caseId: string): Promise<void> {
  await executeDomainOp(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: buildCatalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  const op = await executeDomainOp(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 250,
      name: 'Odcinek 1',
      catalog_binding: buildCatalogBinding('KABEL_SN', CABLE_ID),
    },
  });
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
    // Odbiór „potrzeby własne" (G-STK-3) — JAWNY, jak wpisałby go projektant
    // w kreatorze (`stacjaModel.ts::blokPotrzebWlasnych`); bez tego bloku
    // `_materialize_station_auxiliary_load` nie tworzy ŻADNEGO odbioru
    // (patrz komentarz nagłówka pliku) i `loadArrow` w legendzie (b) nie ma
    // czego pokazać. Wartości jak w innych fixture'ach odbioru nN w e2e
    // (np. `test_add_nn_load_po_promocji...` w backendzie) — rząd wielkości
    // realnych potrzeb własnych stacji SN/nN, cosφ jak domyślna wartość
    // kreatora (`DEFAULT_FORM_DATA.station_auxiliary_cosphi`).
    station_auxiliary: { active_power_kw: 5.0, cos_phi: 0.95 },
  });
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

  // Rozmiar viewportu WPŁYWA na dobór poziomu szczegółu (LOD, karta
  // BUGI-PRODUKTU-E2E, diagnoza root-cause bramki (b)). Kanwa v3 auto-
  // dopasowuje kamerę do treści przy starcie; przy DOMYŚLNYM viewporcie
  // Playwrighta (1280×720, `playwright.config.ts`) ta MAŁA sieć referencyjna
  // (GPZ + 1 stacja) mieści się w kadrze przy skali odpowiadającej L0
  // („Przegląd sieci" — stacja/GPZ jako symbol ZBIORCZY, `stationCollapsed`/
  // `gpzCollapsed`; zero aparatury pola, w tym `transformer2W`, w scenie tego
  // LOD — `buildMeasureInput`, `SldCanvasV3.tsx`). Pomiar: identyczna sieć,
  // identyczna sekwencja kliknięć, RÓŻNI się WYŁĄCZNIE viewport — 1280×720 daje
  // legendę (6) bez `transformer2W`/pól SN, 1600×900 daje legendę (13) z pełną
  // aparaturą. Pozostałe specy potrzebujące szczegółu pola (np. `kd8-motyw-
  // jedna-prawda.spec.ts`) już ustawiają 1600×900 z tego samego powodu — ta
  // sama, jedna przyczyna źródłowa, ten sam zaradczy wzorzec.
  await page.setViewportSize({ width: 1600, height: 900 });

  await page.goto('/#sld', { waitUntil: 'commit' });
  // Timeout hojny (nie 30000 jak w innych specach): PIERWSZA nawigacja po
  // starcie webServera (`reuseExistingServer` startuje serwer OD ZERA, gdy
  // porty 8000/5173 są wolne) trafia na zimną kompilację Vite ogromnego
  // drzewa modułów aplikacji — zmierzone w tej sesji: pierwsza nawigacja w
  // pliku potrafi przekroczyć 30 s mimo w pełni poprawnego renderu (dowód:
  // zrzut DOM z nieudanego biegu pokazywał kompletnie zrenderowaną aplikację
  // z kanwą SLD). Kolejne nawigacje w TYM SAMYM biegu korzystają z ciepłego
  // cache transformacji Vite.
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 60000 });
  await expect(page.getByTestId('sld-canvas-v3')).toBeVisible({ timeout: 30000 });
}

test.describe('Legenda symboli na żądanie (K12)', () => {
  test.setTimeout(120000);

  test('(a) po otwarciu schematu legenda NIE jest widoczna na kanwie', async ({ page, request }) => {
    const seed = await createProjectAndCase(request);
    await buildStationNetworkWithoutDer(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    await expect(page.getByTestId('sld-sheet-legend')).toHaveCount(0);
    // Dok istnieje (przycisk „na żądanie" jest jawnym, widocznym wejściem,
    // nie ukrytym skrótem) — panel jeszcze zamknięty.
    await expect(page.getByTestId('sld-v3-view-dock')).toBeVisible();
    await expect(page.getByTestId('sld-v3-legend-toggle')).toBeVisible();
    await expect(page.getByTestId('sld-v3-legend-panel')).toHaveCount(0);
  });

  test('(b) przycisk legendy otwiera panel z WYŁĄCZNIE symbolami obecnymi w projekcie (brak agregatu ⇒ brak wpisu)', async ({
    page,
    request,
  }) => {
    const seed = await createProjectAndCase(request);
    await buildStationNetworkWithoutDer(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    // Klik NATYWNY Playwright (nie syntetyczny dispatchEvent) — dyrektywa
    // Zero-Debt pkt 5: nowy test interakcji zaczyna od ścieżki natywnej.
    await page.getByTestId('sld-v3-legend-toggle').click();

    const panel = page.getByTestId('sld-v3-legend-panel');
    await expect(panel).toBeVisible();

    // Pozytyw: transformator ISTNIEJE w sieci (krok `insert_station_on_segment_sn`
    // z `transformer.create=true`) — legenda MUSI go objaśnić.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-transformer2W')).toBeVisible();
    await expect(panel.getByTestId('sld-v3-legend-panel-item-gridSource')).toBeVisible();

    // Pozytyw (karta BUGI-PRODUKTU-E2E, POPRAWKA ZALOZENIA): backend materializuje
    // "potrzeby wlasne" stacji — maly, ZAWSZE obecny odbior nN — bezwarunkowo przy
    // KAZDYM tworzeniu transformatora (`_materialize_station_auxiliary_load`,
    // `domain_operations.py::insert_station_on_segment_sn`, poza gestia pola `TR`).
    // Ta siec WIEC ma agregat 0,4 kV — `loadArrow` to REALNY, nie fabrykowany wpis;
    // dawna asercja negatywna byla oparta na blednym zalozeniu (patrz komentarz
    // naglowka pliku).
    await expect(panel.getByTestId('sld-v3-legend-panel-item-loadArrow')).toBeVisible();

    // Negatyw (zero fabrykacji, §0.3 karty): sieć NIE ma ŻADNEGO źródła DER —
    // "Instalacja fotowoltaiczna" nie może być wpisem legendy tego projektu.
    await expect(panel.getByTestId('sld-v3-legend-panel-item-derPv')).toHaveCount(0);
    await expect(panel).not.toContainText('fotowoltaiczna');

    // "Linia napowietrzna" nigdy nie jest wpisem (v3 nie renderuje tego stylu
    // linii — zero fabrykacji rozciągnięte na linie, patrz `projectLegend.ts`).
    await expect(panel.getByTestId('sld-v3-legend-panel-item-overhead')).toHaveCount(0);
  });

  test('(c) zamknięcie panelu przywraca kanwę bez legendy', async ({ page, request }) => {
    const seed = await createProjectAndCase(request);
    await buildStationNetworkWithoutDer(request, seed.caseId);
    await openSldWithActiveCase(page, seed);

    const toggle = page.getByTestId('sld-v3-legend-toggle');
    await toggle.click();
    await expect(page.getByTestId('sld-v3-legend-panel')).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId('sld-v3-legend-panel')).toHaveCount(0);
    await expect(page.getByTestId('sld-sheet-legend')).toHaveCount(0);
  });
});
