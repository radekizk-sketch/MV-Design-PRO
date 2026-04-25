/**
 * TopologyInputReader — Jedyne miejsce prawdy dla wejscia adaptera SLD.
 *
 * CANONICAL CONTRACT (BINDING — RUN #3C):
 * - Definiuje kanoniczne typy wejsciowe adaptera topologii.
 * - Dwa zrodla: EnergyNetworkModel (API) lub AnySldSymbol[] (bridge migracyjny).
 * - Kazdy rekord ma stabilne ID, stabilne sortowanie (leksykograficzne po id).
 * - Zero heurystyk — braki danych → ValidationError + FixAction.
 * - Determinizm: ten sam wejsciowy model → identyczny TopologyInput (bit-for-bit).
 *
 * REGULY:
 * - PV/BESS sa GENERATOR (PV/BESS), nigdy LOAD — typ z domeny, nie z nazwy.
 * - Stacje maja jawny stationType z domeny (lub derivedType z topologii + FixAction).
 * - Napiecie z pola numerycznego voltage_kv, nigdy z parsowania nazwy.
 * - Kazda referencja katalogowa jest jawna (null → FixAction).
 */

import type {
  EnergyNetworkModel,
  Branch as ENMBranch,
  Generator as ENMGenerator,
  Substation as ENMSubstation,
} from '../../../types/enm';
import type { AnySldSymbol, BusSymbol, BranchSymbol, SwitchSymbol, SourceSymbol, LoadSymbol } from '../../sld-editor/types';
import {
  type SourceConnectionVariantInputV1,
  isSupportedSourceConnectionVariant,
  normalizeSourceConnectionVariant,
  SourceConnectionVariantV1,
} from './sourceConnectionVariant';

// =============================================================================
// ENUMS
// =============================================================================

/** Rodzaj galezi topologicznej. */
export const BranchKind = {
  LINE: 'LINE',
  CABLE: 'CABLE',
  BUS_LINK: 'BUS_LINK',
  TR_LINK: 'TR_LINK',
} as const;
export type BranchKind = (typeof BranchKind)[keyof typeof BranchKind];

/** Rodzaj urzadzenia. */
export const DeviceKind = {
  CB: 'CB',
  DS: 'DS',
  ES: 'ES',
  CT: 'CT',
  VT: 'VT',
  RELAY: 'RELAY',
  LOAD_SWITCH: 'LOAD_SWITCH',
  FUSE: 'FUSE',
} as const;
export type DeviceKind = (typeof DeviceKind)[keyof typeof DeviceKind];

/** Rodzaj generatora. */
export const GeneratorKind = {
  PV: 'PV',
  WIND: 'WIND',
  FW_PMSG: 'FW_PMSG',
  FW_DFIG: 'FW_DFIG',
  FW_SCIG: 'FW_SCIG',
  BESS: 'BESS',
  SYNCHRONOUS: 'SYNCHRONOUS',
} as const;
export type GeneratorKind = (typeof GeneratorKind)[keyof typeof GeneratorKind];

/** Typ stacji z domeny. */
export const StationKind = {
  MAIN_SUBSTATION: 'MAIN_SUBSTATION',
  DISTRIBUTION: 'DISTRIBUTION',
  TRANSFORMER: 'TRANSFORMER',
  SWITCHING: 'SWITCHING',
} as const;
export type StationKind = (typeof StationKind)[keyof typeof StationKind];

// =============================================================================
// TOPOLOGY INPUT TYPES
// =============================================================================

/**
 * Wezel polaczeniowy — odpowiednik Bus/Terminal w NetworkModel.
 */
export interface ConnectionNodeV1 {
  readonly id: string;
  readonly name: string;
  /** Napiecie znamionowe [kV]. null = brak danych → FixAction bus.voltage_missing. */
  readonly voltageKv: number | null;
  readonly stationId: string | null;
  readonly busIndex: number | null;
  readonly inService: boolean;
}

/**
 * Galaz topologiczna — polaczenie miedzy dwoma wezlami.
 */
export interface TopologyBranchV1 {
  readonly id: string;
  readonly name: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: BranchKind;
  readonly isNormallyOpen: boolean;
  readonly inService: boolean;
  readonly catalogRef: string | null;
  readonly lengthKm: number | null;
  readonly ratedPowerMva: number | null;
  readonly voltageHvKv: number | null;
  readonly voltageLvKv: number | null;
}

/**
 * Urzadzenie polowe — aparat na wezle lub galezi.
 */
export interface TopologyDeviceV1 {
  readonly id: string;
  readonly name: string;
  readonly nodeId: string;
  readonly kind: DeviceKind;
  readonly catalogRef: string | null;
  readonly state: 'OPEN' | 'CLOSED' | null;
  readonly inService: boolean;
  readonly bayRef?: string | null;
}

export interface TopologyFieldSpecV1 {
  readonly fieldRef: string;
  readonly name: string;
  readonly bayRole: string;
  readonly busRef: string;
  readonly equipmentRefs: readonly string[];
  readonly protectionRef: string | null;
  readonly gpzSectionId: string | null;
  readonly tags: readonly string[];
  readonly meta: Readonly<Record<string, unknown>>;
}

/**
 * Stacja — kontener logiczny (BEZ fizyki).
 */
export interface TopologyStationV1 {
  readonly id: string;
  readonly name: string;
  readonly stationType: StationKind;
  /** Jawny typ punktu rozgałęzienia SN dla renderu SLD. */
  readonly branchPointType?: 'branch_pole' | 'zksn' | null;
  /** Napiecie znamionowe [kV]. null = brak danych (dziedziczone z busow). */
  readonly voltageKv: number | null;
  readonly busIds: readonly string[];
  readonly branchIds: readonly string[];
  readonly switchIds: readonly string[];
  readonly transformerIds: readonly string[];
  readonly fieldSpecs?: readonly TopologyFieldSpecV1[];
  readonly nnFieldSpecs?: readonly TopologyFieldSpecV1[];
}

/**
 * Generator (OZE/synchroniczny).
 */
export interface TopologyGeneratorV1 {
  readonly id: string;
  readonly name: string;
  readonly nodeId: string;
  readonly kind: GeneratorKind;
  readonly catalogRef: string | null;
  readonly inService: boolean;
  readonly ratedPowerMw: number | null;
  readonly blockingTransformerId: string | null;
  /** Wariant przylaczenia PV/BESS: canonical V1 or accepted legacy alias. */
  readonly connectionVariant: SourceConnectionVariantInputV1 | null;
  /** Referencja do stacji (wymagana przy nn_side). */
  readonly stationRef: string | null;
}

/**
 * Zrodlo zewnetrzne (zasilanie z sieci WN).
 */
export interface TopologySourceV1 {
  readonly id: string;
  readonly name: string;
  readonly nodeId: string;
  readonly inService: boolean;
}

/**
 * Odbiorca.
 */
export interface TopologyLoadV1 {
  readonly id: string;
  readonly name: string;
  readonly nodeId: string;
  readonly inService: boolean;
  readonly pMw: number | null;
  readonly qMvar: number | null;
}

/**
 * Przyporzadkowanie zabezpieczenia do wylacznika.
 */
export interface TopologyProtectionV1 {
  readonly id: string;
  readonly breakerRef: string;
  readonly ctRef: string | null;
  readonly vtRef: string | null;
  readonly functions: readonly TopologyProtectionFunctionV1[];
  readonly isEnabled: boolean;
}

export interface TopologyProtectionFunctionV1 {
  readonly functionType: string;
  readonly settings: Readonly<Record<string, unknown>>;
}

// =============================================================================
// FIX ACTION
// =============================================================================

/**
 * Blad walidacji adaptera z sugestia naprawy.
 */
export interface TopologyFixAction {
  readonly code: string;
  readonly message: string;
  readonly elementRef: string | null;
  readonly fixHint: string;
}

/** Jawny widok logiczny trunk z Snapshot.logical_views.trunks[]. */
export interface LogicalTrunkViewV1 {
  readonly id: string;
  readonly segmentIds: readonly string[];
}

/** Jawny widok logiczny odgalezienia z Snapshot.logical_views.branches[]. */
export interface LogicalBranchViewV1 {
  readonly id: string;
  readonly segmentIds: readonly string[];
}

/** Jawny widok logiczny ukladu wtórnego (ring/NOP). */
export interface LogicalRingViewV1 {
  readonly id: string;
  readonly segmentIds: readonly string[];
  readonly normallyOpenSegmentId: string | null;
}

/** Ordered list of station IDs along a trunk. */
export interface LogicalTrunkStationV1 {
  readonly stationId: string;
  readonly role: 'przelotowa' | 'odgalezna' | 'sekcyjna' | 'koncowa';
  readonly attachedBranchIds: readonly string[];
}

/** Extended trunk view with station ordering and junction points. */
export interface LogicalTrunkViewExtV1 extends LogicalTrunkViewV1 {
  readonly orderedStations: readonly LogicalTrunkStationV1[];
}

/** Extended branch view with junction point metadata. */
export interface LogicalBranchViewExtV1 extends LogicalBranchViewV1 {
  /** Node ID where this branch attaches to the trunk. */
  readonly junctionNodeId: string | null;
  /** Ordered station IDs along the branch. */
  readonly orderedStationIds: readonly string[];
}

export interface TopologyLogicalViewsV1 {
  readonly trunks: readonly (LogicalTrunkViewV1 | LogicalTrunkViewExtV1)[];
  readonly branches: readonly (LogicalBranchViewV1 | LogicalBranchViewExtV1)[];
  readonly rings: readonly LogicalRingViewV1[];
}

// =============================================================================
// TOPOLOGY INPUT (AGGREGATE)
// =============================================================================

/**
 * TopologyInput — kanoniczny zestaw danych wejsciowych adaptera.
 *
 * Wszystkie tablice sa posortowane leksykograficznie po id.
 * Zrodlo: ENM (primary) lub AnySldSymbol[] (bridge).
 */
export interface TopologyInputV1 {
  readonly snapshotId: string;
  readonly snapshotFingerprint: string;
  readonly connectionNodes: readonly ConnectionNodeV1[];
  readonly branches: readonly TopologyBranchV1[];
  readonly devices: readonly TopologyDeviceV1[];
  readonly stations: readonly TopologyStationV1[];
  readonly generators: readonly TopologyGeneratorV1[];
  readonly sources: readonly TopologySourceV1[];
  readonly loads: readonly TopologyLoadV1[];
  readonly protectionBindings: readonly TopologyProtectionV1[];
  readonly logicalViews?: TopologyLogicalViewsV1;
  readonly fixActions: readonly TopologyFixAction[];
}

// =============================================================================
// SYMBOL BRIDGE METADATA
// =============================================================================

/**
 * Dodatkowe metadane dostarczane razem z symbolami SLD.
 * Pozwala na klasyfikacje bez heurystyk stringowych.
 */
export interface SymbolBridgeMetadata {
  /** Mapa elementId → typ generatora (dla Sources ktore sa generatorami). */
  readonly generatorTypes?: ReadonlyMap<string, GeneratorKind>;
  /** Mapa elementId → napiecie [kV] (dla szyn bez jawnego napiecia). */
  readonly voltageOverrides?: ReadonlyMap<string, number>;
  /** Mapa elementId → ID stacji. */
  readonly stationMembership?: ReadonlyMap<string, string>;
}

// =============================================================================
// READER: ENM → TopologyInput
// =============================================================================

function sortById<T extends { readonly id: string }>(arr: readonly T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
}

function sortFieldSpecs(specs: readonly TopologyFieldSpecV1[]): TopologyFieldSpecV1[] {
  return [...specs].sort((a, b) => a.fieldRef.localeCompare(b.fieldRef));
}

function normalizeFieldSpec(raw: unknown): TopologyFieldSpecV1 | null {
  if (!isRecord(raw)) return null;
  const fieldRef = firstString(raw.field_ref ?? raw.fieldRef ?? raw.ref_id ?? raw.refId);
  const busRef = firstString(raw.bus_ref ?? raw.busRef);
  if (!fieldRef || !busRef) return null;
  return {
    fieldRef,
    name: firstString(raw.name) ?? fieldRef,
    bayRole: firstString(raw.bay_role ?? raw.bayRole) ?? 'FEEDER',
    busRef,
    equipmentRefs: stringList(raw.equipment_refs ?? raw.equipmentRefs),
    protectionRef: firstString(raw.protection_ref ?? raw.protectionRef),
    gpzSectionId: firstString(raw.gpz_section_id ?? raw.gpzSectionId),
    tags: stringList(raw.tags),
    meta: isRecord(raw.meta) ? { ...raw.meta } : {},
  };
}

function readFieldSpecsFromMeta(meta: unknown, key: 'field_specs' | 'nn_field_specs'): TopologyFieldSpecV1[] {
  if (!isRecord(meta)) return [];
  const rawSpecs = meta[key];
  if (!Array.isArray(rawSpecs)) return [];
  return sortFieldSpecs(
    rawSpecs
      .map(normalizeFieldSpec)
      .filter((spec): spec is TopologyFieldSpecV1 => spec !== null),
  );
}

function synthesizeGpzFieldSpecs(substation: ENMSubstation): TopologyFieldSpecV1[] {
  return sortFieldSpecs(
    (substation.gpz_sections ?? []).map((section) => ({
      fieldRef: `${substation.ref_id}:section:${section.section_id}:field`,
      name: section.line_field_name || `Pole GPZ ${section.order + 1}`,
      bayRole: 'FEEDER',
      busRef: section.bus_ref,
      equipmentRefs: [],
      protectionRef: null,
      gpzSectionId: section.section_id,
      tags: ['gpz_line_field'],
      meta: {
        gpz_section_id: section.section_id,
        gpz_section_order: section.order,
      },
    })),
  );
}

/**
 * Mapuje ENM Branch.type na BranchKind.
 */
function enmBranchKind(b: ENMBranch): BranchKind {
  switch (b.type) {
    case 'line_overhead': return BranchKind.LINE;
    case 'cable': return BranchKind.CABLE;
    case 'switch':
    case 'breaker':
    case 'bus_coupler':
    case 'disconnector':
      return BranchKind.BUS_LINK;
    case 'fuse':
      return BranchKind.BUS_LINK;
    default:
      return BranchKind.LINE;
  }
}

/**
 * Mapuje ENM Branch.type na DeviceKind (dla switching branches).
 */
function enmSwitchKind(b: ENMBranch): DeviceKind | null {
  switch (b.type) {
    case 'breaker': return DeviceKind.CB;
    case 'switch': return DeviceKind.LOAD_SWITCH;
    case 'disconnector': return DeviceKind.DS;
    case 'bus_coupler': return DeviceKind.CB;
    case 'fuse': return DeviceKind.FUSE;
    default: return null;
  }
}

/**
 * Mapuje ENM Generator.gen_type na GeneratorKind.
 */
function enmGenKind(g: ENMGenerator): GeneratorKind {
  switch (g.gen_type) {
    case 'pv_inverter': return GeneratorKind.PV;
    case 'wind_inverter': return GeneratorKind.WIND;
    case 'fw_pmsg': return GeneratorKind.FW_PMSG;
    case 'fw_dfig': return GeneratorKind.FW_DFIG;
    case 'fw_scig': return GeneratorKind.FW_SCIG;
    case 'bess': return GeneratorKind.BESS;
    case 'synchronous': return GeneratorKind.SYNCHRONOUS;
    default: return GeneratorKind.SYNCHRONOUS;
  }
}

/**
 * Mapuje ENM Substation.station_type na StationKind.
 */
function enmStationKind(s: ENMSubstation): StationKind {
  switch (s.station_type) {
    case 'gpz': return StationKind.MAIN_SUBSTATION;
    case 'mv_lv': return StationKind.DISTRIBUTION;
    case 'switching': return StationKind.SWITCHING;
    case 'customer': return StationKind.TRANSFORMER;
    default: return StationKind.DISTRIBUTION;
  }
}

/**
 * Czyta TopologyInput z EnergyNetworkModel (sciezka primary).
 * Zero heurystyk — wszystkie dane z domeny.
 */
export function readTopologyFromENM(
  enm: EnergyNetworkModel,
  snapshotId: string = 'enm',
): TopologyInputV1 {
  const fixActions: TopologyFixAction[] = [];

  // --- Connection Nodes (buses) ---
  const busVoltageMap = new Map<string, number>();
  const connectionNodes: ConnectionNodeV1[] = enm.buses.map((bus) => {
    busVoltageMap.set(bus.ref_id, bus.voltage_kv);
    return {
      id: bus.ref_id,
      name: bus.name,
      voltageKv: bus.voltage_kv,
      stationId: null, // uzupelniamy ponizej
      busIndex: null,
      inService: true,
    };
  });

  // --- Substations ---
  const stationBusMap = new Map<string, string>(); // busRef → stationId
  const stations: TopologyStationV1[] = enm.substations.map((sub) => {
    for (const busRef of sub.bus_refs) {
      stationBusMap.set(busRef, sub.ref_id);
    }
    const meta = (sub as { meta?: unknown }).meta;
    const fieldSpecs = readFieldSpecsFromMeta(meta, 'field_specs');
    const nnFieldSpecs = readFieldSpecsFromMeta(meta, 'nn_field_specs');
    return {
      id: sub.ref_id,
      name: sub.name,
      stationType: enmStationKind(sub),
      branchPointType: null,
      voltageKv: sub.bus_refs.length > 0
        ? (busVoltageMap.get(sub.bus_refs[0]) ?? null)
        : null,
      busIds: [...sub.bus_refs].sort(),
      branchIds: [],
      switchIds: [],
      transformerIds: [...sub.transformer_refs].sort(),
      fieldSpecs: fieldSpecs.length > 0
        ? fieldSpecs
        : (sub.gpz_sections?.length ? synthesizeGpzFieldSpecs(sub) : undefined),
      nnFieldSpecs: nnFieldSpecs.length > 0 ? nnFieldSpecs : undefined,
    };
  });

  // Branch points SN (słup rozgałęźny / ZKSN) jako jawne obiekty renderu SLD.
  for (const bp of enm.branch_points ?? []) {
    stations.push({
      id: bp.ref_id,
      name: bp.name,
      stationType: StationKind.SWITCHING,
      branchPointType: bp.branch_point_type,
      voltageKv: busVoltageMap.get(bp.bus_ref) ?? null,
      busIds: [bp.bus_ref],
      branchIds: [],
      switchIds: [],
      transformerIds: [],
      fieldSpecs: undefined,
      nnFieldSpecs: undefined,
    });
    stationBusMap.set(bp.bus_ref, bp.ref_id);
  }

  // Uzupelnij stationId na connection nodes
  const connectionNodesWithStation = connectionNodes.map((cn) => ({
    ...cn,
    stationId: stationBusMap.get(cn.id) ?? null,
  }));

  // --- Branches (lines + cables) ---
  const branches: TopologyBranchV1[] = [];
  const devices: TopologyDeviceV1[] = [];

  for (const b of enm.branches) {
    const kind = enmBranchKind(b);
    const switchKind = enmSwitchKind(b);

    if (switchKind !== null) {
      // Switching branch → device + BUS_LINK branch
      devices.push({
        id: `dev_${b.ref_id}`,
        name: b.name,
        nodeId: b.from_bus_ref,
        kind: switchKind,
        catalogRef: b.catalog_ref ?? null,
        state: b.status === 'closed' ? 'CLOSED' : 'OPEN',
        inService: true,
      });
    }

    branches.push({
      id: b.ref_id,
      name: b.name,
      fromNodeId: b.from_bus_ref,
      toNodeId: b.to_bus_ref,
      kind,
      isNormallyOpen: b.status === 'open',
      inService: true,
      catalogRef: b.catalog_ref ?? null,
      lengthKm: 'length_km' in b ? (b as { length_km: number }).length_km : null,
      ratedPowerMva: null,
      voltageHvKv: null,
      voltageLvKv: null,
    });

    if (!b.catalog_ref && (kind === BranchKind.LINE || kind === BranchKind.CABLE)) {
      fixActions.push({
        code: 'catalog.reference_missing',
        message: `Galaz '${b.name}' (${b.ref_id}) nie ma referencji katalogowej.`,
        elementRef: b.ref_id,
        fixHint: 'Przypisz typ katalogowy do galezi w modelu sieci.',
      });
    }
  }

  // --- Transformers ---
  for (const tr of enm.transformers) {
    branches.push({
      id: tr.ref_id,
      name: tr.name,
      fromNodeId: tr.hv_bus_ref,
      toNodeId: tr.lv_bus_ref,
      kind: BranchKind.TR_LINK,
      isNormallyOpen: false,
      inService: true,
      catalogRef: tr.catalog_ref ?? null,
      lengthKm: null,
      ratedPowerMva: tr.sn_mva,
      voltageHvKv: tr.uhv_kv,
      voltageLvKv: tr.ulv_kv,
    });

    if (!tr.catalog_ref) {
      fixActions.push({
        code: 'catalog.reference_missing',
        message: `Transformator '${tr.name}' (${tr.ref_id}) nie ma referencji katalogowej.`,
        elementRef: tr.ref_id,
        fixHint: 'Przypisz typ katalogowy do transformatora.',
      });
    }
  }

  // --- Measurements (CT/VT) ---
  for (const m of enm.measurements) {
    devices.push({
      id: m.ref_id,
      name: m.name,
      nodeId: m.bus_ref,
      kind: m.measurement_type === 'CT' ? DeviceKind.CT : DeviceKind.VT,
      catalogRef: m.catalog_ref ?? null,
      state: null,
      inService: true,
      bayRef: m.bay_ref ?? null,
    });
  }

  // --- Sources ---
  const sources: TopologySourceV1[] = enm.sources.map((s) => ({
    id: s.ref_id,
    name: s.name,
    nodeId: s.bus_ref,
    inService: true,
  }));

  // --- Loads ---
  const loads: TopologyLoadV1[] = enm.loads.map((l) => ({
    id: l.ref_id,
    name: l.name,
    nodeId: l.bus_ref,
    inService: true,
    pMw: l.p_mw,
    qMvar: l.q_mvar,
  }));

  // --- Generators ---
  const OZE_TYPES: GeneratorKind[] = [
    GeneratorKind.PV,
    GeneratorKind.WIND,
    GeneratorKind.FW_PMSG,
    GeneratorKind.FW_DFIG,
    GeneratorKind.FW_SCIG,
    GeneratorKind.BESS,
  ];

  // Build lookup maps for validation
  const transformerRefSet = new Set(enm.transformers.map(t => t.ref_id));
  const stationRefSet = new Set(enm.substations.map(s => s.ref_id));

  const generators: TopologyGeneratorV1[] = enm.generators.map((g) => {
    if (!g.gen_type) {
      fixActions.push({
        code: 'generator.type_missing',
        message: `Generator '${g.name}' (${g.ref_id}) nie ma typu (gen_type).`,
        elementRef: g.ref_id,
        fixHint: 'Ustaw gen_type na pv_inverter, fw_pmsg, fw_dfig, fw_scig, bess lub synchronous.',
      });
    }

    const kind = enmGenKind(g);
    const isOze = OZE_TYPES.includes(kind);
    const rawConnectionVariant = g.connection_variant ?? null;
    const connectionVariant = normalizeSourceConnectionVariant(rawConnectionVariant);
    const blockingTransformerId = g.blocking_transformer_ref ?? null;
    const stationRef = g.station_ref ?? null;

    // OZE-specific validation (PV, WIND, BESS)
    if (isOze) {
      if (!rawConnectionVariant) {
        fixActions.push({
          code: 'generator.connection_variant_missing',
          message: `Generator OZE '${g.name}' (${g.ref_id}) nie ma wariantu przylaczenia (connection_variant).`,
          elementRef: g.ref_id,
          fixHint: 'Ustaw connection_variant na LV_BEHIND_STATION_TRANSFORMER, DEDICATED_MV_CONNECTION albo SOURCE_CONNECTION_STATION.',
        });
      } else if (!isSupportedSourceConnectionVariant(rawConnectionVariant)) {
        fixActions.push({
          code: 'generator.connection_variant_invalid',
          message: `Generator '${g.name}' (${g.ref_id}): wariant '${rawConnectionVariant}' jest nieprawidlowy.`,
          elementRef: g.ref_id,
          fixHint: 'Wariant musi byc jednym z: LV_BEHIND_STATION_TRANSFORMER, DEDICATED_MV_CONNECTION, SOURCE_CONNECTION_STATION.',
        });
      } else if (connectionVariant === SourceConnectionVariantV1.DEDICATED_MV_CONNECTION) {
        if (!blockingTransformerId) {
          fixActions.push({
            code: 'generator.block_transformer_missing',
            message: `Generator '${g.name}' (${g.ref_id}): wariant DEDICATED_MV_CONNECTION wymaga blocking_transformer_ref.`,
            elementRef: g.ref_id,
            fixHint: 'Przypisz transformator blokowy do generatora.',
          });
        } else if (!transformerRefSet.has(blockingTransformerId)) {
          fixActions.push({
            code: 'generator.block_transformer_invalid',
            message: `Generator '${g.name}' (${g.ref_id}): blocking_transformer_ref '${blockingTransformerId}' nie istnieje.`,
            elementRef: g.ref_id,
            fixHint: 'Sprawdz ref_id transformatora blokowego.',
          });
        }
      } else if (
        connectionVariant === SourceConnectionVariantV1.LV_BEHIND_STATION_TRANSFORMER
        || connectionVariant === SourceConnectionVariantV1.SOURCE_CONNECTION_STATION
      ) {
        if (!stationRef) {
          fixActions.push({
            code: 'generator.station_ref_missing',
            message: `Generator '${g.name}' (${g.ref_id}): wariant ${connectionVariant} wymaga station_ref.`,
            elementRef: g.ref_id,
            fixHint: 'Przypisz stacje SN/nN do generatora.',
          });
        } else if (!stationRefSet.has(stationRef)) {
          fixActions.push({
            code: 'generator.station_ref_invalid',
            message: `Generator '${g.name}' (${g.ref_id}): station_ref '${stationRef}' nie istnieje.`,
            elementRef: g.ref_id,
            fixHint: 'Sprawdz ref_id stacji.',
          });
        }
      }
    }

    return {
      id: g.ref_id,
      name: g.name,
      nodeId: g.bus_ref,
      kind,
      catalogRef: g.catalog_ref ?? null,
      inService: true,
      ratedPowerMw: g.p_mw,
      blockingTransformerId,
      connectionVariant,
      stationRef,
    };
  });

  // --- Protection Bindings ---
  const protectionBindings: TopologyProtectionV1[] = enm.protection_assignments.map((pa) => ({
    id: pa.ref_id,
    breakerRef: pa.breaker_ref,
    ctRef: pa.ct_ref ?? null,
    vtRef: pa.vt_ref ?? null,
    functions: pa.settings.map((s) => ({
      functionType: s.function_type,
      settings: {
        threshold_a: s.threshold_a,
        time_delay_s: s.time_delay_s,
        curve_type: s.curve_type,
      },
    })),
    isEnabled: pa.is_enabled,
  }));

  const logicalViewsRaw = enm.logical_views;

  const logicalViews: TopologyLogicalViewsV1 = {
    trunks: (logicalViewsRaw?.trunks ?? []).map((trunk, idx) => ({
      id: trunk.corridor_ref ?? `trunk_${idx + 1}`,
      segmentIds: [...(trunk.segments ?? [])].sort(),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    branches: (logicalViewsRaw?.branches ?? []).map((branch, idx) => ({
      id: branch.branch_id ?? `branch_${idx + 1}`,
      segmentIds: [...(branch.segments ?? [])].sort(),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    rings: (logicalViewsRaw?.secondary_connectors ?? []).map((connector, idx) => ({
      id: connector.connector_id ?? `ring_${idx + 1}`,
      segmentIds: connector.segment_ref ? [connector.segment_ref] : [],
      normallyOpenSegmentId: connector.segment_ref ?? null,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  };

  return {
    snapshotId,
    snapshotFingerprint: enm.header.hash_sha256,
    connectionNodes: sortById(connectionNodesWithStation),
    branches: sortById(branches),
    devices: sortById(devices),
    stations: sortById(stations),
    generators: sortById(generators),
    sources: sortById(sources),
    loads: sortById(loads),
    protectionBindings: sortById(protectionBindings),
    logicalViews,
    fixActions: [...fixActions].sort((a, b) => a.code.localeCompare(b.code) || (a.elementRef ?? '').localeCompare(b.elementRef ?? '')),
  };
}

// =============================================================================
// READER: AnySldSymbol[] → TopologyInput (BRIDGE MIGRACYJNY)
// =============================================================================

function isBus(s: AnySldSymbol): s is BusSymbol {
  return s.elementType === 'Bus';
}
function isBranch(s: AnySldSymbol): s is BranchSymbol {
  return s.elementType === 'LineBranch' || s.elementType === 'TransformerBranch';
}
function isSwitch(s: AnySldSymbol): s is SwitchSymbol {
  return s.elementType === 'Switch';
}
function isSource(s: AnySldSymbol): s is SourceSymbol {
  return s.elementType === 'Source';
}
function isLoad(s: AnySldSymbol): s is LoadSymbol {
  return s.elementType === 'Load';
}

/**
 * Czyta TopologyInput z AnySldSymbol[] (bridge migracyjny).
 *
 * Uzywamy WYLACZNIE danych strukturalnych symboli:
 * - elementType, elementId, switchType, switchState, fromNodeId, toNodeId
 * - NIE uzywamy elementName do klasyfikacji (zero heurystyk stringowych)
 * - Brakujace dane → FixAction
 *
 * @param symbols Symbole SLD
 * @param metadata Dodatkowe metadane (typy generatorow, napiecia, przynaleznosc do stacji)
 */
export function readTopologyFromSymbols(
  symbols: readonly AnySldSymbol[],
  metadata: SymbolBridgeMetadata = {},
): TopologyInputV1 {
  const sorted = [...symbols].sort((a, b) => a.id.localeCompare(b.id));
  const fixActions: TopologyFixAction[] = [];
  const { generatorTypes, voltageOverrides, stationMembership } = metadata;

  const connectionNodes: ConnectionNodeV1[] = [];
  const branches: TopologyBranchV1[] = [];
  const devices: TopologyDeviceV1[] = [];
  const sources: TopologySourceV1[] = [];
  const loads: TopologyLoadV1[] = [];
  const generators: TopologyGeneratorV1[] = [];
  const stations: TopologyStationV1[] = [];

  // Zbierz ID szyn (potrzebne do identyfikacji polaczen)
  const busElementIds = new Set<string>();
  for (const s of sorted) {
    if (isBus(s)) {
      busElementIds.add(s.elementId);
    }
  }

  for (const s of sorted) {
    if (isBus(s)) {
      const voltage = voltageOverrides?.get(s.elementId) ?? null;
      if (voltage === null) {
        fixActions.push({
          code: 'bus.voltage_missing',
          message: `Szyna '${s.elementName}' (${s.elementId}) nie ma jawnego napiecia — zero fabrication.`,
          elementRef: s.elementId,
          fixHint: 'Podaj napiecie znamionowe w metadanych (voltageOverrides).',
        });
      }
      connectionNodes.push({
        id: s.elementId,
        name: s.elementName,
        voltageKv: voltage,
        stationId: stationMembership?.get(s.elementId) ?? null,
        busIndex: null,
        inService: s.inService,
      });
    }

    if (isBranch(s)) {
      if (s.fromNodeId === s.toNodeId) {
        fixActions.push({
          code: 'topology.self_edge_forbidden',
          message: `Galaz '${s.elementName}' (${s.elementId}) laczy wezel sam ze soba (${s.fromNodeId}).`,
          elementRef: s.elementId,
          fixHint: 'Popraw polaczenia galezi — fromNodeId i toNodeId musza byc rozne.',
        });
      }

      const isTr = s.elementType === 'TransformerBranch';
      branches.push({
        id: s.elementId,
        name: s.elementName,
        fromNodeId: s.fromNodeId,
        toNodeId: s.toNodeId,
        kind: isTr ? BranchKind.TR_LINK : (s.branchType === 'CABLE' ? BranchKind.CABLE : BranchKind.LINE),
        isNormallyOpen: false,
        inService: s.inService,
        catalogRef: null,
        lengthKm: null,
        ratedPowerMva: null,
        voltageHvKv: null,
        voltageLvKv: null,
      });
    }

    if (isSwitch(s)) {
      if (s.fromNodeId === s.toNodeId) {
        fixActions.push({
          code: 'topology.self_edge_forbidden',
          message: `Lacznik '${s.elementName}' (${s.elementId}) laczy wezel sam ze soba (${s.fromNodeId}).`,
          elementRef: s.elementId,
          fixHint: 'Popraw polaczenia lacznika — fromNodeId i toNodeId musza byc rozne.',
        });
      }

      // Switch = device + branch (BUS_LINK)
      const deviceKind = s.switchType === 'BREAKER' ? DeviceKind.CB
        : s.switchType === 'DISCONNECTOR' ? DeviceKind.DS
        : s.switchType === 'LOAD_SWITCH' ? DeviceKind.LOAD_SWITCH
        : DeviceKind.FUSE;

      devices.push({
        id: `dev_${s.elementId}`,
        name: s.elementName,
        nodeId: s.fromNodeId,
        kind: deviceKind,
        catalogRef: null,
        state: s.switchState,
        inService: s.inService,
      });

      branches.push({
        id: s.elementId,
        name: s.elementName,
        fromNodeId: s.fromNodeId,
        toNodeId: s.toNodeId,
        kind: BranchKind.BUS_LINK,
        isNormallyOpen: s.switchState === 'OPEN',
        inService: s.inService,
        catalogRef: null,
        lengthKm: null,
        ratedPowerMva: null,
        voltageHvKv: null,
        voltageLvKv: null,
      });
    }

    if (isSource(s)) {
      const genKind = generatorTypes?.get(s.elementId) ?? null;
      if (genKind) {
        generators.push({
          id: s.elementId,
          name: s.elementName,
          nodeId: s.connectedToNodeId,
          kind: genKind,
          catalogRef: null,
          inService: s.inService,
          ratedPowerMw: null,
          blockingTransformerId: null,
          connectionVariant: null,
          stationRef: null,
        });
      } else {
        sources.push({
          id: s.elementId,
          name: s.elementName,
          nodeId: s.connectedToNodeId,
          inService: s.inService,
        });
      }
    }

    if (isLoad(s)) {
      loads.push({
        id: s.elementId,
        name: s.elementName,
        nodeId: s.connectedToNodeId,
        inService: s.inService,
        pMw: null,
        qMvar: null,
      });
    }
  }

  return {
    snapshotId: 'symbols-bridge',
    snapshotFingerprint: 'none',
    connectionNodes: sortById(connectionNodes),
    branches: sortById(branches),
    devices: sortById(devices),
    stations: sortById(stations),
    generators: sortById(generators),
    sources: sortById(sources),
    loads: sortById(loads),
    protectionBindings: [],
    logicalViews: { trunks: [], branches: [], rings: [] },
    fixActions: [...fixActions].sort((a, b) => a.code.localeCompare(b.code) || (a.elementRef ?? '').localeCompare(b.elementRef ?? '')),
  };
}
