/**
 * Testy kreatora „Złącze kablowe SN (ZKSN)" — realna ścieżka użytkownika, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZksn } from '../KreatorZksn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', segmentLabel: 'Kabel A' };
const snapshot = {
  branches: [{ id: 'seg-1', ref_id: 'seg-1', type: 'cable', name: 'Kabel A' }],
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
const { fetchBranchPointTypesMock } = vi.hoisted(() => ({
  fetchBranchPointTypesMock: vi.fn((_kind: string) =>
    Promise.resolve([
      { id: 'zk-1', name: 'ZK przelotowe', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 1, switch_device_kind: 'ROZLACZNIK' },
      { id: 'zk-2', name: 'ZK odgałęźne', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 2, switch_device_kind: 'ROZLACZNIK' },
    ]),
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  fetchBranchPointTypes: (kind: string) => fetchBranchPointTypesMock(kind),
}));

async function pick(id = 'zk-2') {
  // Czekamy na OPCJĘ wariantu, nie tylko na listę: katalog ładuje się asynchronicznie, więc
  // lista bywa w DOM przed pozycjami (wyścig widoczny pod obciążeniem pełnego biegu vitest).
  await waitFor(() => {
    const lista = screen.getByTestId('mvd-kreator-zksn-katalog') as HTMLSelectElement;
    expect([...lista.options].map((o) => o.value)).toContain(id);
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-zksn-katalog'), id);
}

describe('KreatorZksn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Kabel A', position_on_segment: 0.5 };
    snapshotState.error = null;
    snapshot.branches = [{ id: 'seg-1', ref_id: 'seg-1', type: 'cable', name: 'Kabel A' }];
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerMock.mockReset();
    fetchBranchPointTypesMock.mockReset();
    fetchBranchPointTypesMock.mockImplementation(() =>
      Promise.resolve([
        { id: 'zk-1', name: 'ZK przelotowe', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 1, switch_device_kind: 'ROZLACZNIK' },
        { id: 'zk-2', name: 'ZK odgałęźne', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 2, switch_device_kind: 'ROZLACZNIK' },
      ]),
    );
  });

  afterEach(() => cleanup());

  it('wstawia ZKSN na kablu, przenosi liczbę portów z wariantu i wiąże selekcję', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'zk/7', element_type: 'branch_point' },
    });
    render(<KreatorZksn />);
    await pick('zk-2');

    await userEvent.click(screen.getByTestId('mvd-kreator-zksn-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_zksn_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          branch_ports_count: 2,
          insert_at: { mode: 'RATIO', value: 0.5 },
          catalog_binding: expect.objectContaining({ catalog_namespace: 'mv_branch_points', catalog_item_id: 'zk-2' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
    expect(selectElementMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'zk/7', type: 'BranchPole' }));
  });

  it('panel teorii renderuje wzory przez KaTeX (math-rendered)', async () => {
    render(<KreatorZksn />);
    await pick();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  // Intencja dawnych testów „zapis zablokowany”: na złym torze i bez odcinka operacja nie
  // rusza — w nowym kanonie konflikt widać od razu, a brak nazywa wskazanie przy zapisie.
  it('konflikt toru (ZKSN na linii napowietrznej) widoczny od razu i blokuje operację', async () => {
    context = { segment_id: 'seg-line', position_on_segment: 0.5 };
    snapshot.branches = [{ id: 'seg-line', ref_id: 'seg-line', type: 'line_overhead', name: 'Linia B' }];
    render(<KreatorZksn />);
    await screen.findByTestId('mvd-kreator-zksn-tor');
    expect(
      screen.getByTestId('mvd-kreator-zksn-gotowosc').querySelector('[data-stan="konflikt"]'),
    ).not.toBeNull();
    await pick('zk-2');
    await userEvent.click(screen.getByTestId('mvd-kreator-zksn-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/tylko na kablu SN/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('bez odcinka: próba zapisu nazywa brak odcinka', async () => {
    context = {};
    render(<KreatorZksn />);
    await screen.findByTestId('mvd-kreator-zksn-brak');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zksn')).toHaveAttribute('data-status', 'gotowy'));
    await userEvent.click(screen.getByTestId('mvd-kreator-zksn-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/odcinek/i);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('dopięcie na końcu odcinka nie podstawia położenia; świeży kreator bez alertu; zapis wskazuje wariant', async () => {
    context = { segment_id: 'seg-1', placement_mode: 'ENDPOINT_APPEND', position_on_segment: 1 };
    render(<KreatorZksn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zksn')).toHaveAttribute('data-status', 'gotowy'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByTestId('mvd-kreator-zksn-polozenie') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByTestId('mvd-kreator-zksn-zapisz'));
    expect(screen.getByTestId('mvd-kreator-zksn-katalog')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz wariant ZKSN z katalogu — /);
  });

  it('jedyny wariant w katalogu stoi w polu, liczba portów z wariantu', async () => {
    fetchBranchPointTypesMock.mockImplementation(() =>
      Promise.resolve([
        { id: 'zk-2', name: 'ZK odgałęźne', kind: 'ZKSN', medium: 'CABLE', branch_ports_count: 2, switch_device_kind: 'ROZLACZNIK' },
      ]),
    );
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZksn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zksn-katalog')).toHaveValue('zk-2'));
    expect(screen.getByTestId('mvd-kreator-zksn-katalog')).toBeEnabled();
    await userEvent.click(screen.getByTestId('mvd-kreator-zksn-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_zksn_on_segment_sn',
        expect.objectContaining({ branch_ports_count: 2, insert_at: { mode: 'RATIO', value: 0.5 } }),
      );
    });
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisMozliwy` nie sprawdzał, czy katalog wariantów ZKSN już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × odcinek poprawny → zapis zablokowany z komunikatem', async () => {
    fetchBranchPointTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorZksn />);

    expect(screen.getByTestId('mvd-kreator-zksn-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-zksn')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
