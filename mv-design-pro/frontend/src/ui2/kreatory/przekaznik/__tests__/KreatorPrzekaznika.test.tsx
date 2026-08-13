/**
 * Testy kreatora „Zabezpieczenie pola SN" (add_relay) — realna ścieżka użytkownika, Zero-Debt §5.
 * Pola wybierane natywnie (userEvent), payload weryfikowany 1:1 z operacją domenową.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPrzekaznika } from '../KreatorPrzekaznika';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let activeForm: { op: string; context?: Record<string, unknown> } | null = { op: 'add_relay', context: {} };
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
  fetchProtectionDeviceTypes: () =>
    Promise.resolve([
      { id: 'relay-1', name: 'REF615', manufacturer: 'ABB' },
      { id: 'relay-2', name: '7SJ82', manufacturer: 'Siemens' },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/catalogFirstRules', () => ({
  validateCatalogFirst: () => null,
}));

const FIELD_ITEM = { bay_ref: 'bay-1', bay_id: 'bay-1', bay_name: 'Pole liniowe A' };

vi.mock('../../../../ui/field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: [FIELD_ITEM] },
    itemsByBayRef: new Map([['bay-1', FIELD_ITEM]]),
  }),
}));

vi.mock('../../../../ui/field/fieldReadModelSelectors', () => ({
  buildFieldReadModelOptions: () => [
    { ref_id: 'bay-1', name: 'Pole liniowe A', bay_role: 'FEEDER', station_name: 'GPZ Wschód', bus_name: 'Szyna I', ct_count: 1, vt_count: 1 },
  ],
  resolveFieldReadModelItem: () => null,
}));

vi.mock('../../../../ui/field/fieldControlSelectors', () => ({
  buildControlDeviceOptions: () => [{ ref_id: 'cb-1', name: 'wyłącznik cb-1', kind: 'CB', catalog_ref: null }],
  measurementCountsForField: () => ({ ct: 1, vt: 1 }),
}));

/**
 * Wybór pozycji katalogowej przekaźnika.
 *
 * CZEKAMY NA OPCJĘ, NIE NA SAM `<select>` (naprawa chwiejności, 2026-08-08).
 * Lista pozycji przychodzi z asynchronicznego `fetchProtectionDeviceTypes`, a
 * pole `<select>` renderuje się PRZED jej rozwiązaniem — więc warunek „element
 * jest w dokumencie" spełniał się na PUSTEJ liście i `selectOptions` wywracał
 * się z „Value »relay-1« not found in options". Objaw wychodził wyłącznie
 * w pełnym przebiegu shardowanym (setki plików w jednym procesie, przesunięte
 * kolejkowanie mikrozadań), a w izolacji test przechodził — czyli czekanie na
 * niewłaściwy warunek udawało zieleń. Zmierzone: ten sam commit dawał raz
 * czerwień, raz zieleń na `--shard=1/4`.
 */
async function pickCatalog() {
  const katalog = await screen.findByTestId('mvd-kreator-przekaznik-katalog');
  await waitFor(() => {
    expect(within(katalog).getByRole('option', { name: /REF615/ })).toBeInTheDocument();
  });
  await userEvent.selectOptions(katalog, 'relay-1');
}

describe('KreatorPrzekaznika — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    activeForm = { op: 'add_relay', context: {} };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('przypisuje zabezpieczenie do pola (add_relay z catalog_binding ZABEZPIECZENIE)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'relay-x' } });
    render(<KreatorPrzekaznika />);
    await pickCatalog();

    await userEvent.click(screen.getByTestId('mvd-kreator-przekaznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_relay',
        expect.objectContaining({
          bay_ref: 'bay-1',
          relay_type: 'NADPRADOWY',
          catalog_ref: 'relay-1',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'ZABEZPIECZENIE', catalog_item_id: 'relay-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'relay-x', type: 'ProtectionAssignment' }));
  });

  it('wybór rodziny ziemnozwarciowej trafia do payloadu', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPrzekaznika />);
    await pickCatalog();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-przekaznik-rodzina'), 'ZIEMNOZWARCIOWY');
    await userEvent.click(screen.getByTestId('mvd-kreator-przekaznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_relay',
        expect.objectContaining({ relay_type: 'ZIEMNOZWARCIOWY' }),
      );
    });
  });

  it('uczciwy stan zerowy: bez typu katalogowego zapis zablokowany', async () => {
    render(<KreatorPrzekaznika />);
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-przekaznik-katalog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPrzekaznika />);
    await pickCatalog();
    expect(screen.getByTestId('mvd-kreator-przekaznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
