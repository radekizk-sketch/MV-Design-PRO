import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReadOnlyPanelRouter from '../ReadOnlyPanelRouter';

let selectedRunIdMock: string | null = 'run-1';
let activeInspectorPanelMock: {
  kind:
    | 'report'
    | 'history'
    | 'topology'
    | 'coordination'
    | 'field_measurements'
    | 'field_control'
    | 'field_protection'
    | 'field_source_contributions'
    | 'field_earth_fault'
    | 'field_work_safety'
    | 'field_compare';
  elementId: string;
  elementType: 'Source' | 'BaySN';
} = {
  kind: 'history',
  elementId: 'source-1',
  elementType: 'Source',
};

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: {
    activeProjectId: string;
    activeProjectName: string;
    activeCaseId: string;
    activeCaseName: string;
    setActiveMode: () => void;
  }) => unknown) => selector({
    activeProjectId: 'project-1',
    activeProjectName: 'Projekt testowy',
    activeCaseId: 'case-1',
    activeCaseName: 'Przypadek testowy',
    setActiveMode: () => undefined,
  }),
}));

vi.mock('../networkBuildStore', () => ({
  useActiveInspectorPanel: () => activeInspectorPanelMock,
  useNetworkBuildStore: (selector: (state: {
    closeInspectorPanel: () => void;
  }) => unknown) => selector({
    closeInspectorPanel: () => undefined,
  }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: {
    selectElement: () => void;
    centerSldOnElement: () => void;
  }) => unknown) => selector({
    selectElement: () => undefined,
    centerSldOnElement: () => undefined,
  }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: {
    snapshot: {
      bays: Array<{ id: string; ref_id: string; bus_ref: string }>;
      substations: Array<{ id: string; ref_id: string; station_type: string; bus_refs: string[]; transformer_refs: string[] }>;
      branches: [];
      buses: Array<{ id: string; ref_id: string; name: string; voltage_kv: number }>;
      transformers: [];
      sources: Array<{ id: string; ref_id: string; name: string; bus_ref: string; model: string }>;
      generators: [];
      loads: [];
      branch_points: [];
    } | null;
  }) => unknown) => selector({
    snapshot: {
      bays: [{
        id: 'bay-1',
        ref_id: 'bay-1',
        bus_ref: 'bus-1',
      }],
      substations: [{
        id: 'station-1',
        ref_id: 'station-1',
        station_type: 'przelotowa',
        bus_refs: ['bus-1'],
        transformer_refs: ['tr-1'],
      }],
      branches: [],
      buses: [{
        id: 'bus-1',
        ref_id: 'bus-1',
        name: 'Szyna 1',
        voltage_kv: 15,
      }],
      transformers: [],
      sources: [{
        id: 'source-1',
        ref_id: 'source-1',
        name: 'Zrodlo 1',
        bus_ref: 'bus-1',
        model: 'Thevenin',
      }],
      generators: [],
      loads: [],
      branch_points: [],
    },
  }),
}));

vi.mock('../../engineering-readiness/readinessLiveStore', () => ({
  useReadinessLiveStore: (selector: (state: {
    issues: [];
    status: 'WARN';
    ready: false;
    loading: boolean;
    error: null;
    refresh: () => Promise<void>;
  }) => unknown) => selector({
    issues: [],
    status: 'WARN',
    ready: false,
    loading: false,
    error: null,
    refresh: async () => undefined,
  }),
}));

vi.mock('../../results-inspector/store', () => ({
  useResultsInspectorStore: (selector: (state: {
    selectedRunId: string | null;
    resultsIndex: null;
    busResults: null;
    branchResults: null;
    shortCircuitResults: null;
    extendedTrace: null;
    isLoadingIndex: boolean;
    isLoadingBuses: boolean;
    isLoadingBranches: boolean;
    isLoadingShortCircuit: boolean;
    isLoadingTrace: boolean;
    selectRun: () => Promise<void>;
    loadBusResults: () => Promise<void>;
    loadBranchResults: () => Promise<void>;
    loadShortCircuitResults: () => Promise<void>;
    loadExtendedTrace: () => Promise<void>;
  }) => unknown) => selector({
    selectedRunId: selectedRunIdMock,
    resultsIndex: null,
    busResults: null,
    branchResults: null,
    shortCircuitResults: null,
    extendedTrace: null,
    isLoadingIndex: false,
    isLoadingBuses: false,
    isLoadingBranches: false,
    isLoadingShortCircuit: false,
    isLoadingTrace: false,
    selectRun: async () => undefined,
    loadBusResults: async () => undefined,
    loadBranchResults: async () => undefined,
    loadShortCircuitResults: async () => undefined,
    loadExtendedTrace: async () => undefined,
  }),
}));

vi.mock('../../proof', () => ({
  MathRenderer: () => null,
}));

vi.mock('../../proof/traceExportApi', () => ({
  downloadAnalysisTraceExport: async () => undefined,
}));

vi.mock('../../notifications/store', () => ({
  notify: () => undefined,
}));

vi.mock('../../results-inspector/ResultsExport', () => ({
  ResultsExport: () => <div data-testid="results-export" />,
}));

vi.mock('../../study-cases/runStore', () => ({
  useExecutionRunsStore: (selector: (state: {
    activeStudyCaseId: string;
    activeRunId: string;
    runs: Array<{ id: string }>;
    isLoadingRuns: boolean;
    setActiveStudyCaseId: () => void;
    setActiveRun: () => void;
  }) => unknown) => selector({
    activeStudyCaseId: 'case-1',
    activeRunId: 'run-1',
    runs: [{ id: 'run-1' }],
    isLoadingRuns: false,
    setActiveStudyCaseId: () => undefined,
    setActiveRun: () => undefined,
  }),
}));

vi.mock('../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: ({ selectedRunId }: { selectedRunId?: string | null }) => (
    <div data-testid="run-history-panel">{selectedRunId ?? 'none'}</div>
  ),
}));

vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: {
      fields: [{
        bay_id: 'bay-1',
        bay_ref: 'bay-1',
        bay_name: 'Pole 1',
        canonical_model: {
          schema_version: 'v10.bay.1',
          created_from: 'migracja',
          integrity_status: 'kompletny',
          base_model: {
            bay_ref: 'bay-1',
            bay_role: 'LINIA_OUT',
            specialization: 'BRAK',
            substation_ref: 'station-1',
            gpz_section_id: 'sekcja-a',
            primary_devices: [{
              device_ref: 'device-1',
              linked_ref: 'source-1',
              catalog_ref: 'cb-1',
              symbol_ref: 'symbol-1',
              kind: 'CB',
              placement: 'MIDSTREAM',
              section_side: null,
              is_controllable: true,
              render_variant: null,
              switch_state: null,
              operating_state: null,
            }],
            measurement_chain: {
              chain_ref: 'chain-1',
              ct_refs: ['ct-1'],
              vt_refs: ['vt-1'],
              uses_3i0: true,
              uses_3u0: true,
              zero_sequence_current_source: 'suma_ct',
              zero_sequence_voltage_source: 'otwarty_trojkat_vt',
              topology: 'ct_vt',
              measurement_sets: [],
            },
            secondary_units: [{
              unit_ref: 'sec-1',
              unit_kind: 'zabezpieczenie',
              shared_with_bay_refs: [],
            }],
            secondary_architecture: {
              type: 'zintegrowane_zabezpieczenie_i_sterownik',
              measurement_provider: 'zabezpieczenie',
            },
            protection_config: {
              unit_ref: 'relay-1',
              manufacturer: 'ABB',
              model: 'REF615',
              functions: [{
                code: '50',
                available: true,
                enabled: true,
                picked_up: false,
                tripped: false,
                blocked: false,
                required_inputs: [],
                optional_inputs: [],
                missing_input_policy: 'ostrzezenie',
                settings: [],
                execution_mode: 'tylko_alarm',
                execution_device_ref: null,
                starts_spz: false,
                blocks_reclose: false,
                operator_ack_required_after_trip: false,
              }],
              measurement_inputs: {},
              automation_features: {},
              alarms: [],
              events: [],
              disturbance_recorder: { available: false, last_record_at: null, records_count: 0 },
              trends: { available: false, channels: [] },
              settings_mode: 'automatyczne',
            },
            control_surface: {
              controllable_device_refs: [],
              open_requires_confirmation: false,
              close_requires_confirmation: false,
              kas_available: false,
              local_remote_transfer_supported: false,
            },
            interlocks: { entries: [] },
            source_endpoint: null,
          },
          runtime_state: {
            secondary_communication_status: 'ok',
            last_good_update_at: '2026-04-18T10:00:00Z',
            control_availability: 'dostepne',
            measurement_availability: 'dostepne',
            primary_device_states: {},
            active_alarms: [],
            pending_command: {
              command_ref: 'cmd-1',
              target_device_ref: 'device-1',
              command: 'zamknij',
              state: 'wykonane',
              rejected_reason: null,
              created_at: '2026-04-18T10:00:00Z',
              finished_at: '2026-04-18T10:00:03Z',
            },
            energization_and_safety: {
              energized_from_bus_side: true,
              energized_from_feeder_side: false,
              grounded: false,
              visible_isolation_gap: true,
              safe_to_work: false,
              unsafe_reason_pl: 'Pole nadal zasilone od strony szyn.',
            },
          },
          scenario_state: null,
          project_results_ref: 'run-1',
        },
        project_results: {
          run_ref: 'run-1',
          result_state: 'czesciowy',
          result_message_pl: 'Czesciowe wyniki pola.',
          main_short_circuit_results_ref: 'sc-run-1',
          main_power_flow_results_ref: 'pf-run-1',
          source_contributions_sc: [{
            source_ref: 'src-1',
            source_kind: 'GPZ',
            reference_point: 'bay-1',
            fault_type: '3F',
            ikss_ka: 12.4,
            ip_ka: 28.1,
            ith_ka: 11.2,
            percent_share: 100,
            zero_sequence_share_percent: 80,
            direction: 'do_pola',
          }],
          source_contributions_pf: [{
            source_ref: 'src-1',
            source_kind: 'GPZ',
            reference_point: 'bay-1',
            p_mw: 2.1,
            q_mvar: 0.4,
            s_mva: 2.2,
            i_a: 84,
            percent_share_p: 100,
            percent_share_q: 100,
            direction: 'do_odplywu',
          }],
          verification: {
            continuous_current_ok: true,
            thermal_withstand_ok: true,
            dynamic_withstand_ok: true,
            ct_ok: true,
            vt_ok: true,
            cable_head_ok: true,
            main_switch_ok: true,
            whole_power_path_ok: true,
          },
          earth_fault_path: {
            neutral_grounding_mode: 'rezystor',
            zero_sequence_current_source: 'suma_ct',
            zero_sequence_voltage_source: 'otwarty_trojkat_vt',
            closure_path_elements: ['ct-1', 'vt-1', 'uziemnik-1'],
            transformer_contribution_ref: 'tr-1',
            grounding_device_ref: 'uziemnik-1',
          },
          proof_binding: {
            proof_ref: 'proof-1',
            primary_result_refs: ['sc-run-1'],
            secondary_result_refs: ['pf-run-1'],
            source_contribution_refs: ['src-1'],
            formula_refs: ['f-1'],
            input_data_refs: ['bay-1', 'ct-1'],
          },
        },
      }],
    },
  }),
}));

vi.mock('../../protection/useProtectionReadModel', () => ({
  useProtectionReadModel: () => ({
    assignmentsByElement: new Map([[
      'bay-1',
      [{
        element_id: 'bay-1',
        element_type: 'BaySN',
        device_id: 'relay-1',
        device_name_pl: 'Przekaznik pola',
        device_kind: 'RELAY_OVERCURRENT',
        status: 'ACTIVE',
      }],
    ]]),
    diagnosticsByElement: new Map([[
      'bay-1',
      {
        element_id: 'bay-1',
        element_type: 'BaySN',
        results: [{
          severity: 'WARN',
          code: 'GEN_PARTIAL_ANALYSIS',
          message_pl: 'Analiza czesciowa',
          element_id: 'bay-1',
          element_type: 'BaySN',
        }],
        max_severity: 'WARN',
        error_count: 0,
        warn_count: 1,
        info_count: 0,
      },
    ]]),
    summariesByElement: new Map([[
      'bay-1',
      {
        element_id: 'bay-1',
        element_type: 'BaySN',
        element_name: 'Pole 1',
        verification_status: 'BRAK_DANYCH',
        verification_reason: 'Brak danych',
        has_complete_data: false,
      },
    ]]),
  }),
}));

describe('ReadOnlyPanelRouter', () => {
  beforeEach(() => {
    selectedRunIdMock = 'run-1';
    activeInspectorPanelMock = {
      kind: 'history',
      elementId: 'source-1',
      elementType: 'Source',
    };
  });

  it('renderuje panel historii uruchomien w trybie odczytowym', () => {
    render(<ReadOnlyPanelRouter />);

    expect(screen.getAllByText(/Historia/i)).toHaveLength(3);
    expect(screen.getByTestId('run-history-panel')).toHaveTextContent('run-1');
    expect(screen.getByRole('button', { name: /Przejd/ })).toBeInTheDocument();
  });

  it('blokuje otwarcie pelnych wynikow bez aktywnego uruchomienia', () => {
    selectedRunIdMock = null;

    render(<ReadOnlyPanelRouter />);

    expect(screen.getByRole('button', { name: /Przejd/ })).toBeDisabled();
  });

  it('renderuje topologie dla pola kanonicznego bez lokalnego adaptera', () => {
    activeInspectorPanelMock = {
      kind: 'topology',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };

    render(<ReadOnlyPanelRouter />);

    expect(screen.getByText(/Topologia elementu/i)).toBeInTheDocument();
    expect(screen.getByText(/Pole kanoniczne/i)).toBeInTheDocument();
    expect(screen.getByText(/Rola pola/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pokaz na schemacie/i })).toBeInTheDocument();
  });

  it('renderuje koordynacje zabezpieczen z read-model ochrony', () => {
    activeInspectorPanelMock = {
      kind: 'coordination',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };

    render(<ReadOnlyPanelRouter />);

    expect(screen.getByText(/Koordynacja zabezpieczen/i)).toBeInTheDocument();
    expect(screen.getByText(/Analiza czesciowa/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Powiazania wtorne/i })).toHaveLength(2);
  });

  it('renderuje osobny surface pomiarow pola z jawnymi zrodlami 3I0 i 3U0', () => {
    activeInspectorPanelMock = {
      kind: 'field_measurements',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };

    render(<ReadOnlyPanelRouter />);

    expect(screen.getAllByText(/Pomiary pola/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Zrodlo 3I0/i)).toBeInTheDocument();
    expect(screen.getByText(/suma_ct/i)).toBeInTheDocument();
    expect(screen.getByText(/otwarty_trojkat_vt/i)).toBeInTheDocument();
  });

  it('renderuje osobne surface’y wynikowe pola i bezpieczenstwa pracy', () => {
    activeInspectorPanelMock = {
      kind: 'field_source_contributions',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };

    const { rerender } = render(<ReadOnlyPanelRouter />);

    expect(screen.getAllByText(/Wklady zrodel/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/proof-1/i)).toBeInTheDocument();
    expect(screen.getAllByText(/src-1/i).length).toBeGreaterThan(0);

    activeInspectorPanelMock = {
      kind: 'field_work_safety',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };
    rerender(<ReadOnlyPanelRouter />);

    expect(screen.getAllByText(/Bezpieczenstwo do pracy/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pole nadal zasilone od strony szyn./i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Nie$/).length).toBeGreaterThan(0);
  });

  it('kanonizuje otwarcie wynikow i wywodu do publicznych aliasow z kontekstem runu', () => {
    window.location.hash = '#sld';
    activeInspectorPanelMock = {
      kind: 'field_source_contributions',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };

    const { rerender } = render(<ReadOnlyPanelRouter />);

    fireEvent.click(screen.getByRole('button', { name: /Otworz pelne wyniki/i }));
    expect(window.location.hash).toBe('#analysis?run=run-1');

    activeInspectorPanelMock = {
      kind: 'report',
      elementId: 'bay-1',
      elementType: 'BaySN',
    };
    rerender(<ReadOnlyPanelRouter />);

    fireEvent.click(screen.getByRole('button', { name: /Otwórz pełny wywód uruchomienia/i }));
    expect(window.location.hash).toBe('#proof?run=run-1');
  });
});
