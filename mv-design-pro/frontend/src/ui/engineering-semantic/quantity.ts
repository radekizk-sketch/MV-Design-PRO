import type { DataQualityState, EngineeringQuantity } from './types';

export interface RawEngineeringQuantity {
  value: number;
  unit: string;
  source: EngineeringQuantity['source'];
  qualityState: DataQualityState;
  normalizationPrecision?: number;
}

const UNIT_NORMALIZATION: Record<string, { unit: string; factor: number }> = {
  m: { unit: 'km', factor: 0.001 },
  km: { unit: 'km', factor: 1 },
  V: { unit: 'kV', factor: 0.001 },
  kV: { unit: 'kV', factor: 1 },
  A: { unit: 'A', factor: 1 },
  kA: { unit: 'A', factor: 1000 },
  kW: { unit: 'kW', factor: 1 },
  MW: { unit: 'kW', factor: 1000 },
  kvar: { unit: 'kvar', factor: 1 },
  Mvar: { unit: 'kvar', factor: 1000 },
  Ohm: { unit: 'Ohm', factor: 1 },
  'Ohm/km': { unit: 'Ohm/km', factor: 1 },
  'nF/km': { unit: 'nF/km', factor: 1 },
  'uF/km': { unit: 'nF/km', factor: 1000 },
  s: { unit: 's', factor: 1 },
  ms: { unit: 's', factor: 0.001 },
  C: { unit: 'C', factor: 1 },
};

export function normalizeEngineeringQuantity(raw: RawEngineeringQuantity): EngineeringQuantity {
  const rule = UNIT_NORMALIZATION[raw.unit] ?? { unit: raw.unit, factor: 1 };
  const precision = raw.normalizationPrecision ?? 9;
  const normalizedValue = Number((raw.value * rule.factor).toFixed(precision));

  return {
    value: raw.value,
    unit: raw.unit,
    normalizedValue,
    normalizedUnit: rule.unit,
    normalizationPrecision: precision,
    source: raw.source,
    qualityState: raw.qualityState,
  };
}
