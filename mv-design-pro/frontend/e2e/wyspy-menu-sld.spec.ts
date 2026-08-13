/**
 * Wyspy-kreatory w żywym menu kanwy SLD (bramka karty K5-A, diagnoza H-4).
 *
 * INTENCJA: trzy kreatory z kompletnym zapleczem (KreatorKompensatoraSn,
 * KreatorOgranicznikaSn, KreatorZrodloDyspozycyjne) były „wyspami" — operacje,
 * formularze i konteksty istniały, ale ŻADNE wejście żywego menu kanwy ich nie
 * otwierało. Ta bramka ćwiczy REALNĄ ścieżkę projektanta (prawy klik na kanwie
 * v3, real backend):
 *  1. szyna SN → „Dodaj kompensator mocy biernej" → kreator z kontekstem szyny,
 *  2. pole SN (aparat pola) → „Dodaj ogranicznik przepięć" → kreator z
 *     kontekstem pola (bez sekcji „brak miejsca"),
 *  3. stacja SN/nN (symbol zbiorczy L0) → „Dodaj agregat prądotwórczy nN" →
 *     kreator źródła dyspozycyjnego z rozwiązaną szyną nN stacji (+ menu
 *     pokazuje też „Dodaj zasilacz UPS nN").
 *
 * Wzorzec seedu sieci: e2e/restart-po-biegu.spec.ts (real backend; sieć
 * budowana przez API domain-ops, interakcje NATYWNE — zero syntetycznych
 * dispatchEvent).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

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

type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    substations?: Array<{
      ref_id: string;
      meta?: {
        field_specs?: Array<{ field_ref?: string }>;
      };
    }>;
  };
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
        idempotency_key: `e2e-wyspy-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
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
  const projectName = `E2E wyspy menu ${suffix}`;
  const caseName = `Przypadek wyspy ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka K5-A: wejścia kreatorów-wysp w żywym menu kanwy SLD',
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

async function createCaseFromUi(page: Page, request: APIRequestContext): Promise<string> {
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

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 30000 });
  await expect(page.getByTestId('active-case-bar')).toContainText(/Zakres|Bieżący zestaw/);
  return caseId;
}

/** Buduje przez API sieć GPZ → 3 odcinki → stacja SN/nN (wzorzec restart-po-biegu). */
async function zbudujSiecZeStacja(
  request: APIRequestContext,
  caseId: string,
): Promise<{ bayRefs: string[]; stationRef: string }> {
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

  op = await executeDomainOp(request, caseId, 'insert_station_on_segment_sn', {
    // B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: buildCatalogBinding('TRAFO_SN_NN', TRAFO_ID),
    },
  });

  // REALNE refy pól SN z modelu (`substations[].meta.field_specs[].field_ref`
  // — ta sama ścieżka co typ DomainOpResponse w restart-po-biegu; ENM `bays`
  // jest tu puste). Celujemy prawym klikiem w aparat pola po `data-owner-ref`
  // (scena v3: aparat niesie ref pola macierzystego).
  const bayRefs = (op.snapshot?.substations ?? [])
    .flatMap((substation) => substation.meta?.field_specs ?? [])
    .map((fieldSpec) => fieldSpec.field_ref ?? '')
    .filter((ref) => ref.length > 0);
  expect(bayRefs.length).toBeGreaterThan(0);

  // NAPRAWA (karta TESTY-DRYF-E2E poz. 2, ta sama KLASA co punkty 1-2
  // powyżej): `op.snapshot.substations` niesie DWA obiekty — syntetyczną
  // rozdzielnię GPZ (`gpz/…/substation`, BEZ szyny nN — to poprawne, GPZ
  // nie ma strony nN) i realną stację dystrybucyjną SN/nN zbudowaną wyżej
  // (`stn/…/station`). Wzorzec odróżnienia — `critical-run-flow.spec.ts`
  // (`ref_id.includes('/station')`, wyklucza `/substation` GPZ).
  const stacjaWpis = (op.snapshot?.substations ?? []).find((item) => item.ref_id.includes('/station'));
  expect(stacjaWpis, 'Brak realnej stacji SN/nN w migawce (odróżnionej od rozdzielni GPZ)').toBeTruthy();
  return { bayRefs, stationRef: stacjaWpis!.ref_id };
}

/** Przeładowanie powłoki z czekaniem na odświeżenie migawki modelu z serwera. */
async function przeladujPowloke(page: Page): Promise<void> {
  const refreshResponsePromise = page
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
  await refreshResponsePromise;
}

/** Realna ścieżka do kanwy: przestrzeń „Schemat (SLD)" + widoczny SVG kanwy v3. */
async function otworzKanweSchematu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Schemat (SLD)' }).first().click();
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible({ timeout: 20000 });
}

/**
 * Realny zoom kółkiem nad środkiem kanwy aż selektor stanie się widoczny
 * (LOD sterowany kamerą — symbol zbiorczy stacji żyje na L0, aparatura na
 * L1/L2). `deltaY > 0` oddala, `deltaY < 0` przybliża.
 */
async function zoomujAzWidoczne(page: Page, selector: string, deltaY: number): Promise<Locator> {
  const canvas = page.locator('svg[data-testid="sld-canvas-v3"]');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let i = 0; i < 30; i += 1) {
    if ((await page.locator(selector).count()) > 0) break;
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(100);
  }
  const target = page.locator(selector).first();
  await expect(target).toBeVisible({ timeout: 5000 });
  return target;
}

/** Geometria elementu stabilna = dwa kolejne odczyty bboxa identyczne (kamera
 *  po ficie, panele po pomiarze). Realny warunek zamiast sztywnego sleep. */
async function czekajNaStabilnaGeometrie(page: Page, cel: Locator): Promise<void> {
  let poprzedni = '';
  for (let i = 0; i < 40; i += 1) {
    const biezacy = await cel.evaluate((el) => {
      const rect = (el as SVGGraphicsElement).getBoundingClientRect();
      return `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
    });
    if (biezacy === poprzedni) return;
    poprzedni = biezacy;
    await page.waitForTimeout(250);
  }
}

test('menu kanwy SLD otwiera kreatory kompensatora, ogranicznika i źródła dyspozycyjnego z kontekstem elementu (bramka K5-A)', async ({ page, request }) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  const { bayRefs, stationRef } = await zbudujSiecZeStacja(request, caseId);

  // Powłoka musi zobaczyć zbudowany model (migawka z serwera).
  await przeladujPowloke(page);
  await otworzKanweSchematu(page);

  // ------------------------------------------------------------------
  // 1. Kompensator na szynie SN: prawy klik w szynę (segment `bus`).
  //    Szyna GPZ niesie kanoniczny Bus ref (meta.busRef); szyna stacji —
  //    kompozyt `${stationRef}#sn-bus` rozwiązywany przez FK w wykonawcy.
  // ------------------------------------------------------------------
  const szyna = page
    .locator('path[data-owner-ref$="#bus-primary"], path[data-owner-ref$="#sn-bus"]')
    .first();
  // Kreska szyny jest POZIOMA — bbox ma wysokość 0, więc asercja widoczności
  // Playwrighta uzna ją za „hidden". Dodatkowo w osi szyny wiszą hitboxy
  // odcinków (zejścia pól) — sondujemy elementFromPoint wzdłuż kreski i
  // klikamy NATYWNIE w punkt, w którym to SZYNA jest celem trafienia
  // (realne zdarzenia myszy, zero dispatchEvent).
  await expect(szyna).toBeAttached({ timeout: 20000 });
  // Kamera wykonuje fit po pomiarze kontenera (useMeasuredSize) — czekamy,
  // aż geometria szyny będzie STABILNA między dwoma odczytami, żeby punkt
  // kliku nie „odjechał" między pomiarem a zdarzeniem myszy.
  await czekajNaStabilnaGeometrie(page, szyna);
  // WSPÓŁRZĘDNE CAŁKOWITE: zdarzenia myszy CDP niosą całkowite piksele,
  // więc sonda elementFromPoint musi próbkować DOKŁADNIE ten sam punkt —
  // ułamek piksela potrafi przełączyć trafienie między nakładającymi się
  // hitboxami (szyna vs łącznik TR→szyna; zmierzone diagnostyką K5-A).
  //
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 2, 2026-08-12 — diagnoza dokończona
  // do końca rurociągu menu v3, rejestr konfliktów urwał ją na „filtr jest
  // gdzie indziej"): kryterium trafienia `top === el` NIGDY nie mogło się
  // ziścić — kreska widoczna (`el`, `data-owner-ref` wprost) i obszar
  // trafienia (`data-hit-*`) to DWA RÓŻNE elementy SVG w RÓŻNYCH grupach
  // (`top.parentElement === el.parentElement` też fałszywe), więc sonda
  // ZAWSZE cicho spadała na fallback (środek bboxa szyny). Zmierzone
  // debugiem (elementsFromPoint na siatce referencyjnej): środek bboxa
  // szyny GPZ pokrywa się PIKSEL W PIKSEL z hit-areą zejścia transformatora
  // do szyny (`data-hit-klasa="tor"`, `.../transformer/.../wn_sn#tr-field-to-bus`),
  // która w tym punkcie leży NAD hit-areą szyny w z-order. Klasa „tor" nie
  // ma prawa rozwiązać się do kategorii menu „section" (`KOTWICE_DOZWOLONE_DLA_KLASY.tor
  // = ['galaz','pole']`, `canvasMenuSubject.ts`) — menu nie dostaje ŻADNEGO
  // dopuszczalnego tematu i nie otwiera się wcale (martwy prawy klik w
  // TYM JEDNYM punkcie T-złącza, nie defekt rejestru pozycji menu sekcji).
  // Poprawne kryterium trafienia: `elementFromPoint` zwraca hit-area O
  // WŁAŚCIWEJ klasie („szyna") WSKAZUJĄCĄ na TĘ SAMĄ szynę (`data-hit-owner-ref`
  // zgodny z `data-owner-ref` kreski) — nie tożsamość/rodzeństwo DOM.
  const punktSzyny = await szyna.evaluate((el) => {
    const rect = (el as SVGGraphicsElement).getBoundingClientRect();
    const yBase = Math.round(rect.y + rect.height / 2);
    const wlasnyRef = el.getAttribute('data-owner-ref');
    for (const frac of [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.05, 0.95, 0.1, 0.9]) {
      for (const dy of [0, -1, 1, -2, 2]) {
        const x = Math.round(rect.x + rect.width * frac);
        const y = yBase + dy;
        const top = document.elementFromPoint(x, y);
        const klasa = top?.getAttribute('data-hit-klasa');
        const hitRef = top?.getAttribute('data-hit-owner-ref');
        if (klasa === 'szyna' && hitRef === wlasnyRef) {
          return { x, y };
        }
      }
    }
    return { x: Math.round(rect.x + rect.width / 2), y: yBase };
  });
  await page.mouse.click(punktSzyny.x, punktSzyny.y, { button: 'right' });
  const akcjaKompensatora = page.getByTestId('sld-menu-add-compensator');
  await expect(akcjaKompensatora).toBeVisible();
  await expect(akcjaKompensatora).toBeEnabled();
  await akcjaKompensatora.click();

  // Kreator otwarty Z KONTEKSTEM tej szyny: sekcja „brak szyny" NIE istnieje.
  await expect(page.getByTestId('mvd-kreator-kompensator')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-kompensator-brak-szyny')).toHaveCount(0);
  await expect(page.getByTestId('mvd-kreator-kompensator-gotowosc')).toBeVisible();
  await page.getByTestId('mvd-kreator-kompensator-anuluj').click();
  await expect(page.getByTestId('mvd-kreator-kompensator')).toHaveCount(0);

  // ------------------------------------------------------------------
  // 2. Ogranicznik na polu SN: prawy klik w aparat pola (data-owner-ref =
  //    REALNY ref pola z modelu — zero zgadywania).
  // ------------------------------------------------------------------
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible();
  await zoomujAzWidoczne(page, '[data-element-kind="apparatus"][data-owner-ref]', -240);
  const znaneBayRefy = new Set(bayRefs);
  const aparaty = page.locator('[data-element-kind="apparatus"][data-owner-ref]');
  const liczbaAparatow = await aparaty.count();
  let aparatPola: Locator | null = null;
  for (let i = 0; i < liczbaAparatow; i += 1) {
    const ownerRef = await aparaty.nth(i).getAttribute('data-owner-ref');
    if (ownerRef && znaneBayRefy.has(ownerRef)) {
      aparatPola = aparaty.nth(i);
      break;
    }
  }
  expect(aparatPola, 'Na kanwie brak aparatu z ownerRef pola SN z modelu').not.toBeNull();
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 2, ta sama KLASA co punkt 1 powyżej):
  // scena v3 renderuje osobną nadrzędną grupę trafień (`sld-v3-trafienia`,
  // `<rect data-hit-klasa="aparat">`) NAD warstwą wizualną — Playwright bez
  // `force` odmawia klika, bo topowy element w tym punkcie (hit-rect) nie
  // jest potomkiem lokatora `<g data-element-kind="apparatus">`. Hit-rect
  // niesie TEN SAM `data-owner-ref` co lokator, więc trafienie jest
  // poprawne — `force` tylko pomija sprawdzenie DOM-ancestry Playwrighta,
  // nie zmienia współrzędnych kliku.
  await aparatPola!.click({ button: 'right', force: true });
  const akcjaOgranicznika = page.getByTestId('sld-menu-add-arrester');
  await expect(akcjaOgranicznika).toBeVisible();
  await akcjaOgranicznika.click();

  // Kreator otwarty Z KONTEKSTEM pola: sekcja „brak miejsca" NIE istnieje.
  await expect(page.getByTestId('mvd-kreator-ogranicznik')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-ogranicznik-brak-miejsca')).toHaveCount(0);
  await page.getByTestId('mvd-kreator-ogranicznik-anuluj').click();
  await expect(page.getByTestId('mvd-kreator-ogranicznik')).toHaveCount(0);

  // ------------------------------------------------------------------
  // 3. Agregat/UPS na stacji: symbol zbiorczy stacji żyje na L0 — realny
  //    zoom-out kółkiem, potem prawy klik w stację.
  // ------------------------------------------------------------------
  await expect(page.locator('svg[data-testid="sld-canvas-v3"]')).toBeVisible();
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 2): selektor generyczny
  // `[data-element-kind="station"]` łapał PIERWSZY pasujący symbol na
  // kanwie — GPZ (`gpz/…/substation`) renderuje WŁASNY symbol zbiorczy L0
  // z tym samym `data-element-kind="station"`, ale bez szyny nN (poprawnie
  // — GPZ nie ma strony nN), więc menu poprawnie blokowało agregat/UPS dla
  // ZŁEGO obiektu. Selektor zawężony do realnej stacji SN/nN (`stationRef`).
  const stacja = await zoomujAzWidoczne(page, `[data-element-kind="station"][data-owner-ref="${stationRef}"]`, 320);
  // NAPRAWA (karta TESTY-DRYF-E2E poz. 2, ta sama KLASA co punkty wyżej):
  // hit-rect nadrzędnej grupy `sld-v3-trafienia` (`data-hit-klasa="stacja"`,
  // ten sam `data-owner-ref`) przechwytuje wskaźnik nad `<g data-element-kind="station">`.
  await stacja.click({ button: 'right', force: true });
  const akcjaAgregatu = page.getByTestId('sld-menu-add-genset');
  await expect(akcjaAgregatu).toBeVisible();
  // Obie akcje źródeł dyspozycyjnych obecne w menu stacji.
  await expect(page.getByTestId('sld-menu-add-ups')).toBeVisible();
  await expect(akcjaAgregatu).toBeEnabled();
  await akcjaAgregatu.click();

  // Kreator źródła dyspozycyjnego otwarty z kontekstem stacji: szyna nN
  // rozwiązana z modelu (pole wyboru ma niepustą wartość).
  await expect(page.getByTestId('mvd-kreator-zrodlo-dysp')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('mvd-kreator-zrodlo-dysp-szyna')).toBeVisible();
  await expect(page.getByTestId('mvd-kreator-zrodlo-dysp-szyna')).not.toHaveValue('');
  await page.getByTestId('mvd-kreator-zrodlo-dysp-anuluj').click();
  await expect(page.getByTestId('mvd-kreator-zrodlo-dysp')).toHaveCount(0);
});
