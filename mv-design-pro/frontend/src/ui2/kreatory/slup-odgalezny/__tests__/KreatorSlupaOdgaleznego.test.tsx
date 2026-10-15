/**
 * Testy kreatora „Słup rozgałęźny SN" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorSlupaOdgaleznego } from '../KreatorSlupaOdgaleznego';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', segmentLabel: 'Linia A' };
const snapshot = {
  branches: [{ id: 'seg-1', ref_id: 'seg-1', type: 'line_overhead', name: 'Linia A' }],
};
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
const SLUP_1 = { id: 'bp-1', name: 'Słup odczepowy', kind: 'BRANCH_POLE', medium: 'LINE_OVERHEAD', branch_ports_count: 1, switch_device_kind: 'ROZLACZNIK', switch_rated_current_a: 400 };
const SLUP_2 = { ...SLUP_1, id: 'bp-2', name: 'Słup odczepowy z wyłącznikiem', switch_device_kind: 'WYLACZNIK' };

const { fetchBranchPointTypesMock } = vi.hoisted(() => ({
  fetchBranchPointTypesMock: vi.fn((_kind: string): Promise<unknown[]> => Promise.resolve([])),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchBranchPointTypes: (kind: string) => fetchBranchPointTypesMock(kind),
}));

async function pick() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-slup-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-slup-katalog'), 'bp-1');
}

describe('KreatorSlupaOdgaleznego — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Linia A', position_on_segment: 0.5 };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerMock.mockReset();
    fetchBranchPointTypesMock.mockReset();
    fetchBranchPointTypesMock.mockImplementation(() => Promise.resolve([SLUP_1, SLUP_2]));
  });

  afterEach(() => cleanup());

  it('wstawia słup na linii i wiąże selekcję po operacji', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'bp/9', element_type: 'branch_point' },
    });
    render(<KreatorSlupaOdgaleznego />);
    await pick();

    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_branch_pole_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.5 },
          catalog_binding: expect.objectContaining({ catalog_namespace: 'mv_branch_points', catalog_item_id: 'bp-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'bp/9', type: 'BranchPole' }));
    expect(centerMock).toHaveBeenCalledWith('bp/9');
  });

  it('panel teorii renderuje wzory przez KaTeX (math-rendered)', async () => {
    render(<KreatorSlupaOdgaleznego />);
    await pick();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  // Intencja dawnych testów „zapis zablokowany”: operacja nie rusza bez odcinka, na złym
  // torze ani bez przypadku — w nowym kanonie przez jedno wskazanie przy próbie zapisu.
  it('bez odcinka: próba zapisu nazywa brak odcinka, operacja nie rusza', async () => {
    context = {};
    render(<KreatorSlupaOdgaleznego />);
    await screen.findByTestId('mvd-kreator-slup-brak');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-slup')).toHaveAttribute('data-status', 'gotowy'));
    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/odcinek/i);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('konflikt toru widoczny od razu (słup na kablu) i blokuje operację przy zapisie', async () => {
    context = { segment_id: 'seg-cable', position_on_segment: 0.5 };
    snapshot.branches = [{ id: 'seg-cable', ref_id: 'seg-cable', type: 'cable', name: 'Kabel B' }];
    render(<KreatorSlupaOdgaleznego />);
    await screen.findByTestId('mvd-kreator-slup-tor');
    expect(
      screen.getByTestId('mvd-kreator-slup-gotowosc').querySelector('[data-stan="konflikt"]'),
    ).not.toBeNull();
    await pick();
    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/tylko na linii napowietrznej/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    snapshot.branches = [{ id: 'seg-1', ref_id: 'seg-1', type: 'line_overhead', name: 'Linia A' }];
  });

  it('bez aktywnego przypadku: próba zapisu wskazuje przypadek', async () => {
    appState.activeCaseId = null;
    render(<KreatorSlupaOdgaleznego />);
    await pick();
    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('świeży kreator bez położenia w kontekście: zero alertów; zapis wskazuje typ, potem położenie', async () => {
    context = { segment_id: 'seg-1', segmentLabel: 'Linia A' };
    render(<KreatorSlupaOdgaleznego />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-slup')).toHaveAttribute('data-status', 'gotowy'));
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));
    expect(screen.getByTestId('mvd-kreator-slup-katalog')).toHaveFocus();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-slup-katalog'), 'bp-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-slup-zapisz'));
    expect(screen.getByTestId('mvd-kreator-slup-polozenie')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj położenie słupa/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('jedyny słup w katalogu i położenie z kontekstu stoją w polach i dają się zmienić', async () => {
    fetchBranchPointTypesMock.mockImplementation(() => Promise.resolve([SLUP_1]));
    render(<KreatorSlupaOdgaleznego />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-slup-katalog')).toHaveValue('bp-1'));
    expect(screen.getByTestId('mvd-kreator-slup-polozenie')).toHaveValue(0.5);
    await userEvent.clear(screen.getByTestId('mvd-kreator-slup-polozenie'));
    await userEvent.type(screen.getByTestId('mvd-kreator-slup-polozenie'), '0.3');
    expect(screen.getByTestId('mvd-kreator-slup-polozenie')).toHaveValue(0.3);
    expect(screen.queryByText(/przyjęto/)).toBeNull();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisMozliwy` nie sprawdzał, czy katalog słupów już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × odcinek poprawny → zapis zablokowany z komunikatem', async () => {
    fetchBranchPointTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorSlupaOdgaleznego />);

    expect(screen.getByTestId('mvd-kreator-slup-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-slup')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
