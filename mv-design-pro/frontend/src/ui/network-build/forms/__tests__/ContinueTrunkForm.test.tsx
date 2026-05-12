import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../ContinueTrunkForm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState = { activeCaseId: 'case-1' };
const snapshotState = {
  snapshot: {
    corridors: [],
    buses: [
      { id: 'bus-gpz-1', ref_id: 'bus-gpz-1', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
    ],
  },
  executeDomainOperation: executeDomainOperationMock,
};

const networkBuildState = {
  activeOperationForm: {
    context: {
      from_bus_ref: 'bus-gpz-1',
      terminal_id: 'bus-gpz-1',
      terminal_port_id: 'bay-out-1:OUT',
      segment_kind: 'KABEL_SN',
    },
  },
  closeOperationForm: closeFormMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: typeof snapshotState) => unknown) => selector(snapshotState),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: typeof networkBuildState) => unknown) =>
    selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../../../catalog/api', () => ({
  fetchCableTypes: vi.fn().mockResolvedValue([
    {
      id: 'XRUHAKXS-3x120',
      name: 'XRUHAKXS 3x120',
      manufacturer: 'Katalog SN',
      voltage_rating_kv: 15,
      cross_section_mm2: 120,
      rated_current_a: 240,
      r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.101,
      c_nf_per_km: 240,
      max_temperature_c: 90,
      insulation_type: 'XLPE',
      conductor_material: 'Al',
      standard: 'PN-HD 620',
    },
  ]),
  fetchLineTypes: vi.fn().mockResolvedValue([]),
  getCatalogErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Błąd katalogu',
}));

describe('ContinueTrunkForm', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  it('pozwala utworzyć pierwszy odcinek z głowicy pola SN bez ręcznego przepisywania katalogu', async () => {
    executeDomainOperationMock.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Wyprowadź odcinek z głowicy pola SN')).toBeInTheDocument();
    expect(screen.getByText('Nowy ciąg główny SN')).toBeInTheDocument();
    expect(screen.getAllByText('głowica odpływowa pola SN').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getAllByText('XRUHAKXS 3x120').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('0,253 Ω/km');
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('PN-HD 620');

    fireEvent.click(screen.getByTestId('length-preset-500'));
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz odcinek SN' }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          from_terminal_id: 'bus-gpz-1',
          segment: expect.objectContaining({
            dlugosc_m: 500,
          }),
        }),
      );
    });

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('trunk_id');
    expect(closeFormMock).toHaveBeenCalled();
  });
});
