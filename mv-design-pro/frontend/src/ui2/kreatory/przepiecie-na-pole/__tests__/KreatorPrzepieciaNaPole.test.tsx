/**
 * Kreator „Przepięcie elementu na pole stacji" (przepnij_element_na_pole) — realna ścieżka
 * użytkownika (natywne kliki, Zero-Debt §5): akcja naprawcza kontroli W042 otwiera kreator
 * z elementem i polem wskazanym przez model; projektant zapisuje albo wybiera inne pole.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPrzepieciaNaPole, elementNaSzynieStacji } from '../KreatorPrzepieciaNaPole';
import type { EnergyNetworkModel } from '../../../../types/enm';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const SNAPSHOT = {
  buses: [
    { ref_id: 'sn', name: 'Szyna SN stacji Lipowa' },
    { ref_id: 'z-in', name: 'Zacisk pola wejściowego' },
    { ref_id: 'z-tr', name: 'Zacisk pola TR' },
  ],
  branches: [
    { ref_id: 'kabel-L', name: 'Magistrala 1 (1)', type: 'cable', from_bus_ref: 'gpz', to_bus_ref: 'sn' },
  ],
  transformers: [{ ref_id: 'tr-1', name: 'Transformator SN/nN', hv_bus_ref: 'sn', lv_bus_ref: 'nn' }],
  substations: [
    {
      ref_id: 'st-1',
      name: 'Stacja Lipowa',
      bus_refs: ['sn'],
      meta: {
        field_specs: [
          { field_ref: 'f-in', name: 'Pole liniowe wejściowe 1', bus_ref: 'sn', meta: { terminal_bus_ref: 'z-in' } },
          { field_ref: 'f-tr', name: 'Pole transformatorowe 3', bus_ref: 'sn', meta: { terminal_bus_ref: 'z-tr' } },
          { field_ref: 'f-stare', name: 'Pole bez zacisku', bus_ref: 'sn', meta: { terminal_bus_ref: 'sn' } },
        ],
      },
    },
  ],
} as unknown as EnergyNetworkModel;

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { element_ref: 'kabel-L', field_ref: 'f-in' };
const snapshotState = {
  error: null as string | null,
  snapshot: SNAPSHOT as EnergyNetworkModel | null,
  executeDomainOperation: executeDomainOperationMock,
};

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

vi.mock('../../../../ui/navigation/routes', () => ({ navigateToSld: () => undefined }));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerSldOnElementMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

describe('elementNaSzynieStacji — dane stacji, bez reguł toru w UI', () => {
  it('odcinek: stacja, szyna i WYŁĄCZNIE pola z własnym zaciskiem na tej szynie', () => {
    const opis = elementNaSzynieStacji(SNAPSHOT, 'kabel-L');
    expect(opis?.stacjaNazwa).toBe('Stacja Lipowa');
    expect(opis?.szynaNazwa).toBe('Szyna SN stacji Lipowa');
    expect(opis?.pola.map((p) => p.id)).toEqual(['f-in', 'f-tr']);
  });

  it('transformator: strona górna na szynie stacji', () => {
    expect(elementNaSzynieStacji(SNAPSHOT, 'tr-1')?.rodzaj).toBe('transformer');
  });

  it('element spoza stacji albo spoza modelu → brak', () => {
    expect(elementNaSzynieStacji(SNAPSHOT, 'nieistniejacy')).toBeNull();
    expect(elementNaSzynieStacji(null, 'kabel-L')).toBeNull();
  });
});

describe('KreatorPrzepieciaNaPole — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { element_ref: 'kabel-L', field_ref: 'f-in' };
    snapshotState.error = null;
    snapshotState.snapshot = SNAPSHOT;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  afterEach(() => cleanup());

  it('zapis z polem wskazanym przez kontrolę modelu wysyła element i to pole', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null, selection_hint: { element_id: 'kabel-L' } });
    render(<KreatorPrzepieciaNaPole />);
    expect((screen.getByTestId('mvd-kreator-przepiecie-pole') as HTMLSelectElement).value).toBe('f-in');
    await userEvent.click(screen.getByTestId('mvd-kreator-przepiecie-zapisz'));
    await waitFor(() =>
      expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'przepnij_element_na_pole', {
        element_ref: 'kabel-L',
        field_ref: 'f-in',
      }),
    );
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('wybór „pole wskazane przez kontrolę" wysyła sam element (pole rozstrzyga model)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPrzepieciaNaPole />);
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-przepiecie-pole'), '');
    await userEvent.click(screen.getByTestId('mvd-kreator-przepiecie-zapisz'));
    await waitFor(() =>
      expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'przepnij_element_na_pole', {
        element_ref: 'kabel-L',
      }),
    );
  });

  it('odmowa modelu (np. pole innej roli) zostaje w kreatorze jako błąd, bez zamknięcia', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: 'Pole transformatorowe nie służy temu końcowi odcinka.' });
    render(<KreatorPrzepieciaNaPole />);
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-przepiecie-pole'), 'f-tr');
    await userEvent.click(screen.getByTestId('mvd-kreator-przepiecie-zapisz'));
    expect(await screen.findByText('Pole transformatorowe nie służy temu końcowi odcinka.')).toBeTruthy();
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('bez elementu na szynie stacji zapis jest zablokowany', () => {
    context = { element_ref: 'nieistniejacy' };
    render(<KreatorPrzepieciaNaPole />);
    expect(screen.getByTestId('mvd-kreator-przepiecie-brak')).toBeTruthy();
    expect((screen.getByTestId('mvd-kreator-przepiecie-zapisz') as HTMLButtonElement).disabled).toBe(true);
  });
});
