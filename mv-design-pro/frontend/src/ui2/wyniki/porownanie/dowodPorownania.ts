/*
 * Wewnętrzne API dowodów okna „Porównanie przebiegów" (karta R3-C / K3-G2).
 *
 * ROZSTRZYGNIĘCIE (§7 R3-C): wartości tabel porównania pochodzą z DWÓCH
 * przebiegów, a zakładka „Dowód obliczeń" pokazuje ślad JEDNEGO — dlatego
 * wartość z kolumny A otwiera dowód przebiegu A, z kolumny B dowód przebiegu B
 * (żadnego zgadywania „którego"). Nośniki:
 *   - `dowodRef` komórki (wzorzec E8.1) niesie STRONĘ + ELEMENT (`A:<element>`),
 *   - kontekst deep-linku (`setWynikiTab('dowod', runId)` — mechanizm R2-B)
 *     niesie KONKRETNY przebieg; stronę na run mapuje ekran porównania,
 *     bo tylko on zna parę (run A, run B) użytą do porównania.
 *
 * UCZCIWOŚĆ: kolumny Δ (różnica B−A) są BEZ dowodu — różnica nie ma
 * pojedynczego wywodu WHITE BOX (nie istnieje ślad „przebiegu Δ"), więc
 * komórki delt nie dostają `dowodRef` (adaptery obu trybów).
 *
 * RECON ścieżki śladu po run_id (warunek wykonalności karty):
 *   - frontend: `fetchExtendedTrace(runId)` → GET `/analysis-runs/{runId}/results/trace`
 *     (`ui/results-inspector/api.ts:115-116`), wołany przez
 *     `useResultsInspectorStore.selectRun/loadExtendedTrace` (`store.ts:191,340`);
 *   - backend: `api/analysis_runs.py:419-421` → `get_canonical_run` — TA SAMA
 *     encja `CanonicalRun`, którą listują selektory porównania (rozpływ:
 *     `api/power_flow_runs.py:339` `list_canonical_runs_for_project`; zwarcia:
 *     przebiegi `ExecutionRun`, po których `TrybZwarciowy` już dziś pobiera
 *     wyniki z `/analysis-runs/{id}/results/short-circuit`).
 *   Ślad jest więc osiągalny dla DOWOLNEGO wskazanego przebiegu — bez fabrykacji.
 */

/** Strona porównania — kolumny A (przebieg bazowy) lub B (przebieg porównywany). */
export type StronaPorownania = 'A' | 'B';

/** Buduje `dowodRef` komórki wartości źródłowej: strona + element (`A:<element>`). */
export function refDowoduPorownania(strona: StronaPorownania, element: string): string {
  return `${strona}:${element}`;
}

/**
 * Odczytuje stronę porównania z `dowodRef` komórki. Ref spoza tego formatu
 * (np. z innego ekranu) → `null` — wywołujący nie otwiera niczego na ślepo.
 */
export function stronaDowodu(ref: string): StronaPorownania | null {
  if (ref.startsWith('A:')) return 'A';
  if (ref.startsWith('B:')) return 'B';
  return null;
}
