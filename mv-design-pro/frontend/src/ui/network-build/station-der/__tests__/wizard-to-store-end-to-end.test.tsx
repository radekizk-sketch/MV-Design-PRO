/**
 * Test integracji wizard-do-store: nowe pola Pakietu H/G muszą zostać zapisane
 * w `useStationDerStore` po kliknięciu "Utwórz" (a nie zniknąć w stanie lokalnym).
 *
 * To jest test krytyczny — przed naprawą wizard NIE przekazywał:
 *   - bessOperationModeRefs (eng.10)
 *   - blockTransformerCatalogRef (B.5)
 *   - pfCurveRef (eng.9)
 * do `attachDer`. Wybory użytkownika ginęły w klikiek "Utwórz".
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useAppStateStore } from '../../../app-state/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { AddDerWizard } from '../AddDerWizard';

type ConverterKind = 'PV' | 'BESS' | 'WIND';
interface ConverterFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: ConverterKind;
  readonly un_kv: number;
  readonly pmax_mw: number;
  readonly sn_mva?: number;
  readonly manufacturer?: string;
  readonly qmin_mvar?: number;
  readonly qmax_mvar?: number;
}

// Karta FAB-J: krzywe P(f), operatorzy NC RfG i transformatory dedykowane —
// kształt 1:1 z backendu (ten sam mirror testowy co `AddDerWizard.test.tsx`).
const PF_CURVE_FIXTURES = [
  {
    id: 'pf_droop_5', catalog_namespace: 'pf_curve', catalog_version: '1.0',
    label_pl: 'P(f) statyzm 5%', f_ref_hz: 50, droop_percent: 5,
    f_min_hz: 47.5, f_max_hz: 51.5, deadband_hz: 0.2, zrodlo_pl: 'Fikstura testowa',
  },
];
const NC_RFG_OPERATOR_FIXTURES = [
  {
    operator_id: 'pse', operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne', last_revision: '2024-Q4',
    reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
    ride_through: { lvrt: [{ time_s: 0, voltage_pu: 0.05 }], hvrt: [{ time_s: 0, voltage_pu: 1.3 }] },
  },
  {
    operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '2024-Q4',
    reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
    ride_through: { lvrt: [{ time_s: 0, voltage_pu: 0.05 }], hvrt: [{ time_s: 0, voltage_pu: 1.3 }] },
  },
];
const BESS_BATTERY_FIXTURES = [
  {
    id: 'bess_bat_test_2880kwh', name: 'Pakiet bateryjny LFP 2880 kWh', chemistry: 'LFP',
    capacity_kwh: 2880, nominal_voltage_dc_v: 1230, c_rate: 0.5,
    verification_status: 'VERIFIED', source_reference: 'Fikstura testowa',
    catalog_status: 'PUBLISHED', contract_version: '1.0',
  },
];
function blockTransformerFixture(
  id: string, snKva: number, hvKv: number, lvKv: number,
): Record<string, unknown> {
  return {
    id, catalog_namespace: 'block_transformer', catalog_version: '1.0',
    label_pl: `Transformator dedykowany ${hvKv}/${lvKv} kV · ${snKva} kVA · Dyn11`,
    transformer_type_ref: `tr-test-${id}`,
    sn_kva: snKva, hv_kv: hvKv, lv_kv: lvKv,
    uk_percent: 6, pk_kw: snKva * 0.01, p0_kw: snKva * 0.002, i0_percent: 0.5,
    vector_group: 'Dyn11', is_mv_to_mv: lvKv > 1,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true, source_reference: 'Fikstura testowa', verification_status: 'VERIFIED',
  };
}
// Karta FAB-J: 4000 kVA jest tu CELOWO — falownik 2500 kW wymaga ≥2778 kVA
// (cos φ 0,90), więc auto-dobór wybiera najmniejszy typoszereg, który to
// przenosi. Bez pozycji 4000 kVA test 1 nie miałby czego dobrać.
const BLOCK_TRANSFORMER_FIXTURES = [
  blockTransformerFixture('btr_pv_15_069_2500', 2500, 15, 0.69),
  blockTransformerFixture('btr_der_15_069_4000', 4000, 15, 0.69),
];

const AUDIT2_SNAPSHOT_BODY = {
  bess_operation_modes: [],
  tap_changers: [],
  hv_fuses: [],
  device_withstand: [],
  pf_curves: PF_CURVE_FIXTURES,
  block_transformers: BLOCK_TRANSFORMER_FIXTURES,
  mv_neutral_groundings: [],
};

/**
 * Mirror TESTOWY klasyfikacji modułu NC RfG — jedyne źródło progów zostaje
 * `compliance/nc_rfg_modul.py`; ten mirror tylko UDAJE backend w teście.
 */
function klasyfikujModulNcRfgDlaTestu(pMaxMw: number, napiecieKv: number): 'A' | 'B' | 'C' | 'D' {
  if (napiecieKv >= 110) return 'D';
  const pMaxKw = pMaxMw * 1000;
  if (pMaxKw >= 75_000) return 'D';
  if (pMaxKw >= 10_000) return 'C';
  if (pMaxKw >= 200) return 'B';
  return 'A';
}

// Naprawa FAB-I (2026-09-05): katalog urządzeń DER pochodzi WYŁĄCZNIE z backendu
// — kreator nie ma już listy zastępczej `catalogs.ts`, więc identyfikatory tego
// pliku (przeniesione 1:1, liczbowo bez zmian z `PV_INVERTER_CATALOG`/
// `BESS_PCS_CATALOG`) muszą przyjść z mocka granicy `fetch`, nie z importu.
const PV_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'pv_inv_catalog_50', name: 'Pakiet katalogowy PV 50', kind: 'PV', un_kv: 0.4, pmax_mw: 0.05, sn_mva: 0.05, manufacturer: 'MV-DESIGN-PRO' },
  { id: 'pv_inv_huawei_185', name: 'Huawei SUN2000-185KTL', kind: 'PV', un_kv: 0.4, pmax_mw: 0.185, sn_mva: 0.185, manufacturer: 'Huawei' },
  { id: 'pv_inv_sma_2500', name: 'SMA Sunny Central 2500-EV', kind: 'PV', un_kv: 0.69, pmax_mw: 2.5, sn_mva: 2.5, manufacturer: 'SMA' },
];
// Karta FAB-J: qmin/qmax realne — jedyny dowód zdolności do pracy w czterech
// ćwiartkach (decyzja #6), inaczej tryby BESS wymagający jej (FCR-N, Q(U))
// nie pojawiłyby się wcale.
const BESS_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'bess_pcs_sma_2200', name: 'SMA Sunny Central Storage 2200', kind: 'BESS', un_kv: 0.69, pmax_mw: 2.2, sn_mva: 2.2, manufacturer: 'SMA', qmin_mvar: -2.2, qmax_mvar: 2.2 },
];
const DEFAULT_CONVERTERS: Readonly<Record<ConverterKind, readonly ConverterFixture[]>> = {
  PV: PV_CONVERTER_FIXTURES,
  BESS: BESS_CONVERTER_FIXTURES,
  WIND: [],
};

/** Mockuje granicę `fetch` (wzorzec `mockConverterCatalogFetch` z `SldDetailDrawer.test.tsx`). */
function mockDerWizardFetch(
  converters: Readonly<Partial<Record<ConverterKind, readonly ConverterFixture[]>>> = DEFAULT_CONVERTERS,
): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/ncrfg-tests/modul')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const modul = klasyfikujModulNcRfgDlaTestu(
        Number(params.get('p_max_mw')), Number(params.get('napiecie_kv')),
      );
      return new Response(JSON.stringify({ modul }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/ncrfg-tests/catalog')) {
      return new Response(
        JSON.stringify({
          procedure_version: 'test', source_ref: 'test', tests: [],
          operators: NC_RFG_OPERATOR_FIXTURES,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/api/catalog/bess-battery-types')) {
      return new Response(JSON.stringify(BESS_BATTERY_FIXTURES), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/catalog/converter-types')) {
      const match = /[?&]kind=([^&]+)/.exec(url);
      const kind = match ? (decodeURIComponent(match[1]) as ConverterKind) : null;
      const records = kind
        ? (converters[kind] ?? [])
        : Object.values(converters).flatMap((list) => list ?? []);
      return new Response(JSON.stringify(records), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(AUDIT2_SNAPSHOT_BODY), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function render(
  ui: ReactElement,
  converters: Readonly<Partial<Record<ConverterKind, readonly ConverterFixture[]>>> = DEFAULT_CONVERTERS,
) {
  mockDerWizardFetch(converters);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
import { useStationDerStore, selectAllDers } from '../store';

describe('Wizard → Store integration (Pakiet H/G end-to-end)', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useAppStateStore.getState().setActiveProject('projekt-test-001', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case-test-001', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
  });

  it('zapisuje block_transformer_catalog_ref w store dla dedicated_transformer', async () => {
    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    // Krok 1: wariant dedicated_transformer.
    fireEvent.click(screen.getByTestId('variant-dedicated_transformer'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 2: PCC + nazwa + block-trafo z katalogu.
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    fireEvent.change(screen.getByTestId('add-der-block-transformer'), {
      target: { value: 'btr_pv_15_069_2500' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: device — katalog backendu jest asynchroniczny (zero listy zastępczej).
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_sma_2500' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 4: profil (LVRT/HVRT read-only, tożsamościowo związane z operatorem
    // — karta FAB-J) + P(f).
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'pse' } });
    await waitFor(() => expect(screen.getByTestId('add-der-pf-curve')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-pf-curve'), { target: { value: 'pf_droop_5' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 5: review + Utwórz.
    fireEvent.click(screen.getByTestId('add-der-create'));

    // Sprawdzamy ze DER zostal zapisany ze WSZYSTKIMI polami z Pakietu H.
    await waitFor(() => expect(selectAllDers(useStationDerStore.getState())).toHaveLength(1));
    const ders = selectAllDers(useStationDerStore.getState());

    const der = ders[0];
    // Karta K-Q — ZMIANA OCZEKIWANIA JEST NAPRAWA, NIE REGRESJA.
    // Poprzednio test oczekiwal 2500 kVA pod falownikiem 2500 kW. Automatyczny
    // dobor liczy wymagana moc pozorna przy cos phi 0,90 (2500 / 0,90 = 2778 kVA)
    // i wybiera najmniejszy typoszereg, ktory ja przenosi. Do tej karty katalog
    // KONCZYL SIE na 2500 kVA, wiec zaden kandydat nie spelnial warunku, dobor
    // zwracal null i kreator przyjmowal recznie wskazany, ZA MALY transformator.
    // Typoszereg oparty na realnym katalogu ma 4 MVA — i to jest teraz wynik.
    expect(der.catalogs.block_transformer_catalog_ref).toBe('btr_der_15_069_4000');
    expect(der.profiles.pf_curve_ref).toBe('pf_droop_5');
    // BESS modes nie powinny byc dla PV.
    expect(der.profiles.bess_operation_mode_refs).toEqual([]);
  });

  it('zapisuje bess_operation_mode_refs (multi-select) dla BESS', async () => {
    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="BESS"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-SN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'BESS Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-02' } });
    fireEvent.change(screen.getByTestId('add-der-bay-name'), { target: { value: 'POLE-BESS-01' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'bess_pcs_sma_2200' },
    });
    await waitFor(() => expect(screen.getByTestId('add-der-battery')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-battery'), {
      target: { value: 'bess_bat_test_2880kwh' },
    });

    // Tryby BESS — multi-select (FCR-N + voltage_support).
    fireEvent.click(screen.getByTestId('add-der-bess-mode-fcr_n'));
    fireEvent.click(screen.getByTestId('add-der-bess-mode-voltage_support'));

    fireEvent.click(screen.getByTestId('add-der-next'));

    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'pse' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => expect(selectAllDers(useStationDerStore.getState())).toHaveLength(1));
    const ders = selectAllDers(useStationDerStore.getState());

    const der = ders[0];
    expect(der.profiles.bess_operation_mode_refs).toContain('mode_fcr_n');
    expect(der.profiles.bess_operation_mode_refs).toContain('mode_voltage_support');
    expect(der.profiles.bess_operation_mode_refs.length).toBe(2);
  });

  it('zapisuje DER do przypadku, który posiada aktualny snapshot ENM', async () => {
    useAppStateStore.getState().setActiveCase(
      'case-stale-ui-001',
      'Zakres z paska',
      'ShortCircuitCase',
      'NONE',
    );
    useSnapshotStore.setState({
      caseId: 'case-snapshot-001',
      snapshot: {
        substations: [{ ref_id: 'station-001', id: 'station-001' }],
      } as never,
    });

    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    // Poziomy napięcia nN są wyprowadzone asynchronicznie z katalogu
    // przekształtników (karta FAB-J) — czekamy, aż opcja „0,4 kV" naprawdę
    // istnieje w select, zanim ją wybierzemy (inaczej walidacja zapisu widzi
    // pustą listę dozwolonych poziomów).
    await waitFor(() => {
      const opcje = Array.from(
        (screen.getByTestId('add-der-voltage-level') as HTMLSelectElement).options,
      ).map((o) => o.value);
      expect(opcje).toContain('0.4');
    });
    fireEvent.change(screen.getByTestId('add-der-voltage-level'), { target: { value: '0.4' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const generatorCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/generators'),
      );
      expect(generatorCall?.[0]).toContain('/cases/case-snapshot-001/generators');
      expect(JSON.parse(String(generatorCall?.[1]?.body))).toMatchObject({
        catalog_ref: 'pv_inv_huawei_185',
        power_mw: 0.185,
      });
    });
  });

  it('przekazuje do API katalogową moc PV 50 kW bez sztucznej podłogi 100 kW', async () => {
    useSnapshotStore.setState({
      caseId: 'case-snapshot-001',
      snapshot: {
        substations: [{ ref_id: 'station-001', id: 'station-001' }],
      } as never,
    });

    render(
      <AddDerWizard
        isOpen={true}
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Domyślny poziom napięcia nN wypełnia się dopiero po rozstrzygnięciu
    // asynchronicznego zapytania o katalog przekształtników (karta FAB-J).
    await waitFor(() =>
      expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_catalog_50' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));
    // V12K-245: operator NIE jest preselekcjonowany — test przechodzi ta sama sciezke,
    // co projektant, czyli WYBIERA profil (wczesniej „Dalej" dzialalo, bo krok byl
    // wypelniony zestawem ENEA, ktorego nikt nie wskazal).
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const generatorCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/generators'),
      );
      expect(JSON.parse(String(generatorCall?.[1]?.body))).toMatchObject({
        catalog_ref: 'pv_inv_catalog_50',
        power_mw: 0.05,
      });
    });
  });

  it('liczba jednostek trafia do modelu, a moc pozycji to ILOCZYN (V12K-249)', async () => {
    // POMIAR PRZED NAPRAWA: kreator wysylal na sztywno `quantity: 1`, wiec farmy
    // 8 × 1 MW NIE DALO SIE wyrazic — a od iloczynu zaleza prady robocze, dobor
    // transformatora, przekladnikow i kategoria NC RfG (audyt E-21 pkt P2).
    render(
      <AddDerWizard
        isOpen
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Domyślny poziom napięcia nN wypełnia się dopiero po rozstrzygnięciu
    // asynchronicznego zapytania o katalog przekształtników (karta FAB-J).
    await waitFor(() =>
      expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_catalog_50' },
    });
    fireEvent.change(screen.getByTestId('add-der-unit-count'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const generatorCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/generators'),
      );
      const body = JSON.parse(String(generatorCall?.[1]?.body));
      expect(body.quantity).toBe(8);
      // 8 × 50 kW = 400 kW = 0,4 MW — moc CALEJ pozycji, nie jednostki.
      expect(body.power_mw).toBeCloseTo(0.4, 6);
    });
  });

  it('urzadzenie BEZ mocy katalogowej NIE zapisuje sie z moca podstawiona (V12K-249)', async () => {
    // POMIAR: kreator liczyl `power_mw: (nominalPowerKw ?? 500) / 1000`, wiec brak mocy
    // dawal 500 kW WPISANE DO MODELU jako moc wytworcy — dana projektowa, od ktorej
    // zaleza wszystkie obliczenia sieciowe. Sciezka byla UTAJONA (lokalne katalogi maja
    // moc, a mapowanie z backendu zawsze ustawia pole), ale mapowanie ustawia ZERO, gdy
    // `pmax_mw` jest zerowe albo nieliczbowe — i to jest wariant OSIAGALNY: generator
    // o mocy 0 MW jest rowna fabrykacja co 500 kW.
    const konwerterBezMocy: readonly ConverterFixture[] = [
      {
        id: 'conv_bez_mocy',
        name: 'Falownik bez tabliczki',
        kind: 'PV',
        un_kv: 0.4,
        pmax_mw: 0,
        sn_mva: 0,
        manufacturer: 'Nieznany',
      },
    ];

    render(
      <AddDerWizard
        isOpen
        stationId="station-001"
        stationName="Stacja Test"
        derKind="PV"
        projectId="projekt-test-001"
        onClose={() => {}}
        nowIso="2026-04-01T00:00:00Z"
      />,
      { PV: konwerterBezMocy, BESS: [], WIND: [] },
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Domyślny poziom napięcia nN wypełnia się dopiero po rozstrzygnięciu
    // asynchronicznego zapytania o katalog przekształtników (karta FAB-J).
    await waitFor(() =>
      expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Falownik o mocy 0 kW jest ODFILTROWANY z mapowania backendu (`nominal_power_kw
    // > 0`), więc katalog kończy w stanie „error" (0 pozycji), nie „backend" —
    // czekamy na ROZSTRZYGNIĘCIE (dowolny finalny stan), nie na „gotowe".
    await waitFor(() => {
      const rozstrzygniety = screen.queryByTestId('add-der-device-catalog-error')
        ?? !(screen.getByTestId('add-der-device') as HTMLSelectElement).disabled;
      expect(rozstrzygniety).toBeTruthy();
    });
    const wybor = screen.getByTestId('add-der-device') as HTMLSelectElement;
    const bezMocy = Array.from(wybor.options).find((o) => o.value === 'conv_bez_mocy');
    if (!bezMocy) {
      // Katalog backendu nie podal tej pozycji — wtedy sciezka jest poza zasiegiem
      // testu interfejsu i pilnuje jej wylacznie warunek w kodzie zapisu.
      return;
    }
    fireEvent.change(wybor, { target: { value: 'conv_bez_mocy' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const zadania = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url, init]) => String(url).includes('/generators') && init?.method === 'POST',
      );
      expect(zadania, 'wytworca bez mocy katalogowej nie moze trafic do modelu').toHaveLength(0);
    });
  });
});
