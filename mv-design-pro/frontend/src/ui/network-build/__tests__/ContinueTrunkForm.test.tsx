import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../forms/ContinueTrunkForm';
import { buildOperationContext } from '../operationContext';

const snapshotState: {
  snapshot: any;
  executeDomainOperation: ReturnType<typeof vi.fn>;
} = {
  snapshot: null,
  executeDomainOperation: vi.fn(async () => undefined),
};

const closeOperationFormMock = vi.fn();
const activeOperationContextState: { value: Record<string, unknown> | undefined } = {
  value: undefined,
};

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) =>
    selector({ activeCaseId: 'case-1' }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: unknown;
      executeDomainOperation: () => Promise<void>;
    }) => unknown,
  ) => selector(snapshotState),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { closeOperationForm: typeof closeOperationFormMock }) => unknown,
  ) =>
    selector({
      closeOperationForm: closeOperationFormMock,
    }),
  useActiveOperationContext: () => activeOperationContextState.value,
}));

vi.mock('../../catalog/api', () => ({
  fetchCableTypes: vi.fn(async () => [
    {
      id: 'XRUHAKXS-3x120',
      name: 'XRUHAKXS 3x120',
      manufacturer: 'Katalog SN',
      voltage_rating_kv: 15,
      cross_section_mm2: 120,
      rated_current_a: 200,
    },
  ]),
  fetchLineTypes: vi.fn(async () => [
    {
      id: 'AFL-6-70',
      name: 'AFL-6 70',
      manufacturer: 'Katalog SN',
      voltage_rating_kv: 15,
      cross_section_mm2: 70,
      rated_current_a: 180,
    },
  ]),
  getCatalogErrorMessage: vi.fn(() => 'Nie udało się pobrać katalogu.'),
}));

describe('ContinueTrunkForm', () => {
  beforeEach(() => {
    activeOperationContextState.value = undefined;
    closeOperationFormMock.mockReset();
    snapshotState.executeDomainOperation.mockClear();
    snapshotState.snapshot = {
      substations: [
        {
          id: 'st-1',
          ref_id: 'st-1',
          name: 'Stacja 1',
          bus_refs: ['bus-sn-1'],
          transformer_refs: [],
        },
      ],
      bays: [
        {
          id: 'bay-out-1',
          ref_id: 'bay-out-1',
          substation_ref: 'st-1',
          bus_ref: 'bus-sn-1',
          bay_role: 'OUT',
          equipment_refs: [],
        },
      ],
      buses: [
        { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 },
      ],
      corridors: [
        { id: 'trunk-1', ref_id: 'trunk-1', ordered_segment_refs: ['seg-1', 'seg-2'] },
      ],
    };
  });

  it('renderuje kanoniczny kontekst kontynuacji magistrali', async () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bay-out-1',
      elementType: 'BaySN',
      snapshot: snapshotState.snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bay-out-1',
            port_id: 'bay-out-1:OUT',
            trunk_id: 'trunk-1',
            status: 'DOSTEPNY',
          },
        ],
      } as any,
    });

    activeOperationContextState.value = context;

    render(<ContinueTrunkForm />);

    expect(screen.getByDisplayValue('Magistrala SN 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Szyna SN 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('zacisk wyjściowy pola SN')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15 kV')).toBeInTheDocument();
    expect(await screen.findByTestId('catalog-picker-search')).toBeInTheDocument();
  });

  it('nie pokazuje kierunków ukośnych dla odcinka SN', async () => {
    activeOperationContextState.value = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bay-out-1',
      elementType: 'BaySN',
      snapshot: snapshotState.snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bay-out-1',
            port_id: 'bay-out-1:OUT',
            trunk_id: 'trunk-1',
            status: 'DOSTEPNY',
          },
        ],
      } as any,
    });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Północ (N)')).toBeInTheDocument();
    expect(screen.getByText('Wschód (E)')).toBeInTheDocument();
    expect(screen.getByText('Południe (S)')).toBeInTheDocument();
    expect(screen.getByText('Zachód (W)')).toBeInTheDocument();
    expect(screen.queryByText('Północny-wschód (NE)')).not.toBeInTheDocument();
    expect(screen.queryByText('Południowy-wschód (SE)')).not.toBeInTheDocument();
    expect(screen.queryByText('Południowy-zachód (SW)')).not.toBeInTheDocument();
    expect(screen.queryByText('Północny-zachód (NW)')).not.toBeInTheDocument();
  });

  it('blokuje zapis, gdy terminal magistrali nie został rozstrzygnięty', async () => {
    activeOperationContextState.value = {
      element_ref: 'source-gpz-1',
      element_type: 'Source',
    };

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Brak jawnego zacisku lub pola SN.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj odcinek' })).toBeDisabled();
    expect(await screen.findByTestId('catalog-picker-search')).toBeInTheDocument();
  });

  it('wysyła nowy odcinek przez kanoniczny from_terminal_id i opcjonalny trunk_id', async () => {
    const context = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'bay-out-1',
      elementType: 'BaySN',
      snapshot: snapshotState.snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bay-out-1',
            port_id: 'bay-out-1:OUT',
            trunk_id: 'trunk-1',
            status: 'DOSTEPNY',
          },
        ],
      } as any,
    });

    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });
    activeOperationContextState.value = context;

    render(<ContinueTrunkForm />);

    fireEvent.change(screen.getByPlaceholderText('np. 350'), { target: { value: '350' } });
    const catalogSearch = await screen.findByTestId('catalog-picker-search');
    fireEvent.change(catalogSearch, { target: { value: 'XRU' } });
    fireEvent.click(await screen.findByTestId('catalog-entry-XRUHAKXS-3x120'));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj odcinek' }));

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bay-out-1',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 350,
          }),
        }),
      );
    });

    const payload = snapshotState.executeDomainOperation.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('from_bus_ref');
    expect(closeOperationFormMock).toHaveBeenCalledTimes(1);
  });
});
