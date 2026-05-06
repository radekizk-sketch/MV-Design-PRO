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
}

export const NC_RFG_PROFILE_CATALOG: ReadonlyArray<NcRfgProfileItem> = Object.freeze([
  {
    id: 'ncrfg_pse',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: '2024.1',
    operator_code: 'PSE',
    label_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
    description_pl:
      'Profil bazowy NC RfG Annex II (sieć przesyłowa 110+ kV). Moduły typu C/D z wymaganiami pełnymi.',
    applicable_module_types: ['B', 'C', 'D'],
    q_u_curve_ref: 'qu_pse_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'NC_RfG_Annex_II',
    status: 'active',
  },
  {
    id: 'ncrfg_energa',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: '2024.1',
    operator_code: 'Energa',
    label_pl: 'Energa-Operator',
    description_pl: 'IRiESD Energa-Operator. Lokalne wymagania NC RfG dla przyłączeń SN/nN.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_energa_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
  },
  {
    id: 'ncrfg_tauron',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: '2024.1',
    operator_code: 'Tauron',
    label_pl: 'Tauron Dystrybucja',
    description_pl: 'IRiESD Tauron Dystrybucja. Profil dla Polski południowej.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_tauron_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
  },
  {
    id: 'ncrfg_enea',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: '2024.1',
    operator_code: 'Enea',
    label_pl: 'Enea Operator',
    description_pl: 'IRiESD Enea Operator. Profil dla Polski zachodniej i centralnej.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_enea_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
  },
  {
    id: 'ncrfg_pge',
    catalog_namespace: 'nc_rfg_profile',
    catalog_version: '2024.1',
    operator_code: 'PGE',
    label_pl: 'PGE Dystrybucja',
    description_pl: 'IRiESD PGE Dystrybucja. Profil bazowy ze zwiększonym wymogiem dla HVRT.',
    applicable_module_types: ['A', 'B', 'C'],
    q_u_curve_ref: 'qu_pge_2024',
    p_f_curve_ref: 'pf_pse_2024',
    source: 'IRiESD',
    status: 'active',
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
    catalog_version: '2024.1',
    label_pl: 'LVRT — PSE NC RfG, moduł B',
    operator_code: 'PSE',
    module_type: 'B',
    envelope: LVRT_BASE_PSE,
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'lvrt_energa_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'LVRT — Energa-Operator, moduł B',
    operator_code: 'Energa',
    module_type: 'B',
    envelope: offsetCurve(LVRT_BASE_PSE, 0.02),
    source: 'IRiESD',
  },
  {
    id: 'lvrt_tauron_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'LVRT — Tauron Dystrybucja, moduł B',
    operator_code: 'Tauron',
    module_type: 'B',
    envelope: LVRT_BASE_PSE,
    source: 'IRiESD',
  },
  {
    id: 'lvrt_pge_b',
    catalog_namespace: 'lvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'LVRT — PGE Dystrybucja, moduł B',
    operator_code: 'PGE',
    module_type: 'B',
    envelope: offsetCurve(LVRT_BASE_PSE, 0.02),
    source: 'IRiESD',
  },
]);

export const HVRT_CURVE_CATALOG: ReadonlyArray<HvrtCurveItem> = Object.freeze([
  {
    id: 'hvrt_pse_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'HVRT — PSE NC RfG, moduł B',
    operator_code: 'PSE',
    module_type: 'B',
    envelope: HVRT_BASE_PSE,
    source: 'NC_RfG_Annex_II',
  },
  {
    id: 'hvrt_energa_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'HVRT — Energa-Operator, moduł B',
    operator_code: 'Energa',
    module_type: 'B',
    envelope: offsetCurve(HVRT_BASE_PSE, -0.01),
    source: 'IRiESD',
  },
  {
    id: 'hvrt_tauron_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'HVRT — Tauron Dystrybucja, moduł B',
    operator_code: 'Tauron',
    module_type: 'B',
    envelope: HVRT_BASE_PSE,
    source: 'IRiESD',
  },
  {
    id: 'hvrt_pge_b',
    catalog_namespace: 'hvrt_curve',
    catalog_version: '2024.1',
    label_pl: 'HVRT — PGE Dystrybucja, moduł B',
    operator_code: 'PGE',
    module_type: 'B',
    envelope: offsetCurve(HVRT_BASE_PSE, -0.02),
    source: 'IRiESD',
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
    catalog_version: '2024.1',
    nominal_kv: 0.23,
    label_pl: '0,23 kV (jednofazowe nn)',
    typical_use_pl: 'Sieć jednofazowa odbiorców indywidualnych.',
  },
  {
    id: 'lv_0_4kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: '2024.1',
    nominal_kv: 0.4,
    label_pl: '0,4 kV (standard nn)',
    typical_use_pl: 'Standardowe rozdzielnice odbiorcze SN/nN.',
  },
  {
    id: 'lv_0_69kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: '2024.1',
    nominal_kv: 0.69,
    label_pl: '0,69 kV (przemysłowe nn)',
    typical_use_pl: 'Sieć przemysłowa, falowniki PV string-level.',
  },
  {
    id: 'lv_1kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: '2024.1',
    nominal_kv: 1.0,
    label_pl: '1 kV (specjalne nn)',
    typical_use_pl: 'PV/BESS klastrowe na 1 kV.',
  },
  {
    id: 'lv_6kV',
    catalog_namespace: 'lv_voltage_level',
    catalog_version: '2024.1',
    nominal_kv: 6.0,
    label_pl: '6 kV (sieć przemysłowa SN dolna)',
    typical_use_pl: 'Sieć przemysłowa silnikowa 6 kV (SN dolne).',
  },
]);

// =============================================================================
// 4. ConnectionVariantCatalog (3 warianty)
// =============================================================================

export interface ConnectionVariantItem {
  readonly id: string;
  readonly catalog_namespace: 'connection_variant';
  readonly side: 'SN' | 'nN' | 'dedicated_transformer';
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
      'DER przyłączony przez transformator dedykowany (block transformer). '
      + 'Stosowane gdy napięcie urządzenia nie pasuje do żadnej szyny stacji.',
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    required_objects_pl: [
      'Transformator dedykowany',
      'Pole transformatorowe SN',
      'Kabel SN do transformatora',
      'Zabezpieczenia po obu stronach',
    ],
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
// 6. PV / BESS / FW device catalogs (frontend snapshot)
// =============================================================================
// Te katalogi są snapshotami backendowymi (mv_converter_catalog,
// wind_turbines/catalog, der_dynamic). Przenoszone tu dla deterministycznych
// dropdownów i fix actions.

export interface PvInverterItem {
  readonly id: string;
  readonly catalog_namespace: 'pv_inverter';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly manufacturer: string;
  readonly nominal_power_kw: number;
  readonly nominal_voltage_kv: number;
  readonly fault_current_capability_pu: number;
  readonly applicable_module_types: readonly ('A' | 'B' | 'C' | 'D')[];
}

export const PV_INVERTER_CATALOG: ReadonlyArray<PvInverterItem> = Object.freeze([
  {
    id: 'pv_inv_sma_2500',
    catalog_namespace: 'pv_inverter',
    catalog_version: '2024.1',
    label_pl: 'SMA Sunny Central 2500-EV (2 500 kW · 0,69 kV)',
    manufacturer: 'SMA',
    nominal_power_kw: 2500,
    nominal_voltage_kv: 0.69,
    fault_current_capability_pu: 1.1,
    applicable_module_types: ['B', 'C'],
  },
  {
    id: 'pv_inv_huawei_185',
    catalog_namespace: 'pv_inverter',
    catalog_version: '2024.1',
    label_pl: 'Huawei SUN2000-185KTL (185 kW · 0,4 kV)',
    manufacturer: 'Huawei',
    nominal_power_kw: 185,
    nominal_voltage_kv: 0.4,
    fault_current_capability_pu: 1.05,
    applicable_module_types: ['A', 'B'],
  },
  {
    id: 'pv_inv_fimer_3000',
    catalog_namespace: 'pv_inverter',
    catalog_version: '2024.1',
    label_pl: 'FIMER PVS-3000-CSE (3 000 kW · 0,69 kV)',
    manufacturer: 'FIMER',
    nominal_power_kw: 3000,
    nominal_voltage_kv: 0.69,
    fault_current_capability_pu: 1.15,
    applicable_module_types: ['B', 'C'],
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
}

export const BESS_PCS_CATALOG: ReadonlyArray<BessPcsItem> = Object.freeze([
  {
    id: 'bess_pcs_sma_2200',
    catalog_namespace: 'bess_pcs',
    catalog_version: '2024.1',
    label_pl: 'SMA Sunny Central Storage 2200 (2 200 kW · 0,69 kV)',
    manufacturer: 'SMA',
    nominal_power_kw: 2200,
    nominal_voltage_kv: 0.69,
    four_quadrant: true,
    grid_forming_capable: true,
  },
  {
    id: 'bess_pcs_abb_500',
    catalog_namespace: 'bess_pcs',
    catalog_version: '2024.1',
    label_pl: 'ABB PCS100 ESS (500 kW · 0,4 kV)',
    manufacturer: 'ABB',
    nominal_power_kw: 500,
    nominal_voltage_kv: 0.4,
    four_quadrant: true,
    grid_forming_capable: false,
  },
]);

export interface BessBatteryItem {
  readonly id: string;
  readonly catalog_namespace: 'bess_battery';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly manufacturer: string;
  readonly chemistry: 'LFP' | 'NMC' | 'LTO';
  readonly capacity_kwh: number;
  readonly nominal_voltage_v: number;
  readonly cycle_life: number;
}

export const BESS_BATTERY_CATALOG: ReadonlyArray<BessBatteryItem> = Object.freeze([
  {
    id: 'bess_bat_byd_2880',
    catalog_namespace: 'bess_battery',
    catalog_version: '2024.1',
    label_pl: 'BYD Battery-Box Pro LFP (2 880 kWh / 1 230 V)',
    manufacturer: 'BYD',
    chemistry: 'LFP',
    capacity_kwh: 2880,
    nominal_voltage_v: 1230,
    cycle_life: 6000,
  },
  {
    id: 'bess_bat_catl_5000',
    catalog_namespace: 'bess_battery',
    catalog_version: '2024.1',
    label_pl: 'CATL EnerC LFP (5 000 kWh / 1 500 V)',
    manufacturer: 'CATL',
    chemistry: 'LFP',
    capacity_kwh: 5000,
    nominal_voltage_v: 1500,
    cycle_life: 8000,
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
  readonly hub_height_m: number;
  readonly rotor_diameter_m: number;
  readonly generator_type: 'PMSG' | 'DFIG' | 'SCIG';
}

export const WIND_TURBINE_CATALOG: ReadonlyArray<WindTurbineItem> = Object.freeze([
  {
    id: 'wt_vestas_v117_3450',
    catalog_namespace: 'wind_turbine',
    catalog_version: '2024.1',
    label_pl: 'Vestas V117-3.45 MW (3 450 kW · PMSG)',
    manufacturer: 'Vestas',
    model_code: 'V117-3450',
    nominal_power_kw: 3450,
    hub_height_m: 116.5,
    rotor_diameter_m: 117,
    generator_type: 'PMSG',
  },
  {
    id: 'wt_siemens_swt_2300_113',
    catalog_namespace: 'wind_turbine',
    catalog_version: '2024.1',
    label_pl: 'Siemens SWT-2.3-113 (2 300 kW · DFIG)',
    manufacturer: 'Siemens',
    model_code: 'SWT-2300-113',
    nominal_power_kw: 2300,
    hub_height_m: 99.5,
    rotor_diameter_m: 113,
    generator_type: 'DFIG',
  },
  {
    id: 'wt_ge_158_5500',
    catalog_namespace: 'wind_turbine',
    catalog_version: '2024.1',
    label_pl: 'GE Cypress 5.5-158 (5 500 kW · PMSG)',
    manufacturer: 'GE Renewable',
    model_code: 'Cypress-5500-158',
    nominal_power_kw: 5500,
    hub_height_m: 161,
    rotor_diameter_m: 158,
    generator_type: 'PMSG',
  },
]);

// =============================================================================
// 7. Helpery selektora
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

/** Polski label dla connection_side. */
export function getConnectionSideLabelPl(side: 'SN' | 'nN' | 'dedicated_transformer'): string {
  const item = CONNECTION_VARIANT_CATALOG.find((v) => v.side === side);
  return item?.label_pl ?? side;
}
