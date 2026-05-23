/**
 * faultTypeClassifier — klasyfikacja typu zwarcia (Etap 10 z planu).
 *
 * "Short Circuit Run Dialog: typ zwarcia (3F/2F/1F/2FG), location selector na SLD,
 *  IEC 60909 voltage factor (cMax/cMin)"
 *
 * IEC 60909:
 * - 3F (LLL): zwarcie 3-fazowe symetryczne, max I_k_max przy cMax=1.1
 * - 2F (LL): zwarcie 2-fazowe, ~0.87 × I_k3F
 * - 1F (LG): zwarcie 1-fazowe doziemne (najczęstsze w SN)
 * - 2FG (LLG): zwarcie 2-fazowe doziemne
 * - 3FG (LLLG): zwarcie 3-fazowe doziemne
 */

export type FaultType = '3F' | '2F' | '1F' | '2FG' | '3FG';

export interface FaultTypeMetadata {
  code: FaultType;
  fullNamePL: string;
  symbol: string;
  voltageFactorMax: number;
  voltageFactorMin: number;
  typicalForSystem: string[];
  description: string;
}

const SYSTEM_VOLTAGE_RANGE = ['nN', 'SN', 'WN'];

export const FAULT_TYPE_METADATA: Record<FaultType, FaultTypeMetadata> = {
  '3F': {
    code: '3F',
    fullNamePL: 'Zwarcie trójfazowe symetryczne',
    symbol: 'I_k3',
    voltageFactorMax: 1.10,
    voltageFactorMin: 0.95,
    typicalForSystem: SYSTEM_VOLTAGE_RANGE,
    description: 'Zwarcie 3F daje najwyższy prąd zwarciowy. Wymaga maksymalnej wytrzymałości aparatury.',
  },
  '2F': {
    code: '2F',
    fullNamePL: 'Zwarcie dwufazowe',
    symbol: 'I_k2',
    voltageFactorMax: 1.10,
    voltageFactorMin: 0.95,
    typicalForSystem: SYSTEM_VOLTAGE_RANGE,
    description: 'I_k2 ≈ 0.87 × I_k3. Spotykane przy uszkodzeniach kabli.',
  },
  '1F': {
    code: '1F',
    fullNamePL: 'Zwarcie jednofazowe doziemne',
    symbol: 'I_k1',
    voltageFactorMax: 1.10,
    voltageFactorMin: 0.95,
    typicalForSystem: SYSTEM_VOLTAGE_RANGE,
    description: 'Najczęstsze zwarcie w SN — ~70% wszystkich zwarć. Zależy od typu uziemienia.',
  },
  '2FG': {
    code: '2FG',
    fullNamePL: 'Zwarcie dwufazowe doziemne',
    symbol: 'I_k2E',
    voltageFactorMax: 1.10,
    voltageFactorMin: 0.95,
    typicalForSystem: ['SN', 'WN'],
    description: 'Zwarcie 2F z udziałem ziemi — w sieciach z izolowanym lub kompensowanym punktem neutralnym.',
  },
  '3FG': {
    code: '3FG',
    fullNamePL: 'Zwarcie trójfazowe doziemne',
    symbol: 'I_k3E',
    voltageFactorMax: 1.10,
    voltageFactorMin: 0.95,
    typicalForSystem: SYSTEM_VOLTAGE_RANGE,
    description: 'Zwarcie 3F + ziemia — rzadkie, ale możliwe przy wielokrotnym uszkodzeniu.',
  },
};

export function getFaultTypeMetadata(type: FaultType): FaultTypeMetadata {
  return FAULT_TYPE_METADATA[type];
}

export function listFaultTypes(): FaultType[] {
  return ['3F', '2F', '1F', '2FG', '3FG'];
}

export function listFaultTypesForVoltageLevel(level: 'nN' | 'SN' | 'WN'): FaultType[] {
  return listFaultTypes().filter((t) =>
    FAULT_TYPE_METADATA[t].typicalForSystem.includes(level),
  );
}

/**
 * Voltage factor c per IEC 60909-0 (max prąd = cMax, min prąd = cMin).
 */
export function getVoltageFactor(type: FaultType, side: 'max' | 'min'): number {
  const meta = FAULT_TYPE_METADATA[type];
  return side === 'max' ? meta.voltageFactorMax : meta.voltageFactorMin;
}

/**
 * Klasyfikuje severity prądu zwarcia względem ratings aparatury.
 */
export function classifyShortCircuitSeverity(
  initialSymKa: number,
  ratedKa: number,
): 'within_rating' | 'near_limit' | 'exceeds_rating' {
  if (ratedKa <= 0) return 'exceeds_rating';
  const ratio = initialSymKa / ratedKa;
  if (ratio > 1) return 'exceeds_rating';
  if (ratio > 0.85) return 'near_limit';
  return 'within_rating';
}
