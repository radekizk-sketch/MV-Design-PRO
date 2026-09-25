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
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: null as { generators: Record<string, unknown>[] } | null,
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
    snapshotState.snapshot = null;
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

  // Dane modułu NC RfG generatora (plan AB O-50 pkt 5–6): ten sam formularz co kreator źródła
  // OZE, wypełniony z MODELU; zapis wyłącznie pól zmienionych (niezmienione nie nadpisują).
  describe('dane modułu NC RfG generatora', () => {
    const GENERATOR = {
      ref_id: 'gen-pv-1',
      modul_istniejacy: false,
      data_umowy_przylaczeniowej: '2024-01-15',
      nastawy_zabezpieczen: { f_min_hz: 47.5, f_min_czas_s: 0.5, zrodlo_pl: 'karta nastaw' },
      deklaracje_modulu: { has_scada_communication: true, ramp_rate_pct_per_min: 10, zrodlo_pl: 'karta katalogowa' },
    };
    const T = 'mvd-kreator-edycja-ncrfg';

    beforeEach(() => {
      context = { element_ref: GENERATOR.ref_id };
      snapshotState.snapshot = { generators: [GENERATOR] };
    });

    it('formularz wypełniony z modelu (art. 4, data, nastawy, flagi trójstanowe, liczby)', () => {
      render(<KreatorEdycjiParametrow />);
      expect(screen.getByTestId(`${T}-modul_istniejacy`)).toHaveValue('nie');
      expect(screen.getByTestId(`${T}-data_umowy_przylaczeniowej`)).toHaveValue('2024-01-15');
      expect(screen.getByTestId(`${T}-nastawa-f_min_hz`)).toHaveValue('47.5');
      expect(screen.getByTestId(`${T}-nastawa-zrodlo_pl`)).toHaveValue('karta nastaw');
      expect(screen.getByTestId(`${T}-flaga-has_scada_communication`)).toHaveValue('tak');
      // Brak deklaracji w modelu = „nie zadeklarowano", nigdy „nie".
      expect(screen.getByTestId(`${T}-flaga-has_disturbance_recorder`)).toHaveValue('nieustalone');
      expect(screen.getByTestId(`${T}-liczba-ramp_rate_pct_per_min`)).toHaveValue('10');
      expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
    });

    it('zmiana jednej deklaracji → zapis WYŁĄCZNIE bloku deklaracji (pozostałe pola bez nadpisania)', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorEdycjiParametrow />);
      await userEvent.selectOptions(screen.getByTestId(`${T}-flaga-has_disturbance_recorder`), 'nie');
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(Object.keys(payload.parameters)).toEqual(['deklaracje_modulu']);
      expect(payload.parameters.deklaracje_modulu).toMatchObject({
        has_scada_communication: true,
        has_disturbance_recorder: false,
        active_power_control_enabled: null,
        ramp_rate_pct_per_min: 10,
        zrodlo_pl: 'karta katalogowa',
      });
    });

    it('wyczyszczenie daty umowy → `null` (zdjęcie danej), nie pusty napis', async () => {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorEdycjiParametrow />);
      await userEvent.clear(screen.getByTestId(`${T}-data_umowy_przylaczeniowej`));
      await userEvent.click(screen.getByTestId('mvd-kreator-edycja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
      const payload = executeDomainOperationMock.mock.calls[0][2] as { parameters: Record<string, unknown> };
      expect(payload.parameters).toEqual({ data_umowy_przylaczeniowej: null });
    });

    it('deklaracja bez źródła → nazwany błąd pola, zapis zablokowany (backend odrzuciłby 422)', async () => {
      render(<KreatorEdycjiParametrow />);
      await userEvent.clear(screen.getByTestId(`${T}-zrodlo_deklaracji`));
      expect(screen.getByTestId(`${T}-zrodlo_deklaracji-blad`)).toHaveTextContent('źródło deklaracji');
      expect(screen.getByTestId('mvd-kreator-edycja-zapisz')).toBeDisabled();
      expect(executeDomainOperationMock).not.toHaveBeenCalled();
    });

    it('element niebędący generatorem → brak sekcji danych modułu', () => {
      context = { element_ref: 'tr-1' };
      render(<KreatorEdycjiParametrow />);
      expect(screen.queryByTestId('mvd-kreator-edycja-dane-modulu')).toBeNull();
    });
  });
});
