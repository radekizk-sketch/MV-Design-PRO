/**
 * Ekran „Werdykt projektowy" (karta F-K3, znalezisko Z3 audytu FLOW).
 *
 * METODA: mockowany jest GLOBALNY `fetch`, nie moduł `../api` — test ćwiczy realną
 * ścieżkę (adres końcówki, parsowanie, adapter, render), a nie ją omija. Pętla
 * decyzji ćwiczona NATYWNYM klikiem (Zero-Debt §5), nie `dispatchEvent`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EkranWerdyktu } from '../EkranWerdyktu';
import { WERDYKT_STRINGS as T } from '../strings';
import type { PozycjaWerdyktu, WerdyktResponse, ZrodloWerdyktu } from '../api';

const fetchMock = vi.fn();
const poprawWModeluMock = vi.fn();
const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: { activeCaseId: string | null }) => unknown) =>
    selector(appState),
}));

vi.mock('../../wzorzec', async (importOryginalu) => {
  const oryginal = await importOryginalu<typeof import('../../wzorzec')>();
  return {
    ...oryginal,
    // Hook wchodzi w store'y selekcji/powłoki — tu sprawdzamy KONTRAKT wywołania
    // (ref + typ elementu + rodzaj przekroczenia), samą nawigację ma własny test.
    usePoprawWModelu: () => poprawWModeluMock,
  };
});

function pozycja(over: Partial<PozycjaWerdyktu> = {}): PozycjaWerdyktu {
  return {
    kryterium_id: 'przewod.wytrzymalosc_zwarciowa',
    etap: 'E3/E4',
    nazwa_pl: 'Wytrzymalosc zwarciowa przewodu',
    warunek_pl: 'I_th <= I_th(1s) / sqrt(t)',
    norma_pl: 'IEC 60949 / PN-HD 60364-5-54',
    zrodlo: 'short_circuit_sn',
    element_rodzaj: 'galaz_liniowa',
    stan: 'NARUSZONE',
    liczba_ocenionych: 4,
    liczba_naruszen: 1,
    liczba_niesprawdzonych: 0,
    liczba_ostrzezen: 0,
    wiodacy_element_id: 'cable_A',
    wiodacy_opis_pl: 'Galaz Magistrala L-01: wymagany przekroj 79,8 mm2 wobec 70,0 mm2.',
    powod_kod: null,
    powod_pl: null,
    run_id: 'sc-1',
    ...over,
  };
}

function zrodlo(over: Partial<ZrodloWerdyktu> = {}): ZrodloWerdyktu {
  return {
    rodzaj: 'short_circuit_sn',
    run_id: 'sc-1',
    wykonano: '2026-07-25T10:00:00+00:00',
    snapshot_hash: 'abc',
    aktualny: true,
    dostepny: true,
    powod_pl: null,
    ...over,
  };
}

function odpowiedz(over: Partial<WerdyktResponse> = {}): WerdyktResponse {
  const pozycje = over.pozycje ?? [pozycja()];
  return {
    werdykt: 'NARUSZONE',
    case_id: 'case-1',
    model_hash: 'abc',
    pozycje,
    zrodla: [zrodlo()],
    podsumowanie: {
      spelnione: pozycje.filter((p) => p.stan === 'SPELNIONE').length,
      naruszone: pozycje.filter((p) => p.stan === 'NARUSZONE').length,
      niesprawdzone: pozycje.filter((p) => p.stan === 'NIESPRAWDZONE').length,
      nie_dotyczy: pozycje.filter((p) => p.stan === 'NIE_DOTYCZY').length,
      razem: pozycje.length,
    },
    zakres_poza_automatem: [
      {
        kryterium_pl: 'Selektywnosc i czulosc zabezpieczen',
        etap: 'E6',
        powod_pl: 'Ocena nalezy do projektanta na ekranie koordynacji.',
      },
    ],
    ...over,
  };
}

function odpowiedzOk(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  poprawWModeluMock.mockReset();
  appState.activeCaseId = 'case-1';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EkranWerdyktu — realna ścieżka danych', () => {
  it('woła końcówkę werdyktu z identyfikatorem aktywnego przypadku', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz()));

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-glowny')).toBeTruthy());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/quality/design-verdict');
    expect(url).toContain('case_id=case-1');
  });

  it('brak aktywnego przypadku → uczciwy stan zerowy, bez wołania końcówki', () => {
    appState.activeCaseId = null;

    render(<EkranWerdyktu />);

    expect(screen.getByTestId('mvd-werdykt-brak-przypadku')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd końcówki → komunikat, bez udawania werdyktu', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-blad')).toBeTruthy());
    expect(screen.queryByTestId('mvd-werdykt-glowny')).toBeNull();
  });
});

describe('EkranWerdyktu — kontrakt ekranu prowadzącego', () => {
  it('kryterium niesie warunek i odniesienie normowe', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz()));

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-glowny')).toBeTruthy());
    expect(screen.getByText('I_th <= I_th(1s) / sqrt(t)')).toBeTruthy();
    expect(screen.getByText('IEC 60949 / PN-HD 60364-5-54')).toBeTruthy();
  });

  it('trzy stany są rozróżnialne — niesprawdzone nie jest spełnieniem', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          werdykt: 'NIESPRAWDZONE',
          pozycje: [
            pozycja({ kryterium_id: 'napiecie.odchylenie', stan: 'SPELNIONE', liczba_naruszen: 0 }),
            pozycja({
              kryterium_id: 'pwp.moc_przylaczeniowa',
              stan: 'NIESPRAWDZONE',
              liczba_ocenionych: 0,
              liczba_naruszen: 0,
              liczba_niesprawdzonych: 1,
              wiodacy_element_id: null,
              wiodacy_opis_pl: null,
              powod_kod: 'verdict.run_missing',
              powod_pl: 'Brak zakonczonego biegu rozplywu mocy.',
            }),
          ],
        }),
      ),
    );

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-glowny')).toBeTruthy());
    expect(screen.getByText(T.werdyktNiesprawdzone)).toBeTruthy();
    const stany = screen.getAllByTestId('mvd-werdykt-stan').map((el) => el.textContent);
    expect(stany).toContain(T.stanSpelnione);
    expect(stany).toContain(T.stanNiesprawdzone);
    // Przyczyna braku oceny jest widoczna — inaczej stan byłby nie do odróżnienia.
    expect(screen.getByText('Brak zakonczonego biegu rozplywu mocy.')).toBeTruthy();
  });

  it('nieaktualny bieg jest oznaczony jako unieważniony wobec modelu', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          model_hash: 'po-zmianie',
          zrodla: [zrodlo({ aktualny: false, dostepny: false, powod_pl: null })],
        }),
      ),
    );

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-glowny')).toBeTruthy());
    expect(screen.getByTestId('mvd-werdykt-zrodlo-short_circuit_sn')).toBeTruthy();
    expect(screen.getByText(T.zrodloNieaktualny)).toBeTruthy();
  });

  it('zakres poza automatem jest jawny — werdykt nie udaje kompletności', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz()));

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-zakres')).toBeTruthy());
    expect(screen.getByText('Selektywnosc i czulosc zabezpieczen')).toBeTruthy();
    expect(screen.getByText('Ocena nalezy do projektanta na ekranie koordynacji.')).toBeTruthy();
  });
});

describe('EkranWerdyktu — pętla decyzji', () => {
  it('naruszone kryterium prowadzi do elementu wiodącego w modelu', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz()));

    render(<EkranWerdyktu />);
    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-popraw')).toBeTruthy());
    await userEvent.click(screen.getByTestId('mvd-werdykt-popraw'));

    expect(poprawWModeluMock).toHaveBeenCalledWith('cable_A', 'LineBranch', 'cable_A', undefined);
  });

  it('kryterium bez elementu modelu nie pokazuje przycisku prowadzącego w nikąd', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          pozycje: [
            pozycja({
              kryterium_id: 'straty.budzet',
              element_rodzaj: null,
              wiodacy_element_id: null,
              stan: 'NARUSZONE',
            }),
          ],
        }),
      ),
    );

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-glowny')).toBeTruthy());
    expect(screen.queryByTestId('mvd-werdykt-popraw')).toBeNull();
  });

  it('spełnione kryterium nie ma akcji naprawczej (nie ma czego naprawiać)', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          werdykt: 'SPELNIONE',
          pozycje: [pozycja({ stan: 'SPELNIONE', liczba_naruszen: 0 })],
        }),
      ),
    );

    render(<EkranWerdyktu />);

    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-glowny')).toBeTruthy());
    expect(screen.queryByTestId('mvd-werdykt-popraw')).toBeNull();
  });

  it('kryterium napięciowe używa kontekstowej akcji rodzaju „napiecie"', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          pozycje: [
            pozycja({
              kryterium_id: 'napiecie.odchylenie',
              element_rodzaj: 'szyna',
              wiodacy_element_id: 'BUS-02',
            }),
          ],
        }),
      ),
    );

    render(<EkranWerdyktu />);
    await waitFor(() => expect(screen.getByTestId('mvd-werdykt-popraw')).toBeTruthy());
    await userEvent.click(screen.getByTestId('mvd-werdykt-popraw'));

    expect(poprawWModeluMock).toHaveBeenCalledWith('BUS-02', 'Bus', 'BUS-02', 'napiecie');
  });
});
