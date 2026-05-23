/**
 * bayApparatusBuilder — pomocnik komponowania aparatury pola SN (Etap 2 z planu).
 *
 * "Aparatura builder UI z preview (DS+CB+CT+ES bezpieczna sekwencja)"
 *
 * Walidacja sekwencji aparatury per IEC 62271:
 * - Linia z wyłącznikiem: DS → CB → CT → ES (sekwencja od szyny)
 * - Linia z odłącznikiem mocowym (LBS): LBS → CT → ES
 * - Pole transformatorowe: DS → CB → CT → ES (lub fuze + LBS)
 * - Pole pomiarowe: tylko VT/CT
 * - Pole sprzęgłowe: DS → CB (lub DS only dla COUPLER bez przerywania)
 *
 * Reguły bezpieczeństwa:
 * - Zawsze widzialna przerwa (DS lub ES) między CB a szyną
 * - ES (uziemnik) tylko po DS (nie bezpośrednio z CB)
 * - CT za CB (od strony pola), VT po DS na szynie
 */

export type ApparatusType = 'DS' | 'CB' | 'LBS' | 'CT' | 'VT' | 'ES' | 'FUSE';
export type BayRoleApparatus = 'OUT' | 'IN' | 'FEEDER' | 'TR' | 'COUPLER' | 'MEASUREMENT' | 'OZE';

export interface ApparatusSlot {
  position: number;
  type: ApparatusType;
  required: boolean;
}

export const APPARATUS_LABELS_PL: Record<ApparatusType, string> = {
  DS: 'Odłącznik szynowy',
  CB: 'Wyłącznik mocy',
  LBS: 'Rozłącznik bezpiecznikowy',
  CT: 'Przekładnik prądowy',
  VT: 'Przekładnik napięciowy',
  ES: 'Uziemnik (Earth Switch)',
  FUSE: 'Bezpiecznik HRC',
};

const STANDARD_APPARATUS_SEQUENCE: Record<BayRoleApparatus, ApparatusType[]> = {
  IN: ['DS', 'CB', 'CT', 'ES'],
  OUT: ['DS', 'CB', 'CT', 'ES'],
  FEEDER: ['DS', 'CB', 'CT', 'ES'],
  TR: ['DS', 'CB', 'CT', 'ES'],
  COUPLER: ['DS', 'CB'],
  MEASUREMENT: ['VT', 'FUSE'],
  OZE: ['DS', 'CB', 'CT', 'ES'],
};

export interface SequenceValidationResult {
  isValid: boolean;
  issues: string[];
  suggested: ApparatusType[];
}

export function validateApparatusSequence(
  role: BayRoleApparatus,
  actual: ApparatusType[],
): SequenceValidationResult {
  const issues: string[] = [];
  const suggested = STANDARD_APPARATUS_SEQUENCE[role];

  // ES wymaga DS lub CB w sekwencji przed nim
  const esIdx = actual.indexOf('ES');
  if (esIdx === 0) {
    issues.push('Uziemnik (ES) nie może być pierwszym elementem — wymagany odłącznik (DS) lub wyłącznik (CB) przed nim.');
  }
  if (esIdx > 0) {
    const before = actual.slice(0, esIdx);
    if (!before.includes('DS') && !before.includes('CB')) {
      issues.push('ES musi być za odłącznikiem (DS) lub wyłącznikiem (CB) w sekwencji.');
    }
  }

  // CB wymaga DS przed
  const cbIdx = actual.indexOf('CB');
  if (cbIdx === 0) {
    issues.push('Wyłącznik mocy (CB) wymaga widzialnej przerwy — dodaj odłącznik (DS) przed nim.');
  }

  // LBS+CB w jednym polu = redundantne
  if (actual.includes('LBS') && actual.includes('CB')) {
    issues.push('Pole nie może mieć jednocześnie LBS i CB. Wybierz jeden typ łącznika.');
  }

  // Per-rola checks
  switch (role) {
    case 'MEASUREMENT':
      if (actual.includes('CB') || actual.includes('LBS')) {
        issues.push('Pole pomiarowe nie powinno mieć wyłącznika (tylko VT + bezpiecznik).');
      }
      break;
    case 'OZE':
      if (!actual.includes('CT')) {
        issues.push('Pole OZE wymaga CT dla pomiarów + zabezpieczeń (50/51/27/59/81).');
      }
      break;
    case 'TR':
      if (!actual.includes('CT')) {
        issues.push('Pole transformatorowe wymaga CT dla zabezpieczenia 87T/50/51.');
      }
      break;
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggested,
  };
}

export function describeSequence(types: ApparatusType[]): string {
  return types.map((t) => APPARATUS_LABELS_PL[t]).join(' → ');
}

export function suggestApparatusForRole(role: BayRoleApparatus): {
  sequence: ApparatusType[];
  description: string;
} {
  const sequence = STANDARD_APPARATUS_SEQUENCE[role];
  return {
    sequence,
    description: describeSequence(sequence),
  };
}
