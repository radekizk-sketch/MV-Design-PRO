/**
 * hvTransformerCatalog — kanon polski katalog transformatorów HV/SN (R35).
 *
 * Realne typy używane w polskiej energetyce dystrybucyjnej (PSE/Energa/Tauron/Enea).
 * Dane wzorowane na specyfikacjach producentów:
 *   - ABB / Hitachi (TRT3, dawniej TRO/TRY)
 *   - Siemens / Energotechnika (KTW)
 *   - SGB-SMIT (PowerTech)
 *
 * Każdy wpis zawiera PEŁNE parametry inżynierskie potrzebne dla:
 *   - Load flow (sn_mva, uhv_kv, ulv_kv, uk_percent, pcu_kw)
 *   - Short circuit (uk_percent, sn_mva, vector_group)
 *   - Earthing analysis (vector_group, ulv_kv, neutral_arrangement)
 *   - Protection coordination (rated_current_a, sn_mva)
 *   - Thermal rating (cooling_class, oil_volume_l)
 */

import type { CatalogType, CatalogNamespace } from './types';

/* =============================================================================
   HV Transformer catalog entry — pełne parametry inżynierskie
   ============================================================================= */

export interface HvTransformerSpec {
  /** Stable id katalogu (deterministic, lower-snake-case). */
  readonly id: string;
  /** Polska nazwa marketing (np. "TRT3 110/15-25"). */
  readonly designation: string;
  /** Producent (ABB/Siemens/SGB-SMIT/...). */
  readonly manufacturer: string;
  /** Typ konstrukcyjny (3-fazowy 2-uzwojeniowy). */
  readonly construction: 'three_phase_two_winding';

  /* === ELEKTRYCZNE === */
  /** Moc znamionowa Sn [MVA]. */
  readonly snMva: number;
  /** Napięcie znamionowe HV [kV]. */
  readonly uhvKv: number;
  /** Napięcie znamionowe LV [kV]. */
  readonly ulvKv: number;
  /** Napięcie zwarcia uk [%]. */
  readonly ukPercent: number;
  /** Straty obciążeniowe Pcu [kW]. */
  readonly pcuKw: number;
  /** Straty jałowe P0 [kW]. */
  readonly p0Kw: number;
  /** Prąd jałowy I0 [%]. */
  readonly i0Percent: number;
  /** Grupa wektorowa (kanon: YNd11, YNd1, Yyn0, ...). */
  readonly vectorGroup: 'YNd11' | 'YNd1' | 'YNd5' | 'YNd7' | 'Yyn0' | 'Dyn1' | 'Dyn5' | 'Dyn11' | 'Yzn5' | 'Yzn11';

  /* === MECHANICZNE === */
  /** Klasa chłodzenia (ONAN/ONAF/OFAF). */
  readonly coolingClass: 'ONAN' | 'ONAF' | 'OFAF' | 'OFWF';
  /** Sposób uziemienia neutralnego (kanon polski). */
  readonly neutralArrangement: 'solidly_grounded' | 'resistance_grounded' | 'reactor_grounded' | 'isolated';

  /* === EKSPLOATACYJNE === */
  /** Prąd znamionowy HV [A] = sn_mva*1000 / (sqrt(3) * uhv_kv). */
  readonly inHvA: number;
  /** Prąd znamionowy LV [A] = sn_mva*1000 / (sqrt(3) * ulv_kv). */
  readonly inLvA: number;
  /** Objętość oleju [l]. */
  readonly oilVolumeL: number;
  /** Masa całkowita [kg]. */
  readonly totalMassKg: number;

  /* === EKONOMICZNE === */
  /** Cena referencyjna [PLN] (orientacyjna). */
  readonly priceReferencePln: number;
  /** Czas dostawy [tygodnie]. */
  readonly leadTimeWeeks: number;

  /* === META === */
  /** Standard zgodności (IEC 60076, PN-EN). */
  readonly standard: string;
  /** Klasa eko (Tier 1/2 wg EU regulation). */
  readonly ecoTier: 'Tier1' | 'Tier2' | 'preTier';
  /** Czy regulacja pod obciążeniem (OLTC). */
  readonly hasOltc: boolean;
  /** Zakres regulacji OLTC w stopniach (np. ±9 × 1.78%). */
  readonly oltcRange?: string;
}

/* =============================================================================
   Realny katalog (12 wpisów dla typowych GPZ-ów polskich)
   ============================================================================= */

export const HV_TRANSFORMER_CATALOG: readonly HvTransformerSpec[] = [
  /* === 110/15 kV — najczęściej używane GPZ-y SN === */
  {
    id: 'abb-trt3-110-15-25',
    designation: 'TRT3 110/15-25',
    manufacturer: 'ABB / Hitachi',
    construction: 'three_phase_two_winding',
    snMva: 25,
    uhvKv: 110,
    ulvKv: 15,
    ukPercent: 11.0,
    pcuKw: 110,
    p0Kw: 18,
    i0Percent: 0.6,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAN',
    neutralArrangement: 'reactor_grounded',
    inHvA: 131,
    inLvA: 962,
    oilVolumeL: 8500,
    totalMassKg: 38000,
    priceReferencePln: 2_800_000,
    leadTimeWeeks: 32,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  {
    id: 'sgb-power-110-15-40',
    designation: 'PowerTech 110/15-40',
    manufacturer: 'SGB-SMIT',
    construction: 'three_phase_two_winding',
    snMva: 40,
    uhvKv: 110,
    ulvKv: 15,
    ukPercent: 12.0,
    pcuKw: 165,
    p0Kw: 24,
    i0Percent: 0.5,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAF',
    neutralArrangement: 'reactor_grounded',
    inHvA: 210,
    inLvA: 1540,
    oilVolumeL: 12500,
    totalMassKg: 52000,
    priceReferencePln: 4_100_000,
    leadTimeWeeks: 36,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  {
    id: 'siemens-ktw-110-15-63',
    designation: 'KTW 110/15-63',
    manufacturer: 'Siemens / Energotechnika',
    construction: 'three_phase_two_winding',
    snMva: 63,
    uhvKv: 110,
    ulvKv: 15,
    ukPercent: 12.5,
    pcuKw: 250,
    p0Kw: 35,
    i0Percent: 0.4,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAF',
    neutralArrangement: 'reactor_grounded',
    inHvA: 331,
    inLvA: 2425,
    oilVolumeL: 18000,
    totalMassKg: 75000,
    priceReferencePln: 6_500_000,
    leadTimeWeeks: 42,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },

  /* === 110/20 kV — strefa miejska + duże osiedla === */
  {
    id: 'abb-trt3-110-20-25',
    designation: 'TRT3 110/20-25',
    manufacturer: 'ABB / Hitachi',
    construction: 'three_phase_two_winding',
    snMva: 25,
    uhvKv: 110,
    ulvKv: 20,
    ukPercent: 11.5,
    pcuKw: 105,
    p0Kw: 17,
    i0Percent: 0.6,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAN',
    neutralArrangement: 'reactor_grounded',
    inHvA: 131,
    inLvA: 722,
    oilVolumeL: 8500,
    totalMassKg: 37000,
    priceReferencePln: 2_750_000,
    leadTimeWeeks: 32,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  {
    id: 'sgb-power-110-20-40',
    designation: 'PowerTech 110/20-40',
    manufacturer: 'SGB-SMIT',
    construction: 'three_phase_two_winding',
    snMva: 40,
    uhvKv: 110,
    ulvKv: 20,
    ukPercent: 12.0,
    pcuKw: 158,
    p0Kw: 22,
    i0Percent: 0.5,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAF',
    neutralArrangement: 'reactor_grounded',
    inHvA: 210,
    inLvA: 1155,
    oilVolumeL: 12000,
    totalMassKg: 51000,
    priceReferencePln: 4_050_000,
    leadTimeWeeks: 36,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  {
    id: 'siemens-ktw-110-20-63',
    designation: 'KTW 110/20-63',
    manufacturer: 'Siemens / Energotechnika',
    construction: 'three_phase_two_winding',
    snMva: 63,
    uhvKv: 110,
    ulvKv: 20,
    ukPercent: 13.0,
    pcuKw: 240,
    p0Kw: 32,
    i0Percent: 0.4,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAF',
    neutralArrangement: 'reactor_grounded',
    inHvA: 331,
    inLvA: 1819,
    oilVolumeL: 17500,
    totalMassKg: 73000,
    priceReferencePln: 6_400_000,
    leadTimeWeeks: 42,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },

  /* === 110/30 kV — sieci wiejskie i przemysłowe === */
  {
    id: 'abb-trt3-110-30-16',
    designation: 'TRT3 110/30-16',
    manufacturer: 'ABB / Hitachi',
    construction: 'three_phase_two_winding',
    snMva: 16,
    uhvKv: 110,
    ulvKv: 30,
    ukPercent: 11.0,
    pcuKw: 80,
    p0Kw: 14,
    i0Percent: 0.7,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAN',
    neutralArrangement: 'reactor_grounded',
    inHvA: 84,
    inLvA: 308,
    oilVolumeL: 6500,
    totalMassKg: 28000,
    priceReferencePln: 2_100_000,
    leadTimeWeeks: 30,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  {
    id: 'abb-trt3-110-30-25',
    designation: 'TRT3 110/30-25',
    manufacturer: 'ABB / Hitachi',
    construction: 'three_phase_two_winding',
    snMva: 25,
    uhvKv: 110,
    ulvKv: 30,
    ukPercent: 11.5,
    pcuKw: 110,
    p0Kw: 18,
    i0Percent: 0.6,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAN',
    neutralArrangement: 'reactor_grounded',
    inHvA: 131,
    inLvA: 481,
    oilVolumeL: 8800,
    totalMassKg: 39000,
    priceReferencePln: 2_900_000,
    leadTimeWeeks: 32,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  {
    id: 'sgb-power-110-30-40',
    designation: 'PowerTech 110/30-40',
    manufacturer: 'SGB-SMIT',
    construction: 'three_phase_two_winding',
    snMva: 40,
    uhvKv: 110,
    ulvKv: 30,
    ukPercent: 12.5,
    pcuKw: 162,
    p0Kw: 23,
    i0Percent: 0.5,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAF',
    neutralArrangement: 'reactor_grounded',
    inHvA: 210,
    inLvA: 770,
    oilVolumeL: 12500,
    totalMassKg: 52500,
    priceReferencePln: 4_200_000,
    leadTimeWeeks: 38,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },

  /* === 220/110 kV — autotransformatory wielkich GPZ-ów (PSE) === */
  {
    id: 'abb-tao-220-110-160',
    designation: 'TAO 220/110-160',
    manufacturer: 'ABB / Hitachi',
    construction: 'three_phase_two_winding',
    snMva: 160,
    uhvKv: 220,
    ulvKv: 110,
    ukPercent: 12.0,
    pcuKw: 380,
    p0Kw: 65,
    i0Percent: 0.3,
    vectorGroup: 'Yyn0',
    coolingClass: 'OFAF',
    neutralArrangement: 'solidly_grounded',
    inHvA: 420,
    inLvA: 840,
    oilVolumeL: 32000,
    totalMassKg: 145000,
    priceReferencePln: 14_500_000,
    leadTimeWeeks: 52,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±12 × 1.5%',
  },

  /* === 110/6 kV — sieci przemysłowe (huty, kopalnie) === */
  {
    id: 'sgb-power-110-6-25',
    designation: 'PowerTech 110/6-25',
    manufacturer: 'SGB-SMIT',
    construction: 'three_phase_two_winding',
    snMva: 25,
    uhvKv: 110,
    ulvKv: 6,
    ukPercent: 11.0,
    pcuKw: 115,
    p0Kw: 19,
    i0Percent: 0.6,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAN',
    neutralArrangement: 'isolated',
    inHvA: 131,
    inLvA: 2406,
    oilVolumeL: 8800,
    totalMassKg: 38500,
    priceReferencePln: 2_950_000,
    leadTimeWeeks: 34,
    standard: 'IEC 60076-1:2011 / PN-EN 60076',
    ecoTier: 'Tier2',
    hasOltc: true,
    oltcRange: '±9 × 1.78%',
  },
  /* === Custom marker === */
  {
    id: 'custom-trafo',
    designation: 'Wpisz parametry ręcznie',
    manufacturer: '—',
    construction: 'three_phase_two_winding',
    snMva: 0,
    uhvKv: 0,
    ulvKv: 0,
    ukPercent: 0,
    pcuKw: 0,
    p0Kw: 0,
    i0Percent: 0,
    vectorGroup: 'YNd11',
    coolingClass: 'ONAN',
    neutralArrangement: 'reactor_grounded',
    inHvA: 0,
    inLvA: 0,
    oilVolumeL: 0,
    totalMassKg: 0,
    priceReferencePln: 0,
    leadTimeWeeks: 0,
    standard: '—',
    ecoTier: 'Tier2',
    hasOltc: false,
  },
];

/* =============================================================================
   API
   ============================================================================= */

/** Lookup catalog entry by id. */
export function getHvTransformerById(id: string): HvTransformerSpec | null {
  return HV_TRANSFORMER_CATALOG.find((e) => e.id === id) ?? null;
}

/** Filter catalog by HV/LV voltage pair (np. tylko 110/15). */
export function filterHvTransformersByVoltage(
  uhvKv: number,
  ulvKv: number | null,
): readonly HvTransformerSpec[] {
  return HV_TRANSFORMER_CATALOG.filter((e) =>
    Math.abs(e.uhvKv - uhvKv) < 0.5
    && (ulvKv === null || Math.abs(e.ulvKv - ulvKv) < 0.5)
    && e.id !== 'custom-trafo',
  );
}

/** Filter by Sn rating range. */
export function filterHvTransformersBySn(minMva: number, maxMva: number): readonly HvTransformerSpec[] {
  return HV_TRANSFORMER_CATALOG.filter((e) =>
    e.snMva >= minMva && e.snMva <= maxMva && e.id !== 'custom-trafo',
  );
}

/** Konwersja na kanon CatalogType (id+name+manufacturer). */
export function toCatalogType(spec: HvTransformerSpec): CatalogType {
  return {
    id: spec.id,
    name: spec.designation,
    manufacturer: spec.manufacturer,
  };
}

/** Wykorzystywane CatalogNamespace marker dla HV transformatorów GPZ. */
export const HV_TRANSFORMER_NAMESPACE: CatalogNamespace = 'TRAFO_SN_NN';
