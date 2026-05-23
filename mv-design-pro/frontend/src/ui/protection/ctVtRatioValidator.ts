/**
 * ctVtRatioValidator — walidacja przekładni CT/VT vs obwód (Etap 6 z planu).
 *
 * "Walidacja przekładni CT/VT vs napięcie + prąd nominalny obwodu"
 *
 * CT (przekładnik prądowy):
 *   - I_primary ≥ 1.2 × I_nom (bezpieczny margines)
 *   - I_primary ≤ 4 × I_nom (precyzja pomiaru)
 *   - Klasa 5P10/5P20 dla zabezpieczeń, 0.5/0.2s dla rozliczeń
 *   - ALF (Accuracy Limit Factor) ≥ I_sc / I_primary
 *
 * VT (przekładnik napięciowy):
 *   - U_primary = U_nom obwodu (±5%)
 *   - Klasa 0.5/0.2 dla rozliczeń, 3P/6P dla zabezpieczeń
 *
 * Normy: IEC 61869-2 (CT), IEC 61869-3 (VT).
 */

export type CtClass = '0.1' | '0.2' | '0.2s' | '0.5' | '0.5s' | '1' | '3' | '5' | '5P10' | '5P20' | '10P10' | '10P20';
export type VtClass = '0.1' | '0.2' | '0.5' | '1' | '3P' | '6P';

export interface CtValidationInput {
  primaryCurrentA: number;
  circuitNominalCurrentA: number;
  shortCircuitCurrentKa: number;
  ctClass: CtClass;
}

export interface VtValidationInput {
  primaryVoltageKv: number;
  circuitNominalVoltageKv: number;
  vtClass: VtClass;
  useCaseRequiresHighPrecision?: boolean;
}

export type RatioVerdict = 'ok' | 'warning' | 'error';

export interface RatioValidationResult {
  verdict: RatioVerdict;
  issues: string[];
  recommendation?: string;
}

const CT_PROTECTION_CLASSES = new Set<CtClass>(['5P10', '5P20', '10P10', '10P20']);
const CT_METERING_CLASSES = new Set<CtClass>(['0.1', '0.2', '0.2s', '0.5', '0.5s', '1']);

export function validateCtRatio({
  primaryCurrentA,
  circuitNominalCurrentA,
  shortCircuitCurrentKa,
  ctClass,
}: CtValidationInput): RatioValidationResult {
  const issues: string[] = [];

  if (circuitNominalCurrentA <= 0) {
    return {
      verdict: 'error',
      issues: ['Brak danych prądu nominalnego obwodu.'],
      recommendation: 'Uzupełnij dane obwodu przed wyborem CT.',
    };
  }

  // Bezpieczny margines: I_primary ≥ 1.2 × I_nom
  if (primaryCurrentA < 1.2 * circuitNominalCurrentA) {
    issues.push(
      `Przekładnia ${primaryCurrentA} A < 1.2 × I_nom (${(1.2 * circuitNominalCurrentA).toFixed(0)} A). Niebezpieczny margines.`,
    );
  }

  // Precyzja: I_primary ≤ 4 × I_nom
  if (primaryCurrentA > 4 * circuitNominalCurrentA) {
    issues.push(
      `Przekładnia ${primaryCurrentA} A > 4 × I_nom (${(4 * circuitNominalCurrentA).toFixed(0)} A). Niska precyzja pomiaru.`,
    );
  }

  // ALF check dla klas protection
  if (CT_PROTECTION_CLASSES.has(ctClass)) {
    const alfMatch = ctClass.match(/(\d+)P(\d+)/);
    if (alfMatch) {
      const alf = parseInt(alfMatch[2], 10);
      const requiredAlf = (shortCircuitCurrentKa * 1000) / primaryCurrentA;
      if (alf < requiredAlf) {
        issues.push(
          `ALF=${alf} < wymagany ${requiredAlf.toFixed(0)} dla I_sc=${shortCircuitCurrentKa} kA. Saturacja możliwa.`,
        );
      }
    }
  }

  let verdict: RatioVerdict;
  if (issues.length === 0) {
    verdict = 'ok';
  } else {
    const hasError = issues.some(
      (s) =>
        s.includes('Niebezpieczny margines')
        || s.includes('ALF')
        || s.includes('Brak danych'),
    );
    verdict = hasError ? 'error' : 'warning';
  }

  let recommendation: string | undefined;
  if (verdict === 'error') {
    if (issues.some((s) => s.includes('Niebezpieczny'))) {
      const suggested = Math.ceil((1.2 * circuitNominalCurrentA) / 50) * 50;
      recommendation = `Wybierz CT z przekładnią ≥ ${suggested} A.`;
    } else if (issues.some((s) => s.includes('ALF'))) {
      recommendation = 'Wybierz CT z wyższym ALF (klasa 5P20 lub 10P20).';
    }
  }

  return { verdict, issues, recommendation };
}

export function validateVtRatio({
  primaryVoltageKv,
  circuitNominalVoltageKv,
  vtClass,
  useCaseRequiresHighPrecision = false,
}: VtValidationInput): RatioValidationResult {
  const issues: string[] = [];

  if (circuitNominalVoltageKv <= 0) {
    return {
      verdict: 'error',
      issues: ['Brak danych napięcia nominalnego obwodu.'],
    };
  }

  // U_primary = U_nom ±5%
  const ratio = primaryVoltageKv / circuitNominalVoltageKv;
  if (ratio < 0.95 || ratio > 1.05) {
    issues.push(
      `Napięcie VT ${primaryVoltageKv} kV vs obwód ${circuitNominalVoltageKv} kV — odchylenie ${((ratio - 1) * 100).toFixed(1)}% > ±5%.`,
    );
  }

  // High precision check
  if (useCaseRequiresHighPrecision && !['0.1', '0.2', '0.5'].includes(vtClass)) {
    issues.push(
      `Klasa ${vtClass} niewystarczająca dla pomiarów rozliczeniowych — wymagana 0.5 lub lepsza.`,
    );
  }

  const verdict: RatioVerdict = issues.length === 0 ? 'ok' : 'error';
  const recommendation =
    verdict === 'error' && issues.some((s) => s.includes('Klasa'))
      ? 'Wybierz VT klasy 0.5 lub 0.2 dla pomiarów rozliczeniowych.'
      : verdict === 'error'
        ? 'Wybierz VT o napięciu nominalnym zgodnym z obwodem.'
        : undefined;
  return { verdict, issues, recommendation };
}

export function isMeteringClass(ctClass: CtClass): boolean {
  return CT_METERING_CLASSES.has(ctClass);
}

export function isProtectionClass(ctClass: CtClass): boolean {
  return CT_PROTECTION_CLASSES.has(ctClass);
}
