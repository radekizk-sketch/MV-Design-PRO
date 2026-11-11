import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
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
        // Kształt tabliczki toru stacyjnego (`_materialize_nn_source` +
        // `_build_converter_materialized_params`): nazwa i producent typu NIE są w tabliczce —
        // karta bierze je z katalogu przekształtników po `catalog_ref`. Zamiar ochrony
        // backend zapisuje i w tabliczce, i w `meta`.
        catalog_item_id: 'pv_inv_huawei_185',
        un_kv: 0.4,
        protection_intent: {
          breaker_role: 'wyłącznik nN źródła PV',
          device_catalog_ref: 'EM_ETANGO_400_V0',
          device_label: 'Elektrometal e2TANGO-400',
          protected_object: 'falownik PV i kabel nN do PCC',
          analysis_scope: 'nadprądowe, ziemnozwarciowe i koordynacja z wyłącznikiem głównym nN',
        },
        // Karta FAB-L: `dynamic_model_ref` jest dziś JEDYNYM sposobem powiązania
        // modelu dynamicznego (auto-selekcja „po rodzaju urządzenia" zniesiona —
        // `DER_DYNAMIC_MODEL_CATALOG`/`getDynamicModelForDevice` skasowane) —
        // fikstura musi go nieść wprost, tak jak realny `set_der_catalog_bindings`.
        dynamic_model_ref: 'default_pv_gfl',
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

// Inspektor czyta selekcję przez indeks pakietu, panel z kanwy (karta techniczna, kontekst
// aparatu) — wprost ze sklepu; obie ścieżki widzą TĘ SAMĄ selekcję.
vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

vi.mock('../../selection/store', () => ({
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

// Katalogi karty technicznej (`inspektor-elementu/katalogiKarty.ts`) — pobrania zastąpione
// odpowiedziami w kształcie kontraktu backendu: przekształtnik po `catalog_ref` (nazwa,
// producent), profil operatora NC RfG (zakres Q, cos φ, obwiednie LVRT/HVRT), charakterystyka
// P(f) i profil modelu dynamicznego 1:1 z realnym `default_pv_gfl`
// (`network_model/catalog/der_dynamic/defaults.py`). Formatowanie etykiet zostaje prawdziwe.
vi.mock('../../catalog/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../catalog/api')>()),
  fetchMvApparatusTypes: () => Promise.resolve([]),
  fetchTransformerTypes: () => Promise.resolve([]),
  fetchDerConverterTypes: () =>
    Promise.resolve([{ id: 'pv_inv_huawei_185', name: 'SUN2000-185KTL', manufacturer: 'Huawei', kind: 'PV' }]),
  fetchSourceSystemTypes: () => Promise.resolve([]),
  fetchSwitchgearFamilies: () => Promise.resolve([]),
  fetchCompleteBayTemplates: () => Promise.resolve([]),
}));

vi.mock('../station-der/audit2-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../station-der/audit2-api')>()),
  fetchAudit2CatalogSnapshot: () =>
    Promise.resolve({ pf_curves: [{ id: 'pf_pse_2024', label_pl: 'Charakterystyka P(f) PSE 2024' }] }),
}));

vi.mock('../station-der/derRemoteCatalogs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../station-der/derRemoteCatalogs')>();
  return {
    ...actual,
    fetchNcRfgOperators: () => Promise.resolve([{
      operator_id: 'pse',
      operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
      last_revision: '2024-Q4',
      reactive_power: {
        q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [],
      },
      ride_through: {
        lvrt: [{ time_s: 0, voltage_pu: 0.05 }, { time_s: 0.15, voltage_pu: 0.05 }],
        hvrt: [{ time_s: 0, voltage_pu: 1.3 }],
      },
    }]),
    fetchDerDynamicProfiles: () => Promise.resolve([{
      profile_id: 'default_pv_gfl',
      profile_name_pl: 'Domyślny PV grid-following (IEEE 1547 / NC RfG kat. B)',
      der_kind: 'PV',
      control_mode: 'grid_following',
      tp_s: 0.05,
      tq_s: 0.05,
      p_f_droop_pu: 0.04,
      p_f_dead_band_hz: 0.2,
      q_u_droop_pu: 0.1,
      q_u_dead_band_pu: 0.02,
      i_max_pu: 1.2,
      v_min_continuous_pu: 0.85,
      v_max_continuous_pu: 1.1,
      frt_response_time_ms: 60.0,
      iq_max_during_fault_pu: 1.0,
      iq_priority_during_fault: true,
      p_recovery_rate_pu_per_s: 0.8,
      p_recovery_delay_ms: 100.0,
      virtual_inertia_h_s: null,
      proweniencja: {
        zrodlo: 'profil_typowy_normy',
        odniesienie: 'IEEE 1547-2018 §5-8; Rozporzadzenie (UE) 2016/631 (NC RfG) art. 13-21',
        data: null,
      },
    }]),
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

  // Źródło z wpisem w modelu ma kartę techniczną panelu z kanwy (K6, `kartaZrodla`) — ona
  // jest JEDYNYM opisem danych obiektu w inspektorze. Dane dawnych sekcji widoku (typ
  // i producent przekształtnika, zgodność NC RfG, obwiednie FRT, model dynamiczny, zamiar
  // zabezpieczenia) są wierszami tej karty — z pól modelu i katalogów, bez identyfikatorów.
  it('pokazuje kartę źródła z typem przekształtnika, zgodnością NC RfG/FRT i zabezpieczeniem — bez surowych identyfikatorów', async () => {
    const { container } = render(<InspectorEngineeringView />);

    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'zrodlo');
    expect(screen.getByTestId('inspektor-karta-wartosc-nazwa')).toHaveTextContent('Falownik PV 0.5 MW / 0.4 kV nN');
    expect(screen.getByTestId('inspektor-karta-wartosc-stacja')).toHaveTextContent('Stacja PV ST-001');
    expect(screen.getByTestId('inspektor-karta-wartosc-moc')).toHaveTextContent('0,5 MW');
    // Katalogi przychodzą asynchronicznie — wiersze z katalogu po odpowiedzi.
    expect(await screen.findByText('SUN2000-185KTL')).toBeInTheDocument();
    expect(screen.getByTestId('inspektor-karta-wartosc-producent')).toHaveTextContent('Huawei');
    expect(screen.getByTestId('inspektor-karta-wartosc-profil_ncrfg')).toHaveTextContent('PSE — Polskie Sieci Elektroenergetyczne');
    expect(screen.getByTestId('inspektor-karta-wartosc-zakres_q')).toHaveTextContent('od -33 % do 33 % Pₙ');
    expect(screen.getByTestId('inspektor-karta-wartosc-cos_phi_min')).toHaveTextContent('0,95');
    expect(screen.getByTestId('inspektor-karta-wartosc-krzywa_pf')).toHaveTextContent('Charakterystyka P(f) PSE 2024');
    expect(screen.getByTestId('inspektor-karta-wartosc-lvrt')).toHaveTextContent('liczba punktów obwiedni: 2');
    expect(screen.getByTestId('inspektor-karta-wartosc-hvrt')).toHaveTextContent('liczba punktów obwiedni: 1');
    expect(screen.getByTestId('inspektor-karta-wartosc-model_dynamiczny')).toHaveTextContent('Domyślny PV grid-following');
    expect(screen.getByTestId('inspektor-karta-wartosc-zab_urzadzenie')).toHaveTextContent('Elektrometal e2TANGO-400');
    expect(screen.getByTestId('inspektor-karta-wartosc-zab_wylacznik')).toHaveTextContent('wyłącznik nN źródła PV');
    expect(screen.getByTestId('inspektor-karta-wartosc-zab_obiekt')).toHaveTextContent('falownik PV i kabel nN do PCC');
    expect(screen.getByTestId('inspektor-karta-wartosc-zab_zakres')).toHaveTextContent('koordynacja z wyłącznikiem głównym nN');
    expect(screen.getByText('Konfiguracja falownika PV')).toBeInTheDocument();
    expect(screen.getByTestId('open-pv-inverter-config')).toBeInTheDocument();
    const tekst = container.textContent ?? '';
    for (const kod of ['pv-1', 'pv_inv_huawei_185', 'pse', 'pf_pse_2024', 'default_pv_gfl', 'EM_ETANGO_400_V0']) {
      expect(within(screen.getByTestId('inspektor-karta')).queryByText(kod)).not.toBeInTheDocument();
    }
    expect(tekst).not.toContain('pv_inv_huawei_185');
    expect(tekst).not.toContain('pf_pse_2024');
    expect(tekst).not.toContain('default_pv_gfl');
    expect(screen.queryByText(/Hash semantyczny/i)).not.toBeInTheDocument();
    // Dawne sekcje widoku (druga ścieżka tych samych danych) nie wracają.
    expect(screen.queryByText('NC RfG i regulacja')).not.toBeInTheDocument();
    expect(screen.queryByText('Falownik z katalogu')).not.toBeInTheDocument();

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

  it('również zwykłe kliknięcie generatora otwiera tę samą kartę źródła', () => {
    mockSelectedElements = [{
      id: 'pv-1',
      type: 'PVInverter',
      name: 'Falownik PV 0.5 MW / 0.4 kV nN',
    }];

    const { container } = render(<InspectorEngineeringView />);

    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'zrodlo');
    expect(screen.getByTestId('inspektor-karta-wartosc-nazwa')).toHaveTextContent('Falownik PV 0.5 MW / 0.4 kV nN');
    // Wariant przyłączenia z ENM (fixture: connection_variant='nn_side'), nie hardkod.
    expect(screen.getByTestId('inspektor-karta-wartosc-wariant')).toHaveTextContent('po stronie nN stacji');
    expect(screen.getByTestId('open-pv-inverter-config')).toBeInTheDocument();
    expect(screen.queryByText('pv-1')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('conv-pv-nn-0p5mw-0p4kv');
  });
  // Wskazanie falownika bez wpisu w modelu (identyfikator spoza `generators`): dawniej widok
  // dopasowywał generator po podciągach identyfikatora albo rysował szablon sekcji
  // „do konfiguracji" dla obiektu, którego nie ma. Teraz: brak karty, brak sekcji, brak
  // operacji źródła — uczciwy stan pusty, żadnego cudzego generatora.
  it('wskazanie falownika bez wpisu ENM: bez atrapy sekcji, bez cudzego generatora i bez operacji źródła', () => {
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

    try {
      render(<InspectorEngineeringView />);

      expect(screen.queryByTestId('inspektor-karta')).not.toBeInTheDocument();
      expect(screen.queryByText('Falownik z katalogu')).not.toBeInTheDocument();
      expect(screen.queryByText('NC RfG i regulacja')).not.toBeInTheDocument();
      expect(screen.queryByText('do konfiguracji')).not.toBeInTheDocument();
      expect(screen.queryByTestId('open-pv-inverter-config')).not.toBeInTheDocument();
      expect(screen.getByText('Zaznacz element na SLD')).toBeInTheDocument();
    } finally {
      snapshot.generators = originalGenerators;
    }
  });

  it('wskazanie spoza modelu z identyfikatorem zawierającym ref stacji NIE dostaje generatora tej stacji', () => {
    mockSelectedElements = [{
      id: 'stn/st-001/nn_source/pv_inverter',
      type: 'PVInverter',
      name: 'Falownik PV',
    }];
    render(<InspectorEngineeringView />);
    expect(screen.queryByTestId('open-pv-inverter-config')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inspektor-karta')).not.toBeInTheDocument();
  });
});
