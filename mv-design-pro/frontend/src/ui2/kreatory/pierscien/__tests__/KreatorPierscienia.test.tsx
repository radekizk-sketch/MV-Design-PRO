/**
 * Testy kreatora „Domknięcie pierścienia SN + NOP" — realna ścieżka, Zero-Debt §5.
 *
 * Karta W5-C: kandydaci punktu podziału i dotychczasowe punkty podziału pochodzą z modelu
 * (`normal_state` gałęzi łącznika w migawce), nie z kontekstu operacji. Iloczyn: tryb
 * {pierścień + NOP, samo przeniesienie NOP} × `close_ref` {pominięty, wskazany}.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorPierscienia } from '../KreatorPierscienia';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {};
let op = 'connect_secondary_ring_sn';

function lacznik(ref: string, normal_state: 'open' | 'closed' | null, type = 'switch') {
  return { ref_id: ref, id: ref, name: `Łącznik ${ref}`, type, status: normal_state ?? 'closed', normal_state };
}
/** Migawka: sw-1 normalnie zamknięty, sw-nop dotychczasowy punkt podziału, bezpiecznik. */
function migawka() {
  return {
    branches: [
      lacznik('sw-1', 'closed'),
      lacznik('sw-nop', 'open'),
      { ref_id: 'fu-1', id: 'fu-1', name: 'Bezpiecznik', type: 'fuse', status: 'closed' },
      { ref_id: 'kab-1', id: 'kab-1', name: 'Kabel', type: 'cable' },
    ],
  };
}
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: migawka() as unknown,
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
  useActiveOperationForm: () => ({ op, context }),
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
  await waitFor(() =>
    expect(screen.getByTestId('mvd-kreator-pierscien-katalog').querySelector('option[value="cab-1"]')).not.toBeNull(),
  );
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pierscien-katalog'), 'cab-1');
}

describe('KreatorPierscienia — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    op = 'connect_secondary_ring_sn';
    context = {
      terminalA_id: 'bus-a',
      terminalA_label: 'Szyna A',
      terminalB_id: 'bus-b',
      terminalB_label: 'Szyna B',
    };
    snapshotState.error = null;
    snapshotState.snapshot = migawka();
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

    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-domknij'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'connect_secondary_ring_sn',
        expect.objectContaining({
          from_bus_ref: 'bus-a',
          to_bus_ref: 'bus-b',
          segment: expect.objectContaining({ rodzaj: 'KABEL' }),
        }),
      );
    });

    // Krok 2: wybór NOP i zapis.
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pierscien-nop-wybor'), 'sw-1');
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

  it('uczciwy stan zerowy: bez zacisków domknięcie zablokowane', async () => {
    context = {};
    render(<KreatorPierscienia />);
    // Montaż pobiera katalogi (kable + linie) — czekamy na realny stan końcowy
    // UI (opcja kabla w selekcie katalogu), żeby aktualizacje stanu domknęły
    // się w act.
    await screen.findByRole('option', { name: /Kabel 3x120/ });
    expect(screen.getByTestId('mvd-kreator-pierscien-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-pierscien-domknij')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje domknięcie bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorPierscienia />);
    await pickCable();
    expect(screen.getByTestId('mvd-kreator-pierscien-domknij')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('kandydaci NOP z modelu: łącznik normalnie zamknięty tak, punkt podziału i bezpiecznik nie', async () => {
    op = 'set_normal_open_point';
    context = {};
    render(<KreatorPierscienia />);
    const wybor = screen.getByTestId('mvd-kreator-pierscien-nop-wybor');
    const opcje = Array.from(wybor.querySelectorAll('option')).map((o) => o.getAttribute('value'));
    expect(opcje).toEqual(['', 'sw-1']);
    const zamkniecie = screen.getByTestId('mvd-kreator-pierscien-close-wybor');
    expect(Array.from(zamkniecie.querySelectorAll('option')).map((o) => o.getAttribute('value'))).toEqual([
      '',
      'sw-nop',
    ]);
    expect(fetchCableTypesMock).not.toHaveBeenCalled();
  });

  it.each([
    ['close_ref pominięty', '', { switch_ref: 'sw-1' }],
    ['close_ref wskazany', 'sw-nop', { switch_ref: 'sw-1', close_ref: 'sw-nop' }],
  ])(
    'samo przeniesienie NOP startuje na kroku NOP z łącznikiem z kontekstu (%s)',
    async (_opis, closeRef, oczekiwany) => {
      op = 'set_normal_open_point';
      context = { switch_ref: 'sw-1' };
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorPierscienia />);
      expect(screen.queryByTestId('mvd-kreator-pierscien-domkniecie')).toBeNull();
      expect(screen.queryByTestId('mvd-kreator-pierscien-brak')).toBeNull();
      expect(screen.getByTestId('mvd-kreator-pierscien-nop-wybor')).toHaveValue('sw-1');
      if (closeRef) {
        await userEvent.selectOptions(screen.getByTestId('mvd-kreator-pierscien-close-wybor'), closeRef);
      }
      await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-zapisz-nop'));
      await waitFor(() => {
        expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'set_normal_open_point', oczekiwany);
      });
      expect(executeDomainOperationMock).toHaveBeenCalledTimes(1);
      expect(closeFormMock).toHaveBeenCalled();
    },
  );

  it('odmowa modelu (nop.previous_ambiguous) zostaje w kreatorze z komunikatem', async () => {
    op = 'set_normal_open_point';
    context = { switch_ref: 'sw-1' };
    executeDomainOperationMock.mockResolvedValue({
      error: 'Pierścień ma kilka punktów podziału zależnych od łącznika — wskaż, który zamknąć.',
    });
    render(<KreatorPierscienia />);
    await userEvent.click(screen.getByTestId('mvd-kreator-pierscien-zapisz-nop'));
    expect(await screen.findByText(/kilka punktów podziału/)).toBeInTheDocument();
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('bez łączników z pozycją normalną — uczciwy stan zerowy zamiast pustej listy', async () => {
    op = 'set_normal_open_point';
    context = {};
    snapshotState.snapshot = { branches: [] };
    render(<KreatorPierscienia />);
    expect(screen.queryByTestId('mvd-kreator-pierscien-nop-wybor')).toBeNull();
    expect(screen.getByText(/Brak kandydatów NOP/)).toBeInTheDocument();
  });
});
