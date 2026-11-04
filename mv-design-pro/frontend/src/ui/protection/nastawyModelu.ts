/**
 * Nastawy zabezpieczenia Z MODELU po rozwiązaniu przez backend — kontrakt odczytu.
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): nastawy żyją w modelu przy urządzeniu
 * (grupy nastaw sterownika pola, `ProtectionAssignment.grupy_nastaw`). Rozwiązanie — przeliczenie progu na stronę pierwotną
 * przez przekładnię przekładnika, zakresy katalogu z podstawą, nazwane braki z akcją
 * naprawczą — robi JEDNA ścieżka backendu
 * (`application/analyses/protection/ocena_nadpradowa.py::NastawyUrzadzenia.to_dict`).
 * Ten moduł niesie wyłącznie kształt odpowiedzi; ZERO fizyki w UI.
 */

/** Nazwany brak wstrzymujący ocenę urządzenia. */
export interface BrakNastaw {
  readonly kod: string;
  readonly komunikat_pl: string;
  readonly akcja_naprawcza_pl: string;
  readonly funkcja: string | null;
}

/** Rozwiązany stopień nadprądowy (wartości modelu + wielkości wyprowadzone przez backend). */
export interface StopienNastawWidok {
  readonly funkcja: string;
  readonly etykieta_pl: string;
  readonly krzywa: string;
  readonly krzywa_pl: string;
  readonly wartosc_progu: number;
  readonly jednostka_progu: string;
  readonly prog_wtorny_a: number;
  readonly prog_pierwotny_a: number;
  readonly tms: number | null;
  readonly zwloka_s: number | null;
}

/** Pozycja listy wyboru (kod + etykieta po polsku) z backendu. */
export interface PozycjaSlownika {
  readonly kod: string;
  readonly etykieta_pl: string;
}

/** Zakres jednej funkcji w pozycji katalogu (jednostka w `jednostka_zakresow_pradowych`). */
export interface ZakresFunkcji {
  readonly prog: readonly [number, number];
  readonly mnoznik?: readonly [number, number];
  readonly zwloka_s: readonly [number, number] | null;
}

/** Zakresy nastaw pozycji katalogu z jednostką i podstawą. */
export interface ZakresyKataloguNastaw {
  readonly pozycja: string;
  readonly model: string;
  readonly jednostka_zakresow_pradowych: 'KROTNOSC_IN' | 'A_WTORNY' | null;
  readonly podstawa_pl: string | null;
  readonly wejscia_pradowe_a: readonly number[];
  readonly funkcje: readonly string[];
  readonly krzywe: readonly string[];
  readonly charakterystyki: readonly PozycjaSlownika[];
  /** Zakresy stopni nadprądowych — klucz = kod funkcji rejestru. */
  readonly '51': ZakresFunkcji;
  readonly '50': ZakresFunkcji;
}

/** Pochodzenie charakterystyk: profil wskazany przez projektanta, profil wyrobu z katalogu albo
 *  profil roboczy (zasada nr 4 — wyrób nie podał zakresów; jakość `ESTIMATED`). */
export type ZrodloCharakterystyk = 'PROJEKTANT' | 'WYROB' | 'WARTOSC_ROBOCZA';

export interface CharakterystykiSterownikaWidok {
  readonly profil: string;
  readonly model: string;
  readonly zrodlo: ZrodloCharakterystyk;
  readonly jakosc: string | null;
  readonly powod_pl: string | null;
}

/** Nastawy urządzenia z modelu po rozwiązaniu — albo nazwane braki, które je blokują. */
export interface NastawyUrzadzeniaWidok {
  readonly urzadzenie_ref: string;
  readonly nazwa_pl: string;
  readonly breaker_ref: string | null;
  readonly ct_ref: string | null;
  readonly przekladnia_a: readonly [number, number] | null;
  readonly klasa_ct: string | null;
  readonly alf: number | null;
  readonly pozycja_katalogu: string | null;
  readonly zakresy: ZakresyKataloguNastaw | null;
  /** Źródło charakterystyk funkcji (`ocena_nadpradowa.CharakterystykiSterownika.to_dict`). */
  readonly charakterystyki: CharakterystykiSterownikaWidok | null;
  readonly stopnie: readonly StopienNastawWidok[];
  readonly braki: readonly BrakNastaw[];
  readonly funkcje_nieoceniane: readonly { funkcja: string; powod_pl: string }[];
  readonly gotowe: boolean;
}

/** Etykieta jednostki zakresu w zdaniu dla projektanta (kody z backendu, zbiór zamknięty). */
export const JEDNOSTKA_ZAKRESU_PL: Record<'KROTNOSC_IN' | 'A_WTORNY', string> = {
  KROTNOSC_IN: '×In',
  A_WTORNY: 'A (strona wtórna)',
};
