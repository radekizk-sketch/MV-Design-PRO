/*
 * Model prezentacji okna „Analizy akademickie" (ui2/wyniki/akademickie).
 * Wyłącznie MAPOWANIE gotowych artefaktów backendu na model widoku — ZERO fizyki,
 * ZERO ocen lokalnych, ZERO uzupełniania brakujących wartości.
 *
 * DEKLARACJA (przypięta testami `model.test.ts`): spłaszczenie wyniku jest PEŁNE —
 * liczba wierszy równa się liczbie liści ładunku, niezależnie od jego rozmiaru
 * i głębokości. Powierzchnia zastana `V126AcademicSurface` gubiła tu dane przez
 * trzy zaszyte limity (`slice(0,18)` wierszy, `slice(0,8)` zagnieżdżeń,
 * `slice(0,6)` pól pierwszego elementu tablicy) — zmierzone straty: 11 wierszy
 * dla `ssci_impedance`, 6 dla `neutral_earthing_design`, po 4 dla
 * `voltage_stability` i `earthing_safety`, a przy tablicach (widmo harmonicznych,
 * punkty TRV) tysiące pól nie miały jak się pokazać. Limit MA WYNIKAĆ Z DANYCH.
 */

import type { KrokDowodu, KrokSladu, RaportAnalizy, SekcjaRaportu } from './api';

// ---------------------------------------------------------------------------
// Spłaszczenie wyniku
// ---------------------------------------------------------------------------

/** Pojedynczy liść wyniku: pełna ścieżka pola + wartość skalarna. */
export interface WierszWyniku {
  /** Pełna ścieżka pola, np. `settings.u0_start_percent` albo `arresters[0].bil_kv`. */
  readonly sciezka: string;
  /** Pierwszy segment ścieżki — klucz grupowania w widoku. */
  readonly grupa: string;
  readonly wartosc: unknown;
}

function jestObiektem(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

function zbierz(wartosc: unknown, sciezka: string, grupa: string, wyjscie: WierszWyniku[]): void {
  if (Array.isArray(wartosc)) {
    if (wartosc.length === 0) {
      wyjscie.push({ sciezka, grupa, wartosc: [] });
      return;
    }
    wartosc.forEach((element, index) => {
      zbierz(element, `${sciezka}[${index}]`, grupa, wyjscie);
    });
    return;
  }
  if (jestObiektem(wartosc)) {
    const klucze = Object.keys(wartosc);
    if (klucze.length === 0) {
      wyjscie.push({ sciezka, grupa, wartosc: {} });
      return;
    }
    klucze.forEach((klucz) => {
      const dziecko = sciezka === '' ? klucz : `${sciezka}.${klucz}`;
      zbierz(wartosc[klucz], dziecko, sciezka === '' ? klucz : grupa, wyjscie);
    });
    return;
  }
  wyjscie.push({ sciezka, grupa, wartosc });
}

/**
 * Spłaszcza ładunek wyniku do PEŁNEJ listy liści (bez żadnego limitu liczby wierszy,
 * głębokości ani długości tablic). Kolejność deterministyczna — zgodna z kolejnością
 * kluczy w odpowiedzi backendu (JSON zachowuje kolejność wstawienia).
 */
export function splaszczWynik(payload: unknown): WierszWyniku[] {
  const wyjscie: WierszWyniku[] = [];
  if (payload === null || payload === undefined) return wyjscie;
  zbierz(payload, '', '', wyjscie);
  return wyjscie;
}

/** Grupa wierszy wyniku (pierwszy segment ścieżki). */
export interface GrupaWyniku {
  readonly klucz: string;
  readonly wiersze: readonly WierszWyniku[];
}

/**
 * Grupuje pełną listę wierszy po pierwszym segmencie ścieżki, zachowując kolejność
 * pierwszego wystąpienia. Grupowanie jest wyłącznie układem widoku — ŻADEN wiersz
 * nie znika (suma liczności grup == długość wejścia; przypięte testem).
 */
export function pogrupujWynik(wiersze: readonly WierszWyniku[]): GrupaWyniku[] {
  const kolejnosc: string[] = [];
  const mapa = new Map<string, WierszWyniku[]>();
  wiersze.forEach((wiersz) => {
    const istniejaca = mapa.get(wiersz.grupa);
    if (istniejaca) {
      istniejaca.push(wiersz);
      return;
    }
    kolejnosc.push(wiersz.grupa);
    mapa.set(wiersz.grupa, [wiersz]);
  });
  return kolejnosc.map((klucz) => ({ klucz, wiersze: mapa.get(klucz) ?? [] }));
}

// ---------------------------------------------------------------------------
// Ślad, dowód, raport — przekazanie BEZ limitu
// ---------------------------------------------------------------------------

/**
 * Kroki śladu do wyświetlenia. Funkcja tożsamościowa Z ZAŁOŻENIA — istnieje po to,
 * by miejsce ewentualnego limitu było jedno i pokryte testem. Liczba kroków wynika
 * WYŁĄCZNIE z odpowiedzi backendu (kontrakt `AcademicWhiteBoxTraceV1`).
 */
export function krokiSladuDoWidoku(kroki: readonly KrokSladu[]): readonly KrokSladu[] {
  return kroki;
}

/** Kroki dowodu do wyświetlenia — komplet pakietu `AcademicProofPackV1`. */
export function krokiDowoduDoWidoku(kroki: readonly KrokDowodu[]): readonly KrokDowodu[] {
  return kroki;
}

/** Sekcje raportu do wyświetlenia — komplet kontraktu `AcademicReportV1`. */
export function sekcjeRaportuDoWidoku(raport: RaportAnalizy): readonly SekcjaRaportu[] {
  return raport.sections;
}

/** Suma metryk wszystkich sekcji raportu (jawna liczba dla nagłówka). */
export function licznikMetrykRaportu(raport: RaportAnalizy): number {
  return raport.sections.reduce((suma, sekcja) => suma + sekcja.metrics.length, 0);
}
