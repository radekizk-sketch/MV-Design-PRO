/**
 * Fixtures katalogu — 1:1 z kształtem odpowiedzi `/api/catalog/*`
 * (backend `to_dict()` w `backend/src/network_model/catalog/types.py`).
 * Wartości reprezentatywne; kształt pól wierny (łącznie z metadanymi katalogu).
 */

import type { ElementUzycia, KatalogPozycja, KategoriaId, LadowaczTypow } from '../types';

// LineType.to_dict() — types.py:458
export const FIXTURE_LINIE: KatalogPozycja[] = [
  {
    id: 'line-afl6-120',
    name: 'AFL-6 120',
    r_ohm_per_km: 0.2392,
    x_ohm_per_km: 0.3697,
    b_us_per_km: 2.8,
    rated_current_a: 375,
    manufacturer: 'Tele-Fonika',
    standard: 'PN-EN 50182',
    max_temperature_c: 80,
    voltage_rating_kv: 15,
    conductor_material: 'AL_ST',
    cross_section_mm2: 120,
    r0_ohm_per_km: 0.383,
    x0_ohm_per_km: 1.62,
    b0_siemens_per_km: null,
    ith_1s_a: 11000,
    jth_1s_a_per_mm2: null,
    base_type_id: null,
    trade_name: null,
    verification_status: 'CZESCIOWO_ZWERYFIKOWANY',
    source_reference: 'Katalog linii i kabli MV-DESIGN-PRO / IEC 60909-0',
    catalog_status: 'PRODUKCYJNY_V1',
    contract_version: '2.0',
  },
];

// CableType.to_dict() — types.py:661
export const FIXTURE_KABLE: KatalogPozycja[] = [
  {
    id: 'cable-yhakxs-240',
    name: 'YHAKXS 1x240/25 12/20 kV',
    r_ohm_per_km: 0.125,
    x_ohm_per_km: 0.113,
    c_nf_per_km: 310,
    b_us_per_km: 0.0973,
    rated_current_a: 445,
    manufacturer: 'Tele-Fonika',
    voltage_rating_kv: 20,
    insulation_type: 'XLPE',
    standard: 'IEC 60502-2',
    conductor_material: 'AL',
    cross_section_mm2: 240,
    return_conductor_cross_section_mm2: 25,
    return_conductor_material: 'CU',
    return_conductor_r_ohm_per_km_20c: 0.727,
    return_conductor_jth_1s_a_per_mm2: null,
    return_conductor_ith_1s_a: null,
    r0_ohm_per_km: 0.5,
    x0_ohm_per_km: 0.1,
    b0_siemens_per_km: null,
    max_temperature_c: 90,
    number_of_cores: 1,
    ith_1s_a: 22600,
    jth_1s_a_per_mm2: null,
    base_type_id: null,
    trade_name: null,
    dane_cieplne_kompletne: true,
    verification_status: 'CZESCIOWO_ZWERYFIKOWANY',
    source_reference: 'Katalog linii i kabli MV-DESIGN-PRO / IEC 60502-2 / IEC 60287 / IEC 60949',
    catalog_status: 'PRODUKCYJNY_V1',
    contract_version: '2.0',
  },
];

// TransformerType.to_dict() — types.py:814
export const FIXTURE_TRANSFORMATORY: KatalogPozycja[] = [
  {
    id: 'tr-630-15-04',
    name: 'TOn 630 15,75/0,42 kV Dyn5',
    rated_power_mva: 0.63,
    voltage_hv_kv: 15.75,
    voltage_lv_kv: 0.42,
    uk_percent: 6,
    pk_kw: 6.5,
    manufacturer: 'ABB',
    i0_percent: 1.1,
    p0_kw: 0.9,
    vector_group: 'Dyn5',
    cooling_class: 'ONAN',
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
    verification_status: 'CZESCIOWO_ZWERYFIKOWANY',
    source_reference: 'Katalog transformatorow MV-DESIGN-PRO / IEC 60076-1',
    catalog_status: 'PRODUKCYJNY_V1',
    contract_version: '2.0',
  },
];

// SwitchEquipmentType.to_dict() — types.py:904
export const FIXTURE_APARATY: KatalogPozycja[] = [
  {
    id: 'cb-vd4-12',
    name: 'ABB VD4 12 kV',
    manufacturer: 'ABB',
    equipment_kind: 'CIRCUIT_BREAKER',
    un_kv: 12,
    in_a: 1250,
    ik_ka: 25,
    icw_ka: 25,
    medium: 'VACUUM',
    verification_status: 'CZESCIOWO_ZWERYFIKOWANY',
    source_reference: 'Katalog aparatury MV-DESIGN-PRO / IEC 62271-100',
    catalog_status: 'PRODUKCYJNY_V1',
    contract_version: '2.0',
  },
];

// ConverterType (fetchConverterTypes) — ui/catalog/api.ts:255 (PV/BESS/WIND znormalizowane)
export const FIXTURE_FALOWNIKI: KatalogPozycja[] = [
  {
    id: 'pv-inv-2500',
    name: 'Falownik PV 2,5 MVA',
    manufacturer: 'SMA',
    kind: 'PV',
    un_kv: 0.8,
    sn_mva: 2.5,
    pmax_mw: 2.5,
    cosphi_min: 0.9,
    cosphi_max: 0.9,
  },
  {
    id: 'bess-inv-1000',
    name: 'Magazyn BESS 1 MVA',
    manufacturer: 'Huawei',
    kind: 'BESS',
    un_kv: 0.4,
    sn_mva: 1,
    pmax_mw: 1,
    e_kwh: 2000,
  },
];

export const FIXTURES_PER_KATEGORIA: Readonly<Record<KategoriaId, KatalogPozycja[]>> = {
  LINIA: FIXTURE_LINIE,
  KABEL: FIXTURE_KABLE,
  TRANSFORMATOR: FIXTURE_TRANSFORMATORY,
  APARAT: FIXTURE_APARATY,
  FALOWNIK: FIXTURE_FALOWNIKI,
};

/** Deterministyczny loader stub dla testów (bez sieci). */
export const stubLoader: LadowaczTypow = async (kategoria) =>
  FIXTURES_PER_KATEGORIA[kategoria];

// Snapshot „Gdzie użyty" — elementy wiązane przez catalog_ref (ui/catalog/catalogSnapshot.ts)
export const FIXTURE_UZYCIA: ElementUzycia[] = [
  { ref: 'branch-1', etykieta: 'Linia L1 (GPZ → St. A)', catalog_ref: 'line-afl6-120', rodzaj: 'Linia' },
  { ref: 'branch-2', etykieta: 'Linia L2 (St. A → St. B)', catalog_ref: 'line-afl6-120', rodzaj: 'Linia' },
  { ref: 'tr-1', etykieta: 'Transformator T1', catalog_ref: 'tr-630-15-04', rodzaj: 'Transformator' },
];
