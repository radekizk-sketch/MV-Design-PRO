import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';

const openOperationForm = vi.fn();

const snapshot = {
  buses: [
    {
      ref_id: 'bus-nn-1',
      name: 'Szyna nN 1',
      voltage_kv: 0.4,
    },
    {
      ref_id: 'bus-sn-1',
      name: 'Szyna SN 1',
      voltage_kv: 15,
    },
  ],
  branches: [
    {
      ref_id: 'seg-1',
      name: 'Segment testowy',
      type: 'cable',
      status: 'active',
      from_bus_ref: 'bus-sn-1',
      to_bus_ref: 'bus-nn-1',
      length_km: 0.7,
      r_ohm_per_km: 0.12,
      x_ohm_per_km: 0.08,
      rating: { in_a: 240 },
      catalog_ref: 'cat:cable',
    },
  ],
  branch_points: [],
  transformers: [],
  sources: [],
  substation: [],
  substations: [
    {
      id: 'st-1',
      ref_id: 'st-1',
      name: 'Stacja 1',
      station_type: 'mv_lv',
      bus_refs: ['bus-nn-1', 'bus-sn-1'],
      transformer_refs: [],
    },
  ],
  bays: [
    {
      id: 'bay-1',
      ref_id: 'bay_ref_1',
      name: 'Pole liniowe 1',
      bay_role: 'OUT',
      substation_ref: 'st-1',
      bus_ref: 'bus-sn-1',
      equipment_refs: [],
    },
  ],
  generators: [
    {
      ref_id: 'gen-1',
      name: 'Farma wiatrowa 1',
      gen_type: 'wind_inverter',
      connection_variant: 'nn_side',
      station_ref: 'st-1',
      bus_ref: 'bus-nn-1',
      p_mw: 1.2,
      q_mvar: 0.1,
      catalog_ref: null,
    },
  ],
  loads: [],
};

let mockSelectedElements: Array<{
  id: string;
  type: string;
  name: string;
  semanticHash?: string;
  semanticElementKind?: string;
  semanticEngineeringRole?: string;
}> = [];
let mockReadinessIssues: Array<{
  severity: string;
  element_ref: string | null;
  element_refs: string[];
  message_pl: string;
}> = [];
let mockFieldReadModel = {
  data: { fields: [] as unknown[] },
  itemsByBayRef: new Map<string, unknown>(),
  itemsByBayId: new Map<string, unknown>(),
  isLoading: false,
  error: null as string | null,
};

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm }) => unknown) =>
    selector({ openOperationForm }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({
      selectedElements: mockSelectedElements,
    }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
    }),
}));

vi.mock('../../engineering-readiness/readinessLiveStore', () => ({
  useReadinessLiveStore: (selector: (state: { issues: typeof mockReadinessIssues }) => unknown) =>
    selector({
      issues: mockReadinessIssues,
    }),
}));

vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => mockFieldReadModel,
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

describe('InspectorEngineeringView', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    mockSelectedElements = [{ id: 'gen-1', type: 'Generator', name: 'Farma wiatrowa 1' }];
    mockReadinessIssues = [
      {
        severity: 'BLOCKER',
        element_ref: 'gen-1',
        element_refs: [],
        message_pl: 'Wymagany wariant katalogowy układu PV/BESS/FW',
      },
    ];
    mockFieldReadModel = {
      data: { fields: [] },
      itemsByBayRef: new Map(),
      itemsByBayId: new Map(),
      isLoading: false,
      error: null,
    };
  });

  it('pokazuje kanoniczne etykiety dla stacji i układu PV/BESS/FW', () => {
    render(<InspectorEngineeringView />);

    expect(
      screen.getAllByText((content) => content.includes('Układ') && content.includes('wiatrowej')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Po stronie nN stacji')).toBeInTheDocument();
    expect(
      screen.getByText(
        (content) => content.startsWith('Oznaczenie') && content.includes('układu'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Wymagany wariant katalogowy układu PV/BESS/FW')).toBeInTheDocument();
    expect(screen.queryByText('mv_lv')).not.toBeInTheDocument();
    expect(screen.queryByText('nn_side')).not.toBeInTheDocument();
  });

  it('pokazuje w prawym panelu właściwości klikniętego aparatu pola SN', () => {
    mockSelectedElements = [{
      id: 'bay_ref_1#breaker',
      type: 'Switch',
      name: 'Wyłącznik SN — Pole liniowe 1',
    }];
    mockReadinessIssues = [];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Parametry aparatu')).toBeInTheDocument();
    expect(screen.getByText('Wyłącznik SN')).toBeInTheDocument();
    expect(screen.getByText('Łączenie robocze i zwarciowe pola')).toBeInTheDocument();
    expect(screen.getByText('Pole liniowe 1')).toBeInTheDocument();
    expect(screen.queryByText('Zaznacz element na SLD')).not.toBeInTheDocument();
  });

  it('udostępnia wyprowadzenie ciągu tylko z głowicy odpływowej pola SN', () => {
    mockSelectedElements = [{
      id: 'bay_ref_1#cable_head',
      type: 'Switch',
      name: 'Głowica kablowa / port odpływowy — Pole liniowe 1',
    }];
    mockReadinessIssues = [];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Głowica kablowa / port odpływowy')).toBeInTheDocument();
    expect(screen.getByText('Wyprowadzenie sieci SN')).toBeInTheDocument();
    expect(screen.getByText('Wyprowadź ciąg główny z głowicy')).toBeInTheDocument();
    expect(screen.getByText('stacja transformatorowa, ZKSN, słup rozgałęźny albo kolejny odcinek ciągu')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Wyprowadź ciąg główny z głowicy'));

    expect(openOperationForm).toHaveBeenCalledWith(
      'continue_trunk_segment_sn',
      expect.objectContaining({
        field_ref: 'bay_ref_1',
        bay_ref: 'bay_ref_1',
        terminal_name: expect.stringContaining('Głowica kablowa'),
      }),
    );
  });

  it('wybiera akcje segmentu po semantyce selekcji zamiast po branch.type', () => {
    mockSelectedElements = [{
      id: 'seg-1',
      type: 'LineBranch',
      name: 'Segment testowy',
      semanticHash: 'semantic:v1',
      semanticElementKind: 'MV_OVERHEAD_SEGMENT',
      semanticEngineeringRole: 'MV_OVERHEAD_SEGMENT',
    }];
    mockReadinessIssues = [];

    render(<InspectorEngineeringView />);

    expect(screen.getAllByText('Odcinek napowietrzny SN').length).toBeGreaterThan(0);
    expect(screen.queryByText('Kabel SN')).not.toBeInTheDocument();
    expect(screen.getByText('Wstaw słup rozgałęźny')).toBeInTheDocument();
    expect(screen.queryByText('Wstaw ZKSN')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Wstaw słup rozgałęźny'));

    expect(openOperationForm).toHaveBeenCalledWith(
      'insert_branch_pole_on_segment_sn',
      expect.objectContaining({
        segment_ref: 'seg-1',
        semantic_element_kind: 'MV_OVERHEAD_SEGMENT',
        semantic_engineering_role: 'MV_OVERHEAD_SEGMENT',
        semantic_hash: 'semantic:v1',
      }),
    );
  });

  it('opisuje zrodlo przeksztaltnikowe po roli semantycznej zamiast po generator.gen_type', () => {
    mockSelectedElements = [{
      id: 'gen-1',
      type: 'Generator',
      name: 'Farma wiatrowa 1',
      semanticHash: 'semantic:v2',
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    }];
    mockReadinessIssues = [];

    render(<InspectorEngineeringView />);

    expect(screen.getAllByText('Źródło przekształtnikowe PV').length).toBeGreaterThan(0);
    expect(screen.getByText('PV_INVERTER')).toBeInTheDocument();
    expect(screen.getByText('Moc czynna')).toBeInTheDocument();
    expect(
      screen.queryByText((content) => content.includes('FW') && content.includes('przekszta')),
    ).not.toBeInTheDocument();
  });

  it('renderuje pole SN z kanonicznego field read-modelu zamiast z lokalnych heurystyk', () => {
    mockSelectedElements = [{ id: 'bay-1', type: 'BaySN', name: 'Pole liniowe 1' }];
    mockReadinessIssues = [
      {
        severity: 'WARNING',
        element_ref: 'bay-1',
        element_refs: [],
        message_pl: 'Pole wymaga uzupelnienia danych katalogowych.',
      },
    ];
    mockFieldReadModel = {
      data: { fields: [] },
      itemsByBayId: new Map([
        ['bay-1', {
          bay_id: 'bay-1',
          bay_ref: 'bay_ref_1',
          bay_name: 'Pole liniowe 1',
          canonical_model: {
            schema_version: 'v10.bay.1',
            created_from: 'migracja',
            integrity_status: 'po_migracji',
            audit_trail_ref: 'bay:bay_ref_1',
            base_model: {
              bay_ref: 'bay_ref_1',
              bay_role: 'LINIA_OUT',
              specialization: 'BRAK',
              substation_ref: 'st-1',
              gpz_section_id: null,
              primary_devices: [
                {
                  device_ref: 'ds-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ds',
                  symbol_ref: 'symbol:ds',
                  kind: 'DS',
                  placement: 'UPSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'cb-1',
                  linked_ref: null,
                  catalog_ref: 'cat:cb',
                  symbol_ref: 'symbol:cb',
                  kind: 'CB',
                  placement: 'MIDSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'zamkniety',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'zamkniety',
                    current_position: 'zamkniety',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'ct-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ct',
                  symbol_ref: 'symbol:ct',
                  kind: 'CT',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
                {
                  device_ref: 'es-1',
                  linked_ref: null,
                  catalog_ref: 'cat:es',
                  symbol_ref: 'symbol:es',
                  kind: 'ES',
                  placement: 'GROUND_BRANCH',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'head-1',
                  linked_ref: null,
                  catalog_ref: 'cat:head',
                  symbol_ref: 'symbol:head',
                  kind: 'CABLE_HEAD',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
              ],
              measurement_chain: {
                chain_ref: 'measurement-chain:bay_ref_1',
                ct_refs: ['ct-1'],
                vt_refs: ['vt-1'],
                uses_3i0: true,
                uses_3u0: true,
                zero_sequence_current_source: 'suma_ct',
                zero_sequence_voltage_source: 'otwarty_trojkat_vt',
                topology: 'ct_vt_3u0',
                measurement_sets: [],
              },
              secondary_units: [],
              secondary_architecture: {
                type: 'zintegrowane_zabezpieczenie_i_sterownik',
                measurement_provider: 'zabezpieczenie',
              },
              protection_config: {
                unit_ref: 'prot-1',
                manufacturer: 'ABB',
                model: 'REF',
                functions: [
                  {
                    code: '51',
                    available: true,
                    enabled: true,
                    picked_up: false,
                    tripped: false,
                    blocked: false,
                    required_inputs: ['ct'],
                    optional_inputs: ['vt'],
                    missing_input_policy: 'ostrzezenie',
                    settings_ref: null,
                    settings: [],
                    execution_mode: 'wyzwolenie',
                    execution_device_ref: 'cb-1',
                    starts_spz: false,
                    blocks_reclose: false,
                    operator_ack_required_after_trip: false,
                  },
                ],
                measurement_inputs: {
                  uses_ct: true,
                  uses_vt: true,
                  uses_3i0: true,
                  uses_3u0: true,
                },
                automation_features: {
                  synchrocheck_enabled: false,
                  arc_protection_enabled: false,
                  breaker_failure_enabled: true,
                },
                spz: null,
                alarms: [],
                events: [],
                disturbance_recorder: {
                  available: false,
                  last_record_at: null,
                  records_count: 0,
                },
                trends: {
                  available: false,
                  channels: [],
                },
                settings_mode: 'reczne',
                settings_ref: null,
              },
              control_surface: {
                controllable_device_refs: ['ds-1', 'cb-1', 'es-1'],
                open_requires_confirmation: true,
                close_requires_confirmation: true,
                kas_available: true,
                local_remote_transfer_supported: true,
              },
              interlocks: {
                entries: [
                  {
                    code: 'INT-25',
                    active: true,
                    reason: 'Blokada ruchowa sprzegla',
                    blocking_device_refs: ['cb-1'],
                  },
                ],
              },
              source_endpoint: null,
            },
            runtime_state: {
              secondary_communication_status: 'degraded',
              last_good_update_at: '2026-04-17T07:00:00Z',
              control_availability: 'czesciowo_dostepne',
              measurement_availability: 'czesciowe',
              primary_device_states: {},
              active_alarms: [
                {
                  code: 'ALM-1',
                  active: true,
                  acknowledged: false,
                  severity: 'ostrzezenie',
                  timestamp: '2026-04-17T07:01:00Z',
                  message_pl: 'Brak pelnego toru potwierdzenia sterowania.',
                },
              ],
              pending_command: {
                command_ref: 'cmd-1',
                target_device_ref: 'cb-1',
                command: 'zamknij',
                state: 'przyjete',
                rejected_reason: null,
                created_at: '2026-04-17T07:02:00Z',
                finished_at: null,
              },
              energization_and_safety: {
                energized_from_bus_side: true,
                energized_from_feeder_side: false,
                grounded: false,
                visible_isolation_gap: true,
                safe_to_work: false,
                unsafe_reason_pl: 'Brak potwierdzonego stanu beznapieciowego.',
              },
            },
            scenario_state: null,
            project_results_ref: 'run-1',
          },
          project_results: {
            run_ref: 'run-1',
            result_state: 'pelny',
            result_message_pl: 'Dostepne sa wyniki zwarciowe i rozplywowe pola.',
            main_short_circuit_results_ref: 'sc-1',
            main_power_flow_results_ref: 'pf-1',
            source_contributions_sc: [{ source_ref: 'src-grid' }],
            source_contributions_pf: [{ source_ref: 'src-grid' }],
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
              closure_path_elements: [],
              transformer_contribution_ref: null,
              grounding_device_ref: null,
            },
            proof_binding: {
              proof_ref: 'proof:bay_ref_1:run-1',
              primary_result_refs: ['sc-1'],
              secondary_result_refs: ['pf-1'],
              source_contribution_refs: ['src-grid'],
              formula_refs: ['f-1'],
              input_data_refs: ['cb-1', 'ct-1', 'vt-1'],
            },
          },
        }],
      ]),
      itemsByBayRef: new Map([
        ['bay_ref_1', {
          bay_id: 'bay-1',
          bay_ref: 'bay_ref_1',
          bay_name: 'Pole liniowe 1',
          canonical_model: {
            schema_version: 'v10.bay.1',
            created_from: 'migracja',
            integrity_status: 'po_migracji',
            audit_trail_ref: 'bay:bay_ref_1',
            base_model: {
              bay_ref: 'bay_ref_1',
              bay_role: 'LINIA_OUT',
              specialization: 'BRAK',
              substation_ref: 'st-1',
              gpz_section_id: null,
              primary_devices: [
                {
                  device_ref: 'ds-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ds',
                  symbol_ref: 'symbol:ds',
                  kind: 'DS',
                  placement: 'UPSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'cb-1',
                  linked_ref: null,
                  catalog_ref: 'cat:cb',
                  symbol_ref: 'symbol:cb',
                  kind: 'CB',
                  placement: 'MIDSTREAM',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'zamkniety',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'zamkniety',
                    current_position: 'zamkniety',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'ct-1',
                  linked_ref: null,
                  catalog_ref: 'cat:ct',
                  symbol_ref: 'symbol:ct',
                  kind: 'CT',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
                {
                  device_ref: 'es-1',
                  linked_ref: null,
                  catalog_ref: 'cat:es',
                  symbol_ref: 'symbol:es',
                  kind: 'ES',
                  placement: 'GROUND_BRANCH',
                  section_side: null,
                  is_controllable: true,
                  render_variant: null,
                  switch_state: {
                    actual_state: 'otwarty',
                    commanded_state: null,
                    control_mode: 'zdalne',
                    armed_for_close: true,
                    armed_for_open: true,
                    communication_ok: true,
                    interlock_blocked: false,
                  },
                  operating_state: {
                    normal_position: 'otwarty',
                    current_position: 'otwarty',
                    discrepancy_alarm: false,
                  },
                },
                {
                  device_ref: 'head-1',
                  linked_ref: null,
                  catalog_ref: 'cat:head',
                  symbol_ref: 'symbol:head',
                  kind: 'CABLE_HEAD',
                  placement: 'DOWNSTREAM',
                  section_side: null,
                  is_controllable: false,
                  render_variant: null,
                  switch_state: null,
                  operating_state: null,
                },
              ],
              measurement_chain: {
                chain_ref: 'measurement-chain:bay_ref_1',
                ct_refs: ['ct-1'],
                vt_refs: ['vt-1'],
                uses_3i0: true,
                uses_3u0: true,
                zero_sequence_current_source: 'suma_ct',
                zero_sequence_voltage_source: 'otwarty_trojkat_vt',
                topology: 'ct_vt_3u0',
                measurement_sets: [],
              },
              secondary_units: [],
              secondary_architecture: {
                type: 'zintegrowane_zabezpieczenie_i_sterownik',
                measurement_provider: 'zabezpieczenie',
              },
              protection_config: {
                unit_ref: 'prot-1',
                manufacturer: 'ABB',
                model: 'REF',
                functions: [
                  {
                    code: '51',
                    available: true,
                    enabled: true,
                    picked_up: false,
                    tripped: false,
                    blocked: false,
                    required_inputs: ['ct'],
                    optional_inputs: ['vt'],
                    missing_input_policy: 'ostrzezenie',
                    settings_ref: null,
                    settings: [],
                    execution_mode: 'wyzwolenie',
                    execution_device_ref: 'cb-1',
                    starts_spz: false,
                    blocks_reclose: false,
                    operator_ack_required_after_trip: false,
                  },
                ],
                measurement_inputs: {
                  uses_ct: true,
                  uses_vt: true,
                  uses_3i0: true,
                  uses_3u0: true,
                },
                automation_features: {
                  synchrocheck_enabled: false,
                  arc_protection_enabled: false,
                  breaker_failure_enabled: true,
                },
                spz: null,
                alarms: [],
                events: [],
                disturbance_recorder: {
                  available: false,
                  last_record_at: null,
                  records_count: 0,
                },
                trends: {
                  available: false,
                  channels: [],
                },
                settings_mode: 'reczne',
                settings_ref: null,
              },
              control_surface: {
                controllable_device_refs: ['ds-1', 'cb-1', 'es-1'],
                open_requires_confirmation: true,
                close_requires_confirmation: true,
                kas_available: true,
                local_remote_transfer_supported: true,
              },
              interlocks: {
                entries: [
                  {
                    code: 'INT-25',
                    active: true,
                    reason: 'Blokada ruchowa sprzegla',
                    blocking_device_refs: ['cb-1'],
                  },
                ],
              },
              source_endpoint: null,
            },
            runtime_state: {
              secondary_communication_status: 'degraded',
              last_good_update_at: '2026-04-17T07:00:00Z',
              control_availability: 'czesciowo_dostepne',
              measurement_availability: 'czesciowe',
              primary_device_states: {},
              active_alarms: [
                {
                  code: 'ALM-1',
                  active: true,
                  acknowledged: false,
                  severity: 'ostrzezenie',
                  timestamp: '2026-04-17T07:01:00Z',
                  message_pl: 'Brak pelnego toru potwierdzenia sterowania.',
                },
              ],
              pending_command: {
                command_ref: 'cmd-1',
                target_device_ref: 'cb-1',
                command: 'zamknij',
                state: 'przyjete',
                rejected_reason: null,
                created_at: '2026-04-17T07:02:00Z',
                finished_at: null,
              },
              energization_and_safety: {
                energized_from_bus_side: true,
                energized_from_feeder_side: false,
                grounded: false,
                visible_isolation_gap: true,
                safe_to_work: false,
                unsafe_reason_pl: 'Brak potwierdzonego stanu beznapieciowego.',
              },
            },
            scenario_state: null,
            project_results_ref: 'run-1',
          },
          project_results: {
            run_ref: 'run-1',
            result_state: 'pelny',
            result_message_pl: 'Dostepne sa wyniki zwarciowe i rozplywowe pola.',
            main_short_circuit_results_ref: 'sc-1',
            main_power_flow_results_ref: 'pf-1',
            source_contributions_sc: [{ source_ref: 'src-grid' }],
            source_contributions_pf: [{ source_ref: 'src-grid' }],
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
              closure_path_elements: [],
              transformer_contribution_ref: null,
              grounding_device_ref: null,
            },
            proof_binding: {
              proof_ref: 'proof:bay_ref_1:run-1',
              primary_result_refs: ['sc-1'],
              secondary_result_refs: ['pf-1'],
              source_contribution_refs: ['src-grid'],
              formula_refs: ['f-1'],
              input_data_refs: ['cb-1', 'ct-1', 'vt-1'],
            },
          },
        }],
      ]),
      itemsByBayId: new Map(),
      isLoading: false,
      error: null,
    };

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Rola kanoniczna')).toBeInTheDocument();
    expect(screen.getAllByText('Pole liniowe wyjściowe').length).toBeGreaterThan(0);
    expect(screen.getByText('Stan ruchowy pola')).toBeInTheDocument();
    expect(screen.getByText('Łączność ograniczona')).toBeInTheDocument();
    expect(screen.getByText('Tor pomiarowy')).toBeInTheDocument();
    expect(screen.getByText('Źródło 3I0')).toBeInTheDocument();
    expect(screen.getByText('Sterowanie i blokady')).toBeInTheDocument();
    expect(screen.getByText('Wyniki projektowe pola')).toBeInTheDocument();
    expect(screen.getByText('Wkłady źródeł w zwarciu')).toBeInTheDocument();
    expect(screen.getByText('Wywód pola')).toBeInTheDocument();
    expect(screen.getByText('Schemat Kanoniczny')).toBeInTheDocument();
    expect(screen.getByTestId('bay-svg-renderer')).toBeInTheDocument();
  });

  it('pokazuje brak kontraktu pola zamiast skladac pole z legacy snapshotu, gdy read-model nie ma wpisu', () => {
    mockSelectedElements = [{ id: 'bay-1', type: 'BaySN', name: 'Pole liniowe 1' }];
    mockReadinessIssues = [];
    mockFieldReadModel = {
      data: { fields: [] },
      itemsByBayRef: new Map(),
      itemsByBayId: new Map(),
      isLoading: false,
      error: null,
    };

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Kontrakt pola')).toBeInTheDocument();
    expect(
      screen.getByText('Brak kanonicznego modelu pola dla wybranego elementu.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aparaty pierwotne')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bay-svg-renderer')).not.toBeInTheDocument();
    expect(screen.queryByText('equipment_refs')).not.toBeInTheDocument();
  });
});
