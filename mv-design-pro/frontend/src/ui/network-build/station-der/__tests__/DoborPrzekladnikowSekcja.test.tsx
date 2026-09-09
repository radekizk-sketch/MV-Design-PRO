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

import { wyczyscRejestrGotowosci } from '../../../../ui2/kryteria';
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
          kody_gotowosci: [],
          slad: [],
        },
        {
          kod: 'ct.wytrzymalosc_cieplna',
          nazwa_pl: 'Wytrzymałość cieplna zwarciowa',
          podstawa_pl: 'Ith ≥ Ik″·√tk — równoważność cieplna prądu zwarcia (IEC 61869-2).',
          werdykt: 'brak_danych',
          wymagane: null,
          dostepne: '20.0 kA / 1 s',
          komentarz_pl: 'Brakuje prądu zwarciowego, czasu jego trwania albo prądu cieplnego.',
          kody_gotowosci: [],
          slad: [],
        },
        {
          kod: 'ct.alf',
          nazwa_pl: 'Nasycenie rdzenia (bilans mocy wtórnej)',
          podstawa_pl: 'S2obl = S_aparatow + I2n²·Rp;  ALF_eff = ALF·(Sn + Sw)/(S2obl + Sw)',
          werdykt: 'brak_danych',
          wymagane: null,
          dostepne: null,
          komentarz_pl: 'Brak danych obwodu wtórnego przekładnika prądowego (długość, przekrój).',
          kody_gotowosci: ['ct.secondary_circuit_missing'],
          slad: [],
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

//: Rejestr gotowości minimalny — WYŁĄCZNIE kod użyty w testach czipów, żeby
//: asercja treści była jednoznaczna (nie zależy od pełnego kanonu backendu).
const REJESTR_GOTOWOSCI = {
  codes: [
    {
      code: 'ct.secondary_circuit_missing',
      area: 'protection',
      level: 'WARNING',
      priority: 2,
      message_pl: 'Brak danych obwodu wtórnego przekładnika prądowego (długość, przekrój).',
      fix_navigation: { panel: 'wizard', tab: 'pomiary', focus: 'ct_obwod_wtorny' },
    },
  ],
};

function zamontuj(odpowiedz: unknown = ODPOWIEDZ, ok = true, statusHttp = 200): void {
  global.fetch = vi.fn(async () => ({
    ok,
    status: statusHttp,
    json: async () => odpowiedz,
  })) as unknown as typeof fetch;
}

//: Mock rozgałęziony po URL — `pobierzRejestrGotowosci` woła INNĄ końcówkę niż
//: `fetchDoborPrzekladnikow`, więc odpowiedź musi zależeć od żądanej ścieżki
//: (blankietowy mock dałby rejestrowi kształt doboru i odwrotnie).
function zamontujZRejestrem(odpowiedzDoboru: unknown = ODPOWIEDZ): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/readiness/registry')) {
      return { ok: true, status: 200, json: async () => REJESTR_GOTOWOSCI };
    }
    return { ok: true, status: 200, json: async () => odpowiedzDoboru };
  }) as unknown as typeof fetch;
}

describe('DoborPrzekladnikowSekcja — rachunek zamiast nazwy katalogowej', () => {
  beforeEach(() => zamontuj());

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    // Rejestr gotowości jest pamiętany w module (singleton na sesję) — bez
    // czyszczenia jeden test „zaraża" kolejne swoim zamontowanym kształtem.
    wyczyscRejestrGotowosci();
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

describe('DoborPrzekladnikowSekcja — karta W3-B: kody gotowości i ślad jądra', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    wyczyscRejestrGotowosci();
  });

  it('kod gotowości kryterium ct.alf jest czipem z kanonicznym komunikatem PL', async () => {
    zamontujZRejestrem();
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const czipy = await screen.findByTestId('kryterium-kody-gotowosci-ct.alf');
    expect(czipy.textContent).toContain(
      'Brak danych obwodu wtórnego przekładnika prądowego (długość, przekrój).',
    );
    // Kod surowy (identyfikator produkcyjny) NIE trafia na ekran inżyniera.
    expect(czipy.textContent).not.toContain('ct.secondary_circuit_missing');
  });

  it('kryterium bez kodów gotowości nie renderuje listy czipów', async () => {
    zamontujZRejestrem();
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    await screen.findByTestId('kryterium-ct.przekladnia');
    expect(screen.queryByTestId('kryterium-kody-gotowosci-ct.przekladnia')).toBeNull();
  });

  it('kod bez rejestru (zapytanie o rejestr nieudane) nie wywraca sekcji doboru', async () => {
    // Rejestr może nie odpowiedzieć — dobór musi zostać czytelny bez czipów,
    // nie zniknąć razem z resztą ekranu (ta sama zasada co błąd doboru).
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/readiness/registry')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ODPOWIEDZ };
    }) as unknown as typeof fetch;

    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const wiersz = await screen.findByTestId('kryterium-ct.alf');
    expect(wiersz.textContent).toContain('brak danej');
    expect(screen.queryByTestId('kryterium-kody-gotowosci-ct.alf')).toBeNull();
  });

  it('ślad WHITE BOX jest rozwijalny i pokazuje kroki z jądra', async () => {
    zamontuj({
      ...ODPOWIEDZ,
      przekladnik_pradowy: {
        ...ODPOWIEDZ.przekladnik_pradowy,
        wynik: {
          kryteria: [
            {
              kod: 'ct.alf',
              nazwa_pl: 'Nasycenie rdzenia (bilans mocy wtórnej)',
              podstawa_pl: 'S2obl = S_aparatow + I2n²·Rp',
              werdykt: 'spelnione',
              wymagane: 'ALF_eff ≥ 9.0',
              dostepne: 'ALF_eff 15.5 (UPROSZCZONY_BEZ_RCT; S2obl 6.4 VA / Sn 10.0 VA)',
              komentarz_pl: null,
              kody_gotowosci: [],
              slad: [
                {
                  step: 1,
                  key: 'ct_rezystancja_przewodow',
                  title: 'Rezystancja przewodów obwodu wtórnego',
                  formula_latex: '$$R_p = \\frac{2 \\rho L}{s}$$',
                  substitution: '$$R_p = 0.14\\ \\Omega$$',
                  notes: 'Współczynnik 2 wynika z obwodu dwuprzewodowego.',
                },
              ],
            },
          ],
          dobor_potwierdzony: true,
          liczba_niespelnionych: 0,
          liczba_bez_danych: 0,
        },
      },
    });
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const slad = await screen.findByTestId('kryterium-slad-ct.alf');
    expect(slad.textContent).toContain('Rezystancja przewodów obwodu wtórnego');
    expect(slad.textContent).toContain('Współczynnik 2 wynika z obwodu dwuprzewodowego.');
  });

  it('kryterium bez śladu nie renderuje sekcji rozwijalnej', async () => {
    zamontujZRejestrem();
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    await screen.findByTestId('kryterium-ct.przekladnia');
    expect(screen.queryByTestId('kryterium-slad-ct.przekladnia')).toBeNull();
  });
});
