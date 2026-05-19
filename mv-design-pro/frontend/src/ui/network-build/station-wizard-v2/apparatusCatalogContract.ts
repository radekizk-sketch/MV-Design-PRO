/**
 * Apparatus Catalog Contract — krok 4 Kreatora KOMPLETNEGO.
 *
 * Q1/Q2/Q3 — aparaty pierwotne pola SN per IEC 62271:
 *   Q1 — wyłącznik (CB) lub rozłącznik (LBS) lub rozł.-bezpiecznikowy (LBS+FUSE)
 *   Q2 — odłącznik (DS) — bez zdolności łączenia pod obciążeniem
 *   Q3 — uziemnik (ES) — bezpieczeństwo BHP
 *
 * Standard pól (per IEC 62271-200 § 6.106):
 *   Pole kablowe       Q2 (DS) → Q1 (LBS) → Q3 (ES)
 *   Pole wyłącznikowe  Q2 (DS) → Q1 (CB) → CT → Q3 (ES)
 *   Pole transformat.  Q2 (DS) → Q1 (LBS+FUSE) → Q3 (ES)
 *
 * Klasy mechaniczne M1/M2 + elektryczne E1/E2/E3 (per IEC 62271-100).
 */

/** Typ aparatu łączeniowego per IEC 62271. */
export type ApparatusType =
  | 'CB_VACUUM'      // Wyłącznik próżniowy IEC 62271-100
  | 'CB_SF6'         // Wyłącznik SF6 IEC 62271-100
  | 'LBS'            // Rozłącznik (Load-Break Switch) IEC 62271-103
  | 'LBS_FUSE'       // Rozłącznik z bezpiecznikami IEC 62271-105
  | 'DS'             // Odłącznik (Disconnector) IEC 62271-102
  | 'ES'             // Uziemnik (Earthing Switch) IEC 62271-102
  | 'RECLOSER';      // Recloser/autorecloser

/** Klasa mechaniczna per IEC 62271-1 §5.103. */
export type MechanicalClass = 'M1' | 'M2';

/** Klasa elektryczna per IEC 62271-100 §6.108. */
export type ElectricalClass = 'E1' | 'E2' | 'E3';

/** Klasa łuku per IEC 62271-100 §6.106. */
export type ArcClass = 'C1' | 'C2';

export interface ApparatusCatalogEntry {
  readonly catalogRef: string;
  readonly type: ApparatusType;
  readonly designation: string;       // np. "Q1", "Q2", "Q3"
  readonly ratedVoltageKv: number;    // Ur
  readonly ratedCurrentA: number;     // Ir
  readonly ratedShortTimeCurrentKa: number;  // Ik 1s
  readonly ratedPeakCurrentKa: number;        // Ip
  readonly mechanicalClass?: MechanicalClass;
  readonly electricalClass?: ElectricalClass;
  readonly arcClass?: ArcClass;
  readonly manufacturerRef: string;
  readonly weightKg?: number;
  readonly notes?: string;
}

/**
 * Referencyjny katalog aparatów dla typowej stacji 15/0.4 kV.
 */
export const APPARATUS_REFERENCE_CATALOG: readonly ApparatusCatalogEntry[] = [
  {
    catalogRef: 'ABB VD4-24-630-16',
    type: 'CB_VACUUM',
    designation: 'Q1 — Wyłącznik próżniowy',
    ratedVoltageKv: 24,
    ratedCurrentA: 630,
    ratedShortTimeCurrentKa: 16,
    ratedPeakCurrentKa: 40,
    mechanicalClass: 'M2',
    electricalClass: 'E2',
    arcClass: 'C2',
    manufacturerRef: 'ABB',
  },
  {
    catalogRef: 'Siemens 3AH5-24-630-25',
    type: 'CB_VACUUM',
    designation: 'Q1 — Wyłącznik próżniowy',
    ratedVoltageKv: 24,
    ratedCurrentA: 630,
    ratedShortTimeCurrentKa: 25,
    ratedPeakCurrentKa: 63,
    mechanicalClass: 'M2',
    electricalClass: 'E2',
    arcClass: 'C2',
    manufacturerRef: 'Siemens',
  },
  {
    catalogRef: 'ZPUE RL-24-630',
    type: 'LBS',
    designation: 'Q1 — Rozłącznik',
    ratedVoltageKv: 24,
    ratedCurrentA: 630,
    ratedShortTimeCurrentKa: 20,
    ratedPeakCurrentKa: 50,
    manufacturerRef: 'ZPUE_Wloszczowa',
  },
  {
    catalogRef: 'ZPUE RB-24-200/63A',
    type: 'LBS_FUSE',
    designation: 'Q1 — Rozłącznik z bezpiecznikami',
    ratedVoltageKv: 24,
    ratedCurrentA: 200,
    ratedShortTimeCurrentKa: 16,
    ratedPeakCurrentKa: 40,
    manufacturerRef: 'ZPUE_Wloszczowa',
    notes: 'Z bezpiecznikami HRC 63A dla pola transformatorowego 630 kVA',
  },
  {
    catalogRef: 'ABB OD-24-630',
    type: 'DS',
    designation: 'Q2 — Odłącznik',
    ratedVoltageKv: 24,
    ratedCurrentA: 630,
    ratedShortTimeCurrentKa: 20,
    ratedPeakCurrentKa: 50,
    mechanicalClass: 'M1',
    manufacturerRef: 'ABB',
  },
  {
    catalogRef: 'ABB UZ-24-200',
    type: 'ES',
    designation: 'Q3 — Uziemnik',
    ratedVoltageKv: 24,
    ratedCurrentA: 200,
    ratedShortTimeCurrentKa: 20,
    ratedPeakCurrentKa: 50,
    mechanicalClass: 'M1',
    manufacturerRef: 'ABB',
    notes: 'Z możliwością załączania na zwarcie do 5x in nominal',
  },
];

/** Sprawdzenie czy aparat jest dopuszczony dla danego napięcia + Ik. */
export interface ApparatusRatingCheckResult {
  readonly voltageOk: boolean;
  readonly currentOk: boolean;
  readonly shortCircuitOk: boolean;
  readonly peakOk: boolean;
  readonly allOk: boolean;
}

export function checkApparatusRating(
  apparatus: ApparatusCatalogEntry,
  networkVoltageKv: number,
  designCurrentA: number,
  networkIthKa: number,
  networkIpeakKa: number,
): ApparatusRatingCheckResult {
  const voltageOk = apparatus.ratedVoltageKv >= networkVoltageKv;
  const currentOk = apparatus.ratedCurrentA >= designCurrentA;
  const shortCircuitOk = apparatus.ratedShortTimeCurrentKa >= networkIthKa;
  const peakOk = apparatus.ratedPeakCurrentKa >= networkIpeakKa;
  return {
    voltageOk,
    currentOk,
    shortCircuitOk,
    peakOk,
    allOk: voltageOk && currentOk && shortCircuitOk && peakOk,
  };
}

/** Filtrowanie aparatów po typie. */
export function getApparatusByType(
  type: ApparatusType,
): readonly ApparatusCatalogEntry[] {
  return APPARATUS_REFERENCE_CATALOG.filter((a) => a.type === type);
}

/** Filtrowanie aparatów po producencie. */
export function getApparatusByManufacturer(
  ref: string,
): readonly ApparatusCatalogEntry[] {
  return APPARATUS_REFERENCE_CATALOG.filter((a) => a.manufacturerRef === ref);
}
