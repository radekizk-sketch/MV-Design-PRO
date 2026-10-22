/**
 * Kanon menu kontekstowego SLD na żywej ścieżce (V12K-351, karta MENU-KANON).
 *
 * INTENCJA: kanon `docs/v12xx/SLD_CAD_ENGINE_V12.md` („Kanoniczne menu kontekstowe") wiąże
 * stałą kolejność sekcji (Otwórz, Edytuj, Dodaj, Analizuj, Wyniki, Uzasadnienie, Raport,
 * Operacje, Usuń) na JEDYNEJ żywej ścieżce menu: `SLD_MENU_REGISTRY` → `SldContextMenuController`
 * → `useSldActionExecutor`. Wcześniej zgodność z kanonem przypinały wyłącznie testy martwego
 * rejestru, którego żaden ekran nie renderował. Ta bramka ćwiczy REALNĄ ścieżkę projektanta na
 * realnym backendzie:
 *  1. NATYWNY prawy klik w aparat pola SN na kanwie v3 → nagłówki sekcji w kolejności kanonu,
 *     sekcja „Operacje" na końcu menu aparatu (aparat nie ma pozycji „Usuń");
 *  2. klik pozycji zmieniającej model („Otwórz łącznik", operacja `open_switch`) → backend
 *     zapisuje bieżące położenie łącznika pola jako otwarte;
 *  3. ponowny prawy klik → menu czyta nowy stan modelu: „Otwórz łącznik" nieaktywne,
 *     „Zamknij łącznik" aktywne.
 *
 * Wzorzec seedu sieci: `e2e/wyspy-menu-sld.spec.ts` (sieć przez API domain-ops). Prawy klik
 * natywny w punkt wybrany sondą trafienia (`prawyKlikAparatuPola`), bez `force`.
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { isFuseBranch, isSwitchBranch, type Bay, type Branch } from '../src/types/enm';
import { polaSnStacji } from '../src/ui/shared/polaStacji';

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
    substations?: Array<{ ref_id: string }>;
    // Karta W5-B: pola stacji to rekordy `bays`; poziom pola z napięcia szyny.
    buses?: Array<{ ref_id: string; voltage_kv?: number | null }>;
    bays?: Bay[];
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
        idempotency_key: `e2e-kanon-menu-${name}-${String(++opCounter).padStart(4, '0')}`,
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
  const projectName = `E2E kanon menu ${suffix}`;
  const caseName = `Przypadek kanon menu ${suffix}`;

  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Bramka V12K-351: kanon menu kontekstowego SLD na żywej ścieżce',
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
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
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

  // REALNE refy pól SN z modelu (rekordy `bays` stacji na szynie SN — karta W5-B). Celujemy
  // prawym klikiem w aparat pola po `data-owner-ref` (scena v3: aparat niesie ref pola
  // macierzystego).
  const bayRefs = (op.snapshot?.substations ?? [])
    .flatMap((substation) => polaSnStacji(op.snapshot, substation.ref_id))
    .map((pole) => pole.ref_id)
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

/**
 * NATYWNY prawy klik w aparat pola: punkt kliku wybrany sondą `elementFromPoint` tak, aby
 * celem trafienia był obszar trafień klasy „aparat" TEGO pola (`data-hit-owner-ref`) — nie
 * nachodzący obszar odcinka ani pasek narzędzi kanwy. Zdarzenie myszy w tych współrzędnych,
 * bez `force` i bez `dispatchEvent` (wzorzec sondy szyny w `wyspy-menu-sld.spec.ts`).
 */
async function prawyKlikAparatuPola(page: Page, bayRef: string): Promise<void> {
  const selektor = `[data-element-kind="apparatus"][data-owner-ref="${bayRef}"]`;
  const aparat = await zoomujAzWidoczne(page, selektor, -240);
  await czekajNaStabilnaGeometrie(page, aparat);
  const punkt = await aparat.evaluate((el, ref) => {
    const rect = (el as SVGGraphicsElement).getBoundingClientRect();
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = Math.round(rect.x + rect.width * fx);
        const y = Math.round(rect.y + rect.height * fy);
        const top = document.elementFromPoint(x, y);
        if (top?.getAttribute('data-hit-klasa') === 'aparat' && top.getAttribute('data-hit-owner-ref') === ref) {
          return { x, y };
        }
      }
    }
    return null;
  }, bayRef);
  expect(punkt, `Brak punktu trafienia aparatu pola ${bayRef} na kanwie`).not.toBeNull();
  await page.mouse.click(punkt!.x, punkt!.y, { button: 'right' });
}

const KANON_SEKCJI = [
  'Otwórz',
  'Edytuj',
  'Dodaj',
  'Analizuj',
  'Wyniki',
  'Uzasadnienie',
  'Raport',
  'Operacje',
  'Usuń',
] as const;

type Galaz = { ref_id: string; type?: string; status?: string | null };
type PoleModelu = { ref_id: string; equipment_refs?: string[] };

async function pobierzModel(
  request: APIRequestContext,
  caseId: string,
): Promise<{ branches: Galaz[]; bays: PoleModelu[] }> {
  const odpowiedz = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`, { timeout: 30000 });
  expect(odpowiedz.ok()).toBeTruthy();
  const model = (await odpowiedz.json()) as { branches?: Galaz[]; bays?: PoleModelu[] };
  return { branches: model.branches ?? [], bays: model.bays ?? [] };
}

/** Łącznik pola z modelu backendu: jedyny łącznik/bezpiecznik wśród `equipment_refs` pola. */
function lacznikPola(model: { branches: Galaz[]; bays: PoleModelu[] }, bayRef: string): Galaz | null {
  const pole = model.bays.find((b) => b.ref_id === bayRef);
  if (!pole) return null;
  const laczniki = (pole.equipment_refs ?? [])
    .map((ref) => model.branches.find((g) => g.ref_id === ref) ?? null)
    .filter((g): g is Galaz => g !== null && (isSwitchBranch(g as Branch) || isFuseBranch(g as Branch)));
  return laczniki.length === 1 ? laczniki[0] : null;
}

async function sekcjeMenu(page: Page): Promise<string[]> {
  const naglowki = page.getByTestId('context-menu-sekcja');
  await expect(naglowki.first()).toBeVisible();
  return naglowki.evaluateAll((els) => els.map((el) => el.getAttribute('data-sekcja') ?? ''));
}

test('menu kontekstowe aparatu pola SN ma sekcje w kolejności kanonu, a „Otwórz łącznik" zmienia model (V12K-351)', async ({ page, request }) => {
  test.setTimeout(240000);

  const caseId = await createCaseFromUi(page, request);
  const { bayRefs } = await zbudujSiecZeStacja(request, caseId);

  // Pole SN z JEDNYM łącznikiem w modelu backendu, zamkniętym przed klikiem (stan wyjściowy
  // mierzony, nie zakładany).
  const modelPrzed = await pobierzModel(request, caseId);
  const poleZLacznikiem = bayRefs.find((ref) => lacznikPola(modelPrzed, ref) !== null);
  expect(poleZLacznikiem, 'Brak pola SN z jednym łącznikiem w modelu').toBeTruthy();
  const lacznikPrzed = lacznikPola(modelPrzed, poleZLacznikiem!)!;
  expect(lacznikPrzed.status).toBe('closed');

  await przeladujPowloke(page);
  await otworzKanweSchematu(page);

  await prawyKlikAparatuPola(page, poleZLacznikiem!);
  // Menu aparatu pola (nie odcinka ani stacji): pierwsza pozycja „Otwórz okno pola".
  await expect(page.getByTestId('sld-menu-open-bay')).toBeVisible();

  // 1. Kolejność sekcji: podciąg kanonu, ściśle rosnący indeks.
  const sekcje = await sekcjeMenu(page);
  const indeksy = sekcje.map((s) => KANON_SEKCJI.indexOf(s as (typeof KANON_SEKCJI)[number]));
  expect(indeksy.every((i) => i >= 0), `Sekcje spoza kanonu: ${sekcje.join(', ')}`).toBe(true);
  for (let i = 1; i < indeksy.length; i += 1) {
    expect(indeksy[i], `Kolejność sekcji: ${sekcje.join(' → ')}`).toBeGreaterThan(indeksy[i - 1]);
  }
  expect(sekcje).toEqual(['Otwórz', 'Edytuj', 'Dodaj', 'Wyniki', 'Uzasadnienie', 'Operacje']);
  // Każda pozycja leży w sekcji nagłówka, pod którym stoi — ostatnia pozycja w „Operacje".
  const pozycje = page.locator('[role="menuitem"][data-sekcja]');
  const sekcjePozycji = await pozycje.evaluateAll((els) => els.map((el) => el.getAttribute('data-sekcja') ?? ''));
  expect(sekcjePozycji.length).toBeGreaterThan(0);
  expect(sekcjePozycji[sekcjePozycji.length - 1]).toBe('Operacje');
  expect([...new Set(sekcjePozycji)]).toEqual(sekcje);

  // 2. Pozycja zmieniająca model: „Otwórz łącznik" → operacja `open_switch` na łączniku pola.
  const otworz = page.getByTestId('sld-menu-open-switch');
  await expect(otworz).toBeVisible();
  await expect(otworz).toBeEnabled();
  await expect(otworz).toHaveAttribute('data-sekcja', 'Operacje');
  const odpowiedzOperacji = page.waitForResponse(
    (response) =>
      response.url().includes('/enm/domain-ops')
      && response.request().method() === 'POST'
      && (response.request().postData() ?? '').includes('"name":"open_switch"'),
    { timeout: 20000 },
  );
  await otworz.click();
  const odpowiedz = await odpowiedzOperacji;
  expect(odpowiedz.ok()).toBeTruthy();
  const cialo = (await odpowiedz.json()) as { error?: string | null };
  expect(cialo.error ?? null).toBeNull();

  // Backend: bieżące położenie TEGO łącznika = otwarte.
  await expect
    .poll(async () => lacznikPola(await pobierzModel(request, caseId), poleZLacznikiem!)?.status ?? null, {
      timeout: 15000,
    })
    .toBe('open');

  // 3. Menu czyta nowy stan modelu.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sld-menu-open-switch')).toHaveCount(0);
  // Zmiana modelu przebudowuje scenę i kamera wraca do dopasowania (LOD bez aparatury) —
  // realny zoom kółkiem i sonda trafienia jak przy pierwszym kliku.
  await prawyKlikAparatuPola(page, poleZLacznikiem!);
  await expect(page.getByTestId('sld-menu-open-bay')).toBeVisible();
  await expect(page.getByTestId('sld-menu-open-switch')).toBeDisabled();
  await expect(page.getByTestId('sld-menu-close-switch')).toBeEnabled();
});
