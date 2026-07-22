/**
 * Testy kreatora „Edycja parametrów elementu" (update_element_parameters) — realna ścieżka, Zero-Debt §5.
 * Weryfikuje naprawę phantoma: payload używa klucza `parameters` (nie `updates`), z konwersją typów.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorEdycjiParametrow } from '../KreatorEdycjiParametrow';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { element_ref: 'tr-1' };
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

describe('KreatorEdycjiParametrow — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { element_ref: 'tr-1' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('wysyła parametry pod kluczem `parameters` z konwersją liczby (naprawa phantoma updates)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'tr-1' } });
    render(<KreatorEdycjiParametrow />);

    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-0'), 'tap_position');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-0'), '2');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-powod'), 'korekta terenowa');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'update_element_parameters',
        { element_ref: 'tr-1', parameters: { tap_position: 2 }, reason: 'korekta terenowa' },
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('updates');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('obsługuje wiele parametrów z konwersją bool/null', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorEdycjiParametrow />);
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-0'), 'in_service');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-0'), 'true');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-dodaj'));
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-klucz-1'), 'note');
    await userEvent.type(screen.getByTestId('mvd-kreator-edycja-wartosc-1'), 'null');
    await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'update_element_parameters',
        expect.objectContaining({ parameters: { in_service: true, note: null } }),
      );
    });
  });

  it('uczciwy stan zerowy: bez parametru zapis zablokowany', async () => {
    render(<KreatorEdycjiParametrow />);
    expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
