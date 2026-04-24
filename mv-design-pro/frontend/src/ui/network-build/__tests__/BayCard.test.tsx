import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BayCard } from '../cards/BayCard';

const closeObjectCard = vi.fn();
const openOperationForm = vi.fn();
const openInspectorPanel = vi.fn();

const snapshot = {
  bays: [
    {
      id: 'bay-1',
      ref_id: 'bay_ref_1',
      name: 'Pole IN',
      bay_role: 'IN',
      substation_ref: 'st-1',
      bus_ref: 'bus-1',
      equipment_refs: ['cb-1'],
      protection_ref: 'prot-1',
    },
  ],
  substations: [
    {
      id: 'st-1',
      name: 'Stacja 1',
      station_type: 'mv_lv',
    },
  ],
  buses: [
    {
      ref_id: 'bus-1',
      name: 'Szyna SN 1',
      voltage_kv: 15,
      grounding: { type: 'rezystancyjne' },
    },
  ],
  branches: [
    {
      ref_id: 'cb-1',
      name: 'Wylacznik pola IN',
      type: 'breaker',
      status: 'closed',
    },
  ],
};

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      readiness: { blockers: [] },
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: {
      openOperationForm: typeof openOperationForm;
      openInspectorPanel: typeof openInspectorPanel;
      closeObjectCard: typeof closeObjectCard;
    }) => unknown,
  ) => selector({ openOperationForm, openInspectorPanel, closeObjectCard }),
}));

vi.mock('../operationContext', () => ({
  buildOperationContext: vi.fn(() => ({ context: true })),
}));

vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    itemsByBayId: new Map([
      ['bay-1', {
        bay_id: 'bay-1',
        bay_ref: 'bay_ref_1',
        bay_name: 'Pole IN',
        canonical_model: {
          schema_version: 'v10.bay.1',
          created_from: 'migracja',
          integrity_status: 'po_migracji',
          audit_trail_ref: 'bay:bay_ref_1',
          base_model: {
            bay_ref: 'bay_ref_1',
            bay_role: 'LINIA_IN',
            specialization: 'BRAK',
            substation_ref: 'st-1',
            primary_devices: [
              {
                device_ref: 'cb-1',
                symbol_ref: 'symbol:cb',
                kind: 'CB',
                placement: 'MIDSTREAM',
                is_controllable: true,
                switch_state: {
                  actual_state: 'zamkniety',
                  control_mode: 'zdalne',
                  communication_ok: true,
                  interlock_blocked: false,
                },
              },
            ],
            measurement_chain: {
              chain_ref: 'measurement-chain:bay_ref_1',
              ct_refs: ['ct-1'],
              vt_refs: [],
              uses_3i0: true,
              uses_3u0: false,
              zero_sequence_current_source: 'suma_ct',
              zero_sequence_voltage_source: 'brak',
              topology: 'ct_only',
              measurement_sets: [],
            },
            secondary_units: [],
            secondary_architecture: {
              type: 'zintegrowane_zabezpieczenie_i_sterownik',
              measurement_provider: 'zabezpieczenie',
            },
            protection_config: {
              unit_ref: 'prot-1',
              model: 'overcurrent',
              functions: [
                {
                  code: '51',
                  available: true,
                  enabled: true,
                  picked_up: false,
                  tripped: false,
                  blocked: false,
                  required_inputs: ['ct'],
                  optional_inputs: [],
                  missing_input_policy: 'ostrzezenie',
                  settings: [],
                  execution_mode: 'wyzwolenie',
                  starts_spz: false,
                  blocks_reclose: false,
                  operator_ack_required_after_trip: false,
                },
              ],
              measurement_inputs: { uses_ct: true },
              automation_features: { synchrocheck_enabled: false },
              spz: null,
              alarms: [],
              events: [],
              disturbance_recorder: { available: false, records_count: 0 },
              trends: { available: false, channels: [] },
              settings_mode: 'reczne',
            },
            control_surface: {
              controllable_device_refs: ['cb-1'],
              open_requires_confirmation: false,
              close_requires_confirmation: true,
              kas_available: false,
              local_remote_transfer_supported: true,
            },
            interlocks: { entries: [] },
            source_endpoint: null,
          },
          runtime_state: {
            secondary_communication_status: 'degraded',
            last_good_update_at: '2024-01-01T00:00:00Z',
            control_availability: 'czesciowo_dostepne',
            measurement_availability: 'czesciowe',
            primary_device_states: {},
            active_alarms: [],
            pending_command: null,
            energization_and_safety: {
              energized_from_bus_side: true,
              energized_from_feeder_side: false,
              grounded: false,
              visible_isolation_gap: false,
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
          main_short_circuit_results_ref: 'run-1',
          main_power_flow_results_ref: null,
          source_contributions_sc: [{ source_ref: 'src-grid' }],
          source_contributions_pf: [],
          verification: { whole_power_path_ok: true },
          earth_fault_path: { neutral_grounding_mode: 'rezystor' },
          proof_binding: {
            proof_ref: 'proof:bay_ref_1:run-1',
            primary_result_refs: ['run-1'],
            secondary_result_refs: [],
            source_contribution_refs: ['sc:src-grid'],
            formula_refs: [],
            input_data_refs: ['cb-1', 'ct-1'],
          },
        },
      }],
    ]),
    itemsByBayRef: new Map([
      ['bay_ref_1', {
        bay_id: 'bay-1',
        bay_ref: 'bay_ref_1',
        bay_name: 'Pole IN',
        canonical_model: {
          schema_version: 'v10.bay.1',
          created_from: 'migracja',
          integrity_status: 'po_migracji',
          audit_trail_ref: 'bay:bay_ref_1',
          base_model: {
            bay_ref: 'bay_ref_1',
            bay_role: 'LINIA_IN',
            specialization: 'BRAK',
            substation_ref: 'st-1',
            primary_devices: [
              {
                device_ref: 'cb-1',
                symbol_ref: 'symbol:cb',
                kind: 'CB',
                placement: 'MIDSTREAM',
                is_controllable: true,
                switch_state: {
                  actual_state: 'zamkniety',
                  control_mode: 'zdalne',
                  communication_ok: true,
                  interlock_blocked: false,
                },
              },
            ],
            measurement_chain: {
              chain_ref: 'measurement-chain:bay_ref_1',
              ct_refs: ['ct-1'],
              vt_refs: [],
              uses_3i0: true,
              uses_3u0: false,
              zero_sequence_current_source: 'suma_ct',
              zero_sequence_voltage_source: 'brak',
              topology: 'ct_only',
              measurement_sets: [],
            },
            secondary_units: [],
            secondary_architecture: {
              type: 'zintegrowane_zabezpieczenie_i_sterownik',
              measurement_provider: 'zabezpieczenie',
            },
            protection_config: {
              unit_ref: 'prot-1',
              model: 'overcurrent',
              functions: [
                {
                  code: '51',
                  available: true,
                  enabled: true,
                  picked_up: false,
                  tripped: false,
                  blocked: false,
                  required_inputs: ['ct'],
                  optional_inputs: [],
                  missing_input_policy: 'ostrzezenie',
                  settings: [],
                  execution_mode: 'wyzwolenie',
                  starts_spz: false,
                  blocks_reclose: false,
                  operator_ack_required_after_trip: false,
                },
              ],
              measurement_inputs: { uses_ct: true },
              automation_features: { synchrocheck_enabled: false },
              spz: null,
              alarms: [],
              events: [],
              disturbance_recorder: { available: false, records_count: 0 },
              trends: { available: false, channels: [] },
              settings_mode: 'reczne',
            },
            control_surface: {
              controllable_device_refs: ['cb-1'],
              open_requires_confirmation: false,
              close_requires_confirmation: true,
              kas_available: false,
              local_remote_transfer_supported: true,
            },
            interlocks: { entries: [] },
            source_endpoint: null,
          },
          runtime_state: {
            secondary_communication_status: 'degraded',
            last_good_update_at: '2024-01-01T00:00:00Z',
            control_availability: 'czesciowo_dostepne',
            measurement_availability: 'czesciowe',
            primary_device_states: {},
            active_alarms: [],
            pending_command: null,
            energization_and_safety: {
              energized_from_bus_side: true,
              energized_from_feeder_side: false,
              grounded: false,
              visible_isolation_gap: false,
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
          main_short_circuit_results_ref: 'run-1',
          main_power_flow_results_ref: null,
          source_contributions_sc: [{ source_ref: 'src-grid' }],
          source_contributions_pf: [],
          verification: { whole_power_path_ok: true },
          earth_fault_path: { neutral_grounding_mode: 'rezystor' },
          proof_binding: {
            proof_ref: 'proof:bay_ref_1:run-1',
            primary_result_refs: ['run-1'],
            secondary_result_refs: [],
            source_contribution_refs: ['sc:src-grid'],
            formula_refs: [],
            input_data_refs: ['cb-1', 'ct-1'],
          },
        },
      }],
    ]),
    isLoading: false,
  }),
}));

describe('BayCard', () => {
  it('renderuje kanoniczny widok pola z field read-modelu', () => {
    render(<BayCard elementId="bay-1" />);

    expect(screen.getByTestId('object-card')).toBeInTheDocument();
    expect(screen.getByText('Rola kanoniczna')).toBeInTheDocument();
    expect(screen.getAllByText('Pole liniowe wejsciowe').length).toBeGreaterThan(0);
    expect(screen.getByText('Integralnosc modelu')).toBeInTheDocument();
    expect(screen.getByText('Po migracji')).toBeInTheDocument();
    expect(screen.getByText('Stan ruchowy pola')).toBeInTheDocument();
    expect(screen.getByText('Lacznosc ograniczona')).toBeInTheDocument();
    expect(screen.getByText('Aparaty pierwotne')).toBeInTheDocument();
    expect(screen.getByText('Wylacznik - zamkniety')).toBeInTheDocument();
    expect(screen.getByText('Wyniki projektowe pola')).toBeInTheDocument();
    expect(screen.getByText('run-1')).toBeInTheDocument();
    expect(screen.getByText('Pelny')).toBeInTheDocument();
    expect(screen.getByText('Uzasadnienie inżynierskie pola')).toBeInTheDocument();
    expect(screen.getByText('proof:bay_ref_1:run-1')).toBeInTheDocument();
    expect(screen.getByTestId('bay-svg-renderer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pomiary pola' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sterowanie polem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zabezpieczenie pola' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wkłady źródeł' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tor ziemnozwarciowy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bezpieczeństwo do pracy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Porównanie pól' })).toBeInTheDocument();
  });

  it('obsluguje otwarcie pola po bay_ref bez legacy bay.id jako aktywnej sciezki wejscia', () => {
    render(<BayCard elementId="bay_ref_1" />);

    expect(screen.getByTestId('object-card')).toBeInTheDocument();
    expect(screen.getAllByText('Pole IN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pole liniowe wejsciowe').length).toBeGreaterThan(0);
  });
});
