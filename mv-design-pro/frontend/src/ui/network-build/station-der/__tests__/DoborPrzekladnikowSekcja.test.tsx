/**
 * Sekcja doboru przekładników na ekranie (E21-4, audyt E-21 pkt P9).
 *
 * Testy pilnują tego, co odróżnia DOBÓR od NAZWY KATALOGOWEJ: każde kryterium pokazuje
 * podstawę normową i rachunek (wymagane vs dostępne), brak danej jest widoczny jako
 * trzeci stan i NIE pozwala napisać „dobór potwierdzony", a brak wiązania to co innego
 * niż niespełnione kryterium. Ekran niczego nie liczy — treść pochodzi z reguły
 * domenowej, więc test podstawia odpowiedź endpointu i sprawdza, co ekran z nią robi.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DoborPrzekladnikowSekcja } from '../DoborPrzekladnikowSekcja';

const ODPOWIEDZ = {
  generator_ref: 'DER-1',
  bay_ref: 'BAY-1',
  wejscia: {
    napiecie_sieci_v: 20000.0,
    prad_roboczy_a: 154.0,
    ik_ka: null,
    ip_ka: null,
    run_ref_zwarciowy: null,
    tryb_uziemienia: 'cewka_petersena',
    zrodlo_napiecia_zerowego: 'otwarty_trojkat_vt',
    zrodlo_wejsc_urzadzenia: 'szereg_preferowany_IEC_60255_1',
  },
  przekladnik_pradowy: {
    catalog_ref: 'ct_200_5_5p10_10va_abb',
    nazwa: 'CT 200/5 A kl. 5P10 10 VA',
    wynik: {
      kryteria: [
        {
          kod: 'ct.przekladnia',
          nazwa_pl: 'Przekładnia wobec prądu roboczego toru',
          podstawa_pl: 'Prąd pierwotny przekładnika musi pokryć prąd roboczy toru.',
          werdykt: 'spelnione',
          wymagane: '154.0 A',
          dostepne: '200.0 A',
          komentarz_pl: null,
        },
        {
          kod: 'ct.wytrzymalosc_cieplna',
          nazwa_pl: 'Wytrzymałość cieplna zwarciowa',
          podstawa_pl: 'Ith ≥ Ik″·√tk — równoważność cieplna prądu zwarcia (IEC 61869-2).',
          werdykt: 'brak_danych',
          wymagane: null,
          dostepne: '20.0 kA / 1 s',
          komentarz_pl: 'Brakuje prądu zwarciowego, czasu jego trwania albo prądu cieplnego.',
        },
      ],
      dobor_potwierdzony: false,
      liczba_niespelnionych: 0,
      liczba_bez_danych: 1,
    },
  },
  przekladnik_napieciowy: {
    catalog_ref: null,
    nazwa: null,
    wynik: null,
  },
};

const originalFetch = global.fetch;

function zamontuj(odpowiedz: unknown = ODPOWIEDZ, ok = true, statusHttp = 200): void {
  global.fetch = vi.fn(async () => ({
    ok,
    status: statusHttp,
    json: async () => odpowiedz,
  })) as unknown as typeof fetch;
}

describe('DoborPrzekladnikowSekcja — rachunek zamiast nazwy katalogowej', () => {
  beforeEach(() => zamontuj());

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('każde kryterium pokazuje PODSTAWĘ i RACHUNEK: co wymaga tor, co daje typ', async () => {
    // Sedno pkt P9: sama nazwa „CT 200/5 A kl. 5P10" nie jest dowodem doboru.
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const rachunek = await screen.findByTestId('kryterium-rachunek-ct.przekladnia');
    expect(rachunek.textContent).toContain('wymagane: 154.0 A');
    expect(rachunek.textContent).toContain('dostępne: 200.0 A');

    const wiersz = screen.getByTestId('kryterium-ct.przekladnia');
    expect(wiersz.textContent).toContain('Prąd pierwotny przekładnika musi pokryć');
  });

  it('brak danej jest TRZECIM STANEM i blokuje „dobór potwierdzony"', async () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const werdykt = await screen.findByTestId('kryterium-werdykt-ct.wytrzymalosc_cieplna');
    expect(werdykt.textContent).toContain('brak danej');

    const podsumowanie = screen.getByTestId('dobor-przekladnik-pradowy-podsumowanie');
    expect(podsumowanie.textContent).toContain('niepotwierdzony');
    expect(podsumowanie.textContent).toContain('bez kompletu danych');
    // Kontrola odwrotna: przy zerze niespełnionych ekran NIE MOŻE ogłosić potwierdzenia.
    expect(podsumowanie.textContent).not.toContain('Wszystkie kryteria spełnione');
  });

  it('brak zakończonego przebiegu zwarciowego jest nazwany w danych wejściowych', async () => {
    // Bez tego projektant nie wie, DLACZEGO część kryteriów nie ma werdyktu.
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const wejscia = await screen.findByTestId('dobor-wejscia');
    expect(wejscia.textContent).toContain('brak zakończonego przebiegu');
    expect(wejscia.textContent).toContain('prąd roboczy toru 154 A');
    expect(wejscia.textContent).toContain('napięcie sieci 20.0 kV');
  });

  it('brak wiązania to NIE jest niespełnione kryterium', async () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const gniazdo = await screen.findByTestId('dobor-przekladnik-napieciowy-brak-wiazania');
    expect(gniazdo.textContent).toContain('nie jest wybrany');
  });

  it('dobór potwierdzony jest ogłaszany DOPIERO przy komplecie kryteriów', async () => {
    zamontuj({
      ...ODPOWIEDZ,
      przekladnik_pradowy: {
        ...ODPOWIEDZ.przekladnik_pradowy,
        wynik: {
          kryteria: [ODPOWIEDZ.przekladnik_pradowy.wynik.kryteria[0]],
          dobor_potwierdzony: true,
          liczba_niespelnionych: 0,
          liczba_bez_danych: 0,
        },
      },
    });
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const podsumowanie = await screen.findByTestId('dobor-przekladnik-pradowy-podsumowanie');
    expect(podsumowanie.textContent).toContain('Wszystkie kryteria spełnione');
  });

  it('bez projektu i przypadku obliczeniowego powód jest nazwany, a zapytania nie ma', () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId={null} caseId={null} />);
    expect(screen.getByTestId('dobor-brak-kontekstu')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('błąd pobrania jest POKAZANY, a nie zamieniony w brak kryteriów', async () => {
    // Pusta sekcja wyglądałaby jak „nie ma czego sprawdzać" — nieprawda groźniejsza
    // od komunikatu o błędzie (precedens V12K-252).
    zamontuj({}, false, 500);
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const blad = await screen.findByTestId('dobor-blad');
    expect(blad.textContent).toContain('500');
    expect(screen.queryByTestId('dobor-przekladnik-pradowy')).toBeNull();
  });

  it('odpowiedź o obcym kształcie NIE wywraca sekcji, tylko nazywa powód', async () => {
    zamontuj({ cos: 'zupelnie innego' });
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const blad = await screen.findByTestId('dobor-blad');
    expect(blad.textContent).toContain('nieoczekiwany kształt');
  });
});
