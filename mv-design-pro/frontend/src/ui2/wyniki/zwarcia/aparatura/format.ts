/**
 * JEDYNY formater liczb sekcji wytrzymałości aparatury (karta APARATURA-TABELA, wymaganie 9).
 *
 * Reguła właściciela: prądy i zapasy — 2 miejsca po przecinku, czasy — 3; wartość całkowita
 * bez zbędnych zer („50”, nie „50,000”; „1”, nie „1,000”). Jednostka stoi w nagłówku kolumny,
 * więc formater zwraca SAMĄ liczbę. Zapas dostaje znak („+29,98”, „−1,50”, „0”). Formater
 * niczego nie liczy poza zaokrągleniem do wyświetlenia — liczby pochodzą z backendu.
 */

export type RodzajWielkosci = 'prad' | 'zapas' | 'czas';

const MIEJSCA: Readonly<Record<RodzajWielkosci, number>> = {
  prad: 2,
  zapas: 2,
  czas: 3,
};

/** Minus typograficzny (U+2212) — ten sam znak co w pozostałych tabelach wyników. */
const MINUS = '−';

export function formatujWielkosc(wartosc: number, rodzaj: RodzajWielkosci): string {
  const miejsca = Number.isInteger(wartosc) ? 0 : MIEJSCA[rodzaj];
  const modul = Math.abs(wartosc).toFixed(miejsca).replace('.', ',');
  // Zaokrąglenie do zera (np. −0,001 przy 2 miejscach) nie niesie znaku.
  const zero = Number(Math.abs(wartosc).toFixed(miejsca)) === 0;
  if (zero) return modul;
  if (wartosc < 0) return `${MINUS}${modul}`;
  return rodzaj === 'zapas' ? `+${modul}` : modul;
}
