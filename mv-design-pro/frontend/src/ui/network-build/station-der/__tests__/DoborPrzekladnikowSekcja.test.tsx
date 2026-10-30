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
import { zdanieKodowBezRejestru } from '../../../../ui2/kryteria/rejestrGotowosci';
import FIXTURA from '../../../../harness-fixtures/generated/wiazania_scena_przekladniki.json';
import {
  DoborPrzekladnikowSekcja,
  type DoborPrzekladnikow,
  type KryteriumDoboru,
  type WynikDoboru,
} from '../DoborPrzekladnikowSekcja';

//: Odpowiedź końcówki doboru wygenerowana przez BACKEND (`eksport_fixtur_harnessu.py
//: --tylko wiazania_scena_przekladniki`, pilnowana przez `tests/ci/test_fixtury_harnessu.py`)
//: — rekordy werdyktu wyjaśnialnego są realne, nie ręcznie zmyślone w teście.
const ODPOWIEDZ = FIXTURA as unknown as DoborPrzekladnikow;
const KRYTERIA_CT = ODPOWIEDZ.przekladnik_pradowy.wynik!.kryteria;

function kryterium(kod: string): KryteriumDoboru {
  const znalezione = KRYTERIA_CT.find((k) => k.kod === kod);
  if (!znalezione) throw new Error(`fixtura bez kryterium ${kod}`);
  return znalezione;
}

function zWynikiem(wynik: Partial<WynikDoboru>): DoborPrzekladnikow {
  return {
    ...ODPOWIEDZ,
    przekladnik_pradowy: {
      ...ODPOWIEDZ.przekladnik_pradowy,
      wynik: { ...ODPOWIEDZ.przekladnik_pradowy.wynik!, ...wynik },
    },
  };
}

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
    expect(rachunek.textContent).toContain(`wymagane: ${kryterium('ct.przekladnia').wymagane}`);
    expect(rachunek.textContent).toContain(`dostępne: ${kryterium('ct.przekladnia').dostepne}`);
    // Liczby po polsku (przecinek dziesiętny) — tekst przychodzi z reguły domenowej.
    expect(rachunek.textContent).toContain('38,49 A');

    const wiersz = screen.getByTestId('kryterium-ct.przekladnia');
    expect(wiersz.textContent).toContain('Prąd pierwotny przekładnika musi pokryć');
  });

  it('brak danej jest TRZECIM STANEM i blokuje „dobór potwierdzony"', async () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const werdykt = await screen.findByTestId('kryterium-werdykt-ct.wytrzymalosc_cieplna');
    // Etykieta Z REKORDU backendu, status maszynowy wyłącznie jako atrybut.
    const ocena = kryterium('ct.wytrzymalosc_cieplna').ocena;
    expect(werdykt.textContent).toBe(ocena.etykieta.etykieta_pl);
    expect(werdykt.getAttribute('data-status')).toBe('NIE_OCENIONO');
    expect(werdykt.textContent).not.toContain('NIE_OCENIONO');
    // Karta rekordu nazywa, czego brakuje (brak danych ≠ spełnia).
    const karta = screen.getByTestId('kryterium-ocena-ct.wytrzymalosc_cieplna');
    expect(ocena.wyjasnienie.czego_brakuje.length).toBeGreaterThan(0);
    expect(karta.textContent).toContain(ocena.wyjasnienie.zdanie_pl);

    const podsumowanie = screen.getByTestId('dobor-przekladnik-pradowy-podsumowanie');
    expect(podsumowanie.textContent).toContain('niepotwierdzony');
    expect(podsumowanie.textContent).toContain('bez kompletu danych');
    // Kontrola odwrotna: przy zerze niespełnionych ekran NIE MOŻE ogłosić potwierdzenia.
    expect(podsumowanie.textContent).not.toContain('Wszystkie kryteria spełnione');
  });

  it('brak zakończonego przebiegu zwarciowego jest nazwany w danych wejściowych', async () => {
    // Bez tego projektant nie wie, DLACZEGO część kryteriów nie ma werdyktu.
    zamontuj({
      ...ODPOWIEDZ,
      wejscia: { ...ODPOWIEDZ.wejscia, ik_ka: null, ip_ka: null, run_ref_zwarciowy: null },
    });
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const wejscia = await screen.findByTestId('dobor-wejscia');
    expect(wejscia.textContent).toContain('brak zakończonego przebiegu');
    expect(wejscia.textContent).toContain('prąd roboczy toru 38 A');
    expect(wejscia.textContent).toContain('napięcie sieci 15,0 kV');
  });

  it('dane wejściowe z przebiegu zwarciowego są liczbami po polsku', async () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const wejscia = await screen.findByTestId('dobor-wejscia');
    expect(wejscia.textContent).toContain('Ik″ 9,04 kA z obliczeń zwarciowych');
    expect(wejscia.textContent).not.toMatch(/\d\.\d+ (kV|kA|A)\b/);
  });

  it('brak wiązania to NIE jest niespełnione kryterium', async () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const gniazdo = await screen.findByTestId('dobor-przekladnik-napieciowy-brak-wiazania');
    expect(gniazdo.textContent).toContain('nie jest wybrany');
  });

  it('dobór potwierdzony jest ogłaszany DOPIERO przy komplecie kryteriów', async () => {
    zamontuj(
      zWynikiem({
        kryteria: [kryterium('ct.przekladnia')],
        informacje: [],
        dobor_potwierdzony: true,
        liczba_niespelnionych: 0,
        liczba_bez_danych: 0,
      }),
    );
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

  it('kryterium bez pól karty W3-B (kody_gotowosci, slad) to nazwany błąd kształtu, nie biały ekran', async () => {
    // KLASA (E2E-FULL-FIX-3, 2026-09-10): atrapa harnessu sprzed W3-B nie niosła
    // `kody_gotowosci`/`slad`; `kryterium.slad.length` na `undefined` wywracało całą
    // kartę gotowości wytwórcy. Kształt kryterium jest SPRAWDZANY, nie zakładany.
    const kryteriaBezPolW3B = KRYTERIA_CT.map(
      ({ kody_gotowosci: _kody, slad: _slad, ...reszta }) => reszta,
    );
    zamontuj(zWynikiem({ kryteria: kryteriaBezPolW3B as unknown as KryteriumDoboru[] }));
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const blad = await screen.findByTestId('dobor-blad');
    expect(blad.textContent).toContain('nieoczekiwany kształt');
    expect(screen.queryByTestId('dobor-przekladnik-pradowy')).toBeNull();
  });

  it('kryterium bez rekordu werdyktu (sam status) to nazwany błąd kształtu', async () => {
    // Kontrakt werdyktu wyjaśnialnego: status bez wyjaśnienia jest błędem kontraktu,
    // nie stanem do pokazania. Odpowiedź w starym kształcie (`werdykt` zamiast `ocena`)
    // nie może się wyrenderować jako goły napis statusu.
    const kryteriaStare = KRYTERIA_CT.map(({ ocena: _ocena, wyjasnienie: _w, ...reszta }) => ({
      ...reszta,
      werdykt: 'spelnione',
    }));
    zamontuj(zWynikiem({ kryteria: kryteriaStare as unknown as KryteriumDoboru[] }));
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const blad = await screen.findByTestId('dobor-blad');
    expect(blad.textContent).toContain('nieoczekiwany kształt');
  });
});

describe('DoborPrzekladnikowSekcja — werdykt wyjaśnialny (iloczyn: status × tekst karty)', () => {
  beforeEach(() => zamontuj());

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    wyczyscRejestrGotowosci();
  });

  //: Iloczyn cech: każde kryterium fixtury (spełnione / nieocenione z brakiem danej /
  //: z kodem gotowości) × treść karty (etykieta z rekordu, zdanie, brak surowych kodów,
  //: brak None/true, liczby po polsku).
  it.each(KRYTERIA_CT.map((k) => [k.kod, k.ocena.status_maszynowy] as const))(
    'kryterium %s (%s) pokazuje etykietę i kartę rekordu bez surowych kodów',
    async (kod) => {
      render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
      const ocena = kryterium(kod).ocena;
      const plakietka = await screen.findByTestId(`kryterium-werdykt-${kod}`);
      expect(plakietka.textContent).toBe(ocena.etykieta.etykieta_pl);
      expect(plakietka.getAttribute('data-status')).toBe(ocena.status_maszynowy);
      const karta = screen.getByTestId(`kryterium-ocena-${kod}`);
      expect(karta.textContent).toContain(ocena.wyjasnienie.zdanie_pl);
      const wiersz = screen.getByTestId(`kryterium-${kod}`).textContent ?? '';
      for (const surowy of [
        'SPELNIA', 'NIE_SPELNIA', 'NIE_OCENIONO', 'BRAK_DOWODU', 'NIEPELNY', 'ESTIMATED',
        'PASS', 'FAIL', 'UNAVAILABLE', 'UPROSZCZONY_BEZ_RCT', 'None', 'null', 'undefined',
      ]) {
        expect(wiersz).not.toContain(surowy);
      }
      expect(wiersz).not.toMatch(/\btrue\b|\bfalse\b/);
      expect(wiersz).not.toMatch(/\d\.\d+ ?(A|kA|VA|kV|%|Ω)\b/);
    },
  );

  it('fixtura obejmuje oba stany: spełnione i nieocenione z powodu braku danej', () => {
    // Strażnik iloczynu: bez obu stanów test parametryczny wyżej sprawdzałby jeden.
    const statusy = new Set(KRYTERIA_CT.map((k) => k.ocena.status_maszynowy));
    expect(statusy.has('SPELNIA')).toBe(true);
    expect(statusy.has('NIE_OCENIONO')).toBe(true);
  });

  it('kryterium niespełnione pokazuje etykietę rekordu NIE_SPELNIA', async () => {
    // Stan „niespełnione" nie występuje w scenie fixtury — rekord przestawiony na
    // niespełnienie (etykieta poziomu K z `werdykt/etykiety.py`) zachowuje resztę
    // wyjaśnienia; ekran musi pokazać ETYKIETĘ rekordu, nie własny napis.
    const bazowe = kryterium('ct.przekladnia');
    const niespelnione: KryteriumDoboru = {
      ...bazowe,
      ocena: {
        ...bazowe.ocena,
        status_maszynowy: 'NIE_SPELNIA',
        etykieta: { etykieta_pl: 'Kryterium naruszone', semantyka: 'negatywna' },
      } as KryteriumDoboru['ocena'],
    };
    zamontuj(zWynikiem({ kryteria: [niespelnione], liczba_niespelnionych: 1 }));
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const plakietka = await screen.findByTestId('kryterium-werdykt-ct.przekladnia');
    expect(plakietka.textContent).toBe('Kryterium naruszone');
    expect(plakietka.getAttribute('data-status')).toBe('NIE_SPELNIA');
    const podsumowanie = screen.getByTestId('dobor-przekladnik-pradowy-podsumowanie');
    expect(podsumowanie.textContent).toContain('1 kryteriów niespełnionych');
  });

  it('pozycje informacyjne są osobną listą BEZ statusu', async () => {
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const lista = await screen.findByTestId('dobor-przekladnik-pradowy-informacje');
    const informacje = ODPOWIEDZ.przekladnik_pradowy.wynik!.informacje;
    expect(informacje.length).toBeGreaterThan(0);
    for (const informacja of informacje) {
      const wiersz = screen.getByTestId(`informacja-${informacja.kod}`);
      expect(wiersz.textContent).toContain(informacja.nazwa_pl);
      expect(wiersz.querySelector('[data-status]')).toBeNull();
      // Informacja nie jest kryterium — nie ma plakietki werdyktu.
      expect(screen.queryByTestId(`kryterium-werdykt-${informacja.kod}`)).toBeNull();
    }
    expect(lista.textContent).toContain('bez oceny zgodności');
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

  it('kod bez rejestru (zapytanie o rejestr nieudane) nie wywraca sekcji doboru i nie znika bez śladu', async () => {
    // Rejestr może nie odpowiedzieć — dobór musi zostać czytelny, nie zniknąć razem
    // z resztą ekranu (ta sama zasada co błąd doboru). Kanon NCRFG-LADOWANIE
    // (`komunikatyKodow`): nieodczytany rejestr przy niepustych kodach to zdanie
    // o nierozwiązanych ograniczeniach gotowości, nie pusta lista (cisza udawałaby
    // wynik bez ograniczeń) — i nadal bez surowego identyfikatora kodu.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/readiness/registry')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ODPOWIEDZ };
    }) as unknown as typeof fetch;

    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);
    const wiersz = await screen.findByTestId('kryterium-ct.alf');
    expect(wiersz.textContent).toContain(kryterium('ct.alf').ocena.etykieta.etykieta_pl);
    const czipy = await screen.findByTestId('kryterium-kody-gotowosci-ct.alf');
    expect(czipy.textContent).toBe(zdanieKodowBezRejestru(1));
    expect(czipy.textContent).not.toContain('ct.secondary_circuit_missing');
  });

  it('ślad WHITE BOX jest rozwijalny i pokazuje kroki z jądra', async () => {
    zamontuj(
      zWynikiem({
        kryteria: [
          {
            ...kryterium('ct.alf'),
            slad: [
              {
                step: 1,
                key: 'ct_rezystancja_przewodow',
                title: 'Rezystancja przewodów obwodu wtórnego',
                formula_latex: 'R_p = \\frac{2 \\rho L}{s}',
                // Kontrakt pól kroku (karta DOWOD-CIEPLNY): LaTeX goły w `substitution_latex`.
                substitution_latex: 'R_p = 0{,}14\\ \\Omega',
                notes: 'Współczynnik 2 wynika z obwodu dwuprzewodowego.',
              },
            ],
          },
        ],
      }),
    );
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    const slad = await screen.findByTestId('kryterium-slad-ct.alf');
    expect(slad.textContent).toContain('Rezystancja przewodów obwodu wtórnego');
    expect(slad.textContent).toContain('Współczynnik 2 wynika z obwodu dwuprzewodowego.');
    // Podstawienie idzie przez KaTeX, nie jako surowy zapis LaTeX (karta DOWOD-CIEPLNY).
    expect(slad.querySelector('[data-testid="math-rendered"]')).not.toBeNull();
    expect(slad.querySelector('[data-testid="math-fallback"]')).toBeNull();
  });

  it('kryterium bez śladu nie renderuje sekcji rozwijalnej', async () => {
    zamontujZRejestrem();
    render(<DoborPrzekladnikowSekcja derId="DER-1" projectId="PRJ-1" caseId="CASE-1" />);

    await screen.findByTestId('kryterium-ct.wytrzymalosc_cieplna');
    expect(kryterium('ct.wytrzymalosc_cieplna').slad).toHaveLength(0);
    expect(screen.queryByTestId('kryterium-slad-ct.wytrzymalosc_cieplna')).toBeNull();
  });
});
