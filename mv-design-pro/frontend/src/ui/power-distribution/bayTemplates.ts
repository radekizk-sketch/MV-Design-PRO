/**
 * bayTemplates.ts - Kanoniczne szablony pol rozdzielczych.
 *
 * CANONICAL CONTRACT (BINDING):
 * - Szablony definiuja wymagany lancuch aparatow dla kazdej roli pola.
 * - Kolejnosc urzadzen: UPSTREAM -> MIDSTREAM -> DOWNSTREAM (tor mocy).
 * - OFF_PATH urzadzenia (Relay) umieszczone sa na koncu.
 * - Zgodne z REQUIRED_DEVICES z switchgearConfig.ts.
 * - 100% POLISH labels.
 */

import type { FieldRoleV1 } from '../sld/core/fieldDeviceContracts';
import {
  FieldRoleV1 as FR,
  DeviceTypeV1 as DT,
  DeviceElectricalRoleV1 as ER,
  DevicePowerPathPositionV1 as PP,
} from '../sld/core/fieldDeviceContracts';
import type { BayTemplate } from './types';

// =============================================================================
// SN FIELD TEMPLATES
// =============================================================================

const LINE_IN_TEMPLATE: BayTemplate = {
  fieldRole: FR.LINE_IN,
  labelPl: 'Pole liniowe wejsciowe',
  descriptionPl: 'Zasilanie stacji z magistrali SN - wylacznik + glowica kablowa',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa (gora)' },
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.UPSTREAM, required: false, labelPl: 'Rozlacznik' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: false, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Glowica kablowa (dol)' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: false, labelPl: 'Zabezpieczenie' },
  ],
};

const LINE_OUT_TEMPLATE: BayTemplate = {
  fieldRole: FR.LINE_OUT,
  labelPl: 'Pole liniowe wyjsciowe',
  descriptionPl: 'Wyjscie zasilania do kolejnej stacji - wylacznik + glowica kablowa',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa (gora)' },
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.UPSTREAM, required: false, labelPl: 'Rozlacznik' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: false, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Glowica kablowa (dol)' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: false, labelPl: 'Zabezpieczenie' },
  ],
};

const LINE_BRANCH_TEMPLATE: BayTemplate = {
  fieldRole: FR.LINE_BRANCH,
  labelPl: 'Pole odgalezieniowe',
  descriptionPl: 'Odgalezienie magistrali - wylacznik + glowica kablowa',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa (gora)' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Glowica kablowa (dol)' },
  ],
};

const GPZ_LINE_BAY_TEMPLATE: BayTemplate = {
  fieldRole: FR.GPZ_LINE_BAY,
  labelPl: 'Pole liniowe GPZ',
  descriptionPl: 'Kanoniczne pole odplywowe SN w GPZ: odlacznik, wylacznik, CT, uziemnik boczny, glowica kablowa i zabezpieczenie poza torem mocy',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Odlacznik od strony szyn' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik SN' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Glowica kablowa' },
    { deviceType: DT.ES, electricalRole: ER.POWER_PATH, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Uziemnik boczny' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Przekaznik zabezpieczeniowy' },
  ],
};

const TRANSFORMER_SN_NN_TEMPLATE: BayTemplate = {
  fieldRole: FR.TRANSFORMER_SN_NN,
  labelPl: 'Pole transformatorowe SN/nN',
  descriptionPl: 'Transformator SN/nN z pelnym osprzetem - CB, CT, Relay, Transformator',
  voltageLevelPl: 'SN/nN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa' },
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.UPSTREAM, required: false, labelPl: 'Rozlacznik' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.TRANSFORMER_DEVICE, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Transformator SN/nN' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Zabezpieczenie' },
  ],
};

const MEASUREMENT_SN_TEMPLATE: BayTemplate = {
  fieldRole: FR.MEASUREMENT_SN,
  labelPl: 'Pole pomiarowe SN',
  descriptionPl: 'Pole pomiarowe z dominujacym torem VT oraz opcjonalnym CT',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.VT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Przekladnik napieciowy' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: false, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.DOWNSTREAM, required: false, labelPl: 'Glowica kablowa' },
  ],
};

const PV_SN_TEMPLATE: BayTemplate = {
  fieldRole: FR.PV_SN,
  labelPl: 'Pole przylaczeniowe PV (SN)',
  descriptionPl: 'Przylaczenie zrodla fotowoltaicznego po stronie SN',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.GENERATOR_PV, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Generator PV' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Zabezpieczenie' },
  ],
};

const BESS_SN_TEMPLATE: BayTemplate = {
  fieldRole: FR.BESS_SN,
  labelPl: 'Pole przylaczeniowe BESS (SN)',
  descriptionPl: 'Przylaczenie magazynu energii po stronie SN',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.GENERATOR_BESS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Magazyn energii BESS' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Zabezpieczenie' },
  ],
};

const FW_SN_TEMPLATE: BayTemplate = {
  fieldRole: FR.FW_SN,
  labelPl: 'Pole przylaczeniowe FW (SN)',
  descriptionPl: 'Przylaczenie farmy wiatrowej po stronie SN',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.CABLE_HEAD, electricalRole: ER.TERMINATION, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Glowica kablowa' },
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.VT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Przekladnik napieciowy' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik' },
    { deviceType: DT.GENERATOR_FW, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Generator FW' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Zabezpieczenie' },
  ],
};

const COUPLER_SN_TEMPLATE: BayTemplate = {
  fieldRole: FR.COUPLER_SN,
  labelPl: 'Pole sprzegla sekcyjnego SN',
  descriptionPl: 'Sprzeglo laczace dwie sekcje szyny zbiorczej SN',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Rozlacznik sekcji A' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik sprzegla' },
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Rozlacznik sekcji B' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: false, labelPl: 'Zabezpieczenie sprzegla' },
  ],
};

const BUS_TIE_TEMPLATE: BayTemplate = {
  fieldRole: FR.BUS_TIE,
  labelPl: 'Lacznik szyn',
  descriptionPl: 'Lacznik szyn zbiorczych',
  voltageLevelPl: 'SN',
  devices: [
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.UPSTREAM, required: true, labelPl: 'Rozlacznik sekcji A' },
    { deviceType: DT.CB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik lacznika' },
    { deviceType: DT.DS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Rozlacznik sekcji B' },
  ],
};

// =============================================================================
// nN FIELD TEMPLATES
// =============================================================================

const MAIN_NN_TEMPLATE: BayTemplate = {
  fieldRole: FR.MAIN_NN,
  labelPl: 'Pole glowne nN',
  descriptionPl: 'Pole glowne rozdzielnicy niskiego napiecia - ACB glowny',
  voltageLevelPl: 'nN',
  devices: [
    { deviceType: DT.ACB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik powietrzny ACB' },
  ],
};

const FEEDER_NN_TEMPLATE: BayTemplate = {
  fieldRole: FR.FEEDER_NN,
  labelPl: 'Pole odplywowe nN',
  descriptionPl: 'Pole odplywowe niskiego napiecia - bezpiecznik',
  voltageLevelPl: 'nN',
  devices: [
    { deviceType: DT.FUSE, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Bezpiecznik' },
  ],
};

const PV_NN_TEMPLATE: BayTemplate = {
  fieldRole: FR.PV_NN,
  labelPl: 'Pole zrodla PV (nN)',
  descriptionPl: 'Przylaczenie zrodla fotowoltaicznego po stronie nN',
  voltageLevelPl: 'nN',
  devices: [
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.ACB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik powietrzny ACB' },
    { deviceType: DT.GENERATOR_PV, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Generator PV' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Zabezpieczenie' },
  ],
};

const BESS_NN_TEMPLATE: BayTemplate = {
  fieldRole: FR.BESS_NN,
  labelPl: 'Pole zrodla BESS (nN)',
  descriptionPl: 'Przylaczenie magazynu energii po stronie nN',
  voltageLevelPl: 'nN',
  devices: [
    { deviceType: DT.CT, electricalRole: ER.MEASUREMENT, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Przekladnik pradowy' },
    { deviceType: DT.ACB, electricalRole: ER.POWER_PATH, powerPathPosition: PP.MIDSTREAM, required: true, labelPl: 'Wylacznik powietrzny ACB' },
    { deviceType: DT.GENERATOR_BESS, electricalRole: ER.POWER_PATH, powerPathPosition: PP.DOWNSTREAM, required: true, labelPl: 'Magazyn energii BESS' },
    { deviceType: DT.RELAY, electricalRole: ER.PROTECTION, powerPathPosition: PP.OFF_PATH, required: true, labelPl: 'Zabezpieczenie' },
  ],
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

export const BAY_TEMPLATES: ReadonlyMap<FieldRoleV1, BayTemplate> = new Map([
  [FR.GPZ_LINE_BAY, GPZ_LINE_BAY_TEMPLATE],
  [FR.LINE_IN, LINE_IN_TEMPLATE],
  [FR.LINE_OUT, LINE_OUT_TEMPLATE],
  [FR.LINE_BRANCH, LINE_BRANCH_TEMPLATE],
  [FR.TRANSFORMER_SN_NN, TRANSFORMER_SN_NN_TEMPLATE],
  [FR.MEASUREMENT_SN, MEASUREMENT_SN_TEMPLATE],
  [FR.PV_SN, PV_SN_TEMPLATE],
  [FR.BESS_SN, BESS_SN_TEMPLATE],
  [FR.FW_SN, FW_SN_TEMPLATE],
  [FR.COUPLER_SN, COUPLER_SN_TEMPLATE],
  [FR.BUS_TIE, BUS_TIE_TEMPLATE],
  [FR.MAIN_NN, MAIN_NN_TEMPLATE],
  [FR.FEEDER_NN, FEEDER_NN_TEMPLATE],
  [FR.PV_NN, PV_NN_TEMPLATE],
  [FR.BESS_NN, BESS_NN_TEMPLATE],
]);

export const SN_TEMPLATES: readonly BayTemplate[] = [
  GPZ_LINE_BAY_TEMPLATE,
  LINE_IN_TEMPLATE,
  LINE_OUT_TEMPLATE,
  LINE_BRANCH_TEMPLATE,
  TRANSFORMER_SN_NN_TEMPLATE,
  MEASUREMENT_SN_TEMPLATE,
  PV_SN_TEMPLATE,
  BESS_SN_TEMPLATE,
  FW_SN_TEMPLATE,
  COUPLER_SN_TEMPLATE,
  BUS_TIE_TEMPLATE,
];

export const NN_TEMPLATES: readonly BayTemplate[] = [
  MAIN_NN_TEMPLATE,
  FEEDER_NN_TEMPLATE,
  PV_NN_TEMPLATE,
  BESS_NN_TEMPLATE,
];
