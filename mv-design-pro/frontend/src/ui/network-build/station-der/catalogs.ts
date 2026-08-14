/**
 * Katalogi dla integracji E-13 ↔ E-21/E-22/E-23 (Faza B).
 *
 * Każda techniczna wartość wybierana w UI musi mieć `catalog_ref`. Dane
 * katalogowe są frozen tabelami w pamięci frontendu (publikacja z backendu
 * wprowadzi te same wartości via `catalog_namespace` + `catalog_item_id`).
 *
 * Katalogi:
 *  - NcRfgProfileCatalog (5 OSD)
 *  - LvrtCurveCatalog (4 krzywe)
 *  - HvrtCurveCatalog (4 krzywe)
 *  - LvVoltageLevelCatalog (5 poziomów)
 *  - ConnectionVariantCatalog (3 warianty)
 *  - StationTemplateCatalog (10 szablonów)
 *  - PvInverterCatalog (frontend snapshot)
 *  - BessPcsCatalog
 *  - WindTurbineCatalog
 *  - DerProtectionCatalog
 *  - DerCtVtCatalog
 *
 * Zasada: brak losowych wartości — pusty katalog → blocker, custom value
 * tylko jako pozycja katalogowa użytkownika.
 */

/**
 * Wersja katalogów = DATA PRZEGLĄDU PROWENIENCJI (ISO-8601), nie wymyślony numer.
 *
 * Do karty K-Q pozycje deklarowały `catalog_version: AUDIT2_CATALOG_VERSION` — numer, który nie
 * odpowiadał żadnemu wydaniu żadnego źródła i którego nie dało się z niczym
 * skonfrontować. Wersja jest teraz MIERZALNA: to dzień, w którym każdą pozycję
 * zestawiono ze źródłem (albo z niego usunięto). Wartość jest identyczna ze stałą
 * `AUDIT2_CATALOG_VERSION` w backendzie (`network_model/catalog/audit2_catalogs.py`),
 * bo backend jest autorytetem danych, a ten plik jego mirrorem.
 */
export const AUDIT2_CATALOG_VERSION = '2026-08-14';

// =============================================================================
// 1. NcRfgProfileCatalog
// =============================================================================

export interface NcRfgProfileItem {
  readonly id: string;
  readonly catalog_namespace: 'nc_rfg_profile';
  readonly catalog_version: string;
  readonly operator_code: 'PSE' | 'Energa' | 'Tauron' | 'Enea' | 'PGE';
  readonly label_pl: string;
  readonly description_pl: string;
  readonly applicable_module_types: readonly ('A' | 'B' | 'C' | 'D')[];
  readonly q_u_curve_ref: string;
  readonly p_f_curve_ref: string;
  readonly source: 'NC_RfG_Annex_II' | 'IRiESD' | 'IRiESP';
  readonly status: 'active';
  /**
   * Naprawa A.2 (audyt profesora): współczynniki napięciowe IEC 60909 Tab.1.
   * c_max — maksymalny prąd zwarcia (≈1,10), c_min — minimalny (≈0,95).
   */
  readonly c_max: number;
  readonly c_min: number;
  /**
   * Naprawa B.4 (audyt projektanta): minimalna wymagana moc zwarciowa w PCC
   * (Sk_min) jako multiplikator mocy modułu (P_DER). Moduł B: ≥5×, C: ≥10×,
   * D: ≥25× zgodnie z NC RfG Art. 17.
   */
  readonly sk_min_to_p_ratio_by_module: Readonly<Record<'A' | 'B' | 'C' | 'D', number | null>>;
  /**
   * Naprawa eng.8 (audyt OZE): parametry Q(U) per OSD (NC RfG Art. 21).
   * - q_u_deadzone_percent: szerokość strefy nieczułości (typowo ±3% Un)
   * - q_u_min_pu / q_u_max_pu: zakres Q dla cos φ ind/poj (typowo ±0.33 = 0.95)
   * - cos_phi_min_lagging: minimalny cos φ przy zwiększonym napięciu
   */
  readonly q_u_deadzone_percent: number;
  readonly q_u_min_pu: number;
  readonly q_u_max_pu: number;
  readonly cos_phi_min_lagging: number;
}

// IEC 60909 Tabela 1: dla 1-35 kV c_max=1.10, c_min=0.95 (sieć średniego
// napięcia stosowana w Polsce 15/20/30 kV).
const C_FACTORS_MV: Pick<NcRfgProfileItem, 'c_max' | 'c_min'> = { c_max: 1.10, c_min: 0.95 };

// NC RfG Art. 17: minimalna Sk w PCC dla DER modułów B/C/D (multiplikator P_DER).
// Moduł A nie ma wymogu (małe instalacje <0.8 kW).
const NC_RFG_SK_RATIOS = {
  A: null,
  B: 5,
  C: 10,
  D: 25,
} as const;

// Naprawa eng.8: domyślne parametry Q(U) zgodne z NC RfG Art. 21.
const Q_U_DEFAULTS = {
  q_u_deadzone_percent: 3, // ±3% Un (typowy "dead zone")
  q_u_min_pu: -0.33,        // -33% S_n (cos φ ind 0.95)
  q_u_max_pu: 0.33,         // +33% S_n (cos φ poj 0.95)
  cos_phi_min_lagging: 0.95,
};
// Pełniejszy zakres dla PSE (transmission, NC RfG Art. 21 Mode A.3).
const Q_U_PSE = {
  q_u_deadzone_percent: 2,
  q_u_min_pu: -0.40,
  q_u_max_pu: 0.40,
  cos_phi_min_lagging: 0.90,
};

export const NC_RFG_PROFILE_CATALOG: ReadonlyArray<NcRfgProfileItem> = Object.freeze([
  {
    id: 'ncrfg_pse',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: AUDIT2_CATALOG_VERSION,
    operator_code: 'PSE',
    label_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
    description_pl:
      'Profil bazowy NC RfG Annex II (sieć przesyłowa 110+ kV). Wszystkie moduły A-D z wymaganiami pełnymi.',
    applicable_module_types: ['A', 'B', 'C', 'D'],
    q_u_curve_ref: 'qu_pse_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'NC_RfG_Annex_II',
    status: 'active',
    ...C_FACTORS_MV,
    sk_min_to_p_ratio_by_module: NC_RFG_SK_RATIOS,
    ...Q_U_PSE,
  },
  {
    id: 'ncrfg_energa',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: AUDIT2_CATALOG_VERSION,
    operator_code: 'Energa',
    label_pl: 'Energa-Operator',
    description_pl: 'IRiESD Energa-Operator. Lokalne wymagania NC RfG dla przyłączeń SN/nN.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_energa_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
    ...C_FACTORS_MV,
    sk_min_to_p_ratio_by_module: NC_RFG_SK_RATIOS,
    ...Q_U_DEFAULTS,
  },
  {
    id: 'ncrfg_tauron',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: AUDIT2_CATALOG_VERSION,
    operator_code: 'Tauron',
    label_pl: 'Tauron Dystrybucja',
    description_pl: 'IRiESD Tauron Dystrybucja. Profil dla Polski południowej.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_tauron_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
    ...C_FACTORS_MV,
    sk_min_to_p_ratio_by_module: NC_RFG_SK_RATIOS,
    ...Q_U_DEFAULTS,
  },
  {
    id: 'ncrfg_enea',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: AUDIT2_CATALOG_VERSION,
    operator_code: 'Enea',
    label_pl: 'Enea Operator',
    description_pl: 'IRiESD Enea Operator. Profil dla Polski zachodniej i centralnej.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_enea_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
    ...C_FACTORS_MV,
    sk_min_to_p_ratio_by_module: NC_RFG_SK_RATIOS,
    ...Q_U_DEFAULTS,
  },
  {
    id: 'ncrfg_pge',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: AUDIT2_CATALOG_VERSION,
    operator_code: 'PGE',
    label_pl: 'PGE Dystrybucja',
    description_pl: 'IRiESD PGE Dystrybucja. Profil bazowy ze zwiększonym wymogiem dla HVRT.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_pge_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
    ...C_FACTORS_MV,
    sk_min_to_p_ratio_by_module: NC_RFG_SK_RATIOS,
    ...Q_U_DEFAULTS,
  },
]);

// =============================================================================
// 2. LVRT / HVRT curve catalogs
// =============================================================================

export interface RideThroughCurvePoint {
  readonly time_s: number;
  readonly voltage_pu: number;
}

export interface LvrtCurveItem {
  readonly id: string;
  readonly catalog_namespace: 'lvrt_curve';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly operator_code: 'PSE' | 'Energa' | 'Tauron' | 'Enea' | 'PGE';
  readonly module_type: 'A' | 'B' | 'C' | 'D';
  readonly envelope: readonly RideThroughCurvePoint[];
  readonly source: 'NC_RfG_Annex_II' | 'IRiESD' | 'IRiESP';
}

export interface HvrtCurveItem {
  readonly id: string;
  readonly catalog_namespace: 'hvrt_curve';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly operator_code: 'PSE' | 'Energa' | 'Tauron' | 'Enea' | 'PGE';
  readonly module_type: 'A' | 'B' | 'C' | 'D';
  readonly envelope: readonly RideThroughCurvePoint[];
  readonly source: 'NC_RfG_Annex_II' | 'IRiESD' | 'IRiESP';
}

const LVRT_BASE_PSE: RideThroughCurvePoint[] = [
  { time_s: 0, voltage_pu: 0.05 },
  { time_s: 0.15, voltage_pu: 0.15 },
  { time_s: 0.7, voltage_pu: 0.5 },
  { time_s: 1.5, voltage_pu: 0.85 },
  { time_s: 3.0, voltage_pu: 0.9 },
];

const HVRT_BASE_PSE: RideThroughCurvePoint[] = [
  { time_s: 0, voltage_pu: 1.3 },
  { time_s: 0.06, voltage_pu: 1.25 },
  { time_s: 0.5, voltage_pu: 1.15 },
  { time_s: 3.0, voltage_pu: 1.1 },
  { time_s: 10.0, voltage_pu: 1.05 },
];

function offsetCurve(
  base: readonly RideThroughCurvePoint[],
  delta: number,
): RideThroughCurvePoint[] {
  return base.map((p) => ({
    time_s: p.time_s,
    voltage_pu: Math.max(0, Math.min(1.5, p.voltage_pu + delta)),
  }));
}

export const LVRT_CURVE_CATALOG: ReadonlyArray<LvrtCurveItem> = Object.freeze([
  {
    id: 'lvrt_pse_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT — PSE NC RfG, moduł B',
    operator_code: 'PSE',
    module_type: 'B',
    envelope: LVRT_BASE_PSE,
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'lvrt_energa_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT — Energa-Operator, moduł B',
    operator_code: 'Energa',
    module_type: 'B',
    envelope: offsetCurve(LVRT_BASE_PSE, 0.02),
    source: 'IRiESD',
  },
  {
    id: 'lvrt_tauron_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT — Tauron Dystrybucja, moduł B',
    operator_code: 'Tauron',
    module_type: 'B',
    envelope: LVRT_BASE_PSE,
    source: 'IRiESD',
  },
  {
    id: 'lvrt_enea_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT - Enea Operator, moduł B',
    operator_code: 'Enea',
    module_type: 'B',
    envelope: LVRT_BASE_PSE,
    source: 'IRiESD',
  },
  {
    id: 'lvrt_pge_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT — PGE Dystrybucja, moduł B',
    operator_code: 'PGE',
    module_type: 'B',
    envelope: offsetCurve(LVRT_BASE_PSE, 0.02),
    source: 'IRiESD',
  },
  // Naprawa eng.7: dodatkowe krzywe LVRT dla modułów C/D PSE.
  {
    id: 'lvrt_pse_c',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT — PSE NC RfG, moduł C (10-50 MW)',
    operator_code: 'PSE',
    module_type: 'C',
    // Moduł C wymaga przetrwania zwarcia z U=0 przez 150 ms (więcej niż B).
    envelope: [
      { time_s: 0, voltage_pu: 0.00 },
      { time_s: 0.15, voltage_pu: 0.05 },
      { time_s: 0.7, voltage_pu: 0.5 },
      { time_s: 1.5, voltage_pu: 0.85 },
      { time_s: 3.0, voltage_pu: 0.9 },
    ],
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'lvrt_pse_d',
    catalog_namespace: 'lvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'LVRT — PSE NC RfG, moduł D (>50 MW)',
    operator_code: 'PSE',
    module_type: 'D',
    // Moduł D wymaga przetrwania zwarcia z U=0 przez 250 ms.
    envelope: [
      { time_s: 0, voltage_pu: 0.00 },
      { time_s: 0.25, voltage_pu: 0.00 },
      { time_s: 0.7, voltage_pu: 0.4 },
      { time_s: 1.5, voltage_pu: 0.85 },
      { time_s: 3.0, voltage_pu: 0.9 },
    ],
    source: 'NC_RfG_Annex_II',
  },
]);

export const HVRT_CURVE_CATALOG: ReadonlyArray<HvrtCurveItem> = Object.freeze([
  {
    id: 'hvrt_pse_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT — PSE NC RfG, moduł B',
    operator_code: 'PSE',
    module_type: 'B',
    envelope: HVRT_BASE_PSE,
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'hvrt_pse_c',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT — PSE NC RfG, moduł C (10-50 MW, surowsze wymagania)',
    operator_code: 'PSE',
    module_type: 'C',
    // Moduł C ma surowsze wymagania (kontynuacja pracy do U > 1.30 pu krócej).
    envelope: offsetCurve(HVRT_BASE_PSE, 0.02),
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'hvrt_pse_d',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT — PSE NC RfG, moduł D (>50 MW, najwyższe wymagania)',
    operator_code: 'PSE',
    module_type: 'D',
    envelope: offsetCurve(HVRT_BASE_PSE, 0.03),
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'hvrt_energa_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT — Energa-Operator, moduł B',
    operator_code: 'Energa',
    module_type: 'B',
    envelope: offsetCurve(HVRT_BASE_PSE, -0.01),
    source: 'IRiESD',
  },
  {
    id: 'hvrt_tauron_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT — Tauron Dystrybucja, moduł B',
    operator_code: 'Tauron',
    module_type: 'B',
    envelope: HVRT_BASE_PSE,
    source: 'IRiESD',
  },
  {
    id: 'hvrt_enea_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT - Enea Operator, moduł B',
    operator_code: 'Enea',
    module_type: 'B',
    envelope: HVRT_BASE_PSE,
    source: 'IRiESD',
  },
  {
    id: 'hvrt_pge_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'HVRT — PGE Dystrybucja, moduł B',
    operator_code: 'PGE',
    module_type: 'B',
    envelope: offsetCurve(HVRT_BASE_PSE, -0.02),
    source: 'IRiESD',
  },
]);

// =============================================================================
// 2b. PfCurveCatalog (Naprawa eng.9 — audyt OZE: regulacja P(f))
// =============================================================================
//
// PROWENIENCJA (karta K-Q, 2026-08-14) — mirror wyrównany do stanu backendu.
// Pozycje tego katalogu przypisywały KONKRETNE NASTAWY imiennie wskazanym
// operatorom i typom modułu NC RfG („PSE NC RfG moduł B / C / D",
// „Energa-Operator", „Enea Operator", „Tauron Dystrybucja"). Tekst
// rozporządzenia (UE) 2016/631 sprawdzono u źródła i ono TAKICH NASTAW NIE
// PRZYPISUJE: art. 13 ust. 2 podaje statyzm jako NASTAWIALNY w przedziale
// 2-12% oraz próg częstotliwości nastawialny między 50,2 a 50,5 Hz. Statyzmy
// 4% i 3% „dla modułu C i D" były zgadnięte, a strefy nieczułości 0,15 Hz
// i 0,10 Hz były PONIŻEJ normatywnego minimum — czyli sprzeczne z normą, na
// którą pozycja się powoływała. Pozycje operatorskie nie różniły się od
// pierwszej ANI JEDNĄ liczbą; istniały wyłącznie po to, by nieść cudze imię.
//
// Stan po naprawie (identyczny z backendem — autorytetem danych): pozycja jest
// WARIANTEM NASTAWY, który projektant wybiera, nazwanym swoim statyzmem.
// Granice pochodzą z rozporządzenia i są egzekwowane po stronie backendu.
// Źródło: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0631

export interface PfCurveItem {
  readonly id: string;
  readonly catalog_namespace: 'p_f_curve';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly f_ref_hz: number;
  /** Statyzm [%] — parametr DEFINIUJĄCY wariant, w granicach art. 13 ust. 2 (2-12%). */
  readonly droop_percent: number;
  readonly f_min_hz: number;
  readonly f_max_hz: number;
  /** Strefa nieczułości [Hz] — próg z art. 13 ust. 2 (0,2-0,5 Hz nad 50 Hz). */
  readonly deadband_hz: number;
}

export const PF_CURVE_CATALOG: ReadonlyArray<PfCurveItem> = Object.freeze([
  {
    id: 'pf_droop_5',
    catalog_namespace: 'p_f_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'P(f) · statyzm 5% · strefa nieczułości 0,2 Hz',
    f_ref_hz: 50.0,
    droop_percent: 5.0,
    f_min_hz: 47.5,
    f_max_hz: 51.5,
    deadband_hz: 0.2,
  },
  {
    id: 'pf_droop_4',
    catalog_namespace: 'p_f_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'P(f) · statyzm 4% · strefa nieczułości 0,2 Hz',
    f_ref_hz: 50.0,
    droop_percent: 4.0,
    f_min_hz: 47.5,
    f_max_hz: 51.5,
    deadband_hz: 0.2,
  },
  {
    id: 'pf_droop_3',
    catalog_namespace: 'p_f_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'P(f) · statyzm 3% · strefa nieczułości 0,2 Hz',
    f_ref_hz: 50.0,
    droop_percent: 3.0,
    f_min_hz: 47.5,
    f_max_hz: 51.5,
    deadband_hz: 0.2,
  },
  {
    id: 'pf_droop_2',
    catalog_namespace: 'p_f_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'P(f) · statyzm 2% · strefa nieczułości 0,2 Hz (najostrzejszy nastawialny)',
    f_ref_hz: 50.0,
    droop_percent: 2.0,
    f_min_hz: 47.5,
    f_max_hz: 51.5,
    deadband_hz: 0.2,
  },
  {
    id: 'pf_droop_12',
    catalog_namespace: 'p_f_curve',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'P(f) · statyzm 12% · strefa nieczułości 0,5 Hz (najłagodniejszy nastawialny)',
    f_ref_hz: 50.0,
    droop_percent: 12.0,
    f_min_hz: 47.5,
    f_max_hz: 51.5,
    deadband_hz: 0.5,
  },
]);

// =============================================================================
// 3. LvVoltageLevelCatalog (multi-voltage nN)
// =============================================================================

export interface LvVoltageLevelItem {
  readonly id: string;
  readonly catalog_namespace: 'lv_voltage_level';
  readonly catalog_version: string;
  readonly nominal_kv: number;
  readonly label_pl: string;
  readonly typical_use_pl: string;
}

export const LV_VOLTAGE_LEVEL_CATALOG: ReadonlyArray<LvVoltageLevelItem> = Object.freeze([
  {
    id: 'lv_0_23kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: AUDIT2_CATALOG_VERSION,
    nominal_kv: 0.23,
    label_pl: '0,23 kV (jednofazowe nn)',
    typical_use_pl: 'Sieć jednofazowa odbiorców indywidualnych.',
  },
  {
    id: 'lv_0_4kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: AUDIT2_CATALOG_VERSION,
    nominal_kv: 0.4,
    label_pl: '0,4 kV (standard nn)',
    typical_use_pl: 'Standardowe rozdzielnice odbiorcze SN/nN.',
  },
  {
    id: 'lv_0_69kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: AUDIT2_CATALOG_VERSION,
    nominal_kv: 0.69,
    label_pl: '0,69 kV (przemysłowe nn)',
    typical_use_pl: 'Sieć przemysłowa, falowniki PV string-level.',
  },
  {
    id: 'lv_1kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: AUDIT2_CATALOG_VERSION,
    nominal_kv: 1.0,
    label_pl: '1 kV (specjalne nn)',
    typical_use_pl: 'PV/BESS klastrowe na 1 kV.',
  },
  {
    id: 'lv_6kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: AUDIT2_CATALOG_VERSION,
    nominal_kv: 6.0,
    label_pl: '6 kV (sieć przemysłowa SN dolna)',
    typical_use_pl: 'Sieć przemysłowa silnikowa 6 kV (SN dolne).',
  },
]);

// =============================================================================
// 4. ConnectionVariantCatalog (Naprawa B.2 — rozszerzony)
// =============================================================================

/**
 * Naprawa B.2 (audyt projektanta SN): rozszerzony catalog wariantów połączeń
 * o 3 dodatkowe punkty pozastacjonarne: ZK SN, słup rozgałęźny, mufa kablowa
 * (typowe dla małych farm PV / BESS przyłączonych do odgałęzienia).
 */
export interface ConnectionVariantItem {
  readonly id: string;
  readonly catalog_namespace: 'connection_variant';
  readonly side: 'SN' | 'nN' | 'dedicated_transformer' | 'at_zksn' | 'at_branch_pole' | 'at_cable_joint';
  readonly label_pl: string;
  readonly description_pl: string;
  readonly applicable_der_kinds: ReadonlyArray<'PV' | 'BESS' | 'FW'>;
  readonly required_objects_pl: ReadonlyArray<string>;
}

export const CONNECTION_VARIANT_CATALOG: ReadonlyArray<ConnectionVariantItem> = Object.freeze([
  {
    id: 'cv_sn',
    catalog_namespace: 'connection_variant',
    side: 'SN',
    label_pl: 'Po stronie SN — przez pole SN stacji',
    description_pl:
      'DER przyłączony bezpośrednio do szyny SN poprzez dedykowane pole SN. '
      + 'Wymaga rozdzielni SN i pola SN źródłowego (PV/BESS/FW).',
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    required_objects_pl: ['Pole SN źródłowe', 'Aparatura', 'Przekładniki', 'Zabezpieczenie'],
  },
  {
    id: 'cv_nn',
    catalog_namespace: 'connection_variant',
    side: 'nN',
    label_pl: 'Po stronie nN — do szyny nN stacji',
    description_pl:
      'DER przyłączony do szyny nN za pośrednictwem rozdzielnicy nN. '
      + 'Wymaga zgodności napięcia falownika/PCS z napięciem szyny nN.',
    applicable_der_kinds: ['PV', 'BESS'],
    required_objects_pl: ['Szyna nN', 'Pole odpływowe nN', 'Zabezpieczenie nN', 'Pomiar'],
  },
  {
    id: 'cv_dedicated',
    catalog_namespace: 'connection_variant',
    side: 'dedicated_transformer',
    label_pl: 'Przez transformator dedykowany',
    description_pl:
      'DER przyłączony przez transformator dedykowany. '
      + 'Stosowane gdy napięcie urządzenia nie pasuje do żadnej szyny stacji '
      + 'albo dla farm PV/FW > 1 MW wymagających izolacji galwanicznej.',
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    required_objects_pl: [
      'Transformator dedykowany',
      'Pole transformatorowe SN',
      'Kabel SN do transformatora',
      'Zabezpieczenia po obu stronach',
    ],
  },
  {
    id: 'cv_at_zksn',
    catalog_namespace: 'connection_variant',
    side: 'at_zksn',
    label_pl: 'Na złączu kablowym SN (ZK SN)',
    description_pl:
      'DER przyłączony do złącza kablowego SN poza stacją — typowe dla małych '
      + 'farm PV (200-500 kW) przyłączonych do odgałęzienia. Wymaga ZK SN '
      + 'z dedykowanym polem oraz zabezpieczenia kierunkowego.',
    applicable_der_kinds: ['PV', 'BESS'],
    required_objects_pl: [
      'ZK SN z polem dedykowanym',
      'Aparatura ZK SN',
      'Przekładniki na ZK SN',
      'Zabezpieczenie kierunkowe (67/67N)',
    ],
  },
  {
    id: 'cv_at_branch_pole',
    catalog_namespace: 'connection_variant',
    side: 'at_branch_pole',
    label_pl: 'Na słupie rozgałęźnym linii napowietrznej SN',
    description_pl:
      'DER przyłączony na słupie rozgałęźnym linii napowietrznej. Stosowane '
      + 'dla małych farm wiatrowych (1 turbina) lub PV przy linii napowietrznej. '
      + 'Wymaga rozłącznika napowietrznego + transformatora słupowego.',
    applicable_der_kinds: ['PV', 'FW'],
    required_objects_pl: [
      'Słup rozgałęźny',
      'Rozłącznik napowietrzny',
      'Transformator słupowy SN/nN',
      'Zabezpieczenie ziemnozwarciowe',
    ],
  },
  {
    id: 'cv_at_cable_joint',
    catalog_namespace: 'connection_variant',
    side: 'at_cable_joint',
    label_pl: 'Na mufie kablowej SN (T-joint)',
    description_pl:
      'DER przyłączony przez mufę kablową typu T (T-joint). Stosowane wyjątkowo '
      + 'dla mikroinstalacji PV przyłączonych bez dedykowanej rozdzielni — '
      + 'wymaga zatwierdzenia operatora z uwagi na trudności w zabezpieczeniach.',
    applicable_der_kinds: ['PV'],
    required_objects_pl: [
      'Mufa T-joint SN',
      'Kabel odgałęziający',
      'Transformator dedykowany',
      'Zabezpieczenie kierunkowe',
    ],
  },
]);

// =============================================================================
// 4b. MvNeutralGroundingCatalog (Naprawa B.1 — audyt projektanta SN)
// =============================================================================
//
// Punkt uziemienia neutralnego transformatora 110/SN (lub stacji SN-SN).
// Decyduje o impedancji Z₀ sieci SN i kształcie obliczeń SC1F/SC2FG.
//
// PROWENIENCJA (karta K-O, 2026-08-14) — usunięto dwa pola tej samej klasy, co
// zmyślone pasmo wkładki SN:
//   * `typical_ik1_a_range` — ZAKRES PRĄDU ZWARCIA DOZIEMNEGO bez źródła,
//     pokazywany użytkownikowi na dwóch ekranach jako „I_k1 typowo 5000-25000 A".
//     Liczba, na której projektant mógłby oprzeć dobór zabezpieczeń
//     ziemnozwarciowych, a która nie pochodziła znikąd. Prąd I_k1 tej sieci
//     wylicza solver SC1F z realnej impedancji Z₀ modelu — „typowy zakres"
//     z tabeli konkurował z wynikiem obliczeń i nie miał czym tego wygrać.
//   * `typical_operators_pl` — przypisanie praktyki ruchowej imiennie wskazanym
//     operatorom (PGE Dystrybucja, Energa-Operator, Tauron, Enea, „PSE GPZ")
//     bez cytatu z IRiESD. Bez konsumenta produkcyjnego.
// Imiona operatorów usunięto też z `description_pl`. Zostaje `r_ohm`/`x_ohm` —
// to parametr DEFINIUJĄCY wariant (widnieje w jego nazwie), czyli wybór
// projektanta, a nie cudza zmierzona własność.

export interface MvNeutralGroundingItem {
  readonly id: string;
  readonly catalog_namespace: 'mv_neutral_grounding';
  readonly catalog_version: string;
  readonly grounding_type: 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded';
  readonly label_pl: string;
  readonly description_pl: string;
  /** Rezystancja uziemienia [Ω] definiująca wariant (gdy resistor_grounded). */
  readonly r_ohm?: number;
  /** Reaktancja uziemienia [Ω] definiująca wariant (petersen_coil — Lp = 1/(3·ω·C₀)). */
  readonly x_ohm?: number;
}

export const MV_NEUTRAL_GROUNDING_CATALOG: ReadonlyArray<MvNeutralGroundingItem> = Object.freeze([
  {
    id: 'mng_isolated',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'isolated',
    label_pl: 'Sieć izolowana (bez uziemienia neutralnego)',
    description_pl:
      'Punkt neutralny transformatora 110/SN nie jest uziemiony. Prąd zwarcia '
      + '1-fazowego doziemnego jest ograniczony tylko pojemnością sieci.',
  },
  {
    id: 'mng_petersen',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'petersen_coil',
    label_pl: 'Sieć skompensowana (cewka Petersena PCK)',
    description_pl:
      'Punkt neutralny uziemiony przez dławik kompensacyjny (cewkę Petersena). '
      + 'Lp = 1 / (3·ω·C₀) gdzie C₀ jest pojemnością sieci. W stanie '
      + 'kompensacji prąd zwarcia doziemnego jest bliski zeru.',
  },
  {
    id: 'mng_resistor_low',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'resistor_grounded',
    label_pl: 'Sieć uziemiona przez rezystor — niski (R≈7 Ω)',
    description_pl:
      'Punkt neutralny uziemiony przez rezystor 7 Ω — ogranicza prąd zwarcia '
      + 'doziemnego na tyle, by pozostał wykrywalny przez 51N. Stosowane '
      + 'w sieciach kablowych miejskich.',
    r_ohm: 7,
  },
  {
    id: 'mng_resistor_medium',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'resistor_grounded',
    label_pl: 'Sieć uziemiona przez rezystor — średni (R≈40 Ω)',
    description_pl:
      'Punkt neutralny uziemiony przez rezystor 40 Ω. Kompromis między '
      + 'wykrywalnością zwarć a ochroną sprzętu. Stosowane w sieciach '
      + 'mieszanych kabel/napowietrzna.',
    r_ohm: 40,
  },
  {
    id: 'mng_directly',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'directly_grounded',
    label_pl: 'Sieć uziemiona bezpośrednio (Z=0)',
    description_pl:
      'Punkt neutralny uziemiony bezpośrednio. Ik1 maksymalne (porównywalne '
      + 'z Ik3). Rzadko stosowane w SN — głównie w przemysłowych sieciach '
      + 'specjalnych. Zwiększa wymagania na zabezpieczenia i sprzęt.',
  },
]);

// =============================================================================
// 5. StationTemplateCatalog (10 szablonów)
// =============================================================================

export interface StationTemplateItem {
  readonly id: string;
  readonly catalog_namespace: 'station_template';
  readonly label_pl: string;
  readonly description_pl: string;
  readonly topological_type: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly transformer_count: number;
  readonly nn_voltage_level_refs: readonly string[];
  readonly pre_configured_der_count: number;
  readonly applicable_when_pl: string;
}

export const STATION_TEMPLATE_CATALOG: ReadonlyArray<StationTemplateItem> = Object.freeze([
  {
    id: 'st_terminal_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja końcowa 1T',
    description_pl: 'Stacja końcowa z jednym transformatorem SN/nN, prosta odbiorcza.',
    topological_type: 'końcowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Standardowa stacja kontenerowa odbiorcza na końcu ciągu.',
  },
  {
    id: 'st_inline_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja przelotowa 1T',
    description_pl: 'Stacja przelotowa z jednym transformatorem; ciąg SN przechodzi.',
    topological_type: 'przelotowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Stacja na środku ciągu z odpływem nN.',
  },
  {
    id: 'st_branch_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja odgałęźna 1T',
    description_pl: 'Stacja odgałęźna z jednym transformatorem.',
    topological_type: 'odgałęźna',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Punkt odgałęzienia ciągu SN z odpływem.',
  },
  {
    id: 'st_sectional_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja sekcyjna 1T',
    description_pl: 'Stacja sekcyjna do podziału ciągu z jednym transformatorem.',
    topological_type: 'sekcyjna',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Punkt sekcjonowania ciągu z odpływem nN.',
  },
  {
    id: 'st_terminal_2t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja 2T (rezerwa)',
    description_pl: 'Stacja końcowa z dwoma transformatorami (rezerwa).',
    topological_type: 'końcowa',
    transformer_count: 2,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Stacja przemysłowa wymagająca rezerwy zasilania nN.',
  },
  {
    id: 'st_pv_sn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z PV po SN',
    description_pl: 'Stacja końcowa z PV przyłączonym przez dedykowane pole SN.',
    topological_type: 'końcowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'Farma PV o mocy >500 kW przyłączona po stronie SN.',
  },
  {
    id: 'st_pv_nn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z PV po nN',
    description_pl: 'Stacja przelotowa z PV przyłączonym do szyny nN.',
    topological_type: 'przelotowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'PV mikroinstalacja lub mała farma do 500 kW.',
  },
  {
    id: 'st_bess_sn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z BESS po SN',
    description_pl: 'Stacja końcowa z magazynem energii po stronie SN.',
    topological_type: 'końcowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'Magazyn BESS >1 MW przyłączony do SN.',
  },
  {
    id: 'st_bess_nn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z BESS po nN',
    description_pl: 'Stacja przelotowa z BESS po stronie nN.',
    topological_type: 'przelotowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'Magazyn BESS lokalny <500 kW.',
  },
  {
    id: 'st_industrial_multi',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja przemysłowa multi-voltage nN',
    description_pl:
      'Stacja przemysłowa z wieloma poziomami napięć nN (0,4 / 0,69 / 6 kV) i opcjonalnym BESS.',
    topological_type: 'przelotowa',
    transformer_count: 2,
    nn_voltage_level_refs: ['lv_0_4kV', 'lv_0_69kV', 'lv_6kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Zakład przemysłowy z silnikami 6 kV i odbiorami 0,4/0,69 kV.',
  },
]);

// =============================================================================
// 6. PV / BESS / FW device catalogs (mirror backendu)
// =============================================================================
// Te katalogi są mirrorami backendowego `mv_converter_catalog.py` — z niego
// pochodzą identyfikatory pozycji, moce znamionowe i oznaczenia wyrobu.
//
// PROWENIENCJA (karta K-Q, 2026-08-14). Mirror niósł pola, których backend NIE
// MA i których nie da się nikomu przypisać:
//   * `fault_current_capability_pu` — graniczny prąd zwarciowy falownika/turbiny
//     w jednostkach względnych, POKAZYWANY użytkownikowi jako „1,10 × In". Taką
//     liczbę podaje wyłącznie karta katalogowa konkretnego wyrobu; tu była
//     wpisana z ręki (a kreator dokładał do niej własną fabrykację: „BESS → 1,2,
//     wiatr → 1,1, reszta → 1,1"). Udział źródła w prądzie zwarcia liczy solver
//     z danych modelu, a nie ta tabela.
//   * `transient_short_circuit_pu` — to samo dla stanu przejściowego DFIG.
//   * `hub_height_m`, `rotor_diameter_m`, `generator_type` — dane mechaniczne
//     i typ generatora turbiny; backend ich nie niesie, w repo nie ma karty
//     producenta, a w UI nie miały konsumenta.
//   * `cycle_life` oraz imię producenta baterii — backend nie ma katalogu
//     baterii w ogóle, więc „BYD Battery-Box Pro" i „6000 cykli" nie miały
//     autorytetu; pozycja została tym, czym jest: oznaczeniem wariantu
//     (chemia + pojemność + napięcie DC), które projektant wybiera.
//
// Pozycje niosą teraz status weryfikacji i źródło DOKŁADNIE takie, jakie ma
// backend — czyli mówią wprost, że to profil referencyjny, a nie odczyt z karty
// katalogowej producenta.

/** Status i źródło pozycji — identyczne z `params` pozycji w backendzie. */
const PROFIL_REFERENCYJNY = {
  verification_status: 'REFERENCYJNY',
  source_reference: 'Katalog przeksztaltnikow MV-DESIGN-PRO / profil przemyslowy V1',
} as const;

export interface PvInverterItem {
  readonly id: string;
  readonly catalog_namespace: 'pv_inverter';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly manufacturer: string;
  readonly nominal_power_kw: number;
  readonly nominal_voltage_kv: number;
  readonly applicable_module_types: readonly ('A' | 'B' | 'C' | 'D')[];
  readonly verification_status: string;
  readonly source_reference: string;
}

export const PV_INVERTER_CATALOG: ReadonlyArray<PvInverterItem> = Object.freeze([
  {
    id: 'pv_inv_catalog_50',
    catalog_namespace: 'pv_inverter',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Pakiet katalogowy PV 50 (50 kW · 0,4 kV)',
    manufacturer: 'MV-DESIGN-PRO',
    nominal_power_kw: 50,
    nominal_voltage_kv: 0.4,
    applicable_module_types: ['A', 'B'],
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'pv_inv_sma_2500',
    catalog_namespace: 'pv_inverter',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'SMA Sunny Central 2500-EV (2 500 kW · 0,69 kV)',
    manufacturer: 'SMA',
    nominal_power_kw: 2500,
    nominal_voltage_kv: 0.69,
    applicable_module_types: ['B', 'C'],
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'pv_inv_huawei_185',
    catalog_namespace: 'pv_inverter',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Huawei SUN2000-185KTL (185 kW · 0,4 kV)',
    manufacturer: 'Huawei',
    nominal_power_kw: 185,
    nominal_voltage_kv: 0.4,
    applicable_module_types: ['A', 'B'],
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'pv_inv_system_1000',
    catalog_namespace: 'pv_inverter',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Pakiet katalogowy PV 1000 (1 000 kW · 0,69 kV)',
    manufacturer: 'MV-DESIGN-PRO',
    nominal_power_kw: 1000,
    nominal_voltage_kv: 0.69,
    applicable_module_types: ['B'],
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'pv_inv_fimer_3000',
    catalog_namespace: 'pv_inverter',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'FIMER PVS-3000-CSE (3 000 kW · 0,69 kV)',
    manufacturer: 'FIMER',
    nominal_power_kw: 3000,
    nominal_voltage_kv: 0.69,
    applicable_module_types: ['B', 'C'],
    ...PROFIL_REFERENCYJNY,
  },
]);

export interface BessPcsItem {
  readonly id: string;
  readonly catalog_namespace: 'bess_pcs';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly manufacturer: string;
  readonly nominal_power_kw: number;
  readonly nominal_voltage_kv: number;
  readonly four_quadrant: boolean;
  readonly grid_forming_capable: boolean;
  readonly verification_status: string;
  readonly source_reference: string;
}

export const BESS_PCS_CATALOG: ReadonlyArray<BessPcsItem> = Object.freeze([
  {
    id: 'bess_pcs_sma_2200',
    catalog_namespace: 'bess_pcs',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'SMA Sunny Central Storage 2200 (2 200 kW · 0,69 kV)',
    manufacturer: 'SMA',
    nominal_power_kw: 2200,
    nominal_voltage_kv: 0.69,
    four_quadrant: true,
    grid_forming_capable: true,
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'bess_pcs_abb_500',
    catalog_namespace: 'bess_pcs',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'ABB PCS100 ESS (500 kW · 0,4 kV)',
    manufacturer: 'ABB',
    nominal_power_kw: 500,
    nominal_voltage_kv: 0.4,
    four_quadrant: true,
    grid_forming_capable: false,
    ...PROFIL_REFERENCYJNY,
  },
]);

export interface BessBatteryItem {
  readonly id: string;
  readonly catalog_namespace: 'bess_battery';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly chemistry: 'LFP' | 'NMC' | 'LTO';
  readonly capacity_kwh: number;
  readonly nominal_voltage_v: number;
}

export const BESS_BATTERY_CATALOG: ReadonlyArray<BessBatteryItem> = Object.freeze([
  {
    id: 'bess_bat_byd_2880',
    catalog_namespace: 'bess_battery',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Bateria LFP 2 880 kWh · 1 230 V DC',
    chemistry: 'LFP',
    capacity_kwh: 2880,
    nominal_voltage_v: 1230,
  },
  {
    id: 'bess_bat_catl_5000',
    catalog_namespace: 'bess_battery',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Bateria LFP 5 000 kWh · 1 500 V DC',
    chemistry: 'LFP',
    capacity_kwh: 5000,
    nominal_voltage_v: 1500,
  },
]);

export interface WindTurbineItem {
  readonly id: string;
  readonly catalog_namespace: 'wind_turbine';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly manufacturer: string;
  readonly model_code: string;
  readonly nominal_power_kw: number;
  readonly verification_status: string;
  readonly source_reference: string;
}

export const WIND_TURBINE_CATALOG: ReadonlyArray<WindTurbineItem> = Object.freeze([
  {
    id: 'wt_vestas_v117_3450',
    catalog_namespace: 'wind_turbine',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Vestas V117-3.45 MW (3 450 kW)',
    manufacturer: 'Vestas',
    model_code: 'V117-3450',
    nominal_power_kw: 3450,
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'wt_siemens_swt_2300_113',
    catalog_namespace: 'wind_turbine',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Siemens SWT-2.3-113 (2 300 kW)',
    manufacturer: 'Siemens',
    model_code: 'SWT-2.3-113',
    nominal_power_kw: 2300,
    ...PROFIL_REFERENCYJNY,
  },
  {
    id: 'wt_ge_158_5500',
    catalog_namespace: 'wind_turbine',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'GE Cypress 5.5-158 (5 500 kW)',
    manufacturer: 'GE Renewable',
    model_code: 'Cypress-5500-158',
    nominal_power_kw: 5500,
    ...PROFIL_REFERENCYJNY,
  },
]);

// =============================================================================
// 7. DerFaultCurrentDataCatalog (Naprawa A.1, A.3, A.4 — audyt profesora)
// =============================================================================
//
// Składowe symetryczne (R₁/X₁, R₂/X₂, R₀/X₀) + Z₀/Z₁ ratio + κ + i_max_pu.
// Wymagane dla obliczeń:
//   - SC1F (zwarcie 1-fazowe doziemne) — IEC 60909-3
//   - SC2FG (zwarcie 2-fazowe z ziemią)
//   - ip (peak short-circuit) przez κ = 1.02 + 0.98·exp(-3·R/X)
//
// Pozycje w katalogu są skojarzone z konkretnym device_catalog_ref poprzez
// pole `applicable_device_ids`.
//
// PROWENIENCJA (karta K-Q, 2026-08-14). Pozycje nosiły w nazwie KONKRETNY WYRÓB
// („SMA SC2500-EV", „ABB PCS100 ESS", „Vestas V117") i deklarowały jego graniczny
// prąd zwarciowy — a więc przypisywały imiennemu producentowi liczby, których
// żadna karta katalogowa nie potwierdzała. Pole `fault_current_capability_pu`
// usunięto (to ta sama dana, którą karta usunęła z katalogów urządzeń), a nazwy
// są dziś opisem WARIANTU MODELU ZWARCIOWEGO, nazwanym swoimi parametrami.
// Składowe symetryczne zostają jako parametry DEFINIUJĄCE wariant, który
// projektant wybiera; do projektu wykonawczego wymagają potwierdzenia kartą
// przekształtnika — `applicable_device_ids` jest regułą domyślnego doboru, a nie
// deklaracją, że tak zmierzył producent.

export interface DerFaultCurrentDataItem {
  readonly id: string;
  readonly catalog_namespace: 'der_fault_current_data';
  readonly catalog_version: string;
  readonly applicable_device_ids: readonly string[];
  readonly label_pl: string;
  /** Składowe kolejności dodatniej (R₁, X₁) per unit. */
  readonly r1_pu: number;
  readonly x1_pu: number;
  /** Składowe kolejności ujemnej (R₂, X₂). Domyślnie ≈ R₁/X₁ dla falowników. */
  readonly r2_pu: number;
  readonly x2_pu: number;
  /** Składowe kolejności zerowej (R₀, X₀). */
  readonly r0_pu: number;
  readonly x0_pu: number;
  /** Stosunek Z₀/Z₁ — kluczowe dla SC1F. */
  readonly z0_z1_ratio: number;
  /** Stosunek R/X w punkcie generowania prądu zwarciowego. Dla κ. */
  readonly rx_ratio_at_terminal: number;
  /** Model contribution: voltage-source-behind-Zth albo current-source-limited. */
  readonly contribution_model: 'voltage_source' | 'current_source_limited';
}

export const DER_FAULT_CURRENT_DATA_CATALOG: ReadonlyArray<DerFaultCurrentDataItem> = Object.freeze([
  {
    id: 'fcd_pv_inv_sma_2500',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_sma_2500'],
    label_pl: 'Model zwarciowy falownika PV · źródło prądowe z ograniczeniem · Z₀/Z₁ = 2,2',
    r1_pu: 0.05,
    x1_pu: 0.18,
    r2_pu: 0.05,
    x2_pu: 0.18,
    r0_pu: 0.10,
    x0_pu: 0.40,
    z0_z1_ratio: 2.2,
    rx_ratio_at_terminal: 0.28,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_pv_inv_huawei_185',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_huawei_185'],
    label_pl: 'Model zwarciowy falownika PV nN · źródło prądowe z ograniczeniem · Z₀/Z₁ = 2,1',
    r1_pu: 0.04,
    x1_pu: 0.15,
    r2_pu: 0.04,
    x2_pu: 0.15,
    r0_pu: 0.08,
    x0_pu: 0.32,
    z0_z1_ratio: 2.1,
    rx_ratio_at_terminal: 0.27,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_pv_inv_fimer_3000',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_fimer_3000'],
    label_pl: 'Model zwarciowy falownika PV dużej mocy · źródło prądowe · Z₀/Z₁ = 2,1',
    r1_pu: 0.05,
    x1_pu: 0.20,
    r2_pu: 0.05,
    x2_pu: 0.20,
    r0_pu: 0.11,
    x0_pu: 0.42,
    z0_z1_ratio: 2.1,
    rx_ratio_at_terminal: 0.25,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_bess_pcs_sma_2200',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_sma_2200'],
    label_pl: 'Model zwarciowy PCS magazynu · przekształtnik tworzący napięcie · Z₀/Z₁ = 2,0',
    r1_pu: 0.04,
    x1_pu: 0.16,
    r2_pu: 0.04,
    x2_pu: 0.16,
    r0_pu: 0.08,
    x0_pu: 0.32,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.25,
    contribution_model: 'voltage_source',
  },
  {
    id: 'fcd_bess_pcs_abb_500',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_abb_500'],
    label_pl: 'Model zwarciowy PCS magazynu · przekształtnik podążający · Z₀/Z₁ = 2,0',
    r1_pu: 0.05,
    x1_pu: 0.18,
    r2_pu: 0.05,
    x2_pu: 0.18,
    r0_pu: 0.10,
    x0_pu: 0.36,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.28,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_wt_vestas_v117_3450',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_vestas_v117_3450'],
    label_pl: 'Model zwarciowy turbiny z pełnym przekształtnikiem · Z₀/Z₁ = 2,0',
    r1_pu: 0.06,
    x1_pu: 0.20,
    r2_pu: 0.06,
    x2_pu: 0.20,
    r0_pu: 0.12,
    x0_pu: 0.40,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.30,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_wt_siemens_swt_2300',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_siemens_swt_2300_113'],
    label_pl: 'Model zwarciowy turbiny dwustronnie zasilanej (DFIG) · Z₀/Z₁ = 2,0',
    r1_pu: 0.025,
    x1_pu: 0.12,
    r2_pu: 0.025,
    x2_pu: 0.12,
    r0_pu: 0.05,
    x0_pu: 0.24,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.21,
    contribution_model: 'voltage_source',
  },
  {
    id: 'fcd_wt_ge_158_5500',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_ge_158_5500'],
    label_pl: 'Model zwarciowy turbiny z pełnym przekształtnikiem, duża moc · Z₀/Z₁ = 2,0',
    r1_pu: 0.06,
    x1_pu: 0.20,
    r2_pu: 0.06,
    x2_pu: 0.20,
    r0_pu: 0.12,
    x0_pu: 0.40,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.30,
    contribution_model: 'current_source_limited',
  },
]);

// =============================================================================
// 7b. BlockTransformerCatalog (Naprawa B.5 — audyt projektanta SN)
// =============================================================================
//
// PROWENIENCJA (karta K-Q, 2026-08-14) — mirror wyrównany do stanu backendu.
// Pozycje niosły własny komplet danych elektrycznych transformatora oraz imię
// producenta (ABB / Siemens / Schneider) doklejone do liczb, których żadna karta
// katalogowa nie potwierdzała. Backend naprawił to przez USUNIĘCIE DRUGIEJ KOPII:
// pozycja wskazuje typ w katalogu transformatorów (`transformer_type_ref`) i
// wszystkie liczby pochodzą stamtąd razem z proweniencją tego typu
// (`source_reference` + `verification_status`, obie widoczne poniżej).
//
// Dwie pozycje bez odpowiednika z proweniencją zniknęły: 3450 kVA (katalog ma
// 3,15 i 4,0 MVA — podstawienie sąsiedniej mocy byłoby fałszowaniem znamionu)
// oraz 30/15 kV 30 MVA (katalog nie ma żadnego typu na 30 kV). W zamian weszły
// dwie oparte na realnych typach: 4 MVA oraz SN/SN 15/6,3 kV 10 MVA.
//
// `applicable_der_kinds` obejmuje wszystkie trzy rodzaje źródeł, bo typoszereg
// w katalogu transformatorów sam nosi nazwę „Dyn11 PV/BESS/FW"; o dopasowaniu
// decyduje napięcie i moc, nie rodzaj źródła.

export interface BlockTransformerItem {
  readonly id: string;
  readonly catalog_namespace: 'block_transformer';
  readonly catalog_version: string;
  readonly label_pl: string;
  /** Typ w katalogu transformatorów — JEDYNE źródło danych elektrycznych. */
  readonly transformer_type_ref: string;
  readonly sn_kva: number;
  readonly hv_kv: number;
  readonly lv_kv: number;
  readonly uk_percent: number;
  readonly pk_kw: number;
  readonly p0_kw: number;
  readonly i0_percent: number;
  readonly vector_group: string;
  /** Transformator SN/SN — strona dolna powyżej 1 kV. */
  readonly is_mv_to_mv: boolean;
  readonly applicable_der_kinds: ReadonlyArray<'PV' | 'BESS' | 'FW'>;
  /** Izolacja galwaniczna wynika z grupy połączeń. */
  readonly galvanic_isolation: boolean;
  /** Proweniencja danych — wprost z pozycji katalogu transformatorów. */
  readonly source_reference: string;
  readonly verification_status: string;
}

export const BLOCK_TRANSFORMER_CATALOG: ReadonlyArray<BlockTransformerItem> = Object.freeze([
  {
    id: 'btr_pv_15_069_800',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,69 kV · 800 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-0p69-0p8mva-dyn11-inverter',
    sn_kva: 800,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 8.8,
    p0_kw: 1.36,
    i0_percent: 1.2,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
  {
    id: 'btr_pv_15_069_1000',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,69 kV · 1000 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-0p69-1mva-dyn11-inverter',
    sn_kva: 1000,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 11,
    p0_kw: 1.7,
    i0_percent: 1.2,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
  {
    id: 'btr_pv_15_069_1250',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,69 kV · 1250 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-0p69-1p25mva-dyn11-inverter',
    sn_kva: 1250,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 13.75,
    p0_kw: 2.12,
    i0_percent: 1.2,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
  {
    id: 'btr_pv_15_069_1600',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,69 kV · 1600 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-0p69-1p6mva-dyn11-inverter',
    sn_kva: 1600,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 17.6,
    p0_kw: 2.72,
    i0_percent: 1.2,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
  {
    id: 'btr_pv_15_069_2500',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,69 kV · 2500 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-0p69-2p5mva-dyn11-inverter',
    sn_kva: 2500,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 6,
    pk_kw: 26.25,
    p0_kw: 3.75,
    i0_percent: 1,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
  {
    id: 'btr_pv_15_04_1000',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,4 kV · 1000 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-04-1000kva-dyn11',
    sn_kva: 1000,
    hv_kv: 15,
    lv_kv: 0.4,
    uk_percent: 6,
    pk_kw: 11,
    p0_kw: 1.7,
    i0_percent: 1.2,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog',
    verification_status: 'ZWERYFIKOWANY',
  },
  {
    id: 'btr_bess_15_04_1600',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,4 kV · 1600 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-04-1600kva-dyn11',
    sn_kva: 1600,
    hv_kv: 15,
    lv_kv: 0.4,
    uk_percent: 6,
    pk_kw: 17,
    p0_kw: 2.5,
    i0_percent: 0.9,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'PN-EN 60076-11:2004 Tabl.A + UE 2019/1783 Tier 2 / ABB RESIBLOC katalog',
    verification_status: 'ZWERYFIKOWANY',
  },
  {
    id: 'btr_der_15_069_4000',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany 15/0,69 kV · 4000 kVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-0p69-4mva-dyn11-inverter',
    sn_kva: 4000,
    hv_kv: 15,
    lv_kv: 0.69,
    uk_percent: 7,
    pk_kw: 38,
    p0_kw: 4.8,
    i0_percent: 0.8,
    vector_group: 'Dyn11',
    is_mv_to_mv: false,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
  {
    id: 'btr_der_15_063_10000',
    catalog_namespace: 'block_transformer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Transformator dedykowany SN/SN 15/6,3 kV · 10 MVA · Dyn11',
    transformer_type_ref: 'tr-sn-nn-15-6p3-10mva-dyn11-inverter',
    sn_kva: 10000,
    hv_kv: 15,
    lv_kv: 6.3,
    uk_percent: 8,
    pk_kw: 88,
    p0_kw: 10,
    i0_percent: 0.7,
    vector_group: 'Dyn11',
    is_mv_to_mv: true,
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    galvanic_isolation: true,
    source_reference: 'Referencyjny typoszereg transformatorow blokowych dla falownikow PV/BESS/FW',
    verification_status: 'REFERENCYJNY',
  },
]);

// =============================================================================
// 8. DerDynamicModelCatalog (Naprawa A.5 — audyt profesora)
// =============================================================================
//
// Modele dynamiczne dla solvera RMS time-domain (FRT/HVRT, stabilność).

export interface DerDynamicModelItem {
  readonly id: string;
  readonly catalog_namespace: 'der_dynamic_model';
  readonly catalog_version: string;
  readonly applicable_device_ids: readonly string[];
  readonly label_pl: string;
  readonly model_type:
    | 'pv_grid_following'
    | 'pv_grid_forming'
    | 'bess_grid_following'
    | 'bess_grid_forming'
    | 'wt_pmsg_full_converter'
    | 'wt_dfig'
    | 'wt_scig';
  /** Czas reakcji falownika/PCS [ms]. */
  readonly response_time_ms: number;
  /** Współczynnik wsparcia napięciowego k(Iq/ΔU) podczas FRT — typowo 2-6. */
  readonly k_factor_iq_over_du: number;
  /** Maksymalny prąd reaktywny podczas FRT [pu]. */
  readonly iq_max_during_fault_pu: number;
  /** Stopień regenenracji P po zakończeniu FRT [pu/s]. */
  readonly p_recovery_rate_pu_per_s: number;
  /** Czas filtru wykrywania zaniku napięcia [ms]. */
  readonly voltage_drop_detection_time_ms: number;
}

export const DER_DYNAMIC_MODEL_CATALOG: ReadonlyArray<DerDynamicModelItem> = Object.freeze([
  {
    id: 'dyn_pv_gfl_typical',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_sma_2500', 'pv_inv_huawei_185', 'pv_inv_fimer_3000'],
    label_pl: 'PV grid-following typowy (NC RfG: k=2, t_resp=20ms)',
    model_type: 'pv_grid_following',
    response_time_ms: 20,
    k_factor_iq_over_du: 2.0,
    iq_max_during_fault_pu: 1.0,
    p_recovery_rate_pu_per_s: 5.0,
    voltage_drop_detection_time_ms: 10,
  },
  {
    id: 'dyn_bess_gfm_4q',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_sma_2200'],
    label_pl: 'BESS grid-forming 4Q (k=4, t_resp=5ms)',
    model_type: 'bess_grid_forming',
    response_time_ms: 5,
    k_factor_iq_over_du: 4.0,
    iq_max_during_fault_pu: 1.2,
    p_recovery_rate_pu_per_s: 10.0,
    voltage_drop_detection_time_ms: 5,
  },
  {
    id: 'dyn_bess_gfl_4q',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_abb_500'],
    label_pl: 'BESS grid-following 4Q (k=2.5, t_resp=15ms)',
    model_type: 'bess_grid_following',
    response_time_ms: 15,
    k_factor_iq_over_du: 2.5,
    iq_max_during_fault_pu: 1.0,
    p_recovery_rate_pu_per_s: 8.0,
    voltage_drop_detection_time_ms: 10,
  },
  {
    id: 'dyn_wt_pmsg_full',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_vestas_v117_3450', 'wt_ge_158_5500'],
    label_pl: 'WT PMSG full-converter (k=2, t_resp=30ms)',
    model_type: 'wt_pmsg_full_converter',
    response_time_ms: 30,
    k_factor_iq_over_du: 2.0,
    iq_max_during_fault_pu: 1.0,
    p_recovery_rate_pu_per_s: 3.0,
    voltage_drop_detection_time_ms: 15,
  },
  {
    id: 'dyn_wt_dfig',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_siemens_swt_2300_113'],
    label_pl: 'WT DFIG (transient 4-6×In, k=2.5, t_resp=20ms)',
    model_type: 'wt_dfig',
    response_time_ms: 20,
    k_factor_iq_over_du: 2.5,
    iq_max_during_fault_pu: 1.1,
    p_recovery_rate_pu_per_s: 4.0,
    voltage_drop_detection_time_ms: 10,
  },
]);

// =============================================================================
// 9. Helpery selektora
// =============================================================================

/** Filtruje katalogi po polu module_type/operator_code. */
export function selectLvrtCurvesForProfile(profileId: string): readonly LvrtCurveItem[] {
  const profile = NC_RFG_PROFILE_CATALOG.find((p) => p.id === profileId);
  if (!profile) return LVRT_CURVE_CATALOG;
  return LVRT_CURVE_CATALOG.filter((c) => c.operator_code === profile.operator_code);
}

export function selectHvrtCurvesForProfile(profileId: string): readonly HvrtCurveItem[] {
  const profile = NC_RFG_PROFILE_CATALOG.find((p) => p.id === profileId);
  if (!profile) return HVRT_CURVE_CATALOG;
  return HVRT_CURVE_CATALOG.filter((c) => c.operator_code === profile.operator_code);
}

/** Filtruje warianty przyłączenia po rodzaju DER. */
export function selectConnectionVariantsForKind(
  kind: 'PV' | 'BESS' | 'FW',
): readonly ConnectionVariantItem[] {
  return CONNECTION_VARIANT_CATALOG.filter((v) => v.applicable_der_kinds.includes(kind));
}

/** Filtruje katalog falowników PV po napięciu. */
export function selectPvInvertersForVoltage(voltageKv: number): readonly PvInverterItem[] {
  return PV_INVERTER_CATALOG.filter(
    (i) => Math.abs(i.nominal_voltage_kv - voltageKv) < 0.01,
  );
}

/** Filtruje katalog PCS BESS po napięciu. */
export function selectBessPcsForVoltage(voltageKv: number): readonly BessPcsItem[] {
  return BESS_PCS_CATALOG.filter((p) => Math.abs(p.nominal_voltage_kv - voltageKv) < 0.01);
}

/** Pobiera szczegóły profilu NC RfG. */
export function getNcRfgProfile(id: string): NcRfgProfileItem | null {
  return NC_RFG_PROFILE_CATALOG.find((p) => p.id === id) ?? null;
}

/** Pobiera szczegóły poziomu napięcia nN. */
export function getLvVoltageLevel(id: string): LvVoltageLevelItem | null {
  return LV_VOLTAGE_LEVEL_CATALOG.find((l) => l.id === id) ?? null;
}

/** Polski label dla connection_side (w tym pozastacjonarne — Naprawa B.2). */
export function getConnectionSideLabelPl(
  side: 'SN' | 'nN' | 'dedicated_transformer' | 'at_zksn' | 'at_branch_pole' | 'at_cable_joint',
): string {
  const item = CONNECTION_VARIANT_CATALOG.find((v) => v.side === side);
  return item?.label_pl ?? side;
}

/** Naprawa B.1: pobiera szczegóły uziemienia neutralnego stacji. */
export function getMvNeutralGrounding(id: string): MvNeutralGroundingItem | null {
  return MV_NEUTRAL_GROUNDING_CATALOG.find((g) => g.id === id) ?? null;
}

/**
 * Naprawa B.5: filtruje transformatory dedykowane dla danej kombinacji DER + napięć.
 * Zwraca pozycje katalogowe pasujące do device_voltage / station_voltage.
 */
export function selectBlockTransformersForDer(args: {
  readonly derKind: 'PV' | 'BESS' | 'FW';
  readonly hvKv?: number;
  readonly lvKv?: number;
  readonly requiresGalvanicIsolation?: boolean;
}): readonly BlockTransformerItem[] {
  return BLOCK_TRANSFORMER_CATALOG.filter((btr) => {
    if (!btr.applicable_der_kinds.includes(args.derKind)) return false;
    if (args.hvKv !== undefined && Math.abs(btr.hv_kv - args.hvKv) > 0.5) return false;
    if (args.lvKv !== undefined && Math.abs(btr.lv_kv - args.lvKv) > 0.05) return false;
    if (args.requiresGalvanicIsolation === true && !btr.galvanic_isolation) return false;
    return true;
  });
}

/** Pobiera transformator dedykowany po id. */
export function getBlockTransformer(id: string): BlockTransformerItem | null {
  return BLOCK_TRANSFORMER_CATALOG.find((b) => b.id === id) ?? null;
}

/** Naprawa A.1: pobiera dane zwarciowe dla danego device_id. */
export function getFaultCurrentDataForDevice(
  deviceId: string,
): DerFaultCurrentDataItem | null {
  return (
    DER_FAULT_CURRENT_DATA_CATALOG.find((d) => d.applicable_device_ids.includes(deviceId)) ?? null
  );
}

/** Naprawa A.5: pobiera model dynamiczny dla danego device_id. */
export function getDynamicModelForDevice(deviceId: string): DerDynamicModelItem | null {
  return DER_DYNAMIC_MODEL_CATALOG.find((d) => d.applicable_device_ids.includes(deviceId)) ?? null;
}

/**
 * Naprawa A.3: oblicza współczynnik κ (peak short-circuit factor) z R/X
 * zgodnie z IEC 60909-0 Sekcja 8.1.3 (metoda B):
 *
 *   κ = 1.02 + 0.98 · exp(-3 · R/X)
 *
 * Prąd udarowy ip = κ · √2 · Ik″.
 */
export function computeKappa(rx_ratio: number): number {
  if (rx_ratio < 0) return 1.0;
  return 1.02 + 0.98 * Math.exp(-3 * rx_ratio);
}

/**
 * Naprawa B.4: walidacja minimalnej Sk w PCC zgodnie z NC RfG Art. 17.
 * Zwraca obiekt z polami required_sk_mva (minimalna wymagana) + ok (boolean).
 */
export function validateMinSkAtPcc(args: {
  readonly profileRef: string | null;
  readonly moduleType: 'A' | 'B' | 'C' | 'D';
  readonly p_der_mw: number;
  readonly available_sk_mva: number | null;
}): { required_sk_mva: number | null; available_sk_mva: number | null; ok: boolean; ratio: number | null } {
  const profile = args.profileRef ? getNcRfgProfile(args.profileRef) : null;
  const ratio = profile?.sk_min_to_p_ratio_by_module[args.moduleType] ?? null;
  if (ratio === null) {
    return { required_sk_mva: null, available_sk_mva: args.available_sk_mva, ok: true, ratio: null };
  }
  const required = ratio * args.p_der_mw;
  return {
    required_sk_mva: required,
    available_sk_mva: args.available_sk_mva,
    ok: args.available_sk_mva !== null && args.available_sk_mva >= required,
    ratio,
  };
}

// =============================================================================
// 10. BessOperationModeCatalog (Naprawa eng.10 — audyt OZE)
// =============================================================================
//
// PROWENIENCJA (karta K-Q, 2026-08-14) — mirror wyrównany do stanu backendu.
// Pozycja opisuje USŁUGĘ, którą magazyn ma świadczyć: jej nazwę, sens i wymagania
// wobec przekształtnika. USUNIĘTO cztery pola, które udawały dane:
//   * `reserved_capacity_percent` — decyzja projektowa konkretnego projektu (i
//     przedmiot umowy rynkowej), a nie własność trybu pracy; backend wstawiał tę
//     liczbę do modelu przed rozpływem;
//   * `max_duration_h` — wynika z pojemności konkretnego magazynu;
//   * `response_time_s` — dla usług bilansujących określa go regulamin rynku
//     operatora systemu przesyłowego, dla peak shavingu nikt go nie określa;
//   * `required_for_nc_rfg_modules` — deklaracja, że NC RfG WYMAGA danej usługi
//     od modułu typu C/D. Sprawdzone na tekście rozporządzenia (UE) 2016/631:
//     ono nie nakazuje modułom wytwórczym świadczenia FCR-N / FCR-D / aFRR /
//     mFRR — to produkty rynku bilansującego, a nie warunek przyłączenia.
// Zostają `requires_four_quadrant` / `requires_grid_forming`: to nie cudza dana,
// tylko własność samej usługi.

export interface BessOperationModeItem {
  readonly id: string;
  readonly catalog_namespace: 'bess_operation_mode';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly description_pl: string;
  readonly mode_code:
    | 'peak_shaving'
    | 'arbitrage'
    | 'fcr_n'
    | 'fcr_d_up'
    | 'fcr_d_down'
    | 'afrr'
    | 'mfrr'
    | 'voltage_support'
    | 'island_backup'
    | 'self_consumption';
  /** Usługa wymaga przekształtnika pracującego w czterech ćwiartkach. */
  readonly requires_four_quadrant: boolean;
  /** Usługa wymaga przekształtnika tworzącego napięcie (grid-forming). */
  readonly requires_grid_forming: boolean;
}

export const BESS_OPERATION_MODE_CATALOG: ReadonlyArray<BessOperationModeItem> = Object.freeze([
  {
    id: 'mode_peak_shaving',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Peak shaving (redukcja szczytu)',
    description_pl: 'Wyładowanie magazynu w szczytach obciążenia odbiorcy, żeby obniżyć moc szczytową i opłaty dystrybucyjne.',
    mode_code: 'peak_shaving',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
  {
    id: 'mode_arbitrage',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Arbitraż cenowy (przesunięcie energii w czasie)',
    description_pl: 'Ładowanie w godzinach niskich cen energii, wyładowanie w godzinach wysokich. Opłacalność zależy od cennika rynku, który nie jest daną katalogową.',
    mode_code: 'arbitrage',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
  {
    id: 'mode_fcr_n',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'FCR-N (rezerwa pierwotna symetryczna)',
    description_pl: 'Symetryczna rezerwa pierwotna: magazyn zmienia moc czynną w obie strony wokół częstotliwości znamionowej. Wymagany czas reakcji, wielkość rezerwy i statyzm określa regulamin rynku bilansującego operatora systemu przesyłowego — nie ten katalog.',
    mode_code: 'fcr_n',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_fcr_d_up',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'FCR-D (rezerwa awaryjna w górę)',
    description_pl: 'Rezerwa pierwotna asymetryczna w górę, uruchamiana przy zakłóceniu podczęstotliwościowym. Próg uruchomienia i profil narastania mocy określa regulamin rynku bilansującego, nie ten katalog.',
    mode_code: 'fcr_d_up',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_afrr',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'aFRR (rezerwa wtórna automatyczna)',
    description_pl: 'Rezerwa wtórna sterowana automatycznie sygnałem operatora systemu przesyłowego, symetryczna w obie strony. Czasy aktywacji określa regulamin rynku bilansującego, nie ten katalog.',
    mode_code: 'afrr',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_mfrr',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'mFRR (rezerwa wtórna ręczna)',
    description_pl: 'Rezerwa uruchamiana ręcznie komendą dyspozytora operatora systemu przesyłowego. Czas aktywacji i wymagany czas podtrzymania określa regulamin rynku bilansującego, nie ten katalog.',
    mode_code: 'mfrr',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
  {
    id: 'mode_voltage_support',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Wsparcie napięciowe Q(U)',
    description_pl: 'Regulacja mocy biernej w funkcji napięcia w punkcie przyłączenia (charakterystyka Q(U)). Wymaga przekształtnika pracującego w czterech ćwiartkach; zakres regulacji wynika z karty przekształtnika i z warunków przyłączenia, nie z tego katalogu.',
    mode_code: 'voltage_support',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_island_backup',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Praca wyspowa (przekształtnik tworzący napięcie)',
    description_pl: 'Tworzenie napięcia po zaniku zasilania. Wymaga przekształtnika tworzącego napięcie (grid-forming). Powrót do pracy równoległej przez kontrolę synchronizmu (funkcja 25).',
    mode_code: 'island_backup',
    requires_four_quadrant: true,
    requires_grid_forming: true,
  },
  {
    id: 'mode_self_consumption',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Autokonsumpcja PV z magazynem',
    description_pl: 'Maksymalizacja autokonsumpcji instalacji PV: ładowanie nadwyżek generacji dziennej, wyładowanie wieczorne.',
    mode_code: 'self_consumption',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
]);

/** Filtruje tryby pracy magazynu dostępne dla zdolności danego przekształtnika. */
export function selectBessModesForPcs(args: {
  readonly fourQuadrant: boolean;
  readonly gridFormingCapable: boolean;
}): readonly BessOperationModeItem[] {
  return BESS_OPERATION_MODE_CATALOG.filter((m) => {
    if (m.requires_four_quadrant && !args.fourQuadrant) return false;
    if (m.requires_grid_forming && !args.gridFormingCapable) return false;
    return true;
  });
}

// USUNIĘTY (karta K-Q, 2026-08-14): `selectRequiredBessModesForModule`.
// Zwracał tryby rzekomo WYMAGANE przez NC RfG dla danego typu modułu, na
// podstawie pola `required_for_nc_rfg_modules`. Rozporządzenie (UE) 2016/631
// sprawdzone u źródła nie nakazuje modułom wytwórczym świadczenia FCR-N /
// FCR-D / aFRR / mFRR — to produkty rynku bilansującego, a nie warunek
// przyłączenia. Pole i selektor zniknęły też po stronie backendu.

// =============================================================================
// 11. TapChangerCatalog (Naprawa eng.13 — audyt projektanta SN)
// =============================================================================
//
// Przełącznik zaczepów transformatora — kluczowy dla regulacji napięcia
// (VR control) i zarządzania w GPZ.
//
// PROWENIENCJA (karta K-Q, 2026-08-14) — mirror wyrównany do stanu backendu.
// Pozycja jest WARIANTEM REGULACJI, który projektant zadaje: liczba zaczepów,
// skok i zakres widnieją w jej nazwie i są ze sobą spójne. USUNIĘTO dwa pola,
// które opisywały KONKRETNY WYRÓB bez żadnego źródła: czas przełączenia
// (podaje go karta mechanizmu napędowego producenta) oraz resurs między
// przeglądami (gwarancja producenta, nie liczba do zgadnięcia).

export interface TapChangerItem {
  readonly id: string;
  readonly catalog_namespace: 'tap_changer';
  readonly catalog_version: string;
  readonly label_pl: string;
  /** Typ przełącznika: OLTC = on-load (pod obciążeniem), DETC = off-load. */
  readonly type: 'oltc' | 'detc';
  /** Pozycja neutralna (typowo 0 lub środek zakresu). */
  readonly neutral_position: number;
  /** Liczba zaczepów. */
  readonly tap_count: number;
  /** Krok napięcia per zaczep [%]. */
  readonly step_percent: number;
  /** Zakres regulacji [%] = (tap_count − 1) / 2 · step_percent. */
  readonly range_percent: number;
  /** Strona regulacji: HV (pierwotna) lub LV (wtórna). */
  readonly regulated_side: 'hv' | 'lv';
  /** Czy obsługuje AVR (Automatic Voltage Regulation). */
  readonly supports_avr: boolean;
  /** Stosowanie. */
  readonly applicable_to: ReadonlyArray<'transformer_110_15' | 'transformer_110_20' | 'transformer_15_04' | 'block_transformer'>;
}

export const TAP_CHANGER_CATALOG: ReadonlyArray<TapChangerItem> = Object.freeze([
  {
    id: 'tc_oltc_110sn_19_125',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'OLTC 110/SN · 19 zaczepów · ±11,25% · AVR',
    type: 'oltc',
    neutral_position: 0,
    tap_count: 19,
    step_percent: 1.25,
    range_percent: 11.25,
    regulated_side: 'hv',
    supports_avr: true,
    applicable_to: ['transformer_110_15', 'transformer_110_20'],
  },
  {
    id: 'tc_oltc_110sn_17_125',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'OLTC 110/SN · 17 zaczepów · ±10% · AVR',
    type: 'oltc',
    neutral_position: 0,
    tap_count: 17,
    step_percent: 1.25,
    range_percent: 10,
    regulated_side: 'hv',
    supports_avr: true,
    applicable_to: ['transformer_110_15', 'transformer_110_20'],
  },
  {
    id: 'tc_detc_snnn_5_25',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'DETC SN/nN · 5 zaczepów · ±5% (off-load)',
    type: 'detc',
    neutral_position: 0,
    tap_count: 5,
    step_percent: 2.5,
    range_percent: 5,
    regulated_side: 'hv',
    supports_avr: false,
    applicable_to: ['transformer_15_04', 'block_transformer'],
  },
  {
    id: 'tc_oltc_snnn_9_15',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'OLTC SN/nN · 9 zaczepów · ±6% · AVR (przemysłowe)',
    type: 'oltc',
    neutral_position: 0,
    tap_count: 9,
    step_percent: 1.5,
    range_percent: 6,
    regulated_side: 'hv',
    supports_avr: true,
    applicable_to: ['transformer_15_04', 'block_transformer'],
  },
]);

/** Filtruje przełączniki zaczepów dla danego typu transformatora. */
export function selectTapChangersForTransformer(
  type: 'transformer_110_15' | 'transformer_110_20' | 'transformer_15_04' | 'block_transformer',
): readonly TapChangerItem[] {
  return TAP_CHANGER_CATALOG.filter((tc) => tc.applicable_to.includes(type));
}

/** Pobiera szczegóły przełącznika zaczepów. */
export function getTapChanger(id: string): TapChangerItem | null {
  return TAP_CHANGER_CATALOG.find((tc) => tc.id === id) ?? null;
}

// =============================================================================
// 12. Hosting capacity export check (Naprawa eng.15 — audyt OZE)
// =============================================================================
//
// Eksport mocy DER do sieci OSD vs. import obciążenia. Reguła operatora:
// jeśli moc eksportowana ≥ 1.5 × moc importowana, wymagana studium NC RfG
// "ramp-down" + ograniczenie eksportu (curtailment).

export interface HostingCapacityExportResult {
  readonly station_id: string;
  readonly p_export_kw: number; // suma mocy DER
  readonly p_import_kw: number; // suma mocy odbiorów
  readonly p_net_export_kw: number; // P_export - P_import (>0 = export do OSD)
  readonly export_to_import_ratio: number;
  readonly status: 'no_export' | 'normal_export' | 'high_export_warning' | 'requires_ramp_down';
  readonly message_pl: string;
}

/**
 * Naprawa eng.15: walidacja kierunku przepływu mocy (export vs import) w stacji.
 * Reguła operatora:
 *   - Σ P_DER ≤ 0.8 × Σ P_load → "no_export" (lokalna autokonsumpcja)
 *   - 0.8 × Σ P_load < Σ P_DER ≤ 1.5 × Σ P_load → "normal_export"
 *   - Σ P_DER > 1.5 × Σ P_load → "high_export_warning" (wymagane curtailment)
 *   - Σ P_DER > 3 × Σ P_load → "requires_ramp_down" (NC RfG study + curtailment)
 */
export function validateHostingCapacityExport(args: {
  readonly station_id: string;
  readonly p_export_kw: number;
  readonly p_import_kw: number;
}): HostingCapacityExportResult {
  const net = args.p_export_kw - args.p_import_kw;
  const ratio = args.p_import_kw > 0 ? args.p_export_kw / args.p_import_kw : Infinity;

  let status: HostingCapacityExportResult['status'];
  let message_pl: string;

  if (net < 0 || ratio < 0.8) {
    status = 'no_export';
    message_pl =
      `Lokalna autokonsumpcja: ${args.p_export_kw.toFixed(0)} kW DER vs `
      + `${args.p_import_kw.toFixed(0)} kW odbiorów. Brak eksportu netto do OSD.`;
  } else if (ratio <= 1.5) {
    status = 'normal_export';
    message_pl =
      `Eksport normalny: ${net.toFixed(0)} kW eksportowanych do OSD `
      + `(stosunek ${ratio.toFixed(2)}× — w granicach standardowej hosting capacity).`;
  } else if (ratio <= 3.0) {
    status = 'high_export_warning';
    message_pl =
      `Wysoki eksport: ${net.toFixed(0)} kW (stosunek ${ratio.toFixed(2)}×). `
      + `Zalecane curtailment 70% w godzinach południowych. Sprawdź profil P(t).`;
  } else {
    status = 'requires_ramp_down';
    message_pl =
      `Krytyczny eksport: ${net.toFixed(0)} kW (stosunek ${ratio.toFixed(2)}×). `
      + `WYMAGANE: studium NC RfG ramp-down + curtailment + uzgodnienie z OSD.`;
  }

  return {
    station_id: args.station_id,
    p_export_kw: args.p_export_kw,
    p_import_kw: args.p_import_kw,
    p_net_export_kw: net,
    export_to_import_ratio: ratio,
    status,
    message_pl,
  };
}
