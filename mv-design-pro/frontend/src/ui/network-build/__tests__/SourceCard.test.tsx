import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceCard } from '../cards/SourceCard';

const openOperationForm = vi.fn();
const openObjectCard = vi.fn();
const closeObjectCard = vi.fn();
let mockFieldReadModel = {
  data: {
    fields: [
      {
        bay_id: 'field-gpz-1',
        bay_ref: 'gpz_field_a',
        bay_name: 'Pole liniowe A',
        canonical_model: {
          schema_version: 'v10.bay.1',
          created_from: 'migracja',
          integrity_status: 'po_migracji',
          audit_trail_ref: 'bay:gpz_field_a',
          base_model: {
            bay_ref: 'gpz_field_a',
            bay_role: 'LINIA_OUT',
            specialization: 'BRAK',
            substation_ref: 'gpz-1',
            gpz_section_id: 'section-a',
            primary_devices: [],
            measurement_chain: null,
            secondary_units: [],
            secondary_architecture: {
              type: 'brak_urzadzenia_wtornego',
              measurement_provider: 'brak',
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
          runtime_state: null,
          scenario_state: null,
          project_results_ref: null,
        },
        project_results: null,
      },
    ],
  },
  isLoading: false,
};

const snapshot = {
  sources: [
    {
      ref_id: 'src-1',
      name: 'GPZ Konarzewo',
      bus_ref: 'bus-gpz-1',
      substation_ref: 'gpz-1',
      gpz_section_id: 'section-a',
      model: 'short_circuit_power',
      sk3_mva: 250,
      rx_ratio: 0.1,
    },
  ],
  substations: [
    {
      ref_id: 'gpz-1',
      name: 'GPZ Konarzewo',
      station_type: 'gpz',
      bus_refs: ['bus-gpz-1', 'bus-gpz-2'],
      gpz_sections: [
        { section_id: 'section-a', bus_ref: 'bus-gpz-1' },
        { section_id: 'section-b', bus_ref: 'bus-gpz-2' },
      ],
    },
  ],
  buses: [
    { ref_id: 'bus-gpz-1', name: 'Sekcja A', voltage_kv: 15, grounding: { type: 'rezystancyjne' } },
    { ref_id: 'bus-gpz-2', name: 'Sekcja B', voltage_kv: 15, grounding: { type: 'rezystancyjne' } },
  ],
  bays: [],
};

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      readiness: { blockers: [] },
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: {
      openOperationForm: typeof openOperationForm;
      openObjectCard: typeof openObjectCard;
      closeObjectCard: typeof closeObjectCard;
    }) => unknown,
  ) => selector({ openOperationForm, openObjectCard, closeObjectCard }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => mockFieldReadModel,
}));

describe('SourceCard', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    openObjectCard.mockReset();
    closeObjectCard.mockReset();
    mockFieldReadModel = {
      data: {
        fields: [
          {
            bay_id: 'field-gpz-1',
            bay_ref: 'gpz_field_a',
            bay_name: 'Pole liniowe A',
            canonical_model: {
              schema_version: 'v10.bay.1',
              created_from: 'migracja',
              integrity_status: 'po_migracji',
              audit_trail_ref: 'bay:gpz_field_a',
              base_model: {
                bay_ref: 'gpz_field_a',
                bay_role: 'LINIA_OUT',
                specialization: 'BRAK',
                substation_ref: 'gpz-1',
                gpz_section_id: 'section-a',
                primary_devices: [],
                measurement_chain: null,
                secondary_units: [],
                secondary_architecture: {
                  type: 'brak_urzadzenia_wtornego',
                  measurement_provider: 'brak',
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
              runtime_state: null,
              scenario_state: null,
              project_results_ref: null,
            },
            project_results: null,
          },
        ],
      },
      isLoading: false,
    };
  });

  it('otwiera pole GPZ z kanonicznego read-modelu zamiast wyprowadzac magistrale bezposrednio ze zrodla', () => {
    render(<SourceCard elementId="src-1" />);

    expect(screen.getByText('Pola GPZ')).toBeInTheDocument();
    expect(screen.getByText('Pole liniowe A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Otworz pole GPZ' }));

    expect(openObjectCard).toHaveBeenCalledWith({
      kind: 'bay',
      elementId: 'gpz_field_a',
    });
  });

  it('pokazuje brak aktywnego pola GPZ bez lokalnego fallbacku do legacy runtime source', () => {
    mockFieldReadModel = {
      data: { fields: [] },
      isLoading: false,
    };

    render(<SourceCard elementId="src-1" />);

    expect(screen.getByText('Pola GPZ')).toBeInTheDocument();
    expect(screen.getByText('Brak aktywnego pola GPZ w kanonicznym modelu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Otworz pole GPZ' })).not.toBeInTheDocument();
    expect(screen.queryByText('Wyprowadz magistrale')).not.toBeInTheDocument();
  });
});
