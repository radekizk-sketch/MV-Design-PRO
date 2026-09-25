/*
 * Etykieta wartości wyliczeniowej ze słownika typowanego (karta #145, §0 pkt 2).
 *
 * Kod wyliczenia z backendu (status, rodzaj, flaga, tryb) nigdy nie trafia na ekran
 * surowo. Słowniki są typowane zamkniętymi uniami kodów, a ich kompletność względem
 * backendu przypinają testy parytetu; wartość spoza słownika (nowy kod backendu przed
 * aktualizacją słownika) daje uczciwe zdanie po polsku zamiast kodu. Jedno miejsce tej
 * reguły dla wszystkich ekranów wyników — wcześniej każdy słownik miał własne
 * `mapa[kod] ?? kod`, które przepisywało kod na ekran.
 */

import { WZORZEC_STRINGS } from './strings';

export function etykietaZeSlownika<K extends string>(
  slownik: Readonly<Record<K, string>>,
  kod: string,
): string {
  return Object.prototype.hasOwnProperty.call(slownik, kod)
    ? slownik[kod as K]
    : WZORZEC_STRINGS.wartoscSpozaSlownika;
}
