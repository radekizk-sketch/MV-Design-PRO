/**
 * Testy kreatora „Punkt pomiarowy pola SN" (add_ct / add_vt) — realna ścieżka, Zero-Debt §5.
 * Katalog wypełnia przekładnię; payload weryfikowany 1:1 z operacją domenową.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPomiaru } from '../KreatorPomiaru';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let activeForm: { op: string; context?: Record<string, unknown> } | null = { op: 'add_ct', context: {} };
const snapshotState = { error: null as string | null, snapshot: null, executeDomainOperation: executeDomainOperationMock };

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationForm: () => activeForm,
}));

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => navigateToSldMock() }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchCtTypes: () =>
    Promise.resolve([
      { id: 'ct-1', name: 'CT 300/5', manufacturer: 'ABB', ratio_primary_a: 300, ratio_secondary_a: 5, accuracy_class: '5P20', burden_va: 15 },
    ]),
  fetchVtTypes: () =>
    Promise.resolve([
      { id: 'vt-1', name: 'VT 15000/100', manufacturer: 'ABB', ratio_primary_v: 15000, ratio_secondary_v: 100, accuracy_class: '0.5' },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/catalogFirstRules', () => ({ validateCatalogFirst: () => null }));

const FIELD_ITEM = { bay_ref: 'bay-1', bay_id: 'bay-1', bay_name: 'Pole liniowe A' };

vi.mock('../../../../ui/field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({ data: { fields: [FIELD_ITEM] }, itemsByBayRef: new Map([['bay-1', FIELD_ITEM]]) }),
}));

vi.mock('../../../../ui/field/fieldReadModelSelectors', () => ({
  buildFieldReadModelOptions: () => [
    { ref_id: 'bay-1', name: 'Pole liniowe A', bay_role: 'FEEDER', station_name: 'GPZ Wschód', bus_name: 'Szyna I', ct_count: 0, vt_count: 0 },
  ],
  resolveFieldReadModelItem: () => null,
}));

async function pickCt() {
  await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pomiar-katalog'), 'ct-1');
}

describe('KreatorPomiaru — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm = { op: 'add_ct', context: {} };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('dodaje CT z przekładnią wypełnioną z katalogu (add_ct)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'ct-x' } });
    render(<KreatorPomiaru />);
    await pickCt();

    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_ct',
        expect.objectContaining({
          bay_ref: 'bay-1',
          catalog_ref: 'ct-1',
          ratio_primary_a: 300,
          ratio_secondary_a: 5,
          catalog_binding: expect.objectContaining({ catalog_namespace: 'CT', catalog_item_id: 'ct-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'ct-x', type: 'Measurement' }));
  });

  it('wariant VT używa operacji add_vt i pól napięciowych', async () => {
    activeForm = { op: 'add_vt', context: {} };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPomiaru />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pomiar-katalog'), 'vt-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-pomiar-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_vt',
        expect.objectContaining({ ratio_primary_v: 15000, ratio_secondary_v: 100 }),
      );
    });
  });

  it('uczciwy stan zerowy: bez katalogu zapis zablokowany', async () => {
    render(<KreatorPomiaru />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pomiar-katalog')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-kreator-pomiar-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
