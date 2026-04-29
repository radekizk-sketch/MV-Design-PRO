import type { DataQualityState, EngineeringQuantity } from './types';

const UNIT_FACTORS_TO_CANONICAL: Record<string, { unit: string; factor: number }> = {
  m: { unit: 'km', factor: 0.001 },
  km: { unit: 'km', factor: 1 },
  V: { unit: 'kV', factor: 0.001 },
  kV: { unit: 'kV', factor: 1 },
  A: { unit: 'A', factor: 1 },
  kA: { unit: 'A', factor: 1000 },
  kW: { unit: 'MW', factor: 0.001 },
  MW: { unit: 'MW', factor: 1 },
  kvar: { unit: 'Mvar', factor: 0.001 },
  Mvar: { unit: 'Mvar', factor: 1 },
  ohm: { unit: 'ohm', factor: 1 },
  'ohm/km': { unit: 'ohm/km', factor: 1 },
  s: { unit: 's', factor: 1 },
  C: { unit: 'C', factor: 1 },
};

export function createEngineeringQuantity(
  value: number,
  unit: string,
  options: {
    precision?: number;
    source?: EngineeringQuantity['source'];
    qualityState?: DataQualityState;
  } = {},
): EngineeringQuantity {
  const precision = options.precision ?? 6;
  const mapping = UNIT_FACTORS_TO_CANONICAL[unit] ?? { unit, factor: 1 };
  const normalizedRaw = value * mapping.factor;
  const scale = 10 ** precision;

  return {
    value,
    unit,
    normalizedValue: Math.round(normalizedRaw * scale) / scale,
    normalizedUnit: mapping.unit,
    normalizationPrecision: precision,
    source: options.source ?? 'REKA_PROJEKTANTA',
    qualityState: options.qualityState ?? 'NIEZWERYFIKOWANA',
  };
}
