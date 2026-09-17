/**
 * Sekcja „Pozycje do przeglądu" — kontrakt prezentacji przeglądu wiarygodności.
 *
 * Testy pilnują trzech rzeczy, które łatwo zgubić przy zielonym wyniku:
 *  1. stan zerowy jest UCZCIWY — mówi, ile sprawdzeń policzono i ile pominięto,
 *     więc „brak pozycji" nie udaje „sprawdzono wszystko";
 *  2. ekran nazywa odstępstwo SYGNAŁEM, nie odmową (zdanie wprost z karty);
 *  3. wszystkie liczby i uzasadnienia pochodzą z odpowiedzi backendu — komponent
 *     nie ma własnej kopii progów ani reguł (zero fizyki w UI).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PozycjeDoPrzegladu } from '../PozycjeDoPrzegladu';
import * as catalogApi from '../api';
import type { PrzegladWiarygodnosci } from '../api';

vi.mock('../api', async (importOriginal) => {
  const oryginal = await importOriginal<typeof catalogApi>();
  return { ...oryginal, fetchPrzegladWiarygodnosci: vi.fn() };
});

const PRZEGLAD_BEZ_ODSTEPSTW: PrzegladWiarygodnosci = {
  liczba_odstepstw: 0,
  wedlug_kodu: {},
  rodziny: [
    {
      rodzina: 'aparaty-sn',
      etykieta_pl: 'Aparatura SN',
      liczba_pozycji: 48,
      sprawdzone_reguly: ['KAT-W-003'],
      pokrycie: [
        {
          kod: 'KAT-W-003',
          policzone: 28,
          pominiete: 20,
          powod_pominiecia: 'aparat bez dodatniej zdolnosci wylaczania',
        },
      ],
      liczba_odstepstw: 0,
      wedlug_kodu: {},
      odstepstwa: [],
    },
  ],
  rodziny_bez_regul: [
    { rodzina: 'ct', powod: 'Przekladnik pradowy: znamiona dokladnosci i przetezenia.' },
  ],
  reguly: [
    {
      kod: 'KAT-W-003',
      nazwa: 'Icw <= Icu aparatu SN',
      podstawa: 'IEC 62271-100 — Icw i Icu sa ODDZIELNYMI wielkosciami znamionowymi',
      uzasadnienie: 'Prad krotkotrwaly i zdolnosc wylaczania to rozne zdolnosci.',
    },
  ],
};

const PRZEGLAD_Z_ODSTEPSTWEM: PrzegladWiarygodnosci = {
  liczba_odstepstw: 1,
  wedlug_kodu: { 'KAT-W-002': 1 },
  rodziny: [
    {
      rodzina: 'transformatory',
      etykieta_pl: 'Transformatory',
      liczba_pozycji: 192,
      sprawdzone_reguly: ['KAT-W-002'],
      pokrycie: [
        {
          kod: 'KAT-W-002',
          policzone: 192,
          pominiete: 0,
          powod_pominiecia: 'transformator nie niesie strat',
        },
      ],
      liczba_odstepstw: 1,
      wedlug_kodu: { 'KAT-W-002': 1 },
      odstepstwa: [
        {
          kod: 'KAT-W-002',
          regula: 'P0 < Pk transformatora',
          pozycja_id: 'tr-podejrzany-630',
          opis_wartosci: 'P0 = 30.0 kW, Pk = 20.0 kW',
        },
      ],
    },
  ],
  rodziny_bez_regul: [],
  reguly: [
    {
      kod: 'KAT-W-002',
      nazwa: 'P0 < Pk transformatora',
      podstawa: 'Relacja typowa dla transformatorow rozdzielczych',
      uzasadnienie: 'Odwrocenie pary zwykle oznacza zamienione kolumny przy imporcie.',
    },
  ],
};

describe('PozycjeDoPrzegladu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stan zerowy podaje liczbe policzonych i pominietych sprawdzen', async () => {
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockResolvedValue(PRZEGLAD_BEZ_ODSTEPSTW);
    render(<PozycjeDoPrzegladu />);

    const podsumowanie = await screen.findByTestId('pozycje-do-przegladu-podsumowanie');
    expect(podsumowanie.textContent).toContain('Brak pozycji odbiegających');
    // Bez tych dwoch liczb „brak pozycji" bylby nierozroznialny od „nic nie policzono".
    expect(podsumowanie.textContent).toContain('Sprawdzeń policzonych: 28');
    expect(podsumowanie.textContent).toContain('pominiętych (reguła nie ma zastosowania): 20');
  });

  it('mowi wprost, ze odstepstwo jest sygnalem, a nie odmowa', async () => {
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockResolvedValue(PRZEGLAD_Z_ODSTEPSTWEM);
    render(<PozycjeDoPrzegladu />);

    const sekcja = await screen.findByTestId('pozycje-do-przegladu');
    expect(sekcja.textContent).toContain('sygnał do przeglądu karty producenta, nie odmowa');
    expect(sekcja.textContent).toContain('pozycja pozostaje dostępna do doboru');
  });

  it('po rozwinieciu pokazuje kod, pozycje i wartosci odstepstwa', async () => {
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockResolvedValue(PRZEGLAD_Z_ODSTEPSTWEM);
    render(<PozycjeDoPrzegladu />);

    await screen.findByTestId('pozycje-do-przegladu-podsumowanie');
    await userEvent.click(screen.getByTestId('pozycje-do-przegladu-przelacz'));

    const odstepstwo = await screen.findByTestId(
      'pozycje-do-przegladu-odstepstwo-tr-podejrzany-630',
    );
    expect(odstepstwo.textContent).toContain('KAT-W-002');
    expect(odstepstwo.textContent).toContain('P0 = 30.0 kW, Pk = 20.0 kW');
  });

  it('uzasadnienie reguly pochodzi z backendu, nie z kopii we froncie', async () => {
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockResolvedValue(PRZEGLAD_BEZ_ODSTEPSTW);
    render(<PozycjeDoPrzegladu />);

    await screen.findByTestId('pozycje-do-przegladu-podsumowanie');
    await userEvent.click(screen.getByTestId('pozycje-do-przegladu-przelacz'));

    const regula = await screen.findByTestId('pozycje-do-przegladu-regula-KAT-W-003');
    expect(regula.textContent).toContain('IEC 62271-100');
    expect(regula.textContent).toContain('Prad krotkotrwaly i zdolnosc wylaczania to rozne');
  });

  it('rodzina poza przegladem jest wymieniona z powodem', async () => {
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockResolvedValue(PRZEGLAD_BEZ_ODSTEPSTW);
    render(<PozycjeDoPrzegladu />);

    await screen.findByTestId('pozycje-do-przegladu-podsumowanie');
    await userEvent.click(screen.getByTestId('pozycje-do-przegladu-przelacz'));

    const rodzina = await screen.findByTestId('pozycje-do-przegladu-bez-regul-ct');
    expect(rodzina.textContent).toContain('znamiona dokladnosci');
  });

  it('blad backendu jest nazwany, a nie zamilczany', async () => {
    vi.mocked(catalogApi.fetchPrzegladWiarygodnosci).mockRejectedValue(
      new Error('Nie można połączyć się z API katalogów.'),
    );
    render(<PozycjeDoPrzegladu />);

    await waitFor(() => {
      expect(screen.getByTestId('pozycje-do-przegladu-blad').textContent).toContain(
        'Nie można połączyć się z API katalogów.',
      );
    });
  });
});
