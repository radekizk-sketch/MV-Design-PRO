/*
 * Model widoku sekcji „Zgodność przypadku" (karta S-3; kontrakt V2 — karta AB-1a Pakiet D2).
 *
 * Czyta `GET /api/ncrfg-tests/cases/{case_id}/compliance` — zgodność WSZYSTKICH DER
 * zatwierdzonego modelu naraz, liczona TYM SAMYM solverem i TĄ SAMĄ oceną wymagań co bieg
 * macierzy i certyfikat. ZERO fizyki, ZERO oceny własnej i ZERO agregatów (V2 nie ma statusu
 * modułu ani liczników — dawne `wierszeZgodnosciPrzekrojowej`/`podsumowanieZgodnosciPrzekrojowej`/
 * `brakiZgodnosciPrzekrojowej`/`stopienDowodowyModulu` skasowane): warstwa rozwiązuje stan
 * zerowy i nazwę modułu, a rekordy pokazuje wspólna lista rekordów wymagań.
 */

import type { ZgodnoscPrzypadkuNcRfg } from '../ncrfg/typy';

/** Sześć jawnych stanów sekcji — żaden nie udaje danych, których nie ma. */
export type StanZgodnosciPrzekrojowej =
  | 'brak_przypadku'
  | 'brak_operatora'
  | 'ladowanie'
  | 'brak_der'
  | 'gotowe'
  | 'blad';

/**
 * Stan sekcji z faktów: brak aktywnego przypadku, brak operatora (profil wymagań nie jest
 * zgadywany), błąd zapytania, trwające ładowanie, brak DER w modelu (solver nikogo nie objął
 * I backend nikogo nie pominął) albo gotowy wynik (bieg i/lub DER pominięte z powodem).
 */
export function rozwiazStanZgodnosciPrzekrojowej(params: {
  readonly caseId: string | null;
  readonly operatorId: string | null;
  readonly ladowanie: boolean;
  readonly blad: string | null;
  readonly wynik: ZgodnoscPrzypadkuNcRfg | null;
}): StanZgodnosciPrzekrojowej {
  if (!params.caseId) return 'brak_przypadku';
  if (!params.operatorId) return 'brak_operatora';
  if (params.blad) return 'blad';
  if (params.ladowanie || !params.wynik) return 'ladowanie';
  if (params.wynik.der_count === 0 && params.wynik.pominiete.length === 0) return 'brak_der';
  return 'gotowe';
}

/** Nazwa modułu do etykiety: słownik macierzy (der_ref → nazwa) › `der_name` biegu › sam ref. */
export function nazwaModuluPrzekrojowego(
  derRef: string,
  derName: string | null,
  nazwyModulow: Readonly<Record<string, string>>,
): string {
  return nazwyModulow[derRef] ?? derName ?? derRef;
}
