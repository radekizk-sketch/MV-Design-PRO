import type {
  Bay,
  Branch,
  Bus,
  EnergyNetworkModel,
  Generator,
  Load,
  Measurement,
  ProtectionAssignment,
  Source,
  Substation,
  Transformer,
} from '../../types/enm';
import {
  ENGINEERING_SEMANTIC_SCHEMA_VERSION,
  defaultReportEligibility,
  type DataQualityState,
  type EngineeringCompleteness,
  type EngineeringConnection,
  type EngineeringElement,
  type EngineeringElementKind,
  type EngineeringPort,
  type EngineeringRole,
  type EngineeringSemanticModel,
  type FunctionalRole,
  type MvBayFunction,
  type NetworkPosition,
  type PhaseSystem,
  type PortRole,
  type VoltageDomain,
} from './types';
import { normalizeForDeterministicHash, stableHash } from './semanticHashPolicy';
import { createEngineeringQuantity } from './quantity';

type SnapshotRecord = Partial<EnergyNetworkModel> & Record<string, unknown>;
type BayRole = Bay['bay_role'];
type FieldSpecRecord = {
  field_ref?: string;
  ref_id?: string;
  id?: string;
  name?: string;
  bay_role?: unknown;
  substation_ref?: string | null;
  bus_ref?: string;
  gpz_section_id?: string | null;
  equipment_refs?: unknown;
  protection_ref?: string | null;
  tags?: unknown;
  meta?: unknown;
};

interface BayProjectionInput {
  refId: string;
  name: string;
  bayRole: BayRole;
  substationRef: string | null;
  busRef: string;
  gpzSectionId: string | null;
  equipmentRefs: string[];
  protectionRef: string | null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function isBayRole(value: unknown): value is BayRole {
  return value === 'IN'
    || value === 'OUT'
    || value === 'TR'
    || value === 'COUPLER'
    || value === 'FEEDER'
    || value === 'MEASUREMENT'
    || value === 'OZE';
}

function roleForBayRole(bayRole: BayRole): EngineeringRole {
  const roleByBayRole: Record<BayRole, EngineeringRole> = {
    IN: 'INCOMING_SUPPLY_BAY',
    OUT: 'LINE_FEEDER_BAY',
    FEEDER: 'LINE_FEEDER_BAY',
    TR: 'TRANSFORMER_BAY',
    COUPLER: 'COUPLER_BAY',
    MEASUREMENT: 'MEASUREMENT_BAY',
    OZE: 'SOURCE_CONNECTION_BAY',
  };
  return roleByBayRole[bayRole];
}

function portRoleForBayRole(bayRole: BayRole): PortRole {
  if (bayRole === 'TR') return 'BAY_SN_TRANSFORMER';
  if (bayRole === 'COUPLER') return 'BAY_COUPLER_A';
  if (bayRole === 'IN') return 'BAY_SN_IN';
  return 'BAY_SN_OUT';
}

function bayFunctionForRole(bayRole: BayRole): MvBayFunction {
  if (bayRole === 'TR') return 'TRANSFORMATOROWE';
  if (bayRole === 'COUPLER') return 'SPRZEGLOWE';
  if (bayRole === 'MEASUREMENT') return 'POMIAROWE';
  if (bayRole === 'OZE') return 'ZRODLOWE';
  if (bayRole === 'IN') return 'ZASILAJACE_SZYNE';
  return 'ODPLYWOWE_LINIOWE';
}

function fieldSpecsForSubstation(substation: Substation): BayProjectionInput[] {
  const meta = isRecord(substation.meta) ? substation.meta : {};
  return asArray<FieldSpecRecord>(meta.field_specs)
    .filter((spec) => isRecord(spec))
    .flatMap((spec, index) => {
      const refId = spec.field_ref ?? spec.ref_id ?? spec.id ?? null;
      const busRef = spec.bus_ref;
      if (!refId || !busRef || !isBayRole(spec.bay_role)) return [];
      const specMeta = isRecord(spec.meta) ? spec.meta : {};
      const equipmentRefs = asStringArray(spec.equipment_refs ?? specMeta.equipment_refs);
      return [{
        refId,
        name: spec.name ?? `Pole SN ${index + 1}`,
        bayRole: spec.bay_role,
        substationRef: spec.substation_ref ?? substation.ref_id,
        busRef,
        gpzSectionId: spec.gpz_section_id ?? (typeof specMeta.gpz_section_id === 'string' ? specMeta.gpz_section_id : null),
        equipmentRefs,
        protectionRef: spec.protection_ref ?? null,
      }];
    });
}

function refOf(item: { ref_id?: string; id?: string; name?: string }, fallback: string): string {
  return item.ref_id || item.id || item.name || fallback;
}

function voltageDomainFromKv(voltageKv: number | null | undefined): VoltageDomain {
  if (typeof voltageKv !== 'number' || !Number.isFinite(voltageKv)) return 'SN';
  if (voltageKv >= 60) return 'WN';
  if (voltageKv >= 1) return 'SN';
  return 'NN';
}

function busbarPortRole(domain: VoltageDomain): PortRole {
  if (domain === 'WN') return 'BUSBAR_WN';
  if (domain === 'NN') return 'BUSBAR_NN';
  return 'BUSBAR_SN';
}

function transformerPortRole(domain: VoltageDomain, side: 'high' | 'low'): PortRole {
  if (domain === 'SN') return 'TRANSFORMER_SN';
  if (domain === 'NN') return 'TRANSFORMER_NN';
  return side === 'high' ? 'TRANSFORMER_HIGH' : 'TRANSFORMER_LOW';
}

function phaseSystemForDomain(domain: VoltageDomain): PhaseSystem {
  if (domain === 'DC') return 'DC_PLUS_MINUS';
  if (domain === 'POMIAR' || domain === 'STEROWANIE' || domain === 'LOGIKA') return 'SYGNAL';
  return 'ABC';
}

function baseNetworkPosition(projectRefId: string): NetworkPosition {
  return {
    projectRefId,
    parentRefId: null,
    containerRefId: null,
    voltageLevelRefId: null,
    switchgearRefId: null,
    busbarSectionRefId: null,
    bayRefId: null,
    feederRefId: null,
    branchRefId: null,
    stationRefId: null,
    orderIndex: null,
  };
}

function completenessFromCatalog(item: {
  catalog_ref?: string | null;
  materialized_params?: Record<string, unknown> | null;
}): EngineeringCompleteness {
  if (item.catalog_ref && item.materialized_params) return 'MODEL_TECHNICZNY_PELNY';
  if (item.catalog_ref) return 'MODEL_TECHNICZNY_NIEPELNY';
  return 'SZKIC_LOGICZNY';
}

function qualityFromCompleteness(completeness: EngineeringCompleteness): DataQualityState {
  if (completeness === 'MODEL_TECHNICZNY_PELNY') return 'PELNA';
  if (completeness === 'MODEL_TECHNICZNY_NIEPELNY') return 'CZESCIOWA';
  return 'NIEZWERYFIKOWANA';
}

function createPort(params: {
  portId: string;
  ownerRefId: string;
  role: PortRole;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  connectionSide: EngineeringPort['connectionSide'];
  minConnections?: number;
  maxConnections?: number;
}): EngineeringPort {
  return {
    portId: params.portId,
    ownerRefId: params.ownerRefId,
    role: params.role,
    voltageDomain: params.voltageDomain,
    nominalVoltageKv: params.nominalVoltageKv,
    phaseSystem: phaseSystemForDomain(params.voltageDomain),
    connectionSide: params.connectionSide,
    minConnections: params.minConnections ?? 0,
    maxConnections: params.maxConnections ?? 1,
    connectionPolicyRef: `policy:${params.role}`,
    requiredConnectionKinds: ['TOR_MOCY'],
    forbiddenConnectionKinds: ['TOR_LOGICZNY', 'POWIAZANIE_RAPORTOWE'],
  };
}

function createBaseElement(params: {
  refId: string;
  elementKind: EngineeringElementKind;
  engineeringRole: EngineeringRole;
  functionalRole?: FunctionalRole;
  voltageDomain: VoltageDomain;
  completeness?: EngineeringCompleteness;
  dataQualityState?: DataQualityState;
  networkPosition: NetworkPosition;
  ports?: EngineeringPort[];
}): EngineeringElement {
  const completeness = params.completeness ?? 'MODEL_TECHNICZNY_NIEPELNY';
  return {
    refId: params.refId,
    elementKind: params.elementKind,
    engineeringRole: params.engineeringRole,
    functionalRole: params.functionalRole ?? 'NOT_APPLICABLE',
    networkPosition: params.networkPosition,
    voltageDomain: params.voltageDomain,
    completeness,
    reportEligibility: defaultReportEligibility(
      completeness === 'SZKIC_LOGICZNY' ? 'NIERAPORTOWALNY_SZKIC' : 'RAPORTOWALNY_Z_OSTRZEZENIEM',
    ),
    dataQualityState: params.dataQualityState ?? qualityFromCompleteness(completeness),
    ports: params.ports ?? [],
    terminals: [],
  };
}

function connection(
  id: string,
  fromPortId: string,
  toPortId: string,
  voltageDomain: VoltageDomain | null,
  ruleRef: string,
): EngineeringConnection {
  return {
    connectionId: id,
    fromPortId,
    toPortId,
    orientation: 'BEZKIERUNKOWE',
    connectionKind: 'TOR_MOCY',
    voltageDomain,
    normalState: 'POLACZONE',
    switchingDeviceRefId: null,
    validatedByRuleRefs: [ruleRef],
  };
}

function pushMvBayProjection(params: {
  bay: BayProjectionInput;
  index: number;
  projectRefId: string;
  busByRef: Map<string, Bus>;
  busPortByRef: Map<string, EngineeringPort>;
  elements: EngineeringElement[];
  connections: EngineeringConnection[];
}): void {
  const { bay, index, projectRefId, busByRef, busPortByRef, elements, connections } = params;
  const bus = busByRef.get(bay.busRef);
  const domain = voltageDomainFromKv(bus?.voltage_kv);
  const bayRole = bay.bayRole;
  const portRole = portRoleForBayRole(bayRole);
  const port = createPort({
    portId: `${bay.refId}:out`,
    ownerRefId: bay.refId,
    role: portRole,
    voltageDomain: domain,
    nominalVoltageKv: bus?.voltage_kv ?? null,
    connectionSide: bayRole === 'TR'
      ? 'STRONA_TRANSFORMATORA'
      : bayRole === 'IN'
        ? 'STRONA_SZYN'
        : 'STRONA_LINII',
  });
  const role = roleForBayRole(bayRole);

  elements.push({
    ...createBaseElement({
      refId: bay.refId,
      elementKind: 'MV_BAY',
      engineeringRole: role,
      functionalRole: role === 'LINE_FEEDER_BAY' ? 'FEEDS_MV_TRUNK' : 'NOT_APPLICABLE',
      voltageDomain: domain,
      networkPosition: {
        ...baseNetworkPosition(projectRefId),
        parentRefId: bay.substationRef,
        containerRefId: bay.substationRef,
        voltageLevelRefId: `${domain}-${bus?.voltage_kv ?? 'unknown'}kV`,
        busbarSectionRefId: bay.busRef,
        bayRefId: bay.refId,
        orderIndex: index,
      },
      ports: [port],
    }),
    bayFunction: bayFunctionForRole(bayRole),
    connectedBusbarSectionRefId: bay.busRef,
    mainSwitchingDeviceRefId: bay.equipmentRefs[0] ?? null,
    outgoingPortRefId: port.portId,
  });

  const busPort = busPortByRef.get(bay.busRef);
  if (busPort) {
    connections.push(connection(`${bay.refId}:bus`, busPort.portId, port.portId, domain, 'SEM-BAY-BUSBAR'));
  }
}

function buildUsedMaterializationHash(snapshot: SnapshotRecord): string {
  const materializations: unknown[] = [];
  for (const collectionName of ['branches', 'transformers', 'sources', 'loads', 'generators', 'measurements', 'protection_assignments']) {
    for (const item of asArray<Record<string, unknown>>(snapshot[collectionName])) {
      if (item.materialized_params) {
        materializations.push({
          ref_id: item.ref_id,
          materialized_params: item.materialized_params,
        });
      }
    }
  }
  return stableHash(normalizeForDeterministicHash(materializations));
}

export function projectEnergyNetworkModelToSemantic(
  snapshot: Partial<EnergyNetworkModel> | Record<string, unknown> | null | undefined,
): EngineeringSemanticModel | null {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const record = snapshot as SnapshotRecord;
  const header = record.header as EnergyNetworkModel['header'] | undefined;
  const projectRefId = header?.name ?? 'project-active';
  const enmSnapshotRef = header?.hash_sha256 ?? `enm-rev-${header?.revision ?? 0}`;
  const catalogSnapshotRef = String(record.catalogSnapshotRef ?? record.catalog_snapshot_ref ?? 'catalog-snapshot-active');
  const usedCatalogMaterializationHash = buildUsedMaterializationHash(record);

  const elements: EngineeringElement[] = [];
  const connections: EngineeringConnection[] = [];
  const busPortByRef = new Map<string, EngineeringPort>();
  const busByRef = new Map(asArray<Bus>(record.buses).map((bus, index) => [refOf(bus, `bus-${index}`), bus] as const));

  asArray<Bus>(record.buses).forEach((bus, index) => {
    const refId = refOf(bus, `bus-${index}`);
    const domain = voltageDomainFromKv(bus.voltage_kv);
    const port = createPort({
      portId: `${refId}:busbar`,
      ownerRefId: refId,
      role: busbarPortRole(domain),
      voltageDomain: domain,
      nominalVoltageKv: bus.voltage_kv ?? null,
      connectionSide: 'STRONA_SZYN',
      maxConnections: Number.POSITIVE_INFINITY,
    });
    busPortByRef.set(refId, port);
    elements.push({
      ...createBaseElement({
        refId,
        elementKind: 'BUSBAR_SECTION',
        engineeringRole: 'BUSBAR_SECTION',
        voltageDomain: domain,
        networkPosition: {
          ...baseNetworkPosition(projectRefId),
          voltageLevelRefId: `${domain}-${bus.voltage_kv ?? 'unknown'}kV`,
          busbarSectionRefId: refId,
          orderIndex: index,
        },
        ports: [port],
      }),
      nominalVoltageKv: bus.voltage_kv,
    });
  });

  asArray<Source>(record.sources).forEach((source, index) => {
    const refId = refOf(source, `source-${index}`);
    const bus = busByRef.get(source.bus_ref);
    const domain = voltageDomainFromKv(bus?.voltage_kv);
    const completeness: EngineeringCompleteness = source.sk3_mva || source.ik3_ka
      ? 'MODEL_TECHNICZNY_PELNY'
      : completenessFromCatalog(source);
    const port = createPort({
      portId: `${refId}:ac`,
      ownerRefId: refId,
      role: 'SOURCE_AC',
      voltageDomain: domain,
      nominalVoltageKv: bus?.voltage_kv ?? null,
      connectionSide: 'STRONA_ZRODLA',
    });
    elements.push({
      ...createBaseElement({
        refId,
        elementKind: 'GPZ',
        engineeringRole: 'GPZ_SUPPLY_NODE',
        functionalRole: 'FEEDS_MV_TRUNK',
        voltageDomain: domain,
        completeness,
        networkPosition: {
          ...baseNetworkPosition(projectRefId),
          voltageLevelRefId: `${domain}-${bus?.voltage_kv ?? 'unknown'}kV`,
          busbarSectionRefId: source.bus_ref,
          orderIndex: index,
        },
        ports: [port],
      }),
      structure: {
        gpzRefId: refId,
        modelKind: 'UPROSZCZONY_PARAMETRY_NA_SZYNIE_SN',
        supplyNodeRefId: refId,
        supplyShortCircuitModelRefId: source.sk3_mva || source.ik3_ka ? `${refId}:short-circuit-model` : null,
        hvMvTransformers: [],
        mvSwitchgearRefId: source.substation_ref ?? `${refId}:mv-switchgear`,
        busbarSystemRefId: `${source.bus_ref}:system`,
        busbarSectionRefs: [source.bus_ref],
        incomingBayRefs: [],
        outgoingBayRefs: [],
        couplerBayRefs: [],
        measurementBayRefs: [],
        sourceBayRefs: [],
        groundingModelRefId: bus?.grounding ? `${source.bus_ref}:earthing` : null,
      },
    });
    const busPort = busPortByRef.get(source.bus_ref);
    if (busPort) {
      connections.push(connection(`${refId}:to-bus`, port.portId, busPort.portId, domain, 'SEM-SOURCE-BUS'));
    }
  });

  const projectedBayRefs = new Set<string>();

  asArray<Bay>(record.bays).forEach((bay, index) => {
    const refId = refOf(bay, `bay-${index}`);
    projectedBayRefs.add(refId);
    pushMvBayProjection({
      bay: {
        refId,
        name: bay.name,
        bayRole: bay.bay_role,
        substationRef: bay.substation_ref,
        busRef: bay.bus_ref,
        gpzSectionId: bay.gpz_section_id ?? null,
        equipmentRefs: bay.equipment_refs ?? [],
        protectionRef: bay.protection_ref ?? null,
      },
      index,
      projectRefId,
      busByRef,
      busPortByRef,
      elements,
      connections,
    });
  });

  asArray<Substation>(record.substations).forEach((substation, substationIndex) => {
    fieldSpecsForSubstation(substation).forEach((bay, fieldIndex) => {
      if (projectedBayRefs.has(bay.refId)) return;
      projectedBayRefs.add(bay.refId);
      pushMvBayProjection({
        bay,
        index: substationIndex * 1000 + fieldIndex,
        projectRefId,
        busByRef,
        busPortByRef,
        elements,
        connections,
      });
    });
  });

  asArray<Branch>(record.branches).forEach((branch, index) => {
    const refId = refOf(branch, `branch-${index}`);
    const fromBus = busByRef.get(branch.from_bus_ref);
    const toBus = busByRef.get(branch.to_bus_ref);
    const domain = voltageDomainFromKv(fromBus?.voltage_kv ?? toBus?.voltage_kv);
    const isCable = branch.type === 'cable';
    const isOverhead = branch.type === 'line_overhead';
    const completeness = isCable || isOverhead ? completenessFromCatalog(branch) : 'MODEL_TECHNICZNY_NIEPELNY';
    const inPort = createPort({
      portId: `${refId}:in`,
      ownerRefId: refId,
      role: domain === 'NN' ? 'LV_FEEDER_OUT' : 'SEGMENT_SN_IN',
      voltageDomain: domain,
      nominalVoltageKv: fromBus?.voltage_kv ?? toBus?.voltage_kv ?? null,
      connectionSide: 'WEJSCIE',
    });
    const outPort = createPort({
      portId: `${refId}:out`,
      ownerRefId: refId,
      role: domain === 'NN' ? 'LV_FEEDER_OUT' : 'SEGMENT_SN_OUT',
      voltageDomain: domain,
      nominalVoltageKv: toBus?.voltage_kv ?? fromBus?.voltage_kv ?? null,
      connectionSide: 'WYJSCIE',
    });
    elements.push({
      ...createBaseElement({
        refId,
        elementKind: isOverhead ? 'MV_OVERHEAD_SEGMENT' : isCable ? 'MV_CABLE_SEGMENT' : 'SWITCHGEAR_DEVICE',
        engineeringRole: isOverhead ? 'MV_OVERHEAD_SEGMENT' : isCable ? 'MV_CABLE_SEGMENT' : 'LOAD_BREAK_SWITCH',
        functionalRole: isCable || isOverhead ? 'FEEDS_MV_TRUNK' : 'NOT_APPLICABLE',
        voltageDomain: domain,
        completeness,
        networkPosition: {
          ...baseNetworkPosition(projectRefId),
          voltageLevelRefId: `${domain}-${fromBus?.voltage_kv ?? toBus?.voltage_kv ?? 'unknown'}kV`,
          branchRefId: refId,
          orderIndex: index,
        },
        ports: [inPort, outPort],
      }),
      nominalVoltageKv: fromBus?.voltage_kv ?? toBus?.voltage_kv ?? null,
    });
    const fromPort = busPortByRef.get(branch.from_bus_ref);
    const toPort = busPortByRef.get(branch.to_bus_ref);
    if (fromPort) connections.push(connection(`${refId}:from`, fromPort.portId, inPort.portId, domain, 'SEM-SEGMENT-BUS'));
    connections.push(connection(`${refId}:internal`, inPort.portId, outPort.portId, domain, 'SEM-SEGMENT-INTERNAL'));
    if (toPort) connections.push(connection(`${refId}:to`, outPort.portId, toPort.portId, domain, 'SEM-SEGMENT-BUS'));
  });

  asArray<Transformer>(record.transformers).forEach((transformer, index) => {
    const refId = refOf(transformer, `transformer-${index}`);
    const highDomain = voltageDomainFromKv(transformer.uhv_kv);
    const lowDomain = voltageDomainFromKv(transformer.ulv_kv);
    const highPort = createPort({
      portId: `${refId}:high`,
      ownerRefId: refId,
      role: transformerPortRole(highDomain, 'high'),
      voltageDomain: highDomain,
      nominalVoltageKv: transformer.uhv_kv,
      connectionSide: 'STRONA_TRANSFORMATORA',
    });
    const lowPort = createPort({
      portId: `${refId}:low`,
      ownerRefId: refId,
      role: transformerPortRole(lowDomain, 'low'),
      voltageDomain: lowDomain,
      nominalVoltageKv: transformer.ulv_kv,
      connectionSide: 'STRONA_TRANSFORMATORA',
    });
    elements.push({
      ...createBaseElement({
        refId,
        elementKind: 'TRANSFORMER',
        engineeringRole: highDomain === 'WN' ? 'HV_MV_TRANSFORMATION_NODE' : 'MV_LV_TRANSFORMER',
        functionalRole: highDomain === 'WN' ? 'TRANSFORMS_HV_TO_MV' : 'TRANSFORMS_MV_TO_LV',
        voltageDomain: highDomain,
        completeness: completenessFromCatalog(transformer),
        networkPosition: {
          ...baseNetworkPosition(projectRefId),
          voltageLevelRefId: `${highDomain}-${transformer.uhv_kv}kV`,
          orderIndex: index,
        },
        ports: [highPort, lowPort],
      }),
      transformerKind: highDomain === 'WN' ? 'WN_SN' : 'SN_NN',
      highSide: {
        sideId: `${refId}:high-side`,
        ownerRefId: refId,
        labelPl: 'Strona gornego napiecia',
        sideRole: highDomain === 'WN' ? 'STRONA_WN' : 'STRONA_SN',
        voltageDomain: highDomain,
        nominalVoltageKv: transformer.uhv_kv,
        phaseSystem: 'ABC',
        portRefs: [highPort.portId],
        terminalRefs: [],
        earthingContextRefId: transformer.hv_neutral ? `${refId}:high-earthing` : null,
      },
      lowSide: {
        sideId: `${refId}:low-side`,
        ownerRefId: refId,
        labelPl: 'Strona dolnego napiecia',
        sideRole: lowDomain === 'NN' ? 'STRONA_NN' : 'STRONA_SN',
        voltageDomain: lowDomain,
        nominalVoltageKv: transformer.ulv_kv,
        phaseSystem: 'ABC',
        portRefs: [lowPort.portId],
        terminalRefs: [],
        earthingContextRefId: transformer.lv_neutral ? `${refId}:low-earthing` : null,
      },
      ratedPower: createEngineeringQuantity(transformer.sn_mva, 'MW', { source: 'REKA_PROJEKTANTA', qualityState: 'CZESCIOWA' }),
      voltageRatio: `${transformer.uhv_kv}/${transformer.ulv_kv} kV`,
      vectorGroup: transformer.vector_group ?? 'BRAK_DANYCH',
      shortCircuitVoltagePercent: transformer.uk_percent,
      zeroSequenceModelRefId: transformer.hv_neutral || transformer.lv_neutral ? `${refId}:z0` : null,
    });
    const highBusPort = busPortByRef.get(transformer.hv_bus_ref);
    const lowBusPort = busPortByRef.get(transformer.lv_bus_ref);
    if (highBusPort) connections.push(connection(`${refId}:high-bus`, highBusPort.portId, highPort.portId, highDomain, 'SEM-TRANSFORMER-SIDE'));
    connections.push(connection(`${refId}:coupling`, highPort.portId, lowPort.portId, null, 'SEM-TRANSFORMER-BOUNDARY'));
    if (lowBusPort) connections.push(connection(`${refId}:low-bus`, lowPort.portId, lowBusPort.portId, lowDomain, 'SEM-TRANSFORMER-SIDE'));
  });

  asArray<Load>(record.loads).forEach((load, index) => {
    const refId = refOf(load, `load-${index}`);
    const bus = busByRef.get(load.bus_ref);
    const domain = voltageDomainFromKv(bus?.voltage_kv);
    const port = createPort({
      portId: `${refId}:load`,
      ownerRefId: refId,
      role: domain === 'NN' ? 'LV_FEEDER_OUT' : 'SOURCE_AC',
      voltageDomain: domain,
      nominalVoltageKv: bus?.voltage_kv ?? null,
      connectionSide: 'NIE_DOTYCZY',
    });
    elements.push(createBaseElement({
      refId,
      elementKind: 'LV_LOAD',
      engineeringRole: 'LV_LOAD_NODE',
      voltageDomain: domain,
      completeness: completenessFromCatalog(load),
      networkPosition: { ...baseNetworkPosition(projectRefId), orderIndex: index },
      ports: [port],
    }));
    const busPort = busPortByRef.get(load.bus_ref);
    if (busPort) connections.push(connection(`${refId}:bus`, port.portId, busPort.portId, domain, 'SEM-LOAD-BUS'));
  });

  asArray<Generator>(record.generators).forEach((generator, index) => {
    const refId = refOf(generator, `generator-${index}`);
    const bus = busByRef.get(generator.bus_ref);
    const domain = voltageDomainFromKv(bus?.voltage_kv);
    const role: EngineeringRole = generator.gen_type === 'bess'
      ? 'BESS_CONVERTER'
      : generator.gen_type === 'wind_inverter'
        ? 'WIND_SOURCE'
        : 'PV_INVERTER';
    const port = createPort({
      portId: `${refId}:ac`,
      ownerRefId: refId,
      role: 'SOURCE_AC',
      voltageDomain: domain,
      nominalVoltageKv: bus?.voltage_kv ?? null,
      connectionSide: 'STRONA_ZRODLA',
    });
    elements.push(createBaseElement({
      refId,
      elementKind: 'SOURCE',
      engineeringRole: role,
      functionalRole: 'CONVERTS_DC_TO_AC',
      voltageDomain: domain,
      completeness: completenessFromCatalog(generator),
      networkPosition: { ...baseNetworkPosition(projectRefId), orderIndex: index },
      ports: [port],
    }));
    const busPort = busPortByRef.get(generator.bus_ref);
    if (busPort) connections.push(connection(`${refId}:bus`, port.portId, busPort.portId, domain, 'SEM-SOURCE-BUS'));
  });

  asArray<Substation>(record.substations).forEach((station, index) => {
    const refId = refOf(station, `station-${index}`);
    if (elements.some((element) => element.refId === refId)) return;
    const stationPorts = (station.bus_refs ?? []).flatMap((busRef) => {
      const bus = busByRef.get(busRef);
      const domain = voltageDomainFromKv(bus?.voltage_kv);
      return [createPort({
        portId: `${refId}:${domain.toLowerCase()}-${busRef}:bus`,
        ownerRefId: refId,
        role: busbarPortRole(domain),
        voltageDomain: domain,
        nominalVoltageKv: bus?.voltage_kv ?? null,
        connectionSide: domain === 'NN' ? 'STRONA_TRANSFORMATORA' : 'STRONA_SZYN',
        maxConnections: Number.POSITIVE_INFINITY,
      })];
    });
    const isMvLvStation = station.station_type !== 'gpz' && station.station_type !== 'switching';
    elements.push(createBaseElement({
      refId,
      elementKind: station.station_type === 'gpz' ? 'GPZ' : station.station_type === 'switching' ? 'MV_SWITCHING_STATION' : 'MV_LV_STATION',
      engineeringRole: station.station_type === 'gpz'
        ? 'GPZ_SUPPLY_NODE'
        : isMvLvStation
          ? 'MV_LV_STATION'
          : 'MV_SWITCHGEAR',
      voltageDomain: 'SN',
      networkPosition: { ...baseNetworkPosition(projectRefId), stationRefId: refId, orderIndex: index },
      ports: stationPorts,
    }));
  });

  asArray<Measurement>(record.measurements).forEach((measurement, index) => {
    const refId = refOf(measurement, `measurement-${index}`);
    elements.push(createBaseElement({
      refId,
      elementKind: 'MEASUREMENT',
      engineeringRole: measurement.measurement_type === 'CT' ? 'CURRENT_TRANSFORMER' : 'VOLTAGE_TRANSFORMER',
      functionalRole: 'MEASURES_RESIDUAL_CURRENT',
      voltageDomain: 'POMIAR',
      completeness: completenessFromCatalog(measurement),
      networkPosition: { ...baseNetworkPosition(projectRefId), bayRefId: measurement.bay_ref ?? null, orderIndex: index },
      ports: [createPort({
        portId: `${refId}:measurement`,
        ownerRefId: refId,
        role: 'MEASUREMENT_INPUT',
        voltageDomain: 'POMIAR',
        nominalVoltageKv: null,
        connectionSide: 'NIE_DOTYCZY',
      })],
    }));
  });

  asArray<ProtectionAssignment>(record.protection_assignments).forEach((protection, index) => {
    const refId = refOf(protection, `protection-${index}`);
    elements.push(createBaseElement({
      refId,
      elementKind: 'PROTECTION_RELAY',
      engineeringRole: 'PROTECTION_RELAY',
      functionalRole: 'PROTECTS_ELEMENT',
      voltageDomain: 'LOGIKA',
      completeness: completenessFromCatalog(protection),
      networkPosition: { ...baseNetworkPosition(projectRefId), orderIndex: index },
      ports: [createPort({
        portId: `${refId}:logic`,
        ownerRefId: refId,
        role: 'LOGIC_LINK',
        voltageDomain: 'LOGIKA',
        nominalVoltageKv: null,
        connectionSide: 'NIE_DOTYCZY',
      })],
    }));
  });

  const normalizedCore = normalizeForDeterministicHash({
    schemaVersion: ENGINEERING_SEMANTIC_SCHEMA_VERSION,
    projectRefId,
    modelId: `${projectRefId}:semantic`,
    enmSnapshotRef,
    usedCatalogMaterializationHash,
    ontologyVersion: 'v12-ontology-v8',
    roleRegistryHash: 'role-registry-v8',
    connectionRuleRegistryHash: 'connection-rule-registry-v8',
    elements,
    connections,
    physicalTopologyGraph: {
      graphId: `${projectRefId}:physical`,
      connectionRefs: connections.map((item) => item.connectionId).sort(),
      elementRefs: elements.map((item) => item.refId).sort(),
    },
  });

  return {
    schemaVersion: ENGINEERING_SEMANTIC_SCHEMA_VERSION,
    projectRefId,
    modelId: `${projectRefId}:semantic`,
    enmSnapshotRef,
    catalogSnapshotRef,
    usedCatalogMaterializationHash,
    semanticVersion: 'v8',
    semanticHash: stableHash(normalizedCore),
    ontologyVersion: 'v12-ontology-v8',
    ontologyHash: 'ontology-v8',
    roleRegistryHash: 'role-registry-v8',
    connectionRuleRegistryHash: 'connection-rule-registry-v8',
    generatedAt: new Date(0).toISOString(),
    elements: elements.sort((left, right) => left.refId.localeCompare(right.refId)),
    connections: connections.sort((left, right) => left.connectionId.localeCompare(right.connectionId)),
    physicalTopologyGraph: {
      graphId: `${projectRefId}:physical`,
      connectionRefs: connections.map((item) => item.connectionId).sort(),
      elementRefs: elements.map((item) => item.refId).sort(),
    },
    earthingContexts: asArray<Bus>(record.buses)
      .filter((bus) => Boolean(bus.grounding))
      .map((bus) => ({
        earthingContextRefId: `${refOf(bus, 'bus')}:earthing`,
        voltageDomain: voltageDomainFromKv(bus.voltage_kv),
        voltageLevelRefId: `${voltageDomainFromKv(bus.voltage_kv)}-${bus.voltage_kv}kV`,
        neutralPointRefId: refOf(bus, 'bus'),
        earthingMode: bus.grounding?.type === 'petersen_coil'
          ? 'CEWKA_PETERSENA'
          : bus.grounding?.type === 'directly_grounded'
            ? 'BEZPOSREDNIO_UZIEMIONY'
            : bus.grounding?.type === 'resistor_grounded'
              ? 'REZYSTOR'
              : 'IZOLOWANY',
        resistorRefId: null,
        petersenCoilRefId: null,
        relatedTransformerRefs: [],
        relatedBusbarSectionRefs: [refOf(bus, 'bus')],
        relatedLineSegmentRefs: [],
        totalCapacitiveCurrentA: null,
        residualEarthFaultCurrentA: null,
        qualityState: 'CZESCIOWA',
      })),
  };
}
