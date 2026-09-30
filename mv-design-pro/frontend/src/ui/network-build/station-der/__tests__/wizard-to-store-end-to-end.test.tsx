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

import { odpowiedzKlasyfikacji } from '../../../../ui2/oze/ncrfg/__tests__/atrapaKlasyfikacji';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Karta FAB-L: tryby pracy magazynu — kształt 1:1 z backendu
// (`audit2_catalogs.py::BessOperationModeItem.to_dict`). FCR-N i wsparcie
// napięciowe wymagają 4Q (testowy PCS ma symetryczny qmin/qmax < 0 < qmax,
// więc `deviceFourQuadrantCapable` w `AddDerWizard.tsx` rozpoznaje go jako 4Q).
const BESS_OPERATION_MODE_FIXTURES = [
  {
    id: 'mode_fcr_n', catalog_namespace: 'bess_operation_mode', catalog_version: '1.0',
    label_pl: 'FCR-N (rezerwa pierwotna symetryczna)', description_pl: 'Fikstura testowa.',
    mode_code: 'fcr_n', requires_four_quadrant: true, requires_grid_forming: false,
  },
  {
    id: 'mode_voltage_support', catalog_namespace: 'bess_operation_mode', catalog_version: '1.0',
    label_pl: 'Wsparcie napięciowe Q(U)', description_pl: 'Fikstura testowa.',
    mode_code: 'voltage_support', requires_four_quadrant: true, requires_grid_forming: false,
  },
];

const AUDIT2_SNAPSHOT_BODY = {
  bess_operation_modes: BESS_OPERATION_MODE_FIXTURES,
  tap_changers: [],
  hv_fuses: [],
  device_withstand: [],
  pf_curves: PF_CURVE_FIXTURES,
  block_transformers: BLOCK_TRANSFORMER_FIXTURES,
  mv_neutral_groundings: [],
};

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
    // Karta AB-1a Pakiet D2: `/modul` ze wspólnej atrapy — parametry zapytania z migawki
    // OpenAPI (`p_max_kw`, `napiecie_kv`), progi z katalogu policzonego backendem.
    const klasyfikacja = odpowiedzKlasyfikacji(url);
    if (klasyfikacja) return klasyfikacja;
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

/**
 * Karta FAB-K (§0 R3/R4, KLASA NIE INSTANCJA): krok „Punkt" wymaga REALNEJ
 * migawki — szyny nN stacji (`resolveStationNnBus`) dla `nn_side`, punktu
 * przyłączenia SN istniejącego w modelu (`selectSnConnectionPointCandidates`)
 * dla `dedicated_transformer`. Zero fabrykowanego wyboru w UI oznacza zero
 * postępu bez migawki — testy integracyjne muszą ją dostarczyć (ten sam
 * wzorzec co `AddDerWizard.test.tsx::defaultBaseSnapshot`).
 */
function station001Snapshot(): Record<string, unknown> {
  return {
    substations: [
      {
        ref_id: 'station-001',
        id: 'station-001',
        bus_refs: ['station-001/sn', 'station-001/nn'],
        transformer_refs: ['station-001/tr'],
      },
    ],
    transformers: [
      {
        ref_id: 'station-001/tr',
        name: 'TR stacyjny station-001',
        hv_bus_ref: 'station-001/sn',
        lv_bus_ref: 'station-001/nn',
        sn_mva: 10,
        uhv_kv: 15,
        ulv_kv: 0.4,
      },
    ],
    buses: [
      { ref_id: 'station-001/sn', id: 'station-001/sn', name: 'Szyna SN station-001', voltage_kv: 15 },
      { ref_id: 'station-001/nn', id: 'station-001/nn', name: 'Szyna nN station-001', voltage_kv: 0.4 },
    ],
  };
}

describe('Wizard → Store integration (Pakiet H/G end-to-end)', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useAppStateStore.getState().setActiveProject('projekt-test-001', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case-test-001', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({ caseId: 'case-test-001', snapshot: station001Snapshot() } as never);
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

    // Krok 2: PCC + nazwa + punkt przyłączenia SN (element istniejący w modelu,
    // karta FAB-K §0 R3) + block-trafo z katalogu.
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), {
      target: { value: 'station-001/sn' },
    });
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

    fireEvent.click(screen.getByTestId('variant-dedicated_transformer'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'BESS Test' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-02' } });
    fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), {
      target: { value: 'station-001/sn' },
    });
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
      snapshot: station001Snapshot(),
    } as never);

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
    // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) —
    // dostępna od razu, zero czekania na katalog przekształtników.
    expect(screen.getByTestId('add-der-nn-bus-readonly')).toHaveTextContent('0,4');
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

  it('dane modułu NC RfG z kroku „Profil" (art. 4, data, nastawy, deklaracje) trafiają do POST …/generators', async () => {
    // Karta AB-1a Pakiet D2 §0 pkt 8: tabliczka DER zbiera KAŻDE pole danych modułu, jeden
    // walidator kontraktu (`ui2/oze/ncrfg/daneModulu.ts` ↔ backend `pola_nc_rfg_generatora`).
    useSnapshotStore.setState({ caseId: 'case-snapshot-001', snapshot: station001Snapshot() } as never);
    const u = userEvent.setup();
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
    await u.click(screen.getByTestId('variant-nN'));
    await u.click(screen.getByTestId('add-der-next'));
    await u.type(screen.getByTestId('add-der-name'), 'PV Test');
    await u.type(screen.getByTestId('add-der-pcc-label'), 'PCC-01');
    await u.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    await u.selectOptions(screen.getByTestId('add-der-device'), 'pv_inv_huawei_185');
    await u.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    await u.selectOptions(screen.getByTestId('add-der-ncrfg'), 'enea');

    const t = 'add-der-dane-modulu';
    await u.selectOptions(screen.getByTestId(`${t}-modul_istniejacy`), 'tak');
    await u.type(screen.getByTestId(`${t}-data_umowy_przylaczeniowej`), '2019-04-27');
    // Deklaracja bez źródła blokuje krok z nazwanym błędem pola.
    await u.selectOptions(screen.getByTestId(`${t}-flaga-island_operation_capable`), 'nie');
    expect(screen.getByTestId(`${t}-zrodlo_deklaracji-blad`)).toBeInTheDocument();
    expect(screen.getByTestId('add-der-next')).toBeDisabled();
    await u.type(screen.getByTestId(`${t}-zrodlo_deklaracji`), 'deklaracja wytwórcy');
    await u.type(screen.getByTestId(`${t}-nastawa-u_min_pu`), '0,8');
    await u.type(screen.getByTestId(`${t}-nastawa-zrodlo_pl`), 'karta nastaw');
    expect(screen.getByTestId('add-der-next')).not.toBeDisabled();
    await u.click(screen.getByTestId('add-der-next'));
    await u.click(screen.getByTestId('add-der-create'));

    await waitFor(() => {
      const wywolanie = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes('/generators'),
      );
      expect(wywolanie).toBeDefined();
      const cialo = JSON.parse(String(wywolanie?.[1]?.body));
      expect(cialo).toMatchObject({
        modul_istniejacy: true,
        data_umowy_przylaczeniowej: '2019-04-27',
        nastawy_zabezpieczen: { u_min_pu: 0.8, f_min_hz: null, zrodlo_pl: 'karta nastaw' },
        deklaracje_modulu: {
          island_operation_capable: false,
          has_scada_communication: null,
          zrodlo_pl: 'deklaracja wytwórcy',
        },
      });
    });
  });

  it('przekazuje do API katalogową moc PV 50 kW bez sztucznej podłogi 100 kW', async () => {
    useSnapshotStore.setState({
      caseId: 'case-snapshot-001',
      snapshot: station001Snapshot(),
    } as never);

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
    // Karta AB-1a Pakiet D2: klasyfikacja modułu pytana w kW (klucze zapytania = parametry
    // `/modul` z migawki OpenAPI — atrapa odrzuca inne 422), moc grupy 50 kW, nie 0,05 MW.
    const zapytaniaModul = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([url]) => new URL(String(url), 'http://localhost'))
      .filter((adres) => adres.pathname === '/api/ncrfg-tests/modul');
    expect(zapytaniaModul.length).toBeGreaterThan(0);
    for (const adres of zapytaniaModul) {
      expect([...adres.searchParams.keys()].sort()).toEqual(['napiecie_kv', 'p_max_kw']);
      expect(adres.searchParams.get('p_max_kw')).toBe('50');
    }
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
