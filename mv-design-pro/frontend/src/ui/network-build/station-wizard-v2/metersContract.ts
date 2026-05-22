/**
 * Meters Contract — krok 7 Kreatora KOMPLETNEGO.
 *
 * Liczniki pomiarowo-rozliczeniowe per Excel MT880 v3 + rozporządzenia OSD:
 *   LZQJ-XC + VAXCLT     — rozliczeniowy 4-kwadrant z modułem komunikacji
 *   ZMD405 + CU-U52      — rozliczeniowy z modemem
 *   MT880 + CM LTE3      — licznik modularny precyzyjny (Iskraemeco)
 *
 * Mapowanie rdzeń CT ↔ uzwojenie VT ↔ urządzenie:
 *   Rdzeń CT I + Uzw VT I  → licznik rozliczeniowy
 *   Rdzeń CT III + Uzw VT III → zabezpieczenie (relay)
 *   Uzw VT IV (3P open delta) → SCADA + V0
 *
 * Analizatory jakości energii klasy A mają osobny katalog i osobny blok
 * obliczeń obwodów wtórnych w `powerQualityAnalyzerContract.ts`.
 */

/** Typ licznika. */
export type MeterType =
  | 'BILLING'             // Licznik rozliczeniowy klasy 0.2s lub 0.5s
  | 'CHECK';              // Licznik kontrolny

/** Klasa dokładności licznika per IEC 62053. */
export const METER_TYPE_LABEL_PL: Record<MeterType, string> = {
  BILLING: 'licznik rozliczeniowy',
  CHECK: 'licznik kontrolny',
};

export type MeterAccuracyClass = '0.2s' | '0.5s' | '1' | '2';

/** Tryb komunikacji. */
export type MeterCommunicationMode =
  | 'M-Bus'
  | 'RS-485'
  | 'LTE/GSM'
  | 'PLC'
  | 'optical_serial';

/** Wariant pomiaru wynikający z połączeń CT/VT. */
export type MeteringVariant =
  | 'DIRECT'
  | 'SEMI_INDIRECT'
  | 'INDIRECT_CT_VT';

export const METERING_VARIANT_LABEL_PL: Record<MeteringVariant, string> = {
  DIRECT: 'bezpośredni',
  SEMI_INDIRECT: 'półpośredni',
  INDIRECT_CT_VT: 'pośredni przez CT/VT',
};

export interface MeterCatalogEntry {
  readonly modelRef: string;
  readonly manufacturerRef: string;
  readonly type: MeterType;
  readonly typeLabelPl: string;
  readonly accuracyClass: MeterAccuracyClass;
  readonly secondaryVoltageV: number;  // typ. 100 / √3
  readonly secondaryCurrentA: number;  // typ. 5
  readonly voltageCircuitBurdenVa: number;
  readonly currentCircuitBurdenVa: number;
  readonly meteringVariant: MeteringVariant;
  readonly meteringVariantLabelPl: string;
  readonly burdenVa: number;            // ≤ przekładnik VT/CT Sn
  readonly communicationModes: ReadonlyArray<MeterCommunicationMode>;
  readonly fourQuadrant: boolean;       // Może mierzyć P+/P-/Q+/Q-
  /** Liczba okręgów przekładników CT/VT podłączonych (typ. 3 fazy + N). */
  readonly inputChannels: number;
}

/** Katalog referencyjny per Excel MT880 v3. */
export const METER_REFERENCE_CATALOG: readonly MeterCatalogEntry[] = [
  {
    modelRef: 'LZQJ-XC',
    manufacturerRef: 'Landis+Gyr',
    type: 'BILLING',
    typeLabelPl: METER_TYPE_LABEL_PL.BILLING,
    accuracyClass: '0.2s',
    secondaryVoltageV: 57.74,
    secondaryCurrentA: 5,
    voltageCircuitBurdenVa: 0.02,
    currentCircuitBurdenVa: 0.125,
    burdenVa: 0.125,
    meteringVariant: 'INDIRECT_CT_VT',
    meteringVariantLabelPl: METERING_VARIANT_LABEL_PL.INDIRECT_CT_VT,
    communicationModes: ['LTE/GSM', 'optical_serial', 'M-Bus'],
    fourQuadrant: true,
    inputChannels: 4,
  },
  {
    modelRef: 'ZMD405',
    manufacturerRef: 'Landis+Gyr',
    type: 'BILLING',
    typeLabelPl: METER_TYPE_LABEL_PL.BILLING,
    accuracyClass: '0.2s',
    secondaryVoltageV: 57.74,
    secondaryCurrentA: 5,
    voltageCircuitBurdenVa: 1.8,
    currentCircuitBurdenVa: 0.125,
    burdenVa: 1.8,
    meteringVariant: 'INDIRECT_CT_VT',
    meteringVariantLabelPl: METERING_VARIANT_LABEL_PL.INDIRECT_CT_VT,
    communicationModes: ['LTE/GSM', 'RS-485', 'M-Bus'],
    fourQuadrant: true,
    inputChannels: 4,
  },
  {
    modelRef: 'MT880',
    manufacturerRef: 'Iskraemeco',
    type: 'BILLING',
    typeLabelPl: METER_TYPE_LABEL_PL.BILLING,
    accuracyClass: '0.2s',
    secondaryVoltageV: 57.74,
    secondaryCurrentA: 5,
    voltageCircuitBurdenVa: 1.5,
    currentCircuitBurdenVa: 0.2,
    burdenVa: 1.5,
    meteringVariant: 'INDIRECT_CT_VT',
    meteringVariantLabelPl: METERING_VARIANT_LABEL_PL.INDIRECT_CT_VT,
    communicationModes: ['LTE/GSM', 'RS-485', 'optical_serial'],
    fourQuadrant: true,
    inputChannels: 4,
  },
];

/** Mapowanie kanału pomiarowego. */
export interface ChannelAssignment {
  readonly meterRef: string;
  readonly ctCoreId: string;     // 'I' / 'II' / 'III'
  readonly vtWindingId: string;  // 'I' / 'II' / 'III' / 'IV'
  readonly purposePl: string;
}

/** Typowe mapowanie dla stacji rozliczeniowej. */
export const STANDARD_METER_CHANNEL_ASSIGNMENT: readonly ChannelAssignment[] = [
  {
    meterRef: 'LZQJ-XC',
    ctCoreId: 'I',
    vtWindingId: 'I',
    purposePl: 'Pomiar rozliczeniowy 4-kwadrant',
  },
];

/** Sprawdzenie poprawności mapowania kanałów (np. konflikt rdzeni). */
export function validateChannelAssignment(
  assignments: readonly ChannelAssignment[],
): { readonly valid: boolean; readonly conflicts: ReadonlyArray<string> } {
  const conflicts: string[] = [];
  // Kontrola: dwa różne urządzenia nie mogą być na tym samym rdzeniu.
  const ctCoreUsed = new Map<string, string>();
  for (const a of assignments) {
    const key = a.ctCoreId;
    if (ctCoreUsed.has(key)) {
      conflicts.push(
        `Konflikt: rdzeń CT ${a.ctCoreId} użyty przez "${ctCoreUsed.get(key)}" i "${a.meterRef}"`,
      );
    } else {
      ctCoreUsed.set(key, a.meterRef);
    }
  }
  return { valid: conflicts.length === 0, conflicts };
}
