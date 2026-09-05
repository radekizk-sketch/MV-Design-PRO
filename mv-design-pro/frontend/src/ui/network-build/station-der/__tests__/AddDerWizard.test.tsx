/**
 * Testy AddDerWizard (Faza D) — 5-krokowy guided flow dodawania DER.
 *
 * Naprawa FAB-I (2026-09-05): katalog urządzeń DER (PV/BESS/FW) w kroku 3
 * pochodzi WYŁĄCZNIE z backendu (`GET /api/catalog/converter-types?kind=…`).
 * Poprzednio te same testy przechodziły dzięki CICHEMU podstawieniu statycznej
 * listy `catalogs.ts` (`fallbackDeviceCatalog`), gdy mock `fetch` poniżej nie
 * zwracał kształtu, którego oczekiwał `fetchDerConverterTypes` — DOWÓD: mock
 * zwracał ten sam obiekt audit2-snapshot dla KAŻDEGO adresu, więc konwertery
 * zawsze kończyły w gałęzi błędu, a wybieralne identyfikatory (`pv_inv_*`,
 * `bess_pcs_*`) pochodziły z lokalnego pliku, nie z tego mocka. Teraz mock
 * granicy `fetch` odpowiada realnym kształtem `ConverterType[]` per `kind`
 * (wzorzec `mockConverterCatalogFetch` z `SldDetailDrawer.test.tsx`), a
 * identyfikatory testowe zostały PRZENIESIONE z `catalogs.ts` (liczbowo bez
 * zmian — moc/napięcie/producent 1:1) do fikstur poniżej.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useAppStateStore } from '../../../app-state/store';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { AddDerWizard } from '../AddDerWizard';
import { useStationDerStore, selectDersOfStation } from '../store';

type ConverterKind = 'PV' | 'BESS' | 'WIND';
interface ConverterFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: ConverterKind;
  readonly un_kv: number;
  readonly pmax_mw: number;
  readonly sn_mva?: number;
  readonly manufacturer?: string;
  readonly control_mode?: string;
  readonly qmin_mvar?: number;
  readonly qmax_mvar?: number;
}

// Karta FAB-J: krzywe P(f) fikstury reprezentują ich REALNY zapis (audit2
// snapshot) — kreator je czyta stamtąd, nie z lokalnego katalogu (usuniętego).
const PF_CURVE_FIXTURES = [
  {
    id: 'pf_droop_5', catalog_namespace: 'pf_curve', catalog_version: '1.0',
    label_pl: 'P(f) statyzm 5%', f_ref_hz: 50, droop_percent: 5,
    f_min_hz: 47.5, f_max_hz: 51.5, deadband_hz: 0.2, zrodlo_pl: 'Fikstura testowa',
  },
  {
    id: 'pf_droop_12', catalog_namespace: 'pf_curve', catalog_version: '1.0',
    label_pl: 'P(f) statyzm 12%', f_ref_hz: 50, droop_percent: 12,
    f_min_hz: 47.5, f_max_hz: 51.5, deadband_hz: 0.2, zrodlo_pl: 'Fikstura testowa',
  },
];

// Karta FAB-J: transformatory dedykowane DER — kształt 1:1 z backendu
// (`audit2_catalogs.py::BlockTransformerItem.to_dict`). Typoszereg 15/0,69 kV
// odtwarza scenariusz z komentarza źródła (`selectAutoBlockTransformerForDevice`):
// PV 1000 kW wymaga ≥1111 kVA i dobiera 1250 kVA z typoszeregu, nie 2500 kVA.
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
const BLOCK_TRANSFORMER_FIXTURES = [
  blockTransformerFixture('btr_pv_15_069_800', 800, 15, 0.69),
  blockTransformerFixture('btr_pv_15_069_1000', 1000, 15, 0.69),
  blockTransformerFixture('btr_pv_15_069_1250', 1250, 15, 0.69),
  blockTransformerFixture('btr_pv_15_069_2500', 2500, 15, 0.69),
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

// Karta FAB-J: operatorzy NC RfG — identyfikatory REALNE (`pse`/`enea`, nie
// `ncrfg_pse` wymyślone przez front), backend niesie JEDNĄ parę krzywych
// ride-through na operatora (`GET /api/ncrfg-tests/catalog`).
interface NcRfgOperatorFixture {
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly last_revision: string;
  readonly reactive_power: {
    readonly q_range_pct_pn_min: number;
    readonly q_range_pct_pn_max: number;
    readonly cos_phi_min: number;
    readonly voltage_control_modes: readonly string[];
  };
  readonly ride_through: {
    readonly lvrt: ReadonlyArray<{ readonly time_s: number; readonly voltage_pu: number }>;
    readonly hvrt: ReadonlyArray<{ readonly time_s: number; readonly voltage_pu: number }>;
  };
}
const NC_RFG_OPERATOR_FIXTURES: readonly NcRfgOperatorFixture[] = [
  {
    operator_id: 'pse', operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne', last_revision: '2024-Q4',
    reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
    ride_through: {
      lvrt: [{ time_s: 0, voltage_pu: 0.05 }, { time_s: 1.5, voltage_pu: 0.85 }],
      hvrt: [{ time_s: 0, voltage_pu: 1.3 }],
    },
  },
  {
    operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '2024-Q4',
    reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
    ride_through: {
      lvrt: [{ time_s: 0, voltage_pu: 0.05 }],
      hvrt: [{ time_s: 0, voltage_pu: 1.3 }, { time_s: 60, voltage_pu: 1.1 }],
    },
  },
];

// Karta FAB-J: pakiety baterii BESS — backend nie miał żadnego katalogu
// baterii przed tą kartą (`GET /api/catalog/bess-battery-types`).
const BESS_BATTERY_FIXTURES = [
  {
    id: 'bess_bat_test_2880kwh', name: 'Pakiet bateryjny LFP 2880 kWh', chemistry: 'LFP',
    capacity_kwh: 2880, nominal_voltage_dc_v: 1230, c_rate: 0.5,
    verification_status: 'VERIFIED', source_reference: 'Fikstura testowa',
    catalog_status: 'PUBLISHED', contract_version: '1.0',
  },
];

/**
 * Mirror TESTOWY klasyfikacji modułu NC RfG — jedyne źródło progów zostaje
 * `compliance/nc_rfg_modul.py` (`GET /api/ncrfg-tests/modul`); ten mirror tylko
 * UDAJE backend w teście, jak `klasyfikujModulNcRfgDlaTestu` w `SldDetailDrawer.test.tsx`.
 */
function klasyfikujModulNcRfgDlaTestu(pMaxMw: number, napiecieKv: number): 'A' | 'B' | 'C' | 'D' {
  if (napiecieKv >= 110) return 'D';
  const pMaxKw = pMaxMw * 1000;
  if (pMaxKw >= 75_000) return 'D';
  if (pMaxKw >= 10_000) return 'C';
  if (pMaxKw >= 200) return 'B';
  return 'A';
}

// Identyfikatory i wartości liczbowe PRZENIESIONE 1:1 z `PV_INVERTER_CATALOG`/
// `BESS_PCS_CATALOG` (katalog lokalny zostaje w `catalogs.ts` — konsument
// produkcyjny: `DerSurfaces.tsx`/`InspectorEngineeringView.tsx` — ale kreator
// DER go już nie czyta, więc scenariusze testowe muszą przyjść z backendu).
const PV_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'pv_inv_catalog_50', name: 'Pakiet katalogowy PV 50', kind: 'PV', un_kv: 0.4, pmax_mw: 0.05, sn_mva: 0.05, manufacturer: 'MV-DESIGN-PRO' },
  { id: 'pv_inv_huawei_185', name: 'Huawei SUN2000-185KTL', kind: 'PV', un_kv: 0.4, pmax_mw: 0.185, sn_mva: 0.185, manufacturer: 'Huawei' },
  { id: 'pv_inv_system_1000', name: 'Pakiet katalogowy PV 1000', kind: 'PV', un_kv: 0.69, pmax_mw: 1, sn_mva: 1, manufacturer: 'MV-DESIGN-PRO' },
  { id: 'pv_inv_sma_2500', name: 'SMA Sunny Central 2500-EV', kind: 'PV', un_kv: 0.69, pmax_mw: 2.5, sn_mva: 2.5, manufacturer: 'SMA' },
];
// Karta FAB-J: qmin/qmax realne (nie zerowe) — jedyny dowód zdolności do pracy
// w czterech ćwiartkach (decyzja #6, `deviceFourQuadrantCapable`); bez nich
// tryby BESS wymagające tej zdolności (np. FCR-N) nie pojawiłyby się wcale.
const BESS_CONVERTER_FIXTURES: readonly ConverterFixture[] = [
  { id: 'bess_pcs_abb_500', name: 'ABB PCS100 ESS', kind: 'BESS', un_kv: 0.4, pmax_mw: 0.5, sn_mva: 0.5, manufacturer: 'ABB', qmin_mvar: -0.5, qmax_mvar: 0.5 },
  { id: 'bess_pcs_sma_2200', name: 'SMA Sunny Central Storage 2200', kind: 'BESS', un_kv: 0.69, pmax_mw: 2.2, sn_mva: 2.2, manufacturer: 'SMA', qmin_mvar: -2.2, qmax_mvar: 2.2 },
];
const DEFAULT_CONVERTERS: Readonly<Record<ConverterKind, readonly ConverterFixture[]>> = {
  PV: PV_CONVERTER_FIXTURES,
  BESS: BESS_CONVERTER_FIXTURES,
  WIND: [],
};

/**
 * Mockuje granicę `fetch` — NIE listę opcji renderowaną przez kreator (wzorzec
 * `mockConverterCatalogFetch` z `SldDetailDrawer.test.tsx`). `/api/catalog/
 * converter-types?kind=…` odpowiada fikstywnym `ConverterType[]`; bez `kind`
 * (poziomy napięcia nN) — unią WSZYSTKICH technologii. `/api/ncrfg-tests/*`,
 * `/api/catalog/bess-battery-types` odpowiadają realnym kształtem backendu;
 * wszystko inne (audit2 snapshot, `POST …/generators`, `assign_catalog_to_element`)
 * dostaje neutralny kształt audit2 — zachowanie tożsame z dawnym stubem.
 */
function mockDerWizardFetch(
  converters: Readonly<Partial<Record<ConverterKind, readonly ConverterFixture[]>>> = DEFAULT_CONVERTERS,
) {
  // Typ zwracany wnioskowany z `vi.fn(...)`: jawna adnotacja `ReturnType<typeof vi.fn>`
  // rozwiazuje sie do `Mock<any[], unknown>` i nie przyjmuje mocka o konkretnej sygnaturze.
  const mock = vi.fn(async (input: RequestInfo | URL) => {
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
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

// Phase 8: Wizard pulls catalog snapshot via React Query — need QueryClient.
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

const FROZEN_NOW = '2026-05-06T10:00:00Z';

/**
 * Karta FAB-K (§0 R3/R4, KLASA NIE INSTANCJA): kreator NIE MA już fabrykowanej
 * listy poziomów napięcia nN ani fałszywego wariantu „SN" bez transformatora —
 * szyna nN pochodzi WYŁĄCZNIE z realnej migawki (`resolveStationNnBus`), a
 * punkt przyłączenia SN z realnych elementów modelu
 * (`selectSnConnectionPointCandidates`). Testy, które wcześniej nie
 * potrzebowały żadnej migawki (bo poziom napięcia był wyborem UI, nie odczytem
 * modelu), TERAZ potrzebują stacji z transformatorem SN/nN i realnymi szynami
 * — inaczej krok „Punkt" nie ma czego pokazać i `Dalej` zostaje zablokowane
 * na zawsze (uczciwie, ale test musi dostarczyć dane, nie oczekiwać fantomu).
 * Domyślna migawka niesie WSZYSTKIE „gołe" identyfikatory stacji użyte w tym
 * pliku (`s`, `station_test`, `station-015`, `station_1`) z transformatorem
 * 10 MVA (moc nigdy nie ogranicza urządzeń testowych ≤ 2,5 MW) — testy z
 * WŁASNYM scenariuszem transformatora (np. „stacja 63 kVA") nadpisują
 * `snapshot` własnym, węższym `useSnapshotStore.setState(...)`.
 */
function bareStationSnapshot(stationId: string): Record<string, unknown> {
  return {
    ref_id: stationId,
    id: stationId,
    bus_refs: [`${stationId}/sn`, `${stationId}/nn`],
    transformer_refs: [`${stationId}/tr`],
  };
}
function bareStationTransformer(stationId: string): Record<string, unknown> {
  return {
    ref_id: `${stationId}/tr`,
    name: `TR stacyjny ${stationId}`,
    hv_bus_ref: `${stationId}/sn`,
    lv_bus_ref: `${stationId}/nn`,
    sn_mva: 10,
    uhv_kv: 15,
    ulv_kv: 0.4,
  };
}
function bareStationBuses(stationId: string): Record<string, unknown>[] {
  return [
    { ref_id: `${stationId}/sn`, id: `${stationId}/sn`, name: `Szyna SN ${stationId}`, voltage_kv: 15 },
    { ref_id: `${stationId}/nn`, id: `${stationId}/nn`, name: `Szyna nN ${stationId}`, voltage_kv: 0.4 },
  ];
}
const BARE_STATION_IDS = ['s', 'station_test', 'station-015', 'station_1'];
function defaultBaseSnapshot(): Record<string, unknown> {
  return {
    substations: BARE_STATION_IDS.map(bareStationSnapshot),
    transformers: BARE_STATION_IDS.map(bareStationTransformer),
    buses: BARE_STATION_IDS.flatMap(bareStationBuses),
  };
}

describe('AddDerWizard — 5-krokowy guided flow', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useAppStateStore.getState().setActiveProject('proj_test', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case_test', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({ caseId: 'case_test', snapshot: defaultBaseSnapshot() } as never);
  });

  it('zwraca null gdy isOpen=false', () => {
    const { container } = render(
      <AddDerWizard
        isOpen={false}
        stationId="station_1"
        stationName="Stacja 1"
        derKind="PV"
        projectId="proj-test"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderuje 5 kroków stepper z polskimi etykietami', () => {
    render(
      <AddDerWizard
        isOpen
        stationId="station_1"
        stationName="Stacja 1"
        derKind="PV"
        projectId="proj-test"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('add-der-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-variant')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-point')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-device')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-profile')).toBeInTheDocument();
    expect(screen.getByTestId('add-der-step-review')).toBeInTheDocument();
  });

  it('Krok 1: PV pokazuje 2 poziomy przyłączenia (nN, dedicated_transformer)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('variant-nN')).toBeInTheDocument();
    expect(screen.getByTestId('variant-dedicated_transformer')).toBeInTheDocument();
  });

  it('Krok 1: FW pokazuje WYŁĄCZNIE dedicated_transformer — bez nN', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="FW" projectId="p" onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('variant-dedicated_transformer')).toBeInTheDocument();
    expect(screen.queryByTestId('variant-nN')).toBeNull();
  });

  it('przycisk Dalej zablokowany gdy nie wybrano poziomu przyłączenia (Krok 1)', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    const next = screen.getByTestId('add-der-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('variant-nN'));
    expect(next.disabled).toBe(false);
  });

  it('pełny flow PV po SN (transformator dedykowany na szynie stacji): 5 kroków → utwórz', async () => {
    const onClose = vi.fn();
    render(
      <AddDerWizard
        isOpen
        stationId="station_test"
        stationName="Stacja Test"
        derKind="PV"
        projectId="proj_test"
        nowIso={FROZEN_NOW}
        onClose={onClose}
      />,
    );

    // Krok 1: poziom przyłączenia — SN przez transformator dedykowany.
    fireEvent.click(screen.getByTestId('variant-dedicated_transformer'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 2: nazwa, PCC, punkt przyłączenia SN (element ISTNIEJĄCY w modelu —
    // szyna SN stacji z domyślnej migawki testowej, karta FAB-K §0 R3).
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV Test 1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-01' } });
    fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), {
      target: { value: 'station_test/sn' },
    });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: device — katalog backendu jest ASYNCHRONICZNY (zero listy statycznej,
    // zero natychmiastowego fallbacku), więc czekamy na jego wczytanie przed wyborem.
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 4: profile — operator jest jedynym wyborem; LVRT/HVRT to teraz
    // dowód read-only tego samego profilu (karta FAB-J), nie osobny wybór.
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'pse' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 5: review + utworz
    fireEvent.click(screen.getByTestId('add-der-create'));

    // Po utworzeniu DER jest w store + onClose wywołany.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const ders = selectDersOfStation(useStationDerStore.getState(), 'station_test');
    expect(ders).toHaveLength(1);
    expect(ders[0].name).toBe('PV Test 1');
    expect(ders[0].der_kind).toBe('PV');
    expect(ders[0].connection_side).toBe('dedicated_transformer');
    expect(ders[0].bus_przylaczenia_ref).toContain('PCC-01');
    expect(ders[0].sn_connection_bus_ref).toBe('station_test/sn');
    expect(ders[0].sn_connection_point_kind).toBe('station_bus');
    expect(ders[0].connection_voltage_kv).toBe(15);
    expect(ders[0].catalogs.device_catalog_ref).toBe('pv_inv_sma_2500');
    expect(ders[0].profiles.nc_rfg_profile_ref).toBe('pse');
    expect(ders[0].profiles.lvrt_curve_ref).toBe('pse');
    expect(ders[0].profiles.hvrt_curve_ref).toBe('pse');
    expect(ders[0].nominal_power_kw).toBe(2500);
    expect(ders[0].completeness).toBe('complete');
  });

  /**
   * Karta FAB-K (§0 R4, KLASA NIE INSTANCJA): `voltage_level_ref` USUNIĘTY jako
   * phantom — nie ma już wyboru poziomu napięcia nN, bo backend dla `nn_side`
   * sam wyprowadza szynę nN stacji. Dawny test sprawdzał, że opcje SELECTA
   * pochodzą z katalogu przekształtników — TERAZ napięcie pochodzi WYŁĄCZNIE
   * z REALNEJ szyny nN modelu (`resolveStationNnBus`), niezależnie od
   * katalogu przekształtników w ogóle (który tu filtruje tylko urządzenia).
   */
  it('po nN: krok „Punkt" pokazuje REALNĄ szynę nN stacji z modelu (odczyt, nie wybór)', async () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    expect(screen.queryByTestId('add-der-voltage-level')).toBeNull();
    const szyna = screen.getByTestId('add-der-nn-bus-readonly');
    expect(szyna).toHaveTextContent('0,4');
    expect(screen.queryByTestId('add-der-nn-bus-empty')).toBeNull();
  });

  it('po nN: podpowiada gotowy punkt PCC i nazwę DER; napięcie z REALNEJ szyny modelu', async () => {
    render(
      <AddDerWizard
        isOpen
        stationId="station-015"
        stationName="Stacja SN/nN 15"
        derKind="PV"
        projectId="p"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    expect((screen.getByTestId('add-der-name') as HTMLInputElement).value).toBe('PV S15');
    expect((screen.getByTestId('add-der-pcc-label') as HTMLInputElement).value).toBe('PCC-PV-S15');
    // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) — nie
    // wybór z katalogu przekształtników, więc dostępne natychmiast (bez waitFor
    // na katalog), z domyślnej migawki testowej (0,4 kV).
    expect(screen.getByTestId('add-der-nn-bus-readonly')).toHaveTextContent('0,4');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('BESS wymaga baterii oraz jawnego trybu pracy (Krok 3)', async () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'BESS-1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-1' } });
    // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) —
    // dostępna natychmiast, bez wyboru z katalogu przekształtników.
    expect(screen.getByTestId('add-der-nn-bus-readonly')).toHaveTextContent('0,4');
    fireEvent.click(screen.getByTestId('add-der-next'));

    // Krok 3: musi pokazac wybor baterii i trybow pracy.
    expect(screen.getByTestId('add-der-battery')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'bess_pcs_abb_500' } });
    // Bez baterii i trybu pracy: Dalej zablokowany.
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(screen.getByTestId('add-der-battery')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-battery'), { target: { value: 'bess_bat_test_2880kwh' } });
    // Sama bateria nie wystarcza, bo tryb BESS zasila pozniejsze analizy NC RfG/PTPiREE.
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('add-der-bess-mode-fcr_n'));
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('blokuje DER po nN, gdy moc katalogowa przekracza moc transformatora stacji', async () => {
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-063',
            id: 'station-063',
            bus_refs: ['station-063/sn', 'station-063/nn'],
            transformer_refs: ['station-063/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-063/tr',
            hv_bus_ref: 'station-063/sn',
            lv_bus_ref: 'station-063/nn',
            sn_mva: 0.063,
          },
        ],
        buses: [
          { ref_id: 'station-063/sn', id: 'station-063/sn', name: 'Szyna SN 063', voltage_kv: 15 },
          { ref_id: 'station-063/nn', id: 'station-063/nn', name: 'Szyna nN 063', voltage_kv: 0.4 },
        ],
      },
    } as never);

    render(
      <AddDerWizard
        isOpen
        stationId="station-063"
        stationName="Stacja 63 kVA"
        derKind="PV"
        projectId="proj_test"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) —
    // dostępna od razu (zero czekania na katalog przekształtników).
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    expect(
      Array.from((screen.getByTestId('add-der-device') as HTMLSelectElement).options)
        .some((option) => option.value === 'pv_inv_catalog_50'),
    ).toBe(true);
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });

    expect(screen.getByTestId('add-der-transformer-power-warning')).toHaveTextContent(
      'transformator stacji ma 63 kVA',
    );
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('po nN liczy tylko transformator SN/nN stacji, a nie transformator blokowy DER na tej samej szynie', async () => {
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-250',
            id: 'station-250',
            bus_refs: ['station-250/sn', 'station-250/nn'],
            transformer_refs: ['station-250/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-250/tr',
            name: 'TR stacyjny 250 kVA',
            hv_bus_ref: 'station-250/sn',
            lv_bus_ref: 'station-250/nn',
            sn_mva: 0.25,
            uhv_kv: 15,
            ulv_kv: 0.4,
          },
          {
            ref_id: 'station-250/tr-block-pv',
            name: 'TR blokowy 15/0,69 kV 1250 kVA Dyn5',
            hv_bus_ref: 'station-250/sn',
            lv_bus_ref: 'pv-1000/nn',
            sn_mva: 1.25,
            uhv_kv: 15,
            ulv_kv: 0.69,
            catalog_binding: {
              catalog_namespace: 'block_transformer',
              catalog_item_id: 'btr_pv_15_069_1250',
            },
          },
        ],
        generators: [
          {
            ref_id: 'pv-1000',
            name: 'PV 1 MW',
            station_ref: 'station-250',
            connection_variant: 'block_transformer',
            blocking_transformer_ref: 'station-250/tr-block-pv',
          },
        ],
        buses: [
          { ref_id: 'station-250/sn', id: 'station-250/sn', name: 'Szyna SN 250', voltage_kv: 15 },
          { ref_id: 'station-250/nn', id: 'station-250/nn', name: 'Szyna nN 250', voltage_kv: 0.4 },
          { ref_id: 'pv-1000/nn', id: 'pv-1000/nn', name: 'Szyna nN bloku PV 1 MW', voltage_kv: 0.69 },
        ],
      },
    } as never);

    render(
      <AddDerWizard
        isOpen
        stationId="station-250"
        stationName="Stacja 250 kVA"
        derKind="PV"
        projectId="proj_test"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) —
    // MUSI być szyna transformatora STACYJNEGO (0,4 kV), nie transformatora
    // blokowego innego DER na tej samej szynie SN (0,69 kV).
    expect(screen.getByTestId('add-der-nn-bus-readonly')).toHaveTextContent('0,4');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('add-der-next'));

    const summary = screen.getByTestId('add-der-compatible-device-summary');
    expect(summary).toHaveTextContent('transformatorem stacji 250 kVA');
    expect(summary).not.toHaveTextContent('1.50 MVA');
    expect(summary).not.toHaveTextContent('1.5 MVA');

    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_huawei_185' },
    });
    expect(screen.queryByTestId('add-der-transformer-power-warning')).toBeNull();
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('krok profilu NIE preselekcjonuje operatora — Dalej zablokowane do wyboru', async () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    // Przejście do kroku 4
    fireEvent.click(screen.getByTestId('variant-dedicated_transformer'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'P' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'P' } });
    fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), { target: { value: 's/sn' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    // INTENCJA ZACHOWANA, KANON ZMIENIONY (V12K-245): krok profilu jest DECYZJA, nie
    // formalnoscia. Preselekcja jednego z pieciu OSD (ENEA) pozwalala przejsc dalej jednym
    // klikiem i zapisac w modelu operatora, ktorego projektant nigdy nie wybral — a wybor
    // OSD wynika z lokalizacji przylaczenia i determinuje krzywe FRT oraz wymagania Q(U).
    expect((screen.getByTestId('add-der-ncrfg') as HTMLSelectElement).value).toBe('');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('profil Enea pokazuje jego krzywe LVRT/HVRT (read-only, z backendu) i odblokowuje Dalej', async () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('variant-dedicated_transformer'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.change(screen.getByTestId('add-der-name'), { target: { value: 'PV-1' } });
    fireEvent.change(screen.getByTestId('add-der-pcc-label'), { target: { value: 'PCC-PV' } });
    fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), { target: { value: 's/sn' } });
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'enea' } });

    // Karta FAB-J: backend niesie JEDNĄ krzywą LVRT/HVRT na operatora (nie
    // katalog wariantów) — pokazywana jako dowód White Box, nie jako select.
    expect(screen.getByTestId('add-der-lvrt')).toHaveTextContent('0.05 pu');
    expect(screen.getByTestId('add-der-hvrt')).toHaveTextContent('1.30 pu');
    // Karta K-Q: nastawa P(f) NIE jest juz przypisana operatorowi (rozporzadzenie
    // 2016/631 art. 13 ust. 2 podaje przedzial nastawialny, a nie wartosc „dla
    // Enei"), wiec wybor profilu jej nie podstawia i nie zaweza listy wariantow.
    await waitFor(() => expect(screen.getByTestId('add-der-pf-curve')).not.toBeDisabled());
    const pf = screen.getByTestId('add-der-pf-curve') as HTMLSelectElement;
    expect(pf.value).toBe('');
    const wariantyPf = Array.from(pf.options).map((o) => o.value).filter(Boolean);
    expect(wariantyPf).toContain('pf_droop_5');
    expect(wariantyPf).toContain('pf_droop_12');
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
  });

  it('jawnie przełącza na transformator dedykowany dla falownika o innym napięciu', async () => {
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-063',
            id: 'station-063',
            bus_refs: ['station-063/sn', 'station-063/nn'],
            transformer_refs: ['station-063/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-063/tr',
            hv_bus_ref: 'station-063/sn',
            lv_bus_ref: 'station-063/nn',
            sn_mva: 0.063,
            uhv_kv: 15,
            ulv_kv: 0.4,
          },
        ],
        buses: [
          { ref_id: 'station-063/sn', id: 'station-063/sn', name: 'Szyna SN 063', voltage_kv: 15 },
          { ref_id: 'station-063/nn', id: 'station-063/nn', name: 'Szyna nN 063', voltage_kv: 0.4 },
        ],
      },
    } as never);

    render(
      <AddDerWizard
        isOpen
        stationId="station-063"
        stationName="Stacja 63 kVA"
        derKind="PV"
        projectId="proj_test"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) —
    // dostępna od razu (zero czekania na katalog przekształtników).
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), {
      target: { value: 'pv_inv_system_1000' },
    });

    expect(screen.getByTestId('add-der-voltage-mismatch-warning')).toHaveTextContent(
      'Niezgodność napięciowa',
    );
    expect(screen.queryByTestId('add-der-block-transformer')).toBeNull();
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('add-der-switch-dedicated-transformer'));

    await waitFor(() =>
      expect(screen.getByTestId('add-der-auto-block-transformer')).toHaveTextContent(
        '1250 kVA',
      ));
    // Karta FAB-K (§0 R3): SAM transformator dedykowany nie wystarcza już —
    // Dalej wymaga TEŻ punktu przyłączenia SN (element istniejący w modelu),
    // wracamy na krok „Punkt" po przełączeniu wariantu i wybieramy szynę SN
    // stacji z migawki testowej.
    fireEvent.click(screen.getByTestId('add-der-prev'));
    fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), {
      target: { value: 'station-063/sn' },
    });
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);

    // Krok „Punkt" → „Urządzenie" (wybór urządzenia i transformatora blokowego
    // przetrwały nawigację wstecz/wprzód — to ten sam stan `selections`).
    fireEvent.click(screen.getByTestId('add-der-next'));
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-ncrfg')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-ncrfg'), { target: { value: 'enea' } });
    fireEvent.click(screen.getByTestId('add-der-next'));

    expect(screen.getByTestId('add-der-step-content-review')).toHaveTextContent('Transformator blokowy');
    expect(screen.getByTestId('add-der-step-content-review')).toHaveTextContent('1250 kVA');
  });

  it('po przekroczeniu mocy pozwala zmienić transformator stacji na większy wariant katalogowy', async () => {
    const originalExecute = useSnapshotStore.getState().executeDomainOperation;
    const executeDomainOperation = vi.fn().mockResolvedValue({
      snapshot: { header: { hash_sha256: 'after-upgrade' } },
      logical_views: null,
      readiness: null,
      fix_actions: [],
      materialized_params: null,
      layout: null,
      changes: { created_element_ids: [], updated_element_ids: ['station-063/tr'] },
      domain_events: [],
      error: null,
      error_code: null,
    });
    useSnapshotStore.setState({
      caseId: 'case_test',
      snapshot: {
        substations: [
          {
            ref_id: 'station-063',
            id: 'station-063',
            bus_refs: ['station-063/sn', 'station-063/nn'],
            transformer_refs: ['station-063/tr'],
          },
        ],
        transformers: [
          {
            ref_id: 'station-063/tr',
            hv_bus_ref: 'station-063/sn',
            lv_bus_ref: 'station-063/nn',
            sn_mva: 0.063,
            uhv_kv: 15,
            ulv_kv: 0.4,
          },
        ],
        buses: [
          { ref_id: 'station-063/sn', id: 'station-063/sn', name: 'Szyna SN 063', voltage_kv: 15 },
          { ref_id: 'station-063/nn', id: 'station-063/nn', name: 'Szyna nN 063', voltage_kv: 0.4 },
        ],
      },
      executeDomainOperation: executeDomainOperation as never,
    } as never);

    try {
      render(
        <AddDerWizard
          isOpen
          stationId="station-063"
          stationName="Stacja 63 kVA"
          derKind="PV"
          projectId="proj_test"
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId('variant-nN'));
      fireEvent.click(screen.getByTestId('add-der-next'));
      // Napięcie nN to REALNA szyna stacji z migawki (karta FAB-K, §0 R4) —
      // dostępna od razu (zero czekania na katalog przekształtników).
      expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(screen.getByTestId('add-der-next'));
      await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
      fireEvent.change(screen.getByTestId('add-der-device'), {
        target: { value: 'pv_inv_huawei_185' },
      });

      expect(screen.getByTestId('add-der-transformer-upgrade-panel')).toBeInTheDocument();
      await waitFor(() =>
        expect((screen.getByTestId('add-der-transformer-upgrade') as HTMLSelectElement).value)
          .toBe('tr-sn-nn-15-04-250kva-dyn11'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('add-der-upgrade-transformer'));
      });

      await waitFor(() => {
        expect(executeDomainOperation).toHaveBeenCalledWith(
          'case_test',
          'assign_catalog_to_element',
          {
            element_ref: 'station-063/tr',
            catalog_binding: {
              catalog_namespace: 'TRAFO_SN_NN',
              catalog_item_id: 'tr-sn-nn-15-04-250kva-dyn11',
              catalog_item_version: '2024.1',
            },
          },
        );
      });
    } finally {
      useSnapshotStore.setState({ executeDomainOperation: originalExecute } as never);
    }
  });

  it('Anulowanie zamyka modal bez tworzenia DER', () => {
    const onClose = vi.fn();
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-wizard-close'));
    expect(onClose).toHaveBeenCalled();
    const ders = selectDersOfStation(useStationDerStore.getState(), 's');
    expect(ders).toHaveLength(0);
  });

  it('przycisk "Wstecz" zablokowany w Kroku 1', () => {
    render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
    );
    expect((screen.getByTestId('add-der-prev') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Katalog urządzeń DER — wyłącznie z backendu, zero listy zastępczej (FAB-I)', () => {
  beforeEach(() => {
    useStationDerStore.getState().reset();
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useAppStateStore.getState().setActiveProject('proj_test', 'Projekt testowy');
    useAppStateStore.getState().setActiveCase('case_test', 'Zakres testowy', 'ShortCircuitCase', 'NONE');
    // Karta FAB-K (§0 R4): krok „Punkt" dla nN wymaga REALNEJ szyny nN stacji
    // z migawki (zero fabrykowanego wyboru) — bez niej `Dalej` zostaje
    // zablokowane na zawsze, więc te testy (o katalogu URZĄDZEŃ, nie o
    // punkcie przyłączenia) potrzebują minimalnej, poprawnej migawki.
    useSnapshotStore.setState({ caseId: 'case_test', snapshot: defaultBaseSnapshot() } as never);
  });

  it.each([
    ['PV', 'variant-nN'],
    ['BESS', 'variant-nN'],
    ['FW', 'variant-dedicated_transformer'],
  ] as const)(
    'katalog pusty dla %s: stan zerowy uczciwy + krok zablokowany + zero identyfikatorów statycznych w DOM',
    async (derKind, variantTestId) => {
      const { container } = render(
        <AddDerWizard isOpen stationId="s" stationName="S" derKind={derKind} projectId="p" onClose={vi.fn()} />,
        { PV: [], BESS: [], WIND: [] },
      );
      fireEvent.click(screen.getByTestId(variantTestId));
      fireEvent.click(screen.getByTestId('add-der-next'));
      // FW: WYŁĄCZNIE dedicated_transformer (karta FAB-K, §0 R3) — krok
      // „Punkt" wymaga punktu przyłączenia SN, element ISTNIEJĄCY w modelu.
      if (variantTestId === 'variant-dedicated_transformer') {
        fireEvent.change(screen.getByTestId('add-der-sn-connection-point'), { target: { value: 's/sn' } });
      }
      fireEvent.click(screen.getByTestId('add-der-next'));

      await waitFor(() =>
        expect(screen.getByTestId('add-der-device-catalog-error')).toBeInTheDocument());
      expect(screen.getByTestId('add-der-device-catalog-error')).toHaveTextContent(
        'Katalog konwerterów nie zawiera pozycji dla wybranego typu DER.',
      );
      expect(screen.getByTestId('add-der-device-catalog-error')).toHaveTextContent(
        'krok „Urządzenie” jest',
      );
      // Krok zablokowany — brak wyboru = brak zapisu, bez wyjątku dla żadnej technologii.
      expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId('add-der-device') as HTMLSelectElement).disabled).toBe(true);

      // ZERO LISTY ZASTĘPCZEJ: `PV_INVERTER_CATALOG`/`BESS_PCS_CATALOG`/
      // `WIND_TURBINE_CATALOG` USUNIĘTE z `catalogs.ts` (karta FAB-J — jedyny
      // pozostały konsument, `DerSurfaces.tsx`, czyta ten sam `fetchDerConverterTypes`
      // co kreator) — rozjazd jest strukturalnie niemożliwy (nie ma już drugiej
      // kopii do wycieku), nie tylko pilnowany testem przeszukującym DOM.
      expect(container.innerHTML).not.toContain('pv_inv_');
      expect(container.innerHTML).not.toContain('bess_pcs_');
      expect(container.innerHTML).not.toContain('wind_turbine_');
    },
  );

  it('błąd HTTP backendu (503): komunikat z treścią błędu backendu + krok zablokowany', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/catalog/converter-types')) {
        return new Response(
          JSON.stringify({ detail: 'Katalog konwerterów PV jest chwilowo w konserwacji.' }),
          { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(AUDIT2_SNAPSHOT_BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    rtlRender(
      <QueryClientProvider client={qc}>
        <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));

    await waitFor(() =>
      expect(screen.getByTestId('add-der-device-catalog-error')).toBeInTheDocument());
    expect(screen.getByTestId('add-der-device-catalog-error')).toHaveTextContent(
      'Katalog konwerterów PV jest chwilowo w konserwacji.',
    );
    expect((screen.getByTestId('add-der-next') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('add-der-device') as HTMLSelectElement).disabled).toBe(true);
  });

  it('katalog OK: lista urządzeń pochodzi WYŁĄCZNIE z backendu — zero pozycji z lokalnego katalogu statycznego', async () => {
    // Identyfikatory CELOWO różne od `PV_INVERTER_CATALOG`, żeby dowieść, że
    // opcje w Select pochodzą z tego mocka backendu, a nie z pliku statycznego.
    const backendOnly = [
      { id: 'conv-pv-test-a', name: 'Konwerter testowy A', kind: 'PV' as const, un_kv: 0.4, pmax_mw: 0.1, manufacturer: 'TestCo' },
      { id: 'conv-pv-test-b', name: 'Konwerter testowy B', kind: 'PV' as const, un_kv: 15, pmax_mw: 3, manufacturer: 'TestCo' },
    ];
    const { container } = render(
      <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />,
      { PV: backendOnly, BESS: [], WIND: [] },
    );
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());

    const options = Array.from((screen.getByTestId('add-der-device') as HTMLSelectElement).options)
      .map((o) => o.value)
      .filter(Boolean)
      .sort();
    // Dokładnie te dwa identyfikatory z backendu — nic więcej, nic mniej.
    expect(options).toEqual(['conv-pv-test-a', 'conv-pv-test-b']);
    // `PV_INVERTER_CATALOG` USUNIĘTY z `catalogs.ts` (karta FAB-J) — rozjazd
    // strukturalnie niemożliwy; sprawdzamy mimo to prefiks jego dawnych id.
    expect(container.innerHTML).not.toContain('pv_inv_');
  });

  it('zmiana technologii po wyborze urządzenia: wybór wyczyszczony, lista nowej technologii, zero wycieku poprzedniej', async () => {
    mockDerWizardFetch({ PV: PV_CONVERTER_FIXTURES, BESS: BESS_CONVERTER_FIXTURES, WIND: [] });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = rtlRender(
      <QueryClientProvider client={qc}>
        <AddDerWizard isOpen stationId="s" stationName="S" derKind="PV" projectId="p" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());
    fireEvent.change(screen.getByTestId('add-der-device'), { target: { value: 'pv_inv_sma_2500' } });
    expect((screen.getByTestId('add-der-device') as HTMLSelectElement).value).toBe('pv_inv_sma_2500');

    rerender(
      <QueryClientProvider client={qc}>
        <AddDerWizard isOpen stationId="s" stationName="S" derKind="BESS" projectId="p" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    // Reset stanu kreatora przy zmianie technologii (derKind) — wraca do kroku 1,
    // bez śladu wyboru zrobionego dla poprzedniej technologii.
    await waitFor(() =>
      expect(screen.getByTestId('add-der-step-content-variant')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('variant-nN'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    fireEvent.click(screen.getByTestId('add-der-next'));
    await waitFor(() => expect(screen.getByTestId('add-der-device')).not.toBeDisabled());

    const select = screen.getByTestId('add-der-device') as HTMLSelectElement;
    expect(select.value).toBe('');
    const options = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(options).toEqual(expect.arrayContaining(['bess_pcs_abb_500', 'bess_pcs_sma_2200']));
    expect(options).not.toContain('pv_inv_sma_2500');
  });
});
