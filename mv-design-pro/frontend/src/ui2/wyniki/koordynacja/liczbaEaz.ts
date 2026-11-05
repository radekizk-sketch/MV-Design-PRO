/**
 * Zapis liczb ekranów zabezpieczeń (ocena ziemnozwarciowa, uziemienia stacji, wykres wskazowy)
 * — JEDEN formatter repo (`formatPolishValue`: separator pl-PL, brak → „—”), miejsca dziesiętne
 * wg jednostki wielkości z backendu (czasy z trzema). Jednostka idzie do nagłówka kolumny, nie
 * do komórki. Formatowanie, nie fizyka: liczba przychodzi z backendu.
 */

import { formatPolishValue } from '../../../ui/shared/formatPolishValue';

const MIEJSCA_JEDNOSTKI: Readonly<Record<string, number>> = {
  A: 2,
  '1': 2,
  s: 3,
  'Ω': 0,
  '%': 1,
  '°': 1,
  mS: 3,
  kW: 2,
  V: 1,
  kV: 2,
};

export function liczbaEaz(wartosc: number | null | undefined, jednostka: string): string {
  return formatPolishValue(wartosc, { decimals: MIEJSCA_JEDNOSTKI[jednostka] ?? 2 });
}
