/**
 * Testy kreatora „Domknięcie pierścienia SN + NOP" — realna ścieżka, Zero-Debt §5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPierscienia } from '../KreatorPierscienia';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  terminalA_id: 'bus-a',
  terminalA_label: 'Szyna A',
  terminalB_id: 'bus-b',
  terminalB_label: 'Szyna B',
  nop_candidates: [{ id: 'sw-1', label: 'Ł1', elementType: 'switch' }],
};
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

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const { fetchCableTypesMock, fetchLineTypesMock } = vi.hoisted(() => ({
  fetchCableTypesMock: vi.fn(() =>
    Promise.resolve([{ id: 'cab-1', name: 'Kabel 3x120', cross_section_mm2: 120, rated_current_a: 280 }]),
  ),
  fetchLineTypesMock: vi.fn(() => Promise.resolve([{ id: 'ln-1', name: 'AFL 70', rated_current_a: 320 }])),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchCableTypes: () => fetchCableTypesMock(),
  fetchLineTypes: () => fetchLineTypesMock(),
}));

async function pickCable() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-pierscien-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pierscien-katalog'), 'cab-1');
}

describe('KreatorPierscienia — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = {
      terminalA_id: 'bus-a',
      terminalA_label: 'Szyna A',
      terminalB_id: 'bus-b',
      terminalB_label: 'Szyna B',
      nop_candidates: [{ id: 'sw-1', label: 'Ł1', elementType: 'switch' }],
    };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    fetchCableTypesMock.mockClear();
    fetchLineTypesMock.mockClear();
  });

  afterEach(() => cleanup());

  it('domyka pierścień i ustawia NOP (dwie operacje domenowe)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorPierscienia />);
    await pickCable();
    await userEvent.type(screen.getByTestId('mvd-kreator-pierscien-dlugosc'), '450');

    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'connect_secondary_ring_sn',
        expect.objectContaining({
          from_bus_ref: 'bus-a',
          to_bus_ref: 'bus-b',
          segment: expect.objectContaining({ rodzaj: 'KABEL', dlugosc_m: 450 }),
        }),
      );
    });

    // Krok 2: jedyny kandydat NOP dobrany automatycznie — stoi w polu, edytowalny — i zapis.
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-pierscien-nop-wybor')).toHaveValue('sw-1'));
    expect(screen.getByTestId('mvd-kreator-pierscien-nop-wybor')).toBeEnabled();
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-zapisz-nop'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'set_normal_open_point',
        { switch_ref: 'sw-1' },
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  // Intencja dawnych testów „domknięcie zablokowane”: bez zacisków i bez przypadku operacja
  // nie rusza — w nowym kanonie przez jedno wskazanie przy próbie domknięcia.
  it('bez zacisków: próba domknięcia nazywa brak, operacja nie rusza', async () => {
    context = { nop_candidates: [] };
    render(<KreatorPierscienia />);
    await screen.findByRole('option', { name: /Kabel 3x120/ });
    expect(screen.getByTestId('mvd-kreator-pierscien-brak')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toBeInTheDocument();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('bez aktywnego przypadku: próba domknięcia wskazuje przypadek', async () => {
    appState.activeCaseId = null;
    render(<KreatorPierscienia />);
    await pickCable();
    await userEvent.type(screen.getByTestId('mvd-kreator-pierscien-dlugosc'), '300');
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('świeży kreator: bez alertu i bez zgadywanej długości; domknięcie wskazuje typ, potem długość', async () => {
    render(<KreatorPierscienia />);
    await screen.findByRole('option', { name: /Kabel 3x120/ });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByTestId('mvd-kreator-pierscien-dlugosc') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));
    expect(screen.getByTestId('mvd-kreator-pierscien-katalog')).toHaveFocus();
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));
    expect(screen.getByTestId('mvd-kreator-pierscien-dlugosc')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj długość odcinka domykającego — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('konflikt widoczny od razu: długość niedodatnia', async () => {
    render(<KreatorPierscienia />);
    await screen.findByRole('option', { name: /Kabel 3x120/ });
    await userEvent.type(screen.getByTestId('mvd-kreator-pierscien-dlugosc'), '0');
    expect(screen.getByRole('alert').textContent).toMatch(/dodatnia/);
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * „Domknij" (wymaga `catalog_ref`) nie sprawdzał, czy katalog już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × zaciski dostępne → domknięcie zablokowane z komunikatem', async () => {
    fetchCableTypesMock.mockReturnValueOnce(new Promise(() => {}));
    fetchLineTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorPierscienia />);

    expect(screen.getByTestId('mvd-kreator-pierscien-domknij')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-pierscien')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
