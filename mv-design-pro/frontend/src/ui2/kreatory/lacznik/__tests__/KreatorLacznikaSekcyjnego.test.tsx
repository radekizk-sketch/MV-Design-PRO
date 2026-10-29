/**
 * Testy kreatora „Łącznik sekcyjny SN" — realna ścieżka użytkownika, Zero-Debt §5.
 *
 * Karta W5-C, iloczyn: pozycja normalna {niezadeklarowana (domyślna), zamknięta, otwarta} ×
 * `close_ref` {brak punktów podziału w modelu, punkt istnieje i pominięty, punkt wskazany}.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorLacznikaSekcyjnego } from '../KreatorLacznikaSekcyjnego';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', segmentLabel: 'Odcinek A' };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: null as unknown,
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

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania.
const { fetchMvApparatusTypesMock } = vi.hoisted(() => ({
  fetchMvApparatusTypesMock: vi.fn(() =>
    Promise.resolve([
      { id: 'app-1', name: 'Rozłącznik SN', device_kind: 'ROZLACZNIK', dopuszczony_do_nowych_pol: true, u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
    ]),
  ),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchMvApparatusTypes: () => fetchMvApparatusTypesMock(),
}));

async function pick() {
  await waitFor(() =>
    expect(screen.getByTestId('mvd-kreator-lacznik-katalog').querySelector('option[value="app-1"]')).not.toBeNull(),
  );
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-katalog'), 'app-1');
}

describe('KreatorLacznikaSekcyjnego — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Odcinek A' };
    snapshotState.error = null;
    snapshotState.snapshot = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    fetchMvApparatusTypesMock.mockClear();
  });

  afterEach(() => cleanup());

  it('wstawia łącznik na odcinku (operacja domenowa, insert_at RATIO)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await pick();

    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_section_switch_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.5 },
          catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
        }),
      );
    });
    // Pozycja normalna niezadeklarowana (domyślna) — ładunek jej NIE deklaruje (dawny
    // domyślny „closed" deklarował pozycję, której projektant nie wybrał).
    expect(executeDomainOperationMock.mock.calls[0][2]).not.toHaveProperty('normal_state');
    expect(executeDomainOperationMock.mock.calls[0][2]).not.toHaveProperty('close_ref');
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('wpisana nazwa trafia do operacji kluczem kontraktu `switch_name`', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    await userEvent.type(screen.getByTestId('mvd-kreator-lacznik-nazwa'), 'Wyłącznik odcinka 1');
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_section_switch_sn',
        expect.objectContaining({ switch_name: 'Wyłącznik odcinka 1' }),
      );
    });
    expect(executeDomainOperationMock.mock.calls[0][2]).not.toHaveProperty('name');
  });

  it('ustawia stan otwarty (NOP) i wysyła go w payloadzie', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-stan'), 'open');
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_section_switch_sn',
        expect.objectContaining({ normal_state: 'open' }),
      );
    });
  });

  it('uczciwy stan zerowy: bez odcinka zapis zablokowany', async () => {
    context = {};
    render(<KreatorLacznikaSekcyjnego />);
    // Montaż pobiera katalog aparatów SN (mikrotaski) — czekamy na realny stan
    // końcowy UI (opcja aparatu w selekcie katalogu), żeby aktualizacja stanu
    // domknęła się w act.
    await screen.findByRole('option', { name: /Rozłącznik SN/ });
    expect(screen.getByTestId('mvd-kreator-lacznik-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) —
   * TEN SAM mechanizm jak w `KreatorMagistralaSn.tsx`, powtórzony w tym pliku:
   * `zapisMozliwy` nie sprawdzał, czy katalog aparatów SN już doszedł.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × odcinek dostępny → zapis zablokowany z komunikatem', async () => {
    fetchMvApparatusTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorLacznikaSekcyjnego />);

    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-lacznik')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('aparat z gazem fluorowanym: pozycja ukryta w wyborze, nota cytuje powód backendu', async () => {
    const powod = 'Aparat Rozłącznik SF6 wykorzystuje gaz fluorowany (SF₆).';
    fetchMvApparatusTypesMock.mockReturnValueOnce(
      Promise.resolve([
        { id: 'app-sf6', name: 'Rozłącznik SF6', device_kind: 'ROZLACZNIK', medium: 'SF6', dopuszczony_do_nowych_pol: false, powod_blokady_nowych_pol_pl: powod, u_n_kv: 24, i_n_a: 630, breaking_capacity_ka: 20 },
        { id: 'app-1', name: 'Rozłącznik SN', device_kind: 'ROZLACZNIK', medium: 'VACUUM', dopuszczony_do_nowych_pol: true, u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
      ] as never),
    );
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    const wybor = screen.getByTestId('mvd-kreator-lacznik-katalog');
    expect(wybor.querySelector('option[value="app-sf6"]')).toBeNull();
    expect(wybor.querySelector('option[value="app-1"]')?.textContent).toContain('próżnia');
    expect(screen.getByTestId('mvd-kreator-lacznik-katalog-nota').textContent).toBe(
      `Ukryto pozycje niedopuszczone do obiektu projektowanego: 1. Przykład: ${powod}`,
    );
  });

  it.each([
    ['zamknięta', 'closed', null, { normal_state: 'closed' }],
    ['otwarta, close_ref pominięty', 'open', '', { normal_state: 'open' }],
    ['otwarta, close_ref wskazany', 'open', 'sw-nop', { normal_state: 'open', close_ref: 'sw-nop' }],
  ])('pozycja %s → ładunek operacji', async (_opis, stan, closeRef, oczekiwany) => {
    snapshotState.snapshot = {
      branches: [
        { ref_id: 'sw-nop', id: 'sw-nop', name: 'Łącznik NOP', type: 'switch', status: 'open', normal_state: 'open' },
        { ref_id: 'sw-2', id: 'sw-2', name: 'Łącznik 2', type: 'switch', status: 'closed', normal_state: 'closed' },
      ],
    };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await pick();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-stan'), stan);
    if (stan === 'open') {
      const wybor = screen.getByTestId('mvd-kreator-lacznik-close-wybor');
      // Kandydaci `close_ref` = punkty podziału modelu (z pozycji normalnej), nie każdy łącznik.
      expect(Array.from(wybor.querySelectorAll('option')).map((o) => o.getAttribute('value'))).toEqual(['', 'sw-nop']);
      if (closeRef) await userEvent.selectOptions(wybor, closeRef);
    } else {
      expect(screen.queryByTestId('mvd-kreator-lacznik-close-wybor')).toBeNull();
    }
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const ladunek = executeDomainOperationMock.mock.calls[0][2] as Record<string, unknown>;
    expect({ normal_state: ladunek.normal_state, ...(ladunek.close_ref ? { close_ref: ladunek.close_ref } : {}) }).toEqual(oczekiwany);
  });
});
