/**
 * Nagłówek diagnostyki modelu i macierzy pre-flight — fakty zamiast statusu zbiorczego.
 *
 * Karta WERDYKT-MIGRACJA-190 (E62): dawny nagłówek tłumaczył status OK/WARN/FAIL na
 * „Model poprawny / Ostrzeżenia / Błędy blokujące” (zielony przy braku zgłoszeń — brak
 * wykrytych problemów udawał potwierdzenie poprawności), a macierz pre-flight pisała
 * „Gotowy do analizy” z flagi `ready = status ≠ FAIL`, choć zwarcie 1F bywało zablokowane
 * ostrzeżeniem E-D06. Teraz nagłówek mówi, co wskazały reguły diagnostyki (liczby zgłoszeń
 * z backendu) i ile analiz macierz dopuszcza; brak zgłoszeń ma ton neutralny.
 */

export type TonNaglowka = 'blokada' | 'ostrzezenie' | 'neutralny';

export interface NaglowekDiagnostyki {
  readonly tekst: string;
  readonly ton: TonNaglowka;
}

export const KLASY_TONU_NAGLOWKA: Readonly<Record<TonNaglowka, string>> = {
  blokada: 'bg-rose-50 border-rose-200 text-rose-700',
  ostrzezenie: 'bg-amber-50 border-amber-200 text-amber-700',
  neutralny: 'bg-slate-50 border-slate-200 text-slate-700',
};

/** Nagłówek panelu diagnostyki z liczby zgłoszeń blokujących i ostrzegawczych. */
export function naglowekDiagnostyki(liczby: {
  readonly blocker_count: number;
  readonly warning_count: number;
}): NaglowekDiagnostyki {
  if (liczby.blocker_count > 0) {
    return { tekst: 'Reguły diagnostyki wskazały blokady analiz', ton: 'blokada' };
  }
  if (liczby.warning_count > 0) {
    return { tekst: 'Reguły diagnostyki wskazały ostrzeżenia', ton: 'ostrzezenie' };
  }
  return {
    tekst:
      'Reguły diagnostyki nie wskazały blokad ani ostrzeżeń — to nie jest ocena kompletności danych ani poprawności wyników',
    ton: 'neutralny',
  };
}

/** Nagłówek macierzy pre-flight z dostępności każdej analizy (jedno źródło: `checks`). */
export function naglowekPreflight(
  checks: readonly { readonly status: string }[],
): NaglowekDiagnostyki {
  const dostepne = checks.filter((c) => c.status === 'AVAILABLE').length;
  const tekst = `Dostępne analizy: ${dostepne} z ${checks.length}`;
  if (checks.length === 0 || dostepne === 0) return { tekst, ton: 'blokada' };
  if (dostepne < checks.length) return { tekst, ton: 'ostrzezenie' };
  return { tekst, ton: 'neutralny' };
}
