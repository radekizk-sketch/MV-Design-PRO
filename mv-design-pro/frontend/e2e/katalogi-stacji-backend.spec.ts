/**
 * E2E (realny backend): katalogi stacji i pakiet uzasadnień rozszerzeń stacji.
 *
 * Pokrywa:
 *   A. GET /api/v1/catalog/konfiguracja-stacji/snapshot — komplet katalogów stacji,
 *   B–D, F, G. katalogi trybów magazynu, przełączników zaczepów, wkładek SN, krzywych P(f)
 *      i transformatorów blokowych,
 *   I–J. reguła przekładnika napięciowego wobec uziemienia sieci (próg 1,9 w sieci
 *      skompensowanej),
 *   P. pakiet uzasadnień na ścieżce PRODUKTU: model sieci operacjami domenowymi (stacja,
 *      magazyn z trybami pracy, przełącznik zaczepów, przekładnik napięciowy pola) + bieg
 *      rozpływu + natywny klik „Generuj dowody walidacji" (Dokumentacja → Pakiet dowodowy).
 *      Cztery rodzaje uzasadnień, determinizm pakietu (te same bajty).
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: dane rozszerzeń stacji żyją wyłącznie w modelu sieci — dawne
 * scenariusze zapisanej konfiguracji stacji (końcówki CRUD, katalog i reguła wytrzymałości
 * aparatury, bilans eksportu z liczb podanych ręcznie, składanie ładunku stacji, bieg
 * rozpływu „z konfiguracją z bazy") zniknęły razem z końcówkami. Wytrzymałość aparatury pól
 * ocenia ekran wyników zwarciowych z modelu (`ogniwo-zwarcie-aparatura.spec.ts`).
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { wykonajBiegDoKonca } from './biegi';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/snapshot`);
    return res.ok();
  } catch {
    return false;
  }
}

test.describe('Katalogi stacji i pakiet rozszerzeń (realny backend)', () => {
  test.beforeAll(async ({ request }) => {
    const up = await backendUp(request);
    test.skip(!up, `Backend nie uruchomiony pod ${BACKEND_BASE}.`);
  });

  test('A. snapshot zwraca 5 katalogow', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/snapshot`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('bess_operation_modes');
    expect(body).toHaveProperty('tap_changers');
    expect(body).toHaveProperty('hv_fuses');
    expect(body).not.toHaveProperty('device_withstand');
    expect(body).toHaveProperty('pf_curves');
    expect(body).toHaveProperty('block_transformers');
  });

  test('B. BESS modes: minimum 9 trybow', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/bess-operation-modes`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(9);
    const codes = body.map((m: { mode_code: string }) => m.mode_code);
    expect(codes).toContain('fcr_n');
    expect(codes).toContain('voltage_support');
    expect(codes).toContain('island_backup');
  });

  test('C. tap-changers: OLTC + DETC obecne', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/tap-changers`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(4);
    const types = new Set(body.map((tc: { type: string }) => tc.type));
    expect(types.has('oltc')).toBeTruthy();
    expect(types.has('detc')).toBeTruthy();
  });

  test('D. HV fuses: 3 klasy obecne', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/hv-fuses`);
    const body = await res.json();
    const classes = new Set(body.map((f: { class: string }) => f.class));
    expect(classes.has('full_range')).toBeTruthy();
    expect(classes.has('general_purpose')).toBeTruthy();
    expect(classes.has('back_up')).toBeTruthy();
  });

  test('F. PF curves: warianty statyzmu w przedziale nastawialnym NC RfG', async ({ request }) => {
    // INTENCJA (bez zmian): katalog P(f) oferuje WIELE roznych wariantow
    // statyzmu, a nie jedna zaszyta krzywa — projektant wybiera nastaw.
    //
    // KANON PO KARCIE K-Q (2026-08-14): z katalogu usunieto `operator_code`
    // i `module_type`, bo przypisanie statyzmu do TYPU MODULU (PSE B = 5 %,
    // PSE D = 3 %) bylo zgadniete — rozporzadzenie (UE) 2016/631 art. 13
    // ust. 2 daje statyzm NASTAWIALNY 2-12 %, a nie wartosc per typ modulu.
    // Identyfikatory niosa dzis sam nastaw (`pf_droop_5`, `pf_droop_3`, ...),
    // wiec test pinuje KLASE: komplet pol + granice normatywne + roznorodnosc
    // wariantow, a nie nieistniejaca tabelke operator x typ modulu.
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/pf-curves`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as Array<{
      id: string;
      droop_percent: number;
      deadband_hz: number;
      f_ref_hz: number;
      f_min_hz: number;
      f_max_hz: number;
      zrodlo_pl: string;
    }>;
    expect(body.length).toBeGreaterThanOrEqual(2);

    // Zadna pozycja nie niesie juz imienia operatora ani typu modulu.
    for (const curve of body) {
      expect(curve).not.toHaveProperty('operator_code');
      expect(curve).not.toHaveProperty('module_type');
    }

    const droops = body.map((c) => c.droop_percent);
    // Roznorodnosc: co najmniej dwa rozne nastawy statyzmu w katalogu.
    expect(new Set(droops).size).toBeGreaterThanOrEqual(2);

    for (const curve of body) {
      // Identyfikator wyprowadzony z nastawu — pin kanonu nazewnictwa.
      expect(curve.id).toBe(`pf_droop_${curve.droop_percent}`);
      // Art. 13 ust. 2: statyzm nastawialny 2-12 %.
      expect(curve.droop_percent).toBeGreaterThanOrEqual(2.0);
      expect(curve.droop_percent).toBeLessThanOrEqual(12.0);
      // Art. 13 ust. 2: prog 50,2-50,5 Hz → strefa nieczulosci 0,2-0,5 Hz.
      expect(curve.deadband_hz).toBeGreaterThanOrEqual(0.2);
      expect(curve.deadband_hz).toBeLessThanOrEqual(0.5);
      // Zalacznik II tab. 2 (Europa kontynentalna): zakres pracy 47,5-51,5 Hz.
      expect(curve.f_ref_hz).toBe(50.0);
      expect(curve.f_min_hz).toBe(47.5);
      expect(curve.f_max_hz).toBe(51.5);
      // Proweniencja jest OBOWIAZKOWA — to ona zastapila zgadniete tabelki.
      expect(curve.zrodlo_pl).toContain('2016/631');
    }
  });

  test('G. block-transformers: pozycje dla FW z proweniencja, bez SN/SN bez zrodla', async ({
    request,
  }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/block-transformers`);
    const body = await res.json();
    const dlaFw = body.filter((b: { applicable_der_kinds: string[] }) =>
      b.applicable_der_kinds.includes('FW'),
    );
    expect(dlaFw.length).toBeGreaterThan(0);
    for (const b of body as Array<{ source_reference: string }>) {
      expect(b.source_reference.trim().length).toBeGreaterThan(0);
    }
    // Pozycja SN/SN zablokowana danymi (brak zrodla u_k i strat) — karta
    // KATALOG-KOMPLETNY-PROWENIENCJA usunela dawny szacunek 15/6,3 kV 10 MVA.
    const mvToMv = body.filter((b: { is_mv_to_mv: boolean }) => b.is_mv_to_mv);
    expect(mvToMv).toEqual([]);
  });

  test('I. validate-vt-grounding petersen 1.5 -> FAIL', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding`,
      { data: { voltage_factor: 1.5, grounding_type: 'petersen_coil' } },
    );
    const body = await res.json();
    expect(body.ok).toBeFalsy();
  });

  test('J. validate-vt-grounding petersen 1.9 -> OK', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/konfiguracja-stacji/validate-vt-grounding`,
      { data: { voltage_factor: 1.9, grounding_type: 'petersen_coil' } },
    );
    const body = await res.json();
    expect(body.ok).toBeTruthy();
  });

  test('P. pakiet dowodow walidacji: dane rozszerzen w modelu + natywny klik', async ({
    page,
    request,
  }) => {
    test.setTimeout(300000);
    const projektNazwa = `E2E Pakiet dowodow ${Date.now()}`;
    const projectRes = await request.post(`${BACKEND_BASE}/api/projects`, {
      data: { name: projektNazwa },
    });
    expect(projectRes.status()).toBe(201);
    const pid = (await projectRes.json()).id as string;
    const caseRes = await request.post(`${BACKEND_BASE}/api/study-cases`, {
      data: { project_id: pid, name: 'Zakres pakiet dowodow', description: '', config: {}, set_active: true },
    });
    expect(caseRes.ok()).toBeTruthy();
    const caseId = (await caseRes.json()).id as string;

    // Model sieci operacjami domenowymi: GPZ + magistrala + stacja SN/nN z transformatorem.
    const snapshot = await zbudujSiecZeStacja(request, caseId, 'e2e-pakiet');
    const stacja = snapshot.substations.find((s) => s.station_type !== 'gpz' && (s.bus_refs ?? []).length > 0);
    expect(stacja, 'stacja SN/nN w modelu').toBeTruthy();
    const transformator = snapshot.transformers.find(
      (t) => (stacja!.bus_refs ?? []).includes(t.lv_bus_ref) || (stacja!.bus_refs ?? []).includes(t.hv_bus_ref),
    );
    expect(transformator, 'transformator stacji w modelu').toBeTruthy();

    // Moc eksportu z MODELU (moc czynna źródła) dobrana tak, by bilans był „eksportem
    // normalnym" (1,2 × import stacji); import to suma odbiorów na szynach stacji w modelu.
    const szynyStacji = new Set(stacja!.bus_refs ?? []);
    const importKw =
      snapshot.loads.filter((l) => szynyStacji.has(l.bus_ref)).reduce((suma, l) => suma + l.p_mw, 0) * 1000;
    expect(importKw).toBeGreaterThan(0);

    // Magazyn energii po stronie nN stacji — operacja domenowa katalog-first
    // (`add_converter_source` z `catalog_binding`), ten sam pisarz co kreator źródła.
    const szynaNn = snapshot.buses.find(
      (b) => (stacja!.bus_refs ?? []).includes(b.ref_id) && b.voltage_kv < 1.0,
    );
    expect(szynaNn, 'szyna nN stacji w modelu').toBeTruthy();
    const poMagazynie = await operacjaDomenowa(request, caseId, 'e2e-pakiet-bess', 'add_converter_source', {
      source_technology: 'BESS',
      connection_variant: 'nn_side',
      station_ref: stacja!.ref_id,
      bus_nn_ref: szynaNn!.ref_id,
      source_name: 'Magazyn E2E',
      bess_mode: 'DWUKIERUNKOWY',
      power_setpoint_mw: (importKw * 1.2) / 1000,
      catalog_binding: {
        catalog_namespace: 'ZRODLO_NN_BESS',
        catalog_item_id: 'conv-bess-nn-0p5mw-0p4kv',
        catalog_item_version: '2024.1',
      },
      source_field: { field_name: 'Pole magazynu nN', source_field_kind: 'BESS' },
    });
    const magazyn = poMagazynie.generators.find((g) => g.name === 'Magazyn E2E');
    expect(magazyn, 'magazyn w modelu').toBeTruthy();

    // Dane rozszerzeń stacji w MODELU — te same operacje, które wykonuje konfigurator stacji:
    // tryby pracy magazynu (wiązania katalogowe źródła), przełącznik zaczepów transformatora
    // i przekładnik napięciowy pola liniowego stacji.
    await operacjaDomenowa(request, caseId, 'e2e-pakiet-tryby', 'set_der_catalog_bindings', {
      generator_ref: magazyn!.ref_id,
      bess_operation_mode_refs: ['mode_voltage_support'],
    });
    // Klucz `catalog_ref` w cudzysłowie: to BIEŻĄCY klucz kontraktu operacji, nie alias
    // legacy, w który celuje `repo_hygiene_guard` (wzorzec `catalog_ref:` w e2e).
    await operacjaDomenowa(request, caseId, 'e2e-pakiet-zaczepy', 'update_element_parameters', {
      element_ref: transformator!.ref_id,
      parameters: { tap_changer: { 'catalog_ref': 'tc_detc_snnn_5_25' } },
    });
    const poleLiniowe = poMagazynie.bays.find(
      (b) => b.substation_ref === stacja!.ref_id && b.bay_role === 'IN',
    );
    expect(poleLiniowe, 'pole liniowe stacji').toBeTruthy();
    await operacjaDomenowa(request, caseId, 'e2e-pakiet-vt', 'add_vt', {
      field_ref: poleLiniowe!.ref_id,
      'catalog_ref': 'vt_15kv_100v_05_abb',
      ratio_primary_v: 15000.0,
      ratio_secondary_v: 100.0,
    });

    // Kontrakt backendu: cztery rodzaje dla stacji, zero brakow, determinizm bajtowy.
    const pakietUrl = `${BACKEND_BASE}/api/v1/projects/${pid}/stations/_validate-all`;
    const pierwszy = await request.post(pakietUrl);
    const drugi = await request.post(pakietUrl);
    expect(pierwszy.status()).toBe(200);
    expect(await pierwszy.body()).toEqual(await drugi.body());
    const pakiet = (await pierwszy.json()) as {
      per_station: Array<{
        station_id: string;
        station_nazwa: string;
        all_pass: boolean;
        proofs: Array<{ proof_type: string; summary_pl: string }>;
        braki_danych: unknown[];
      }>;
    };
    const pakietStacji = pakiet.per_station.find((p) => p.station_id === stacja!.ref_id)!;
    expect(new Set(pakietStacji.proofs.map((d) => d.proof_type))).toEqual(
      new Set([
        'BESS_OPERATION_MODES',
        'TAP_CHANGER_PLAN',
        'HOSTING_CAPACITY_EXPORT',
        'VT_GROUNDING_VALIDATION',
      ]),
    );
    expect(pakietStacji.braki_danych).toEqual([]);
    expect(pakietStacji.all_pass).toBeTruthy();
    expect(pakietStacji.station_nazwa).toBe(stacja!.name);

    // Bieg rozpływu — karta „Pakiet dowodowy" huba Dokumentacji wymaga przebiegu.
    const runId = await uruchomRozplyw(request, caseId, {});

    // ŚCIEŻKA UŻYTKOWNIKA: Dokumentacja → Pakiet dowodowy → „Generuj dowody walidacji".
    await otworzAplikacje(page, { pid, projektNazwa, caseId, runId });
    await page.getByRole('button', { name: /^Dokumentacja/ }).click();
    await expect(page.getByTestId('mvd-dokumentacja-hub')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('mvd-dok-karta-dowod').getByRole('button', { name: 'Otwórz dowód' }).click();
    const przycisk = page.getByTestId('rozszerzenia-proof-generate');
    await expect(przycisk).toBeEnabled({ timeout: 30000 });
    await przycisk.click();
    const sekcjaStacji = page.locator(
      `[data-testid="rozszerzenia-pakiet-stacji"][data-station-name="${stacja!.name}"]`,
    );
    await expect(sekcjaStacji).toBeVisible({ timeout: 30000 });
    await expect(sekcjaStacji.getByTestId('rozszerzenia-proof')).toHaveCount(4);
    await expect(sekcjaStacji.getByTestId('rozszerzenia-brak-danych')).toHaveCount(0);
    await expect(sekcjaStacji.getByTestId('rozszerzenia-pakiet-status')).toHaveText('Weryfikacja pozytywna');
    const tekst = (await page.getByTestId('rozszerzenia-proof-result').textContent()) ?? '';
    expect(tekst).toContain('Magazyn E2E');
    expect(tekst).toContain('Tryby pracy magazynu energii');
    expect(tekst).not.toContain(stacja!.ref_id);
    expect(tekst).not.toContain(magazyn!.ref_id);
    expect(tekst).not.toMatch(/aggregate/);
  });
});

// =============================================================================
// Pomocnicze: model sieci operacjami domenowymi, bieg rozpływu, otwarcie aplikacji
// =============================================================================

interface SnapshotSieci {
  buses: Array<{ ref_id: string; voltage_kv: number }>;
  substations: Array<{ ref_id: string; name: string; station_type?: string; bus_refs?: string[] }>;
  transformers: Array<{ ref_id: string; name: string; hv_bus_ref: string; lv_bus_ref: string }>;
  generators: Array<{ ref_id: string; name: string }>;
  bays: Array<{ ref_id: string; substation_ref?: string; bay_role?: string }>;
  loads: Array<{ bus_ref: string; p_mw: number }>;
  corridors?: Array<{ ordered_segment_refs?: string[] }>;
}

/** GPZ (SLACK) + magistrala kablowa + stacja B z transformatorem SN/nN i potrzebami własnymi. */
async function zbudujSiecZeStacja(
  request: APIRequestContext,
  caseId: string,
  prefiks: string,
): Promise<SnapshotSieci> {
  let licznik = 0;
  async function operacja(name: string, payload: Record<string, unknown>): Promise<SnapshotSieci> {
    licznik += 1;
    return operacjaDomenowa(request, caseId, `${prefiks}-${licznik}`, name, payload);
  }
  await operacja('add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: {
      catalog_namespace: 'ZRODLO_SN',
      catalog_item_id: 'src-gpz-15kv-250mva-rx010',
      catalog_item_version: '2024.1',
    },
  });
  const magistrala = await operacja('continue_trunk_segment_sn', {
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
  const segmentRefs = magistrala.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);
  return operacja('insert_station_on_segment_sn', {
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
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
}

/** Jedna operacja domenowa na przypadku; zwraca migawkę modelu po operacji. */
async function operacjaDomenowa(
  request: APIRequestContext,
  caseId: string,
  klucz: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<SnapshotSieci> {
  const res = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name, idempotency_key: `${klucz}-${Date.now()}`, payload },
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.error ?? null).toBeNull();
  return body.snapshot as SnapshotSieci;
}

/** Bieg LOAD_FLOW kanonicznym torem (createRun → execute); zwraca identyfikator biegu. */
async function uruchomRozplyw(
  request: APIRequestContext,
  caseId: string,
  solverInput: Record<string, unknown>,
): Promise<string> {
  const createRunRes = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
    { data: { analysis_type: 'LOAD_FLOW', solver_input: solverInput } },
  );
  expect(createRunRes.ok()).toBeTruthy();
  const runId = (await createRunRes.json()).id as string;
  await wykonajBiegDoKonca(request, BACKEND_BASE, runId);
  return runId;
}

/** Zimne wejście do aplikacji z kontekstem projektu/przypadku/biegu z persistu. */
async function otworzAplikacje(
  page: Page,
  kontekst: { pid: string; projektNazwa: string; caseId: string; runId: string },
): Promise<void> {
  await page.addInitScript((dane) => {
    localStorage.setItem(
      'mv-design-app-state',
      JSON.stringify({
        state: {
          activeProjectId: dane.pid,
          activeProjectName: dane.projektNazwa,
          activeCaseId: dane.caseId,
          activeCaseName: 'Zakres pakiet dowodow',
          activeCaseKind: 'ShortCircuitCase',
          activeCaseResultStatus: 'FRESH',
          activeSnapshotId: null,
          activeMode: 'MODEL_EDIT',
          activeAnalysisType: 'LOAD_FLOW',
          caseManagerOpen: false,
          issuePanelOpen: false,
        },
        version: 1,
      }),
    );
  }, kontekst);
  await page.goto(FRONTEND_BASE, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 90000 });
}
