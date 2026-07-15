/*
 * Fixture'y o kształcie 1:1 z realnych odpowiedzi `/api/station-templates/*`
 * (`backend/src/api/station_templates.py`). `KATEGORIE_FIXTURE` odwzorowuje
 * dokładnie 10 kategorii z `_CATEGORY_LABELS`/`_CATEGORY_DESCRIPTIONS`
 * (station_templates.py:252-289) wraz z realnymi licznikami z backendu
 * (`count_by_category` — 57 szablonów łącznie, `service.py`). `szablonPelny`
 * to fabryka pełnego szablonu (`StationTemplateFull`) z realistycznymi
 * wartościami pól schematu (`schema.py:104-269`).
 */

import type {
  CategoryEntry,
  DerKindSpec,
  StationTemplateFull,
} from '../api/szablonyClient';

export const KATEGORIE_FIXTURE: CategoryEntry[] = [
  { id: 'typowa_sn_nn', label_pl: 'Typowe stacje SN/nN', icon: 'station-distribution', description_pl: 'Standardowe stacje dystrybucyjne 100-2500 kVA', template_count: 10 },
  { id: 'slupowa', label_pl: 'Stacje słupowe ZSP', icon: 'station-pole', description_pl: 'Stacje słupowe ZSP (50-400 kVA, wieś)', template_count: 6 },
  { id: 'zksn_wnetrzowa', label_pl: 'Stacje ZKSN wnętrzowe', icon: 'station-indoor', description_pl: 'Stacje wnętrzowe z RMU (630-2500 kVA, miasto)', template_count: 6 },
  { id: 'prosument_pv', label_pl: 'Mikroinstalacje PV prosument', icon: 'station-pv-prosument', description_pl: 'Mikroinstalacje PV 5-250 kW (NC RfG typ A-C)', template_count: 6 },
  { id: 'farma_pv', label_pl: 'Farmy PV SN', icon: 'station-pv-farm', description_pl: 'Farmy PV SN 0.5-5 MW z block transformer', template_count: 6 },
  { id: 'bess', label_pl: 'Magazyny BESS', icon: 'station-bess', description_pl: 'Magazyny BESS 0.5-5 MW z usługami systemowymi', template_count: 5 },
  { id: 'hybrydowa', label_pl: 'Hybrydy PV + BESS', icon: 'station-hybrid', description_pl: 'Farmy hybrydowe PV + BESS', template_count: 5 },
  { id: 'przemyslowa', label_pl: 'Przemysłowe odbiorcze', icon: 'station-industrial', description_pl: 'Stacje przemysłowe odbiorcze (zakłady, silniki)', template_count: 6 },
  { id: 'wiatrowa', label_pl: 'Stacje OZE wiatrowe', icon: 'station-wind', description_pl: 'Stacje OZE wiatrowe (Vestas V90/V112)', template_count: 4 },
  { id: 'sekcyjna', label_pl: 'Stacje sekcyjne / pętlowe', icon: 'station-sectional', description_pl: 'Stacje sekcyjne/pętlowe z NOP/SZR', template_count: 3 },
];

/** Fabryka opcji katalogowej (`CatalogChoice`, schema.py:60-68). */
function opcja(catalogRef: string, labelPl: string, namespace: string, over: Partial<{ default: boolean; badge_pl: string | null }> = {}) {
  return {
    catalog_ref: catalogRef,
    label_pl: labelPl,
    namespace,
    default: over.default ?? false,
    badge_pl: over.badge_pl ?? null,
  };
}

const TR_OPTIONS_MEDIUM = [
  opcja('tr-sn-nn-15-04-400kva-dyn11', 'TR 400 kVA SN/nN', 'TRAFO_SN_NN'),
  opcja('tr-sn-nn-15-04-630kva-dyn11', 'TR 630 kVA SN/nN', 'TRAFO_SN_NN', { default: true }),
  opcja('tr-sn-nn-15-04-1000kva-dyn11', 'TR 1000 kVA SN/nN', 'TRAFO_SN_NN'),
];

const NN_CB_OPTIONS = [
  opcja('cb_nn_100a', 'CB nN 100 A', 'APARAT_NN'),
  opcja('cb_nn_400a', 'CB nN 400 A', 'APARAT_NN', { default: true }),
];

const CT_OPTIONS = [opcja('ct-400-5-5p20-15', 'CT 400/5 A, 5P20, 15 kV', 'CT', { default: true })];
const VT_OPTIONS = [opcja('vt-15kv-0.1kv-3p', 'VT 15 kV / 100 V, 3-phase', 'VT', { default: true })];

const PROT_FEEDER_OPTIONS = [
  { device_catalog_ref: 'EM_E2TANGO_600', label_pl: 'Elektrometal e2TANGO-600 (feeder PL)', vendor: 'ELEKTROMETAL', settings_template_id: 'tpl_feeder_15kv_typowa', badge_pl: 'PTPiREE' },
  { device_catalog_ref: 'SIEMENS_7SJ82', label_pl: 'Siemens SIPROTEC 7SJ82', vendor: 'SIEMENS', settings_template_id: 'tpl_feeder_15kv_typowa', badge_pl: null },
];

interface SzablonPelnyOverrides {
  id?: string;
  name_pl?: string;
  category?: string;
  description_pl?: string;
  use_case_pl?: string;
  nc_rfg_type?: 'A' | 'B' | 'C' | 'D' | null;
  tags?: readonly string[];
  icon?: string;
  sn_bays_count_default?: number;
  sn_bay_roles?: ReadonlyArray<{
    role: 'IN' | 'OUT' | 'TR' | 'MEASUREMENT' | 'COUPLER';
    label_pl: string;
  }>;
  der_options?: readonly DerKindSpec[];
  der_total_count_default?: number;
}

/** Fabryka pełnego szablonu (`StationTemplateFull`, `to_dict`, schema.py:171-269). */
export function szablonPelny(over: SzablonPelnyOverrides = {}): StationTemplateFull {
  return {
    id: over.id ?? 'tpl_sn_nn_630kva',
    name_pl: over.name_pl ?? 'Stacja SN/nN 630 kVA z RMU 3-pole, 4 odpływy',
    category: over.category ?? 'typowa_sn_nn',
    description_pl: over.description_pl ?? 'Najbardziej typowa dystrybucyjna 630 kVA, ZPUE Rotoblok RMU.',
    use_case_pl: over.use_case_pl ?? 'Standardowa dystrybucyjna terenowa.',
    nc_rfg_type: over.nc_rfg_type ?? null,
    tags: over.tags ?? ['dystrybucyjna', 'typowa', '15kV'],
    icon: over.icon ?? 'station-distribution',
    schema: {
      transformer_options: TR_OPTIONS_MEDIUM,
      transformer_count: { default: 1, min_value: 1, max_value: 2, step: 1, label_pl: 'Liczba transformatorów' },
      sn_switchgear_manufacturers: ['ZPUE_WLOSZCZOWA', 'ELEKTROMETAL', 'ABB', 'SIEMENS', 'SCHNEIDER'],
      sn_switchgear_default: 'ZPUE_WLOSZCZOWA',
      sn_bays_count: {
        default: over.sn_bays_count_default ?? 3,
        min_value: 1,
        max_value: 8,
        step: 1,
        label_pl: 'Liczba pól SN',
      },
      sn_bay_roles: (
        over.sn_bay_roles ?? [
          { role: 'IN', label_pl: 'Pole liniowe IN' },
          { role: 'OUT', label_pl: 'Pole liniowe OUT' },
          { role: 'TR', label_pl: 'Pole transformatorowe' },
        ]
      ).map((r) => ({ ...r, apparatus_options: [] })),
      sn_bay_protection_options: PROT_FEEDER_OPTIONS,
      nn_feeders_count: { default: 4, min_value: 1, max_value: 8, step: 1, label_pl: 'Liczba odpływów nN' },
      nn_feeder_cb_options: NN_CB_OPTIONS,
      nn_load_default_kw: { default: 50, min_value: 0, max_value: 2000, step: 0.01, unit: 'kW', label_pl: 'Obciążenie per odpływ' },
      der_options: over.der_options ?? [],
      der_total_count: { default: over.der_total_count_default ?? 0, min_value: 0, max_value: 20, step: 1, label_pl: 'Liczba modułów DER' },
      protection_settings_default: 'tpl_feeder_15kv_typowa',
      ct_options: CT_OPTIONS,
      vt_options: VT_OPTIONS,
      energy_meter_options: [],
      manufacturer_profile_default: 'ZPUE_WLOSZCZOWA',
    },
  };
}

/** Szablon farmy PV (rola D) — pojedyncze DER, moc/napięcie wyłącznie w tekście. */
export function szablonFarmaPv(over: SzablonPelnyOverrides = {}): StationTemplateFull {
  return szablonPelny({
    id: 'tpl_farma_pv_1mw',
    name_pl: 'Farma PV 1 MW, blok transformatorowy 1.25 MVA',
    category: 'farma_pv',
    description_pl: 'Farma PV 1 MW z blokiem transformatorowym SN.',
    use_case_pl: 'Przyłączenie farmy fotowoltaicznej do sieci SN.',
    tags: ['farma', 'PV', 'OZE'],
    icon: 'station-pv-farm',
    sn_bays_count_default: 2,
    der_options: [
      {
        kind: 'PV',
        label_pl: 'Falownik PV SN przez block TR',
        catalog_options: [opcja('conv-pv-1mw-15kv', 'PV 1 MW 15 kV', 'ZRODLO_NN_PV', { default: true })],
        default_count: 2,
        default_p_mw_each: 0.5,
        connection_variant_options: ['block_transformer'],
      },
    ],
    der_total_count_default: 2,
    ...over,
  });
}

/** Szablon hybrydowy (rola D) — dwa rodzaje DER (PV + BESS). */
export function szablonHybrydowy(): StationTemplateFull {
  return szablonPelny({
    id: 'tpl_hybrid_pv1_bess1',
    name_pl: 'Hybryda PV 1 MW + BESS 1 MW/2 MWh',
    category: 'hybrydowa',
    description_pl: 'Farma hybrydowa PV + BESS.',
    use_case_pl: 'Farma hybrydowa PV + BESS (firmness + arbitrage).',
    tags: ['hybrydowa', 'PV+BESS', 'OZE'],
    icon: 'station-hybrid',
    sn_bays_count_default: 3,
    sn_bay_roles: [
      { role: 'IN', label_pl: 'Pole liniowe IN' },
      { role: 'MEASUREMENT', label_pl: 'Pole pomiarowe + EMS' },
      { role: 'OUT', label_pl: 'Pole wyjściowe do BESS' },
    ],
    der_options: [
      {
        kind: 'PV',
        label_pl: 'Falownik PV SN przez block TR',
        catalog_options: [opcja('conv-pv-1mw-15kv', 'PV 1 MW 15 kV', 'ZRODLO_NN_PV', { default: true })],
        default_count: 2,
        default_p_mw_each: 0.5,
        connection_variant_options: ['block_transformer'],
      },
      {
        kind: 'BESS',
        label_pl: 'Magazyn BESS SN przez block TR',
        catalog_options: [opcja('conv-bess-1mw-2mwh-15kv', 'BESS 1 MW / 2 MWh', 'ZRODLO_NN_BESS')],
        default_count: 1,
        default_p_mw_each: 1.0,
        connection_variant_options: ['block_transformer'],
      },
    ],
    der_total_count_default: 3,
  });
}

/** Szablon sekcyjny (rola E) — pole sprzęgła (COUPLER). */
export function szablonSekcyjny(): StationTemplateFull {
  return szablonPelny({
    id: 'tpl_sekcyjna_nop',
    name_pl: 'Stacja sekcyjna z NOP',
    category: 'sekcyjna',
    description_pl: 'Stacja sekcyjna z łącznikiem sieciowym (NOP).',
    use_case_pl: 'Domknięcie pierścienia, praca N-1.',
    tags: ['sekcyjna', 'NOP'],
    icon: 'station-sectional',
    sn_bays_count_default: 3,
    sn_bay_roles: [
      { role: 'IN', label_pl: 'Pole IN sekcja A' },
      { role: 'OUT', label_pl: 'Pole OUT sekcja B' },
      { role: 'COUPLER', label_pl: 'Pole sprzęgła (bus coupler)' },
    ],
  });
}
