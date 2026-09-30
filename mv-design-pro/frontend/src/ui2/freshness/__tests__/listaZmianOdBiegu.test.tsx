/*
 * „Co unieważniło wynik" na karcie przypadku — ŚCIEŻKA REALNA (CV-2-W).
 *
 * DEFEKT, KTÓREGO PILNUJE TEN PLIK. Znacznik świeżości mówił projektantowi TYLKO
 * tyle, że wynik jest nieaktualny. Żeby zdecydować, czy przeliczać, musiał sam
 * odtworzyć z pamięci, co zrobił między biegiem a chwilą obecną — przy sieci z
 * kilkudziesięcioma elementami to wybór między liczeniem wszystkiego na ślepo a
 * rezygnacją z aktualizacji. Backend oddaje teraz PRZYCZYNĘ po polsku i LISTĘ
 * rewizji, które wynik unieważniły; ekran ma to pokazać BEZ własnych tłumaczeń.
 *
 * Dane przychodzą z ODPOWIEDZI SERWERA (`fetch` zaślepiony w kształcie
 * `GET /api/study-cases/{id}`), a nie z podstawionej listy w store — inaczej test
 * mierzyłby przepisanie propsa zamiast łańcucha kontrakt → ekran.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListaZmianOdBiegu } from '../ListaZmianOdBiegu';
import { getStudyCase } from '../../../ui/study-cases/api';
import type { StatusWynikowPrzypadku } from '../../../ui/study-cases/types';

const CASE_ID = 'case-zmiany';

const WERDYKT_MODEL: StatusWynikowPrzypadku = {
  result_status: 'OUTDATED',
  results_valid: false,
  result_status_reason: 'model-zmieniony',
  result_status_reason_pl: 'Model zmienił się po obliczeniu — wynik opisuje poprzedni stan sieci.',
  rewizja_biegu: 8,
  rewizja_biezaca: 10,
  zmiany_od_biegu: [
    {
      rewizja: 9,
      operacja: 'continue_trunk_segment_sn',
      opis_pl: 'Dołożono odcinek magistrali',
      elementy: ['LIN-2', 'BUS-3'],
    },
    {
      rewizja: 10,
      operacja: 'add_transformer_sn_nn',
      opis_pl: 'Dodano transformator SN/nN',
      elementy: ['TR-1'],
    },
  ],
};

const WERDYKT_KATALOG: StatusWynikowPrzypadku = {
  result_status: 'OUTDATED',
  results_valid: false,
  result_status_reason: 'katalog-zmieniony',
  result_status_reason_pl:
    'Biblioteka typów katalogowych zmieniła się po obliczeniu — parametry '
    + 'zmaterializowane w chwili biegu mogą różnić się od obowiązujących.',
  rewizja_biegu: 8,
  rewizja_biezaca: 8,
  zmiany_od_biegu: [],
};

const WERDYKT_SWIEZY: StatusWynikowPrzypadku = {
  result_status: 'FRESH',
  results_valid: true,
  result_status_reason: 'model-niezmieniony',
  result_status_reason_pl: 'Model nie zmienił się od chwili obliczenia.',
  rewizja_biegu: 8,
  rewizja_biezaca: 8,
  zmiany_od_biegu: [],
};

function studyCaseResponse(status: StatusWynikowPrzypadku) {
  return {
    id: CASE_ID,
    project_id: 'proj-1',
    name: 'Zwarcia maks.',
    description: '',
    config: {},
    is_active: true,
    revision: 3,
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-01T09:30:00Z',
    ...status,
  };
}

function stubFetch(status: StatusWynikowPrzypadku) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      if (String(input) === `/api/study-cases/${CASE_ID}`) {
        return { ok: true, status: 200, json: async () => studyCaseResponse(status) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ListaZmianOdBiegu — przyczyna i lista zmian z werdyktu serwera', () => {
  it('werdykt „model zmieniony": pokazuje przyczynę, parę rewizji i KAŻDĄ zmianę z elementami', async () => {
    stubFetch(WERDYKT_MODEL);
    const przypadek = await getStudyCase(CASE_ID);

    render(<ListaZmianOdBiegu status={przypadek} />);

    expect(screen.getByTestId('mvd-status-wynikow-przyczyna')).toHaveTextContent(
      'Model zmienił się po obliczeniu',
    );
    expect(screen.getByTestId('mvd-status-wynikow-rewizje')).toHaveTextContent('8');
    expect(screen.getByTestId('mvd-status-wynikow-rewizje')).toHaveTextContent('10');

    // Obie rewizje, obie nazwy operacji z kanonu, wszystkie elementy — nic nie ginie.
    expect(screen.getByTestId('mvd-status-zmiana-9')).toHaveTextContent(
      'Dołożono odcinek magistrali',
    );
    expect(screen.getByTestId('mvd-status-zmiana-9')).toHaveTextContent('LIN-2');
    expect(screen.getByTestId('mvd-status-zmiana-9')).toHaveTextContent('BUS-3');
    expect(screen.getByTestId('mvd-status-zmiana-10')).toHaveTextContent(
      'Dodano transformator SN/nN',
    );
    expect(screen.getByTestId('mvd-status-zmiana-10')).toHaveTextContent('TR-1');
  });

  it('werdykt „katalog zmieniony": TEKST Z BACKENDU mimo zgodnych rewizji i pustej listy', async () => {
    // Przypadek, w którym każde porównanie rewizji po stronie UI powiedziałoby
    // „aktualne" — jedyną informacją rozstrzygającą jest zdanie serwera.
    stubFetch(WERDYKT_KATALOG);
    const przypadek = await getStudyCase(CASE_ID);

    render(<ListaZmianOdBiegu status={przypadek} />);

    expect(screen.getByTestId('mvd-status-wynikow-przyczyna')).toHaveTextContent(
      'Biblioteka typów katalogowych zmieniła się po obliczeniu',
    );
    expect(screen.queryByTestId('mvd-status-zmiana-9')).toBeNull();
  });

  it('werdykt świeży: sama przyczyna, bez listy zmian (nie ma czego wyliczać)', async () => {
    stubFetch(WERDYKT_SWIEZY);
    const przypadek = await getStudyCase(CASE_ID);

    render(<ListaZmianOdBiegu status={przypadek} />);

    expect(screen.getByTestId('mvd-status-wynikow-przyczyna')).toHaveTextContent(
      'Model nie zmienił się od chwili obliczenia.',
    );
    expect(screen.queryByText('Co się zmieniło od tego wyniku')).toBeNull();
  });

  it('klient produkcyjny przenosi WSZYSTKIE pola werdyktu (kontrakt, nie fixture)', async () => {
    stubFetch(WERDYKT_MODEL);
    const przypadek = await getStudyCase(CASE_ID);

    await waitFor(() => {
      expect(przypadek.result_status).toBe('OUTDATED');
    });
    expect(przypadek.result_status_reason).toBe('model-zmieniony');
    expect(przypadek.rewizja_biegu).toBe(8);
    expect(przypadek.rewizja_biezaca).toBe(10);
    expect(przypadek.zmiany_od_biegu).toHaveLength(2);
  });
});
