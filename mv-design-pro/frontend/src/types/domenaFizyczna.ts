/**
 * Domena fizyczna wyniku (karta AB-1a D1, W-07) — JEDNO miejsce literałów frontu.
 *
 * Źródło prawdy: backend `application/solvers/solver_capability_registry.py::PhysicsDomain`
 * — domena jest WYPROWADZANA z rodzaju biegu przez rejestr zdolności i przychodzi w
 * kopercie biegu (`physics_domain` + `physics_domain_pl`, `GET /api/analysis-runs/{id}`).
 * Front NIE wylicza domeny z rodzaju analizy (to byłaby druga, niesprawdzana kopia
 * rejestru) — wyłącznie ją pokazuje.
 *
 * Literały TUTAJ są przypięte do snapshotu OpenAPI backendu testem
 * `src/types/__tests__/domenaFizyczna.openapi.test.ts` — rozjazd z kontraktem = czerwony
 * test, nie cicha druga lista.
 */

export type DomenaFizyczna =
  | 'POWER_FLOW'
  | 'SHORT_CIRCUIT'
  | 'RMS_DYNAMICS'
  | 'SEQUENCE_DOMAIN'
  | 'HARMONIC_FREQUENCY_DOMAIN'
  | 'SUPRAHARMONIC_FREQUENCY_DOMAIN'
  | 'ELECTROMAGNETIC_TRANSIENTS';

export const DOMENY_FIZYCZNE: readonly DomenaFizyczna[] = [
  'POWER_FLOW',
  'SHORT_CIRCUIT',
  'RMS_DYNAMICS',
  'SEQUENCE_DOMAIN',
  'HARMONIC_FREQUENCY_DOMAIN',
  'SUPRAHARMONIC_FREQUENCY_DOMAIN',
  'ELECTROMAGNETIC_TRANSIENTS',
];

/** Strażnik typu: wartość spoza kontraktu NIE staje się domeną (brak zostaje brakiem). */
export function czyDomenaFizyczna(wartosc: unknown): wartosc is DomenaFizyczna {
  return typeof wartosc === 'string' && (DOMENY_FIZYCZNE as readonly string[]).includes(wartosc);
}
