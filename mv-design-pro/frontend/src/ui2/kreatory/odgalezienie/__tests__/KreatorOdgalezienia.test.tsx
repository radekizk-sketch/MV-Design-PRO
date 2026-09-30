/**
 * Testy kreatora „Odgałęzienie SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorOdgalezienia } from '../KreatorOdgalezienia';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  from_ref: 'bus-1.PORT',
  source_type_label: 'Szyna SN',
  source_name: 'Szyna A',
};
const snapshot = { branches: [], buses: [], substations: [], sources: [], generators: [], loads: [], transformers: [], bays: [], branch_points: [] };
const snapshotState = { error: null as string | null, executeDomainOperation: executeDomainOperationMock, snapshot };

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

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectElement: typeof selectElementMock; centerSldOnElement: typeof centerMock }) => unknown) =>
    selector({ selectElement: selectElementMock, centerSldOnElement: centerMock }),
}));

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const { fetchCableTypesMock, fetchLineTypesMock } = vi.hoisted(() => ({
  fetchCableTypesMock: vi.fn(() =>
    Promise.resolve([
      { id: 'cab-1', name: 'XRUHAKXS 3x120', cross_section_mm2: 120, rated_current_a: 280, voltage_rating_kv: 20 },
    ]),
  ),
  fetchLineTypesMock: vi.fn(() =>
    Promise.resolve([
      { id: 'line-1', name: 'AFL-6 70', cross_section_mm2: 70, rated_current_a: 290, voltage_rating_kv: 20 },
    ]),
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchCableTypes: () => fetchCableTypesMock(),
  fetchLineTypes: () => fetchLineTypesMock(),
}));

async function pickCable() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-odgalezienie-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-odgalezienie-katalog'), 'cab-1');
}

describe('KreatorOdgalezienia — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { from_ref: 'bus-1.PORT', source_type_label: 'Szyna SN', source_name: 'Szyna A' };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerMock.mockReset();
    fetchCableTypesMock.mockClear();
    fetchLineTypesMock.mockClear();
  });

  afterEach(() => cleanup());

  it('rozpoczyna odgałęzienie kablowe (from_ref + segment) i wiąże selekcję', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'seg/5', element_type: 'branch' },
    });
    render(<KreatorOdgalezienia />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-odgalezienie-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'start_branch_segment_sn',
        expect.objectContaining({
          from_ref: 'bus-1.PORT',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 1000,
            catalog_binding: expect.objectContaining({ catalog_namespace: 'KABEL_SN', catalog_item_id: 'cab-1' }),
          }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'seg/5', type: 'LineBranch' }));
  });

  it('panel teorii renderuje wzory ΔU i Kirchhoffa przez KaTeX (math-rendered)', async () => {
    render(<KreatorOdgalezienia />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-odgalezienie-katalog')).toBeInTheDocument());
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(2);
    const latexy = wzory.map((w) => w.getAttribute('data-latex') ?? '');
    expect(latexy.some((l) => l.includes('\\Delta U'))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwy stan zerowy: bez źródła zapis zablokowany', async () => {
    context = {};
    render(<KreatorOdgalezienia />);
    await screen.findByTestId('mvd-kreator-odgalezienie-brak');
    expect(screen.getByTestId('mvd-kreator-odgalezienie-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorOdgalezienia />);
    await pickCable();
    expect(screen.getByTestId('mvd-kreator-odgalezienie-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisMozliwy` nie sprawdzał, czy katalog kabli/linii już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × źródło dostępne → zapis zablokowany z komunikatem', async () => {
    fetchCableTypesMock.mockReturnValueOnce(new Promise(() => {}));
    fetchLineTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorOdgalezienia />);

    expect(screen.getByTestId('mvd-kreator-odgalezienie-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-odgalezienie')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
