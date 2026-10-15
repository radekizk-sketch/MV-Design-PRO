/**
 * Testy kreatora „Łącznik sekcyjny SN" — realna ścieżka użytkownika, Zero-Debt §5.
 *
 * Kanon prowadzenia projektanta (`KONTRAKT_PROWADZENIA_PROJEKTANTA.md`) — iloczyn cech
 * {stan: świeży / w trakcie / próba zapisu z brakiem / konflikt / komplet} ×
 * {źródło aparatu: jedyny zdatny (AUTO_PRZYJETE) / kilka (wybór projektanta)}.
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

/** Migawka z odcinkiem 15 kV — źródło napięcia dla doboru aparatu (topologia). */
function migawka(napiecieKv: number) {
  return {
    buses: [
      { id: 'b1', ref_id: 'b1', voltage_kv: napiecieKv },
      { id: 'b2', ref_id: 'b2', voltage_kv: napiecieKv },
    ],
    branches: [{ id: 'seg-1', ref_id: 'seg-1', from_bus_ref: 'b1', to_bus_ref: 'b2' }],
  };
}

const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: migawka(15) as unknown,
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

const ROZLACZNIK = {
  id: 'app-1', name: 'Rozłącznik SN', device_kind: 'ROZLACZNIK', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20,
};
const WYLACZNIK = {
  id: 'app-2', name: 'Wyłącznik SN', device_kind: 'WYLACZNIK', u_n_kv: 24, i_n_a: 630, breaking_capacity_ka: 16,
};

// `vi.hoisted` + `vi.fn()` (S9-5): pozwala nadpisać implementację per test.
const { fetchMvApparatusTypesMock } = vi.hoisted(() => ({
  fetchMvApparatusTypesMock: vi.fn(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchMvApparatusTypes: () => fetchMvApparatusTypesMock(),
}));

async function czekajNaKatalog() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-lacznik')).toHaveAttribute('data-status', 'gotowy');
  });
}

async function wybierzAparat(id: string) {
  await czekajNaKatalog();
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-katalog'), id);
}

describe('KreatorLacznikaSekcyjnego — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', segmentLabel: 'Odcinek A', position_on_segment: 0.4 };
    snapshotState.error = null;
    snapshotState.snapshot = migawka(15);
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    fetchMvApparatusTypesMock.mockReset();
    fetchMvApparatusTypesMock.mockImplementation(() => Promise.resolve([ROZLACZNIK, WYLACZNIK]));
  });

  afterEach(() => cleanup());

  it('świeży kreator: zero sygnałów pracy w toku (bez alertu, bez czerwieni, zapis klikalny)', async () => {
    render(<KreatorLacznikaSekcyjnego />);
    await czekajNaKatalog();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
    const panel = screen.getByTestId('mvd-kreator-lacznik-gotowosc');
    expect(panel.querySelector('[data-stan="konflikt"]')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).not.toBeDisabled();
  });

  it('wstawia łącznik na odcinku: położenie z kontekstu i rodzaj z pozycji katalogowej przyjęte automatycznie', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await wybierzAparat('app-1');
    // Wartości dobrane automatycznie stoją w polach jak zwykłe, edytowalne wartości.
    expect(screen.getByTestId('mvd-kreator-lacznik-polozenie')).toHaveValue(0.4);
    expect(screen.getByTestId('mvd-kreator-lacznik-rodzaj')).toHaveValue('ROZLACZNIK');
    expect(screen.getByTestId('mvd-kreator-lacznik-rodzaj')).toBeEnabled();
    expect(screen.queryByText(/przyjęto/)).toBeNull();

    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_section_switch_sn',
        expect.objectContaining({
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.4 },
          switch_type: 'ROZLACZNIK',
          normal_state: 'closed',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
        }),
      );
    });
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('wpisana nazwa trafia do operacji kluczem kontraktu `switch_name`', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorLacznikaSekcyjnego />);
    await wybierzAparat('app-1');
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
    await wybierzAparat('app-1');
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

  it('próba zapisu bez aparatu (kilka zdatnych): fokus na katalogu i jedno wskazanie z celem', async () => {
    render(<KreatorLacznikaSekcyjnego />);
    await czekajNaKatalog();
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-lacznik-katalog')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz aparat łącznika z katalogu SN — /);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('próba zapisu bez położenia (kontekst bez pozycji): wskazanie położenia, bez zgadywania połowy odcinka', async () => {
    context = { segment_id: 'seg-1', segmentLabel: 'Odcinek A' };
    render(<KreatorLacznikaSekcyjnego />);
    await wybierzAparat('app-1');
    expect((screen.getByTestId('mvd-kreator-lacznik-polozenie') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-lacznik-polozenie')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj położenie łącznika/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('jedyny aparat zdatny na napięcie odcinka stoi w polu; projektant może go zmienić', async () => {
    snapshotState.snapshot = migawka(20);
    render(<KreatorLacznikaSekcyjnego />);
    // Na 20 kV zdatny jest wyłącznie aparat 24 kV.
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-lacznik-katalog')).toHaveValue('app-2'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-katalog'), '');
    // Decyzja projektanta (wyczyszczenie) nie jest nadpisywana automatem.
    expect((screen.getByTestId('mvd-kreator-lacznik-katalog') as HTMLSelectElement).value).toBe('');
  });

  it('konflikt widoczny od razu: rodzaj aparatu niezgodny z pozycją katalogową', async () => {
    render(<KreatorLacznikaSekcyjnego />);
    await wybierzAparat('app-1');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-lacznik-rodzaj'), 'WYLACZNIK');
    expect(screen.getByRole('alert').textContent).toMatch(/różni się od rodzaju wybranej pozycji/);
    const panel = screen.getByTestId('mvd-kreator-lacznik-gotowosc');
    expect(panel.textContent).toContain('Rozłącznik SN');
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-lacznik-rodzaj')).toHaveFocus();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('konflikt widoczny od razu: położenie spoza odcinka', async () => {
    render(<KreatorLacznikaSekcyjnego />);
    await wybierzAparat('app-1');
    await userEvent.clear(screen.getByTestId('mvd-kreator-lacznik-polozenie'));
    await userEvent.type(screen.getByTestId('mvd-kreator-lacznik-polozenie'), '1.5');
    expect(screen.getByRole('alert').textContent).toMatch(/zakresie \(0, 1\)/);
    expect(
      screen.getByTestId('mvd-kreator-lacznik-gotowosc-Położenie').querySelector('[data-stan]'),
    ).toHaveAttribute('data-stan', 'konflikt');
  });

  it('bez wskazanego odcinka: zapis klikalny, a próba zapisu nazywa brak jednym zdaniem', async () => {
    context = {};
    render(<KreatorLacznikaSekcyjnego />);
    await czekajNaKatalog();
    expect(screen.getByTestId('mvd-kreator-lacznik-brak')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/Zaznacz na schemacie odcinek SN/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('bez aktywnego przypadku: próba zapisu wskazuje przypadek, operacja nie rusza', async () => {
    appState.activeCaseId = null;
    render(<KreatorLacznikaSekcyjnego />);
    await wybierzAparat('app-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-lacznik-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek obliczeniowy/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 (`karta_e2e_s95.md`, klasa: bramka enable bez sygnału gotowości) — katalog w drodze
   * to jedyny powód wyszarzenia zapisu w tym kreatorze (lista zamknięta ramy).
   */
  it('iloczyn cech: katalog jeszcze się ładuje × odcinek dostępny → zapis wyszarzony z powodem', async () => {
    fetchMvApparatusTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorLacznikaSekcyjnego />);

    expect(screen.getByTestId('mvd-kreator-lacznik-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-lacznik')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
