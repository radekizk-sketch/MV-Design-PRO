/**
 * FIKSTURY REALNYCH SZABLONÓW PÓL — przepisane 1:1 z odpowiedzi backendu.
 *
 * ŹRÓDŁO (nie atrapa): `GET /api/catalog/complete-bay-templates`, budowane przez
 * `backend/src/network_model/catalog/switchgear/canonical_fallback.py`
 * (`list_switchgear_solution_templates_for_manufacturer`) z rodzin
 * `switchgear/families.py` i kanonicznych układów `catalog/bay_templates.py`.
 * Zrzut wykonany na pakiecie z repozytorium — łącznie z hashami i odnośnikami
 * do kart producenta, żeby test stał na TYCH SAMYCH danych, które zobaczy
 * projektant, a nie na wygodnym uproszczeniu.
 *
 * DWIE RODZINY, BO RÓŻNIĄ SIĘ SKŁADEM (to jest sedno karty SLD-GEN-POLA):
 *  · ABB SafeRing (RMU, SF₆, ring main) — słownik aparatów rodziny NIE zawiera
 *    przekładnika prądowego, więc jej pola liniowe go NIE MAJĄ,
 *  · ABB UniGear ZS1 (wnętrzowa, wysuwna) — ma przekładniki prądowe i napięciowe,
 *    więc te same role pól mają w niej BOGATSZY skład.
 * Rysunek pola musi tę różnicę pokazywać; jeżeli oba wyjdą tak samo, generator
 * nie czyta kompozycji, tylko roli — czyli defekt sprzed karty wrócił.
 */

import type {
  BayDeviceInstanceWire,
  CompleteMvBayTemplateSummary,
} from '../../../../ui/catalog/BayTemplatePicker';
import type { SwitchgearFamily } from '../../../../ui/catalog/SwitchgearFamilyPicker';

const SAFERING_SOURCE =
  'https://electrification.us.abb.com/products/switchgear/safering-gas-insulated-ring-main-unit';
const UNIGEAR_SOURCE =
  'https://new.abb.com/medium-voltage/switchgear/air-insulated/iec-and-other-standards/unigear-zs1-portfolio';

export const SZABLON_SAFERING_LINE_IN: CompleteMvBayTemplateSummary = {
  template_ref: 'ABB__SAFERING__LINE_IN',
  base_template: {
    template_id: 'bay_template_line_in',
    name: 'Pole liniowe wejściowe',
    bay_role: 'IN',
    description: 'Pole liniowe wejściowe SN — kabel/linia od ciągu nadrzędnego.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'CB', designation_q: 'Q0', position: 1, placement: 'MIDSTREAM', optional: false },
      { kind: 'DS_LINE', designation_q: 'Q2', position: 3, placement: 'DOWNSTREAM', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 4, placement: 'GROUND_BRANCH', optional: false },
      { kind: 'CABLE_HEAD', designation_q: 'GK', position: 5, placement: 'DOWNSTREAM', optional: false },
    ],
    ports: [{ kind: 'sn_input', suffix: 'in' }],
  },
  manufacturer_ref: 'ABB',
  switchgear_family_ref: 'ABB__SAFERING',
  bay_kind: 'liniowe_doplywowe',
  bay_role: 'IN',
  source_status: 'repo_verified',
  source_refs: [SAFERING_SOURCE],
  version: 'public-product-page-2026-05',
  hash: 'd8e49c71c8004375bf6e5f2589c68c8d21074db2cdde2b18a02b3fded817a019',
  notes_pl:
    'SafeRing: kompletne pole SN z układem aparatury, portami i powiązaniem katalogowym rodziny rozdzielnicy.',
  template_code: null,
  device_instances: [],
};

export const SZABLON_SAFERING_LINE_OUT: CompleteMvBayTemplateSummary = {
  ...SZABLON_SAFERING_LINE_IN,
  template_ref: 'ABB__SAFERING__LINE_OUT',
  base_template: {
    ...SZABLON_SAFERING_LINE_IN.base_template,
    template_id: 'bay_template_line_out',
    name: 'Pole liniowe wyjściowe',
    bay_role: 'OUT',
    description: 'Pole liniowe wyjściowe SN — kabel/linia do ciągu podrzędnego.',
    ports: [{ kind: 'sn_output', suffix: 'out' }],
  },
  bay_kind: 'liniowe_odplywowe',
  bay_role: 'OUT',
  hash: '79492bdbc1780eb284341f3a6a166a30e152a50d814bdf943da2202a4eed4c94',
};

export const SZABLON_SAFERING_TRANSFORMER: CompleteMvBayTemplateSummary = {
  ...SZABLON_SAFERING_LINE_IN,
  template_ref: 'ABB__SAFERING__TRANSFORMER',
  base_template: {
    template_id: 'bay_template_transformer',
    name: 'Pole transformatorowe',
    bay_role: 'TR',
    description: 'Pole transformatorowe SN — przyłączenie transformatora SN/nN.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'CB', designation_q: 'Q0', position: 1, placement: 'MIDSTREAM', optional: false },
      { kind: 'DS_LINE', designation_q: 'Q2', position: 3, placement: 'DOWNSTREAM', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 4, placement: 'GROUND_BRANCH', optional: false },
      {
        kind: 'TRANSFORMER_DEVICE',
        designation_q: 'TR',
        position: 5,
        placement: 'DOWNSTREAM',
        optional: false,
      },
    ],
    ports: [{ kind: 'sn_transformer', suffix: 'trafo' }],
  },
  bay_kind: 'transformatorowe',
  bay_role: 'TR',
  hash: 'f79a607f97d071a138e8cdd81846ee1310df23b29157548089d25a03d19e0453',
};

export const SZABLON_UNIGEAR_LINE_OUT: CompleteMvBayTemplateSummary = {
  template_ref: 'ABB__UNIGEAR_ZS1__LINE_OUT',
  base_template: {
    template_id: 'bay_template_line_out',
    name: 'Pole liniowe wyjściowe',
    bay_role: 'OUT',
    description: 'Pole liniowe wyjściowe SN — kabel/linia do ciągu podrzędnego.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'CB', designation_q: 'Q0', position: 1, placement: 'MIDSTREAM', optional: false },
      { kind: 'CT', designation_q: 'T1', position: 2, placement: 'MIDSTREAM', optional: false },
      { kind: 'DS_LINE', designation_q: 'Q2', position: 3, placement: 'DOWNSTREAM', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 4, placement: 'GROUND_BRANCH', optional: false },
      { kind: 'CABLE_HEAD', designation_q: 'GK', position: 5, placement: 'DOWNSTREAM', optional: false },
    ],
    ports: [{ kind: 'sn_output', suffix: 'out' }],
  },
  manufacturer_ref: 'ABB',
  switchgear_family_ref: 'ABB__UNIGEAR_ZS1',
  bay_kind: 'liniowe_odplywowe',
  bay_role: 'OUT',
  source_status: 'repo_verified',
  source_refs: [UNIGEAR_SOURCE],
  version: 'public-product-page-2026-05',
  hash: '1c536d040ec2c31766e1d637883491fa1adaa0e727094ea2c795ab02a6482c68',
  notes_pl:
    'UniGear ZS1: kompletne pole SN z układem aparatury, portami i powiązaniem katalogowym rodziny rozdzielnicy.',
  template_code: null,
  device_instances: [],
};

export const SZABLON_UNIGEAR_TRANSFORMER: CompleteMvBayTemplateSummary = {
  ...SZABLON_UNIGEAR_LINE_OUT,
  template_ref: 'ABB__UNIGEAR_ZS1__TRANSFORMER',
  base_template: {
    template_id: 'bay_template_transformer',
    name: 'Pole transformatorowe',
    bay_role: 'TR',
    description: 'Pole transformatorowe SN — przyłączenie transformatora SN/nN.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'CB', designation_q: 'Q0', position: 1, placement: 'MIDSTREAM', optional: false },
      { kind: 'CT', designation_q: 'T1', position: 2, placement: 'MIDSTREAM', optional: false },
      { kind: 'DS_LINE', designation_q: 'Q2', position: 3, placement: 'DOWNSTREAM', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 4, placement: 'GROUND_BRANCH', optional: false },
      {
        kind: 'TRANSFORMER_DEVICE',
        designation_q: 'TR',
        position: 5,
        placement: 'DOWNSTREAM',
        optional: false,
      },
    ],
    ports: [{ kind: 'sn_transformer', suffix: 'trafo' }],
  },
  bay_kind: 'transformatorowe',
  bay_role: 'TR',
  hash: 'f4bc368492cf9c5b864fc1e822f6b787251b1b1d2c19bf42776205241c64c9cb',
};

export const SZABLON_UNIGEAR_MEASUREMENT: CompleteMvBayTemplateSummary = {
  ...SZABLON_UNIGEAR_LINE_OUT,
  template_ref: 'ABB__UNIGEAR_ZS1__MEASUREMENT',
  base_template: {
    template_id: 'bay_template_measurement',
    name: 'Pole pomiarowe',
    bay_role: 'MEASUREMENT',
    description: 'Pole pomiarowe SN — boczny tor pomiarowy z przekładnikami napięciowymi.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'VT', designation_q: 'T2', position: 1, placement: 'OFF_PATH', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 2, placement: 'GROUND_BRANCH', optional: false },
    ],
    ports: [{ kind: 'sn_measurement', suffix: 'meas' }],
  },
  bay_kind: 'pomiarowe',
  bay_role: 'MEASUREMENT',
  hash: '034265c55cec706ec27ec4e771e4b6e744a56ad1ea7d7138b0c7f9deb2be232d',
};

export const SZABLON_UNIGEAR_AUX: CompleteMvBayTemplateSummary = {
  ...SZABLON_UNIGEAR_LINE_OUT,
  template_ref: 'ABB__UNIGEAR_ZS1__AUX',
  base_template: {
    template_id: 'bay_template_aux',
    name: 'Pole potrzeb własnych',
    bay_role: 'FEEDER',
    description: 'Pole potrzeb własnych stacji — zasilanie urządzeń pomocniczych.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'FUSE', designation_q: 'F1', position: 1, placement: 'MIDSTREAM', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 2, placement: 'GROUND_BRANCH', optional: false },
    ],
    ports: [{ kind: 'sn_reserve', suffix: 'aux' }],
  },
  bay_kind: 'potrzeb_wlasnych',
  bay_role: 'FEEDER',
  hash: 'fdd43b1b9bdfa7bbc86d45bbdaedb0a32a3269cee155f4c4c81d07534f567827',
};

export const SZABLON_UNIGEAR_COUPLER: CompleteMvBayTemplateSummary = {
  ...SZABLON_UNIGEAR_LINE_OUT,
  template_ref: 'ABB__UNIGEAR_ZS1__COUPLER',
  base_template: {
    template_id: 'bay_template_coupler',
    name: 'Pole sprzęgłowe',
    bay_role: 'COUPLER',
    description: 'Sprzęgło sekcyjne — łącznik dwóch sekcji szyny SN.',
    devices: [
      { kind: 'DS_BUS', designation_q: 'Q1', position: 0, placement: 'UPSTREAM', optional: false },
      { kind: 'CB', designation_q: 'Q0', position: 1, placement: 'MIDSTREAM', optional: false },
      { kind: 'DS_BUS', designation_q: 'Q2', position: 2, placement: 'DOWNSTREAM', optional: false },
      { kind: 'ES', designation_q: 'Q9', position: 3, placement: 'GROUND_BRANCH', optional: false },
    ],
    ports: [
      { kind: 'sn_coupler', suffix: 'left' },
      { kind: 'sn_coupler', suffix: 'right' },
    ],
  },
  bay_kind: 'sprzeglowe_poprzeczne',
  bay_role: 'COUPLER',
  hash: 'e9d0abe075e9300dfacf2f3905d3b8f0ebefab8f52a834ec72ca11fb5f017f0e',
};

/**
 * Kompozycja PRODUCENTA (`device_instances`) — kształt `BayDeviceInstanceTemplate`
 * z `switchgear/device_instance.py`. Rodziny w repozytorium mają dziś tę listę
 * pustą, ale kontrakt ją niesie i to ona wnosi aparaty spoza układu kanonicznego:
 * wskaźnik obecności napięcia (VPIS — `allowed_apparatus_kinds` SafeRing wprost go
 * wymienia), przekaźnik i aparat strony nN. Fikstura odwzorowuje pole RMU
 * SafeRing wyposażone wg tej listy.
 */
export const KOMPOZYCJA_PRODUCENTA_VPIS: readonly BayDeviceInstanceWire[] = [
  {
    device_template_ref: 'ABB__SAFERING__LINE_OUT__DS__001',
    apparatus_kind: 'switch_disconnector',
    label: 'Q0',
    position_in_bay: 1,
    electrical_side: 'busbar_side',
    status_wyposazenia: 'FABRYCZNY',
  },
  {
    device_template_ref: 'ABB__SAFERING__LINE_OUT__ES__001',
    apparatus_kind: 'earthing_switch',
    label: 'Q9',
    position_in_bay: 2,
    electrical_side: 'earthing_branch',
    status_wyposazenia: 'FABRYCZNY',
  },
  {
    device_template_ref: 'ABB__SAFERING__LINE_OUT__VPIS__001',
    apparatus_kind: 'voltage_indicator',
    label: 'VPIS',
    position_in_bay: 3,
    electrical_side: 'metering_branch',
    status_wyposazenia: 'OPCJA',
  },
  {
    device_template_ref: 'ABB__SAFERING__LINE_OUT__CH__001',
    apparatus_kind: 'cable_head',
    label: 'GK',
    position_in_bay: 4,
    electrical_side: 'line_side',
    status_wyposazenia: 'FABRYCZNY',
  },
  {
    device_template_ref: 'ABB__SAFERING__LINE_OUT__INTERLOCK__001',
    apparatus_kind: 'interlock',
    label: 'BLK',
    position_in_bay: 5,
    electrical_side: 'line_side',
    status_wyposazenia: 'FABRYCZNY',
  },
];

export const SZABLON_SAFERING_LINE_OUT_PRODUCENCKI: CompleteMvBayTemplateSummary = {
  ...SZABLON_SAFERING_LINE_OUT,
  template_ref: 'ABB__SAFERING__LINE_OUT__PROD',
  template_code: 'SAFERING-C',
  device_instances: KOMPOZYCJA_PRODUCENTA_VPIS,
};

/** Rodzina ABB SafeRing — zrzut `GET /api/catalog/switchgear-families`. */
export const RODZINA_SAFERING: SwitchgearFamily = {
  switchgear_family_ref: 'ABB__SAFERING',
  manufacturer_ref: 'ABB',
  family_name: 'SafeRing',
  series_name: 'SafeRing',
  network_voltages_kv: [],
  um_classes_kv: [12.0, 17.5, 24.0],
  rated_current_options: [630],
  short_time_current_options: [16, 20, 21],
  insulation_type: 'sf6',
  construction_type: 'RMU',
  status: 'repo_verified',
  source_refs: [SAFERING_SOURCE],
  notes_pl: null,
};

/** Rodzina ABB UniGear ZS1 — zrzut `GET /api/catalog/switchgear-families`. */
export const RODZINA_UNIGEAR: SwitchgearFamily = {
  switchgear_family_ref: 'ABB__UNIGEAR_ZS1',
  manufacturer_ref: 'ABB',
  family_name: 'UniGear ZS1',
  series_name: 'UniGear ZS1',
  network_voltages_kv: [],
  um_classes_kv: [12.0, 17.5, 24.0],
  rated_current_options: [1250, 2500, 4000],
  short_time_current_options: [25, 31, 50, 63],
  insulation_type: 'air',
  construction_type: 'wysuwna',
  status: 'repo_verified',
  source_refs: [UNIGEAR_SOURCE],
  notes_pl: null,
};

/**
 * Blok fabryczny RMU K-K-T (dwie jednostki kablowe pierścienia + jednostka
 * transformatorowa) — najpowszechniejsza stacja SN/nN w sieci dystrybucyjnej.
 * Kolejność jednostek jest kolejnością bloku, nie sortowaniem podglądu.
 */
export const BLOK_RMU_K_K_T: readonly CompleteMvBayTemplateSummary[] = [
  SZABLON_SAFERING_LINE_IN,
  SZABLON_SAFERING_LINE_OUT,
  SZABLON_SAFERING_TRANSFORMER,
];

/** Wszystkie fikstury szablonów — wejście testów kompletności mapowań. */
export const WSZYSTKIE_SZABLONY: readonly CompleteMvBayTemplateSummary[] = [
  SZABLON_SAFERING_LINE_IN,
  SZABLON_SAFERING_LINE_OUT,
  SZABLON_SAFERING_TRANSFORMER,
  SZABLON_SAFERING_LINE_OUT_PRODUCENCKI,
  SZABLON_UNIGEAR_LINE_OUT,
  SZABLON_UNIGEAR_TRANSFORMER,
  SZABLON_UNIGEAR_MEASUREMENT,
  SZABLON_UNIGEAR_AUX,
  SZABLON_UNIGEAR_COUPLER,
];
