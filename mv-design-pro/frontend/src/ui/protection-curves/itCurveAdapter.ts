/**
 * Audyt E, faza E-4 — adapter krzywej I-t z widoku zabezpieczeń.
 *
 * Mapuje krzywą czasowo-prądową serializowaną przez backend
 * (`protection_read_model._build_it_curve` → `settings_summary.functions[].it_curve`,
 * punkty w kształcie `{ i_a, t_s }`) na `ProtectionCurve` konsumowaną przez
 * `TimeCurrentChart` (punkty `{ current_a, current_multiple, time_s }`).
 *
 * ZASADA (BINDING):
 * - ZERO fizyki w UI — wszystkie wartości (prąd, czas) pochodzą z solvera
 *   IEC 60255. Adapter WYŁĄCZNIE przenumerowuje pola; `current_multiple`
 *   to krotność wyświetlana (I/Ip), a nie wynik obliczeń fizycznych i nie
 *   jest używana przez renderer wykresu.
 */

import type {
  ProtectionFunctionItCurve,
} from '../protection';
import type { CurveType, ProtectionCurve } from './types';
import { CURVE_COLORS } from './types';

/**
 * Kody braku danych krzywej I-t (z backendu) → uczciwe przyczyny po polsku.
 * Zgodne z `protection_read_model._build_it_curve` (`missing.append(...)`).
 */
const IT_CURVE_MISSING_REASON_PL: Record<string, string> = {
  time_multiplier:
    'Brak mnożnika czasowego (TMS) — krzywa odwrotna niedostępna',
  pickup_current: 'Brak progu rozruchowego (nastawy prądowej Ip)',
  definite_time: 'Brak zwłoki czasowej dla charakterystyki niezależnej (DT)',
  it_curve_points: 'Solver nie zwrócił punktów krzywej',
};

/**
 * Zamień kody braku danych na czytelne przyczyny po polsku.
 * Nieznany kod zwracany jest bez zmian (uczciwie, bez ukrywania).
 */
export function itCurveMissingReasonsPl(codes: readonly string[] | undefined): string[] {
  if (!codes || codes.length === 0) {
    return ['Brak danych krzywej I-t z solvera'];
  }
  return codes.map((code) => IT_CURVE_MISSING_REASON_PL[code] ?? code);
}

/**
 * Mapowanie kodu krzywej solvera (`curve_code`) na `CurveType` wykresu.
 */
function toCurveType(curveCode: string): CurveType {
  const known: CurveType[] = ['SI', 'VI', 'EI', 'LTI', 'DT', 'MI', 'STI'];
  return (known as string[]).includes(curveCode) ? (curveCode as CurveType) : 'DT';
}

/**
 * Zbuduj `ProtectionCurve` (dla `TimeCurrentChart`) z krzywej I-t widoku
 * zabezpieczeń. Punkty przenoszone są 1:1 z backendu — bez interpolacji,
 * bez obliczeń czasu.
 *
 * @param itCurve krzywa z pola `it_curve`
 * @param id      stabilny identyfikator krzywej na wykresie
 * @param colorIndex indeks koloru z palety `CURVE_COLORS`
 */
export function itCurveToProtectionCurve(
  itCurve: ProtectionFunctionItCurve,
  id: string,
  colorIndex = 0,
): ProtectionCurve {
  const pickup = itCurve.pickup_a;
  return {
    id,
    name_pl: itCurve.curve_label_pl,
    standard: 'IEC',
    curve_type: toCurveType(itCurve.curve_code),
    pickup_current_a: pickup,
    time_multiplier: itCurve.time_multiplier ?? 1,
    color: CURVE_COLORS[colorIndex % CURVE_COLORS.length],
    enabled: true,
    points: itCurve.points.map((p) => ({
      current_a: p.i_a,
      // Krotność I/Ip — tylko do wyświetlenia; renderer wykresu jej nie używa.
      current_multiple: pickup > 0 ? p.i_a / pickup : 0,
      time_s: p.t_s,
    })),
  };
}
