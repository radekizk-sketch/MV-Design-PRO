import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartBranchForm } from '../forms/StartBranchForm';
import { buildOperationContext } from '../operationContext';

const snapshotState: {
  snapshot: any;
  executeDomainOperation: ReturnType<typeof vi.fn>;
} = {
  snapshot: null,
  executeDomainOperation: vi.fn(async () => undefined),
};

const closeOperationFormMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();
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

vi.mock('../../selection', () => ({
  useSelectionStore: (
    selector: (state: {
      selectElement: typeof selectElementMock;
      centerSldOnElement: typeof centerSldOnElementMock;
    }) => unknown,
  ) =>
    selector({
      selectElement: selectElementMock,
      centerSldOnElement: centerSldOnElementMock,
    }),
}));

function branchOperationResponse(segmentRef = 'seg-branch-1') {
  return {
    snapshot: {
      ...snapshotState.snapshot,
      branches: [
        ...(snapshotState.snapshot?.branches ?? []),
        { id: segmentRef, ref_id: segmentRef, type: 'cable' },
      ],
    },
    changes: { created_element_ids: [segmentRef] },
  };
}

describe('StartBranchForm', () => {
  beforeEach(() => {
    activeOperationContextState.value = undefined;
    closeOperationFormMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
    snapshotState.executeDomainOperation.mockClear();
    snapshotState.snapshot = {
      substations: [
        { id: 'st-1', ref_id: 'st-1', name: 'Stacja 1' },
      ],
      bays: [
        {
          id: 'bay-feeder-1',
          ref_id: 'bay-feeder-1',
          substation_ref: 'st-1',
          bus_ref: 'bus-sn-1',
          bay_role: 'FEEDER',
        },
      ],
      buses: [
        { id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 },
      ],
      branch_points: [],
    };
  });

  it('renderuje kanoniczny kontekst odgalezienia zbudowany przez operationContext', () => {
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: snapshotState.snapshot,
      logicalViews: null,
    });

    activeOperationContextState.value = context;

    render(<StartBranchForm />);

    expect(screen.getByDisplayValue('Stacja 1 - port boczny odgałęzienia')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('st-1.BRANCH')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Pole liniowe SN')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Stacja 1')).toBeInTheDocument();
  });

  it('blokuje zapis, gdy port boczny odgałęzienia nie został rozstrzygnięty', () => {
    activeOperationContextState.value = {
      element_ref: 'bus-sn-1',
      element_type: 'Bus',
    };

    render(<StartBranchForm />);

    expect(screen.getByText('Wskaż jawne źródło odgałęzienia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozpocznij odgałęzienie' })).toBeDisabled();
  });

  it('wysyla odgalezienie przez kanoniczny from_ref bez wtórnego zgadywania from_bus_ref', async () => {
    const context = buildOperationContext({
      canonicalOp: 'start_branch_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: snapshotState.snapshot,
      logicalViews: null,
    });

    snapshotState.executeDomainOperation.mockResolvedValue(branchOperationResponse());
    activeOperationContextState.value = context;

    render(<StartBranchForm />);

    fireEvent.change(screen.getByPlaceholderText('np. 0.85'), { target: { value: '0.85' } });
    fireEvent.change(screen.getByPlaceholderText('np. XRUHAKXS-3x95'), {
      target: { value: 'XRUHAKXS-3x95' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rozpocznij odgałęzienie' }));

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'start_branch_segment_sn',
        expect.objectContaining({
          from_ref: 'bay-feeder-1.BRANCH',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 850,
          }),
        }),
      );
    });

    const payload = snapshotState.executeDomainOperation.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('from_bus_ref');
    expect(selectElementMock).toHaveBeenCalledWith({
      id: 'seg-branch-1',
      type: 'LineBranch',
      name: 'Nowe odgałęzienie SN',
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('seg-branch-1');
    expect(closeOperationFormMock).toHaveBeenCalledTimes(1);
  });

  it('dla słupa linii napowietrznej przejmuje rodzinę i typ katalogowy od odcinka macierzystego', async () => {
    snapshotState.snapshot.buses.push({
      id: 'bus-bp-branch',
      ref_id: 'bus-bp-branch',
      name: 'Port odgałęzienia słupa',
      voltage_kv: 15,
    });
    snapshotState.executeDomainOperation.mockResolvedValue(branchOperationResponse('seg-overhead-branch-1'));
    activeOperationContextState.value = {
      from_ref: 'bp-1.BRANCH',
      source_bus_ref: 'bus-bp-branch',
      source_type_label: 'Słup rozgałęźny',
      source_name: 'Słup rozgałęźny SN',
      source_voltage_label: '15 kV',
      source_port_label: 'port boczny odgałęzienia',
      segment: {
        rodzaj: 'line_overhead',
        cross_section_mm2: 150,
        conductor_material: 'AL',
        catalog_binding: {
          catalog_namespace: 'LINIA_SN',
          catalog_item_id: 'line-base-al-150',
          catalog_item_version: '1.0',
        },
      },
    };

    render(<StartBranchForm />);

    expect(screen.getByDisplayValue('Słup rozgałęźny SN - port boczny odgałęzienia')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Linia napowietrzna SN')).toBeInTheDocument();
    const segmentFamily = screen.getByRole('combobox', { name: 'Rodzina odcinka' });
    expect(segmentFamily).toBeDisabled();
    expect(within(segmentFamily).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Linia napowietrzna SN',
    ]);
    expect(within(segmentFamily).queryByRole('option', { name: 'Kabel SN' })).not.toBeInTheDocument();
    expect(screen.getByText('Słup rozgałęźny jest węzłem linii napowietrznej. Odgałęzienie ze słupa prowadź linią napowietrzną SN.')).toBeInTheDocument();
    expect(screen.getByTestId('branch-catalog-display')).toHaveDisplayValue('Linia napowietrzna Al 150 mm²');
    expect(screen.queryByDisplayValue('line-base-al-150')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rozpocznij odgałęzienie' }));

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'start_branch_segment_sn',
        expect.objectContaining({
          from_ref: 'bp-1.BRANCH',
          segment: expect.objectContaining({
            rodzaj: 'LINIA_NAPOWIETRZNA',
            dlugosc_m: 1000,
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'LINIA_SN',
              catalog_item_id: 'line-base-al-150',
            }),
          }),
        }),
      );
    });
  });

  it('dla ZKSN wymusza odgałęzienie kablowe niezależnie od poprzedniego kontekstu formularza', async () => {
    snapshotState.snapshot.buses.push({
      id: 'bus-zksn-branch-1',
      ref_id: 'bus-zksn-branch-1',
      name: 'Port odgałęźny ZKSN',
      voltage_kv: 15,
    });
    snapshotState.executeDomainOperation.mockResolvedValue(branchOperationResponse('seg-zksn-branch-1'));
    activeOperationContextState.value = {
      from_ref: 'bp-zksn-1.BRANCH_1',
      source_bus_ref: 'bus-zksn-branch-1',
      source_type_label: 'ZKSN',
      source_name: 'ZKSN SN 1',
      source_voltage_label: '15 kV',
      source_port_label: 'port boczny odgałęzienia',
      segment: {
        rodzaj: 'line_overhead',
        cross_section_mm2: 150,
        return_conductor_cross_section_mm2: 25,
        catalog_binding: {
          catalog_namespace: 'KABEL_SN',
          catalog_item_id: 'cable-enea-operator-na2xs2y-1x150',
          catalog_item_version: '1.0',
        },
      },
    };

    render(<StartBranchForm />);

    expect(screen.getByDisplayValue('ZKSN SN 1 - port boczny odgałęzienia')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Kabel SN')).toBeInTheDocument();
    const segmentFamily = screen.getByRole('combobox', { name: 'Rodzina odcinka' });
    expect(segmentFamily).toBeDisabled();
    expect(within(segmentFamily).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Kabel SN',
    ]);
    expect(within(segmentFamily).queryByRole('option', { name: 'Linia napowietrzna SN' })).not.toBeInTheDocument();
    expect(screen.getByText('ZKSN jest rozdzielnicą SN w torze kablowym. Odgałęzienie z ZKSN prowadź odcinkiem kablowym.')).toBeInTheDocument();
    expect(screen.getByTestId('branch-catalog-display')).toHaveDisplayValue('3 × NA2XS2Y 1×150/25 mm²');
    expect(screen.queryByDisplayValue('cable-enea-operator-na2xs2y-1x150')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rozpocznij odgałęzienie' }));

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'start_branch_segment_sn',
        expect.objectContaining({
          from_ref: 'bp-zksn-1.BRANCH_1',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 1000,
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'KABEL_SN',
              catalog_item_id: 'cable-enea-operator-na2xs2y-1x150',
            }),
          }),
        }),
      );
    });
  });
});
