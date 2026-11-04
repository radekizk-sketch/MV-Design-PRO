/**
 * Rejestr definicji pól danych znamionowych rozdzielnicy sekcji GPZ (karta GPZ-DANE-ANALIZ).
 *
 * PO CO. Sekcja szyn GPZ niesie w modelu blok `rozdzielnica` (`GPZSection.rozdzielnica`), z którego
 * czytają dwie analizy: wytrzymałość szyn zbiorczych sekcji (dynamiczna, cieplna, napięciowa,
 * prądu ciągłego i łukowa IAC — widok „Weryfikacja aparatury”) oraz łuk elektryczny (geometria
 * łuku węzła szyn sekcji). Formularz konfiguratora GPZ potrzebuje dla każdego pola: etykiety,
 * jednostki, zakresu z podstawą normową, operacji zapisu i źródła wartości — ten rejestr jest
 * JEDYNYM miejscem tych definicji po stronie frontendu.
 *
 * ZERO FANTOMÓW. Rejestr jest lustrem tablicy parytetu backendu
 * `backend/schemas/rozdzielnica_gpz_parytet_v1.json` (eksport `enm/rozdzielnica_gpz.py`, jedyny
 * opis pól, z którego model pydantic bierze granice). Test
 * `__tests__/poleGpzDefinicje.test.ts` przypina równość kluczy, kolejności, nazw, jednostek,
 * zakresów, słowników i konsumentów; test backendu przypina, że plik jest eksportem opisu, a
 * klucze opisu są polami modelu. Pole bez odpowiednika w backendzie wywraca oba testy.
 *
 * Rejestr NIE waliduje wartości — zakres jest informacją dla projektanta; odmowę z powodem po
 * polsku zwraca brama backendu (`waliduj_rozdzielnice`, kod `gpz_section.update.rozdzielnica_invalid`).
 */

import type { RozdzielnicaSekcjiGpz } from '../../../types/enm';

/** Klucz bloku rozdzielnicy = klucz pola modelu ENM. */
export type KluczPolaRozdzielnicy = keyof RozdzielnicaSekcjiGpz;

/** Analiza czytająca pole (identyfikatory deklaracji backendu `KONSUMENCI_POL_ROZDZIELNICY`). */
export type KonsumentPolaRozdzielnicy = 'wytrzymalosc_szyn_sekcji' | 'luk_elektryczny';

/** Operacja i ścieżka zapisu bloku — jedyny pisarz po stronie backendu. */
export const OPERACJA_ZAPISU_ROZDZIELNICY = 'update_gpz_section' as const;
export const SCIEZKA_ZAPISU_ROZDZIELNICY = 'updates.rozdzielnica' as const;

/** Skąd pochodzi wartość pola i jak traktuje ją ocena (zasada nr 4). */
const ZRODLO_DANYCH_ROZDZIELNICY =
  'tabliczka znamionowa, karta katalogowa albo DTR rozdzielnicy; bez dokumentu źródłowego ' +
  'wartość jest wartością projektanta — ocena stoi na danej przyjętej (dowód niepełny)';

export interface DefinicjaPolaLiczbowego {
  readonly klucz: KluczPolaRozdzielnicy;
  readonly rodzaj: 'liczba';
  readonly etykietaPl: string;
  readonly symbol: string;
  readonly jednostka: string;
  /** Zakres domknięty z obu stron i jego podstawa (tekst backendu). */
  readonly zakres: { readonly od: number; readonly do: number; readonly podstawaPl: string };
  readonly zrodloWartosciPl: string;
  readonly konsumenci: readonly KonsumentPolaRozdzielnicy[];
}

export interface DefinicjaPolaSlownikowego {
  readonly klucz: KluczPolaRozdzielnicy;
  readonly rodzaj: 'slownik' | 'tekst';
  readonly etykietaPl: string;
  /** Słownik zamknięty (`null` = tekst). */
  readonly dozwolone: readonly string[] | null;
  /** Wzór tekstu (`null` = dowolny niepusty tekst). */
  readonly wzor: string | null;
  readonly zrodloWartosciPl: string;
  readonly konsumenci: readonly KonsumentPolaRozdzielnicy[];
}

export type DefinicjaPolaRozdzielnicy = DefinicjaPolaLiczbowego | DefinicjaPolaSlownikowego;

const W: KonsumentPolaRozdzielnicy = 'wytrzymalosc_szyn_sekcji';
const L: KonsumentPolaRozdzielnicy = 'luk_elektryczny';

function liczba(
  klucz: KluczPolaRozdzielnicy,
  etykietaPl: string,
  symbol: string,
  jednostka: string,
  zakres: DefinicjaPolaLiczbowego['zakres'],
  konsumenci: readonly KonsumentPolaRozdzielnicy[],
): DefinicjaPolaLiczbowego {
  return {
    klucz,
    rodzaj: 'liczba',
    etykietaPl,
    symbol,
    jednostka,
    zakres,
    zrodloWartosciPl: ZRODLO_DANYCH_ROZDZIELNICY,
    konsumenci,
  };
}

/** Definicje pól w kolejności opisu backendu (najpierw liczbowe, potem słownikowe). */
export const POLA_ROZDZIELNICY_GPZ: readonly DefinicjaPolaRozdzielnicy[] = [
  liczba('u_r_kv', 'napięcie znamionowe rozdzielnicy', 'U_r', 'kV', {
    od: 1.0,
    do: 245.0,
    podstawaPl:
      'IEC 62271-1:2017 p. 5.2, tabl. 1 (zakres I: U_r od 3,6 kV do 245 kV); dolna granica ' +
      '1 kV — rozdzielnica sekcji GPZ jest aparaturą wysokonapięciową',
  }, [W]),
  liczba('i_r_a', 'prąd znamionowy ciągły szyn zbiorczych', 'I_r', 'A', {
    od: 100.0,
    do: 6300.0,
    podstawaPl:
      'IEC 62271-1:2017 p. 5.5 (szereg R10 prądów znamionowych ciągłych; rozdzielnice SN ' +
      'i 110 kV od 400 A do 4000 A, granica 6300 A — największa wartość szeregu w kartach)',
  }, [W]),
  liczba('i_k_ka', 'prąd znamionowy krótkotrwały wytrzymywany szyn', 'I_k', 'kA', {
    od: 0.1,
    do: 100.0,
    podstawaPl: 'IEC 62271-1:2017 p. 5.6 (szereg R10: 6,3 kA … 80 kA)',
  }, [W]),
  liczba('t_k_s', 'znamionowy czas trwania zwarcia szyn', 't_k', 's', {
    od: 0.1,
    do: 5.0,
    podstawaPl:
      'IEC 62271-1:2017 p. 5.8 (wartość zalecana 1 s; wartości alternatywne 0,5 s, 2 s, 3 s)',
  }, [W]),
  liczba('i_p_ka', 'prąd znamionowy szczytowy wytrzymywany szyn', 'I_p', 'kA', {
    od: 0.1,
    do: 250.0,
    podstawaPl: 'IEC 62271-1:2017 p. 5.7 (I_p = 2,5·I_k przy 50 Hz; do 250 kA)',
  }, [W]),
  liczba('iac_i_a_ka', 'prąd próby łukowej klasyfikacji IAC', 'I_A', 'kA', {
    od: 0.1,
    do: 100.0,
    podstawaPl: 'IEC 62271-200:2021 p. 6.106 (prąd próby łuku wewnętrznego)',
  }, [W]),
  liczba('iac_t_a_s', 'czas próby łukowej klasyfikacji IAC', 't_A', 's', {
    od: 0.1,
    do: 3.0,
    podstawaPl:
      'IEC 62271-200:2021 p. 6.106 (czasy zalecane 0,1 s, 0,5 s, 1 s; do 3 s w kartach)',
  }, [W]),
  liczba('odstep_elektrod_mm', 'odstęp szyn (elektrod) w przedziale szynowym', 'G', 'mm', {
    od: 6.35,
    do: 254.0,
    podstawaPl:
      'IEEE 1584-2018 p. 4.2 (zakres ważności modelu: 6,35–76,2 mm do 600 V, ' +
      '19,05–254 mm od 601 V do 15 kV)',
  }, [L]),
  liczba('odleglosc_robocza_mm', 'odległość robocza od miejsca łuku', 'D', 'mm', {
    od: 305.0,
    do: 3000.0,
    podstawaPl:
      'IEEE 1584-2018 p. 4.2 (odległość robocza ≥ 305 mm); górna granica 3000 mm — ' +
      'obsługa rozdzielnicy wnętrzowej z korytarza',
  }, [L]),
  liczba('szerokosc_obudowy_mm', 'szerokość obudowy przedziału', 'W', 'mm', {
    od: 100.0,
    do: 5000.0,
    podstawaPl:
      'IEEE 1584-2018 p. 4.8 (korekcja rozmiaru obudowy; wymiar ponad 1244,6 mm model ' +
      'ogranicza sam) — zakres fizyczny przedziału rozdzielnicy',
  }, [L]),
  liczba('wysokosc_obudowy_mm', 'wysokość obudowy przedziału', 'H', 'mm', {
    od: 100.0,
    do: 5000.0,
    podstawaPl:
      'IEEE 1584-2018 p. 4.8 (korekcja rozmiaru obudowy; wymiar ponad 1244,6 mm model ' +
      'ogranicza sam) — zakres fizyczny przedziału rozdzielnicy',
  }, [L]),
  liczba('glebokosc_obudowy_mm', 'głębokość obudowy przedziału', 'D_o', 'mm', {
    od: 100.0,
    do: 5000.0,
    podstawaPl:
      'IEEE 1584-2018 p. 4.8 (głębokość decyduje o obudowie płytkiej) — zakres fizyczny ' +
      'przedziału rozdzielnicy',
  }, [L]),
  {
    klucz: 'iac_dostepnosc',
    rodzaj: 'slownik',
    etykietaPl: 'rodzaj dostępności klasyfikacji IAC',
    dozwolone: ['A', 'B', 'C'],
    wzor: null,
    zrodloWartosciPl: ZRODLO_DANYCH_ROZDZIELNICY,
    konsumenci: [W],
  },
  {
    klucz: 'iac_strony',
    rodzaj: 'tekst',
    etykietaPl: 'strony obudowy objęte klasyfikacją IAC',
    dozwolone: null,
    wzor: '^[F]?[L]?[R]?$',
    zrodloWartosciPl: ZRODLO_DANYCH_ROZDZIELNICY,
    konsumenci: [W],
  },
  {
    klucz: 'konfiguracja_elektrod',
    rodzaj: 'slownik',
    etykietaPl: 'konfiguracja elektrod (IEEE 1584)',
    dozwolone: ['VCB', 'VCBB', 'HCB', 'VOA', 'HOA'],
    wzor: null,
    zrodloWartosciPl: ZRODLO_DANYCH_ROZDZIELNICY,
    konsumenci: [L],
  },
  {
    klucz: 'dokument_zrodlowy',
    rodzaj: 'tekst',
    etykietaPl: 'dokument źródłowy danych rozdzielnicy',
    dozwolone: null,
    wzor: null,
    zrodloWartosciPl:
      'numer karty katalogowej albo DTR producenta — z nim liczby bloku są danymi ' +
      'producenta (podstawa limitu: karta), bez niego — wartościami projektanta',
    konsumenci: [W, L],
  },
];
