import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

/** Karta FAB-J: patrz komentarz w `InspectorEngineeringView.test.tsx`. */
function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const openOperationForm = vi.fn();
const openRouteSurface = vi.fn();
const executeDomainOperation = vi.fn();

const snapshot = {
  buses: [
    { id: 'bus-nn-1', ref_id: 'bus-nn-1', name: 'Szyna nN ST-001', voltage_kv: 0.4, tags: [], meta: {} },
  ],
  branches: [],
  branch_points: [],
  transformers: [
    {
      id: 'tr-st-001',
      ref_id: 'tr-st-001',
      name: 'TR 15/0,4 kV 630 kVA Dyn11',
      tags: [],
      meta: {},
      hv_bus_ref: 'bus-sn-1',
      lv_bus_ref: 'bus-nn-1',
      sn_mva: 0.63,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 6,
      pk_kw: 6.5,
      vector_group: 'Dyn11',
    },
  ],
  sources: [],
  substation: [],
  substations: [
    {
      id: 'st-001',
      ref_id: 'st-001',
      name: 'Stacja PV ST-001',
      tags: [],
      meta: {},
      station_type: 'mv_lv',
      bus_refs: ['bus-sn-1', 'bus-nn-1'],
      transformer_refs: ['tr-st-001'],
    },
  ],
  bays: [],
  generators: [
    {
      id: 'pv-1',
      ref_id: 'pv-1',
      name: 'Falownik PV 0.5 MW / 0.4 kV nN',
      tags: [],
      meta: {
        station_ref: 'st-001',
        connection_point_ref: 'bus-nn-1',
        station_transformer_ref: 'tr-st-001',
        protection_intent: {
          breaker_role: 'wyłącznik nN źródła PV',
          device_label: 'Elektrometal e2TANGO-400',
          protected_object: 'falownik PV i kabel nN do PCC',
          analysis_scope: 'nadprądowe, ziemnozwarciowe i koordynacja z wyłącznikiem głównym nN',
        },
      },
      bus_ref: 'bus-nn-1',
      p_mw: 0.5,
      q_mvar: 0,
      gen_type: 'pv_inverter',
      station_ref: 'st-001',
      catalog_ref: 'pv_inv_huawei_185',
      catalog_namespace: 'PV_INVERTER',
      parameter_source: 'CATALOG',
      source_mode: 'KATALOG',
      connection_variant: 'nn_side',
      materialized_params: {
        station_transformer_ref: 'tr-st-001',
        // Karta FAB-J: katalog falowników PV (PV_INVERTER_CATALOG) usunięty z
        // frontu (FAB-I) — etykieta/producent/moc/napięcie są dziś TYLKO tym, co
        // backend zmaterializował przy tworzeniu generatora, nie drugą lokalną
        // kopią katalogu, więc fikstura musi je nieść wprost.
        catalog_label: 'Huawei SUN2000-185KTL (185 kW · 0,4 kV)',
        manufacturer: 'Huawei',
        nominal_power_kw: 185,
        nominal_voltage_kv: 0.4,
        profiles: {
          nc_rfg_profile_ref: 'pse',
          lvrt_curve_ref: 'pse',
          hvrt_curve_ref: 'pse',
          pf_curve_ref: 'pf_pse_2024',
        },
      },
    },
  ],
  loads: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [
    {
      id: 'prot-pv-1',
      ref_id: 'prot-pv-1',
      name: 'Elektrometal e2TANGO-400',
      tags: ['station_nn_source_protection'],
      meta: {
        protected_object_ref: 'pv-1',
        protected_object: 'falownik PV i kabel nN do PCC',
        analysis_scope: 'nadprądowe, ziemnozwarciowe i koordynacja z wyłącznikiem głównym nN',
      },
      breaker_ref: 'pv-breaker-1',
      device_type: 'overcurrent',
      catalog_ref: 'EM_ETANGO_400_V0',
      settings: [],
      is_enabled: true,
    },
  ],
};

let mockSelectedElements: Array<Record<string, unknown>> = [];
let mockReadinessIssues: Array<{
  severity: string;
  element_ref: string | null;
  element_refs: string[];
  message_pl: string;
}> = [];

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: {
    openOperationForm: typeof openOperationForm;
    openRouteSurface: typeof openRouteSurface;
  }) => unknown) =>
    selector({ openOperationForm, openRouteSurface }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

// JEDNA prawda gotowosci (KD-1 / V12K-286): inspektor czyta problemy przez
// `gotowoscAdapter` z `useSnapshotStore.readiness`, wiec scena zasila TO pole
// (dawna atrapa `readinessLiveStore` byla osobnym, nigdy nieodswiezanym zrodlem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      executeDomainOperation,
      readiness: readinessZListy(mockReadinessIssues),
      fixActions: [],
    }),
}));


vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: [] },
    itemsByBayRef: new Map(),
    itemsByBayId: new Map(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string; activeCaseId: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

// Karta FAB-J: profil NC RfG (`useNcRfgOperatorCatalog`) czyta katalog operatorów
// z backendu przez React Query — mockujemy hook SYNCHRONICZNIE (spójnie z
// pozostałymi zależnościami tego pliku powyżej), zamiast podstawiać `fetch` i
// czekać na rozstrzygnięcie zapytania asynchronicznie w każdym teście z osobna.
// `getNcRfgOperator` zostaje prawdziwą implementacją (`importOriginal`).
vi.mock('../station-der/derRemoteCatalogs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../station-der/derRemoteCatalogs')>();
  return {
    ...actual,
    useNcRfgOperatorCatalog: () => ({
      data: [{
        operator_id: 'pse',
        operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
        last_revision: '2024-Q4',
        reactive_power: {
          q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [],
        },
        ride_through: {
          lvrt: [{ time_s: 0, voltage_pu: 0.05 }],
          hvrt: [{ time_s: 0, voltage_pu: 1.3 }],
        },
      }],
      status: 'success',
      isLoading: false,
      error: null,
    }),
  };
});

describe('InspectorEngineeringView - PV za transformatorem SN/nN', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    openRouteSurface.mockReset();
    executeDomainOperation.mockReset();
    mockReadinessIssues = [];
    mockSelectedElements = [{
      id: 'pv-1',
      type: 'Generator',
      name: 'Falownik PV 0.5 MW / 0.4 kV nN',
      semanticHash: 'source:pv-1',
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    }];
  });

  it('pokazuje kartę projektową bez surowych identyfikatorów i z zabezpieczeniem nN', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByText('Falownik PV w stacji')).toBeInTheDocument();
    expect(screen.getByText('Konfiguracja falownika PV')).toBeInTheDocument();
    expect(screen.getByTestId('open-pv-inverter-config')).toBeInTheDocument();
    expect(screen.getByText('Falownik z katalogu')).toBeInTheDocument();
    expect(screen.getByText('Huawei SUN2000-185KTL (185 kW · 0,4 kV)')).toBeInTheDocument();
    expect(screen.getByText('Huawei')).toBeInTheDocument();
    expect(screen.getByText('NC RfG i regulacja')).toBeInTheDocument();
    expect(screen.getByText('PSE — Polskie Sieci Elektroenergetyczne')).toBeInTheDocument();
    expect(screen.getByText('FRT / LVRT / HVRT')).toBeInTheDocument();
    expect(screen.getByText('PV grid-following typowy (NC RfG: k=2, t_resp=20ms)')).toBeInTheDocument();
    expect(screen.getByText('Obliczenia i uzasadnienie')).toBeInTheDocument();
    expect(screen.getAllByText('Falownik PV 0.5 MW / 0.4 kV nN').length).toBeGreaterThan(0);
    expect(screen.getByText('Stacja PV ST-001')).toBeInTheDocument();
    expect(screen.getByText('TR 15/0,4 kV 630 kVA Dyn11 · 15/0.4 kV · 0.63 MVA Dyn11')).toBeInTheDocument();
    expect(screen.getByText('Elektrometal e2TANGO-400')).toBeInTheDocument();
    expect(screen.getByText('wyłącznik nN źródła PV')).toBeInTheDocument();
    expect(screen.getByText('falownik PV i kabel nN do PCC')).toBeInTheDocument();
    expect(screen.getByText('nadprądowe, ziemnozwarciowe i koordynacja z wyłącznikiem głównym nN')).toBeInTheDocument();
    expect(screen.queryByText('pv-1')).not.toBeInTheDocument();
    expect(screen.queryByText('conv-pv-nn-0p5mw-0p4kv')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hash semantyczny/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-pv-inverter-config'));
    expect(openRouteSurface).toHaveBeenCalledWith(
      'E-21',
      expect.objectContaining({
        entityRef: 'pv-1',
        entityType: 'pv_source',
        titlePl: 'Konfiguracja falownika PV',
      }),
    );
  });

  it('również zwykłe kliknięcie generatora otwiera tę samą kartę projektową', () => {
    mockSelectedElements = [{
      id: 'pv-1',
      type: 'PVInverter',
      name: 'Falownik PV 0.5 MW / 0.4 kV nN',
    }];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Elektrometal e2TANGO-400')).toBeInTheDocument();
    expect(screen.getByText('wyłącznik nN źródła PV')).toBeInTheDocument();
    // 2026-07-17: podtytuł nagłówka = rola układu + REALNY wariant
    // przyłączenia z ENM (fixture: connection_variant='nn_side' →
    // „Po stronie nN stacji"), nie dawny hardkod „PV za transformatorem
    // SN/nN" (kłamał dla ról nie-PV i wariantów innych niż blokowy).
    expect(screen.getAllByText('Po stronie nN stacji', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText('pv-1')).not.toBeInTheDocument();
    expect(screen.queryByText('conv-pv-nn-0p5mw-0p4kv')).not.toBeInTheDocument();
  });
  it('dla klikalnego symbolu falownika bez wpisu ENM pokazuje pelny zakres karty bez falszywych wynikow', () => {
    const originalGenerators = snapshot.generators;
    snapshot.generators = [];
    mockSelectedElements = [{
      id: 'stn/st-001/nn_source/pv_inverter',
      type: 'PVInverter',
      name: 'Falownik PV 0.5 MW / 0.4 kV nN',
      semanticHash: 'source:pv',
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    }];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Falownik z katalogu')).toBeInTheDocument();
    expect(screen.getByText(/Punkt.*tor mocy/)).toBeInTheDocument();
    expect(screen.getByText('NC RfG i regulacja')).toBeInTheDocument();
    expect(screen.getByText('FRT / LVRT / HVRT')).toBeInTheDocument();
    expect(screen.getByText('Obliczenia i uzasadnienie')).toBeInTheDocument();
    expect(screen.getByText('Zabezpieczenia falownika i strony nN')).toBeInTheDocument();
    expect(screen.getAllByText('do konfiguracji').length).toBeGreaterThan(4);
    expect(document.body.textContent).not.toMatch(/(?:brak danych|do konfiguracji)(?:kW|kV|pu|MW|Mvar|A|kA)/);
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();

    snapshot.generators = originalGenerators;
  });
});
