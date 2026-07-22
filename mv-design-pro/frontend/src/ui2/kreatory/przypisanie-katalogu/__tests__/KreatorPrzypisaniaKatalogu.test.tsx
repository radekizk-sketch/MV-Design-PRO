/**
 * Testy kreatora „Przypisanie typu katalogowego" (assign_catalog_to_element) — realna ścieżka, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPrzypisaniaKatalogu } from '../KreatorPrzypisaniaKatalogu';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { element_ref: 'branch-1', catalog_namespace: 'KABEL_SN' };
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock };

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
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => navigateToSldMock() }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

describe('KreatorPrzypisaniaKatalogu — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { element_ref: 'branch-1', catalog_namespace: 'KABEL_SN' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('przypisuje katalog z jawną przestrzenią (catalog_binding)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'branch-1' } });
    render(<KreatorPrzypisaniaKatalogu />);

    await userEvent.type(screen.getByTestId('mvd-kreator-przypisanie-id'), 'kabel_sn_3x120_al');
    await userEvent.click(screen.getByTestId('mvd-kreator-przypisanie-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'assign_catalog_to_element',
        expect.objectContaining({
          element_ref: 'branch-1',
          source_mode: 'KATALOG',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'KABEL_SN', catalog_item_id: 'kabel_sn_3x120_al' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('bez przestrzeni w kontekście przekazuje surowy identyfikator (backend wyznacza przestrzeń)', async () => {
    context = { element_ref: 'branch-1' };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPrzypisaniaKatalogu />);

    await userEvent.type(screen.getByTestId('mvd-kreator-przypisanie-id'), 'linia_sn_70al');
    await userEvent.click(screen.getByTestId('mvd-kreator-przypisanie-zapisz'));

    await waitFor(() => {
      const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
      expect(payload).toMatchObject({ element_ref: 'branch-1', catalog_item_id: 'linia_sn_70al', source_mode: 'KATALOG' });
      expect(payload).not.toHaveProperty('catalog_binding');
    });
  });

  it('uczciwy stan zerowy: bez identyfikatora zapis zablokowany', async () => {
    render(<KreatorPrzypisaniaKatalogu />);
    expect(screen.getByTestId('mvd-kreator-przypisanie-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
