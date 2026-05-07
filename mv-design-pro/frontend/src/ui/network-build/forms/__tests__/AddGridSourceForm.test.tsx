import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddGridSourceForm } from '../AddGridSourceForm';

const closeFormMock = vi.fn();
const collapseSurfaceStackToMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const gridSourceEditorMock = vi.fn();
const appState = { activeCaseId: 'case-1' };
const networkBuildState = {
  activeOperationForm: {
    context: {
      source_name: 'GPZ Centrum',
      voltage_kv: 15,
      sk3_mva: 250,
      rx_ratio: 0.1,
      catalog_ref: 'ZRODLO_SN/GPZ-001',
      sections_count: 1,
    },
  },
  closeOperationForm: closeFormMock,
  collapseSurfaceStackTo: collapseSurfaceStackToMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: { executeDomainOperation: typeof executeDomainOperationMock }) => unknown,
  ) =>
    selector({
      executeDomainOperation: executeDomainOperationMock,
    }),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: {
      activeOperationForm: { context: Record<string, unknown> };
      closeOperationForm: typeof closeFormMock;
      collapseSurfaceStackTo: typeof collapseSurfaceStackToMock;
    }) => unknown,
  ) => selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../shared/GridSourceEditor', () => ({
  GridSourceEditor: ({
    onSubmit,
  }: {
    onSubmit: (data: Record<string, unknown>) => void;
  }) => {
    gridSourceEditorMock(onSubmit);
    return (
      <div>
        <button
          type="button"
          data-testid="grid-source-modal-submit-catalog"
          onClick={() =>
            onSubmit({
              source_name: 'GPZ Centrum',
              sn_voltage_kv: 15,
              sk3_mva: 250,
              rx_ratio: 0.1,
              short_circuit_mode: 'SHORT_CIRCUIT_POWER',
              r_ohm: null,
              x_ohm: null,
              notes: '',
              gpz_section_name: 'Sekcja A',
              gpz_line_field_name: 'Pole liniowe',
              gpz_line_field_apparatus_kind: 'BREAKER',
              gpz_line_field_apparatus_catalog_ref: 'sw-cb-abb-vd4-24kv-630a',
              sections_count: 3,
              line_fields_per_section: 12,
              zero_sequence_enabled: true,
              r0_ohm: 0.4,
              x0_ohm: 1.8,
              z0_z1_ratio: 1.3,
              grounding_type: 'resistor_grounded',
              grounding_r_ohm: 12,
              grounding_x_ohm: null,
              catalog_ref: 'ZRODLO_SN/GPZ-001',
              manual_mode: false,
            })
          }
        >
          Zatwierdź katalog
        </button>
        <button
          type="button"
          data-testid="grid-source-modal-submit-manual-power"
          onClick={() =>
            onSubmit({
              source_name: 'GPZ Ręczny',
              sn_voltage_kv: 15,
              sk3_mva: 250,
              rx_ratio: 0.15,
              short_circuit_mode: 'SHORT_CIRCUIT_POWER',
              r_ohm: null,
              x_ohm: null,
              notes: '',
              gpz_section_name: 'Sekcja B',
              gpz_line_field_name: 'Pole SN',
              gpz_line_field_apparatus_kind: 'BREAKER',
              gpz_line_field_apparatus_catalog_ref: 'sw-cb-abb-vd4-24kv-630a',
              sections_count: 2,
              line_fields_per_section: 2,
              zero_sequence_enabled: false,
              r0_ohm: null,
              x0_ohm: null,
              z0_z1_ratio: null,
              grounding_type: 'isolated',
              grounding_r_ohm: null,
              grounding_x_ohm: null,
              catalog_ref: null,
              manual_mode: true,
            })
          }
        >
          Zatwierdź ręcznie mocowo
        </button>
        <button
          type="button"
          data-testid="grid-source-modal-submit-manual-impedance"
          onClick={() =>
            onSubmit({
              source_name: 'GPZ Impedancyjny',
              sn_voltage_kv: 15,
              sk3_mva: null,
              rx_ratio: null,
              short_circuit_mode: 'IMPEDANCE',
              r_ohm: 0.55,
              x_ohm: 1.87,
              notes: '',
              gpz_section_name: 'Sekcja C',
              gpz_line_field_name: 'Pole zasilające',
              gpz_line_field_apparatus_kind: 'BREAKER',
              gpz_line_field_apparatus_catalog_ref: 'sw-cb-abb-vd4-24kv-630a',
              sections_count: 2,
              line_fields_per_section: 3,
              zero_sequence_enabled: true,
              r0_ohm: 0.9,
              x0_ohm: 2.4,
              z0_z1_ratio: 1.6,
              grounding_type: 'petersen_coil',
              grounding_r_ohm: null,
              grounding_x_ohm: 18,
              catalog_ref: null,
              manual_mode: true,
            })
          }
        >
          Zatwierdź ręcznie impedancyjnie
        </button>
      </div>
    );
  },
}));

describe('AddGridSourceForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    gridSourceEditorMock.mockReset();
    window.location.hash = '';
  });

  it('pokazuje błąd backendu i nie zamyka formularza po odpowiedzi błędu', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: '500 - Błąd serwera',
    });

    render(<AddGridSourceForm />);

    fireEvent.click(screen.getByTestId('grid-source-modal-submit-catalog'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_grid_source_sn',
        expect.objectContaining({
          source_name: 'GPZ Centrum',
          voltage_kv: 15,
          sections_count: 3,
          line_fields_per_section: 12,
          short_circuit_mode: 'SHORT_CIRCUIT_POWER',
          gpz_sections: [
            expect.objectContaining({
              order: 0,
              name: 'Sekcja A 1',
              line_field_name: 'Pole liniowe',
              line_fields_count: 12,
              line_field_names: expect.arrayContaining(['Pole liniowe 1', 'Pole liniowe 12']),
            }),
            expect.objectContaining({
              order: 1,
              name: 'Sekcja A 2',
              line_field_name: 'Pole liniowe',
              line_fields_count: 12,
              line_field_names: expect.arrayContaining(['Pole liniowe 1', 'Pole liniowe 12']),
            }),
            expect.objectContaining({
              order: 2,
              name: 'Sekcja A 3',
              line_field_name: 'Pole liniowe',
              line_fields_count: 12,
              line_field_names: expect.arrayContaining(['Pole liniowe 1', 'Pole liniowe 12']),
            }),
          ],
          zero_sequence: {
            enabled: true,
            r0_ohm: 0.4,
            x0_ohm: 1.8,
            z0_z1_ratio: 1.3,
          },
          grounding: {
            type: 'resistor_grounded',
            r_ohm: 12,
          },
          catalog_binding: expect.objectContaining({
            catalog_namespace: 'ZRODLO_SN',
            catalog_item_id: 'ZRODLO_SN/GPZ-001',
          }),
        }),
      );
    });

    expect(closeFormMock).not.toHaveBeenCalled();
    expect(screen.getByText('500 - Błąd serwera')).toBeInTheDocument();
  });

  it('wysyła ręczny równoważnik GPZ w trybie mocy zwarciowej', async () => {
    executeDomainOperationMock.mockResolvedValue({
      snapshot: { header: { name: 'case-1' } },
    });

    render(<AddGridSourceForm />);

    fireEvent.click(screen.getByTestId('grid-source-modal-submit-manual-power'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_grid_source_sn',
        expect.objectContaining({
          source_name: 'GPZ Ręczny',
          voltage_kv: 15,
          sections_count: 2,
          line_fields_per_section: 2,
          short_circuit_mode: 'SHORT_CIRCUIT_POWER',
          gpz_sections: [
            {
              order: 0,
              name: 'Sekcja B 1',
              line_field_name: 'Pole SN',
              line_fields_count: 2,
              line_field_names: ['Pole SN 1', 'Pole SN 2'],
            },
            {
              order: 1,
              name: 'Sekcja B 2',
              line_field_name: 'Pole SN',
              line_fields_count: 2,
              line_field_names: ['Pole SN 1', 'Pole SN 2'],
            },
          ],
          manual_equivalent: {
            voltage_kv: 15,
            short_circuit_mode: 'SHORT_CIRCUIT_POWER',
            sk3_mva: 250,
            rx_ratio: 0.15,
          },
          grounding: {
            type: 'isolated',
          },
          zero_sequence: {
            enabled: false,
          },
          source_mode: 'EKSPERCKI_RECZNY',
          parameter_source: 'MANUAL_EQUIVALENT',
          catalog_binding: undefined,
        }),
      );
    });

    expect(collapseSurfaceStackToMock).toHaveBeenCalledWith(null);
    expect(closeFormMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#sld');
  });

  it('wysyła ręczny równoważnik GPZ w trybie impedancyjnym', async () => {
    executeDomainOperationMock.mockResolvedValue({
      snapshot: { header: { name: 'case-1' } },
    });

    render(<AddGridSourceForm />);

    fireEvent.click(screen.getByTestId('grid-source-modal-submit-manual-impedance'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_grid_source_sn',
        expect.objectContaining({
          source_name: 'GPZ Impedancyjny',
          voltage_kv: 15,
          sections_count: 2,
          line_fields_per_section: 3,
          short_circuit_mode: 'IMPEDANCE',
          r_ohm: 0.55,
          x_ohm: 1.87,
          gpz_sections: [
            {
              order: 0,
              name: 'Sekcja C 1',
              line_field_name: 'Pole zasilające',
              line_fields_count: 3,
              line_field_names: ['Pole zasilające 1', 'Pole zasilające 2', 'Pole zasilające 3'],
            },
            {
              order: 1,
              name: 'Sekcja C 2',
              line_field_name: 'Pole zasilające',
              line_fields_count: 3,
              line_field_names: ['Pole zasilające 1', 'Pole zasilające 2', 'Pole zasilające 3'],
            },
          ],
          manual_equivalent: {
            voltage_kv: 15,
            short_circuit_mode: 'IMPEDANCE',
            r_ohm: 0.55,
            x_ohm: 1.87,
            r0_ohm: 0.9,
            x0_ohm: 2.4,
            z0_z1_ratio: 1.6,
          },
          grounding: {
            type: 'petersen_coil',
            x_ohm: 18,
          },
          zero_sequence: {
            enabled: true,
            r0_ohm: 0.9,
            x0_ohm: 2.4,
            z0_z1_ratio: 1.6,
          },
          source_mode: 'EKSPERCKI_RECZNY',
          parameter_source: 'MANUAL_EQUIVALENT',
          catalog_binding: undefined,
        }),
      );
    });

    expect(collapseSurfaceStackToMock).toHaveBeenCalledWith(null);
    expect(closeFormMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#sld');
  });
});
