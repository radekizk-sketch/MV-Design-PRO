/**
 * Jedyny predykat pickerów aparatu SN „tę pozycję wolno wybrać dla tego obiektu" (karta
 * UX-04/POLE-LINIOWE-WZORZEC, zakaz gazów fluorowanych w obiektach projektowanych —
 * rozporządzenie (UE) 2024/573, art. 13 ust. 9).
 *
 * Reguła NIE mieszka we froncie: backend wylicza przy każdej pozycji katalogu łączników
 * i aparatów SN (`GET /api/catalog/mv-apparatus-types`, `GET /api/catalog/switch-equipment-types`)
 * pole `dopuszczony_do_nowych_pol` i zdanie `powod_blokady_nowych_pol_pl` — tą samą funkcją,
 * którą strażnik operacji domenowej odmawia zapisu (`gazy_fluorowane.odmowa_gazu_fluorowanego_pl`).
 * Front tylko czyta te pola:
 *
 * - obiekt istniejący (`ISTNIEJACY` — inwentaryzacja aparatu zastanego, art. 13 ust. 7 i 10)
 *   widzi każdą pozycję, z medium na widoku;
 * - obiekt projektowany (każdy obiekt tworzony albo wymieniany — operacja nadaje mu stan
 *   `PROJEKTOWANY`) widzi wyłącznie pozycje z `dopuszczony_do_nowych_pol === true`; brak pola
 *   nie jest dopuszczeniem (brak potwierdzenia ≠ brak gazu — ta sama zasada co w backendzie);
 * - pozycja już przypisana obiektowi zostaje na liście (rekord niezmieniony nie znika z widoku;
 *   jego ocenę niesie walidator modelu W049, nie picker).
 *
 * Każdy konsument katalogu aparatów/łączników SN z wyborem pozycji importuje ten moduł —
 * przypina to `backend/tests/ci/test_pickery_aparatow_bez_gazu_fluorowanego.py`.
 */

import type { TypeCategory } from './types';

/**
 * Kategorie pickera typów niosące pola dopuszczenia backendu (łączniki i aparaty SN). Pozostałe
 * kategorie (kable, transformatory, przekładniki…) nie mają medium gaszenia łuku — filtr ich nie
 * dotyczy, a brak pola nie może ich ukryć.
 */
export const KATEGORIE_Z_DOPUSZCZENIEM_NOWYCH_POL: ReadonlySet<TypeCategory> = new Set<TypeCategory>([
  'SWITCH_EQUIPMENT',
  'MV_APPARATUS',
]);

/** Stan obiektu, dla którego wybierana jest pozycja (`null`/`''` = obiekt projektowany). */
export type StanObiektuWyboru = 'ISTNIEJACY' | 'PROJEKTOWANY' | '' | null | undefined;

/** Minimum pozycji katalogu potrzebne predykatowi (pola wyliczane backendu). */
export interface PozycjaZDopuszczeniem {
  readonly id: string;
  readonly dopuszczony_do_nowych_pol?: boolean;
  readonly powod_blokady_nowych_pol_pl?: string | null;
}

/** Czy pozycję wolno wybrać dla obiektu w danym stanie (z zachowaniem pozycji już wybranej). */
export function czyPozycjaDoWyboru(
  pozycja: PozycjaZDopuszczeniem,
  stanObiektu: StanObiektuWyboru,
  wybranaRef?: string | null,
): boolean {
  if (stanObiektu === 'ISTNIEJACY') return true;
  if (wybranaRef && pozycja.id === wybranaRef) return true;
  return pozycja.dopuszczony_do_nowych_pol === true;
}

/** Pozycje do wyboru dla obiektu w danym stanie (kolejność katalogu zachowana). */
export function pozycjeDoWyboru<T extends PozycjaZDopuszczeniem>(
  pozycje: readonly T[],
  stanObiektu: StanObiektuWyboru,
  wybranaRef?: string | null,
): T[] {
  return pozycje.filter((p) => czyPozycjaDoWyboru(p, stanObiektu, wybranaRef));
}

/**
 * Zdanie pod pickerem: ile pozycji ukryto i dlaczego (powód — zdanie backendu pierwszej ukrytej
 * pozycji, z podstawą i akcją naprawczą). `null`, gdy nic nie ukryto.
 */
export function notaPozycjiUkrytych(
  pozycje: readonly PozycjaZDopuszczeniem[],
  stanObiektu: StanObiektuWyboru,
  wybranaRef?: string | null,
): string | null {
  const ukryte = pozycje.filter((p) => !czyPozycjaDoWyboru(p, stanObiektu, wybranaRef));
  if (ukryte.length === 0) return null;
  const powod = ukryte.find((p) => p.powod_blokady_nowych_pol_pl)?.powod_blokady_nowych_pol_pl;
  const liczba = `Ukryto pozycje niedopuszczone do obiektu projektowanego: ${ukryte.length}.`;
  return powod ? `${liczba} Przykład: ${powod}` : liczba;
}

/** Nazwy mediów gaszenia łuku katalogu SN (wartości pola `medium` rekordów backendu). */
const NAZWY_MEDIUM_PL: Readonly<Record<string, string>> = {
  VACUUM: 'próżnia',
  AIR: 'powietrze',
  SF6: 'SF₆',
  'C4-FN': 'C4-FN',
  'C5-FK': 'C5-FK',
};

/** Medium pozycji na widoku pickera (wartość spoza słownika — bez zmian, nigdy ukryta). */
export function nazwaMediumPl(medium: string | null | undefined): string | null {
  const klucz = (medium ?? '').trim();
  if (!klucz) return null;
  return NAZWY_MEDIUM_PL[klucz.toUpperCase()] ?? klucz;
}
