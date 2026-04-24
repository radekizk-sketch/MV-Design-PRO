/**
 * Field & Device Modeling Contracts V1 — CANONICAL-grade pole/aparat/stacja.
 *
 * CANONICAL CONTRACT (BINDING):
 * - Wersja: V1
 * - Immutable (readonly).
 * - Deterministic (sorted by id, stable enums).
 * - ZAKAZ auto-uzupelnien: brak danych → FixAction (stabilny kod PL).
 * - ZAKAZ fabrykowania urzadzen/funkcji ochronnych.
 *
 * MODEL ARCHITEKTONICZNY: M2
 * - VisualGraphV1 pozostaje zamrozony (stacja = 1 wezel).
 * - Field/Device sa w LayoutResultV1.SwitchgearBlockV1 (anchor mapping).
 * - Overlay/Inspector korzystaja z anchorId → elementId.
 *
 * RUN #3D: CANONICAL-grade device & field modeling + formal trunk↔station embedding binding.
 */

// =============================================================================
// FIELD ROLE (kanoniczny enum)
// =============================================================================

/**
 * Rola pola rozdzielczego w stacji.
 *
 * Kazda rola definiuje minimalny zestaw wymaganych urzadzen
 * (DeviceRequirementSetV1).
 */
export const FieldRoleV1 = {
  /** Pole liniowe wejsciowe (zasilanie z magistrali) */
  LINE_IN: 'LINE_IN',
  /** Pole liniowe wyjsciowe (zasilanie dalszych stacji) */
  LINE_OUT: 'LINE_OUT',
  /** Pole odgalezieniowe (branch) */
  LINE_BRANCH: 'LINE_BRANCH',
  /** Kanoniczne pole liniowe GPZ (wyjscie SN z rozdzielni GPZ) */
  GPZ_LINE_BAY: 'GPZ_LINE_BAY',
  /** Pole transformatorowe SN/nN */
  TRANSFORMER_SN_NN: 'TRANSFORMER_SN_NN',
  /** Pole pomiarowe SN */
  MEASUREMENT_SN: 'MEASUREMENT_SN',
  /** Pole przylaczeniowe PV na SN */
  PV_SN: 'PV_SN',
  /** Pole przylaczeniowe BESS na SN */
  BESS_SN: 'BESS_SN',
  /** Pole przylaczeniowe FW na SN */
  FW_SN: 'FW_SN',
  /** Pole sprzegla sekcyjnego SN */
  COUPLER_SN: 'COUPLER_SN',
  /** Pole lacznika szyn (jesli modelowane inaczej niz COUPLER_SN) */
  BUS_TIE: 'BUS_TIE',

  // --- nN Field Roles (RUN #3F) ---
  /** Pole glowne nN (ACB glowny) */
  MAIN_NN: 'MAIN_NN',
  /** Pole odplywowe nN */
  FEEDER_NN: 'FEEDER_NN',
  /** Pole zrodla PV na nN */
  PV_NN: 'PV_NN',
  /** Pole zrodla BESS na nN */
  BESS_NN: 'BESS_NN',
} as const;

export type FieldRoleV1 = (typeof FieldRoleV1)[keyof typeof FieldRoleV1];

// =============================================================================
// EMBEDDING ROLE (trunk↔station binding)
// =============================================================================

/**
 * Rola stacji wzgledem trunk segmentacji.
 *
 * Wyznaczana deterministycznie z:
 * - incidentTrunkEdges (ile krawedzi TRUNK dotyka stacji)
 * - incidentBranchEdges (ile krawedzi BRANCH)
 * - busSections count (ile szynozbirczych)
 * - coupler presence
 *
 * MAPOWANIE NA TYPY STACJI (A/B/C/D):
 * - A = TRUNK_LEAF
 * - B = TRUNK_INLINE
 * - C = TRUNK_BRANCH
 * - D = LOCAL_SECTIONAL
 *
 * UWAGA: Nie uzywaj "A/B/C/D" w runtime. Tylko w docs jako mapowanie.
 */
export const EmbeddingRoleV1 = {
  /** Stacja koncowa — 1 krawedz TRUNK, brak BRANCH, brak wyjscia trunk */
  TRUNK_LEAF: 'TRUNK_LEAF',
  /** Stacja przelotowa — 2 krawedzie TRUNK, brak BRANCH */
  TRUNK_INLINE: 'TRUNK_INLINE',
  /** Stacja odgalezieniowa — 1 krawedz TRUNK + >= 1 BRANCH */
  TRUNK_BRANCH: 'TRUNK_BRANCH',
  /** Stacja sekcyjna — >= 2 busSections, sprzeglo */
  LOCAL_SECTIONAL: 'LOCAL_SECTIONAL',
} as const;

export type EmbeddingRoleV1 = (typeof EmbeddingRoleV1)[keyof typeof EmbeddingRoleV1];

// =============================================================================
// DEVICE ELECTRICAL ROLE
// =============================================================================

/**
 * Rola elektryczna urzadzenia w polu.
 *
 * Determinuje pozycje urzadzenia w siatce pola:
 * - POWER_PATH: na torze mocy (CB, DS, CT, ES, cable head)
 * - MEASUREMENT: pomiarowe (VT, CT pomiarowy)
 * - PROTECTION: ochronne (Relay — poza torem mocy)
 * - TERMINATION: koncowe (glowica kablowa, trojkat)
 */
export const DeviceElectricalRoleV1 = {
  POWER_PATH: 'POWER_PATH',
  MEASUREMENT: 'MEASUREMENT',
  PROTECTION: 'PROTECTION',
  TERMINATION: 'TERMINATION',
} as const;

export type DeviceElectricalRoleV1 = (typeof DeviceElectricalRoleV1)[keyof typeof DeviceElectricalRoleV1];

// =============================================================================
// DEVICE POWER PATH POSITION
// =============================================================================

/**
 * Pozycja urzadzenia na torze mocy (kolejnosc od szyny do kabla).
 */
export const DevicePowerPathPositionV1 = {
  /** Blisko szyny (DS, ES) */
  UPSTREAM: 'UPSTREAM',
  /** Srodek toru (CB, CT) */
  MIDSTREAM: 'MIDSTREAM',
  /** Blisko kabla/linii (glowica kablowa) */
  DOWNSTREAM: 'DOWNSTREAM',
  /** Poza torem mocy (relay, VT boczny) */
  OFF_PATH: 'OFF_PATH',
} as const;

export type DevicePowerPathPositionV1 =
  (typeof DevicePowerPathPositionV1)[keyof typeof DevicePowerPathPositionV1];

// =============================================================================
// DEVICE TYPE (rozszerzony enum)
// =============================================================================

/**
 * Typ urzadzenia — kanoniczny enum.
 *
 * Rozszerza DeviceKind z topologyInputReader o typy specyficzne
 * dla pola (CABLE_HEAD, TRANSFORMER_DEVICE, GENERATOR_DEVICE, PCS, BATTERY, ACB).
 */
export const DeviceTypeV1 = {
  CB: 'CB',
  DS: 'DS',
  ES: 'ES',
  CT: 'CT',
  VT: 'VT',
  RELAY: 'RELAY',
  LOAD_SWITCH: 'LOAD_SWITCH',
  FUSE: 'FUSE',
  CABLE_HEAD: 'CABLE_HEAD',
  TRANSFORMER_DEVICE: 'TRANSFORMER_DEVICE',
  GENERATOR_PV: 'GENERATOR_PV',
  GENERATOR_BESS: 'GENERATOR_BESS',
  GENERATOR_FW: 'GENERATOR_FW',
  PCS: 'PCS',
  BATTERY: 'BATTERY',
  ACB: 'ACB',
} as const;

export type DeviceTypeV1 = (typeof DeviceTypeV1)[keyof typeof DeviceTypeV1];

// =============================================================================
// DEVICE REQUIREMENT
// =============================================================================

/**
 * Wymaganie urzadzenia w polu.
 *
 * ZAKAZ: "jesli brak CT to dorysuj" — brak CT jesli wymagany → FixAction.
 */
export const DeviceRequirementLevel = {
  REQUIRED: 'REQUIRED',
  REQUIRED_IF: 'REQUIRED_IF',
  OPTIONAL: 'OPTIONAL',
} as const;

export type DeviceRequirementLevel =
  (typeof DeviceRequirementLevel)[keyof typeof DeviceRequirementLevel];

export interface DeviceRequirementV1 {
  readonly deviceType: DeviceTypeV1;
  readonly level: DeviceRequirementLevel;
  readonly electricalRole: DeviceElectricalRoleV1;
  readonly powerPathPosition: DevicePowerPathPositionV1;
  /** Warunek dla REQUIRED_IF (np. "pole ma RELAY" / "domena wskazuje ochrone") */
  readonly condition: string | null;
}

/**
 * Zestaw wymagan urzadzen dla danego FieldRole.
 */
export interface DeviceRequirementSetV1 {
  readonly fieldRole: FieldRoleV1;
  readonly requirements: readonly DeviceRequirementV1[];
}

// =============================================================================
// FIELD V1
// =============================================================================

/**
 * Pole rozdzielcze — immutable kontrakt.
 *
 * Pole jest logiczna grupa urzadzen w stacji, np.:
 * - Pole liniowe wejsciowe: CB + CT + Relay + glowica kablowa
 * - Pole transformatorowe: CB_SN + CT_SN + Relay + TR + ACB_NN
 * - Pole PV: CB + CT + Relay + TR_blokowy? + PV
 */
export interface FieldV1 {
  /** Stabilne ID pola */
  readonly id: string;
  /** ID stacji do ktorej nalezy pole */
  readonly stationId: string;
  /** ID sekcji szynowej do ktorej przylaczone jest pole */
  readonly busSectionId: string;
  /** Rola pola */
  readonly fieldRole: FieldRoleV1;
  /** Terminale polaczeniowe (referencje do ConnectionNode) */
  readonly terminals: FieldTerminalsV1;
  /** Wymagania urzadzen dla tego pola */
  readonly requiredDevices: DeviceRequirementSetV1;
  /** ID urzadzen w polu (sortowane) */
  readonly deviceIds: readonly string[];
  /** Referencja katalogowa (brak → FixAction "catalog.ref_missing") */
  readonly catalogRef: CatalogRefDetailV1 | null;
}

/**
 * Terminale pola — referencje do ConnectionNode.
 */
export interface FieldTerminalsV1 {
  /** Wezel wejsciowy (od strony szyny/magistrali) */
  readonly incomingNodeId: string | null;
  /** Wezel wyjsciowy (od strony odbiorcy/linii) */
  readonly outgoingNodeId: string | null;
  /** Wezel odgalezieniowy (branch) */
  readonly branchNodeId: string | null;
  /** Wezel generatora (PV/BESS) */
  readonly generatorNodeId: string | null;
}

// =============================================================================
// DEVICE V1
// =============================================================================

/**
 * Urzadzenie w polu — immutable kontrakt.
 *
 * REGULY:
 * - CT zawsze w torze mocy (POWER_PATH, MIDSTREAM).
 * - Relay zawsze poza torem (PROTECTION, OFF_PATH).
 * - Relay MUSI miec boundCbId (brak → FixAction).
 * - Glowica kablowa = trojkat (TERMINATION, DOWNSTREAM).
 * - Brak urzadzenia nie jest "fallback" — to FixAction.
 */
export interface DeviceV1 {
  /** Stabilne ID urzadzenia */
  readonly id: string;
  /** ID pola do ktorego nalezy urzadzenie */
  readonly fieldId: string;
  /** Typ urzadzenia */
  readonly deviceType: DeviceTypeV1;
  /** Rola elektryczna */
  readonly electricalRole: DeviceElectricalRoleV1;
  /** Pozycja na torze mocy */
  readonly powerPathPosition: DevicePowerPathPositionV1;
  /** Referencja katalogowa (brak → FixAction) */
  readonly catalogRef: CatalogRefDetailV1 | null;
  /** Powiazania logiczne */
  readonly logicalBindings: DeviceLogicalBindingsV1;
  /** Parametry urzadzenia (typed, immutable) */
  readonly parameters: DeviceParametersV1;
}

/**
 * Powiazania logiczne urzadzenia.
 */
export interface DeviceLogicalBindingsV1 {
  /** ID wyłącznika do którego przypisany jest relay (mandatory dla RELAY) */
  readonly boundCbId: string | null;
  /** ID przekładników prądowych (CT) — deterministycznie posortowane */
  readonly ctInputIds: readonly string[];
}

/**
 * Parametry urzadzenia (typed, immutable).
 *
 * Brak danych → null (nie "domyslny"). Brak wymaganego parametru → FixAction.
 */
export interface DeviceParametersV1 {
  /** Przekładnik: ratio (np. "100/5") */
  readonly ctRatio: string | null;
  /** Wyłącznik: zdolność wyłączania [kA] */
  readonly breakingCapacityKa: number | null;
  /** Wyłącznik: prąd znamionowy [A] */
  readonly ratedCurrentA: number | null;
  /** Relay: krzywa/nastawienia (z ProtectionBinding) */
  readonly relaySettings: string | null;
  /** Transformator: moc znamionowa [MVA] */
  readonly ratedPowerMva: number | null;
  /** Transformator: napięcie zwarcia [%] */
  readonly ukPercent: number | null;
  /** Transformator: grupa polaczen */
  readonly vectorGroup: string | null;
}

// =============================================================================
// BUS SECTION V1
// =============================================================================

/**
 * Sekcja szyny zbiorczej — immutable kontrakt.
 *
 * Stacja moze miec wiele sekcji (np. TYPE_D: 2 sekcje z couplerem).
 * orderIndex wyznaczany deterministycznie (sort by id, tie-break by index).
 */
export interface BusSectionV1 {
  /** Stabilne ID sekcji */
  readonly id: string;
  /** ID stacji */
  readonly stationId: string;
  /** Index porzadkowy (deterministyczny; 0-based) */
  readonly orderIndex: number;
  /** Referencja katalogowa (opcjonalna; jesli renderowana → wymagana) */
  readonly catalogRef: CatalogRefDetailV1 | null;
}

// =============================================================================
// STATION BLOCK DETAIL V1
// =============================================================================

/**
 * Szczegoly bloku stacji — rozszerzenie SwitchgearBlockV1.
 *
 * Zawiera pelna strukture pola/urzadzen z kotwicami (anchor mapping).
 * Uzywane przez overlay/inspector do identyfikacji elementow.
 */
export interface StationBlockDetailV1 {
  /** ID bloku (= id stacji w VisualGraphV1) */
  readonly blockId: string;
  /** Rola w trunk segmentacji */
  readonly embeddingRole: EmbeddingRoleV1;
  /** Sekcje szyn (sortowane po orderIndex) */
  readonly busSections: readonly BusSectionV1[];
  /** Pola (sortowane po id) */
  readonly fields: readonly FieldV1[];
  /** Urzadzenia (sortowane po id) */
  readonly devices: readonly DeviceV1[];
  /** Porty bloku */
  readonly ports: StationBlockPortsV1;
  /** ID pola sprzegla (mandatory for LOCAL_SECTIONAL) */
  readonly couplerFieldId: string | null;
  /** Kotwice urzadzen do renderowania (elementId → anchor) */
  readonly deviceAnchors: readonly DeviceAnchorV1[];
  /** FixActions walidacji stacji */
  readonly fixActions: readonly FieldDeviceFixActionV1[];
}

/**
 * Porty bloku stacji.
 */
export interface StationBlockPortsV1 {
  /** Port wejsciowy trunk (mandatory for TRUNK_*) */
  readonly trunkInPort: string | null;
  /** Port wyjsciowy trunk (mandatory for TRUNK_INLINE, LOCAL_SECTIONAL) */
  readonly trunkOutPort: string | null;
  /** Port odgalezieniowy (mandatory for TRUNK_BRANCH) */
  readonly branchPort: string | null;
}

// =============================================================================
// DEVICE ANCHOR (kotwica do renderowania)
// =============================================================================

/**
 * Kotwica urzadzenia — mapowanie elementId → pozycja w bloku.
 *
 * Uzywane przez:
 * - Renderer: rysowanie symbolu urzadzenia w pozycji anchor
 * - Overlay: nakladanie wynikow na urzadzenie
 * - Inspector: klikniecie w obszar anchor → wyswietlenie danych urzadzenia
 */
export interface DeviceAnchorV1 {
  /** ID urzadzenia (= DeviceV1.id) */
  readonly deviceId: string;
  /** ID pola (= FieldV1.id) */
  readonly fieldId: string;
  /** Typ urzadzenia */
  readonly deviceType: DeviceTypeV1;
  /** Rola elektryczna */
  readonly electricalRole: DeviceElectricalRoleV1;
  /** Pozycja wzgledna w bloku (0-1 x/y) — obliczona przez layout */
  readonly relativeX: number;
  readonly relativeY: number;
  /** Rozmiar kotwicy [px] */
  readonly width: number;
  readonly height: number;
}

// =============================================================================
// CATALOG REF DETAIL V1 (rozszerzona referencja)
// =============================================================================

/**
 * Rozszerzona referencja katalogowa.
 *
 * ZAKAZ: brak danych → FixAction, nie "domyslny".
 */
export interface CatalogRefDetailV1 {
  /** ID elementu ktorego dotyczy */
  readonly elementId: string;
  /** Kategoria (FIELD|DEVICE|BRANCH|STATION|GENERATOR) */
  readonly category: CatalogCategoryV1;
  /** ID w katalogu */
  readonly catalogId: string;
  /** Wersja katalogu */
  readonly catalogVersion: string | null;
  /** Producent */
  readonly manufacturer: string | null;
  /** Nazwa */
  readonly name: string;
  /** Parametry znamionowe (structured) */
  readonly ratings: CatalogRatingsV1 | null;
}

export const CatalogCategoryV1 = {
  FIELD: 'FIELD',
  DEVICE: 'DEVICE',
  BRANCH: 'BRANCH',
  STATION: 'STATION',
  GENERATOR: 'GENERATOR',
} as const;

export type CatalogCategoryV1 = (typeof CatalogCategoryV1)[keyof typeof CatalogCategoryV1];

export interface CatalogRatingsV1 {
  /** Zdolność wyłączania [kA] (CB) */
  readonly breakingCapacityKa: number | null;
  /** Prąd znamionowy [A] */
  readonly ratedCurrentA: number | null;
  /** Moc znamionowa [MVA] (TR) */
  readonly ratedPowerMva: number | null;
  /** Napięcie znamionowe [kV] */
  readonly ratedVoltageKv: number | null;
  /** Przekladnik: ratio */
  readonly ctRatio: string | null;
}

// =============================================================================
// FIX ACTIONS (stabilne kody PL)
// =============================================================================

/**
 * FixAction z polami + urzadzeniami — stabilne kody.
 *
 * Kody sa stabilne (nie zmieniaja sie miedzy wersjami).
 * Komunikaty sa w jezyku polskim.
 */
export interface FieldDeviceFixActionV1 {
  /** Stabilny kod bledu */
  readonly code: string;
  /** Komunikat PL */
  readonly message: string;
  /** Dotyczy elementu (id) */
  readonly elementId: string | null;
  /** Podpowiedz naprawy (PL) */
  readonly fixHint: string;
}

/**
 * Stabilne kody FixAction dla pol i urzadzen.
 */
export const FieldDeviceFixCodes = {
  // Pola
  FIELD_DEVICE_MISSING_CB: 'field.device_missing.cb',
  FIELD_DEVICE_MISSING_DS: 'field.device_missing.ds',
  FIELD_DEVICE_MISSING_ES: 'field.device_missing.es',
  FIELD_DEVICE_MISSING_CT: 'field.device_missing.ct',
  FIELD_DEVICE_MISSING_VT: 'field.device_missing.vt',
  FIELD_DEVICE_MISSING_RELAY: 'field.device_missing.relay',
  FIELD_DEVICE_MISSING_CABLE_HEAD: 'field.device_missing.cable_head',
  FIELD_DEVICE_MISSING_TRANSFORMER: 'field.device_missing.transformer',
  FIELD_DEVICE_MISSING_ACB: 'field.device_missing.acb',
  FIELD_DEVICE_MISSING_GENERATOR: 'field.device_missing.generator',

  // Stacje
  STATION_EMBEDDING_UNDETERMINED: 'station.embedding_role_undetermined',
  STATION_TYPOLOGY_CONFLICT: 'station.typology_conflict',
  STATION_COUPLER_MISSING: 'station.coupler_missing',
  STATION_TRANSFORMER_MISSING: 'station.transformer_missing_for_sn_nn',
  STATION_LINE_IN_MISSING: 'station.line_in_field_missing',
  STATION_LINE_OUT_MISSING: 'station.line_out_field_missing',
  STATION_BRANCH_FIELD_MISSING: 'station.branch_field_missing',
  STATION_NN_SWITCHGEAR_MISSING: 'station.nn_switchgear_missing',
  STATION_MULTIPLE_BRANCHES: 'station.multiple_branches_requires_explicit_ports',

  // Katalogi
  CATALOG_REF_MISSING: 'catalog.ref_missing',
  CATALOG_REF_INCOMPLETE: 'catalog.ref_incomplete',

  // Parametry
  DEVICE_CB_RATING_MISSING: 'device.cb.breaking_capacity_missing',
  DEVICE_CT_RATIO_MISSING: 'device.ct.ratio_missing',
  DEVICE_RELAY_SETTINGS_MISSING: 'device.relay.settings_missing',
  DEVICE_TR_POWER_MISSING: 'device.transformer.rated_power_missing',

  // Protection
  PROTECTION_RELAY_BINDING_MISSING: 'protection.relay_binding_missing',
  PROTECTION_RELAY_CB_MISSING: 'protection.relay_cb_binding_missing',

  // Branch
  BRANCH_NOP_STATE_MISSING: 'branch.nop_state_missing',

  // Generator
  GENERATOR_BLOCK_TR_MISSING: 'generator.block_transformer_missing',
  GENERATOR_BLOCK_TR_INVALID: 'generator.block_transformer_invalid',
  GENERATOR_CONNECTION_VARIANT_MISSING: 'generator.connection_variant_missing',
  GENERATOR_CONNECTION_VARIANT_INVALID: 'generator.connection_variant_invalid',
  GENERATOR_STATION_REF_MISSING: 'generator.station_ref_missing',
  GENERATOR_STATION_REF_INVALID: 'generator.station_ref_invalid',
  // Generator: hard PV/BESS transformer enforcement (RUN #3G §2)
  GENERATOR_NN_VARIANT_REQUIRES_STATION_TR: 'generator.nn_variant_requires_station_transformer',
  GENERATOR_BLOCK_VARIANT_REQUIRES_BLOCK_TR: 'generator.block_variant_requires_block_transformer',
  GENERATOR_DIRECT_SN_FORBIDDEN: 'generator.direct_sn_connection_forbidden',

  // Model
  MODEL_NN_SCOPE_MISSING: 'model.nn_scope_missing',
} as const;

export type FieldDeviceFixCode =
  (typeof FieldDeviceFixCodes)[keyof typeof FieldDeviceFixCodes];

// =============================================================================
// DEVICE REQUIREMENT SETS (kanoniczne per FieldRole)
// =============================================================================

function req(
  deviceType: DeviceTypeV1,
  level: DeviceRequirementLevel,
  electricalRole: DeviceElectricalRoleV1,
  powerPathPosition: DevicePowerPathPositionV1,
  condition: string | null = null,
): DeviceRequirementV1 {
  return { deviceType, level, electricalRole, powerPathPosition, condition };
}

const R = DeviceRequirementLevel;
const E = DeviceElectricalRoleV1;
const P = DevicePowerPathPositionV1;
const D = DeviceTypeV1;

/**
 * Kanoniczne zestawy wymagan urzadzen per FieldRole.
 *
 * ZAKAZ: "jesli brak CT to dorysuj" — brak wymaganego urzadzenia → FixAction.
 */
export const DEVICE_REQUIREMENT_SETS: Record<FieldRoleV1, DeviceRequirementSetV1> = {
  [FieldRoleV1.GPZ_LINE_BAY]: {
    fieldRole: FieldRoleV1.GPZ_LINE_BAY,
    requirements: [
      req(D.DS, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.MIDSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.ES, R.REQUIRED, E.POWER_PATH, P.OFF_PATH),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.LINE_IN]: {
    fieldRole: FieldRoleV1.LINE_IN,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED_IF, E.MEASUREMENT, P.MIDSTREAM, 'pole ma RELAY lub domena wskazuje ochronę'),
      req(D.RELAY, R.OPTIONAL, E.PROTECTION, P.OFF_PATH),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
      req(D.ES, R.OPTIONAL, E.POWER_PATH, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.LINE_OUT]: {
    fieldRole: FieldRoleV1.LINE_OUT,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED_IF, E.MEASUREMENT, P.MIDSTREAM, 'pole ma RELAY lub domena wskazuje ochronę'),
      req(D.RELAY, R.OPTIONAL, E.PROTECTION, P.OFF_PATH),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
      req(D.ES, R.OPTIONAL, E.POWER_PATH, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.LINE_BRANCH]: {
    fieldRole: FieldRoleV1.LINE_BRANCH,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED_IF, E.MEASUREMENT, P.MIDSTREAM, 'pole ma RELAY lub domena wskazuje ochronę'),
      req(D.RELAY, R.OPTIONAL, E.PROTECTION, P.OFF_PATH),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.TRANSFORMER_SN_NN]: {
    fieldRole: FieldRoleV1.TRANSFORMER_SN_NN,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.TRANSFORMER_DEVICE, R.REQUIRED, E.POWER_PATH, P.MIDSTREAM),
      req(D.ACB, R.REQUIRED_IF, E.POWER_PATH, P.DOWNSTREAM, 'strona nN modelowana'),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.MEASUREMENT_SN]: {
    fieldRole: FieldRoleV1.MEASUREMENT_SN,
    requirements: [
      req(D.VT, R.REQUIRED, E.MEASUREMENT, P.OFF_PATH),
      req(D.CT, R.OPTIONAL, E.MEASUREMENT, P.MIDSTREAM),
      req(D.CABLE_HEAD, R.OPTIONAL, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.PV_SN]: {
    fieldRole: FieldRoleV1.PV_SN,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.TRANSFORMER_DEVICE, R.REQUIRED_IF, E.POWER_PATH, P.MIDSTREAM, 'domena wskazuje TR blokowy'),
      req(D.GENERATOR_PV, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.BESS_SN]: {
    fieldRole: FieldRoleV1.BESS_SN,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.TRANSFORMER_DEVICE, R.REQUIRED_IF, E.POWER_PATH, P.MIDSTREAM, 'domena wskazuje TR blokowy'),
      req(D.GENERATOR_BESS, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.FW_SN]: {
    fieldRole: FieldRoleV1.FW_SN,
    requirements: [
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.VT, R.REQUIRED_IF, E.MEASUREMENT, P.OFF_PATH, 'pole wymaga toru VT'),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.TRANSFORMER_DEVICE, R.REQUIRED_IF, E.POWER_PATH, P.MIDSTREAM, 'domena wskazuje TR blokowy'),
      req(D.GENERATOR_FW, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
      req(D.CABLE_HEAD, R.REQUIRED, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.COUPLER_SN]: {
    fieldRole: FieldRoleV1.COUPLER_SN,
    requirements: [
      req(D.DS, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.MIDSTREAM),
      req(D.DS, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
      req(D.RELAY, R.OPTIONAL, E.PROTECTION, P.OFF_PATH),
    ],
  },
  [FieldRoleV1.BUS_TIE]: {
    fieldRole: FieldRoleV1.BUS_TIE,
    requirements: [
      req(D.DS, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CB, R.REQUIRED, E.POWER_PATH, P.MIDSTREAM),
      req(D.DS, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
    ],
  },

  // --- nN Field Role Requirements (RUN #3F) ---

  [FieldRoleV1.MAIN_NN]: {
    fieldRole: FieldRoleV1.MAIN_NN,
    requirements: [
      req(D.ACB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED_IF, E.MEASUREMENT, P.MIDSTREAM, 'pole ma RELAY lub domena wskazuje ochronę'),
      req(D.RELAY, R.OPTIONAL, E.PROTECTION, P.OFF_PATH),
    ],
  },
  [FieldRoleV1.FEEDER_NN]: {
    fieldRole: FieldRoleV1.FEEDER_NN,
    requirements: [
      req(D.FUSE, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CABLE_HEAD, R.OPTIONAL, E.TERMINATION, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.PV_NN]: {
    fieldRole: FieldRoleV1.PV_NN,
    requirements: [
      req(D.ACB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.GENERATOR_PV, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
    ],
  },
  [FieldRoleV1.BESS_NN]: {
    fieldRole: FieldRoleV1.BESS_NN,
    requirements: [
      req(D.ACB, R.REQUIRED, E.POWER_PATH, P.UPSTREAM),
      req(D.CT, R.REQUIRED, E.MEASUREMENT, P.MIDSTREAM),
      req(D.RELAY, R.REQUIRED, E.PROTECTION, P.OFF_PATH),
      req(D.GENERATOR_BESS, R.REQUIRED, E.POWER_PATH, P.DOWNSTREAM),
    ],
  },
};

// =============================================================================
// VALIDATORS
// =============================================================================

/**
 * Waliduje pole pod katem wymagan urzadzen.
 *
 * ZAKAZ auto-uzupelnien: brak wymaganego urzadzenia → FixAction.
 */
export function validateFieldDevices(
  field: FieldV1,
  devices: readonly DeviceV1[],
  hasRelayInField: boolean,
  domainIndicatesProtection: boolean,
): readonly FieldDeviceFixActionV1[] {
  const fixActions: FieldDeviceFixActionV1[] = [];
  const requirements = DEVICE_REQUIREMENT_SETS[field.fieldRole];

  if (!requirements) {
    return fixActions;
  }

  const fieldDevices = devices.filter(d => d.fieldId === field.id);
  const deviceTypes = new Set(fieldDevices.map(d => d.deviceType));

  for (const requirement of requirements.requirements) {
    const isPresent = deviceTypes.has(requirement.deviceType);

    if (requirement.level === DeviceRequirementLevel.REQUIRED && !isPresent) {
      fixActions.push({
        code: deviceTypeToFixCode(requirement.deviceType),
        message: `Pole ${field.id} (${field.fieldRole}): brak wymaganego urządzenia ${requirement.deviceType}`,
        elementId: field.id,
        fixHint: `Dodaj urządzenie ${requirement.deviceType} do pola ${field.id}`,
      });
    }

    if (requirement.level === DeviceRequirementLevel.REQUIRED_IF && !isPresent) {
      // Sprawdz warunek
      const conditionMet =
        (requirement.condition?.includes('RELAY') && hasRelayInField) ||
        (requirement.condition?.includes('ochronę') && domainIndicatesProtection) ||
        (requirement.condition?.includes('ochrony') && domainIndicatesProtection) ||
        (requirement.condition?.includes('nN modelowana') && field.terminals.outgoingNodeId !== null) ||
        (requirement.condition?.includes('TR blokowy') && fieldDevices.some(d => d.deviceType === DeviceTypeV1.TRANSFORMER_DEVICE));

      if (conditionMet) {
        fixActions.push({
          code: deviceTypeToFixCode(requirement.deviceType),
          message: `Pole ${field.id} (${field.fieldRole}): brak urzadzenia ${requirement.deviceType} (warunek: ${requirement.condition})`,
          elementId: field.id,
          fixHint: `Dodaj urządzenie ${requirement.deviceType} do pola ${field.id}`,
        });
      }
    }
  }

  // Relay musi miec boundCbId
  for (const device of fieldDevices) {
    if (device.deviceType === DeviceTypeV1.RELAY && device.logicalBindings.boundCbId === null) {
      fixActions.push({
        code: FieldDeviceFixCodes.PROTECTION_RELAY_CB_MISSING,
        message: `Relay ${device.id}: brak powiązania z wyłącznikiem (boundCbId)`,
        elementId: device.id,
        fixHint: `Przypisz relay ${device.id} do wyłącznika CB w polu ${field.id}`,
      });
    }

    // Katalog wymagany
    if (device.catalogRef === null) {
      fixActions.push({
        code: FieldDeviceFixCodes.CATALOG_REF_MISSING,
        message: `Urzadzenie ${device.id} (${device.deviceType}): brak referencji katalogowej`,
        elementId: device.id,
        fixHint: `Przypisz typ z katalogu do urządzenia ${device.id}`,
      });
    }
  }

  return fixActions;
}

function deviceTypeToFixCode(deviceType: DeviceTypeV1): string {
  switch (deviceType) {
    case DeviceTypeV1.CB: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_CB;
    case DeviceTypeV1.DS: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_DS;
    case DeviceTypeV1.ES: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_ES;
    case DeviceTypeV1.CT: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_CT;
    case DeviceTypeV1.VT: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_VT;
    case DeviceTypeV1.RELAY: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_RELAY;
    case DeviceTypeV1.CABLE_HEAD: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_CABLE_HEAD;
    case DeviceTypeV1.TRANSFORMER_DEVICE: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_TRANSFORMER;
    case DeviceTypeV1.ACB: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_ACB;
    case DeviceTypeV1.GENERATOR_PV:
    case DeviceTypeV1.GENERATOR_BESS: return FieldDeviceFixCodes.FIELD_DEVICE_MISSING_GENERATOR;
    default: return FieldDeviceFixCodes.CATALOG_REF_MISSING;
  }
}

// =============================================================================
// POLISH TAXONOMY: PoleTypeV1 + AparatTypeV1 (RUN #3F §1)
// =============================================================================

/**
 * Typ pola rozdzielczego — polska taksonomia OSD.
 *
  * Każdy PoleTypeV1 mapuje 1:1 na FieldRoleV1 (bridge backwards-compatible).
  * PoleTypeV1 zawiera informacje o napięciu (SN/nN) i funkcji pola.
 */
export const PoleTypeV1 = {
  // --- SN ---
  POLE_LINIOWE_SN: 'POLE_LINIOWE_SN',
  POLE_TRANSFORMATOROWE_SN_NN: 'POLE_TRANSFORMATOROWE_SN_NN',
  POLE_POMIAROWE_SN: 'POLE_POMIAROWE_SN',
  POLE_SPRZEGLOWE_SN: 'POLE_SPRZEGLOWE_SN',
  POLE_ZRODLA_PV_SN: 'POLE_ZRODLA_PV_SN',
  POLE_ZRODLA_BESS_SN: 'POLE_ZRODLA_BESS_SN',
  POLE_ZRODLA_FW_SN: 'POLE_ZRODLA_FW_SN',
  POLE_LACZNIKA_SZYN_SN: 'POLE_LACZNIKA_SZYN_SN',
  // --- nN ---
  POLE_GLOWNE_NN: 'POLE_GLOWNE_NN',
  POLE_ODPLYWOWE_NN: 'POLE_ODPLYWOWE_NN',
  POLE_ZRODLA_PV_NN: 'POLE_ZRODLA_PV_NN',
  POLE_ZRODLA_BESS_NN: 'POLE_ZRODLA_BESS_NN',
} as const;

export type PoleTypeV1 = (typeof PoleTypeV1)[keyof typeof PoleTypeV1];

/**
 * Mapping PoleTypeV1 → FieldRoleV1 (backwards compatible).
 */
export const POLE_TO_FIELD_ROLE: Record<PoleTypeV1, FieldRoleV1> = {
  [PoleTypeV1.POLE_LINIOWE_SN]: FieldRoleV1.LINE_IN,
  [PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN]: FieldRoleV1.TRANSFORMER_SN_NN,
  [PoleTypeV1.POLE_POMIAROWE_SN]: FieldRoleV1.MEASUREMENT_SN,
  [PoleTypeV1.POLE_SPRZEGLOWE_SN]: FieldRoleV1.COUPLER_SN,
  [PoleTypeV1.POLE_ZRODLA_PV_SN]: FieldRoleV1.PV_SN,
  [PoleTypeV1.POLE_ZRODLA_BESS_SN]: FieldRoleV1.BESS_SN,
  [PoleTypeV1.POLE_ZRODLA_FW_SN]: FieldRoleV1.FW_SN,
  [PoleTypeV1.POLE_LACZNIKA_SZYN_SN]: FieldRoleV1.BUS_TIE,
  [PoleTypeV1.POLE_GLOWNE_NN]: FieldRoleV1.MAIN_NN,
  [PoleTypeV1.POLE_ODPLYWOWE_NN]: FieldRoleV1.FEEDER_NN,
  [PoleTypeV1.POLE_ZRODLA_PV_NN]: FieldRoleV1.PV_NN,
  [PoleTypeV1.POLE_ZRODLA_BESS_NN]: FieldRoleV1.BESS_NN,
};

/**
 * Mapping FieldRoleV1 → PoleTypeV1 (dominant direction).
 * LINE_OUT / LINE_BRANCH map to POLE_LINIOWE_SN (same physical type).
 */
export const FIELD_ROLE_TO_POLE: Record<FieldRoleV1, PoleTypeV1> = {
  [FieldRoleV1.GPZ_LINE_BAY]: PoleTypeV1.POLE_LINIOWE_SN,
  [FieldRoleV1.LINE_IN]: PoleTypeV1.POLE_LINIOWE_SN,
  [FieldRoleV1.LINE_OUT]: PoleTypeV1.POLE_LINIOWE_SN,
  [FieldRoleV1.LINE_BRANCH]: PoleTypeV1.POLE_LINIOWE_SN,
  [FieldRoleV1.TRANSFORMER_SN_NN]: PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN,
  [FieldRoleV1.MEASUREMENT_SN]: PoleTypeV1.POLE_POMIAROWE_SN,
  [FieldRoleV1.PV_SN]: PoleTypeV1.POLE_ZRODLA_PV_SN,
  [FieldRoleV1.BESS_SN]: PoleTypeV1.POLE_ZRODLA_BESS_SN,
  [FieldRoleV1.FW_SN]: PoleTypeV1.POLE_ZRODLA_FW_SN,
  [FieldRoleV1.COUPLER_SN]: PoleTypeV1.POLE_SPRZEGLOWE_SN,
  [FieldRoleV1.BUS_TIE]: PoleTypeV1.POLE_LACZNIKA_SZYN_SN,
  [FieldRoleV1.MAIN_NN]: PoleTypeV1.POLE_GLOWNE_NN,
  [FieldRoleV1.FEEDER_NN]: PoleTypeV1.POLE_ODPLYWOWE_NN,
  [FieldRoleV1.PV_NN]: PoleTypeV1.POLE_ZRODLA_PV_NN,
  [FieldRoleV1.BESS_NN]: PoleTypeV1.POLE_ZRODLA_BESS_NN,
};

/**
 * Typ aparatu — polska taksonomia OSD.
 *
 * Mapuje 1:1 na DeviceTypeV1.
 */
export const AparatTypeV1 = {
  WYLACZNIK: 'WYLACZNIK',
  ODLACZNIK: 'ODLACZNIK',
  ROZLACZNIK: 'ROZLACZNIK',
  BEZPIECZNIK: 'BEZPIECZNIK',
  UZIEMNIK: 'UZIEMNIK',
  PRZEKLADNIK_PRADOWY: 'PRZEKLADNIK_PRADOWY',
  PRZEKLADNIK_NAPIECIOWY: 'PRZEKLADNIK_NAPIECIOWY',
  ZABEZPIECZENIE: 'ZABEZPIECZENIE',
  TRANSFORMATOR: 'TRANSFORMATOR',
  GLOWICA_KABLOWA: 'GLOWICA_KABLOWA',
  GENERATOR_PV: 'GENERATOR_PV',
  GENERATOR_BESS: 'GENERATOR_BESS',
  GENERATOR_FW: 'GENERATOR_FW',
  PCS: 'PCS',
  BATERIA: 'BATERIA',
  ACB: 'ACB',
} as const;

export type AparatTypeV1 = (typeof AparatTypeV1)[keyof typeof AparatTypeV1];

/**
 * Mapping AparatTypeV1 → DeviceTypeV1 (backwards compatible).
 */
export const APARAT_TO_DEVICE_TYPE: Record<AparatTypeV1, DeviceTypeV1> = {
  [AparatTypeV1.WYLACZNIK]: DeviceTypeV1.CB,
  [AparatTypeV1.ODLACZNIK]: DeviceTypeV1.DS,
  [AparatTypeV1.ROZLACZNIK]: DeviceTypeV1.LOAD_SWITCH,
  [AparatTypeV1.BEZPIECZNIK]: DeviceTypeV1.FUSE,
  [AparatTypeV1.UZIEMNIK]: DeviceTypeV1.ES,
  [AparatTypeV1.PRZEKLADNIK_PRADOWY]: DeviceTypeV1.CT,
  [AparatTypeV1.PRZEKLADNIK_NAPIECIOWY]: DeviceTypeV1.VT,
  [AparatTypeV1.ZABEZPIECZENIE]: DeviceTypeV1.RELAY,
  [AparatTypeV1.TRANSFORMATOR]: DeviceTypeV1.TRANSFORMER_DEVICE,
  [AparatTypeV1.GLOWICA_KABLOWA]: DeviceTypeV1.CABLE_HEAD,
  [AparatTypeV1.GENERATOR_PV]: DeviceTypeV1.GENERATOR_PV,
  [AparatTypeV1.GENERATOR_BESS]: DeviceTypeV1.GENERATOR_BESS,
  [AparatTypeV1.GENERATOR_FW]: DeviceTypeV1.GENERATOR_FW,
  [AparatTypeV1.PCS]: DeviceTypeV1.PCS,
  [AparatTypeV1.BATERIA]: DeviceTypeV1.BATTERY,
  [AparatTypeV1.ACB]: DeviceTypeV1.ACB,
};

/**
 * Mapping DeviceTypeV1 → AparatTypeV1.
 */
export const DEVICE_TYPE_TO_APARAT: Record<DeviceTypeV1, AparatTypeV1> = {
  [DeviceTypeV1.CB]: AparatTypeV1.WYLACZNIK,
  [DeviceTypeV1.DS]: AparatTypeV1.ODLACZNIK,
  [DeviceTypeV1.LOAD_SWITCH]: AparatTypeV1.ROZLACZNIK,
  [DeviceTypeV1.FUSE]: AparatTypeV1.BEZPIECZNIK,
  [DeviceTypeV1.ES]: AparatTypeV1.UZIEMNIK,
  [DeviceTypeV1.CT]: AparatTypeV1.PRZEKLADNIK_PRADOWY,
  [DeviceTypeV1.VT]: AparatTypeV1.PRZEKLADNIK_NAPIECIOWY,
  [DeviceTypeV1.RELAY]: AparatTypeV1.ZABEZPIECZENIE,
  [DeviceTypeV1.TRANSFORMER_DEVICE]: AparatTypeV1.TRANSFORMATOR,
  [DeviceTypeV1.CABLE_HEAD]: AparatTypeV1.GLOWICA_KABLOWA,
  [DeviceTypeV1.GENERATOR_PV]: AparatTypeV1.GENERATOR_PV,
  [DeviceTypeV1.GENERATOR_BESS]: AparatTypeV1.GENERATOR_BESS,
  [DeviceTypeV1.GENERATOR_FW]: AparatTypeV1.GENERATOR_FW,
  [DeviceTypeV1.PCS]: AparatTypeV1.PCS,
  [DeviceTypeV1.BATTERY]: AparatTypeV1.BATERIA,
  [DeviceTypeV1.ACB]: AparatTypeV1.ACB,
};

/**
 * Polish labels for PoleTypeV1 (UI display).
 */
export const POLE_TYPE_LABELS_PL: Record<PoleTypeV1, string> = {
  [PoleTypeV1.POLE_LINIOWE_SN]: 'Pole liniowe SN',
  [PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN]: 'Pole transformatorowe SN/nN',
  [PoleTypeV1.POLE_POMIAROWE_SN]: 'Pole pomiarowe SN',
  [PoleTypeV1.POLE_SPRZEGLOWE_SN]: 'Pole sprzęgła sekcyjnego SN',
  [PoleTypeV1.POLE_ZRODLA_PV_SN]: 'Pole źródła PV (SN)',
  [PoleTypeV1.POLE_ZRODLA_BESS_SN]: 'Pole źródła BESS (SN)',
  [PoleTypeV1.POLE_LACZNIKA_SZYN_SN]: 'Pole łącznika szyn SN',
  [PoleTypeV1.POLE_GLOWNE_NN]: 'Pole główne nN (ACB)',
  [PoleTypeV1.POLE_ODPLYWOWE_NN]: 'Pole odpływowe nN',
  [PoleTypeV1.POLE_ZRODLA_PV_NN]: 'Pole źródła PV (nN)',
  [PoleTypeV1.POLE_ZRODLA_BESS_NN]: 'Pole źródła BESS (nN)',
  [PoleTypeV1.POLE_ZRODLA_FW_SN]: 'Pole zrodla FW (SN)',
};
/**
 * Polish labels for AparatTypeV1 (UI display).
 */
export const APARAT_TYPE_LABELS_PL: Record<AparatTypeV1, string> = {
  [AparatTypeV1.WYLACZNIK]: 'Wyłącznik',
  [AparatTypeV1.ODLACZNIK]: 'Odłącznik',
  [AparatTypeV1.ROZLACZNIK]: 'Rozłącznik',
  [AparatTypeV1.BEZPIECZNIK]: 'Bezpiecznik',
  [AparatTypeV1.UZIEMNIK]: 'Uziemnik',
  [AparatTypeV1.PRZEKLADNIK_PRADOWY]: 'Przekładnik prądowy',
  [AparatTypeV1.PRZEKLADNIK_NAPIECIOWY]: 'Przekładnik napięciowy',
  [AparatTypeV1.ZABEZPIECZENIE]: 'Zabezpieczenie',
  [AparatTypeV1.TRANSFORMATOR]: 'Transformator',
  [AparatTypeV1.GLOWICA_KABLOWA]: 'Głowica kablowa',
  [AparatTypeV1.GENERATOR_PV]: 'Generator PV',
  [AparatTypeV1.GENERATOR_BESS]: 'Generator BESS',
  [AparatTypeV1.GENERATOR_FW]: 'Generator FW',
  [AparatTypeV1.PCS]: 'PCS (power conversion system)',
  [AparatTypeV1.BATERIA]: 'Bateria',
  [AparatTypeV1.ACB]: 'Wyłącznik nN (ACB)',
};

// =============================================================================
// SYMBOL REGISTRY: Apparatus → SLD Symbol (RUN #3F §4)
// =============================================================================

/**
 * Typ symbolu SLD — kanoniczny rejestr IEC-zgodnych symboli aparatow.
 *
 * ZAKAZ „symboli dekoracyjnych" — kazdy symbol musi odpowiadac aparatowi.
 */
export const SldSymbolTypeV1 = {
  /** Wylacznik (CB) — IEC symbol: dwa X na torze */
  SYMBOL_CB: 'SYMBOL_CB',
  /** Odlacznik (DS) — IEC symbol: otwarty kontakt */
  SYMBOL_DS: 'SYMBOL_DS',
  /** Rozlacznik (LOAD_SWITCH) — IEC symbol */
  SYMBOL_LOAD_SWITCH: 'SYMBOL_LOAD_SWITCH',
  /** Bezpiecznik (FUSE) — IEC symbol: prostokat na torze */
  SYMBOL_FUSE: 'SYMBOL_FUSE',
  /** Uziemnik (ES) — IEC symbol: linia do ziemi */
  SYMBOL_ES: 'SYMBOL_ES',
  /** Przekładnik prądowy (CT) — IEC symbol: okrąg z punktem na torze mocy */
  SYMBOL_CT: 'SYMBOL_CT',
  /** Przekładnik napięciowy (VT) — IEC symbol: okrąg z punktem bocznym */
  SYMBOL_VT: 'SYMBOL_VT',
  /** Zabezpieczenie (RELAY) — IEC symbol: prostokąt z R poza torem mocy */
  SYMBOL_RELAY: 'SYMBOL_RELAY',
  /** Transformator — IEC symbol: dwa okregi */
  SYMBOL_TRANSFORMER: 'SYMBOL_TRANSFORMER',
  /** Glowica kablowa — trojkat */
  SYMBOL_CABLE_HEAD: 'SYMBOL_CABLE_HEAD',
  /** Generator PV — symbol PV */
  SYMBOL_GENERATOR_PV: 'SYMBOL_GENERATOR_PV',
  /** Generator BESS — symbol baterii */
  SYMBOL_GENERATOR_BESS: 'SYMBOL_GENERATOR_BESS',
  /** Generator FW — symbol farmy wiatrowej */
  SYMBOL_GENERATOR_FW: 'SYMBOL_GENERATOR_FW',
  /** ACB (nN) — IEC symbol: dwa X (mniejszy) */
  SYMBOL_ACB: 'SYMBOL_ACB',
  /** Szyna zbiorcza — gruba linia */
  SYMBOL_BUSBAR: 'SYMBOL_BUSBAR',
} as const;

export type SldSymbolTypeV1 = (typeof SldSymbolTypeV1)[keyof typeof SldSymbolTypeV1];

/**
 * Mapping DeviceTypeV1 → SldSymbolTypeV1 (deterministic).
 */
export const DEVICE_TO_SYMBOL: Record<DeviceTypeV1, SldSymbolTypeV1> = {
  [DeviceTypeV1.CB]: SldSymbolTypeV1.SYMBOL_CB,
  [DeviceTypeV1.DS]: SldSymbolTypeV1.SYMBOL_DS,
  [DeviceTypeV1.LOAD_SWITCH]: SldSymbolTypeV1.SYMBOL_LOAD_SWITCH,
  [DeviceTypeV1.FUSE]: SldSymbolTypeV1.SYMBOL_FUSE,
  [DeviceTypeV1.ES]: SldSymbolTypeV1.SYMBOL_ES,
  [DeviceTypeV1.CT]: SldSymbolTypeV1.SYMBOL_CT,
  [DeviceTypeV1.VT]: SldSymbolTypeV1.SYMBOL_VT,
  [DeviceTypeV1.RELAY]: SldSymbolTypeV1.SYMBOL_RELAY,
  [DeviceTypeV1.TRANSFORMER_DEVICE]: SldSymbolTypeV1.SYMBOL_TRANSFORMER,
  [DeviceTypeV1.CABLE_HEAD]: SldSymbolTypeV1.SYMBOL_CABLE_HEAD,
  [DeviceTypeV1.GENERATOR_PV]: SldSymbolTypeV1.SYMBOL_GENERATOR_PV,
  [DeviceTypeV1.GENERATOR_BESS]: SldSymbolTypeV1.SYMBOL_GENERATOR_BESS,
  [DeviceTypeV1.GENERATOR_FW]: SldSymbolTypeV1.SYMBOL_GENERATOR_FW,
  [DeviceTypeV1.PCS]: SldSymbolTypeV1.SYMBOL_GENERATOR_BESS,
  [DeviceTypeV1.BATTERY]: SldSymbolTypeV1.SYMBOL_GENERATOR_BESS,
  [DeviceTypeV1.ACB]: SldSymbolTypeV1.SYMBOL_ACB,
};

/**
 * Apparatus-to-Symbol binding — full rendering metadata.
 *
 * CT w torze mocy (POWER_PATH), zabezpieczenie poza torem (OFF_PATH).
 * Glowica kablowa = trojkat (TERMINATION).
 */
export interface ApparatusSymbolBindingV1 {
  readonly deviceType: DeviceTypeV1;
  readonly aparatType: AparatTypeV1;
  readonly symbolType: SldSymbolTypeV1;
  readonly electricalRole: DeviceElectricalRoleV1;
  readonly powerPathPosition: DevicePowerPathPositionV1;
  readonly labelPl: string;
  /** True = na torze mocy (rysuj w kolumnie power path) */
  readonly isOnPowerPath: boolean;
}

/**
 * Build apparatus symbol binding for a device.
 */
export function buildApparatusSymbolBinding(device: DeviceV1): ApparatusSymbolBindingV1 {
  return {
    deviceType: device.deviceType,
    aparatType: DEVICE_TYPE_TO_APARAT[device.deviceType],
    symbolType: DEVICE_TO_SYMBOL[device.deviceType],
    electricalRole: device.electricalRole,
    powerPathPosition: device.powerPathPosition,
    labelPl: APARAT_TYPE_LABELS_PL[DEVICE_TYPE_TO_APARAT[device.deviceType]],
    isOnPowerPath: device.powerPathPosition !== DevicePowerPathPositionV1.OFF_PATH
      && (
        device.electricalRole === DeviceElectricalRoleV1.POWER_PATH
        || device.electricalRole === DeviceElectricalRoleV1.MEASUREMENT
        || device.electricalRole === DeviceElectricalRoleV1.TERMINATION
      ),
  };
}

// =============================================================================
// WIZARD FIELD STEP V1 — data model for field/device editing (RUN #3F §2)
// =============================================================================

/**
 * Wizard step for field/device editing in a station.
 *
 * Represents the data structure for the "Rozdzielnica / Stacja" wizard screen.
 * ZAKAZ: automatyczne tworzenie aparatow — kreator zbiera dane, NIE generuje.
 */
export interface WizardFieldStepV1 {
  readonly stationId: string;
  /** Fields in deterministic order (sorted by id) */
  readonly fields: readonly WizardFieldEntryV1[];
  /** Validation issues to display to user */
  readonly fixActions: readonly FieldDeviceFixActionV1[];
  /** Navigation hint: which field has issues */
  readonly activeFieldId: string | null;
}

export interface WizardFieldEntryV1 {
  readonly fieldId: string;
  readonly fieldRole: FieldRoleV1;
  readonly poleType: PoleTypeV1;
  readonly labelPl: string;
  /** Apparatus entries in power-path order */
  readonly devices: readonly WizardDeviceEntryV1[];
  /** FixActions specific to this field */
  readonly fieldFixActions: readonly FieldDeviceFixActionV1[];
  /** Whether all required apparatus are present and have catalogRef */
  readonly isComplete: boolean;
}

export interface WizardDeviceEntryV1 {
  readonly deviceId: string;
  readonly deviceType: DeviceTypeV1;
  readonly aparatType: AparatTypeV1;
  readonly labelPl: string;
  readonly symbolType: SldSymbolTypeV1;
  /** Has catalog reference assigned */
  readonly hasCatalogRef: boolean;
  /** Has required parameters filled */
  readonly hasParameters: boolean;
  /** Navigation hint: wizardStep to fill parameters */
  readonly wizardStepHint: string;
}

/**
 * Build wizard field step for a station block.
 */
export function buildWizardFieldStep(
  block: StationBlockDetailV1,
  allDevices: readonly DeviceV1[],
): WizardFieldStepV1 {
  const fields: WizardFieldEntryV1[] = [];

  for (const field of block.fields) {
    const fieldDevices = allDevices.filter(d => d.fieldId === field.id);
    const fieldFixActions = block.fixActions.filter(fa => fa.elementId === field.id);

    const poleType = FIELD_ROLE_TO_POLE[field.fieldRole];
    const labelPl = POLE_TYPE_LABELS_PL[poleType];

    const deviceEntries: WizardDeviceEntryV1[] = fieldDevices
      .sort((a, b) => {
        const posOrder: Record<string, number> = {
          [DevicePowerPathPositionV1.UPSTREAM]: 0,
          [DevicePowerPathPositionV1.MIDSTREAM]: 1,
          [DevicePowerPathPositionV1.DOWNSTREAM]: 2,
          [DevicePowerPathPositionV1.OFF_PATH]: 3,
        };
        return (posOrder[a.powerPathPosition] ?? 9) - (posOrder[b.powerPathPosition] ?? 9);
      })
      .map(device => ({
        deviceId: device.id,
        deviceType: device.deviceType,
        aparatType: DEVICE_TYPE_TO_APARAT[device.deviceType],
        labelPl: APARAT_TYPE_LABELS_PL[DEVICE_TYPE_TO_APARAT[device.deviceType]],
        symbolType: DEVICE_TO_SYMBOL[device.deviceType],
        hasCatalogRef: device.catalogRef !== null,
        hasParameters: hasRequiredParameters(device),
        wizardStepHint: `station.${block.blockId}.field.${field.id}.device.${device.id}`,
      }));

    const isComplete = fieldFixActions.length === 0
      && deviceEntries.every(d => d.hasCatalogRef);

    fields.push({
      fieldId: field.id,
      fieldRole: field.fieldRole,
      poleType,
      labelPl,
      devices: deviceEntries,
      fieldFixActions,
      isComplete,
    });
  }

  const firstIncomplete = fields.find(f => !f.isComplete);

  return {
    stationId: block.blockId,
    fields,
    fixActions: block.fixActions,
    activeFieldId: firstIncomplete?.fieldId ?? null,
  };
}

function hasRequiredParameters(device: DeviceV1): boolean {
  switch (device.deviceType) {
    case DeviceTypeV1.CB:
      return device.parameters.breakingCapacityKa !== null;
    case DeviceTypeV1.CT:
      return device.parameters.ctRatio !== null;
    case DeviceTypeV1.RELAY:
      return device.parameters.relaySettings !== null;
    case DeviceTypeV1.TRANSFORMER_DEVICE:
      return device.parameters.ratedPowerMva !== null;
    default:
      return true;
  }
}

// =============================================================================
// VALIDATORS (continued)
// =============================================================================

/**
 * Waliduje stacje pod katem embeddingRole i wymagan portow/pol.
 */
export function validateStationBlock(
  block: StationBlockDetailV1,
): readonly FieldDeviceFixActionV1[] {
  const fixActions: FieldDeviceFixActionV1[] = [];
  const hasFieldRole = (role: FieldRoleV1): boolean =>
    block.fields.some(field => field.fieldRole === role);
  const hasAnyFieldRole = (roles: readonly FieldRoleV1[]): boolean =>
    block.fields.some(field => roles.includes(field.fieldRole));
  const isMainSubstationBlock = hasFieldRole(FieldRoleV1.GPZ_LINE_BAY);

  // BusSections non-empty
  if (block.busSections.length === 0) {
    fixActions.push({
      code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
      message: `Stacja ${block.blockId}: brak sekcji szyn (busSections puste)`,
      elementId: block.blockId,
      fixHint: `Dodaj przynajmniej jedną sekcję szyny do stacji ${block.blockId}`,
    });
  }

  // Fields non-empty
  if (block.fields.length === 0) {
    fixActions.push({
      code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
      message: `Stacja ${block.blockId}: brak pol (fields puste)`,
      elementId: block.blockId,
      fixHint: `Dodaj przynajmniej jedno pole do stacji ${block.blockId}`,
    });
  }

  // LOCAL_SECTIONAL: coupler required
  if (block.embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL && block.couplerFieldId === null) {
    fixActions.push({
      code: FieldDeviceFixCodes.STATION_COUPLER_MISSING,
      message: `Stacja sekcyjna ${block.blockId}: brak pola sprzegla`,
      elementId: block.blockId,
      fixHint: `Dodaj pole COUPLER_SN do stacji sekcyjnej ${block.blockId}`,
    });
  }

  // Port consistency per embedding role
  const { ports, embeddingRole } = block;
  if (embeddingRole === EmbeddingRoleV1.TRUNK_LEAF && !ports.trunkInPort) {
    fixActions.push({
      code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
      message: `Stacja TRUNK_LEAF ${block.blockId}: brak trunkInPort`,
      elementId: block.blockId,
      fixHint: `Przypisz trunkInPort do stacji ${block.blockId}`,
    });
  }

  if (embeddingRole === EmbeddingRoleV1.TRUNK_INLINE) {
    if (!ports.trunkInPort) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
        message: `Stacja TRUNK_INLINE ${block.blockId}: brak trunkInPort`,
        elementId: block.blockId,
        fixHint: `Przypisz trunkInPort do stacji ${block.blockId}`,
      });
    }
    if (!ports.trunkOutPort) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
        message: `Stacja TRUNK_INLINE ${block.blockId}: brak trunkOutPort`,
        elementId: block.blockId,
        fixHint: `Przypisz trunkOutPort do stacji ${block.blockId}`,
      });
    }
  }

  if (embeddingRole === EmbeddingRoleV1.TRUNK_BRANCH && !ports.branchPort) {
    fixActions.push({
      code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
      message: `Stacja TRUNK_BRANCH ${block.blockId}: brak branchPort`,
      elementId: block.blockId,
      fixHint: `Przypisz branchPort do stacji ${block.blockId}`,
    });
  }

  if (embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL) {
    if (!ports.trunkInPort || !ports.trunkOutPort) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_EMBEDDING_UNDETERMINED,
        message: `Stacja LOCAL_SECTIONAL ${block.blockId}: brak trunkInPort lub trunkOutPort`,
        elementId: block.blockId,
        fixHint: `Przypisz trunkInPort i trunkOutPort do stacji sekcyjnej ${block.blockId}`,
      });
    }
  }

  // Station switchgear structure: renderer nie moze zredukowac stacji SN/nN do
  // samego transformatora. Braki sa FixAction, nigdy auto-uzupelnieniem.
  if (!isMainSubstationBlock) {
    const requiresLineIn = embeddingRole === EmbeddingRoleV1.TRUNK_LEAF
      || embeddingRole === EmbeddingRoleV1.TRUNK_INLINE
      || embeddingRole === EmbeddingRoleV1.TRUNK_BRANCH
      || embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL;
    const requiresLineOut = embeddingRole === EmbeddingRoleV1.TRUNK_INLINE
      || embeddingRole === EmbeddingRoleV1.TRUNK_BRANCH
      || embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL;
    const requiresBranchField = embeddingRole === EmbeddingRoleV1.TRUNK_BRANCH;
    const requiresCouplerField = embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL;

    if (requiresLineIn && !hasFieldRole(FieldRoleV1.LINE_IN)) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_LINE_IN_MISSING,
        message: `Stacja ${block.blockId}: brak pola liniowego wejsciowego SN`,
        elementId: block.blockId,
        fixHint: `Dodaj pole LINE_IN do rozdzielnicy SN stacji ${block.blockId}`,
      });
    }

    if (requiresLineOut && !hasFieldRole(FieldRoleV1.LINE_OUT)) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_LINE_OUT_MISSING,
        message: `Stacja ${block.blockId}: brak pola liniowego wyjsciowego SN`,
        elementId: block.blockId,
        fixHint: `Dodaj pole LINE_OUT do rozdzielnicy SN stacji ${block.blockId}`,
      });
    }

    if (requiresBranchField && !hasFieldRole(FieldRoleV1.LINE_BRANCH)) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_BRANCH_FIELD_MISSING,
        message: `Stacja ${block.blockId}: brak pola odgalezieniowego SN`,
        elementId: block.blockId,
        fixHint: `Dodaj pole LINE_BRANCH do stacji odgalezieniowej ${block.blockId}`,
      });
    }

    if (requiresCouplerField && !hasFieldRole(FieldRoleV1.COUPLER_SN)) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_COUPLER_MISSING,
        message: `Stacja sekcyjna ${block.blockId}: brak pola sekcyjnego`,
        elementId: block.blockId,
        fixHint: `Dodaj pole COUPLER_SN do stacji sekcyjnej ${block.blockId}`,
      });
    }

    if (!hasFieldRole(FieldRoleV1.TRANSFORMER_SN_NN)) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_TRANSFORMER_MISSING,
        message: `Stacja ${block.blockId}: brak pola transformatorowego SN/nN`,
        elementId: block.blockId,
        fixHint: `Dodaj pole TRANSFORMER_SN_NN z transformatorem stacyjnym do stacji ${block.blockId}`,
      });
    } else if (!hasAnyFieldRole([
      FieldRoleV1.MAIN_NN,
      FieldRoleV1.FEEDER_NN,
      FieldRoleV1.PV_NN,
      FieldRoleV1.BESS_NN,
    ])) {
      fixActions.push({
        code: FieldDeviceFixCodes.STATION_NN_SWITCHGEAR_MISSING,
        message: `Stacja ${block.blockId}: brak rozdzielnicy nN za transformatorem stacyjnym`,
        elementId: block.blockId,
        fixHint: `Dodaj pole MAIN_NN albo pola FEEDER_NN do rozdzielnicy nN stacji ${block.blockId}`,
      });
    }
  }

  return fixActions;
}
