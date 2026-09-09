/*
 * Model widoku sekcji „Zgodność przekrojowa przypadku" (karta W3-D, 2026-09-09).
 *
 * Czyta `GET /api/ncrfg-tests/cases/{case_id}/compliance` — zgodność WSZYSTKICH
 * DER modelu naraz, liczona NA ŻYWO z committed ENM przez kanon
 * (`application/ncrfg_compliance/checker.py::NcRfgComplianceChecker`, ten sam
 * silnik co macierz per moduł obok). ZERO fizyki tutaj (NOT-A-SOLVER) — warstwa
 * wyłącznie rozwiązuje stan zerowy i agreguje werdykty już policzone przez backend.
 *
 * ZASTĘPUJE `application/compliance/source_compliance.py` (kasacja W3-D): trzecia,
 * uboższa ścieżka oceny FRT/Q(U)/cosφ(P) bez modelu dynamicznego urządzenia i z
 * niespójnym kryterium porównania, 0 ekranów ui2. Trasa przekrojowa NC RfG istniała
 * już wcześniej w kanonie, ale bez konsumenta frontendowego — ta sekcja jest jej
 * pierwszym konsumentem.
 */

import type { NcRfgCaseComplianceResponse, NcRfgComplianceReport } from '../../../ui/ncrfg-tests/api';

/** Pięć jawnych stanów sekcji — żaden nie udaje danych, których nie ma. */
export type StanZgodnosciPrzekrojowej =
  | 'brak_przypadku'
  | 'ladowanie'
  | 'brak_der'
  | 'gotowe'
  | 'blad';

export interface PodsumowanieZgodnosciPrzekrojowej {
  readonly liczbaModulow: number;
  readonly zgodne: number;
  readonly niezgodne: number;
}

/**
 * Stan sekcji z faktów: brak aktywnego przypadku, trwające ładowanie, błąd
 * zapytania, brak DER w modelu (odpowiedź przyszła, `der_count === 0`) albo
 * gotowy wynik. Kolejność sprawdzeń ma znaczenie — błąd i ładowanie są
 * niezależne od tego, czy przypadek istnieje w danym momencie renderu.
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
  if (params.wynik.der_count === 0) return 'brak_der';
  return 'gotowe';
}

/** Podsumowanie liczbowe: ile modułów, ile zgodnych, ile niezgodnych. */
export function podsumowanieZgodnosciPrzekrojowej(
  reports: readonly NcRfgComplianceReport[],
): PodsumowanieZgodnosciPrzekrojowej {
  let zgodne = 0;
  let niezgodne = 0;
  for (const report of reports) {
    if (report.overall_pass) zgodne += 1;
    else niezgodne += 1;
  }
  return { liczbaModulow: reports.length, zgodne, niezgodne };
}

/** Testy NIESPEŁNIONE albo bez danych jednego modułu — do listy akcji naprawczych. */
export function testyNiespelnione(
  report: NcRfgComplianceReport,
): readonly NcRfgComplianceReport['test_results'][number][] {
  return report.test_results.filter(
    (test) => test.verdict === 'fail' || test.verdict === 'no_data',
  );
}

/** Nazwa modułu do etykiety w tabeli: ze słownika der_ref → nazwa, albo sam ref. */
export function nazwaModuluPrzekrojowego(
  derRef: string,
  nazwyModulow: Readonly<Record<string, string>>,
): string {
  return nazwyModulow[derRef] ?? derRef;
}
