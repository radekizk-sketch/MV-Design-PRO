/**
 * Przekładniki CT/VT pól SN stacji — wiersze kart „Przekładniki prądowe CT” i „Przekładniki
 * napięciowe VT” konfiguratora stacji, wprost z modelu (`Measurement.bay_ref` wskazuje pole
 * stacji). Dawniej karty dostawały wyłącznie puste listy bazowe i mówiły „Dobierz
 * przekładniki…” także wtedy, gdy model miał przekładniki w polach tej stacji.
 *
 * Kolejność deterministyczna: kolejność pól stacji, w polu po `ref_id`. Brak klasy
 * dokładności w modelu jest jawnym brakiem, nie domysłem.
 */
import type { Measurement } from '../../../types/enm';

/** Wiersz przekładnika CT/VT pola stacji (kroki „Przekładniki prądowe/napięciowe”). */
export interface MeasurementRow {
  readonly id: string;
  readonly bayDesignation: string;
  readonly kind: 'CT' | 'VT';
  readonly ratioPrimary: number;
  readonly ratioSecondary: number;
  readonly accuracyClassPl: string;
  readonly burdenVa: number | null;
}

export interface PoleStacji {
  readonly ref: string;
  readonly oznaczenie: string;
}

export const BRAK_KLASY_PL = 'klasa nieustalona w modelu';

export function przekladnikiStacji(
  measurements: readonly Measurement[],
  pola: readonly PoleStacji[],
): { readonly cts: readonly MeasurementRow[]; readonly vts: readonly MeasurementRow[] } {
  const kolejnosc = new Map(pola.map((pole, indeks) => [pole.ref, indeks]));
  const oznaczenie = new Map(pola.map((pole) => [pole.ref, pole.oznaczenie]));
  const wiersze = measurements
    .filter((m) => typeof m.bay_ref === 'string' && kolejnosc.has(m.bay_ref))
    .slice()
    .sort((a, b) => {
      const roznica = (kolejnosc.get(a.bay_ref as string) ?? 0) - (kolejnosc.get(b.bay_ref as string) ?? 0);
      if (roznica !== 0) return roznica;
      return a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0;
    })
    .map(
      (m): MeasurementRow => ({
        id: m.ref_id,
        bayDesignation: oznaczenie.get(m.bay_ref as string) ?? (m.bay_ref as string),
        kind: m.measurement_type,
        ratioPrimary: m.rating.ratio_primary,
        ratioSecondary: m.rating.ratio_secondary,
        accuracyClassPl: m.rating.accuracy_class ?? BRAK_KLASY_PL,
        burdenVa: m.rating.burden_va ?? null,
      }),
    );
  return {
    cts: wiersze.filter((w) => w.kind === 'CT'),
    vts: wiersze.filter((w) => w.kind === 'VT'),
  };
}
