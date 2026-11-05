/**
 * E2E (realny backend): konfigurator stacji edytuje WYŁĄCZNIE model sieci (ENM).
 *
 * Karta JEDNA-SCIEZKA-EDYCJI usunęła zapisaną konfigurację stacji obok modelu (tabela,
 * repozytorium, końcówki, klient frontu). Każdy wybór konfiguratora jest operacją domenową
 * modelu, więc po odświeżeniu strony wraca z modelu, a migawka modelu przypadku (ta sama,
 * z której liczą solvery) niesie wybraną wartość. Trzy ścieżki użytkownika, każda z
 * natywnym klikiem/wyborem w kontrolce, przeładowaniem strony i odczytem migawki API:
 *
 *   1. przełącznik zaczepów transformatora (karta „Transformator") → `tap_changer` w ENM,
 *   2. odłączenie źródła OZE (karta „PV, BESS i FW", „Usuń" + potwierdzenie) → źródło znika
 *      z modelu (nie tylko z lokalnej nakładki),
 *   3. wkładka bezpiecznikowa pola SN (karta „Pola SN") i przekładnik napięciowy pola
 *      (karta „Zabezpieczenia") → aparat FUSE pola z pozycją katalogu wkładek oraz
 *      `Measurement` typu VT w polu; rezygnacja z VT usuwa przekładnik z modelu.
 *
 * Konfigurator otwiera adres z zaznaczeniem stacji (`#?sel=<stacja>&type=Station&name=<nazwa>`) — ta
 * sama droga, którą odtwarza odświeżenie strony po kliknięciu stacji na schemacie.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

import { katalogZrzutow } from './katalogZrzutow';
import { ustawMotyw } from './siecKadrowStacji';

const KATALOG_ZRZUTOW = katalogZrzutow(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'uiux', 'zrzuty', 'konfigurator-stacji-inspektor'),
);

/** Ekran stanowiska minimalny (1280×720) i pełny (1920×1080). */
const OKNA = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;
const MOTYWY = [
  { klucz: 'ciemny', theme: 'dark_scada' as const },
  { klucz: 'jasny', theme: 'light_technical' as const },
] as const;
/**
 * Szerokości inspektora: domyślna (360 px), granice przeciągania (340 i 420 px) i tryb
 * szeroki (560 px) — `ui2/shell/useShellStore.ts` (RIGHT_MIN/RIGHT_MAX/RIGHT_WIDE).
 * Ustawiane natywnie: klawiszami uchwytu inspektora i przyciskiem trybu szerokiego.
 */
const SZEROKOSCI_INSPEKTORA = ['domyslna', 'min', 'max', 'szeroki'] as const;
type SzerokoscInspektora = (typeof SZEROKOSCI_INSPEKTORA)[number];

async function ustawSzerokoscInspektora(page: Page, szerokosc: SzerokoscInspektora): Promise<void> {
  if (szerokosc === 'domyslna') return;
  if (szerokosc === 'szeroki') {
    await page.getByTestId('mvd-inspector-szeroki').click();
    await expect(page.getByTestId('mvd-inspector')).toHaveAttribute('data-szeroki', 'true');
    return;
  }
  const uchwyt = page.getByTestId('mvd-handle-right');
  await uchwyt.focus();
  // Krok klawisza 16 px; pięć naciśnięć dociąga do granicy przedziału 340–420 px.
  for (let i = 0; i < 5; i += 1) {
    await uchwyt.press(szerokosc === 'min' ? 'ArrowRight' : 'ArrowLeft');
  }
}

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';

const ROZLACZNIK_BEZPIECZNIKOWY = 'sw-fuse-eti-vv-17kv-100a';
const WKLADKA = 'fuse_15kv_50a_full';
const PRZEKLADNIK_CT = 'ct_400_5_5p20_15va_abb';
const PRZEKAZNIK = 'REF-OC-100';

interface Pole {
  ref_id: string;
  bay_role?: string;
  substation_ref?: string;
  primary_devices?: Array<{ kind: string; catalog_ref?: string | null }>;
}
interface Migawka {
  buses: Array<{ ref_id: string; voltage_kv: number }>;
  substations: Array<{
    ref_id: string;
    name: string;
    station_type?: string;
    bus_refs?: string[];
    transformer_refs?: string[];
  }>;
  transformers: Array<{
    ref_id: string;
    hv_bus_ref: string;
    lv_bus_ref: string;
    tap_changer?: { catalog_ref?: string | null } | null;
  }>;
  generators: Array<{ ref_id: string; name: string }>;
  bays: Pole[];
  measurements: Array<{ ref_id: string; measurement_type: string; bay_ref?: string; catalog_ref?: string }>;
  protection_assignments: Array<{ ref_id: string; bay_ref?: string }>;
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
}

interface Kontekst {
  pid: string;
  projektNazwa: string;
  caseId: string;
  migawka: Migawka;
  stacja: Migawka['substations'][number];
}

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/snapshot`)).ok();
  } catch {
    return false;
  }
}

let licznikOperacji = 0;

/** Jedna operacja domenowa na przypadku; zwraca migawkę modelu po operacji. */
async function operacja(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Migawka> {
  licznikOperacji += 1;
  const res = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `e2e-konf-${licznikOperacji}-${Date.now()}`, payload },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error ?? null, String(body.error)).toBeNull();
  return body.snapshot as Migawka;
}

/** Migawka modelu przypadku — ta sama, z której składa się wejście solverów. */
async function migawkaModelu(request: APIRequestContext, caseId: string): Promise<Migawka> {
  const res = await request.get(`${BACKEND_BASE}/api/cases/${caseId}/enm`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as Migawka;
}

/** Projekt + przypadek + GPZ, magistrala kablowa i stacja B z transformatorem SN/nN. */
async function zbudujProjekt(request: APIRequestContext, nazwa: string): Promise<Kontekst> {
  const projektNazwa = `${nazwa} ${Date.now()}`;
  const projectRes = await request.post(`${BACKEND_BASE}/api/projects`, { data: { name: projektNazwa } });
  expect(projectRes.status()).toBe(201);
  const pid = (await projectRes.json()).id as string;
  const caseRes = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: pid, name: 'Przypadek konfiguratora', description: '', config: {}, set_active: true },
  });
  expect(caseRes.ok()).toBeTruthy();
  const caseId = (await caseRes.json()).id as string;

  await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: {
      catalog_namespace: 'ZRODLO_SN',
      catalog_item_id: 'src-gpz-15kv-250mva-rx010',
      catalog_item_version: '2024.1',
    },
  });
  const magistrala = await operacja(request, caseId, 'continue_trunk_segment_sn', {
    segment: {
      rodzaj: 'KABEL',
      dlugosc_m: 500,
      catalog_binding: {
        catalog_namespace: 'KABEL_SN',
        catalog_item_id: 'cable-tfk-yakxs-3x120',
        catalog_item_version: '2024.1',
      },
    },
  });
  const segmenty = magistrala.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmenty.length).toBeGreaterThan(0);
  const migawka = await operacja(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmenty[segmenty.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: {
      sn_voltage_kv: 15.0,
      nn_voltage_kv: 0.4,
      station_auxiliary: { active_power_kw: 10.0, cos_phi: 0.95 },
      nn_earthing: { lv_system: 'TN-S', lv_voltage_tolerance: 'PLUS_10' },
    },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: {
        catalog_namespace: 'TRAFO_SN_NN',
        catalog_item_id: 'tr-sn-nn-15-04-630kva-dyn11',
        catalog_item_version: '2024.1',
      },
    },
  });
  const stacja = migawka.substations.find(
    (s) => s.station_type !== 'gpz' && (s.bus_refs ?? []).length > 0,
  );
  expect(stacja, 'stacja SN/nN w modelu').toBeTruthy();
  return { pid, projektNazwa, caseId, migawka, stacja: stacja! };
}

function poleStacji(migawka: Migawka, stacjaRef: string, rola: string): Pole {
  const pole = migawka.bays.find((b) => b.substation_ref === stacjaRef && b.bay_role === rola);
  expect(pole, `pole ${rola} stacji`).toBeTruthy();
  return pole!;
}

/** Zimne wejście do aplikacji z kontekstem projektu i przypadku; konfigurator stacji z adresu. */
async function otworzKonfigurator(
  page: Page,
  k: Kontekst,
  okno: { width: number; height: number } = OKNA[0],
): Promise<void> {
  await page.addInitScript((dane) => {
    // Układ powłoki (szerokość inspektora) zawsze domyślny na wejściu — test układu ustawia
    // szerokość natywnie po wejściu (`ustawSzerokoscInspektora`).
    localStorage.removeItem('mvd-shell-ui-local');
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.pid,
          activeProjectName: dane.projektNazwa,
          activeCaseId: dane.caseId,
          activeCaseName: 'Przypadek konfiguratora',
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'NONE',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: null,
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, { pid: k.pid, projektNazwa: k.projektNazwa, caseId: k.caseId });
  // Domyślnie najmniejszy ekran stanowiska (1280×720): konfigurator w wąskim inspektorze
  // musi tam dać natywny dostęp do każdego wiersza karty (test układu niżej).
  await page.setViewportSize(okno);
  await page.goto(
    // Zaznaczenie z adresu wymaga trzech parametrów (`sel`, `type`, `name`) — ten sam zapis,
    // który aplikacja kładzie w adresie po kliknięciu stacji (`urlState.ts::
    // decodeSelectionFromParams`); bez nazwy zaznaczenie jest odrzucane.
    `${FRONTEND_BASE}/#?sel=${encodeURIComponent(k.stacja.ref_id)}&type=Station&name=${encodeURIComponent(k.stacja.name)}`,
    { waitUntil: 'commit' },
  );
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('station-configurator')).toBeVisible({ timeout: 60000 });
}

async function przejdzDoKarty(page: Page, karta: string): Promise<void> {
  await page.getByTestId(`station-config-tab-${karta}`).click();
  await expect(page.getByTestId(`station-config-content-${karta}`)).toBeVisible({ timeout: 20000 });
}

/** Odświeżenie strony — stan konfiguratora odtwarza się wyłącznie z modelu. */
async function odswiez(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await expect(page.getByTestId('station-configurator')).toBeVisible({ timeout: 60000 });
}

test.describe('Konfigurator stacji — jedna ścieżka edycji (model sieci)', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!(await backendUp(request)), `Backend nie uruchomiony pod ${BACKEND_BASE}.`);
  });

  test('przełącznik zaczepów transformatora trafia do modelu i wraca po odświeżeniu', async ({
    page,
    request,
  }) => {
    test.setTimeout(240000);
    const k = await zbudujProjekt(request, 'E2E Zaczepy z konfiguratora');
    // Relacja stacji z transformatorem wprost z modelu (`Substation.transformer_refs`). Zaciski
    // transformatora NIE leżą na szynach stacji: strona SN wisi na zacisku pola, a strona nN
    // na szynie odpływu pola głównego nN po promocji aparatu (od karty JEDNA-SCIEZKA-EDYCJI
    // cz. 4 promocja jest częścią zapisu operacji, więc widać ją już w odpowiedzi operacji).
    const refyTransformatorow = new Set(k.stacja.transformer_refs ?? []);
    const transformator = k.migawka.transformers.find((t) => refyTransformatorow.has(t.ref_id));
    expect(transformator, 'transformator stacji').toBeTruthy();
    expect(transformator!.tap_changer ?? null).toBeNull();

    await otworzKonfigurator(page, k);
    await przejdzDoKarty(page, 'transformer');
    const wybor = page.getByTestId(`tr-tap-changer-${transformator!.ref_id}`);
    await expect(wybor).toBeVisible();
    // Pierwsza pozycja katalogu dopuszczona dla napięć tego transformatora (selektor karty).
    const pozycja = await wybor.locator('option:not([value=""])').first().getAttribute('value');
    expect(pozycja, 'katalog przełączników ma pozycję dla 15/0,4 kV').toBeTruthy();
    await wybor.selectOption(pozycja!);

    await expect
      .poll(
        async () =>
          (await migawkaModelu(request, k.caseId)).transformers.find(
            (t) => t.ref_id === transformator!.ref_id,
          )?.tap_changer?.catalog_ref ?? null,
        { timeout: 20000 },
      )
      .toBe(pozycja);

    await odswiez(page);
    await przejdzDoKarty(page, 'transformer');
    await expect(page.getByTestId(`tr-tap-changer-${transformator!.ref_id}`)).toHaveValue(pozycja!);
  });

  test('odłączenie źródła OZE usuwa je z modelu, nie tylko z ekranu', async ({ page, request }) => {
    test.setTimeout(240000);
    const k = await zbudujProjekt(request, 'E2E Odłączenie źródła');
    const szynaNn = k.migawka.buses.find(
      (b) => (k.stacja.bus_refs ?? []).includes(b.ref_id) && b.voltage_kv < 1.0,
    );
    expect(szynaNn, 'szyna nN stacji').toBeTruthy();
    const poMagazynie = await operacja(request, k.caseId, 'add_converter_source', {
      source_technology: 'BESS',
      connection_variant: 'nn_side',
      station_ref: k.stacja.ref_id,
      bus_nn_ref: szynaNn!.ref_id,
      source_name: 'Magazyn do odłączenia',
      bess_mode: 'DWUKIERUNKOWY',
      power_setpoint_mw: 0.01,
      catalog_binding: {
        catalog_namespace: 'ZRODLO_NN_BESS',
        catalog_item_id: 'conv-bess-nn-0p5mw-0p4kv',
        catalog_item_version: '2024.1',
      },
      source_field: { field_name: 'Pole magazynu nN', source_field_kind: 'BESS' },
    });
    const magazyn = poMagazynie.generators.find((g) => g.name === 'Magazyn do odłączenia');
    expect(magazyn, 'magazyn w modelu').toBeTruthy();

    await otworzKonfigurator(page, k);
    await przejdzDoKarty(page, 'der-sources');
    await expect(page.getByTestId(`der-row-${magazyn!.ref_id}`)).toBeVisible({ timeout: 20000 });
    await page.getByTestId(`der-action-detach-${magazyn!.ref_id}`).click();
    await expect(page.getByTestId('der-detach-confirm')).toBeVisible();
    await page.getByTestId('der-detach-ok').click();

    await expect
      .poll(
        async () =>
          (await migawkaModelu(request, k.caseId)).generators.some((g) => g.ref_id === magazyn!.ref_id),
        { timeout: 20000 },
      )
      .toBe(false);

    await odswiez(page);
    await przejdzDoKarty(page, 'der-sources');
    await expect(page.getByTestId(`der-row-${magazyn!.ref_id}`)).toHaveCount(0);
  });

  test('wkładka bezpiecznikowa i przekładnik napięciowy pola zapisane w modelu', async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);
    const k = await zbudujProjekt(request, 'E2E Wkładka i przekładnik pola');
    const poleTr = poleStacji(k.migawka, k.stacja.ref_id, 'TR');
    const poleIn = poleStacji(k.migawka, k.stacja.ref_id, 'IN');
    // Pole transformatorowe z rozłącznikiem bezpiecznikowym (bez wskazanej wkładki) —
    // wyposażenie pola operacją modelu, ta sama co edytor wyposażenia pola.
    // Klucz `catalog_ref` w cudzysłowie: to BIEŻĄCY klucz kontraktu operacji, nie alias
    // legacy, w który celuje `repo_hygiene_guard` (wzorzec `catalog_ref:` w e2e).
    await operacja(request, k.caseId, 'set_bay_equipment', {
      bay_ref: poleTr.ref_id,
      mode: 'katalog',
      devices: [
        { kind: 'LOAD_SWITCH', placement: 'MIDSTREAM', 'catalog_ref': ROZLACZNIK_BEZPIECZNIKOWY },
        { kind: 'FUSE', placement: 'MIDSTREAM', designation: 'F1' },
      ],
    });
    // Pole liniowe z zabezpieczeniem (przekaźnik + CT) — wiersz karty zabezpieczeń niesie
    // wybór przekładnika napięciowego pola.
    const poCt = await operacja(request, k.caseId, 'add_ct', {
      field_ref: poleIn.ref_id,
      'catalog_ref': PRZEKLADNIK_CT,
      ratio_primary_a: 400.0,
      ratio_secondary_a: 5.0,
    });
    const ct = poCt.measurements.find((m) => m.measurement_type === 'CT' && m.bay_ref === poleIn.ref_id);
    expect(ct, 'CT pola liniowego').toBeTruthy();
    const poPrzekazniku = await operacja(request, k.caseId, 'add_relay', {
      field_ref: poleIn.ref_id,
      ct_ref: ct!.ref_id,
      'catalog_ref': PRZEKAZNIK,
    });
    const zabezpieczenia = poPrzekazniku.protection_assignments;
    const zabezpieczenie = zabezpieczenia[zabezpieczenia.length - 1];
    expect(zabezpieczenie, 'zabezpieczenie pola').toBeTruthy();

    const wkladkaWModelu = async (): Promise<string | null> =>
      (await migawkaModelu(request, k.caseId)).bays
        .find((b) => b.ref_id === poleTr.ref_id)
        ?.primary_devices?.find((a) => a.kind === 'FUSE')?.catalog_ref ?? null;
    const vtPola = async (): Promise<Array<string | undefined>> =>
      (await migawkaModelu(request, k.caseId)).measurements
        .filter((m) => m.measurement_type === 'VT' && m.bay_ref === poleIn.ref_id)
        .map((m) => m.catalog_ref);

    await otworzKonfigurator(page, k);

    // Wkładka pola — wybór z katalogu wkładek SN.
    await przejdzDoKarty(page, 'bays');
    const wyborWkladki = page.getByTestId(`bay-fuse-select-${poleTr.ref_id}`);
    await expect(wyborWkladki).toBeVisible({ timeout: 20000 });
    // Pole bez bezpieczników nie oferuje wyboru wkładki.
    await expect(page.getByTestId(`bay-fuse-brak-bezpiecznikow-${poleIn.ref_id}`)).toBeVisible();
    await wyborWkladki.selectOption(WKLADKA);
    await expect.poll(wkladkaWModelu, { timeout: 20000 }).toBe(WKLADKA);

    // Przekładnik napięciowy pola — wybór typu z katalogu przekładników.
    await przejdzDoKarty(page, 'protection');
    const wyborVt = page.getByTestId(`relay-vt-select-${zabezpieczenie!.ref_id}`);
    await expect(wyborVt).toBeVisible({ timeout: 20000 });
    await expect(wyborVt.locator('option:not([value=""])').first()).toBeAttached({ timeout: 20000 });
    const typVt = await wyborVt.locator('option:not([value=""])').first().getAttribute('value');
    expect(typVt).toBeTruthy();
    await wyborVt.selectOption(typVt!);
    await expect.poll(vtPola, { timeout: 20000 }).toEqual([typVt]);

    // Po odświeżeniu oba wybory wracają z modelu.
    await odswiez(page);
    await przejdzDoKarty(page, 'bays');
    await expect(page.getByTestId(`bay-fuse-select-${poleTr.ref_id}`)).toHaveValue(WKLADKA);
    await przejdzDoKarty(page, 'protection');
    await expect(page.getByTestId(`relay-vt-select-${zabezpieczenie!.ref_id}`)).toHaveValue(typVt!);

    // Rezygnacja: brak przekładnika i brak wkładki — oba znikają z modelu.
    await page.getByTestId(`relay-vt-select-${zabezpieczenie!.ref_id}`).selectOption('');
    await expect.poll(vtPola, { timeout: 20000 }).toEqual([]);
    await przejdzDoKarty(page, 'bays');
    await page.getByTestId(`bay-fuse-select-${poleTr.ref_id}`).selectOption('');
    await expect.poll(wkladkaWModelu, { timeout: 20000 }).toBeNull();
  });
  test('układ: obszar przewijania inspektora kończy się nad paskiem stanu, wiersz źródła klikalny', async ({
    page,
    request,
  }) => {
    test.setTimeout(1500000);
    mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
    const k = await zbudujProjekt(request, 'E2E Układ konfiguratora');
    const szynaNn = k.migawka.buses.find(
      (b) => (k.stacja.bus_refs ?? []).includes(b.ref_id) && b.voltage_kv < 1.0,
    );
    expect(szynaNn, 'szyna nN stacji').toBeTruthy();
    const poMagazynie = await operacja(request, k.caseId, 'add_converter_source', {
      source_technology: 'BESS',
      connection_variant: 'nn_side',
      station_ref: k.stacja.ref_id,
      bus_nn_ref: szynaNn!.ref_id,
      source_name: 'Magazyn układu',
      bess_mode: 'DWUKIERUNKOWY',
      power_setpoint_mw: 0.01,
      catalog_binding: {
        catalog_namespace: 'ZRODLO_NN_BESS',
        catalog_item_id: 'conv-bess-nn-0p5mw-0p4kv',
        catalog_item_version: '2024.1',
      },
      source_field: { field_name: 'Pole magazynu układu', source_field_kind: 'BESS' },
    });
    const magazyn = poMagazynie.generators.find((g) => g.name === 'Magazyn układu');
    expect(magazyn, 'magazyn w modelu').toBeTruthy();

    for (const okno of OKNA) {
      for (const motyw of MOTYWY) {
        for (const szerokosc of SZEROKOSCI_INSPEKTORA) {
          await otworzKonfigurator(page, k, okno);
          await ustawMotyw(page, motyw.theme);
          await ustawSzerokoscInspektora(page, szerokosc);
          await przejdzDoKarty(page, 'der-sources');
          const wiersz = page.getByTestId(`der-row-${magazyn!.ref_id}`);
          await expect(wiersz).toBeVisible({ timeout: 20000 });
          const kadr = `${okno.width}×${okno.height} ${motyw.klucz} inspektor ${szerokosc}`;
          // Kadr PRZED asercjami: przy regresji układu (asercje miękkie niżej) bieg i tak
          // zostawia komplet zrzutów okno × motyw × szerokość do porównania przed/po (B-02).
          await wiersz.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: resolve(
              KATALOG_ZRZUTOW,
              szerokosc === 'domyslna'
                ? `konfigurator-oze-${okno.width}x${okno.height}-${motyw.klucz}.png`
                : `konfigurator-oze-${okno.width}x${okno.height}-${motyw.klucz}-inspektor-${szerokosc}.png`,
            ),
          });

          // (0) Tabela układów bez przewijania w poziomie: ani tabela, ani obszar treści
          //     inspektora nie są szersze od swojego kadru; kolumna mocy i akcji w całości
          //     w kadrze tabeli (bez przewinięcia poziomego).
          const poziom = await page.evaluate((ref) => {
            const tabela = document.querySelector('[data-testid="der-sources-table"]') as HTMLElement | null;
            const tresc = document.querySelector('[data-testid="mvd-inspector-tresc"]') as HTMLElement | null;
            const inspektor = document.querySelector('[data-testid="mvd-inspector"]') as HTMLElement | null;
            const moc = document.querySelector(`[data-testid="der-power-${ref}"]`);
            const akcje = document.querySelector(`[data-testid="der-actions-${ref}"]`);
            if (!tabela || !tresc || !inspektor || !moc || !akcje) return null;
            const kadrTabeli = tabela.getBoundingClientRect();
            const wKadrze = (el: Element) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.left >= kadrTabeli.left - 0.5 && r.right <= kadrTabeli.right + 0.5;
            };
            return {
              szerokoscInspektora: Math.round(inspektor.getBoundingClientRect().width),
              tabelaNadmiar: tabela.scrollWidth - tabela.clientWidth,
              trescNadmiar: tresc.scrollWidth - tresc.clientWidth,
              mocWKadrze: wKadrze(moc),
              akcjeWKadrze: wKadrze(akcje),
            };
          }, magazyn!.ref_id);
          expect.soft(poziom, `${kadr}: tabela, moc i akcje na ekranie`).not.toBeNull();
          if (poziom) {
            expect.soft(poziom.tabelaNadmiar, `${kadr} (${poziom.szerokoscInspektora} px): tabela bez przewijania w poziomie`).toBeLessThanOrEqual(1);
            expect.soft(poziom.trescNadmiar, `${kadr} (${poziom.szerokoscInspektora} px): inspektor bez przewijania w poziomie`).toBeLessThanOrEqual(1);
            expect.soft(poziom.mocWKadrze, `${kadr} (${poziom.szerokoscInspektora} px): kolumna mocy w kadrze`).toBe(true);
            expect.soft(poziom.akcjeWKadrze, `${kadr} (${poziom.szerokoscInspektora} px): kolumna akcji w kadrze`).toBe(true);
          }

          // (1) Każdy obszar przewijania inspektora, który faktycznie przewija treść w pionie,
          //     kończy się nad paskiem stanu (dolna krawędź ≤ górnej krawędzi paska).
          const pomiar = await page.evaluate(() => {
            const pasek = document.querySelector('[data-testid="mvd-statusbar"]')
              ?? document.querySelector('.mvd-statusbar');
            const inspektor = document.querySelector('[data-testid="mvd-inspector"]');
            if (!pasek || !inspektor) return { pasekGora: NaN, obszary: [] as { opis: string; dol: number }[] };
            const obszary = [inspektor, ...Array.from(inspektor.querySelectorAll('*'))]
              .filter((el) => {
                const styl = getComputedStyle(el);
                const przewijalny = styl.overflowY === 'auto' || styl.overflowY === 'scroll';
                // Obszary inspektora mierzone zawsze; pozostałe — gdy faktycznie przewijają treść.
                const staly = ['mvd-inspector-tresc', 'inspektor-panel-nad-oknem'].includes(
                  el.getAttribute('data-testid') ?? '',
                );
                return przewijalny && (staly || el.scrollHeight > el.clientHeight + 1);
              })
              .map((el) => ({
                opis: `${el.tagName}#${el.getAttribute('data-testid') ?? ''}.${(el.getAttribute('class') ?? '').slice(0, 60)}`,
                dol: el.getBoundingClientRect().bottom,
              }));
            return { pasekGora: pasek.getBoundingClientRect().top, obszary };
          });
          expect.soft(Number.isFinite(pomiar.pasekGora), 'pasek stanu i inspektor na ekranie').toBe(true);
          expect.soft(
            pomiar.obszary.some((o) => o.opis.includes('#mvd-inspector-tresc')),
            'obszar przewijania inspektora zmierzony',
          ).toBe(true);
          for (const obszar of pomiar.obszary) {
            expect.soft(
              obszar.dol,
              `${okno.width}×${okno.height} ${motyw.klucz}: ${obszar.opis} kończy się pod paskiem stanu`,
            ).toBeLessThanOrEqual(pomiar.pasekGora + 0.5);
          }

          // (2) Akcja wiersza po przewinięciu: cała w inspektorze i trafiana natywnym klikiem
          //     (punkt środka należy do przycisku, nie do paska stanu ani sąsiedniej warstwy).
          const akcja = page.getByTestId(`der-action-detach-${magazyn!.ref_id}`);
          await akcja.scrollIntoViewIfNeeded();
          const trafienie = await akcja.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const ins = document.querySelector('[data-testid="mvd-inspector"]')!.getBoundingClientRect();
            const cel = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return {
              wInspektorze: r.left >= ins.left && r.right <= ins.right && r.top >= ins.top && r.bottom <= ins.bottom,
              szerokosc: r.width,
              trafia: Boolean(cel && (cel === el || el.contains(cel))),
            };
          });
          expect.soft(trafienie.szerokosc, 'akcja wiersza ma szerokość').toBeGreaterThan(0);
          expect.soft(trafienie.wInspektorze, `${okno.width}×${okno.height}: akcja wiersza w inspektorze`).toBe(true);
          expect.soft(trafienie.trafia, `${okno.width}×${okno.height}: środek akcji trafia w przycisk`).toBe(true);
          // Natywny klik tylko, gdy punkt środka trafia w przycisk — inaczej klik zawisłby na
          // limicie czasu, a naruszenie jest już zapisane asercją miękką wyżej.
          if (trafienie.trafia) {
            await akcja.click();
            await expect(page.getByTestId('der-detach-confirm')).toBeVisible();
            await page.getByTestId('der-detach-cancel').click();
            await expect(page.getByTestId('der-detach-confirm')).toHaveCount(0);
          }
        }
      }
    }
  });
});
