/**
 * SCADA / Infrastructure Contract — krok 15 Kreatora KOMPLETNEGO.
 *
 * Infrastruktura SCADA per IEC 61850 (logical nodes) + IEC 60870-5-104
 * (protokół IP).
 *
 * Typowe sygnały telemetrii:
 *   DI (Digital Input):  stany aparatów, alarmy
 *   DO (Digital Output): załącz/wyłącz CB, reset alarm
 *   AI (Analog Input):   pomiary U/I/P/Q/f
 *   AO (Analog Output):  setpointy Q(U), nastawy P
 */

export type ScadaSignalType = 'DI' | 'DO' | 'AI' | 'AO';

/** IEC 61850 logical node (LN). */
export type IEC61850LogicalNode =
  | 'XCBR'    // Circuit Breaker
  | 'XSWI'    // Switch (DS/ES/LBS)
  | 'TCTR'    // Current Transformer
  | 'TVTR'    // Voltage Transformer
  | 'MMXU'    // Measurement (V/I/P/Q/f)
  | 'PTOC'    // Time Overcurrent (51)
  | 'PIOC'    // Instantaneous Overcurrent (50)
  | 'PSCH'    // Schemes (67/87/etc.)
  | 'PTOV'    // Time Overvoltage (59)
  | 'PTUV'    // Time Undervoltage (27)
  | 'PTRC'    // Trip Control
  | 'RREC'    // Reclosing
  | 'GGIO';   // Generic GPIO

export interface ScadaSignalSpec {
  readonly nodeId: string;        // np. "Q1-XCBR1"
  readonly signalType: ScadaSignalType;
  readonly logicalNode: IEC61850LogicalNode;
  readonly description: string;
  readonly unit?: string;          // V/A/Hz/etc.
  readonly scanRateMs?: number;    // częstość próbkowania
  readonly mandatory: boolean;
}

/** Typowe sygnały dla pola SN. */
export const STANDARD_BAY_SCADA_SIGNALS: readonly ScadaSignalSpec[] = [
  // CB (Q1) — XCBR
  { nodeId: 'Q1-XCBR1.Pos', signalType: 'DI', logicalNode: 'XCBR',
    description: 'Pozycja CB (open/closed)', mandatory: true, scanRateMs: 100 },
  { nodeId: 'Q1-XCBR1.OpOpn', signalType: 'DO', logicalNode: 'XCBR',
    description: 'Otwórz CB', mandatory: true },
  { nodeId: 'Q1-XCBR1.OpCls', signalType: 'DO', logicalNode: 'XCBR',
    description: 'Zamknij CB', mandatory: true },
  // DS (Q2) — XSWI
  { nodeId: 'Q2-XSWI1.Pos', signalType: 'DI', logicalNode: 'XSWI',
    description: 'Pozycja DS', mandatory: true, scanRateMs: 100 },
  // ES (Q3) — XSWI
  { nodeId: 'Q3-XSWI1.Pos', signalType: 'DI', logicalNode: 'XSWI',
    description: 'Pozycja ES', mandatory: true, scanRateMs: 100 },
  // Measurements — MMXU
  { nodeId: 'MMXU1.PhV.phsA', signalType: 'AI', logicalNode: 'MMXU',
    description: 'Napięcie fazy A', unit: 'V', mandatory: true, scanRateMs: 500 },
  { nodeId: 'MMXU1.A.phsA', signalType: 'AI', logicalNode: 'MMXU',
    description: 'Prąd fazy A', unit: 'A', mandatory: true, scanRateMs: 500 },
  { nodeId: 'MMXU1.TotW', signalType: 'AI', logicalNode: 'MMXU',
    description: 'Moc czynna total', unit: 'W', mandatory: true, scanRateMs: 1000 },
  { nodeId: 'MMXU1.TotVAr', signalType: 'AI', logicalNode: 'MMXU',
    description: 'Moc bierna total', unit: 'var', mandatory: true, scanRateMs: 1000 },
  { nodeId: 'MMXU1.Hz', signalType: 'AI', logicalNode: 'MMXU',
    description: 'Częstotliwość', unit: 'Hz', mandatory: true, scanRateMs: 500 },
  // Protection — PTOC/PIOC
  { nodeId: 'PTOC1.Op', signalType: 'DI', logicalNode: 'PTOC',
    description: 'Time overcurrent trip (51)', mandatory: true },
  { nodeId: 'PIOC1.Op', signalType: 'DI', logicalNode: 'PIOC',
    description: 'Instantaneous OC trip (50)', mandatory: true },
  // Trip control — PTRC
  { nodeId: 'PTRC1.Tr', signalType: 'DI', logicalNode: 'PTRC',
    description: 'General trip signal', mandatory: true },
];

/** Konfiguracja konstrukcji stacji. */
export interface StationConstructionSpec {
  /** Typ obudowy. */
  readonly enclosureType: 'metal_clad' | 'kontener' | 'budynek_murowany' | 'budynek_prefabrykowany';
  /** Wymiary zewnętrzne (mm). */
  readonly externalDimsMm: { length: number; width: number; height: number };
  /** Klasa ognioodporności (REI). */
  readonly fireResistanceMin: number;  // 30/60/90/120
  /** Wentylacja. */
  readonly ventilation: 'natural' | 'forced';
  /** Zabezpieczenia ppoż. */
  readonly fireProtection: ReadonlyArray<'detector' | 'extinguisher' | 'sprinkler' | 'gas_co2'>;
  /** Service voltage (auxiliary). */
  readonly auxVoltageV: number;
}

/** Typowa stacja kontenerowa SN/nN 630 kVA. */
export const STANDARD_STATION_CONTAINER_630: StationConstructionSpec = {
  enclosureType: 'kontener',
  externalDimsMm: { length: 6058, width: 2438, height: 2591 },
  fireResistanceMin: 60,
  ventilation: 'natural',
  fireProtection: ['detector', 'extinguisher'],
  auxVoltageV: 230,
};

/** Walidacja kompletności SCADA — czy wszystkie mandatory signals zdefiniowane. */
export function validateScadaCompleteness(
  configured: readonly string[],
): { readonly complete: boolean; readonly missing: ReadonlyArray<string> } {
  const mandatory = STANDARD_BAY_SCADA_SIGNALS
    .filter((s) => s.mandatory)
    .map((s) => s.nodeId);
  const missing = mandatory.filter((id) => !configured.includes(id));
  return { complete: missing.length === 0, missing };
}
