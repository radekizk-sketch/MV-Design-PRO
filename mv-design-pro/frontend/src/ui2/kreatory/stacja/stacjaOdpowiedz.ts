/**
 * Odczyt odpowiedzi operacji stacyjnej (kreator stacji, krok 8).
 *
 * B-3 ZAMKNIĘTY (karta KD-2): wyposażenie pomiarowo-zabezpieczeniowe pól
 * (CT → VT → zabezpieczenie) NIE jest już dokładane sekwencją osobnych operacji
 * po zapisie stacji. Operacja stacyjna przyjmuje je per pole
 * (`sn_fields[i].equipment`) i tworzy w TEJ SAMEJ transakcji/migawce co stację —
 * błąd któregokolwiek elementu kończy całą operację (koniec meldunku „wykonano
 * N z M" i stanu połowicznego). Ten plik został z JEDNĄ odpowiedzialnością:
 * odczytać z odpowiedzi referencję utworzonej stacji (łańcuchowanie kolejnego
 * kroku kreatora).
 */

import type { DomainOpResponseV1 } from '../../../types/enm';

/**
 * Referencja stacji utworzonej przez operację: przecięcie `created_element_ids`
 * z rekordami stacji snapshotu. Odporne na różne wzorce identyfikatorów obu
 * operacji (`stn/…/station` przy podziale, `sub/…/substation` przy dopięciu na
 * końcu) — bez zgadywania po kształcie tekstu.
 */
export function refUtworzonejStacji(response: DomainOpResponseV1 | null): string | null {
  const utworzone = new Set(response?.changes?.created_element_ids ?? []);
  const substations = (response?.snapshot?.substations ?? []) as Array<{ ref_id?: string }>;
  const stacja = substations.find((s) => typeof s.ref_id === 'string' && utworzone.has(s.ref_id));
  return stacja?.ref_id ?? null;
}
