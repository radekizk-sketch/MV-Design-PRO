/**
 * transformerPhaseShiftHelper — przesunięcie fazowe vector group (Etap 4 z planu).
 *
 * "Vector group zgodny ze standardem (Dyn5, Dyn11, YNyn0 itp.)"
 *
 * Vector group jak: Dyn11 means:
 * - D = HV side delta (trójkąt)
 * - y = LV side wye (gwiazda)
 * - n = neutral wyprowadzone
 * - 11 = przesunięcie 11 × 30° = 330° (lub -30°)
 */

export type WindingType = 'D' | 'Y' | 'YN' | 'Z' | 'ZN';

export interface VectorGroupParsed {
  hvWinding: WindingType;
  lvWinding: WindingType;
  phaseShiftClock: number;
  phaseShiftDegrees: number;
  description: string;
}

const PHASE_SHIFT_DEGREES_PER_CLOCK = 30;

export function parseVectorGroup(vectorGroup: string): VectorGroupParsed | null {
  // Format: [DY|YN|Z|ZN][dyn|zn]\d+
  const match = vectorGroup.match(/^([DY]N?|Z N?)\s*([dyzn]+)(\d+)$/i);
  if (!match) return null;
  const hvRaw = match[1].toUpperCase();
  const lvRaw = match[2].toUpperCase();
  const clock = parseInt(match[3], 10);

  if (clock < 0 || clock > 11) return null;

  const hvWinding = (hvRaw.endsWith('N') ? hvRaw : hvRaw + '') as WindingType;
  const lvWinding = (lvRaw as WindingType);
  const phaseShiftDegrees = clock * PHASE_SHIFT_DEGREES_PER_CLOCK;

  return {
    hvWinding,
    lvWinding,
    phaseShiftClock: clock,
    phaseShiftDegrees,
    description: describeVectorGroup(vectorGroup, phaseShiftDegrees),
  };
}

function describeVectorGroup(vectorGroup: string, phaseShift: number): string {
  if (vectorGroup.includes('11')) {
    return `${vectorGroup} (przesunięcie ${phaseShift}° = -30°, zalecane PN-EN)`;
  }
  if (vectorGroup.includes('5')) {
    return `${vectorGroup} (przesunięcie ${phaseShift}° = +150°)`;
  }
  if (vectorGroup.includes('1')) {
    return `${vectorGroup} (przesunięcie ${phaseShift}° = +30°)`;
  }
  if (vectorGroup.includes('7')) {
    return `${vectorGroup} (przesunięcie ${phaseShift}° = +210°)`;
  }
  return `${vectorGroup} (przesunięcie ${phaseShift}°)`;
}

export function getCommonVectorGroups(): string[] {
  return ['Dyn1', 'Dyn5', 'Dyn7', 'Dyn11', 'YNd1', 'YNd5', 'YNd7', 'YNd11', 'YNyn0', 'Yzn5', 'Yzn11'];
}

/**
 * Sprawdza compatybilność dwóch transformatorów do pracy równoległej.
 *
 * Wymagania paralleling (PN-EN 60076-1):
 * - Tej samej grupy wektorowej
 * - Te same poziomy napięć ±0.5%
 * - Stosunki przekładni ±0.5%
 * - Te same impedancje ±10%
 */
export function checkParallelCompatibility(
  vgA: string,
  vgB: string,
  uHvAKv?: number,
  uHvBKv?: number,
  uLvAKv?: number,
  uLvBKv?: number,
  zScA?: number,
  zScB?: number,
): { isCompatible: boolean; issues: string[] } {
  const issues: string[] = [];

  const parsedA = parseVectorGroup(vgA);
  const parsedB = parseVectorGroup(vgB);

  if (!parsedA || !parsedB) {
    issues.push('Niepoprawny format vector group.');
    return { isCompatible: false, issues };
  }

  if (parsedA.phaseShiftDegrees !== parsedB.phaseShiftDegrees) {
    issues.push(
      `Różne przesunięcia fazowe: ${vgA}=${parsedA.phaseShiftDegrees}° ≠ ${vgB}=${parsedB.phaseShiftDegrees}°. Niemożliwe parallel.`,
    );
  }

  if (uHvAKv && uHvBKv && Math.abs(uHvAKv - uHvBKv) / uHvAKv > 0.005) {
    issues.push(
      `Różne napięcia HV: ${uHvAKv} kV vs ${uHvBKv} kV (>0.5%).`,
    );
  }
  if (uLvAKv && uLvBKv && Math.abs(uLvAKv - uLvBKv) / uLvAKv > 0.005) {
    issues.push(
      `Różne napięcia LV: ${uLvAKv} kV vs ${uLvBKv} kV (>0.5%).`,
    );
  }
  if (zScA && zScB && Math.abs(zScA - zScB) / zScA > 0.1) {
    issues.push(
      `Różne Zsc: ${zScA}% vs ${zScB}% (>10%). Niesymetryczny rozdział mocy.`,
    );
  }

  return { isCompatible: issues.length === 0, issues };
}
