/**
 * E2E real-backend test dla katalogow audytu 2 (Phase 7).
 *
 * Wymaga uruchomionego backendu:
 *   poetry run uvicorn src.api.main:app --reload --port 8000
 *
 * Pokrywa scenariusze A-P (16 acceptance scenarios) zwiazane z audytem 2:
 *   A. GET /api/v1/catalog/audit2/snapshot zwraca 7 katalogow
 *   B. GET BESS modes: 9 trybow
 *   C. GET tap-changers: 4 pozycje (OLTC + DETC)
 *   D. GET HV fuses: 4 pozycje (klasy)
 *   E. GET device-withstand: 5 aparatow
 *   F. GET PF curves: 5 krzywych z parametrami
 *   G. GET block-transformers: 5 pozycji (PV/BESS/FW)
 *   H. GET MV neutral groundings: 5 typow
 *   I. POST validate-vt-grounding: petersen 1.5 -> FAIL
 *   J. POST validate-vt-grounding: petersen 1.9 -> OK
 *   K. POST validate-device-withstand: I_dyn 50 ka -> OK
 *   L. POST validate-device-withstand: I_dyn 70 kA -> FAIL
 *   M. POST validate-hosting-capacity-export: ratio 1.2 -> normal
 *   N. POST validate-hosting-capacity-export: ratio 5 -> requires_ramp_down
 *   O. POST build-station-payload: deterministic z DERs
 *   P. Pakiet dowodow walidacji rozszerzen na sciezce PRODUKTU: projekt + model sieci
 *      (operacje domenowe + zrodlo BESS) + konfiguracja stacji przez API + bieg rozplywu
 *      + natywny klik „Generuj dowody walidacji" na ekranie uzasadnien (Dokumentacja →
 *      Pakiet dowodowy). Piec rodzajow walidacji, determinizm pakietu (te same bajty).
 *      Karta PROOFPACK-KONTRAKT: dawna koncowka `generate-proof-pack` (nietypowane
 *      specyfikacje rozpakowywane `**spec` → HTTP 500 po karcie #144) USUNIETA.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const FRONTEND_BASE = process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://127.0.0.1:5173';

async function backendUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/snapshot`);
    return res.ok();
  } catch {
    return false;
  }
}

test.describe('Audit2 Backend Integration (A-P)', () => {
  test.beforeAll(async ({ request }) => {
    const up = await backendUp(request);
    test.skip(!up, `Backend nie uruchomiony pod ${BACKEND_BASE}.`);
  });

  test('A. snapshot zwraca 7 katalogow', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/snapshot`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('bess_operation_modes');
    expect(body).toHaveProperty('tap_changers');
    expect(body).toHaveProperty('hv_fuses');
    expect(body).toHaveProperty('device_withstand');
    expect(body).toHaveProperty('pf_curves');
    expect(body).toHaveProperty('block_transformers');
    expect(body).toHaveProperty('mv_neutral_groundings');
  });

  test('B. BESS modes: minimum 9 trybow', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/bess-operation-modes`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(9);
    const codes = body.map((m: { mode_code: string }) => m.mode_code);
    expect(codes).toContain('fcr_n');
    expect(codes).toContain('voltage_support');
    expect(codes).toContain('island_backup');
  });

  test('C. tap-changers: OLTC + DETC obecne', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/tap-changers`);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(4);
    const types = new Set(body.map((tc: { type: string }) => tc.type));
    expect(types.has('oltc')).toBeTruthy();
    expect(types.has('detc')).toBeTruthy();
  });

  test('D. HV fuses: 3 klasy obecne', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/hv-fuses`);
    const body = await res.json();
    const classes = new Set(body.map((f: { class: string }) => f.class));
    expect(classes.has('full_range')).toBeTruthy();
    expect(classes.has('general_purpose')).toBeTruthy();
    expect(classes.has('back_up')).toBeTruthy();
  });

  test('E. device-withstand: aparatura SN obecna', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/device-withstand`);
    const body = await res.json();
    const types = new Set(body.map((d: { device_type: string }) => d.device_type));
    expect(types.has('breaker_vacuum_15')).toBeTruthy();
    expect(types.has('busbar_15_2000')).toBeTruthy();
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
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/pf-curves`);
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

  test('G. block-transformers: SN/SN dla turbinowni FW', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/block-transformers`);
    const body = await res.json();
    const mvToMv = body.filter((b: { is_mv_to_mv: boolean }) => b.is_mv_to_mv);
    expect(mvToMv.length).toBeGreaterThan(0);
    expect(mvToMv[0].applicable_der_kinds).toContain('FW');
  });

  test('H. MV neutral groundings: 4 typy', async ({ request }) => {
    const res = await request.get(`${BACKEND_BASE}/api/v1/catalog/audit2/mv-neutral-groundings`);
    const body = await res.json();
    const types = new Set(body.map((g: { grounding_type: string }) => g.grounding_type));
    expect(types.has('isolated')).toBeTruthy();
    expect(types.has('petersen_coil')).toBeTruthy();
    expect(types.has('resistor_grounded')).toBeTruthy();
    expect(types.has('directly_grounded')).toBeTruthy();
  });

  test('I. validate-vt-grounding petersen 1.5 -> FAIL', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-vt-grounding`,
      { data: { voltage_factor: 1.5, grounding_type: 'petersen_coil' } },
    );
    const body = await res.json();
    expect(body.ok).toBeFalsy();
  });

  test('J. validate-vt-grounding petersen 1.9 -> OK', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-vt-grounding`,
      { data: { voltage_factor: 1.9, grounding_type: 'petersen_coil' } },
    );
    const body = await res.json();
    expect(body.ok).toBeTruthy();
  });

  test('K. validate-device-withstand 50 kA peak -> OK', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
      {
        data: {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 50,
          i_thermal_calculated_ka: 20,
          t_clearing_s: 1.0,
        },
      },
    );
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.i_dyn_ok).toBeTruthy();
    expect(body.i_th_ok).toBeTruthy();
  });

  test('L. validate-device-withstand 70 kA peak -> FAIL', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-device-withstand`,
      {
        data: {
          device_id: 'wstd_breaker_vacuum_15_25',
          i_peak_calculated_ka: 70,
          i_thermal_calculated_ka: 20,
          t_clearing_s: 1.0,
        },
      },
    );
    const body = await res.json();
    expect(body.ok).toBeFalsy();
    expect(body.i_dyn_ok).toBeFalsy();
  });

  test('M. validate-hosting-capacity ratio 1.2 -> normal_export', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-hosting-capacity-export`,
      { data: { station_id: 's1', p_export_kw: 1200, p_import_kw: 1000 } },
    );
    const body = await res.json();
    expect(body.status).toBe('normal_export');
  });

  test('N. validate-hosting-capacity ratio 5 -> requires_ramp_down', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/validate-hosting-capacity-export`,
      { data: { station_id: 's2', p_export_kw: 5000, p_import_kw: 1000 } },
    );
    const body = await res.json();
    expect(body.status).toBe('requires_ramp_down');
    expect(body.message_pl).toContain('ramp-down');
  });

  test('O. build-station-payload deterministic z DERs', async ({ request }) => {
    const payload = {
      station_id: 'station_e2e_001',
      mv_neutral_grounding_ref: 'mng_petersen',
      tap_changer_refs: ['tc_oltc_110sn_19_125'],
      der_specs: [
        {
          der_id: 'der_pv_001',
          der_kind: 'PV',
          block_transformer_catalog_ref: 'btr_pv_15_069_2500',
          pf_curve_ref: 'pf_pse_b',
        },
        {
          der_id: 'der_bess_001',
          der_kind: 'BESS',
          bess_operation_mode_refs: ['mode_fcr_n', 'mode_voltage_support'],
        },
      ],
    };
    const res1 = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/build-station-payload`,
      { data: payload },
    );
    const res2 = await request.post(
      `${BACKEND_BASE}/api/v1/catalog/audit2/build-station-payload`,
      { data: payload },
    );
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1).toEqual(body2);
    expect(body1.payload.der_payloads.length).toBe(2);
    expect(body1.solver_extensions.sc_iec60909_extensions).toBeDefined();
    expect(body1.solver_extensions.power_flow_extensions).toBeDefined();
  });

  test('P. pakiet dowodow walidacji: model + konfiguracja stacji + natywny klik', async ({
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
      power_setpoint_mw: 0.01,
      catalog_binding: {
        catalog_namespace: 'ZRODLO_NN_BESS',
        catalog_item_id: 'conv-bess-nn-0p5mw-0p4kv',
        catalog_item_version: '2024.1',
      },
      source_field: { field_name: 'Pole magazynu nN', source_field_kind: 'BESS' },
    });
    const magazyn = poMagazynie.generators.find((g) => g.name === 'Magazyn E2E');
    expect(magazyn, 'magazyn w modelu').toBeTruthy();

    // Moc eksportu dobrana tak, by bilans był „eksportem normalnym" (1,2 × import stacji):
    // import to suma odbiorów na szynach stacji w modelu (potrzeby własne).
    const szynyStacji = new Set(stacja!.bus_refs ?? []);
    const importKw =
      poMagazynie.loads.filter((l) => szynyStacji.has(l.bus_ref)).reduce((suma, l) => suma + l.p_mw, 0) * 1000;
    expect(importKw).toBeGreaterThan(0);

    const cfgRes = await request.put(
      `${BACKEND_BASE}/api/v1/projects/${pid}/audit2-station-config/${encodeURIComponent(stacja!.ref_id)}`,
      {
        data: {
          mv_neutral_grounding_ref: 'mng_petersen',
          tap_changer_refs: [],
          der_specs: [
            {
              der_id: magazyn!.ref_id,
              der_kind: 'BESS',
              bess_operation_mode_refs: ['mode_voltage_support'],
              device_catalog_ref: 'conv-bess-nn-0p5mw-0p4kv',
              nominal_power_kw: importKw * 1.2,
            },
          ],
          transformer_tap_changers: { [transformator!.ref_id]: 'tc_detc_snnn_5_25' },
          bay_vts: { 'Pole 01': 'vt_15kv_100v_05_abb' },
          bay_device_withstand: {
            'Pole 02': {
              device_id: 'wstd_breaker_vacuum_15_25',
              i_peak_calculated_ka: 50,
              i_thermal_calculated_ka: 20,
              t_clearing_s: 1.0,
            },
          },
        },
      },
    );
    expect(cfgRes.ok(), await cfgRes.text()).toBeTruthy();

    // Kontrakt backendu: piec rodzajow dla stacji, zero brakow, determinizm bajtowy.
    const pakietUrl = `${BACKEND_BASE}/api/v1/projects/${pid}/audit2-station-config/_validate-all`;
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
        'AUDIT2_BESS_OPERATION_MODES',
        'AUDIT2_TAP_CHANGER_PLAN',
        'AUDIT2_HOSTING_CAPACITY_EXPORT',
        'AUDIT2_DEVICE_WITHSTAND',
        'AUDIT2_VT_GROUNDING_VALIDATION',
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
    const przycisk = page.getByTestId('audit2-proof-generate');
    await expect(przycisk).toBeEnabled({ timeout: 30000 });
    await przycisk.click();
    const sekcjaStacji = page.locator(
      `[data-testid="audit2-pakiet-stacji"][data-station-name="${stacja!.name}"]`,
    );
    await expect(sekcjaStacji).toBeVisible({ timeout: 30000 });
    await expect(sekcjaStacji.getByTestId('audit2-proof')).toHaveCount(5);
    await expect(sekcjaStacji.getByTestId('audit2-brak-danych')).toHaveCount(0);
    await expect(sekcjaStacji.getByTestId('audit2-pakiet-status')).toHaveText('Weryfikacja pozytywna');
    const tekst = (await page.getByTestId('audit2-proof-result').textContent()) ?? '';
    expect(tekst).toContain('Magazyn E2E');
    expect(tekst).toContain('Tryby pracy magazynu energii');
    expect(tekst).not.toContain(stacja!.ref_id);
    expect(tekst).not.toContain(magazyn!.ref_id);
    expect(tekst).not.toMatch(/AUDIT2_|aggregate/);
  });

  test('Q. bieg kanoniczny LOAD_FLOW z audit2_project_id/audit2_station_id stosuje config z DB', async ({ request }) => {
    // Karta CV-4.2: fabrykowany stub POST /api/cases/audit2-power-flow
    // (pq=[], slack_node_id or "slack-stub" — zero fizyki, zawsze empty
    // graph, case_id NIGDY nie wskazywal realnego przypadku) USUNIETY.
    // Test Q dowodzi TEJ SAMEJ wlasnosci ("konfiguracja stacji z DB dociera
    // do wejscia solvera, bez zmyslonej drabinki grounding_z0_z1_ratio") na
    // torze KANONICZNYM: createRun -> executeRun -> results, na REALNYM
    // przypadku z REALNA siecia (assembler wymaga wezla SLACK — pusty graf
    // starego stubu nie jest juz droga, ktora da sie przejsc).
    const projectRes = await request.post(`${BACKEND_BASE}/api/projects`, {
      data: { name: `E2E Audit2 PowerFlow ${Date.now()}` },
    });
    expect(projectRes.status()).toBe(201);
    const pid = (await projectRes.json()).id;

    const caseRes = await request.post(`${BACKEND_BASE}/api/study-cases`, {
      data: {
        project_id: pid,
        name: 'Przypadek audit2 e2e',
        description: '',
        config: {},
        set_active: true,
      },
    });
    expect(caseRes.ok()).toBeTruthy();
    const caseId = (await caseRes.json()).id;

    const cfgRes = await request.put(
      `${BACKEND_BASE}/api/v1/projects/${pid}/audit2-station-config/station-pf-test`,
      {
        data: {
          mv_neutral_grounding_ref: 'mng_petersen',
          tap_changer_refs: [],
          der_specs: [],
          transformer_tap_changers: { tr_001: 'tc_oltc_110sn_19_125' },
        },
      },
    );
    expect(cfgRes.ok()).toBeTruthy();

    // Siec zdolna do rozplywu mocy: GPZ (SLACK) + magistrala + stacja z
    // potrzebami wlasnymi (JEDYNY odbior — rozplyw mocy wymaga co najmniej
    // jednego odbioru/generatora, enm/validator.py::_compute_availability)
    // i deklaracja ukladu uziemienia sieci nN (bramka gotowosci rozplywu).
    let opCounter = 0;
    async function domainOp(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
      opCounter += 1;
      const res = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
        data: {
          project_id: '',
          snapshot_base_hash: '',
          operation: {
            name: payload.name,
            idempotency_key: `e2e-audit2-pf-${Date.now()}-${opCounter}`,
            payload: payload.payload,
          },
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error ?? null).toBeNull();
      return body;
    }

    await domainOp({
      name: 'add_grid_source_sn',
      payload: {
        voltage_kv: 15.0,
        sk3_mva: 250.0,
        rx_ratio: 0.1,
        catalog_binding: {
          catalog_namespace: 'ZRODLO_SN',
          catalog_item_id: 'src-gpz-15kv-250mva-rx010',
          catalog_item_version: '2024.1',
        },
        hv_voltage_kv: 110.0,
        transformer_sn_mva: 25.0,
      },
    });

    const magistrala = await domainOp({
      name: 'continue_trunk_segment_sn',
      payload: {
        segment: {
          rodzaj: 'KABEL',
          dlugosc_m: 500,
          catalog_binding: {
            catalog_namespace: 'KABEL_SN',
            catalog_item_id: 'cable-tfk-yakxs-3x120',
            catalog_item_version: '2024.1',
          },
        },
      },
    });
    const snapshot = magistrala.snapshot as { corridors?: Array<{ ordered_segment_refs?: string[] }> };
    const segmentRefs = snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
    expect(segmentRefs.length).toBeGreaterThan(0);

    await domainOp({
      name: 'insert_station_on_segment_sn',
      payload: {
        field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
        segment_id: segmentRefs[segmentRefs.length - 1],
        station_type: 'B',
        insert_at: { value: 0.5 },
        station: {
          sn_voltage_kv: 15.0,
          nn_voltage_kv: 0.4,
          station_auxiliary: { active_power_kw: 10.0, cos_phi: 0.95 },
          nn_earthing: { lv_system: 'TN-S' },
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
      },
    });

    const createRunRes = await request.post(
      `${BACKEND_BASE}/api/execution/study-cases/${caseId}/runs`,
      {
        data: {
          analysis_type: 'LOAD_FLOW',
          solver_input: {
            audit2_project_id: pid,
            audit2_station_id: 'station-pf-test',
          },
        },
      },
    );
    expect(createRunRes.ok()).toBeTruthy();
    const runId = (await createRunRes.json()).id;

    const executeRes = await request.post(`${BACKEND_BASE}/api/execution/runs/${runId}/execute`);
    expect(executeRes.ok()).toBeTruthy();
    const executed = await executeRes.json();
    expect(executed.status).toBe('DONE');

    const resultsRes = await request.get(`${BACKEND_BASE}/api/execution/runs/${runId}/results`);
    expect(resultsRes.ok()).toBeTruthy();
    const results = await resultsRes.json();
    const applied = results.global_results.audit2_applied;
    // INTENCJA (bez zmian): audit2 config z DB FAKTYCZNIE dotarl do wejscia
    // solvera — slad niesie komplet trzech kanalow, ktore modul realnie
    // mapuje na model przed wywolaniem solvera (tap, statyzm P(f), impedancja
    // transformatora blokowego).
    expect(applied).toHaveProperty('tap_position_changes');
    expect(applied).toHaveProperty('pf_droop_changes');
    expect(applied).toHaveProperty('block_transformer_z_changes');
    // KANON PO KARCIE K-Q (2026-08-14): ze sladu ZNIKNAL grounding_z0_z1_ratio.
    // Modul mapowal ETYKIETE uziemienia na drabinke stalych (izolowana 100,
    // skompensowana 50, przez rezystor 5, bezposrednia 1) i meldowal ja jako
    // "zastosowana" — zadna z tych liczb nie miala zrodla. Fizycznie Z0/Z1 zalezy
    // od pojemnosci doziemnej sieci, nastrojenia dlawika/rezystora i impedancji
    // petli; niesie je model (Source.z0_z1_ratio / r0_ohm / x0_ohm), z ktorego
    // liczy SC1F. Asercja NEGATYWNA jest bramka regresji — drabinka stalych nie
    // moze wrocic bocznymi drzwiami mimo mv_neutral_grounding_ref w konfiguracji.
    expect(applied).not.toHaveProperty('grounding_z0_z1_ratio');
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
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
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
      nn_earthing: { lv_system: 'TN-S' },
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
  const executeRes = await request.post(`${BACKEND_BASE}/api/execution/runs/${runId}/execute`);
  expect(executeRes.ok()).toBeTruthy();
  expect((await executeRes.json()).status).toBe('DONE');
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
          activeRunId: dane.runId,
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
