/**
 * Testy KARTY WERDYKTU (kontrakt werdyktu wyjaśnialnego §4, §5, §9; karta AB-1a Pakiet D1).
 *
 * FIKSTURY — LUSTRO `backend/tests/werdykt/fabryki.py`. Fabryki poniżej budują rekordy
 * z KSZTAŁTU kontraktu (`werdykt.ts` ↔ `backend/src/werdykt/kontrakt.py`), z tymi samymi
 * wielkościami wzorcowymi (czas aktywacji prądu biernego ≤ 40 ms, odbudowa mocy ≥ 90 %,
 * pasmo 48–52 Hz, obwiednia dolna 0,25 → 0,75 p.u. (U_n), pozostanie w pracy) i tymi samymi,
 * dwójkowo-dokładnymi liczbami. Pola wyprowadzane regułą (status, kompletność, etykieta,
 * margines, zdanie, przyczyna, braki, zastrzeżenia) są PRZEPISANE DOSŁOWNIE z rekordów, które
 * zbudowały tamte fabryki przez `ocen_kryterium` / `zagreguj_wymaganie` — to są rekordy,
 * które walidator backendu przyjmuje (sprawdzone `OcenaKryterium.model_validate` /
 * `WynikWymagania.model_validate` na zrzucie tych fikstur). Liczby NIE pochodzą z profilu
 * regulacyjnego — to dane testowe.
 *
 * Interakcje wyłącznie ścieżką natywną (`userEvent`: klik i klawiatura), bez `dispatchEvent`
 * (CLAUDE.md Zero-Debt pkt 5). LaTeX renderuje prawdziwy `MathRenderer` (KaTeX) — tak jak
 * w istniejących testach `ui/proof` i `wzorzec/sladSekcyjny` (bez atrapy: atrapa ukryłaby
 * przekazanie niewłaściwego pola `*_latex`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { EtykietaWerdyktu, KartaWerdyktu, SEMANTYKA_KOLOR } from '../KartaWerdyktu';
import type {
  DanaPrzyjeta,
  Etykieta,
  OcenaKryterium,
  OdnosnikSladu,
  PodstawaWymagania,
  Przedmiot,
  SemantykaEtykiety,
  StanDanych,
  StanZrodla,
  StatusDanych,
  StatusDowodu,
  StatusModelu,
  StatusWerdyktu,
  Stosowalnosc,
  Wielkosc,
  WynikWymagania,
  ZakresWaznosci,
} from '../werdykt';

// ---------------------------------------------------------------------------
// Fabryki części rekordu (lustro `fabryki.py`: podstawa, wielkosc, dana_przyjeta, …)
// ---------------------------------------------------------------------------

export function podstawa(
  stan: StanZrodla = 'ZWERYFIKOWANE',
  opcje: { readonly dokument?: string; readonly jednostka?: string } = {},
): PodstawaWymagania {
  if (stan === 'NIEUSTALONE') {
    return {
      rodzaj: 'NIEUSTALONA',
      dokument: 'Profil zastany operatorów (pochodzenie nieustalone)',
      wydanie: null,
      jednostka_redakcyjna: null,
      status: 'NIEUSTALONE',
      uwagi_pl: 'wartość przeniesiona z dawnych profili',
    };
  }
  return {
    rodzaj: 'PROCEDURA_PTPIREE',
    dokument: opcje.dokument ?? 'Procedura testowania modułów wytwarzania energii',
    wydanie: '3.0',
    jednostka_redakcyjna: opcje.jednostka ?? 'pkt 5.3',
    status: stan,
    uwagi_pl: null,
  };
}

/** `fabryki.podstawa_warunku()` — podstawa warunku wstępnego (obwiednia z profilu OSD). */
export function podstawaWarunku(stan: StanZrodla = 'ZWERYFIKOWANE'): PodstawaWymagania {
  return podstawa(stan, { dokument: 'Profil wymagań OSD — obwiednia zapadu', jednostka: 'tab. 4' });
}

/** Podstawa limitu wzorcowego (`fabryki.limit`: „Warunki przyłączenia OSD”, pkt 7.2). */
export function podstawaLimitu(stan: StanZrodla = 'ZWERYFIKOWANE'): PodstawaWymagania {
  return podstawa(stan, { dokument: 'Warunki przyłączenia OSD', jednostka: 'pkt 7.2' });
}

export function wielkosc(wartosc: number, jednostka: string): Wielkosc {
  return { wartosc, jednostka };
}

export function danaPrzyjeta(): DanaPrzyjeta {
  return {
    nazwa_pl: 'moc zwarciowa sieci S_k″',
    wartosc: wielkosc(120, 'MVA'),
    powod_pl: 'założona do czasu otrzymania warunków przyłączenia',
    jakosc: 'ESTIMATED',
  };
}

export function statusDanych(stan: StanDanych = 'ZWALIDOWANE'): StatusDanych {
  return stan === 'ZWALIDOWANE'
    ? { stan: 'ZWALIDOWANE', dane_przyjete: [] }
    : { stan: 'UNVALIDATED_INPUT', dane_przyjete: [danaPrzyjeta()] };
}

/** `fabryki.dowod()` — domyślnie deklaracja konfiguracji. */
export function dowodDeklaracji(): StatusDowodu {
  return {
    metoda: 'DEKLARACJA',
    poziom: 'DECLARATION',
    rodzaj_twierdzenia: 'DECLARED_CONFIGURATION',
    status_modelu: 'NIE_DOTYCZY',
    status_danych: statusDanych(),
    odniesienie: 'bieg-001',
    // Deklaracja nie jest biegiem — domena walidacji silnika jej nie dotyczy (`null`).
    w_domenie_walidacji: null,
    domena_pl: null,
  };
}

/** `fabryki.DOMENA_WALIDACJI` — domena walidacji silnika w dowodach symulacji. */
export const DOMENA_WALIDACJI = 'D-11: SCR 3–20, X/R 2–15, zapad 0,05–0,9 p.u. (U_n)';

/**
 * `fabryki.dowod_symulacji()` — symulacja zwalidowana, model zwalidowany testem, bieg
 * w zadeklarowanej domenie walidacji (`wDomenie: null` — dowód wymagania bez własnego biegu).
 */
export function dowodSymulacji(
  opcje: {
    readonly statusModelu?: StatusModelu;
    readonly stanDanych?: StanDanych;
    readonly wDomenie?: boolean | null;
  } = {},
): StatusDowodu {
  const wDomenie = opcje.wDomenie === undefined ? true : opcje.wDomenie;
  return {
    metoda: 'SYMULACJA',
    poziom: 'VALIDATED_SIMULATION',
    rodzaj_twierdzenia: 'DYNAMIC_PERFORMANCE',
    status_modelu: opcje.statusModelu ?? 'VALIDATED_AGAINST_TEST',
    status_danych: statusDanych(opcje.stanDanych),
    odniesienie: 'bieg-001',
    w_domenie_walidacji: wDomenie,
    domena_pl: wDomenie === null ? null : DOMENA_WALIDACJI,
  };
}

export function przedmiot(): Przedmiot {
  return {
    element_ref: 'gen-pv-01',
    nazwa_pl: 'Moduł PV 2 MW',
    opis_pl: 'Moduł parku energii typu B przyłączony do sieci SN',
  };
}

export function stosowalnosc(dotyczy = true): Stosowalnosc {
  return {
    typ_modulu: 'B',
    technologia: 'PPM',
    modul_istniejacy: false,
    dotyczy,
    powod_pl: dotyczy
      ? 'wymaganie dotyczy modułów parku energii typu B'
      : 'wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny',
    podstawa: null,
    warunek_wstepny_nieuruchomiony: false,
  };
}

export function zakres(
  opcje: {
    readonly rodzaj?: 'RMS_DYNAMICS' | null;
    readonly wykluczenia?: readonly string[];
    readonly parametrySieci?: readonly DanaPrzyjeta[];
  } = {},
): ZakresWaznosci {
  return {
    rodzaj_analizy: opcje.rodzaj === undefined ? 'RMS_DYNAMICS' : opcje.rodzaj,
    opis_pl: 'RMS składowa zgodna, zwarcie trójfazowe',
    technologia: null,
    model_urzadzenia: null,
    symetria_zaklocenia: 'zwarcie trójfazowe',
    parametry_sieci: opcje.parametrySieci ?? [],
    regulator: null,
    ograniczniki: [],
    wykluczenia: opcje.wykluczenia ?? ['zwarcia niesymetryczne'],
  };
}

export function slad(): readonly OdnosnikSladu[] {
  return [
    {
      run_id: 'bieg-001',
      wersja_silnika: '1.0.0',
      krok: 'metryka',
      opis_pl: 'wartość metryki z przebiegu',
    },
  ];
}

const ZASTRZEZENIE_ZAKRESU =
  'Zakres ważności: RMS składowa zgodna, zwarcie trójfazowe — wynik nie obejmuje: zwarcia niesymetryczne.';
const METODA_NIEPEWNOSCI = 'różnica wyniku przy połowionym kroku całkowania';
const NIEPEWNOSC_NIE_DOTYCZY =
  'porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy';

// ---------------------------------------------------------------------------
// Rekordy K (lustro `fabryki.ocena(...)` — wywołanie podane przy każdej fabryce)
// ---------------------------------------------------------------------------

/**
 * `ocena("NIE_WIECEJ", kryterium_id="frt.czas_aktywacji_iq", dowod_oceny=dowod_symulacji(
 * stan_danych="UNVALIDATED_INPUT"), metoda_wyniku="SYMULACJA", u=0.5, tolerancja=5 ms,
 * zakres_oceny=zakres(parametry_sieci=(dana_przyjeta(),)))` — kryterium spełnione, dowód
 * niepełny (dana przyjęta bez walidacji), margines względny wobec TOLERANCJI.
 */
export function ocenaCzasuAktywacjiSpelniona(): OcenaKryterium {
  return {
    kryterium_id: 'frt.czas_aktywacji_iq',
    przedmiot: przedmiot(),
    kryterium: {
      opis_pl: 'Czas aktywacji prądu biernego',
      warunek_latex: 't_{akt} \\leq t_{akt,\\max}',
      relacja: 'NIE_WIECEJ',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    podstawa: podstawa(),
    stosowalnosc: stosowalnosc(),
    wynik: {
      wielkosc_pl: 'czas aktywacji prądu biernego',
      symbol_latex: 'x',
      wartosc: wielkosc(38, 'ms'),
      punkt_krytyczny_pl: null,
      chwila_s: null,
      metoda: 'SYMULACJA',
    },
    limit: {
      wartosc: wielkosc(40, 'ms'),
      pasmo: null,
      obwiednia: null,
      jednostka_obwiedni: null,
      podstawa: podstawaLimitu(),
      zakres_stosowalnosci_pl: null,
      wersja_profilu: null,
    },
    margines: {
      wartosc: wielkosc(2, 'ms'),
      definicja_latex: 'm = x_{\\lim} - x',
      punkt_pl: null,
      skala: wielkosc(5, 'ms'),
      skala_rodzaj: 'TOLERANCJA',
      wzgledny: 0.4,
      niedefiniowalny: false,
      powod_pl: null,
    },
    niepewnosc: {
      wartosc: wielkosc(0.5, 'ms'),
      metoda_pl: METODA_NIEPEWNOSCI,
      nie_dotyczy: false,
      powod_pl: null,
    },
    status_maszynowy: 'SPELNIA',
    kompletnosc_dowodu: 'NIEPELNY',
    powody_niepelnosci: [
      'Dana przyjęta bez walidacji: moc zwarciowa sieci S_k″ = 120 MVA, jakość danej: oszacowane — założona do czasu otrzymania warunków przyłączenia.',
    ],
    etykieta: { etykieta_pl: 'Kryterium spełnione — dowód niepełny', semantyka: 'ostrzegawcza' },
    wyjasnienie: {
      zdanie_pl:
        'Czas aktywacji prądu biernego (Moduł PV 2 MW) — kryterium spełnione. Czas aktywacji prądu biernego: 38 ms wobec wymaganych ≤ 40 ms wg pkt 7.2 „Warunki przyłączenia OSD” (margines +2 ms, względnie +40 % tolerancji).',
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [
        'Dana przyjęta bez walidacji: moc zwarciowa sieci S_k″ = 120 MVA, jakość danej: oszacowane — założona do czasu otrzymania warunków przyłączenia.',
        ZASTRZEZENIE_ZAKRESU,
      ],
    },
    dowod: dowodSymulacji({ stanDanych: 'UNVALIDATED_INPUT' }),
    zakres_waznosci: zakres({ parametrySieci: [danaPrzyjeta()] }),
    slad: slad(),
  };
}

/** `ocena("NIE_WIECEJ", kryterium_id="frt.czas_aktywacji_iq", m=-2.0, dowod_oceny=dowod_symulacji(), metoda_wyniku="SYMULACJA", u=0.5)`. */
export function ocenaCzasuAktywacjiNaruszona(): OcenaKryterium {
  const baza = ocenaCzasuAktywacjiSpelniona();
  return {
    ...baza,
    wynik: baza.wynik === null ? null : { ...baza.wynik, wartosc: wielkosc(42, 'ms') },
    margines: {
      wartosc: wielkosc(-2, 'ms'),
      definicja_latex: 'm = x_{\\lim} - x',
      punkt_pl: null,
      skala: wielkosc(40, 'ms'),
      skala_rodzaj: 'LIMIT',
      wzgledny: -0.05,
      niedefiniowalny: false,
      powod_pl: null,
    },
    status_maszynowy: 'NIE_SPELNIA',
    kompletnosc_dowodu: 'PELNY',
    powody_niepelnosci: [],
    etykieta: { etykieta_pl: 'Kryterium naruszone', semantyka: 'negatywna' },
    wyjasnienie: {
      zdanie_pl:
        'Czas aktywacji prądu biernego (Moduł PV 2 MW) — kryterium naruszone. Czas aktywacji prądu biernego: 42 ms wobec wymaganych ≤ 40 ms wg pkt 7.2 „Warunki przyłączenia OSD” (margines −2 ms, względnie −5 % wartości granicznej).',
      przyczyna_pl: 'czas aktywacji prądu biernego przekracza wartość graniczną o 2 ms',
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
    dowod: dowodSymulacji(),
    zakres_waznosci: zakres(),
  };
}

/** `ocena("OBWIEDNIA_DOLNA", kryterium_id="frt.napiecie_nad_obwiednia", dowod_oceny=dowod_symulacji(), metoda_wyniku="SYMULACJA", u=0.03125)`. */
export function ocenaNapieciaNadObwiednia(): OcenaKryterium {
  return {
    kryterium_id: 'frt.napiecie_nad_obwiednia',
    przedmiot: przedmiot(),
    kryterium: {
      opis_pl: 'Napięcie nad obwiednią zapadu',
      warunek_latex: 'U(t) \\geq U_{obw}(t)',
      relacja: 'OBWIEDNIA_DOLNA',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    podstawa: podstawa(),
    stosowalnosc: stosowalnosc(),
    wynik: {
      wielkosc_pl: 'najmniejsze napięcie nad obwiednią',
      symbol_latex: 'x',
      wartosc: wielkosc(0.625, 'p.u. (U_n)'),
      punkt_krytyczny_pl: 'punkt przyłączenia modułu',
      chwila_s: 0.5,
      metoda: 'SYMULACJA',
    },
    limit: {
      wartosc: null,
      pasmo: null,
      obwiednia: [
        { t_s: 0, wartosc: 0.25 },
        { t_s: 1, wartosc: 0.75 },
        { t_s: 2, wartosc: 0.75 },
      ],
      jednostka_obwiedni: 'p.u. (U_n)',
      podstawa: podstawaLimitu(),
      zakres_stosowalnosci_pl: null,
      wersja_profilu: null,
    },
    margines: {
      wartosc: wielkosc(0.125, 'p.u. (U_n)'),
      definicja_latex: 'm = x(t^{*}) - x_{\\lim}(t^{*})',
      punkt_pl: 'punkt przyłączenia modułu',
      skala: wielkosc(0.5, 'p.u. (U_n)'),
      skala_rodzaj: 'LIMIT',
      wzgledny: 0.25,
      niedefiniowalny: false,
      powod_pl: null,
    },
    niepewnosc: {
      wartosc: wielkosc(0.03125, 'p.u. (U_n)'),
      metoda_pl: METODA_NIEPEWNOSCI,
      nie_dotyczy: false,
      powod_pl: null,
    },
    status_maszynowy: 'SPELNIA',
    kompletnosc_dowodu: 'PELNY',
    powody_niepelnosci: [],
    etykieta: { etykieta_pl: 'Kryterium spełnione', semantyka: 'pozytywna' },
    wyjasnienie: {
      zdanie_pl:
        'Napięcie nad obwiednią zapadu (Moduł PV 2 MW) — kryterium spełnione. Najmniejsze napięcie nad obwiednią: 0,625 p.u. (U_n) w chwili t = 0,5 s wobec obwiedni dolnej 0,5 p.u. (U_n) w chwili t = 0,5 s wg pkt 7.2 „Warunki przyłączenia OSD” (margines +0,125 p.u. (U_n), punkt: punkt przyłączenia modułu, względnie +25 % wartości granicznej).',
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
    dowod: dowodSymulacji(),
    zakres_waznosci: zakres(),
    slad: slad(),
  };
}

/** `ocena("NIE_MNIEJ", kryterium_id="frt.odbudowa_p", u=2.0)` — |m| ≤ u → niejednoznaczny. */
export function ocenaOdbudowyNiejednoznaczna(): OcenaKryterium {
  return {
    kryterium_id: 'frt.odbudowa_p',
    przedmiot: przedmiot(),
    kryterium: {
      opis_pl: 'Odbudowa mocy czynnej po zakłóceniu',
      warunek_latex: 'P(t_1) \\geq P_{\\min}',
      relacja: 'NIE_MNIEJ',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    podstawa: podstawa(),
    stosowalnosc: stosowalnosc(),
    wynik: {
      wielkosc_pl: 'moc czynna po 1 s',
      symbol_latex: 'x',
      wartosc: wielkosc(92, '%'),
      punkt_krytyczny_pl: null,
      chwila_s: null,
      metoda: 'DEKLARACJA',
    },
    limit: {
      wartosc: wielkosc(90, '%'),
      pasmo: null,
      obwiednia: null,
      jednostka_obwiedni: null,
      podstawa: podstawaLimitu(),
      zakres_stosowalnosci_pl: null,
      wersja_profilu: null,
    },
    // `fabryki.JEDNOSTKA_MARGINESU`: wynik w % → margines, skala i niepewność w punktach
    // procentowych („pp") — jednostka marginesu NIE jest jednostką wyniku.
    margines: {
      wartosc: wielkosc(2, 'pp'),
      definicja_latex: 'm = x - x_{\\lim}',
      punkt_pl: null,
      skala: wielkosc(90, 'pp'),
      skala_rodzaj: 'LIMIT',
      wzgledny: 0.022222222222222223,
      niedefiniowalny: false,
      powod_pl: null,
    },
    niepewnosc: {
      wartosc: wielkosc(2, 'pp'),
      metoda_pl: METODA_NIEPEWNOSCI,
      nie_dotyczy: false,
      powod_pl: null,
    },
    status_maszynowy: 'NIEJEDNOZNACZNY',
    kompletnosc_dowodu: 'PELNY',
    powody_niepelnosci: [],
    etykieta: { etykieta_pl: 'Wynik niejednoznaczny — wymaga weryfikacji', semantyka: 'ostrzegawcza' },
    wyjasnienie: {
      zdanie_pl:
        'Odbudowa mocy czynnej po zakłóceniu (Moduł PV 2 MW) — wynik niejednoznaczny, wymaga weryfikacji. Moc czynna po 1 s: 92 % wobec wymaganych ≥ 90 % wg pkt 7.2 „Warunki przyłączenia OSD” (margines +2 pp, względnie +2,222 % wartości granicznej); niepewność ±2 pp (różnica wyniku przy połowionym kroku całkowania). Rozstrzygnie: wynik o niepewności mniejszej niż |m| = 2 pp (dokładniejsze obliczenie albo pomiar).',
      przyczyna_pl: '|m| = 2 pp nie przekracza niepewności u = 2 pp',
      czego_brakuje: [
        'Rozstrzygnięcie wyniku: |m| = 2 pp nie przekracza niepewności u = 2 pp — potrzebny wynik o mniejszej niepewności (dokładniejsze obliczenie albo pomiar).',
      ],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
    dowod: dowodDeklaracji(),
    zakres_waznosci: zakres(),
    slad: slad(),
  };
}

/** `ocena("LOGICZNE", kryterium_id="frt.pozostanie_w_pracy", dowod_oceny=dowod_symulacji(), metoda_wyniku="SYMULACJA", u=0.25)`. */
export function ocenaPozostaniaWPracy(): OcenaKryterium {
  return {
    kryterium_id: 'frt.pozostanie_w_pracy',
    przedmiot: przedmiot(),
    kryterium: {
      opis_pl: 'Pozostanie w pracy podczas zapadu',
      warunek_latex: '',
      relacja: 'LOGICZNE',
      warunek_wstepny_pl:
        'napięcie w punkcie przyłączenia nie niższe niż obwiednia profilu w całym przedziale 0–3 s',
      // Obwiednia FRT jest WARUNKIEM WSTĘPNYM z własną podstawą (§5.1) — stan WSKAZANE.
      warunek_wstepny_podstawa: podstawaWarunku('WSKAZANE'),
    },
    podstawa: podstawa(),
    stosowalnosc: stosowalnosc(),
    wynik: {
      wielkosc_pl: 'pozostanie w pracy',
      symbol_latex: '',
      wartosc: wielkosc(1, '1'),
      punkt_krytyczny_pl: 'moduł pozostał przyłączony przez cały przebieg',
      chwila_s: null,
      metoda: 'SYMULACJA',
    },
    limit: null,
    margines: {
      wartosc: null,
      definicja_latex: null,
      punkt_pl: 'moduł pozostał przyłączony przez cały przebieg',
      skala: null,
      skala_rodzaj: null,
      wzgledny: null,
      niedefiniowalny: true,
      powod_pl: 'Kryterium logiczne nie ma marginesu skalarnego — o wyniku decyduje stan logiczny.',
    },
    niepewnosc: {
      wartosc: wielkosc(0.25, '1'),
      metoda_pl: METODA_NIEPEWNOSCI,
      nie_dotyczy: false,
      powod_pl: null,
    },
    status_maszynowy: 'SPELNIA',
    kompletnosc_dowodu: 'PELNY',
    powody_niepelnosci: [],
    etykieta: { etykieta_pl: 'Kryterium spełnione', semantyka: 'pozytywna' },
    wyjasnienie: {
      zdanie_pl:
        'Pozostanie w pracy podczas zapadu (Moduł PV 2 MW) — kryterium spełnione. Pozostanie w pracy: moduł pozostał przyłączony przez cały przebieg (stan wymagany wg pkt 5.3 „Procedura testowania modułów wytwarzania energii”).',
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [
        'Warunek wstępny („napięcie w punkcie przyłączenia nie niższe niż obwiednia profilu w całym przedziale 0–3 s”) oparty na podstawie o stanie źródła „wskazane (dokument i jednostka redakcyjna wskazane, treść poza repozytorium)”: „Profil wymagań OSD — obwiednia zapadu”, wydanie 3.0, tab. 4 (procedura PTPiREE).',
        ZASTRZEZENIE_ZAKRESU,
      ],
    },
    dowod: dowodSymulacji(),
    zakres_waznosci: zakres(),
    slad: slad(),
  };
}

/** `ocena("PASMO", kryterium_id="rfg.pasmo_f", dotyczy=False)` — nie dotyczy (stosowalność). */
export function ocenaPasmaNieDotyczy(): OcenaKryterium {
  return {
    kryterium_id: 'rfg.pasmo_f',
    przedmiot: przedmiot(),
    kryterium: {
      opis_pl: 'Praca w paśmie częstotliwości',
      warunek_latex: 'f_{\\min} \\leq f \\leq f_{\\max}',
      relacja: 'PASMO',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    podstawa: podstawa(),
    stosowalnosc: stosowalnosc(false),
    wynik: {
      wielkosc_pl: 'częstotliwość',
      symbol_latex: 'x',
      wartosc: wielkosc(48.5, 'Hz'),
      punkt_krytyczny_pl: null,
      chwila_s: null,
      metoda: 'DEKLARACJA',
    },
    limit: {
      wartosc: null,
      pasmo: [wielkosc(48, 'Hz'), wielkosc(52, 'Hz')],
      obwiednia: null,
      jednostka_obwiedni: null,
      podstawa: podstawaLimitu(),
      zakres_stosowalnosci_pl: null,
      wersja_profilu: null,
    },
    margines: {
      wartosc: wielkosc(0.5, 'Hz'),
      definicja_latex: 'm = \\min\\left(x - x_{\\min},\\; x_{\\max} - x\\right)',
      punkt_pl: null,
      skala: wielkosc(48, 'Hz'),
      skala_rodzaj: 'LIMIT',
      wzgledny: 0.010416666666666666,
      niedefiniowalny: false,
      powod_pl: null,
    },
    niepewnosc: { wartosc: null, metoda_pl: null, nie_dotyczy: true, powod_pl: NIEPEWNOSC_NIE_DOTYCZY },
    status_maszynowy: 'NIE_DOTYCZY',
    kompletnosc_dowodu: 'NIE_DOTYCZY',
    powody_niepelnosci: [],
    etykieta: { etykieta_pl: 'Nie dotyczy', semantyka: 'neutralna' },
    wyjasnienie: {
      zdanie_pl:
        'Praca w paśmie częstotliwości (Moduł PV 2 MW) — nie dotyczy: wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny.',
      przyczyna_pl: 'wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny',
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
    dowod: dowodDeklaracji(),
    zakres_waznosci: zakres(),
    slad: slad(),
  };
}

/** `ocena("NIE_WIECEJ", kryterium_id="lfsm.statyzm", stan_limitu="NIEUSTALONE")` — brak podstawy. */
export function ocenaBezPodstawyLimitu(): OcenaKryterium {
  const baza = ocenaCzasuAktywacjiSpelniona();
  const podstawaNieustalona = podstawaLimitu('NIEUSTALONE');
  return {
    ...baza,
    kryterium_id: 'lfsm.statyzm',
    wynik: baza.wynik === null ? null : { ...baza.wynik, metoda: 'DEKLARACJA' },
    limit: baza.limit === null ? null : { ...baza.limit, podstawa: podstawaNieustalona },
    margines: {
      wartosc: wielkosc(2, 'ms'),
      definicja_latex: 'm = x_{\\lim} - x',
      punkt_pl: null,
      skala: wielkosc(40, 'ms'),
      skala_rodzaj: 'LIMIT',
      wzgledny: 0.05,
      niedefiniowalny: false,
      powod_pl: null,
    },
    niepewnosc: { wartosc: null, metoda_pl: null, nie_dotyczy: true, powod_pl: NIEPEWNOSC_NIE_DOTYCZY },
    status_maszynowy: 'BRAK_PODSTAWY',
    kompletnosc_dowodu: 'NIEPELNY',
    powody_niepelnosci: [
      'Podstawa „Profil zastany operatorów (pochodzenie nieustalone)” (warstwa o nieustalonym pochodzeniu) ma stan źródła „nieustalone” — wymagany stan źródła zweryfikowane albo wskazane (dokument, wydanie i jednostka redakcyjna).',
    ],
    etykieta: { etykieta_pl: 'Brak zweryfikowanej podstawy wymagania', semantyka: 'ostrzegawcza' },
    wyjasnienie: {
      zdanie_pl:
        'Czas aktywacji prądu biernego (Moduł PV 2 MW) — werdykt zgodności niewydany: brak ustalonej podstawy parametru — podstawa limitu „Profil zastany operatorów (pochodzenie nieustalone)” (warstwa o nieustalonym pochodzeniu) ma stan źródła „nieustalone”. Wynik obliczeniowy wobec przyjętej wartości (informacyjnie): czas aktywacji prądu biernego: 38 ms wobec wymaganych ≤ 40 ms wg „Profil zastany operatorów (pochodzenie nieustalone)” (margines +2 ms, względnie +5 % wartości granicznej).',
      przyczyna_pl:
        'podstawa limitu „Profil zastany operatorów (pochodzenie nieustalone)” (warstwa o nieustalonym pochodzeniu) ma stan źródła „nieustalone”',
      czego_brakuje: [
        'Podstawa limitu o ustalonym pochodzeniu: obecna podstawa „Profil zastany operatorów (pochodzenie nieustalone)” (warstwa o nieustalonym pochodzeniu) ma stan źródła „nieustalone” — potrzebny dokument źródłowy z wydaniem i jednostką redakcyjną (uwagi: wartość przeniesiona z dawnych profili).',
      ],
      zastrzezenia: [
        'Podstawa „Profil zastany operatorów (pochodzenie nieustalone)” (warstwa o nieustalonym pochodzeniu): stan źródła „nieustalone” — pochodzenie wartości nieustalone (wartość przeniesiona z dawnych profili).',
        ZASTRZEZENIE_ZAKRESU,
      ],
    },
    dowod: dowodDeklaracji(),
    zakres_waznosci: zakres(),
  };
}

// ---------------------------------------------------------------------------
// Rekordy W (lustro `fabryki.wymaganie(...)`)
// ---------------------------------------------------------------------------

const NAZWA_WYMAGANIA = 'Zdolność do pozostania w pracy podczas zwarcia';

function podstawaWymagania(): PodstawaWymagania {
  return podstawa('ZWERYFIKOWANE', {
    dokument: 'Rozporządzenie Komisji (UE) 2016/631',
    jednostka: 'art. 14 ust. 3',
  });
}

/**
 * `wymaganie([ocena naruszona czasu aktywacji, ocena napięcia nad obwiednią], sposob="SYMULACJA")`
 * — jeden składnik naruszony, drugi spełniony; agregat NIE_SPELNIA z pełnym dowodem.
 */
export function wymaganieNaruszone(): WynikWymagania {
  return {
    wymaganie_id: 'rfg.art14_3',
    nazwa_pl: NAZWA_WYMAGANIA,
    podstawa: podstawaWymagania(),
    stosowalnosc: stosowalnosc(),
    sposob_wykazania: 'SYMULACJA',
    podstawa_sposobu_wykazania: null,
    oceny_skladowe: [ocenaCzasuAktywacjiNaruszona(), ocenaNapieciaNadObwiednia()],
    pokrycie_programu: 'PELNE',
    pokrycie_programu_pl: '3 głębokości zapadu × 2 poziomy mocy czynnej',
    status_maszynowy: 'NIE_SPELNIA',
    kompletnosc_dowodu: 'PELNY',
    powody_niepelnosci: [],
    kryteria_naruszone: ['frt.czas_aktywacji_iq'],
    kryterium_najblizej_granicy: null,
    etykieta: { etykieta_pl: 'Wymaganie naruszone', semantyka: 'negatywna' },
    wyjasnienie: {
      zdanie_pl:
        'Zdolność do pozostania w pracy podczas zwarcia (art. 14 ust. 3 „Rozporządzenie Komisji (UE) 2016/631”) — wymaganie nie jest spełnione. Naruszone kryteria składowe: Czas aktywacji prądu biernego (Moduł PV 2 MW) — czas aktywacji prądu biernego: 42 ms wobec wymaganych ≤ 40 ms wg pkt 7.2 „Warunki przyłączenia OSD” (margines −2 ms, względnie −5 % wartości granicznej). Pozostałe kryteria składowe: Napięcie nad obwiednią zapadu (Moduł PV 2 MW) — kryterium spełnione (margines +0,125 p.u. (U_n)).',
      przyczyna_pl:
        'Czas aktywacji prądu biernego (Moduł PV 2 MW) — czas aktywacji prądu biernego przekracza wartość graniczną o 2 ms',
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
    dowod: dowodSymulacji({ wDomenie: null }),
    zakres_waznosci: zakres({ rodzaj: null }),
    slad: slad(),
  };
}

/** `wymaganie([], sposob="BRAK_METODY")` — brak metody wykazania, pusta lista składowych. */
export function wymaganieBezMetody(): WynikWymagania {
  return {
    wymaganie_id: 'rfg.art14_3',
    nazwa_pl: NAZWA_WYMAGANIA,
    podstawa: podstawaWymagania(),
    stosowalnosc: stosowalnosc(),
    sposob_wykazania: 'BRAK_METODY',
    podstawa_sposobu_wykazania: null,
    oceny_skladowe: [],
    pokrycie_programu: 'NIE_DOTYCZY',
    pokrycie_programu_pl: 'wymaganie wykazywane bez programu badań',
    status_maszynowy: 'BRAK_DOWODU',
    kompletnosc_dowodu: 'NIEPELNY',
    powody_niepelnosci: [
      'Brak metody dowodu — właściwa metoda dla twierdzenia o zachowaniu dynamicznym: certyfikat urządzenia, raport z testu, symulacja na silniku o poziomie dowodowym „symulacja zwalidowana” (bieg w zadeklarowanej domenie walidacji) z modelem urządzenia: model urządzenia zwalidowany wynikiem testu albo model urządzenia certyfikowany, pomiar albo dowód łączony, w którym każde stosowalne kryterium składowe ma metodę przydatną.',
    ],
    kryteria_naruszone: [],
    kryterium_najblizej_granicy: null,
    etykieta: { etykieta_pl: 'Brak wystarczającego dowodu', semantyka: 'ostrzegawcza' },
    wyjasnienie: {
      zdanie_pl:
        'Zdolność do pozostania w pracy podczas zwarcia (art. 14 ust. 3 „Rozporządzenie Komisji (UE) 2016/631”) — brak wystarczającego dowodu: brak metody wykazania w narzędziu; właściwa metoda: certyfikat urządzenia albo raport z badania typu.',
      przyczyna_pl:
        'sposób wykazania: brak metody w narzędziu (ani certyfikat pokrywający wymaganie, ani test lub symulacja narzędzia)',
      czego_brakuje: [
        'Metoda wykazania wymagania: certyfikat urządzenia albo raport z badania typu pokrywający wymaganie — narzędzie nie ma metody wykazania.',
        'Brak metody dowodu — właściwa metoda dla twierdzenia o zachowaniu dynamicznym: certyfikat urządzenia, raport z testu, symulacja na silniku o poziomie dowodowym „symulacja zwalidowana” (bieg w zadeklarowanej domenie walidacji) z modelem urządzenia: model urządzenia zwalidowany wynikiem testu albo model urządzenia certyfikowany, pomiar albo dowód łączony, w którym każde stosowalne kryterium składowe ma metodę przydatną.',
      ],
      zastrzezenia: [],
    },
    dowod: {
      metoda: 'BRAK_METODY',
      poziom: 'DECLARATION',
      rodzaj_twierdzenia: 'DYNAMIC_PERFORMANCE',
      status_modelu: 'NIE_DOTYCZY',
      status_danych: statusDanych(),
      odniesienie: 'bieg-001',
      w_domenie_walidacji: null,
      domena_pl: null,
    },
    zakres_waznosci: zakres({ rodzaj: null, wykluczenia: [] }),
    slad: slad(),
  };
}

/**
 * `wymaganie([ocena("NIE_WIECEJ", kryterium_id="a", …symulacja…), ocena("NIE_MNIEJ",
 * kryterium_id="b", …symulacja…)], sposob="SYMULACJA")` — agregat spełniony, kryterium najbliżej
 * granicy „b" (margines względny +0,02222 < +0,05).
 */
export function wymaganieSpelnione(): WynikWymagania {
  const a: OcenaKryterium = {
    ...ocenaCzasuAktywacjiNaruszona(),
    kryterium_id: 'a',
    wynik: {
      wielkosc_pl: 'czas aktywacji prądu biernego',
      symbol_latex: 'x',
      wartosc: wielkosc(38, 'ms'),
      punkt_krytyczny_pl: null,
      chwila_s: null,
      metoda: 'SYMULACJA',
    },
    margines: {
      wartosc: wielkosc(2, 'ms'),
      definicja_latex: 'm = x_{\\lim} - x',
      punkt_pl: null,
      skala: wielkosc(40, 'ms'),
      skala_rodzaj: 'LIMIT',
      wzgledny: 0.05,
      niedefiniowalny: false,
      powod_pl: null,
    },
    status_maszynowy: 'SPELNIA',
    etykieta: { etykieta_pl: 'Kryterium spełnione', semantyka: 'pozytywna' },
    wyjasnienie: {
      zdanie_pl:
        'Czas aktywacji prądu biernego (Moduł PV 2 MW) — kryterium spełnione. Czas aktywacji prądu biernego: 38 ms wobec wymaganych ≤ 40 ms wg pkt 7.2 „Warunki przyłączenia OSD” (margines +2 ms, względnie +5 % wartości granicznej).',
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
  };
  const bazaB = ocenaOdbudowyNiejednoznaczna();
  const b: OcenaKryterium = {
    ...bazaB,
    kryterium_id: 'b',
    wynik: bazaB.wynik === null ? null : { ...bazaB.wynik, metoda: 'SYMULACJA' },
    niepewnosc: {
      wartosc: wielkosc(0.5, 'pp'),
      metoda_pl: METODA_NIEPEWNOSCI,
      nie_dotyczy: false,
      powod_pl: null,
    },
    status_maszynowy: 'SPELNIA',
    kompletnosc_dowodu: 'PELNY',
    etykieta: { etykieta_pl: 'Kryterium spełnione', semantyka: 'pozytywna' },
    wyjasnienie: {
      zdanie_pl:
        'Odbudowa mocy czynnej po zakłóceniu (Moduł PV 2 MW) — kryterium spełnione. Moc czynna po 1 s: 92 % wobec wymaganych ≥ 90 % wg pkt 7.2 „Warunki przyłączenia OSD” (margines +2 pp, względnie +2,222 % wartości granicznej).',
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
    dowod: dowodSymulacji(),
  };
  return {
    ...wymaganieNaruszone(),
    oceny_skladowe: [a, b],
    status_maszynowy: 'SPELNIA',
    kryteria_naruszone: [],
    kryterium_najblizej_granicy: 'b',
    etykieta: { etykieta_pl: 'Wymaganie spełnione', semantyka: 'pozytywna' },
    wyjasnienie: {
      zdanie_pl:
        'Zdolność do pozostania w pracy podczas zwarcia (art. 14 ust. 3 „Rozporządzenie Komisji (UE) 2016/631”) — wymaganie spełnione, dowód pełny. Kryterium najbliżej granicy: Odbudowa mocy czynnej po zakłóceniu (Moduł PV 2 MW) — moc czynna po 1 s: 92 % wobec wymaganych ≥ 90 % wg pkt 7.2 „Warunki przyłączenia OSD” (margines +2 pp, względnie +2,222 % wartości granicznej).',
      przyczyna_pl:
        'kryterium najbliżej granicy: Odbudowa mocy czynnej po zakłóceniu (Moduł PV 2 MW) (względnie +2,222 % wartości granicznej)',
      czego_brakuje: [],
      zastrzezenia: [ZASTRZEZENIE_ZAKRESU],
    },
  };
}

// ---------------------------------------------------------------------------
// Słowniki iloczynu cech (kolejność jak w `kontrakt.py`)
// ---------------------------------------------------------------------------

const STATUSY: readonly StatusWerdyktu[] = [
  'SPELNIA',
  'NIE_SPELNIA',
  'NIEJEDNOZNACZNY',
  'NIE_OCENIONO',
  'BRAK_PODSTAWY',
  'BRAK_DOWODU',
  'NIE_DOTYCZY',
];
const SEMANTYKI: readonly SemantykaEtykiety[] = [
  'pozytywna',
  'negatywna',
  'ostrzegawcza',
  'neutralna',
];
/** Etykiety słownika §9 (backend `werdykt/etykiety.py`) — interfejs ich NIE zna. */
const ETYKIETY_SLOWNIKA = [
  'Kryterium spełnione',
  'Kryterium naruszone',
  'Wymaganie spełnione',
  'Wymaganie naruszone',
  'Wynik niejednoznaczny — wymaga weryfikacji',
  'Ocena niewykonana',
  'Brak wystarczającego dowodu',
  'Brak zweryfikowanej podstawy wymagania',
  'Nie dotyczy',
];

function zEtykieta<T extends OcenaKryterium | WynikWymagania>(
  rekord: T,
  status: StatusWerdyktu,
  etykieta: Etykieta,
): T {
  return { ...rekord, status_maszynowy: status, etykieta };
}

function karta(testId: string): HTMLElement {
  return screen.getByTestId(testId);
}

// ---------------------------------------------------------------------------
// Testy
// ---------------------------------------------------------------------------

describe('KartaWerdyktu — pełny rekord kryterium (poziom K)', () => {
  it('pokazuje minimum §9 w kolejności: Ocena · Stosowalność · Kryterium · Wynik · Limit · Margines · Niepewność · Wyjaśnienie · Podstawa · Dowód · Kompletność; zakres i ślad rozwijane', () => {
    render(<KartaWerdyktu rekord={ocenaCzasuAktywacjiSpelniona()} />);
    const artykul = karta('mvd-werdykt-frt.czas_aktywacji_iq');
    const etykietyPol = Array.from(artykul.querySelectorAll('dt')).map((dt) => dt.textContent);
    expect(etykietyPol).toEqual([
      'Ocena',
      'Stosowalność',
      'Kryterium',
      'Wynik',
      'Limit',
      'Margines',
      'Niepewność',
      'Wyjaśnienie',
      'Podstawa kryterium',
      'Dowód',
      'Kompletność dowodu',
    ]);
    const przyciski = within(artykul).getAllByRole('button');
    expect(przyciski.map((p) => p.textContent).slice(0, 2)).toEqual([
      'Zakres ważnościRozwiń',
      'Ślad obliczeńRozwiń',
    ]);
    // Surowe identyfikatory rekordu — w zwiniętej wspólnej sekcji audytowej (ostatni przycisk).
    expect(przyciski).toHaveLength(3);
    expect(przyciski[2]).toHaveTextContent(/^Informacje audytowe\d+$/);
    expect(artykul).toHaveAttribute('data-poziom', 'K');
  });

  it('wynik, limit z podstawą (dokument, wydanie, jednostka redakcyjna, STAN ŹRÓDŁA), margines ze skalą i niepewność — liczby wprost z rekordu', () => {
    render(<KartaWerdyktu rekord={ocenaCzasuAktywacjiSpelniona()} />);
    const id = 'mvd-werdykt-frt.czas_aktywacji_iq';
    const wynik = karta(`${id}-wynik`);
    expect(wynik).toHaveTextContent('czas aktywacji prądu biernego');
    expect(wynik).toHaveTextContent('38 ms');
    expect(wynik).toHaveTextContent('metoda: symulacja');

    const limit = karta(`${id}-limit`);
    expect(limit).toHaveTextContent('górna granica: 40 ms');
    const podstawaLimitu = karta(`${id}-limit-podstawa`);
    expect(podstawaLimitu).toHaveTextContent('dokument: „Warunki przyłączenia OSD”');
    expect(podstawaLimitu).toHaveTextContent('wydanie: 3.0');
    expect(podstawaLimitu).toHaveTextContent('jednostka redakcyjna: pkt 7.2');
    expect(podstawaLimitu).toHaveTextContent('stan źródła: zweryfikowane');
    expect(podstawaLimitu).not.toHaveTextContent('ZWERYFIKOWANE');

    const margines = karta(`${id}-margines`);
    expect(margines).toHaveTextContent('+2 ms');
    expect(margines).toHaveTextContent('skala: 5 ms (tolerancja z profilu)');
    expect(margines).toHaveTextContent('margines względny (odniesiony do skali): +0,4');

    const niepewnosc = karta(`${id}-niepewnosc`);
    expect(niepewnosc).toHaveTextContent('±0,5 ms');
    expect(niepewnosc).toHaveTextContent(`metoda oszacowania: ${METODA_NIEPEWNOSCI}`);

    const podstawaKryterium = karta(`${id}-podstawa-tresc`);
    expect(podstawaKryterium).toHaveTextContent(
      'dokument: „Procedura testowania modułów wytwarzania energii”',
    );
    expect(podstawaKryterium).toHaveTextContent('jednostka redakcyjna: pkt 5.3');
    expect(podstawaKryterium).toHaveTextContent('rodzaj: procedura PTPiREE');
  });

  it('dowód: metoda, poziom EvidenceTier etykietą PL, rodzaj twierdzenia, status modelu, status danych z listą danych przyjętych; kompletność z powodami', () => {
    render(<KartaWerdyktu rekord={ocenaCzasuAktywacjiSpelniona()} />);
    const id = 'mvd-werdykt-frt.czas_aktywacji_iq';
    const dowod = karta(`${id}-dowod`);
    expect(dowod).toHaveTextContent('metoda: symulacja');
    expect(dowod).toHaveTextContent('poziom zdolności narzędzia: symulacja zwalidowana');
    expect(dowod).toHaveTextContent('rodzaj twierdzenia: zachowanie dynamiczne');
    expect(dowod).toHaveTextContent(
      'walidacja modelu urządzenia: model urządzenia zwalidowany wynikiem testu',
    );
    expect(dowod).toHaveTextContent('stan danych wejściowych: dane przyjęte bez walidacji');
    // Kody osi dowodu (lustro enumów backendu) nie stoją w pierwszym planie karty.
    for (const kod of ['VALIDATED_SIMULATION', 'VALIDATED_AGAINST_TEST', 'UNVALIDATED_INPUT', 'ESTIMATED']) {
      expect(dowod).not.toHaveTextContent(kod);
    }
    const dane = karta(`${id}-dowod-dane-przyjete`);
    expect(dane.tagName).toBe('UL');
    expect(within(dane).getAllByRole('listitem')).toHaveLength(1);
    expect(dane).toHaveTextContent('moc zwarciowa sieci S_k″: 120 MVA');
    expect(dane).toHaveTextContent('jakość danej: oszacowane');
    expect(dane).toHaveTextContent('założona do czasu otrzymania warunków przyłączenia');
    expect(dowod).toHaveTextContent('odniesienie do dowodu: bieg-001');

    const kompletnosc = karta(`${id}-kompletnosc`);
    expect(kompletnosc).toHaveTextContent('niepełny');
    const powody = karta(`${id}-kompletnosc-powody`);
    expect(within(powody).getAllByRole('listitem')).toHaveLength(1);
    expect(powody).toHaveTextContent('Dana przyjęta bez walidacji: moc zwarciowa sieci S_k″ = 120 MVA');
  });

  it('zdanie wyjaśnienia jest WIDOCZNE bez żadnej interakcji — nie w dymku, nie za rozwijaniem', () => {
    const rekord = ocenaCzasuAktywacjiSpelniona();
    render(<KartaWerdyktu rekord={rekord} />);
    const zdanie = karta('mvd-werdykt-frt.czas_aktywacji_iq-zdanie');
    expect(zdanie).toBeVisible();
    expect(zdanie.textContent).toBe(rekord.wyjasnienie.zdanie_pl);
    expect(zdanie.closest('.mvd-werdykt-rozwijana')).toBeNull();
    // Nie dymek: zdanie nie siedzi w atrybucie `title` żadnego elementu.
    expect(document.querySelector(`[title="${rekord.wyjasnienie.zdanie_pl}"]`)).toBeNull();
  });

  it('zastrzeżenia i czego brakuje renderują się jako LISTY dosłownych pozycji z rekordu', () => {
    const niejednoznaczna = ocenaOdbudowyNiejednoznaczna();
    render(<KartaWerdyktu rekord={niejednoznaczna} />);
    const id = 'mvd-werdykt-frt.odbudowa_p';
    const braki = karta(`${id}-czego-brakuje`);
    expect(braki.tagName).toBe('UL');
    expect(within(braki).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      niejednoznaczna.wyjasnienie.czego_brakuje,
    );
    const zastrzezenia = karta(`${id}-zastrzezenia`);
    expect(zastrzezenia.tagName).toBe('UL');
    expect(within(zastrzezenia).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      niejednoznaczna.wyjasnienie.zastrzezenia,
    );
    expect(karta(`${id}-przyczyna`)).toHaveTextContent(
      `Przyczyna: ${niejednoznaczna.wyjasnienie.przyczyna_pl ?? ''}`,
    );
  });

  it('pusta lista czego brakuje nie tworzy pustej sekcji (uczciwy brak treści, nie pusta ramka)', () => {
    render(<KartaWerdyktu rekord={ocenaCzasuAktywacjiSpelniona()} />);
    expect(screen.queryByTestId('mvd-werdykt-frt.czas_aktywacji_iq-czego-brakuje')).toBeNull();
    expect(screen.queryByTestId('mvd-werdykt-frt.czas_aktywacji_iq-przyczyna')).toBeNull();
  });

  it('LaTeX warunku, symbolu wielkości i definicji marginesu renderuje MathRenderer (KaTeX) z pól *_latex', () => {
    const rekord = ocenaCzasuAktywacjiSpelniona();
    render(<KartaWerdyktu rekord={rekord} />);
    const artykul = karta('mvd-werdykt-frt.czas_aktywacji_iq');
    const wzory = within(artykul)
      .getAllByTestId('math-rendered')
      .map((el) => el.getAttribute('data-latex'));
    expect(wzory).toEqual([
      rekord.kryterium.warunek_latex,
      rekord.wynik?.symbol_latex,
      rekord.margines?.definicja_latex,
    ]);
    expect(within(artykul).queryByTestId('math-fallback')).toBeNull();
  });

  it('kryterium logiczne: bez limitu skalarnego, margines jawnie niedefiniowalny z powodem, bez pustego wzoru', () => {
    const rekord = ocenaPozostaniaWPracy();
    render(<KartaWerdyktu rekord={rekord} />);
    const id = 'mvd-werdykt-frt.pozostanie_w_pracy';
    expect(karta(`${id}-limit`)).toHaveTextContent('kryterium logiczne — bez limitu skalarnego');
    expect(karta(`${id}-margines`)).toHaveTextContent(
      `niedefiniowalny — ${rekord.margines?.powod_pl ?? ''}`,
    );
    expect(karta(`${id}-wynik`)).toHaveTextContent(
      'pozostanie w pracy: moduł pozostał przyłączony przez cały przebieg (wartość logiczna 1)',
    );
    expect(within(karta(id)).queryAllByTestId('math-rendered')).toHaveLength(0);
  });

  it('warunek wstępny kryterium z WŁASNĄ podstawą (obwiednia FRT jako warunek, nie margines — §5.1)', () => {
    const rekord = ocenaPozostaniaWPracy();
    render(<KartaWerdyktu rekord={rekord} />);
    const id = 'mvd-werdykt-frt.pozostanie_w_pracy';
    expect(karta(`${id}-kryterium`)).toHaveTextContent(
      `Warunek wstępny: ${rekord.kryterium.warunek_wstepny_pl ?? ''}`,
    );
    const podstawaWarunku = karta(`${id}-warunek-wstepny-podstawa`);
    expect(podstawaWarunku).toHaveTextContent('dokument: „Profil wymagań OSD — obwiednia zapadu”');
    expect(podstawaWarunku).toHaveTextContent('jednostka redakcyjna: tab. 4');
    expect(podstawaWarunku).toHaveTextContent('stan źródła: wskazane');
    expect(podstawaWarunku).toHaveAttribute('data-stan-zrodla', 'WSKAZANE');
  });

  it('dowód: przynależność biegu do domeny walidacji silnika — w domenie / poza domeną / nieokreślona (bez domysłu)', () => {
    const symulacja = ocenaCzasuAktywacjiSpelniona();
    const { unmount } = render(<KartaWerdyktu rekord={symulacja} />);
    expect(karta('mvd-werdykt-frt.czas_aktywacji_iq-dowod')).toHaveTextContent(
      `domena walidacji silnika: bieg w zadeklarowanej domenie walidacji — ${DOMENA_WALIDACJI}`,
    );
    unmount();

    const pozaDomena: OcenaKryterium = {
      ...symulacja,
      dowod: { ...symulacja.dowod, w_domenie_walidacji: false, domena_pl: 'SCR 3–20' },
    };
    const drugi = render(<KartaWerdyktu rekord={pozaDomena} />);
    expect(karta('mvd-werdykt-frt.czas_aktywacji_iq-dowod')).toHaveTextContent(
      'domena walidacji silnika: bieg poza zadeklarowaną domeną walidacji — SCR 3–20',
    );
    drugi.unmount();

    render(<KartaWerdyktu rekord={ocenaOdbudowyNiejednoznaczna()} />);
    expect(karta('mvd-werdykt-frt.odbudowa_p-dowod')).toHaveTextContent(
      'domena walidacji silnika: nie określono — dowód bez biegu albo bez zadeklarowanej domeny',
    );
  });

  it('rodzaj twierdzenia: każda wartość ClaimKind ma nazwę PL (także obliczenie statyczne z karty A2)', () => {
    const baza = ocenaOdbudowyNiejednoznaczna();
    const oczekiwane = [
      ['DYNAMIC_PERFORMANCE', 'zachowanie dynamiczne'],
      ['DECLARED_CONFIGURATION', 'konfiguracja zadeklarowana'],
      ['STATIC_CALCULATION', 'obliczenie statyczne'],
    ] as const;
    for (const [rodzaj, nazwa] of oczekiwane) {
      const { unmount } = render(
        <KartaWerdyktu rekord={{ ...baza, dowod: { ...baza.dowod, rodzaj_twierdzenia: rodzaj } }} />,
      );
      expect(karta('mvd-werdykt-frt.odbudowa_p-dowod')).toHaveTextContent(`rodzaj twierdzenia: ${nazwa}`);
      unmount();
    }
  });

  it('obwiednia limitu w formie punktów (chwila, wartość, jednostka) i chwila punktu krytycznego', () => {
    render(<KartaWerdyktu rekord={ocenaNapieciaNadObwiednia()} />);
    const id = 'mvd-werdykt-frt.napiecie_nad_obwiednia';
    const tabela = karta(`${id}-limit-obwiednia`);
    expect(within(tabela).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'chwila t [s]',
      'wartość obwiedni [p.u. (U_n)]',
    ]);
    const wiersze = within(tabela)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent));
    expect(wiersze).toEqual([
      ['0', '0,25'],
      ['1', '0,75'],
      ['2', '0,75'],
    ]);
    expect(karta(`${id}-wynik`)).toHaveTextContent('chwila punktu krytycznego: 0,5 s');
    expect(karta(`${id}-margines`)).toHaveTextContent('punkt: punkt przyłączenia modułu');
  });

  it('nie dotyczy: stosowalność z powodem, pasmo limitu, niepewność „nie dotyczy” z powodem', () => {
    render(<KartaWerdyktu rekord={ocenaPasmaNieDotyczy()} />);
    const id = 'mvd-werdykt-rfg.pasmo_f';
    expect(karta(`${id}-stosowalnosc`)).toHaveTextContent(
      'nie dotyczy: wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny',
    );
    expect(karta(`${id}-limit`)).toHaveTextContent('pasmo dopuszczalne: od 48 Hz do 52 Hz');
    expect(karta(`${id}-niepewnosc`)).toHaveTextContent(`nie dotyczy — ${NIEPEWNOSC_NIE_DOTYCZY}`);
    expect(karta(`${id}-kompletnosc`)).toHaveTextContent('nie dotyczy');
  });

  it('brak podstawy: stan źródła „nieustalone” zawsze widoczny, brak wydania i jednostki nazwany wprost, uwagi podstawy', () => {
    render(<KartaWerdyktu rekord={ocenaBezPodstawyLimitu()} />);
    const podstawaLimitu = karta('mvd-werdykt-lfsm.statyzm-limit-podstawa');
    expect(podstawaLimitu).toHaveAttribute('data-stan-zrodla', 'NIEUSTALONE');
    expect(podstawaLimitu).toHaveTextContent('stan źródła: nieustalone');
    expect(podstawaLimitu).toHaveTextContent('wydanie: nie wskazano');
    expect(podstawaLimitu).toHaveTextContent('jednostka redakcyjna: nie wskazano');
    expect(podstawaLimitu).toHaveTextContent('rodzaj: warstwa o nieustalonym pochodzeniu');
    expect(podstawaLimitu).toHaveTextContent('uwagi: wartość przeniesiona z dawnych profili');
  });

  it('liczby formatowane bez przeliczeń: margines względny pokazany jako iloraz z rekordu (4 cyfry znaczące), nie w procentach UI', () => {
    render(<KartaWerdyktu rekord={ocenaOdbudowyNiejednoznaczna()} />);
    expect(karta('mvd-werdykt-frt.odbudowa_p-margines')).toHaveTextContent(
      'margines względny (odniesiony do skali): +0,02222',
    );
    expect(karta('mvd-werdykt-frt.odbudowa_p-margines')).toHaveTextContent('skala: 90 pp (wartość graniczna)');
  });

  it('jednostka marginesu pochodzi z marginesu, nie z wyniku (wynik w %, margines w punktach procentowych)', () => {
    render(<KartaWerdyktu rekord={ocenaOdbudowyNiejednoznaczna()} />);
    expect(karta('mvd-werdykt-frt.odbudowa_p-wynik')).toHaveTextContent('92 %');
    expect(karta('mvd-werdykt-frt.odbudowa_p-margines')).toHaveTextContent('+2 pp');
    expect(karta('mvd-werdykt-frt.odbudowa_p-margines')).toHaveTextContent('skala: 90 pp');
    expect(karta('mvd-werdykt-frt.odbudowa_p-niepewnosc')).toHaveTextContent('±2 pp');
  });
});

describe('KartaWerdyktu — sekcje rozwijane (zakres ważności, ślad) — natywny klik i klawiatura', () => {
  it('domyślnie zwinięte; jeden klik rozwija zakres ważności, drugi zwija (aria-expanded)', async () => {
    const uzytkownik = userEvent.setup();
    render(<KartaWerdyktu rekord={ocenaCzasuAktywacjiSpelniona()} />);
    const id = 'mvd-werdykt-frt.czas_aktywacji_iq';
    const przelacznik = karta(`${id}-zakres-przelacz`);
    expect(przelacznik).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId(`${id}-zakres`)).toBeNull();

    await uzytkownik.click(przelacznik);
    expect(przelacznik).toHaveAttribute('aria-expanded', 'true');
    const zakres = karta(`${id}-zakres`);
    expect(przelacznik).toHaveAttribute('aria-controls', zakres.id);
    expect(zakres).toHaveTextContent('RMS składowa zgodna, zwarcie trójfazowe');
    expect(zakres).toHaveTextContent('rodzaj analizy');
    expect(zakres).toHaveTextContent('dynamika RMS');
    expect(zakres).toHaveTextContent('symetria zakłócenia');
    expect(within(karta(`${id}-zakres-wykluczenia`)).getAllByRole('listitem')).toHaveLength(1);
    expect(karta(`${id}-zakres-parametry-sieci`)).toHaveTextContent('moc zwarciowa sieci S_k″: 120 MVA');

    await uzytkownik.click(przelacznik);
    expect(przelacznik).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId(`${id}-zakres`)).toBeNull();
  });

  it('klawiatura: Tab dochodzi do przełącznika zakresu, Enter rozwija; Tab do śladu, Spacja rozwija', async () => {
    const uzytkownik = userEvent.setup();
    render(<KartaWerdyktu rekord={ocenaCzasuAktywacjiSpelniona()} />);
    const id = 'mvd-werdykt-frt.czas_aktywacji_iq';

    await uzytkownik.tab();
    expect(karta(`${id}-zakres-przelacz`)).toHaveFocus();
    await uzytkownik.keyboard('{Enter}');
    expect(karta(`${id}-zakres-przelacz`)).toHaveAttribute('aria-expanded', 'true');
    expect(karta(`${id}-zakres`)).toBeVisible();

    await uzytkownik.tab();
    expect(karta(`${id}-slad-przelacz`)).toHaveFocus();
    await uzytkownik.keyboard(' ');
    const slad = karta(`${id}-slad`);
    expect(slad).toHaveTextContent('metryka: wartość metryki z przebiegu');
    // Identyfikator biegu i wersja silnika to metadane produkcyjne — sekcja audytowa, nie ślad.
    expect(slad).not.toHaveTextContent('bieg-001');
    expect(slad).not.toHaveTextContent('1.0.0');
  });

  it('zwiniete={false} otwiera sekcje od razu — także w ocenach składowych wymagania', () => {
    render(<KartaWerdyktu rekord={wymaganieNaruszone()} zwiniete={false} />);
    for (const id of ['rfg.art14_3', 'frt.czas_aktywacji_iq', 'frt.napiecie_nad_obwiednia']) {
      expect(karta(`mvd-werdykt-${id}-zakres-przelacz`)).toHaveAttribute('aria-expanded', 'true');
      expect(karta(`mvd-werdykt-${id}-slad`)).toBeVisible();
    }
  });
});

describe('KartaWerdyktu — rekord wymagania (poziom W): składowe zawsze widoczne, zakaz „master PASS”', () => {
  it('oceny składowe są w DOM bez żadnej interakcji — każda jako zagnieżdżona karta z własną etykietą i zdaniem', () => {
    const rekord = wymaganieNaruszone();
    render(<KartaWerdyktu rekord={rekord} />);
    const artykul = karta('mvd-werdykt-rfg.art14_3');
    expect(artykul).toHaveAttribute('data-poziom', 'W');
    const skladowe = karta('mvd-werdykt-rfg.art14_3-skladowe');
    expect(skladowe).toBeVisible();
    expect(skladowe).toHaveTextContent('Oceny składowe (2)');
    const zagniezdzone = skladowe.querySelectorAll('article[data-poziom="K"]');
    expect(zagniezdzone).toHaveLength(rekord.oceny_skladowe.length);
    for (const ocena of rekord.oceny_skladowe) {
      const id = `mvd-werdykt-${ocena.kryterium_id}`;
      expect(within(skladowe).getByTestId(id)).toBeVisible();
      expect(within(skladowe).getByTestId(`${id}-etykieta`)).toHaveTextContent(
        ocena.etykieta.etykieta_pl,
      );
      expect(within(skladowe).getByTestId(`${id}-zdanie`)).toHaveTextContent(
        ocena.wyjasnienie.zdanie_pl,
      );
    }
    // Składnik spełniony NIE znika za agregatem naruszonym (i odwrotnie).
    expect(
      within(skladowe).getByTestId('mvd-werdykt-frt.napiecie_nad_obwiednia-etykieta'),
    ).toHaveTextContent('Kryterium spełnione');
  });

  it('pola wymagania: stosowalność, sposób wykazania, pokrycie programu ze zdaniem, kryteria naruszone po nazwie, najbliżej granicy z powodem braku', () => {
    render(<KartaWerdyktu rekord={wymaganieNaruszone()} />);
    const id = 'mvd-werdykt-rfg.art14_3';
    const artykul = karta(id);
    // Pierwsza lista definicji w DOM to pola SAMEGO wymagania (karty składowe są dalej).
    const polaWymagania = artykul.querySelector('dl');
    const etykietyPol = Array.from(polaWymagania?.children ?? []).map(
      (wiersz) => wiersz.querySelector('dt')?.textContent,
    );
    expect(etykietyPol).toEqual([
      'Ocena',
      'Stosowalność',
      'Sposób wykazania',
      'Pokrycie programu badań',
      'Kryteria naruszone',
      'Kryterium najbliżej granicy',
      'Wyjaśnienie',
      'Podstawa wymagania',
      'Dowód',
      'Kompletność dowodu',
    ]);
    expect(karta(`${id}-stosowalnosc`)).toHaveTextContent(
      'dotyczy: wymaganie dotyczy modułów parku energii typu B',
    );
    expect(karta(`${id}-stosowalnosc`)).toHaveTextContent('moduł nowy (art. 4 rozporządzenia 2016/631)');
    expect(karta(`${id}-sposob-wykazania`)).toHaveTextContent('symulacja');
    expect(karta(`${id}-pokrycie`)).toHaveTextContent('pełne');
    expect(karta(`${id}-pokrycie`)).toHaveTextContent('3 głębokości zapadu × 2 poziomy mocy czynnej');
    const naruszone = karta(`${id}-naruszone-lista`);
    expect(within(naruszone).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Czas aktywacji prądu biernego (Moduł PV 2 MW)',
    ]);
    expect(karta(`${id}-najblizej`)).toHaveTextContent(
      'nie wskazano — powód podaje pole „Przyczyna” w wyjaśnieniu',
    );
    expect(karta(`${id}-podstawa-tresc`)).toHaveTextContent('jednostka redakcyjna: art. 14 ust. 3');
  });

  it('sposób wykazania z podstawą REGUŁY (np. pokrycie certyfikatem z warstwy WiPWC) albo jawnie bez reguły', () => {
    const bezReguly = render(<KartaWerdyktu rekord={wymaganieNaruszone()} />);
    expect(karta('mvd-werdykt-rfg.art14_3-sposob-wykazania')).toHaveTextContent(
      'bez osobnej reguły właściwości sposobu wykazania',
    );
    bezReguly.unmount();

    const zRegula: WynikWymagania = {
      ...wymaganieNaruszone(),
      podstawa_sposobu_wykazania: podstawa('WSKAZANE', {
        dokument: 'Wykaz urządzeń WiPWC — reguła pokrycia wymagań certyfikatem',
        jednostka: 'rozdz. 3',
      }),
    };
    render(<KartaWerdyktu rekord={zRegula} />);
    const podstawaReguly = karta('mvd-werdykt-rfg.art14_3-sposob-wykazania-podstawa');
    expect(podstawaReguly).toHaveTextContent(
      'dokument: „Wykaz urządzeń WiPWC — reguła pokrycia wymagań certyfikatem”',
    );
    expect(podstawaReguly).toHaveTextContent('jednostka redakcyjna: rozdz. 3');
    expect(podstawaReguly).toHaveAttribute('data-stan-zrodla', 'WSKAZANE');
  });

  it('wymaganie spełnione: kryterium najbliżej granicy nazwane po składniku z rekordu', () => {
    render(<KartaWerdyktu rekord={wymaganieSpelnione()} />);
    expect(karta('mvd-werdykt-rfg.art14_3-najblizej')).toHaveTextContent(
      'Odbudowa mocy czynnej po zakłóceniu (Moduł PV 2 MW)',
    );
    expect(karta('mvd-werdykt-rfg.art14_3-naruszone')).toHaveTextContent('brak');
  });

  it('brak metody: pusta lista składowych jest NAZWANA (nie pusta ramka), braki jako lista', () => {
    const rekord = wymaganieBezMetody();
    render(<KartaWerdyktu rekord={rekord} />);
    const id = 'mvd-werdykt-rfg.art14_3';
    expect(karta(`${id}-skladowe`)).toHaveTextContent('Oceny składowe (0)');
    expect(karta(`${id}-skladowe`)).toHaveTextContent('wymaganie nie ma ocen składowych');
    expect(karta(`${id}-sposob-wykazania`)).toHaveTextContent('brak metody');
    expect(
      within(karta(`${id}-czego-brakuje`)).getAllByRole('listitem').map((li) => li.textContent),
    ).toEqual(rekord.wyjasnienie.czego_brakuje);
    expect(screen.queryByTestId(`${id}-zastrzezenia`)).toBeNull();
  });
});

describe('KartaWerdyktu — iloczyn cech: poziom × status × semantyka (etykieta Z REKORDU, kolor Z SEMANTYKI)', () => {
  const PRZYPADKI = (['kryterium', 'wymaganie'] as const).flatMap((poziom) =>
    STATUSY.flatMap((status) => SEMANTYKI.map((semantyka) => ({ poziom, status, semantyka }))),
  );

  it.each(PRZYPADKI)(
    '$poziom × $status × $semantyka — napis jest etykietą rekordu, kolor tokenem semantyki',
    ({ poziom, status, semantyka }) => {
      const napis = `Etykieta z rekordu ${poziom}/${status}/${semantyka}`;
      const rekord =
        poziom === 'kryterium'
          ? zEtykieta(ocenaCzasuAktywacjiSpelniona(), status, { etykieta_pl: napis, semantyka })
          : zEtykieta(wymaganieBezMetody(), status, { etykieta_pl: napis, semantyka });
      const idKarty = poziom === 'kryterium' ? 'frt.czas_aktywacji_iq' : 'rfg.art14_3';
      const { unmount } = render(<KartaWerdyktu rekord={rekord} />);
      const artykul = karta(`mvd-werdykt-${idKarty}`);
      expect(karta(`mvd-werdykt-${idKarty}-etykieta`).textContent).toBe(napis);
      expect(artykul).toHaveAttribute('data-semantyka', semantyka);
      expect(artykul.style.getPropertyValue('--mvd-werdykt-kolor')).toBe(SEMANTYKA_KOLOR[semantyka]);
      // UI nie wie, co znaczy status: żadna etykieta słownika §9 nie pojawia się sama
      // (rekord W bez składowych — jedyny tekst oceny to etykieta z rekordu).
      if (poziom === 'wymaganie') {
        const tresc = artykul.textContent ?? '';
        for (const etykietaSlownika of ETYKIETY_SLOWNIKA) {
          expect(tresc).not.toContain(etykietaSlownika);
        }
      }
      unmount();
    },
  );

  it('podmiana etykieta_pl w TYM SAMYM rekordzie (ten sam status) zmienia napis — brak mapy status → etykieta', () => {
    const rekord = ocenaCzasuAktywacjiSpelniona();
    const { rerender } = render(<KartaWerdyktu rekord={rekord} />);
    expect(karta('mvd-werdykt-frt.czas_aktywacji_iq-etykieta').textContent).toBe(
      'Kryterium spełnione — dowód niepełny',
    );
    rerender(
      <KartaWerdyktu
        rekord={{ ...rekord, etykieta: { ...rekord.etykieta, etykieta_pl: 'Tekst podmieniony w rekordzie' } }}
      />,
    );
    expect(karta('mvd-werdykt-frt.czas_aktywacji_iq-etykieta').textContent).toBe(
      'Tekst podmieniony w rekordzie',
    );
  });

  it('ten sam status z inną semantyką zmienia kolor — kolor zależy WYŁĄCZNIE od semantyki', () => {
    const rekord = ocenaCzasuAktywacjiSpelniona();
    const kolory = SEMANTYKI.map((semantyka) => {
      const { unmount } = render(
        <KartaWerdyktu rekord={{ ...rekord, etykieta: { ...rekord.etykieta, semantyka } }} />,
      );
      const kolor = karta('mvd-werdykt-frt.czas_aktywacji_iq').style.getPropertyValue(
        '--mvd-werdykt-kolor',
      );
      unmount();
      return kolor;
    });
    expect(kolory).toEqual(['var(--mvd-ok)', 'var(--mvd-err)', 'var(--mvd-warn)', 'var(--mvd-muted)']);
  });

  it('żadnych samodzielnych plakietek PASS / FAIL / OK / ERROR w karcie', () => {
    for (const rekord of [
      ocenaCzasuAktywacjiSpelniona(),
      ocenaNapieciaNadObwiednia(),
      ocenaPozostaniaWPracy(),
      ocenaPasmaNieDotyczy(),
    ]) {
      const { container, unmount } = render(<KartaWerdyktu rekord={rekord} zwiniete={false} />);
      expect(container.textContent ?? '').not.toMatch(/\b(PASS|FAIL|OK|ERROR)\b/);
      unmount();
    }
  });
});

describe('EtykietaWerdyktu — plakietka komórki macierzy i listy rekordów: iloczyn status × semantyka', () => {
  const PRZYPADKI = ([...STATUSY, null] as const).flatMap((status, indeksStatusu) =>
    SEMANTYKI.map((semantyka) => ({ status, indeksStatusu, semantyka })),
  );

  it.each(PRZYPADKI)(
    'status $status × semantyka $semantyka — napis wyłącznie z rekordu, kolor z semantyki, status tylko atrybutem',
    ({ status, indeksStatusu, semantyka }) => {
      // Napis nie niesie literału statusu — asercja „status nie jest tekstem" musi coś mierzyć.
      const napis = `Etykieta rekordu nr ${indeksStatusu} (${semantyka})`;
      const { unmount } = render(
        <EtykietaWerdyktu
          etykieta={{ etykieta_pl: napis, semantyka }}
          status={status}
          testid="plakietka"
        />,
      );
      const plakietka = screen.getByTestId('plakietka');
      expect(plakietka.textContent).toBe(napis);
      expect(plakietka).toHaveAttribute('data-semantyka', semantyka);
      expect(plakietka.style.getPropertyValue('--mvd-werdykt-kolor')).toBe(SEMANTYKA_KOLOR[semantyka]);
      if (status === null) {
        expect(plakietka).not.toHaveAttribute('data-status');
      } else {
        expect(plakietka).toHaveAttribute('data-status', status);
        // Status maszynowy nigdy nie jest tekstem dla użytkownika (§9).
        expect(plakietka.textContent).not.toContain(status);
      }
      unmount();
    },
  );

  it('ta sama etykieta rekordu co karta: plakietka i karta pokazują identyczny napis i kolor', () => {
    const rekord = ocenaNapieciaNadObwiednia();
    render(
      <>
        <EtykietaWerdyktu etykieta={rekord.etykieta} status={rekord.status_maszynowy} testid="plakietka" />
        <KartaWerdyktu rekord={rekord} />
      </>,
    );
    const idKarty = `mvd-werdykt-${rekord.kryterium_id}`;
    expect(screen.getByTestId('plakietka').textContent).toBe(
      screen.getByTestId(`${idKarty}-etykieta`).textContent,
    );
    expect(screen.getByTestId('plakietka').style.getPropertyValue('--mvd-werdykt-kolor')).toBe(
      screen.getByTestId(idKarty).style.getPropertyValue('--mvd-werdykt-kolor'),
    );
  });
});

describe('KartaWerdyktu — jedyna mapa koloru i brak logiki statusu (przypięcie deklaracji modułu)', () => {
  const ZRODLO_KARTY = readFileSync(join(__dirname, '..', 'KartaWerdyktu.tsx'), 'utf-8');
  const ZRODLO_CSS = readFileSync(join(__dirname, '..', 'kartaWerdyktu.css'), 'utf-8');

  it('SEMANTYKA_KOLOR ma dokładnie cztery semantyki, każda na token motywu --mvd-*', () => {
    expect(Object.keys(SEMANTYKA_KOLOR).sort()).toEqual([...SEMANTYKI].sort());
    for (const kolor of Object.values(SEMANTYKA_KOLOR)) {
      expect(kolor).toMatch(/^var\(--mvd-[a-z-]+\)$/);
    }
  });

  it('źródło karty nie czyta statusu maszynowego ani literałów statusu werdyktu (UI nie zna reguł K/W)', () => {
    expect(ZRODLO_KARTY).not.toContain('status_maszynowy');
    for (const status of STATUSY.filter((s) => s !== 'NIE_DOTYCZY')) {
      expect(ZRODLO_KARTY).not.toContain(`'${status}'`);
    }
  });

  it('style karty bez literałów koloru (oba motywy wyłącznie przez tokeny)', () => {
    expect(ZRODLO_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ZRODLO_CSS).not.toMatch(/\brgba?\(/);
    expect(ZRODLO_CSS).not.toMatch(/\bhsla?\(/);
  });
});

// ---------------------------------------------------------------------------
// Pierwszy plan karty bez kodu produkcyjnego; surowe identyfikatory w sekcji audytowej
// ---------------------------------------------------------------------------

/**
 * Reguły strażnika prezentacji (`ui2/wyniki/akademickie/__tests__/prezentacja.straznik.test.tsx`)
 * zastosowane do KARTY werdyktu — karta jest wspólna dla wszystkich ekranów, więc napis
 * kodowy w jej pierwszym planie trafia na każdy ekran (identyfikator kryterium z kropkowaną
 * ścieżką, etykiety „status modelu"/„status danych" — trzy czerwone przypadki strażnika).
 * Reguły = reguły strażnika plus kod wyliczenia WIELKIMI literami z podkreśleniem: zdania
 * backendu (`werdykt/wyjasnienie.py`) niosą od pakietu D2 (luka §5.1) nazwy polskie, a kod
 * zostaje w polach rekordu — strażnik werdyktu pilnuje tego w odpowiedziach backendu
 * (sprawdzenie `5_kod_w_tekscie`), a ta reguła na PIERWSZYM PLANIE karty (rekordy testu
 * odwzorowują zdania backendu).
 */
const REGULY_KODU: readonly { readonly nazwa: string; readonly wzorzec: RegExp }[] = [
  { nazwa: 'ścieżka klucza', wzorzec: /[a-z][a-z0-9]*_?[a-z0-9]*\.[a-z][a-z0-9_]{2,}/ },
  { nazwa: 'identyfikator z podkreśleniem', wzorzec: /\b[a-z]{2,}_[a-z][a-z0-9_]*\b/ },
  { nazwa: 'anglicyzm', wzorzec: /\b(status|run|trace|proof|evidence|hash)\b/i },
  { nazwa: 'kod wyliczenia', wzorzec: /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/ },
];

function tekstPierwszegoPlanu(korzen: HTMLElement): string[] {
  const wynik: string[] = [];
  const odwiedz = (element: Element): void => {
    if (element.classList.contains('mvd-audyt')) return;
    element.childNodes.forEach((wezel) => {
      if (wezel.nodeType === Node.TEXT_NODE) {
        const tekst = (wezel.textContent ?? '').trim();
        if (tekst !== '') wynik.push(tekst);
      } else if (wezel.nodeType === Node.ELEMENT_NODE) {
        odwiedz(wezel as Element);
      }
    });
  };
  odwiedz(korzen);
  return wynik;
}

describe('KartaWerdyktu — pierwszy plan bez kodu produkcyjnego, identyfikatory w sekcji audytowej', () => {
  // Iloczyn cech: poziom rekordu (K × W, w tym W z ocenami składowymi i bez metody) × każdy
  // status/stan podstawy z fixtur × sekcje rozwinięte (`zwiniete={false}`).
  const PRZYPADKI: readonly (readonly [string, () => OcenaKryterium | WynikWymagania])[] = [
    ['K spełnione (identyfikator z kropką, element modelu)', ocenaCzasuAktywacjiSpelniona],
    ['K naruszone', ocenaCzasuAktywacjiNaruszona],
    ['K nad obwiednią', ocenaNapieciaNadObwiednia],
    ['K niejednoznaczne', ocenaOdbudowyNiejednoznaczna],
    ['K pozostanie w pracy', ocenaPozostaniaWPracy],
    ['K nie dotyczy', ocenaPasmaNieDotyczy],
    ['K bez podstawy limitu', ocenaBezPodstawyLimitu],
    ['W naruszone (z ocenami składowymi)', wymaganieNaruszone],
    ['W bez metody', wymaganieBezMetody],
    ['W spełnione', wymaganieSpelnione],
  ];

  it.each(PRZYPADKI)('%s: rozwinięta karta — zero napisów kodowych poza sekcją audytową', (_opis, fabryka) => {
    const rekord = fabryka();
    render(<KartaWerdyktu rekord={rekord} zwiniete={false} />);
    const identyfikator = 'wymaganie_id' in rekord ? rekord.wymaganie_id : rekord.kryterium_id;
    const artykul = karta(`mvd-werdykt-${identyfikator}`);
    const naruszenia = tekstPierwszegoPlanu(artykul).flatMap((tekst) =>
      REGULY_KODU.filter((r) => r.wzorzec.test(tekst)).map((r) => `${r.nazwa}: „${tekst}”`),
    );
    expect(naruszenia).toEqual([]);
  });

  it('samotest reguły kodu wyliczenia: kod w zdaniu rekordu jest naruszeniem pierwszego planu', () => {
    // Iniekcja: zdanie backendu sprzed luki §5.1 (kod poziomu zdolności w tekście). Bez tego
    // samotestu „zero naruszeń" wyżej mogłoby znaczyć „reguła nic nie wykrywa".
    const bazowy = ocenaCzasuAktywacjiSpelniona();
    const rekord = {
      ...bazowy,
      wyjasnienie: {
        ...bazowy.wyjasnienie,
        zdanie_pl: `${bazowy.wyjasnienie.zdanie_pl} Silnik o poziomie VALIDATED_SIMULATION.`,
      },
    };
    render(<KartaWerdyktu rekord={rekord} zwiniete={false} />);
    const naruszenia = tekstPierwszegoPlanu(karta(`mvd-werdykt-${rekord.kryterium_id}`)).flatMap(
      (tekst) => REGULY_KODU.filter((r) => r.wzorzec.test(tekst)).map((r) => r.nazwa),
    );
    expect(naruszenia).toContain('kod wyliczenia');
  });

  it('sekcja audytowa (natywny klik) niesie identyfikator, element modelu, kody osi dowodu i bieg ze śladu', async () => {
    const uzytkownik = userEvent.setup();
    const rekord = ocenaCzasuAktywacjiSpelniona();
    render(<KartaWerdyktu rekord={rekord} />);
    const id = `mvd-werdykt-${rekord.kryterium_id}`;
    expect(screen.queryByTestId(`${id}-audyt-lista`)).toBeNull();
    await uzytkownik.click(karta(`${id}-audyt-przelacz`));
    const lista = karta(`${id}-audyt-lista`);
    expect(lista).toHaveTextContent(`identyfikator kryterium${rekord.kryterium_id}`);
    expect(lista).toHaveTextContent(`element modelu${rekord.przedmiot.element_ref}`);
    expect(lista).toHaveTextContent(`kod poziomu zdolności narzędzia${rekord.dowod.poziom}`);
    expect(lista).toHaveTextContent(`kod walidacji modelu urządzenia${rekord.dowod.status_modelu}`);
    expect(lista).toHaveTextContent(`kod stanu danych wejściowych${rekord.dowod.status_danych.stan}`);
    expect(lista).toHaveTextContent(`kod stanu źródła podstawy${rekord.podstawa.status}`);
    const zBiegiem = rekord.slad.filter((o) => o.run_id !== null);
    expect(zBiegiem.length).toBeGreaterThan(0);
    for (const odnosnik of zBiegiem) expect(lista).toHaveTextContent(odnosnik.run_id!);
  });

  it('poziom certyfikatu badania typu ma polską nazwę (lustro EvidenceTier backendu)', () => {
    const bazowy = ocenaCzasuAktywacjiSpelniona();
    const rekord = { ...bazowy, dowod: { ...bazowy.dowod, poziom: 'TYPE_TEST_CERTIFICATE' as const } };
    render(<KartaWerdyktu rekord={rekord} />);
    expect(karta(`mvd-werdykt-${rekord.kryterium_id}-dowod`)).toHaveTextContent(
      'poziom zdolności narzędzia: certyfikat badania typu (wykaz PTPiREE)',
    );
  });
});
