/**
 * SLD V3 — typografia i deterministyczny pomiar tekstu (SLD_CAD_SPEC_V3 §2, P7).
 *
 * Layout NIE mierzy tekstu w DOM — używa deterministycznej formuły (jedna
 * prawda dla buildu, testów node'owych i renderu), żeby ten sam ENM dawał
 * identyczną geometrię wszędzie. Formuła skalibrowana dla sans-serif
 * (średnia szerokość glifu ≈ 0.62 × fontSize; cyfry/wielkie litery szersze —
 * współczynnik obejmuje typowe etykiety energetyczne PL).
 */

export type LabelClass = 't1' | 't2' | 't3' | 't4';

export interface LabelTypography {
  readonly fontSize: number;
  readonly fontWeight: number;
}

/** Jedyne dozwolone klasy typograficzne rysunku (spec §2). */
export const LABEL_TYPOGRAPHY: Readonly<Record<LabelClass, LabelTypography>> = {
  t1: { fontSize: 13, fontWeight: 700 }, // nazwy stacji / GPZ
  t2: { fontSize: 11, fontWeight: 600 }, // parametry: kVA, typ·przekrój·długość, kV
  t3: { fontSize: 9, fontWeight: 700 },  // podpisy portów (kier./odg.), oznaczniki Q/T
  t4: { fontSize: 8, fontWeight: 600 },  // adnotacje
};

const AVG_GLYPH_WIDTH_FACTOR = 0.62;

/** Deterministyczna szerokość etykiety [px świata]. */
export function measureLabelWidth(text: string, cls: LabelClass): number {
  return Math.ceil(text.length * LABEL_TYPOGRAPHY[cls].fontSize * AVG_GLYPH_WIDTH_FACTOR);
}

/** Wysokość wiersza etykiety [px świata] (fontSize + interlinia). */
export function labelLineHeight(cls: LabelClass): number {
  return LABEL_TYPOGRAPHY[cls].fontSize + 6;
}
