/*
 * JEDEN rejestr prezentacyjny: kod metryki wyniku elementu → pełna polska etykieta
 * (karta UI-02 PANEL-DOLNY, §0 pkt 2).
 *
 * SKĄD KODY. Metryki `overlay_payload.elements[*].metrics` wyniku
 * `GET /api/execution/runs/{run_id}/results/v1` emituje WYŁĄCZNIE mapa
 * `backend/src/domain/result_builder_v1.py::METRYKI_ELEMENTOW_WYNIKU`. Rejestr NIE
 * jest listą „z pamięci": test `__tests__/etykietyMetryk.test.ts` porównuje jego
 * klucze z wyrocznią `harness-fixtures/generated/kody_metryk_wynikow.json`, którą
 * eksport fikstur liczy z tej mapy (a test backendu `tests/ci/test_fixtury_harnessu.py`
 * pilnuje, że wyrocznia jest aktualna). Kod backendu bez etykiety = czerwień,
 * etykieta kodu, którego backend nie emituje = czerwień. Zero cichego zapasu:
 * `etykietaMetryki` dla nieznanego kodu RZUCA, zamiast pokazać kod maszynowy.
 *
 * JEDNOSTKI NIE SĄ TU ZAPISANE — przychodzą z backendu razem z wartością (ta sama
 * wielkość bywa w kA albo w A, zależnie od klucza wyniku).
 *
 * Etykiety są zdaniami inżynierskimi bez symboli: symbol wielkości (I″k, ip, Ith…)
 * pokazuje się wyłącznie przez `MathRenderer` z pola `*_latex` backendu, a ta
 * nakładka takich pól nie niesie — więc symbolu tu nie ma (zakaz matematyki ASCII).
 *
 * Kod `IK_3F_A` niesie prąd zwarciowy początkowy KAŻDEGO rodzaju zwarcia (klucz
 * wyniku `ikss_ka` nie zależy od rodzaju), więc etykieta nie mówi „trójfazowy" —
 * rodzaj zwarcia nazywa przebieg, nie kolumna.
 *
 * Kolejność wpisów = kolejność kolumn tabeli wyników (wielkości zwarciowe, napięcia,
 * moce i prądy, straty i obciążenie, spadki napięcia, regulacja zaczepów).
 */

export const ETYKIETY_METRYK = [
  ['IK_3F_A', 'Prąd zwarciowy początkowy'],
  ['IK_3F_TOTAL_A', 'Prąd zwarciowy początkowy całkowity'],
  ['IK_3F_SYSTEM_A', 'Prąd zwarciowy początkowy od sieci zasilającej'],
  ['IK_3F_DER_A', 'Prąd zwarciowy początkowy od źródeł przekształtnikowych'],
  ['IP_A', 'Prąd zwarciowy udarowy'],
  ['ITH_A', 'Prąd zwarciowy cieplny zastępczy'],
  ['SK_MVA', 'Moc zwarciowa początkowa'],
  ['U_kV', 'Napięcie'],
  ['V_PU', 'Napięcie w jednostkach względnych'],
  ['ANGLE_DEG', 'Kąt fazowy napięcia'],
  ['P_MW', 'Moc czynna'],
  ['Q_Mvar', 'Moc bierna'],
  ['S_MVA', 'Moc pozorna'],
  ['COS_PHI', 'Współczynnik mocy'],
  ['I_A', 'Prąd'],
  ['LOADING_PCT', 'Obciążenie względem obciążalności'],
  ['LOSSES_P_MW', 'Straty mocy czynnej'],
  ['LOSSES_Q_Mvar', 'Straty mocy biernej'],
  ['DELTA_U_KV', 'Spadek napięcia'],
  ['DELTA_U_PCT', 'Spadek napięcia względny'],
  ['TAP_POSITION', 'Pozycja zaczepu'],
  ['TAP_SWITCH_COUNT', 'Liczba przełączeń zaczepu'],
] as const satisfies readonly (readonly [string, string])[];

export type KodMetryki = (typeof ETYKIETY_METRYK)[number][0];

const MAPA_ETYKIET: ReadonlyMap<string, string> = new Map(ETYKIETY_METRYK);
const KOLEJNOSC: ReadonlyMap<string, number> = new Map(
  ETYKIETY_METRYK.map(([kod], indeks) => [kod, indeks] as const),
);

/** Czy kod metryki ma etykietę w rejestrze. */
export function czyZnanaMetryka(kod: string): kod is KodMetryki {
  return MAPA_ETYKIET.has(kod);
}

/**
 * Pełna polska etykieta kodu metryki. Kod spoza rejestru to rozjazd z backendem
 * (test parytetu powinien go złapać wcześniej) — funkcja rzuca, zamiast pokazać
 * projektantowi kod maszynowy.
 */
export function etykietaMetryki(kod: string): string {
  const etykieta = MAPA_ETYKIET.get(kod);
  if (etykieta === undefined) {
    throw new Error(`Kod metryki wyniku bez etykiety w rejestrze: ${kod}`);
  }
  return etykieta;
}

/** Pozycja kodu w kolejności kolumn (kody spoza rejestru — na końcu, po kodzie). */
export function porownajKodyMetryk(a: string, b: string): number {
  const pa = KOLEJNOSC.get(a) ?? Number.MAX_SAFE_INTEGER;
  const pb = KOLEJNOSC.get(b) ?? Number.MAX_SAFE_INTEGER;
  return pa !== pb ? pa - pb : a.localeCompare(b);
}
