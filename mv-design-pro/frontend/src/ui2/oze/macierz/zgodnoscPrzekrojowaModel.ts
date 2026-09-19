/*
 * Model widoku sekcji „Zgodność przekrojowa przypadku" (karta S-3, 2026-09-16 —
 * „jeden tor NC RfG"; dawniej W3-D).
 *
 * Czyta `GET /api/ncrfg-tests/cases/{case_id}/compliance` — zgodność WSZYSTKICH
 * DER modelu naraz, liczona NA ŻYWO z committed ENM TYM SAMYM solverem, co bieg
 * macierzy per DER obok (`NcRfgPtpireeSolver`, T01–T20); odpowiedź niesie TEN SAM
 * kontrakt biegu (`NcRfgRunResult` z polami dowodowymi karty S-1) opakowany per
 * przypadek. ZERO fizyki i ZERO oceny własnej (NOT-A-SOLVER) — warstwa rozwiązuje
 * stan zerowy i deleguje liczniki/status do JEDNEGO modelu werdyktu macierzy
 * (`macierzModel.ts`: `podsumowaniaZBiegu`, `agregujPodsumowania`,
 * `testyNiespelnione`), nie do drugiego, równoległego.
 */

import type {
  NcRfgCaseComplianceResponse,
  NcRfgRunResult,
  NcRfgTestResult,
} from '../../../ui/ncrfg-tests/api';
import {
  agregujPodsumowania,
  podsumowaniaZBiegu,
  testyNiespelnione,
  type PodsumowanieModulu,
  type PodsumowanieProjektu,
} from './macierzModel';

/** Pięć jawnych stanów sekcji — żaden nie udaje danych, których nie ma. */
export type StanZgodnosciPrzekrojowej =
  | 'brak_przypadku'
  | 'ladowanie'
  | 'brak_der'
  | 'gotowe'
  | 'blad';

/**
 * Stan sekcji z faktów: brak aktywnego przypadku, trwające ładowanie, błąd
 * zapytania, brak DER w modelu (odpowiedź przyszła, solver nikogo nie objął I
 * backend nikogo nie pominął) albo gotowy wynik (bieg i/lub DER pominięte z
 * nazwanym powodem — to też jest treść, nie stan zerowy). Kolejność sprawdzeń
 * ma znaczenie — błąd i ładowanie są niezależne od tego, czy przypadek istnieje
 * w danym momencie renderu.
 */
export function rozwiazStanZgodnosciPrzekrojowej(params: {
  readonly caseId: string | null;
  readonly ladowanie: boolean;
  readonly blad: string | null;
  readonly wynik: NcRfgCaseComplianceResponse | null;
}): StanZgodnosciPrzekrojowej {
  if (!params.caseId) return 'brak_przypadku';
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

/**
 * Wiersze podsumowania: moduły objęte biegiem (kolejność solvera = kolejność DER
 * w modelu), potem DER pominięte przez backend jako zablokowane — jeden model
 * werdyktu z macierzą (`PodsumowanieModulu`).
 */
export function wierszeZgodnosciPrzekrojowej(
  wynik: NcRfgCaseComplianceResponse,
  nazwyModulow: Readonly<Record<string, string>>,
): PodsumowanieModulu[] {
  return podsumowaniaZBiegu(wynik.bieg, wynik.pominiete, nazwyModulow);
}

/** Podsumowanie liczbowe przypadku — ta sama arytmetyka co „Podsumowanie projektu" macierzy. */
export function podsumowanieZgodnosciPrzekrojowej(
  wiersze: readonly PodsumowanieModulu[],
): PodsumowanieProjektu {
  return agregujPodsumowania(wiersze);
}

/** Braki jednego modułu objętego biegiem: testy WYMAGANE z werdyktem fail/no_data. */
export interface BrakiModulu {
  readonly derRef: string;
  readonly nazwa: string;
  readonly testy: readonly NcRfgTestResult[];
}

/** Moduły z co najmniej jednym brakiem (wymóg niespełniony albo bez danych) — lista akcji. */
export function brakiZgodnosciPrzekrojowej(
  bieg: NcRfgRunResult | null,
  nazwyModulow: Readonly<Record<string, string>>,
): BrakiModulu[] {
  return (bieg?.modules ?? [])
    .map((modul) => ({
      derRef: modul.der_ref,
      nazwa: nazwaModuluPrzekrojowego(modul.der_ref, modul.der_name, nazwyModulow),
      testy: testyNiespelnione(modul),
    }))
    .filter((braki) => braki.testy.length > 0);
}

/**
 * Stopień dowodowy modułu (karta S-1) z `evidence_per_module` biegu —
 * `reportable` / `not_reportable`; `null`, gdy biegu nie ma albo ocena dla
 * tego modułu nie istnieje (uczciwy brak, nie „w porządku").
 */
export function stopienDowodowyModulu(
  bieg: NcRfgRunResult | null,
  derRef: string,
): 'reportable' | 'not_reportable' | null {
  return bieg?.evidence_per_module[derRef]?.reporting_status ?? null;
}
