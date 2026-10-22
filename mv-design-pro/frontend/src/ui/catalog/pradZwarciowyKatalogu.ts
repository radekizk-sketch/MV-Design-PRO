/**
 * Zapis prądu zwarciowego pozycji katalogu aparatury [kA] w podsumowaniach i listach.
 *
 * `null` (albo brak pola) to BRAK DANEJ z karty katalogowej — pokazywany jako „brak danych”,
 * nigdy jako „0 kA” ani „- kA”. Backend zapisuje brak danej jako `null` (bramka rekordu
 * KAT-T-048 odrzuca 0 kA dla wielkości właściwej rodzajowi aparatu).
 */
export const BRAK_DANYCH_PL = 'brak danych';

export function pradKaLubBrakDanych(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return BRAK_DANYCH_PL;
  }
  const tekst = Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '');
  return `${tekst} kA`;
}
