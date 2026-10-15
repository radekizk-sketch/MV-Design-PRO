/**
 * Tok pracy dynamiki czasowej RMS projektanta na REALNYM backendzie (karta AB-P1).
 *
 * PO CO. Rdzeń dynamiki (`network_model/solvers/dynamika`) liczył przebiegi, ale nie miał
 * toku pracy w interfejsie: model dynamiczny źródła nie pochodził z katalogu, scenariusz
 * zdarzeń nie miał edytora, a wyniku nie dało się obejrzeć. Ten spec przechodzi łańcuch
 * od modelu do przebiegu wyłącznie ścieżką NATYWNĄ interfejsu (kliki i wybory Playwrighta;
 * API buduje wyłącznie stan wejściowy sieci i niezależnie weryfikuje model).
 *
 * Sieć budowana kanonicznymi operacjami domenowymi (jak projektant w kreatorach; API buduje
 * stan wejściowy): GPZ 110/15 kV → magistrala kablowa z dwóch odcinków → stacja SN/nN typu B
 * (15/0,8 kV, transformator z katalogu, układ uziemienia nN zadeklarowany) na pierwszym
 * odcinku → instalacja PV (karta katalogowa falownika) na szynie nN stacji → odbiór na końcu
 * magistrali. Zwarcie w „Odcinek 2" w x = 0,5 usunięte izolacją odcina koniec magistrali
 * z odbiorem (skutek topologiczny osi zdarzeń), a PV zostaje zasilone od GPZ.
 * Para 1 — model związany z katalogiem: rozpływ z ekranu → scenariusz zbudowany w edytorze
 * z kontraktu (zwarcie w kablu w x·L usunięte izolacją + wyłączenie kabla) → nastawy →
 * bieg → przebiegi na wspólnej osi czasu, oś zdarzeń z nazwami, rekordy „nie oceniono",
 * sprzężenie ze schematem w obie strony.
 * Para 2 — brak modelu PV i modelu odbioru: odmowa przed biegiem z nazwami wytwórcy i odbioru
 * oraz akcjami naprawczymi → wiązanie PV z profilem katalogowym i ODBIORU z profilem katalogu
 * profili odbiorów (karta modeli odbiorów: napięcie przejścia, stała pomiaru częstotliwości)
 * z ekranu, natywnymi klikami → model w backendzie niesie kopie profili → rozpływ → bieg
 * przechodzi, a dane przyjęte z profili typowych są nazwane w rekordzie oceny.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { otworzZakladkeWynikow } from './nawigacjaWynikow';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';

/** Nastawy solvera — jawna decyzja projektanta (kontrakt solvera nie ma domyślnych). */
const NASTAWY: Readonly<Record<string, string>> = {
  dt_s: '0,002',
  dt_min_s: '0,002',
  dt_max_s: '0,002',
  tolerancja: '1e-10',
  tolerancja_kroku: '1e-6',
  eps_init: '1e-6',
  max_iteracji_newtona: '40',
  max_nawrotow: '30',
  integrator: 'trapez_niejawny',
};
/** Tolerancja lokalizacji chwili przekroczenia — wymagana, gdy scenariusz ma detektor
 *  (bez detektora pole zostaje puste = brak wartości, który adapter przyjmuje). */
const TOLERANCJA_LOKALIZACJI = '1e-4';

let licznik = 0;
let operacja = 0;

type Generator = {
  ref_id: string;
  materialized_params?: Record<string, unknown> | null;
  dynamika?: { rodzina?: string; proweniencja?: { zrodlo?: string } } | null;
};

type Odbior = {
  ref_id: string;
  name?: string;
  materialized_params?: Record<string, unknown> | null;
  dynamika?: {
    u_min_pu?: number | null;
    t_pomiaru_czestotliwosci_s?: number | null;
    proweniencja?: { zrodlo?: string };
  } | null;
};

type Migawka = {
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
  buses?: Array<{ ref_id: string; voltage_kv: number; name?: string }>;
  branches?: Array<{ ref_id: string; name?: string }>;
  substations?: Array<{ ref_id: string; station_type?: string }>;
  transformers?: Array<{ ref_id: string }>;
  generators?: Generator[];
  loads?: Odbior[];
};

function wiazanie(przestrzen: string, pozycja: string) {
  return { catalog_namespace: przestrzen, catalog_item_id: pozycja, catalog_item_version: '2024.1' };
}

async function op(
  request: APIRequestContext,
  caseId: string,
  nazwa: string,
  payload: Record<string, unknown>,
): Promise<Migawka> {
  operacja += 1;
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name: nazwa,
        idempotency_key: `e2e-dynamika-${nazwa}-${String(operacja).padStart(4, '0')}`,
        payload,
      },
    },
    timeout: 30000,
  });
  expect(odpowiedz.ok(), await odpowiedz.text()).toBeTruthy();
  const cialo = (await odpowiedz.json()) as { error?: string | null; snapshot?: Migawka };
  expect(cialo.error ?? null).toBeNull();
  return cialo.snapshot ?? {};
}

interface Siec {
  readonly projectId: string;
  readonly projectName: string;
  readonly caseId: string;
  readonly caseName: string;
  readonly pvRef: string;
  /** Odbiór na końcu magistrali (model dynamiczny z katalogu profili odbiorów). */
  readonly odbiorRef: string;
  /** Kabel „Odcinek 2" — miejsce zwarcia x·L (ref odcinka nie zmienia wstawienie stacji na odcinku 1). */
  readonly odcinek2Ref: string;
}

/** Profil katalogu modeli dynamicznych odbiorów (jedyny profil katalogu, jakość ESTIMATED). */
const PROFIL_ODBIORU = 'load_dyn_zagregowany_sn';

async function przypadekZSiecia(
  request: APIRequestContext,
  zModelami: boolean,
): Promise<Siec> {
  licznik += 1;
  const projectName = `E2E dynamika RMS ${licznik}`;
  const caseName = `Przypadek dynamiki ${licznik}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: projectName,
      description: 'Tok pracy dynamiki czasowej RMS',
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
    timeout: 30000,
  });
  expect(projekt.ok()).toBeTruthy();
  const { id: projectId } = (await projekt.json()) as { id: string };
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(przypadek.ok()).toBeTruthy();
  const { id: caseId } = (await przypadek.json()) as { id: string };

  await op(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: wiazanie('ZRODLO_SN', 'src-gpz-15kv-250mva-rx010'),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let siec: Migawka = {};
  for (const nazwa of ['Odcinek 1', 'Odcinek 2']) {
    siec = await op(request, caseId, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: 2000,
        name: nazwa,
        catalog_binding: wiazanie('KABEL_SN', 'cable-tfk-yakxs-3x120'),
      },
    });
  }
  const odcinki = siec.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(odcinki).toHaveLength(2);
  siec = await op(request, caseId, 'insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: odcinki[0],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.8 },
    sn_fields: ['IN', 'OUT', 'FEEDER', 'TR'],
    transformer: {
      create: true,
      catalog_binding: wiazanie('TRAFO_SN_NN', 'tr-sn-nn-15-0p8-1mva-dyn11-inverter'),
    },
  });
  const stacja = (siec.substations ?? []).find((s) => (s.station_type ?? '').toLowerCase() !== 'gpz')!;
  const szynaNn = (siec.buses ?? []).find((b) => b.voltage_kv > 0 && b.voltage_kv < 1.0)!;
  const transformatorStacji = (siec.transformers ?? []).find((t) => t.ref_id.startsWith('stn/'))!;
  // Układ uziemienia sieci nN — decyzja projektanta wymagana przed obliczeniami (E063).
  await op(request, caseId, 'update_element_parameters', {
    element_ref: transformatorStacji.ref_id,
    parameters: { lv_earthing_system: 'TN-C' },
  });
  siec = await op(request, caseId, 'add_converter_source', {
    source_technology: 'PV',
    connection_variant: 'nn_side',
    station_ref: stacja.ref_id,
    bus_nn_ref: szynaNn.ref_id,
    catalog_binding: wiazanie('ZRODLO_NN_PV', 'conv-pv-card-huawei-sun2000-215ktl'),
    quantity: 1,
  });
  const pvRef = (siec.generators ?? [])[0]!.ref_id;
  const koniec = (siec.buses ?? []).find((b) => b.name === 'Zacisk końcowy Odcinek 2')!;
  siec = await op(request, caseId, 'add_load_sn', { bus_ref: koniec.ref_id, p_mw: 0.5, q_mvar: 0.1 });
  const odbiorRef = (siec.loads ?? [])[0]!.ref_id;
  if (zModelami) {
    await op(request, caseId, 'set_der_catalog_bindings', {
      generator_ref: pvRef,
      dynamic_model_ref: 'default_pv_gfl',
    });
    await op(request, caseId, 'set_load_dynamic_binding', {
      load_ref: odbiorRef,
      dynamic_model_ref: PROFIL_ODBIORU,
    });
  }
  return { projectId, projectName, caseId, caseName, pvRef, odbiorRef, odcinek2Ref: odcinki[1] };
}

async function otworzEkranDynamiki(
  page: Page,
  seed: Siec,
): Promise<void> {
  await page.addInitScript((stan) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: stan.projectId,
          activeProjectName: stan.projectName,
          activeCaseId: stan.caseId,
          activeCaseName: stan.caseName,
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
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
  await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
  await expect(page.getByTestId('mvd-wyniki-warsztat')).toBeVisible({ timeout: 30000 });
  await otworzZakladkeWynikow(page, 'dynamika');
  await expect(page.getByTestId('mvd-dynamika')).toBeVisible();
}

/** Rozpływ punktu pracy z ekranu dynamiki i jawny wybór tego rozpływu. */
async function rozplywIPunktPracy(page: Page): Promise<void> {
  await page.getByTestId('mvd-dynamika-policz-rozplyw').click();
  const wybor = page.getByTestId('mvd-dynamika-punkt-pracy-wybor');
  await expect(wybor).toBeVisible({ timeout: 90000 });
  await wybor.selectOption({ index: 1 });
}

async function wpiszNastawy(page: Page, tolerancjaLokalizacji: string | null): Promise<void> {
  for (const [pole, wartosc] of Object.entries(NASTAWY)) {
    const kontrolka = page.getByTestId(`mvd-dynamika-pole-nastawy-${pole}`);
    if (pole === 'integrator') await kontrolka.selectOption(wartosc);
    else await kontrolka.fill(wartosc);
  }
  const tolerancja = page.getByTestId('mvd-dynamika-pole-nastawy-tolerancja_lokalizacji_zdarzen_s');
  await expect(tolerancja).toHaveAttribute('placeholder', 'puste = brak wartości');
  if (tolerancjaLokalizacji !== null) await tolerancja.fill(tolerancjaLokalizacji);
}

async function uruchomIPoczekaj(page: Page): Promise<void> {
  const uruchom = page.getByTestId('mvd-dynamika-uruchom');
  await expect(uruchom).toBeEnabled();
  await uruchom.click();
  await expect(page.getByTestId('mvd-dynamika-stan-biegu')).toHaveAttribute('data-status', 'DONE', {
    timeout: 180000,
  });
  await expect(page.getByTestId('mvd-dynamika-wynik')).toBeVisible({ timeout: 60000 });
}

/** Nazwy z modelu zbudowanego operacjami (kreatory nadają je same). */
const NAZWA_PV = 'Blok PV';
const NAZWA_ODCINKA = 'Odcinek 2';
const NAZWA_SZYNY_PV = 'Szyna nN stacji';
/** Nazwa odbioru nadana przez operację `add_load_sn` (kreator odbioru). */
const NAZWA_ODBIORU = 'Odbiór';

test.describe('dynamika czasowa RMS — tok pracy projektanta (realny backend)', () => {
  test('model z katalogu → rozpływ → scenariusz z edytora → bieg → przebiegi, oś zdarzeń, schemat', async ({
    page,
    request,
  }) => {
    test.setTimeout(420000);
    const seed = await przypadekZSiecia(request, true);
    await otworzEkranDynamiki(page, seed);

    // Model PV i model odbioru związane z profilami katalogowymi — kopie zgodne z wiązaniem,
    // bez braków.
    await expect(page.getByTestId(`mvd-dynamika-zrodlo-${seed.pvRef}`)).toHaveAttribute(
      'data-stan',
      'z_katalogu',
    );
    await expect(page.getByTestId(`mvd-dynamika-odbior-${seed.odbiorRef}`)).toHaveAttribute(
      'data-stan',
      'z_katalogu',
    );
    await expect(page.getByTestId('mvd-dynamika-braki')).toHaveCount(0);

    await rozplywIPunktPracy(page);

    // Scenariusz nazwany z edytora generowanego z kontraktu backendu.
    await page.getByTestId('mvd-dynamika-scenariusz-nazwa').fill('Zwarcie w odcinku 2');
    await page.getByTestId('mvd-dynamika-pole-horyzont_s').fill('0,3');
    await page.getByTestId('mvd-dynamika-pole-krok_wyjscia_s').fill('0,02');
    await page.getByTestId('mvd-dynamika-rodzaj-zdarzenia').selectOption('zwarcie');
    await page.getByTestId('mvd-dynamika-dodaj-zdarzenie').click();
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-t_s').fill('0,05');
    await page
      .getByTestId('mvd-dynamika-pole-zdarzenia-0-element_ref')
      .selectOption({ label: NAZWA_ODCINKA });
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-polozenie_wzgledne').fill('0,5');
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-typ').selectOption('3F');
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-r_f_ohm').fill('0');
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-x_f_ohm').fill('1');
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-t_usuniecia_s').fill('0,15');
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-0-sposob_usuniecia').selectOption('izolacja');
    await page.getByTestId('mvd-dynamika-rodzaj-zdarzenia').selectOption('wylaczenie_galezi');
    await page.getByTestId('mvd-dynamika-dodaj-zdarzenie').click();
    await page.getByTestId('mvd-dynamika-pole-zdarzenia-1-t_s').fill('0,15');
    await page
      .getByTestId('mvd-dynamika-pole-zdarzenia-1-element_ref')
      .selectOption({ label: NAZWA_ODCINKA });
    // Detektor zapadu napięcia szyny PV (lista → wariant wielkości → szyna po NAZWIE).
    await page.getByTestId('mvd-dynamika-pole-detektory-dodaj').click();
    await page.getByTestId('mvd-dynamika-pole-detektory-0-ident').fill('Zapad napięcia szyny PV');
    await page.getByTestId('mvd-dynamika-pole-detektory-0-wielkosc-wariant').selectOption('modul_napiecia');
    await page
      .getByTestId('mvd-dynamika-pole-detektory-0-wielkosc-bus_ref')
      .selectOption({ label: NAZWA_SZYNY_PV });
    await page.getByTestId('mvd-dynamika-pole-detektory-0-prog').fill('0,8');
    await page.getByTestId('mvd-dynamika-pole-detektory-0-kierunek').selectOption('w_dol');
    await page.getByTestId('mvd-dynamika-pole-detektory-0-jednorazowy').selectOption('nie');
    await page.getByTestId('mvd-dynamika-scenariusz-zapisz').click();
    await expect(page.getByTestId('mvd-dynamika-scenariusz-wybor')).not.toHaveValue('', {
      timeout: 30000,
    });

    await wpiszNastawy(page, TOLERANCJA_LOKALIZACJI);
    await uruchomIPoczekaj(page);

    // Wynik bez werdyktu: rekordy „nie oceniono" i nazwany poziom dowodowy.
    const oceny = page.getByTestId('mvd-dynamika-oceny');
    await expect(oceny.getByTestId(/^mvd-dynamika-ocena-/)).toHaveCount(2);
    await expect(oceny.getByTestId(/^mvd-dynamika-ocena-/).first()).toHaveAttribute(
      'data-status',
      'NIE_OCENIONO',
    );
    await expect(page.getByTestId('mvd-dynamika-poziom')).toHaveAttribute(
      'data-tier',
      'UNVALIDATED_MODEL',
    );

    // Oś zdarzeń: zwarcie x·L, jego usunięcie izolacją ze skutkiem topologicznym (odcięty
    // koniec magistrali z odbiorem) i wyłączenie kabla — nazwy, nie identyfikatory.
    const os = page.getByTestId('mvd-dynamika-os-zdarzen');
    const zwarcie = os.getByTestId('mvd-dynamika-zdarzenie-wykonane-0');
    await expect(zwarcie).toContainText('Zwarcie w gałęzi (miejsce x·L)');
    await expect(zwarcie).toContainText(NAZWA_ODCINKA);
    const usuniecie = os.getByTestId('mvd-dynamika-zdarzenie-wykonane-1');
    await expect(usuniecie).toContainText('Usunięcie zwarcia w gałęzi');
    await expect(usuniecie).toContainText('Odcięte od zasilania: Zacisk końcowy Odcinek 2');
    await expect(usuniecie).toContainText('Odbiory odcięte');
    await expect(os.getByTestId('mvd-dynamika-zdarzenie-wykonane-2')).toContainText('Wyłączenie gałęzi');
    await expect(os).not.toContainText(seed.odcinek2Ref);

    // Przekroczenie progu detektora (bez działania na sieć): nazwa detektora, szyna po nazwie.
    const przekroczenie = page.getByTestId('mvd-dynamika-przekroczenie-0');
    await expect(przekroczenie).toContainText('Zapad napięcia szyny PV');
    await expect(przekroczenie).toContainText(NAZWA_SZYNY_PV);
    await expect(przekroczenie).toContainText('spadek poniżej progu');
    await expect(page.getByTestId('mvd-dynamika-tryb')).toHaveAttribute('data-tryb', 'siec');

    // Przebiegi: napięcia szyn na wykresie; kanał zacisku odcinka dokłada wykres jego jednostki.
    await expect(page.getByTestId('mvd-dynamika-wykres-pu')).toBeVisible();
    await expect(page.getByTestId('mvd-dynamika-wykres-pu').locator('.recharts-line')).not.toHaveCount(0);
    // Grupa elementu na liście kanałów jest zwinięta — rozwinięcie natywnym klikiem nagłówka.
    await page
      .getByTestId(`mvd-dynamika-element-galaz-${seed.odcinek2Ref}`)
      .locator('summary')
      .click({ position: { x: 4, y: 4 } });
    await page.getByTestId(`mvd-dynamika-kanal-i_od_kat_deg@${seed.odcinek2Ref}`).check();
    await expect(page.getByTestId('mvd-dynamika-wykres-deg')).toBeVisible({ timeout: 30000 });

    // Sprzężenie ze schematem: element → zaznaczenie i przejście do przestrzeni „Schemat".
    await page.getByTestId(`mvd-dynamika-element-galaz-${seed.odcinek2Ref}-schemat`).click();
    await expect(page.getByTestId('mvd-dynamika')).toBeHidden({ timeout: 30000 });
    // Powrót do wyników: zaznaczenie wspólnego magazynu zaznaczeń wraca jako kanały.
    await page.getByRole('button', { name: /^Wyniki i dowody \d$/ }).click();
    await otworzZakladkeWynikow(page, 'dynamika');
    await expect(page.getByTestId('mvd-dynamika-zaznaczony')).toContainText(NAZWA_ODCINKA, {
      timeout: 60000,
    });
    await page.getByTestId('mvd-dynamika-zaznaczony-dodaj').click();
    await expect(page.getByTestId(`mvd-dynamika-kanal-i_od_pu@${seed.odcinek2Ref}`)).toBeChecked();
  });

  test('brak modeli PV i odbioru → odmowa z akcjami naprawczymi → wiązania z katalogu → bieg przechodzi', async ({
    page,
    request,
  }) => {
    test.setTimeout(420000);
    const seed = await przypadekZSiecia(request, false);
    // Scenariusz nazwany jako stan wejściowy (edytor ćwiczy para 1) — ta sama końcówka co ekran.
    const scenariusz = await request.post(
      `${BACKEND_BASE}/api/dynamika/study-cases/${seed.caseId}/scenariusze`,
      {
        data: {
          name: 'Zwarcie w odcinku 2',
          dynamika: {
            horyzont_s: 0.3,
            krok_wyjscia_s: 0.02,
            zdarzenia: [
              {
                rodzaj: 'zwarcie',
                t_s: 0.05,
                element_ref: seed.odcinek2Ref,
                polozenie_wzgledne: 0.5,
                typ: '3F',
                r_f_ohm: 0.0,
                x_f_ohm: 1.0,
                t_usuniecia_s: 0.15,
                sposob_usuniecia: 'izolacja',
              },
              { rodzaj: 'wylaczenie_galezi', t_s: 0.15, element_ref: seed.odcinek2Ref },
            ],
          },
        },
        timeout: 30000,
      },
    );
    expect(scenariusz.ok(), await scenariusz.text()).toBeTruthy();
    const { scenario_id: scenarioId } = (await scenariusz.json()) as { scenario_id: string };

    await otworzEkranDynamiki(page, seed);

    // Odmowa PRZED biegiem: brak modeli nazwany NAZWAMI wytwórcy i odbioru, uruchomienie
    // zablokowane.
    const braki = page.getByTestId('mvd-dynamika-braki');
    await expect(braki).toContainText(NAZWA_PV);
    await expect(braki).toContainText(NAZWA_ODBIORU);
    await expect(braki).not.toContainText(seed.pvRef);
    await expect(braki).not.toContainText(seed.odbiorRef);
    const wiersz = page.getByTestId(`mvd-dynamika-zrodlo-${seed.pvRef}`);
    await expect(wiersz).toHaveAttribute('data-stan', 'brak');
    const wierszOdbioru = page.getByTestId(`mvd-dynamika-odbior-${seed.odbiorRef}`);
    await expect(wierszOdbioru).toHaveAttribute('data-stan', 'brak');
    await expect(page.getByTestId('mvd-dynamika-warunki')).toContainText('Usuń braki modelu');
    await expect(page.getByTestId('mvd-dynamika-uruchom')).toBeDisabled();

    // Akcja naprawcza: wiązanie z profilem katalogowym zgodnym z rodzajem wytwórcy.
    await page.getByTestId(`mvd-dynamika-zrodlo-${seed.pvRef}-profil`).selectOption('default_pv_gfl');
    await page.getByTestId(`mvd-dynamika-zrodlo-${seed.pvRef}-powiaz`).click();
    await expect(wiersz).toHaveAttribute('data-stan', 'z_katalogu', { timeout: 30000 });
    // Po związaniu PV bieg nadal blokuje brak modelu ODBIORU (ten sam kod gotowości, akcja
    // w tej samej sekcji ekranu).
    await expect(braki).toContainText(NAZWA_ODBIORU);
    await expect(page.getByTestId('mvd-dynamika-uruchom')).toBeDisabled();

    // Akcja naprawcza odbioru: wiązanie z profilem katalogu profili odbiorów (natywny wybór
    // i klik), podstawa wartości typowych widoczna przy wyborze.
    await wierszOdbioru
      .getByTestId(`mvd-dynamika-odbior-${seed.odbiorRef}-profil`)
      .selectOption(PROFIL_ODBIORU);
    await wierszOdbioru.getByTestId(`mvd-dynamika-odbior-${seed.odbiorRef}-powiaz`).click();
    await expect(wierszOdbioru).toHaveAttribute('data-stan', 'z_katalogu', { timeout: 30000 });
    await expect(braki).toHaveCount(0);

    // Niezależna weryfikacja modelu: kopia profilu w `Generator.dynamika`.
    const model = await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`, { timeout: 30000 });
    expect(model.ok()).toBeTruthy();
    const pv = ((await model.json()) as { generators: Generator[] }).generators.find(
      (g) => g.ref_id === seed.pvRef,
    )!;
    expect(pv.materialized_params?.dynamic_model_ref).toBe('default_pv_gfl');
    expect(pv.dynamika?.rodzina).toBe('przeksztaltnikowa_gfl');
    expect(pv.dynamika?.proweniencja?.zrodlo).toBe('profil_typowy_normy');
    // Kopia modelu dynamicznego odbioru: odbiór stałej mocy czyta napięcie przejścia, nie
    // stałą pomiaru częstotliwości (pole, którego równania nie czytają, zostaje puste).
    const odbior = ((await (
      await request.get(`${BACKEND_BASE}/api/cases/${seed.caseId}/enm`, { timeout: 30000 })
    ).json()) as { loads: Odbior[] }).loads.find((o) => o.ref_id === seed.odbiorRef)!;
    expect(odbior.materialized_params?.dynamic_model_ref).toBe(PROFIL_ODBIORU);
    expect(odbior.dynamika?.u_min_pu).toBe(0.7);
    expect(odbior.dynamika?.t_pomiaru_czestotliwosci_s ?? null).toBeNull();
    expect(odbior.dynamika?.proweniencja?.zrodlo).toBe('profil_typowy_normy');

    await rozplywIPunktPracy(page);
    await page.getByTestId('mvd-dynamika-scenariusz-wybor').selectOption(scenarioId);
    await wpiszNastawy(page, null);
    await uruchomIPoczekaj(page);
    await expect(page.getByTestId('mvd-dynamika-wykres-pu')).toBeVisible();
    // Dane przyjęte z profili TYPOWYCH nazwane w rekordzie oceny (nie „zwalidowane") — także
    // model dynamiczny odbioru.
    await expect(page.getByTestId('mvd-dynamika-oceny')).toContainText('profilu katalogowego');
    await expect(page.getByTestId('mvd-dynamika-oceny')).toContainText(
      `Parametry dynamiczne odbioru ${NAZWA_ODBIORU}`,
    );
    // Założenia modelu: zdania po polsku z nazwami (bez kluczy kodu i identyfikatorów).
    const zalozenia = page.getByTestId('mvd-dynamika-zalozenia');
    await expect(zalozenia).toContainText('przechodzą w stałą impedancję');
    await expect(zalozenia).not.toContainText('model_odbiorow');
    await expect(zalozenia).not.toContainText(seed.odbiorRef);
  });
});
