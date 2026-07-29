/**
 * Słownik definicji parametrów katalogowych (karta techniczna W-205/W-206).
 *
 * ZASADA (karta E4.1 §2): definicja TYLKO dla parametrów, których znaczenie
 * wynika jednoznacznie z nazwy pola API i z normy. Pola niejednoznaczne
 * NIE mają definicji i nie są renderowane jako parametry (zero zgadywania).
 *
 * Klucz słownika = nazwa pola w odpowiedzi `/api/catalog/*`
 * (backend `to_dict()` w `backend/src/network_model/catalog/types.py`).
 * Każda pozycja ma źródło normatywne w polu `norma` oraz w komentarzu obok.
 */

import type { DefinicjaParametru } from './types';

export const DEFINICJE_PARAMETROW: Readonly<Record<string, DefinicjaParametru>> = {
  // — Linie i kable — impedancje składowej zgodnej —
  r_ohm_per_km: {
    symbol: 'R',
    etykieta: 'Rezystancja jednostkowa',
    jednostka: 'Ω/km',
    typ: 'liczba',
    miejscaDziesietne: 4,
    definicja: 'Rezystancja czynna przewodu na kilometr długości (składowa zgodna).',
    norma: 'IEC 60909-0', // źródło: IEC 60909-0 — impedancje elementów sieci
  },
  x_ohm_per_km: {
    symbol: 'X',
    etykieta: 'Reaktancja jednostkowa',
    jednostka: 'Ω/km',
    typ: 'liczba',
    miejscaDziesietne: 4,
    definicja: 'Reaktancja indukcyjna przewodu na kilometr długości (składowa zgodna).',
    norma: 'IEC 60909-0', // źródło: IEC 60909-0 — impedancje elementów sieci
  },
  b_us_per_km: {
    symbol: 'B',
    etykieta: 'Susceptancja jednostkowa',
    jednostka: 'μS/km',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Susceptancja poprzeczna linii na kilometr długości.',
    norma: 'IEC 60909-0', // źródło: IEC 60909-0 — admitancje poprzeczne
  },
  c_nf_per_km: {
    symbol: 'C',
    etykieta: 'Pojemność jednostkowa',
    jednostka: 'nF/km',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Pojemność doziemna kabla na kilometr długości.',
    norma: 'IEC 60287-1-1', // źródło: IEC 60287 — parametry cieplno-elektryczne kabli
  },
  r0_ohm_per_km: {
    symbol: 'R₀',
    etykieta: 'Rezystancja składowej zerowej',
    jednostka: 'Ω/km',
    typ: 'liczba',
    miejscaDziesietne: 4,
    definicja: 'Rezystancja jednostkowa dla składowej zerowej (obliczenia zwarć doziemnych).',
    norma: 'IEC 60909-0', // źródło: IEC 60909-0 — składowe symetryczne
  },
  x0_ohm_per_km: {
    symbol: 'X₀',
    etykieta: 'Reaktancja składowej zerowej',
    jednostka: 'Ω/km',
    typ: 'liczba',
    miejscaDziesietne: 4,
    definicja: 'Reaktancja jednostkowa dla składowej zerowej (obliczenia zwarć doziemnych).',
    norma: 'IEC 60909-0', // źródło: IEC 60909-0 — składowe symetryczne
  },
  rated_current_a: {
    symbol: 'Iz',
    etykieta: 'Obciążalność prądowa długotrwała',
    jednostka: 'A',
    typ: 'liczba',
    miejscaDziesietne: 0,
    definicja: 'Dopuszczalny prąd roboczy ciągły przewodu w warunkach znamionowych.',
    norma: 'IEC 60287-1-1', // źródło: IEC 60287 — obciążalność prądowa kabli
  },
  cross_section_mm2: {
    symbol: 'S',
    etykieta: 'Przekrój żyły roboczej',
    jednostka: 'mm²',
    typ: 'liczba',
    miejscaDziesietne: 0,
    definicja: 'Znormalizowany przekrój znamionowy żyły roboczej.',
    norma: 'IEC 60228', // źródło: IEC 60228 — znormalizowane przekroje żył
  },
  voltage_rating_kv: {
    symbol: 'Un',
    etykieta: 'Napięcie znamionowe',
    jednostka: 'kV',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowe napięcie międzyprzewodowe, na jakie element jest zaprojektowany.',
    norma: 'IEC 60038', // źródło: IEC 60038 — znormalizowane napięcia
  },
  max_temperature_c: {
    symbol: 'θmax',
    etykieta: 'Dopuszczalna temperatura robocza żyły',
    jednostka: '°C',
    typ: 'liczba',
    miejscaDziesietne: 0,
    definicja: 'Maksymalna temperatura żyły przy pracy ciągłej.',
    norma: 'IEC 60287-3-1', // źródło: IEC 60287 — dopuszczalne temperatury pracy
  },
  ith_1s_a: {
    symbol: 'Ith(1s)',
    etykieta: 'Prąd cieplny krótkotrwały (1 s)',
    jednostka: 'A',
    typ: 'liczba',
    miejscaDziesietne: 0,
    definicja: 'Znamionowy prąd wytrzymywany cieplnie przez 1 s (wytrzymałość zwarciowa cieplna).',
    norma: 'IEC 60949', // źródło: IEC 60949 — dopuszczalny prąd zwarciowy przewodów
  },
  jth_1s_a_per_mm2: {
    symbol: 'Jth(1s)',
    etykieta: 'Gęstość prądu cieplnego (1 s)',
    jednostka: 'A/mm²',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowa gęstość prądu zwarciowego cieplnego odniesiona do 1 s.',
    norma: 'IEC 60949', // źródło: IEC 60949 — gęstość prądu zwarciowego
  },

  // — Transformatory —
  rated_power_mva: {
    symbol: 'Sn',
    etykieta: 'Moc znamionowa',
    jednostka: 'MVA',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Znamionowa moc pozorna transformatora.',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — dane znamionowe transformatorów
  },
  voltage_hv_kv: {
    symbol: 'UnGN',
    etykieta: 'Napięcie znamionowe strony górnej',
    jednostka: 'kV',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowe napięcie uzwojenia górnego napięcia (GN).',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — dane znamionowe uzwojeń
  },
  voltage_lv_kv: {
    symbol: 'UnDN',
    etykieta: 'Napięcie znamionowe strony dolnej',
    jednostka: 'kV',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Znamionowe napięcie uzwojenia dolnego napięcia (DN).',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — dane znamionowe uzwojeń
  },
  uk_percent: {
    symbol: 'uk',
    etykieta: 'Napięcie zwarcia',
    jednostka: '%',
    typ: 'liczba',
    miejscaDziesietne: 2,
    definicja: 'Napięcie zwarcia w procentach napięcia znamionowego — wyznacza impedancję transformatora.',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 (uk), IEC 60909-0 (impedancja transformatora)
  },
  pk_kw: {
    symbol: 'Pk',
    etykieta: 'Straty obciążeniowe (zwarcia)',
    jednostka: 'kW',
    typ: 'liczba',
    miejscaDziesietne: 2,
    definicja: 'Straty mocy czynnej w próbie zwarcia przy prądzie znamionowym.',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — straty obciążeniowe
  },
  i0_percent: {
    symbol: 'i0',
    etykieta: 'Prąd biegu jałowego',
    jednostka: '%',
    typ: 'liczba',
    miejscaDziesietne: 2,
    definicja: 'Prąd stanu jałowego w procentach prądu znamionowego.',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — prąd jałowy
  },
  p0_kw: {
    symbol: 'P0',
    etykieta: 'Straty jałowe',
    jednostka: 'kW',
    typ: 'liczba',
    miejscaDziesietne: 2,
    definicja: 'Straty mocy czynnej w stanie jałowym (straty w rdzeniu).',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — straty jałowe
  },
  vector_group: {
    symbol: 'grupa połączeń',
    etykieta: 'Grupa połączeń',
    jednostka: '',
    typ: 'tekst',
    definicja: 'Układ i przesunięcie fazowe uzwojeń, np. „Dyn11".',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — oznaczenia grup połączeń
  },
  tap_step_percent: {
    symbol: 'Δu',
    etykieta: 'Skok zaczepu przełącznika',
    jednostka: '%',
    typ: 'liczba',
    miejscaDziesietne: 2,
    definicja: 'Zmiana napięcia przypadająca na jeden stopień przełącznika zaczepów.',
    norma: 'IEC 60076-1', // źródło: IEC 60076-1 — przełącznik zaczepów
  },

  // — Aparaty łączeniowe —
  un_kv: {
    symbol: 'Un',
    etykieta: 'Napięcie znamionowe',
    jednostka: 'kV',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowe napięcie robocze aparatu łączeniowego.',
    norma: 'IEC 62271-1', // źródło: IEC 62271-1 — wspólne wymagania aparatury WN/SN
  },
  in_a: {
    symbol: 'In',
    etykieta: 'Prąd znamionowy ciągły',
    jednostka: 'A',
    typ: 'liczba',
    miejscaDziesietne: 0,
    definicja: 'Znamionowy prąd roboczy ciągły toru głównego aparatu.',
    norma: 'IEC 62271-1', // źródło: IEC 62271-1 — prąd znamionowy ciągły
  },
  ik_ka: {
    symbol: 'Isc',
    etykieta: 'Znamionowy prąd wyłączalny zwarciowy',
    jednostka: 'kA',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowy prąd zwarciowy, który wyłącznik może wyłączyć.',
    norma: 'IEC 62271-100', // źródło: IEC 62271-100 — wyłączniki prądu przemiennego WN
  },
  icw_ka: {
    symbol: 'Icw',
    etykieta: 'Prąd krótkotrwały wytrzymywany',
    jednostka: 'kA',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowy prąd krótkotrwały wytrzymywany (wytrzymałość zwarciowa cieplna, 1 s).',
    norma: 'IEC 62271-1', // źródło: IEC 62271-1 — prąd krótkotrwały wytrzymywany
  },

  // — Falowniki / źródła OZE —
  sn_mva: {
    symbol: 'Sn',
    etykieta: 'Moc pozorna znamionowa',
    jednostka: 'MVA',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Znamionowa moc pozorna przekształtnika na przyłączu AC.',
    norma: 'IEC 62477-1', // źródło: IEC 62477-1 — układy energoelektroniczne przekształtnikowe
  },
  pmax_mw: {
    symbol: 'Pmax',
    etykieta: 'Moc czynna maksymalna',
    jednostka: 'MW',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Maksymalna moc czynna oddawana przez przekształtnik.',
    norma: 'IEC 62477-1', // źródło: IEC 62477-1 — parametry znamionowe przekształtnika
  },
  cosphi_min: {
    symbol: 'cosφmin',
    etykieta: 'Współczynnik mocy — minimalny',
    jednostka: '',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Dolna granica zakresu współczynnika mocy w punkcie przyłączenia.',
    norma: 'IEC 62477-1', // źródło: IEC 62477-1 — zakres pracy mocy biernej
  },
  cosphi_max: {
    symbol: 'cosφmax',
    etykieta: 'Współczynnik mocy — maksymalny',
    jednostka: '',
    typ: 'liczba',
    miejscaDziesietne: 3,
    definicja: 'Górna granica zakresu współczynnika mocy w punkcie przyłączenia.',
    norma: 'IEC 62477-1', // źródło: IEC 62477-1 — zakres pracy mocy biernej
  },
  e_kwh: {
    symbol: 'E',
    etykieta: 'Pojemność energetyczna magazynu',
    jednostka: 'kWh',
    typ: 'liczba',
    miejscaDziesietne: 1,
    definicja: 'Znamionowa pojemność energetyczna magazynu energii (BESS).',
    norma: 'IEC 62933-1', // źródło: IEC 62933 — systemy magazynowania energii elektrycznej
  },
};

/** Zwraca definicję parametru po kluczu pola API lub `null`, gdy pole jest niejednoznaczne. */
export function definicjaParametru(klucz: string): DefinicjaParametru | null {
  return DEFINICJE_PARAMETROW[klucz] ?? null;
}

/** Liczba udokumentowanych definicji (kryterium E4.1 §3.2: ≥ 15). */
export const LICZBA_DEFINICJI = Object.keys(DEFINICJE_PARAMETROW).length;
